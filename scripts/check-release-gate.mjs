#!/usr/bin/env node
/**
 * **App Review への提出と、審査通過後の公開を、機械が実行してよいかの門。**
 *
 *   node scripts/check-release-gate.mjs            # 表示
 *   node scripts/check-release-gate.mjs --check    # CI
 *   node scripts/check-release-gate.mjs --selftest
 *
 * 【なぜ要るか】
 * 2026-08-28 にオーナーが App Review 提出と App Store 公開を渡した。
 * それまでは human_only で、権限表には「fastlane の automatic_release が
 * ハードコードで false。**恒久的に手動**」と書いてあった。
 * **渡っただけでは外れない** —— 権限表は不可逆な領域の承認を外すのに
 * machine_gate を要求する（GATE_REQUIRED）ので、宣言ではなく実装で外す。
 *
 * 【段階公開の門と同じ形にしてある】
 * evaluatePromotion / evaluateAutoPost と同じく、**材料が1つでも欠けたら hold。**
 * 「判定できないから出してよい」には絶対にならない。
 *
 * 【提出と公開を分けた理由】
 * 判断材料が違う。提出は「出してよい中身か」、公開は「Appleが通したものを
 * いま全員に出すか」。1つの関数に混ぜると、**片方の材料だけで両方通る。**
 *
 * 【この門が守らないもの】
 * 中身の良し悪しは見ない。見るのは「出す前に通っているはずのものが通っているか」だけ。
 * 品質そのものは CI と QA の仕事で、ここはその結果を読むだけ。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, broken, run } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER_PATH = path.join(ROOT, 'data/release-gate.json');

const hold = (why) => ({ decision: 'hold', why });
/** 材料が無いときの hold。**「たぶん大丈夫」で出さない。** */
const unknown = (what) => hold(`材料が無い: ${what} — **分からないものを「たぶん大丈夫」で出さない**`);

/** 共通の門番。両方の関数がここを最初に通る。 */
function commonGate(policy, doneToday) {
  if (!policy || typeof policy !== 'object') return unknown('policy');
  if (policy.kill_switch === true) return hold('kill_switch が立っている');
  if (policy.enabled !== true) return hold('自動実行が有効になっていない（enabled を立てるのはオーナー）');
  const cap = typeof policy.daily_cap === 'number' ? policy.daily_cap : 0;
  if (!(cap > 0)) return hold('daily_cap が正の数でない — **上限の無い門は使えない**');
  if (typeof doneToday !== 'number') return unknown('本日の実行回数');
  if (doneToday >= cap) return hold(`本日すでに ${doneToday} 件（上限 ${cap}）`);
  return null;
}

/** 経過時間（時間）。読めなければ null。**0 で埋めない。** */
export function hoursSince(iso, now) {
  if (typeof iso !== 'string' || iso === '') return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const n = typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(n)) return null;
  return (n - t) / 3600000;
}

/**
 * **App Review へ提出してよいか。**
 *
 * 見るのは「出してよい中身か」。Apple の審査そのものは見ない（まだ始まっていない）。
 */
