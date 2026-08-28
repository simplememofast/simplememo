#!/usr/bin/env node
/**
 * **出荷の門を、実データに当てる。**
 *
 *   node scripts/release-gate-run.mjs            # 判定と、足りない材料
 *   node scripts/release-gate-run.mjs --check    # CI
 *   node scripts/release-gate-run.mjs --selftest
 *
 * 【なぜ要るか】
 * `check-release-gate.mjs` は門の**判定規則**だけを持っていて、材料を集める側が
 * 無かった。台帳にもそう書いてある —— 「**実行側（ASCへの提出・公開の呼び出し）が
 * まだ無い。**」。門があっても、材料が来なければ一度も動かない。
 *
 * 【これは実行しない】
 * ASC へは何も送らない。**読んで判定して出すだけ。**送る側は、材料が揃って
 * 門が通ることを見てから別に作る（先例2つと同じ順序）。
 *
 * 【材料の契約】
 * `data/release-materials.json` を隣（simplememo-ios）が書く。**まだ無い。**
 * 無いときは全項目を「材料が無い」として扱う —— **0 や false で埋めない。**
 * 門は `unknown()` で hold するので、埋めると通ってしまう。
 *
 * 【古い材料は無い材料と同じ】
 * `collected_at` が `max_material_age_hours` より古ければ、**全項目を捨てる。**
 * 半分だけ信じると、TestFlight の状態が昨日のまま提出判定に入る。
 * 一部だけ古い、を許さないのは、どれが古いかを呼び出し側に判断させないため。
 *
 * 【enabled が false でも棚卸しは出す】
 * 門は `commonGate` で最初に `enabled` を見るので、実台帳ではそこで止まって
 * **材料まで到達しない。**それでは「何を作れば通せるか」が出ないので、
 * 棚卸しは門と別に、材料を直接見て作る。
 * あわせて「もし enabled を立てたら次に何で止まるか」も出すが、
 * **これは仮定であって判定ではない。**出力でもそう書く。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, run } from './lib/selftest.mjs';
import { evaluateSubmission, evaluateRelease, hoursSince } from './check-release-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER_PATH = path.join(ROOT, 'data/release-gate.json');
const MATERIALS_PATH = path.join(ROOT, 'data/release-materials.json');

/** 材料がこれより古ければ全部捨てる。 */
export const MAX_MATERIAL_AGE_HOURS = 6;

/**
 * 門が要求する材料と、その出どころ。
 *
 * `source` は**確かめたものだけ**を書く。
 * `asc-metrics` … 隣が既に日次で取っている `data/appstore/asc-metrics.json`
 *                  （2026-08-28 に中身を実見。**この21項目は1つも入っていない**）
 * `asc`         … App Store Connect API。取る処理はまだ無い
 * `github`      … このリポジトリ群の GitHub Actions / Xcode Cloud のチェック
 * `api`         … simplememo-api の `/admin/flags`（kill の履歴がここにある）
 * `human`       … **機械には代われない。**人が書いたものを門が読む
 */