export function evaluateSubmission({ policy, build, ci, releaseNotes, review, doneToday = 0, now } = {}) {
  const g = commonGate(policy, doneToday);
  if (g) return g;

  if (!build || typeof build !== 'object') return unknown('ビルドの情報');
  if (typeof build.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(build.version)) {
    return unknown('版数（x.y.z の形で読めない）');
  }
  if (build.is_drill === true) return hold('訓練用のビルド — 訓練は人が指示する');

  // **同じ版を二度出さない。**審査中のものがあるなら、それが片づくまで待つ
  if (build.in_review === true) return hold('同じアプリの審査が進行中 — 二重に出さない');
  if (build.in_review !== false) return unknown('審査が進行中かどうか');

  // **上の in_review は版しか見ていない。**Apple の提出は版ではなく
  // **アプリ単位の reviewSubmission** で、App版・カスタムプロダクトページ・
  // Appイベント・実験を1件に束ねる。**同時に進行できるのは1件だけ**なので、
  // **CPP だけの提出が残っていても App 版の提出は弾かれる。**
  //
  // 5.7.8 で実際に踏んだ: 版一覧は「審査中の版は無い」と言うのに deliver は
  // "Cannot submit for review - A review submission is already in progress" で
  // 落ちた（simplememo-ios run 31597781663）。**版だけ見ていると説明がつかない。**
  if (!review || typeof review !== 'object') return unknown('提出枠の情報');
  if (review.submission_open === true) {
    return hold('アプリ単位の提出枠が埋まっている'
      + ' — **版が空いていても提出は弾かれる**（5.7.8 の実害）');
  }
  if (review.submission_open !== false) return unknown('提出枠が空いているか');

  // **段階リリースは、いまや提出側の条件である。**
  //
  // [2026-09-03] この行を公開側（evaluateRelease）だけに置いていたのは、
  // 「Apple が通したものを、いま全員に出すか」を人か門が後から決める前提だった。
  // **その前提が同じ日に消えた** —— fastlane が `automatic_release: true` になり、
  // `prepare_app_store_version.rb` が `releaseType: AFTER_APPROVAL` を強制するので、
  // **審査を通った瞬間に出る。**公開を決める時点は提出の時点へ移った。
  //
  // 帰結として `evaluateRelease` は**構造的に到達しない** ——
  // 版が PENDING_DEVELOPER_RELEASE で止まらないので、あの門は開く機会を持たない。
  // **到達しない門に条件を置いたままにすると、条件が在ることと効くことがずれる。**
  // だから同じ条件をこちら側にも置く（あちらからは消さない ——
  // `asc-release-type.yml` で1版だけ MANUAL に戻せば、あちらの経路は復活する）。
  if (policy.require_phased_release === true && review.phased_release !== true) {
    return review.phased_release === undefined
      ? unknown('段階リリースの設定 — **承認された瞬間に出るので、提出の時点で要る**')
      : hold('段階リリースが有効でない — **一度に全員へ出さない**'
        + '（承認後は自動で出るので、ここを通すと止める機会が無い）');
  }

  // CI。**「読めなかった」を「緑」と読み替えない**
  if (policy.require_ci_green === true) {
    if (!ci || typeof ci !== 'object') return unknown('CI の結果');
    if (ci.conclusion !== 'success') {
      return hold(`CI が success でない（${ci.conclusion ?? '不明'}）`);
    }
    if (ci.sha !== build.sha) {
      return hold('CI が見たコミットとビルドのコミットが違う — **別物の緑で出さない**');
    }
  }

  // リリースノート。**片方だけの版は出さない**
  const need = Array.isArray(policy.require_release_notes_locales)
    ? policy.require_release_notes_locales : null;
  if (!need) return unknown('必要なリリースノートの言語');
  if (!releaseNotes || typeof releaseNotes !== 'object') return unknown('リリースノート');
  for (const loc of need) {
    const v = releaseNotes[loc];
    if (typeof v !== 'string' || v.trim() === '') return hold(`リリースノートが無い: ${loc}`);
  }

  // TestFlight で実際に載って、寝かせたか
  if (build.testflight_state !== 'VALID') {
    return build.testflight_state === undefined
      ? unknown('TestFlight の処理状態')
      : hold(`TestFlight が VALID でない（${build.testflight_state}）`);
  }
  const soak = hoursSince(build.testflight_available_at, now);
  if (soak === null) return unknown('TestFlight に載った時刻');
  const needSoak = policy.min_testflight_soak_hours;
  if (typeof needSoak !== 'number') return unknown('寝かせの下限');
  if (soak < needSoak) {
    return hold(`TestFlight で ${soak.toFixed(1)}h しか寝ていない（${needSoak}h 必要）`
      + ' — **誰も触っていないビルドを審査に出さない**');
  }

  if (typeof build.open_blockers !== 'number') return unknown('未解決のブロッカー件数');
  if (build.open_blockers > 0) return hold(`未解決のブロッカーが ${build.open_blockers} 件`);

  // **実機での事前確認は機械には代われない。**
  // 権限表はここを human_only に残している（「後ではなく先に」）。
  // 門から外すのではなく、**人が確認したことを門が要求する。**
  // 記録が無ければ hold —— 「たぶん誰か見ただろう」で審査に出さない。
  if (typeof build.device_verified_by !== 'string' || build.device_verified_by.trim() === '') {
    return unknown('実機で確認した人の記録 — **実機確認は機械には代われない。人が確認して記録する**');
  }
  const dv = hoursSince(build.device_verified_at, now);
  if (dv === null) return unknown('実機で確認した時刻');
  if (dv < 0) return hold('実機確認の時刻が未来 — 記録が壊れている');
  // **確認したのがこのビルドであること。**別のビルドを見て出さない
  if (build.device_verified_sha !== build.sha) {
    return hold('実機で確認したのが別のコミット — **見たものと出すものを一致させる**');
  }

  return { decision: 'submit', version: build.version, why: '提出の条件をすべて満たしている' };
}

/**
 * **審査を通ったものを、いま公開してよいか。**
 *
 * ここで見るのは「Appleが通したものを全員に出すか」。中身の検査は提出側で終わっている。
 */
export function evaluateRelease({ policy, review, health, guard, doneToday = 0, now } = {}) {
  const g = commonGate(policy, doneToday);
  if (g) return g;

  if (!review || typeof review !== 'object') return unknown('審査の状態');
  if (review.state !== 'PENDING_DEVELOPER_RELEASE') {
    return review.state === undefined
      ? unknown('審査の状態')
      : hold(`審査が「開発者の公開待ち」でない（${review.state}）`);
  }
  if (typeof review.version !== 'string' || review.version === '') return unknown('公開しようとしている版数');

  // **一度に全員へ出さない。**
  if (policy.require_phased_release === true && review.phased_release !== true) {
    return review.phased_release === undefined
      ? unknown('段階リリースの設定')
      : hold('段階リリースが有効でない — **一度に全員へ出さない**');
  }

  const soak = hoursSince(review.approved_at, now);
  if (soak === null) return unknown('審査を通った時刻');
  const needSoak = policy.min_approved_soak_hours;
  if (typeof needSoak !== 'number') return unknown('承認後の間隔の下限');
  if (soak < needSoak) return hold(`承認から ${soak.toFixed(1)}h（${needSoak}h 必要）`);

  // クラッシュ率。**母数が足りないものは判定に使わない**
  if (!health || typeof health !== 'object') return unknown('クラッシュ率');
  if (typeof health.sessions !== 'number') return unknown('クラッシュ率の母数');
  const minN = policy.min_crash_free_sessions;
  if (typeof minN !== 'number') return unknown('クラッシュ率の母数の下限');
  if (health.sessions < minN) {
    return hold(`クラッシュ率の母数が ${health.sessions}（${minN} 必要）`
      + ' — **判定していない。異常なしではない**');
  }
  if (typeof health.crash_free_pct !== 'number' || typeof health.baseline_pct !== 'number') {
    return unknown('クラッシュ率かベースライン');
  }
  const shortfall = health.baseline_pct - health.crash_free_pct;
  const maxShort = policy.max_crash_free_shortfall_pt;
  if (typeof maxShort !== 'number') return unknown('悪化の許容幅');
  if (shortfall > maxShort) {
    return hold(`クラッシュ率がベースラインより ${shortfall.toFixed(2)}pt 悪い（許容 ${maxShort}pt）`);
  }

  // 直近に kill があったなら出さない
  if (!guard || typeof guard !== 'object') return unknown('カナリアの状態');
  const cool = policy.cooldown_after_kill_days;
  if (typeof cool !== 'number') return unknown('kill 後の冷却期間');
  // **null と「欄が無い」を同じに扱わない。**
  // null は「kill は無かった」という主張、欄が無いのは「読めていない」。
  // 旧実装は両方を素通りさせていて、**読めないときに公開へ落ちる形**だった
  // （check-guard-shapes が出荷前に捕まえた。この形は4つのPRで7件出ている）。
  if (!('last_kill_at' in guard)) return unknown('直近の kill の有無');
  if (guard.last_kill_at !== null) {
    const h = hoursSince(guard.last_kill_at, now);
    if (h === null) return unknown('直近の kill の時刻');
    if (h < cool * 24) return hold(`直近 ${(h / 24).toFixed(1)} 日以内に kill があった（${cool}日は出さない）`);
  }

  return { decision: 'release', version: review.version, why: '公開の条件をすべて満たしている' };
}