export const REQUIRED = [
  { key: 'build.version', gate: 'submission', source: 'asc', why: '出そうとしている版数' },
  { key: 'build.sha', gate: 'submission', source: 'asc', why: 'CI と実機確認の突き合わせ先' },
  { key: 'build.in_review', gate: 'submission', source: 'asc', why: '審査が進行中か（二重に出さない）' },
  { key: 'build.testflight_state', gate: 'submission', source: 'asc', why: 'TestFlight に載っているか' },
  { key: 'build.testflight_available_at', gate: 'submission', source: 'asc', why: '寝かせ時間の起点' },
  // **「ブロッカー」の定義が無い。**2026-08-28 に3リポジトリのラベルを実見したが、
  // `blocker` 相当は1つも無い（GitHub 既定 + simplememo の `ops/autopilot-stale` /
  // `ops/cron-failure` だけ）。`data/autopilot-actions.json` の `state: open` は
  // 「未解決の仕事」であって「出荷を止めるもの」ではなく、そのまま数えると
  // **常に > 0 になって門が永久に通らない。**
  // 数える対象を決めるのは人。決まるまで材料は空けておく。
  { key: 'build.open_blockers', gate: 'submission', source: 'human', why: '**何をブロッカーと数えるかが未定**（該当ラベルも運用も無い）' },
  { key: 'build.device_verified_by', gate: 'submission', source: 'human', why: '実機で確かめた人' },
  { key: 'build.device_verified_at', gate: 'submission', source: 'human', why: 'いつ確かめたか' },
  { key: 'build.device_verified_sha', gate: 'submission', source: 'human', why: '**何を**確かめたか' },
  { key: 'ci.conclusion', gate: 'submission', source: 'github', why: 'CI が緑か' },
  { key: 'ci.sha', gate: 'submission', source: 'github', why: '別物の緑で出さないため' },
  // **`ja-JP` ではなく `ja`。**このアプリの実際の ASC ロケールは `ja`。
  // `release_notes/ja-JP/` はリポジトリ側のフォルダ名で、
  // `prepare_app_store_version.rb` の `LOCALE_MAP` が `ja-JP => ja` に写している。
  // 2026-08-28 に `ja-JP` と書いていて、日次の実データで `releaseNotes.ja` が
  // 返ってきて気づいた。**隣のスクリプトが大文字で警告していたのを読まずに書いた。**
  { key: 'releaseNotes.ja', gate: 'submission', source: 'asc', why: '日本語のリリースノート（ASC のロケールは ja）' },
  { key: 'releaseNotes.en-US', gate: 'submission', source: 'asc', why: '英語のリリースノート' },
  { key: 'review.state', gate: 'release', source: 'asc', why: '審査が「開発者の公開待ち」か' },
  { key: 'review.version', gate: 'release', source: 'asc', why: '公開しようとしている版数' },
  { key: 'review.phased_release', gate: 'release', source: 'asc', why: '段階リリースか（必須）' },
  { key: 'review.approved_at', gate: 'release', source: 'asc', why: '承認後の寝かせ時間の起点' },
  // health.* は **Analytics レポート**から作る（2026-08-28 に出どころを確認）。
  // `data/asc/status.json` の matched_reports に `App Sessions Standard/Detailed`
  // `App Crashes` `App Crashes Expanded` が入っている ——
  // **この app で取得対象になっていることは確認済み。**
  // ただし `App Crashes` は同日時点で pending_reports にもあり（「残りは生成待ち」）、
  // **中身の形はまだ見ていない。**列名や粒度は取れてから確かめること。
  //
  // ⚠️ **これは「これから出す版」の健康ではない。**Analytics は日次で数日遅れる
  // （status.json の waited_days=5）ので、審査通過から6時間で出す判断に、
  // 新しい版のクラッシュ率は存在しない。ここが見るのは
  // **いま出ている版の健康**で、「燃えている上に重ねて出さない」ための材料。
  // 新しい版の数字を入れると、常に材料不足になるか、無関係な数字で通る。
  { key: 'health.sessions', gate: 'release', source: 'asc', why: 'クラッシュ率の母数（App Sessions）' },
  { key: 'health.crash_free_pct', gate: 'release', source: 'asc', why: '**いま出ている版**のクラッシュ率（App Crashes ÷ Sessions）' },
  { key: 'health.baseline_pct', gate: 'release', source: 'asc', why: '比較するベースライン（同上の過去分）' },
  // **隣の日次収集はこれを集めない（2026-08-28 決定）。**値は simplememo-api の
  // `/admin/flags` にあり実装済みだが、呼ぶには `ADMIN_API_KEY` が要る。
  // **本番の管理鍵を、日次の可視化のためだけに ios の CI へ広げない**と決めた。
  // したがって `data/appstore/release-materials.json` は 20/21 が上限で、
  // **この1件は「送る側」が自分で集める。**
  // 送る側を書くときに最初に要るのがこれ ——「materials 20/21 だから未完成」
  // ではなく、**設計どおり**である。
  { key: 'guard.last_kill_at', gate: 'release', source: 'api', why: '直近の kill（無いなら null と書く）— **送る側が集める**' },
];