/** 台帳そのものの検査。 */
export function validate(doc) {
  const problems = [];
  const p = doc?.policy;
  if (!p || typeof p !== 'object') return ['policy が無い'];
  for (const k of ['kill_switch', 'enabled', 'dry_run', 'require_phased_release', 'require_ci_green']) {
    if (typeof p[k] !== 'boolean') problems.push(`policy.${k} が真偽値でない`);
  }
  for (const k of ['daily_cap', 'min_testflight_soak_hours', 'min_approved_soak_hours',
    'max_crash_free_shortfall_pt', 'min_crash_free_sessions', 'cooldown_after_kill_days']) {
    if (typeof p[k] !== 'number') problems.push(`policy.${k} が数でない`);
  }
  if (typeof p.daily_cap === 'number' && p.daily_cap <= 0) {
    problems.push('policy.daily_cap が正でない — **上限の無い門は使えない**');
  }
  if (p.require_phased_release === false) {
    problems.push('require_phased_release が false — **一度に全員へ出す設定は、この門では通さない**');
  }
  if (!Array.isArray(p.require_release_notes_locales) || p.require_release_notes_locales.length === 0) {
    problems.push('require_release_notes_locales が空 — **言語を1つも要求しない設定にしない**');
  }
  if (!Array.isArray(doc.releases)) problems.push('releases が配列でない');
  return problems;
}

// ============================================================

function selftest() {
  const doc = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const NOW = Date.parse('2026-09-10T00:00:00.000Z');
  const ago = (h) => new Date(NOW - h * 3600000).toISOString();

  /** 通る検体。**実データの policy を使う**（手で書くと台帳とずれても気づけない）。 */
  const subOk = (over = {}) => {
    const policy = JSON.parse(JSON.stringify(doc.policy));
    policy.enabled = true;
    return {
      policy,
      build: {
        version: '5.9.0', sha: 'abc123', is_drill: false, in_review: false,
        testflight_state: 'VALID', testflight_available_at: ago(48), open_blockers: 0,
        device_verified_by: 'owner', device_verified_at: ago(3), device_verified_sha: 'abc123',
      },
      ci: { conclusion: 'success', sha: 'abc123' },
      // アプリ単位の提出枠。**空いている**（出どころは
      // simplememo-ios/data/appstore/release-materials.json の review.submission_open）
      // **段階リリースは提出側の条件になった**（2026-09-03・自動公開の帰結）。
      review: { submission_open: false, phased_release: true },
      // **`ja` であって `ja-JP` ではない。**このアプリの実際の ASC ロケール。
      // ここを台帳から取らずに直書きしていたので、台帳の値を直したときに
      // 自己テストだけが古い値のまま通り続ける形だった（2026-08-28 に実際にそうなった）。
      releaseNotes: Object.fromEntries(
        doc.policy.require_release_notes_locales.map((loc) => [loc, 'x']),
      ),
      doneToday: 0, now: NOW, ...over,
    };
  };
  const relOk = (over = {}) => {
    const policy = JSON.parse(JSON.stringify(doc.policy));
    policy.enabled = true;
    return {
      policy,
      review: { state: 'PENDING_DEVELOPER_RELEASE', version: '5.9.0', phased_release: true, approved_at: ago(12) },
      health: { sessions: 500, crash_free_pct: 99.5, baseline_pct: 99.7 },
      guard: { last_kill_at: null },
      doneToday: 0, now: NOW, ...over,
    };
  };
  const heldS = (over, needle) => {
    const r = evaluateSubmission(subOk(over));
    assert(r.decision === 'hold', `hold になっていない（${r.decision}: ${r.why}）`);
    if (needle) assert(r.why.includes(needle), `理由が違う: ${r.why}`);
  };
  const heldR = (over, needle) => {
    const r = evaluateRelease(relOk(over));
    assert(r.decision === 'hold', `hold になっていない（${r.decision}: ${r.why}）`);
    if (needle) assert(r.why.includes(needle), `理由が違う: ${r.why}`);
  };

  const scenarios = [
    ['実データの台帳が検査を通る', () => {
      const p = validate(doc);
      assert(p.length === 0, p.join(' / '));
    }],
    ['**実台帳のままでは提出も公開もしない**（enabled が false）', () => {
      const s = evaluateSubmission({ ...subOk(), policy: doc.policy });
      const r = evaluateRelease({ ...relOk(), policy: doc.policy });
      assert(s.decision === 'hold' && s.why.includes('有効になっていない'), s.why);
      assert(r.decision === 'hold' && r.why.includes('有効になっていない'), r.why);
    }],

    // --- 提出 ---
    ['条件が揃えば submit', () => {
      const r = evaluateSubmission(subOk());
      assert(r.decision === 'submit' && r.version === '5.9.0', JSON.stringify(r));
    }],
    ['kill_switch で止まる', () => {
      const c = subOk(); c.policy.kill_switch = true;
      assert(evaluateSubmission(c).decision === 'hold');
    }],
    ['**CI が緑でなければ出さない**', () => heldS({ ci: { conclusion: 'failure', sha: 'abc123' } }, 'CI')],
    ['**別のコミットの緑で出さない**', () => heldS({ ci: { conclusion: 'success', sha: 'zzz' } }, '別物の緑')],
    ['CI が読めなければ hold（緑と読み替えない）', () => heldS({ ci: undefined }, '材料が無い')],
    ['リリースノートが片方だけなら出さない', () => {
      const [first, second] = doc.policy.require_release_notes_locales;
      heldS({ releaseNotes: { [first]: 'x' } }, second);
    }],
    ['**要求ロケールは台帳から取る**（直書きしない）', () => {
      // 台帳を書き換えたら、そのロケールが要求されること。**直書きだとここが素通りする。**
      const locales = doc.policy.require_release_notes_locales;
      assert(locales.includes('ja') && !locales.includes('ja-JP'),
        `ASC の実ロケールは ja（release_notes/ja-JP/ はフォルダ名）: ${JSON.stringify(locales)}`);
    }],
    ['TestFlight が VALID でなければ出さない', () => heldS({ build: { ...subOk().build, testflight_state: 'PROCESSING' } }, 'VALID')],
    ['**寝かせが足りなければ出さない**', () => {
      const b = { ...subOk().build, testflight_available_at: ago(1) };
      heldS({ build: b }, '寝ていない');
    }],
    ['寝かせの起点が読めなければ hold', () => {
      const b = { ...subOk().build, testflight_available_at: null };
      heldS({ build: b }, '材料が無い');
    }],
    ['未解決のブロッカーがあれば出さない', () => heldS({ build: { ...subOk().build, open_blockers: 2 } }, 'ブロッカー')],
    ['ブロッカー件数が読めなければ hold（0 と読み替えない）', () => {
      const b = { ...subOk().build }; delete b.open_blockers;
      heldS({ build: b }, '材料が無い');
    }],
    ['**実機確認の記録が無ければ出さない**（機械には代われない）', () => {
      const b = { ...subOk().build }; delete b.device_verified_by;
      heldS({ build: b }, '実機確認は機械には代われない');
    }],
    ['**実機で見たのが別のコミットなら出さない**', () => {
      heldS({ build: { ...subOk().build, device_verified_sha: 'other' } }, '見たものと出すもの');
    }],
    ['実機確認の時刻が読めなければ hold', () => {
      const b = { ...subOk().build }; delete b.device_verified_at;
      heldS({ build: b }, '材料が無い');
    }],
    ['審査中なら二重に出さない', () => heldS({ build: { ...subOk().build, in_review: true } }, '二重')],

    // --- アプリ単位の提出枠（版の状態だけでは足りない）---
    //
    // 5.7.8 の実害: 版一覧は「審査中の版は無い」と言うのに deliver は
    // "A review submission is already in progress" で落ちた。
    // **in_review だけを見ている門は、この形を通してしまう。**
    ['**版が空いていても提出枠が埋まっていれば止まる**（5.7.8 の形）',
      () => heldS({ build: { ...subOk().build, in_review: false },
                    review: { submission_open: true } }, '提出枠が埋まっている')],
    ['**提出枠が読めなければ hold**（空いているに倒さない）',
      () => heldS({ review: {} }, '提出枠が空いているか')],
    ['review そのものが無ければ hold',
      () => heldS({ review: undefined }, '提出枠の情報')],
    ['枠が空いていれば通る（他の材料が揃っていれば）', () => {
      // [2026-09-03] `phased_release` を足した。**この検体が落ちたのは正しい挙動** ——
      // 段階リリースが提出側の条件になったので、review を丸ごと差し替える検体は
      // 「他の材料が揃っている」を満たさなくなった。上書きではなく**足して**直す。
      const r = evaluateSubmission(subOk({ review: { submission_open: false, phased_release: true } }));
      assert(r.decision === 'submit', JSON.stringify(r));
    }],
    ['審査中かどうかが読めなければ hold', () => {
      const b = { ...subOk().build }; delete b.in_review;
      heldS({ build: b }, '材料が無い');
    }],
    ['訓練用のビルドは出さない', () => heldS({ build: { ...subOk().build, is_drill: true } }, '訓練')],
    ['版数が読めなければ hold', () => heldS({ build: { ...subOk().build, version: 'latest' } }, '版数')],
    ['日次上限に達していたら出さない', () => heldS({ doneToday: 1 }, '上限')],
    ['本日の回数が読めなければ hold（0 と読み替えない）', () => heldS({ doneToday: null }, '材料が無い')],

    // **段階リリースを提出側でも要求する**（2026-09-03・自動公開の帰結）。
    // ここが無いと、承認された瞬間に全員へ出る版を、門が素通りさせる。
    ['**段階リリースでなければ提出しない**', () => heldS(
      { review: { submission_open: false, phased_release: false } }, '一度に全員',
    )],
    ['段階リリースの設定が読めなければ提出しない', () => heldS(
      { review: { submission_open: false } }, '材料が無い',
    )],
    ['提出側の段階リリースは policy で切れる（公開側と同じ条件式）', () => {
      const c = subOk({ review: { submission_open: false, phased_release: false } });
      c.policy.require_phased_release = false;
      assert(evaluateSubmission(c).decision === 'submit', '**policy を折れば通る**べき');
    }],

    // --- 公開 ---
    ['条件が揃えば release', () => {
      const r = evaluateRelease(relOk());
      assert(r.decision === 'release' && r.version === '5.9.0', JSON.stringify(r));
    }],
    ['**承認済みでなければ公開しない**', () => heldR({ review: { ...relOk().review, state: 'IN_REVIEW' } }, '開発者の公開待ち')],
    ['審査状態が読めなければ hold', () => {
      const v = { ...relOk().review }; delete v.state;
      heldR({ review: v }, '材料が無い');
    }],
    ['**段階リリースでなければ公開しない**', () => heldR({ review: { ...relOk().review, phased_release: false } }, '一度に全員')],
    ['段階リリースの設定が読めなければ hold', () => {
      const v = { ...relOk().review }; delete v.phased_release;
      heldR({ review: v }, '材料が無い');
    }],
    ['承認直後は公開しない', () => heldR({ review: { ...relOk().review, approved_at: ago(1) } }, '承認から')],
    ['**クラッシュ率の母数が足りなければ判定しない**', () => {
      heldR({ health: { sessions: 10, crash_free_pct: 99.9, baseline_pct: 99.7 } }, '判定していない');
    }],
    ['クラッシュ率が悪化していれば公開しない', () => {
      heldR({ health: { sessions: 500, crash_free_pct: 97.0, baseline_pct: 99.7 } }, 'クラッシュ率');
    }],
    ['クラッシュ率が読めなければ hold', () => heldR({ health: undefined }, '材料が無い')],
    ['**直近に kill があれば公開しない**', () => heldR({ guard: { last_kill_at: ago(24) } }, 'kill')],
    ['カナリアの状態が読めなければ hold', () => heldR({ guard: undefined }, '材料が無い')],
    ['**kill の欄が無ければ hold**（null＝killなし と読み替えない）', () => {
      heldR({ guard: {} }, '直近の kill の有無');
    }],
    ['公開側も日次上限に従う', () => heldR({ doneToday: 1 }, '上限')],

    // --- 台帳の検査 ---
    ['**段階リリースを外した台帳は落ちる**', () => {
      const p = validate(broken(doc, (d) => { d.policy.require_phased_release = false; }));
      assert(p.some((x) => x.includes('一度に全員')), p.join(' / '));
    }],
    ['daily_cap 0 の台帳は落ちる', () => {
      const p = validate(broken(doc, (d) => { d.policy.daily_cap = 0; }));
      assert(p.some((x) => x.includes('daily_cap')), p.join(' / '));
    }],
    ['リリースノートの言語を空にすると落ちる', () => {
      const p = validate(broken(doc, (d) => { d.policy.require_release_notes_locales = []; }));
      assert(p.some((x) => x.includes('言語を1つも')), p.join(' / '));
    }],
    ['**この門を通った実績はまだ0件**（門ができた≠動いた）', () => {
      assert(doc.releases.length === 0, '実績が入ったら、この行と台帳の分類を同じPRで動かす');
    }],
  ];
  return run(scenarios, { label: '出荷の門' });
}