/** `a.b.c` を辿る。**無い鍵は undefined**（0 や null で埋めない）。 */
export function pick(obj, dotted) {
  let cur = obj;
  for (const k of dotted.split('.')) {
    if (cur === null || typeof cur !== 'object' || !(k in cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

/**
 * 材料を読む。無い・古い・壊れているなら `null`（＝全部無い）。
 *
 * **例外を握って null にしない。**壊れた JSON は「無い」ではなく「壊れている」
 * ので、理由を添えて返す。
 */
export function loadMaterials({ text, now }) {
  if (text === null || text === undefined) return { data: null, why: 'data/release-materials.json が無い' };
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return { data: null, why: `data/release-materials.json が読めない: ${e.message}` };
  }
  const age = hoursSince(doc.collected_at, now);
  if (age === null) return { data: null, why: 'collected_at が読めない — **いつの材料か分からないものは使わない**' };
  if (age > MAX_MATERIAL_AGE_HOURS) {
    return { data: null, why: `材料が ${age.toFixed(1)} 時間前のもの（上限 ${MAX_MATERIAL_AGE_HOURS}h）— **一部だけ信じない**` };
  }
  if (age < -0.5) {
    // 30分以上未来。時計がずれているか、作った側が嘘を書いている。
    return { data: null, why: `collected_at が未来（${(-age).toFixed(1)} 時間先）— 時計が合っていない` };
  }
  return { data: doc, why: null };
}

/**
 * 今日（JST）に門を通した件数。台帳の実績から数える。
 *
 * **両側を JST に直してから比べる。**最初 `now` だけ JST にして、行は UTC の
 * まま `slice(0,10)` していた（自己テストが捕まえた）。日本時間の 0:00〜9:00 に
 * 出した実績が前日ぶんに数えられ、**日次上限がその時間帯だけ 2 回になる。**
 */
const jstDate = (iso) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
};

export function doneToday(ledger, now) {
  const today = jstDate(now);
  if (today === null) return 0;
  const rows = Array.isArray(ledger.releases) ? ledger.releases : [];
  return rows.filter((r) => typeof r?.at === 'string' && jstDate(r.at) === today).length;
}

/** 揃っている／いない の棚卸し。**門と別に、材料を直接見る。** */
export function inventory(materials) {
  return REQUIRED.map((f) => ({
    ...f,
    present: materials === null ? false : pick(materials, f.key) !== undefined,
  }));
}

/** 門へ渡す形に組み直す。材料が無ければ、その枝ごと `{}`（＝全部 undefined）。 */
export function toGateInput({ ledger, materials, now }) {
  const m = materials ?? {};
  return {
    policy: ledger.policy,
    build: m.build ?? {},
    ci: m.ci ?? {},
    releaseNotes: m.releaseNotes,
    review: m.review ?? {},
    health: m.health ?? {},
    guard: m.guard ?? {},
    doneToday: doneToday(ledger, now),
    now,
  };
}

/**
 * 実台帳の policy で判定する（本物）と、`enabled` だけ立てた仮定で判定する。
 *
 * **仮定のほうは判定ではない。**「いま enabled を立てたら次に何で止まるか」を
 * 見るためだけのもので、実行にも記録にも使わない。
 */
export function evaluateBoth(input) {
  const hypothetical = { ...input, policy: { ...input.policy, enabled: true } };
  return {
    actual: {
      submission: evaluateSubmission(input),
      release: evaluateRelease(input),
    },
    ifEnabled: {
      submission: evaluateSubmission(hypothetical),
      release: evaluateRelease(hypothetical),
    },
  };
}

// ============================================================

function readIfExists(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function selftest() {
  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const NOW = '2026-08-28T04:00:00Z';
  const fresh = (over = {}) => JSON.stringify({ collected_at: '2026-08-28T03:30:00Z', ...over });

  const scenarios = [
    ['材料ファイルが無ければ全部「無い」', () => {
      const { data, why } = loadMaterials({ text: null, now: NOW });
      assert(data === null, '無いのに読めた');
      assert(/無い/.test(why), `理由が出ていない: ${why}`);
      assert(inventory(null).every((f) => !f.present), '無いのに present になった項目がある');
    }],
    ['**壊れた JSON を「無い」と混ぜない**', () => {
      const { data, why } = loadMaterials({ text: '{ではない', now: NOW });
      assert(data === null, '壊れているのに読めた');
      assert(/読めない/.test(why), `壊れていることが出ていない: ${why}`);
    }],
    ['**古い材料は全部捨てる**（一部だけ信じない）', () => {
      const old = JSON.stringify({ collected_at: '2026-08-27T00:00:00Z', build: { version: '5.0.2' } });
      const { data, why } = loadMaterials({ text: old, now: NOW });
      assert(data === null, `${MAX_MATERIAL_AGE_HOURS}h より古いのに使った`);
      assert(/上限/.test(why), `古さが理由に出ていない: ${why}`);
    }],
    ['collected_at が無ければ使わない', () => {
      const { data } = loadMaterials({ text: JSON.stringify({ build: { version: '5.0.2' } }), now: NOW });
      assert(data === null, 'いつの材料か分からないのに使った');
    }],
    ['**未来の collected_at も使わない**', () => {
      const { data, why } = loadMaterials({ text: fresh({ collected_at: '2026-08-28T09:00:00Z' }), now: NOW });
      assert(data === null, '未来の材料を使った');
      assert(/未来/.test(why), `理由が出ていない: ${why}`);
    }],
    ['新しければ読む', () => {
      const { data } = loadMaterials({ text: fresh({ build: { version: '5.0.2' } }), now: NOW });
      assert(data !== null, '新しいのに捨てた');
      assert(pick(data, 'build.version') === '5.0.2', '中身が取れていない');
    }],
    ['**無い鍵は undefined**（0 や null で埋めない）', () => {
      assert(pick({ a: { b: 1 } }, 'a.c') === undefined, '無い鍵に値がついた');
      assert(pick({ a: null }, 'a.b') === undefined, 'null を辿って落ちた');
      assert(pick({ a: { b: 0 } }, 'a.b') === 0, '0 を「無い」にした');
      assert(pick({ a: { b: false } }, 'a.b') === false, 'false を「無い」にした');
    }],
    ['**材料が無ければ門は必ず hold**', () => {
      const r = evaluateBoth(toGateInput({ ledger, materials: null, now: NOW }));
      assert(r.actual.submission.decision === 'hold', '材料が無いのに submit を返した');
      assert(r.actual.release.decision === 'hold', '材料が無いのに release を返した');
      assert(r.ifEnabled.submission.decision === 'hold', 'enabled を立てただけで submit になった');
      assert(r.ifEnabled.release.decision === 'hold', 'enabled を立てただけで release になった');
    }],
    ['実台帳では enabled で止まる（仮定側はその先を見せる）', () => {
      const r = evaluateBoth(toGateInput({ ledger, materials: null, now: NOW }));
      assert(/enabled/.test(r.actual.submission.why), `実台帳の理由が enabled でない: ${r.actual.submission.why}`);
      assert(!/enabled/.test(r.ifEnabled.submission.why),
        `仮定側も enabled で止まっている（先が見えない）: ${r.ifEnabled.submission.why}`);
    }],
    ['**棚卸しは門の短絡に影響されない**', () => {
      // enabled が false でも、材料が有るか無いかは出る。
      const inv = inventory({ build: { version: '5.0.2' } });
      const v = inv.find((f) => f.key === 'build.version');
      assert(v.present === true, '有る材料を無いと言った');
      assert(inv.filter((f) => f.present).length === 1, '無い材料を有ると言った');
    }],
    ['**本日の件数を JST で数える**（両側とも）', () => {
      // 2026-08-28T04:00Z は JST 08-28 13:00。UTC で前日の 15:30Z は JST 08-28 00:30 で同じ日。
      // now だけ JST に直して行を UTC のまま比べると、ここが 0 になる ——
      // **日次上限が JST 0:00〜9:00 のあいだだけ 2 回に緩む。**
      const l = { releases: [{ at: '2026-08-27T15:30:00Z' }, { at: '2026-08-26T12:00:00Z' }] };
      assert(doneToday(l, NOW) === 1, `JST で数えていない: ${doneToday(l, NOW)}`);
    }],
    ['読めない at は数えない（落ちもしない）', () => {
      const l = { releases: [{ at: 'きのう' }, { at: null }, {}, null] };
      assert(doneToday(l, NOW) === 0, '読めない日付を今日として数えた');
    }],
    ['実績が無ければ 0', () => {
      assert(doneToday(ledger, NOW) === 0, '空の台帳から件数が出た');
      assert(doneToday({}, NOW) === 0, 'releases が無い台帳で落ちた');
    }],
    ['**要求項目を数え漏らさない**', () => {
      // 門の側に項目が増えたとき、この表が古いままだと「全部揃った」と言ってしまう。
      assert(REQUIRED.length === 21, `要求項目が ${REQUIRED.length} 件 — 門と突き合わせること`);
      assert(REQUIRED.filter((f) => f.gate === 'submission').length === 13, '提出側の件数が合わない');
      assert(REQUIRED.filter((f) => f.gate === 'release').length === 8, '公開側の件数が合わない');
      assert(new Set(REQUIRED.map((f) => f.key)).size === REQUIRED.length, '同じ項目が2回入っている');
    }],
    ['**人にしか出せない材料が消えていない**', () => {
      const human = REQUIRED.filter((f) => f.source === 'human').map((f) => f.key);
      assert(human.length === 4, `人にしか出せない項目が ${human.length} 件になっている`);
      const device = human.filter((k) => k.startsWith('build.device_verified'));
      assert(device.length === 3, `実機確認の3項目が ${device.length} 件になっている`);
      // ブロッカーの定義が決まったら source を github へ戻す。**そのとき必ずここが落ちる。**
      assert(human.includes('build.open_blockers'),
        'ブロッカーの定義が決まったなら、この行と why を同じ PR で直すこと');
    }],
  ];
  return run(scenarios, { label: '門の材料' });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) {
    process.exit(selftest() === 0 ? 0 : 1);
  } else {
    const now = new Date().toISOString();
    const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    const { data: materials, why } = loadMaterials({ text: readIfExists(MATERIALS_PATH), now });
    const inv = inventory(materials);
    const have = inv.filter((f) => f.present).length;
    const r = evaluateBoth(toGateInput({ ledger, materials, now }));

    console.log('出荷の門 — 実データに当てる（**ASC へは何も送らない**）\n');
    console.log(`  材料        ${have} / ${inv.length} 項目`);
    if (why) console.log(`              ${why}`);
    console.log(`  この門を通った出荷  ${(ledger.releases ?? []).length} 件\n`);

    console.log('判定（実台帳のまま）');
    console.log(`  提出  ${r.actual.submission.decision}  — ${r.actual.submission.why ?? ''}`);
    console.log(`  公開  ${r.actual.release.decision}  — ${r.actual.release.why ?? ''}\n`);

    console.log('**仮定**: enabled を立てたら次に何で止まるか（判定ではない・実行にも記録にも使わない）');
    console.log(`  提出  ${r.ifEnabled.submission.decision}  — ${r.ifEnabled.submission.why ?? ''}`);
    console.log(`  公開  ${r.ifEnabled.release.decision}  — ${r.ifEnabled.release.why ?? ''}\n`);

    const bySource = new Map();
    for (const f of inv.filter((x) => !x.present)) {
      if (!bySource.has(f.source)) bySource.set(f.source, []);
      bySource.get(f.source).push(f);
    }
    if (bySource.size) {
      console.log(`足りない材料 ${inv.length - have} 件 — **出どころ別**\n`);
      const label = {
        asc: 'App Store Connect API（取る処理がまだ無い）',
        github: 'GitHub Actions / Xcode Cloud のチェック',
        api: 'simplememo-api の /admin/flags（kill の履歴）',
        human: '**機械には代われない。**人が書いたものを門が読む',
        'asc-metrics': '隣が既に日次で取っている asc-metrics.json',
      };
      for (const [src, fields] of bySource) {
        console.log(`  ${src} — ${label[src] ?? src}`);
        for (const f of fields) console.log(`      ${f.key.padEnd(30)} ${f.why}`);
        console.log('');
      }
    }
    if (args.includes('--check')) {
      // **判定が hold であることは失敗ではない。**材料が無いのだから hold が正しい。
      // ここで落とすのは、門が材料無しで通ってしまったときだけ。
      const leaked = [r.actual.submission, r.actual.release, r.ifEnabled.submission, r.ifEnabled.release]
        .filter((x) => x.decision !== 'hold');
      if (leaked.length) {
        console.log('\n**材料が揃っていないのに hold 以外を返した** — 門が抜けている:');
        for (const x of leaked) console.log(`  ${x.decision}: ${x.why ?? ''}`);
        process.exit(1);
      }
      // **表が空になったら揃ったことにする、を止める。**`have === inv.length` だけだと
      // REQUIRED が空のとき 0 === 0 で成立する。材料の有無で書くより、表そのものを見る。
      if (inv.length > 0 && have === inv.length) {
        console.log('\n材料が揃った。**台帳の分類を動かすのはここではない** ——');
        console.log('門を通って実際に出荷してから、data/automation-coverage.json の ④ を動かす。');
      }
      process.exit(0);
    }
  }
}