// ============================================================

// **import されたときに走らせない。**export しているものを import した側が
// `--check` を持っていると、ここが `process.exit()` を呼んで
// **呼び出し側のコードを1行も走らせずに exit 0 する**（2026-08-28 に実測）。
// 検査は scripts/check-module-entry.mjs。
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
const args = process.argv.slice(2);
if (args.includes('--selftest')) {
  // **run() は失敗件数を返す。**真偽で読むと、0件失敗のときに exit 1 になる
  // （最初そう書いていて、CI に配線したら常に赤になる形だった）。
  process.exit(selftest() === 0 ? 0 : 1);
} else {
  const doc = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const problems = validate(doc);
  const p = doc.policy;
  console.log('出荷の門 — App Review 提出 / App Store 公開\n');
  console.log(`  有効          ${p.enabled ? 'はい' : '**いいえ**（オーナーが立てる）'}`);
  console.log(`  dry_run       ${p.dry_run ? 'はい（通っても実行しない）' : 'いいえ'}`);
  console.log(`  kill_switch   ${p.kill_switch ? '**立っている**' : '倒れている'}`);
  console.log(`  日次上限      ${p.daily_cap} 回`);
  console.log(`  寝かせ        TestFlight ${p.min_testflight_soak_hours}h / 承認後 ${p.min_approved_soak_hours}h`);
  console.log(`  段階リリース  ${p.require_phased_release ? '**必須**' : '不要'}`);
  console.log(`  クラッシュ率  母数 ${p.min_crash_free_sessions} 以上 / 悪化 ${p.max_crash_free_shortfall_pt}pt まで`);
  console.log(`  kill 後       ${p.cooldown_after_kill_days} 日は出さない`);
  console.log(`\n  この門を通った出荷  **${doc.releases.length} 件**`);
  if (doc.releases.length === 0) {
    console.log('  「門ができた」と「門を通って何かが動いた」は別。');
    console.log('  **実行側（ASCへの提出・公開の呼び出し）がまだ無い。**');
  }
  if (problems.length) {
    console.log('\n落ちた:');
    for (const x of problems) console.log(`  - ${x}`);
  }
  if (args.includes('--check')) process.exit(problems.length ? 1 : 0);
}
}
