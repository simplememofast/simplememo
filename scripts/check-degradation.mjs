#!/usr/bin/env node
/**
 * 縮退運転 — **「代替がある」と書いてあることを、実際に動かして確かめる。**
 *
 *   node scripts/check-degradation.mjs          # 一覧
 *   node scripts/check-degradation.mjs --check  # CI
 *
 * 【なぜ作るか】
 * ベンダー台帳には「止まると何が起きるか」と「代替はあるか」が書いてある。
 * ところがそれは**文章**で、書いた時点では正しくても、経路が変われば黙って嘘になる。
 * 一番まずいのは「代替がある」と書いてあるものが実際には効かない場合で、
 * それは**その事業者が落ちた日に初めて分かる。**
 *
 * だからここでは、台帳が代替を名乗っている事業者について、
 * **その代替が本当に効くことを振る舞いで確かめる。**
 * 名乗っているのに確かめる手段（probe）が無いものは落とす —
 * **一度も動かしたことのない代替は、代替ではない。**
 *
 * 逆に `fallback: null`（代替なし）は落とさない。それは壊れているのではなく、
 * 単一障害点だと分かっていることで、分かっているほうが良い。
 * ただし **fallback_note が空なら落とす**（「考えていない」と「代替なし」は別）。
 *
 * 【代替と縮退を分ける】
 * この2つを混ぜると、resilience を過大に見積もる。
 *   - **代替（fallback）** … その事業者の役割を別のものが肩代わりする。実際には稀
 *   - **縮退（degradation）** … 肩代わりはしないが、被害の範囲を限る仕組み。
 *     回路遮断器・端末側 Outbox・故障時に走らない判定。落ちることは防げないが、
 *     **失われるか・後で戻せるかが変わる**
 * Resend が落ちてもメールは送れない（代替なし）。だが遮断器と死信があるので
 * 送信は失われず、復旧後に戻せる。これを「代替あり」と数えたら嘘になる。
 *
 * 【対象は台帳から取る。手で並べない】
 * 並べると、新しい事業者が黙って対象外になる。それはその事業者が落ちた日に
 * しか分からない。backup-d1.mjs が対象を保持台帳から取っているのと同じ理由。
 *
 * 【隣のリポジトリを見る probe（2026-08-24 に直した）】
 * 縮退の受け皿は、このリポジトリではなく隣にある —— 遮断器と死信は
 * simplememo-api、端末側 Outbox は simplememo-ios。ところが **CIのチェックアウトには
 * 隣が無い。**
 *
 * 最初の実装は `fs.existsSync('../simplememo-api/src/dlq.ts')` を直接見ていた。
 * 3リポジトリが揃うセッションでは通り、**CIでは「不足: 3」で必ず落ちた。**
 * 2026-08-22 以降このリポジトリのCIはずっと赤で、赤いので auto-merge が
 * 動かず、**サイトのデプロイが丸ごと止まっていた。**
 *
 * 検査の答えが「隣が置いてあるかどうか」で変わるなら、それは
 * 縮退運転を測っていない。逆向きの穴（隣が無いとき黙ってスキップ）も同じで、
 * そちらは**ずれたまま緑になる。**どちらもやらない。
 *
 * だから写しを置く（`data/crossrepo-probes.json`）。
 *   - 隣が見えるとき … **実物を見る。**写しは使わない
 *   - 隣が無いとき   … 写しで判定し、**写しで判定したと出力に書く**
 *   - 写しが無い／古い … 落とす。**古い写しは、無い検査と同じ**
 * イベント名の交差検査・段階公開のバケット契約と同じ形にしてある。
 *
 * 隣のファイルが消えていないことを**継続的に**見張るのは隣のCIの仕事で、
 * ここではない（dlq.ts を消せば simplememo-api の typecheck とテストが落ちる）。
 * ここが持っているのは「その契約を最後に確かめたのはいつか」。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, baseState, CODES } from './autopilot-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDORS = path.join(ROOT, 'data/vendor-register.json');
const SNAPSHOT = path.join(ROOT, 'data/crossrepo-probes.json');

/**
 * 写しの寿命。イベント名の交差検査と揃えてある。
 * 無期限にしないのは、**古い写しが「確かめた」の顔をするから。**
 */
export const SNAPSHOT_MAX_DAYS = 60;

export function ageDays(iso, today = new Date()) {
  if (!iso) return null;
  const t = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(t.getTime())) return null;
  return Math.floor((today - t) / 86_400_000);
}

function readSnapshot() {
  if (!fs.existsSync(SNAPSHOT)) return null;
  try { return JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')); } catch { return null; }
}

/**
 * 隣のリポジトリにあるファイルで縮退の受け皿を確かめる。
 *
 * 隣が見えるなら実物を見る。無いなら写しで判定し、**どちらで判定したかを
 * detail に必ず書く**（「確かめた」と「写しで通した」を混ぜない）。
 */
export function crossRepo(id, repo, files, opts = {}) {
  const { need = 'all', label = '', snapshot = readSnapshot(), today = new Date() } = opts;
  const base = path.join(ROOT, '..', repo);
  const enough = (present) => (need === 'all' ? present === files.length : present > 0);

  if (fs.existsSync(base)) {
    const present = files.filter((f) => fs.existsSync(path.join(base, f))).length;
    return {
      ok: enough(present),
      source: 'live',
      detail: enough(present)
        ? `${label}（隣を実際に見た）`
        : `不足: ${files.length - present}（隣を実際に見た）`,
    };
  }

  const snap = snapshot?.probes?.[id];
  if (!snap) {
    return {
      ok: false,
      source: 'none',
      detail: `隣（${repo}）が無く、写しも無い`
        + ' — `node scripts/check-degradation.mjs --sync` を3リポジトリの揃った場所で実行する',
    };
  }
  const age = ageDays(snapshot.synced_at, today);
  if (age === null || age > SNAPSHOT_MAX_DAYS) {
    return {
      ok: false,
      source: 'stale',
      detail: `写しが ${age === null ? '日付を読めない' : `${age}日前`}`
        + `（上限 ${SNAPSHOT_MAX_DAYS}日）— **古い写しは、無い検査と同じ**`,
    };
  }
  return {
    ok: enough(snap.present),
    source: 'snapshot',
    detail: enough(snap.present)
      ? `${label}（${snapshot.synced_at} の写し・${age}日前）`
      : `不足: ${files.length - snap.present}（${snapshot.synced_at} の写し）`,
  };
}

/** 写しに載せる交差検査の定義。**probe と同じ場所から引く。** */
export const CROSS_REPO = {
  circuit_breaker: {
    repo: 'simplememo-api',
    need: 'all',
    label: '遮断器 + 死信 + 保管',
    files: ['src/circuit-breaker.ts', 'src/dlq.ts', 'migrations/0018_email_dead_letters.sql'],
  },
  device_outbox: {
    repo: 'simplememo-ios',
    need: 'any',
    label: '端末側 Outbox',
    files: ['SimpleMemo/OutboxManager.swift', 'SimpleMemo/Outbox.swift'],
  },
};

/**
 * 代替の効きを確かめる実験。**文言ではなく振る舞い。**
 * 各 probe は { ok, detail } を返す。
 */
export const PROBES = {
  /** GitHub API に到達できない日は、走らずに落ちる（静かに寝ない）。 */
  gate_fails_closed_on_api: () => {
    const r = decide(baseState({ githubApiReachable: false }));
    return {
      ok: r.code === CODES.FAIL_API && !r.run,
      detail: `githubApiReachable:false → ${r.code}（run=${r.run}）`,
    };
  },
  /** 副系（CCR）が主系とは別経路として実在する。 */
  dual_lane: () => {
    const runbook = path.join(ROOT, 'docs/obsidian/AUTOPILOT_RUNBOOK.md');
    const wf = path.join(ROOT, '.github/workflows/obsidian-autopilot.yml');
    const stop = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/emergency-stop.json'), 'utf8'));
    const routes = Object.keys(stop.agents || {}).filter((k) => k.startsWith('ccr-'));
    return {
      ok: fs.existsSync(runbook) && fs.existsSync(wf) && routes.length >= 1,
      detail: `主系ワークフロー + 手順書 + 副系 ${routes.length}経路（${routes.join(',')}）`,
    };
  },
  /** モデルが落ちたら縮退先へ、全滅なら走らない。 */
  model_fallback: () => {
    const degraded = decide(baseState({ modelsAvailable: ['haiku'], preferredModel: 'opus' }));
    const none = decide(baseState({ modelsAvailable: [] }));
    return {
      ok: degraded.code === CODES.DEGRADE_MODEL && degraded.run
        && none.code === CODES.FAIL_NO_MODEL && !none.run,
      detail: `縮退 → ${degraded.code}（run=${degraded.run}） / 全滅 → ${none.code}（run=${none.run}）`,
    };
  },
  /** 外部到達が塞がれた日は、一次情報の要るレーンを選ばない。 */
  egress_degrade: () => {
    const r = decide(baseState({ egressBlocked: true }));
    return {
      ok: r.code === CODES.DEGRADE_EGRESS && r.run,
      detail: `egressBlocked:true → ${r.code}（run=${r.run}・走るが選べるレーンが減る）`,
    };
  },
  /**
   * メール送信は回路遮断器と死信で受ける（送信先が落ちても呼び続けない）。
   * 受け皿は simplememo-api にあるので、隣が無いCIでは写しで判定する。
   */
  circuit_breaker: () => crossRepo('circuit_breaker', CROSS_REPO.circuit_breaker.repo,
    CROSS_REPO.circuit_breaker.files, CROSS_REPO.circuit_breaker),
  /**
   * 端末側 Outbox が貯めて復旧後に再送する。
   * 受け皿は simplememo-ios にあるので、隣が無いCIでは写しで判定する。
   */
  device_outbox: () => crossRepo('device_outbox', CROSS_REPO.device_outbox.repo,
    CROSS_REPO.device_outbox.files, CROSS_REPO.device_outbox),
};

export function validate(doc, probes = PROBES) {
  const problems = [];
  const rows = [];
  const used = new Set();
  /** probe id → 'live' | 'snapshot' | …。**何で判定したかを出力に出すため。** */
  const sources = {};

  const run = (id, label, vendorId) => {
    used.add(id);
    const probe = probes[id];
    if (!probe) {
      problems.push(`${vendorId}: probe "${id}" が実装されていない`);
      return { ok: false, detail: `未実装 (${id})` };
    }
    const r = probe();
    if (r.source) sources[id] = r.source;
    if (!r.ok) problems.push(`${vendorId}: ${label}が効かない — ${r.detail}`);
    return r;
  };

  for (const v of doc.vendors || []) {
    if (!v.breaks_if_down) {
      problems.push(`${v.id}: breaks_if_down が空 — 落ちたとき何が止まるか分からない`);
    }

    // 代替と縮退は**両立する。**片方を見たら終わりにしない
    // （GitHub は副系という代替を持ちつつ、API到達不能時の縮退も持っている）。
    let fallbackResult = null;
    if (v.fallback) {
      if (!v.fallback_probe) {
        problems.push(`${v.id}: 代替（${v.fallback}）を名乗っているのに fallback_probe が無い`
          + ' — **一度も動かしたことのない代替は、代替ではない**');
        fallbackResult = { ok: false, detail: v.fallback, unverified: true };
      } else {
        fallbackResult = run(v.fallback_probe, '代替', v.id);
      }
    } else if (!v.fallback_note) {
      // 代替なし。理由の無い「代替なし」は落とす。
      problems.push(`${v.id}: 代替が無いのに fallback_note が空`
        + ' — 「代替なし」と「考えていない」は別。単一障害点なら、そう書く');
    }

    const degradations = (v.degradation_probes || []).map((id) => run(id, '縮退', v.id));

    const all = [...(fallbackResult ? [fallbackResult] : []), ...degradations];
    const detail = all.length ? all.map((r) => r.detail).join(' / ') : (v.breaks_if_down || '—');
    let state;
    if (fallbackResult?.unverified) state = 'unverified';
    else if (all.some((r) => !r.ok)) state = 'broken';
    else if (fallbackResult) state = 'fallback';
    else if (degradations.length) state = 'degraded';
    else state = 'spof';
    rows.push({ id: v.id, state, detail });
  }

  // **誰にも使われていない probe は、覆っているように見える死んだコード。**
  for (const id of Object.keys(probes)) {
    if (!used.has(id)) {
      problems.push(`probe "${id}" をどの事業者も参照していない`
        + ' — 使われない実験は、覆っているように見えるだけで何も守っていない');
    }
  }
  return { problems, rows, sources };
}

/** 隣が揃っている場所で写しを更新する。**手で書かない。** */
export function sync(today = new Date()) {
  const probes = {};
  const missingRepos = [];
  for (const [id, spec] of Object.entries(CROSS_REPO)) {
    const base = path.join(ROOT, '..', spec.repo);
    if (!fs.existsSync(base)) { missingRepos.push(spec.repo); continue; }
    const files = spec.files.map((f) => {
      const abs = path.join(base, f);
      if (!fs.existsSync(abs)) return { path: f, exists: false };
      const buf = fs.readFileSync(abs);
      return {
        path: f,
        exists: true,
        bytes: buf.length,
        sha256_12: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12),
      };
    });
    probes[id] = {
      repo: spec.repo,
      need: spec.need,
      label: spec.label,
      files,
      present: files.filter((f) => f.exists).length,
    };
  }
  if (missingRepos.length) {
    return { ok: false, missingRepos };
  }
  const doc = {
    $comment: [
      '隣のリポジトリにある「縮退の受け皿」を最後に確かめた記録。**手で書かない。**',
      '  node scripts/check-degradation.mjs --sync',
      '',
      'なぜ写しを置くか: CIのチェックアウトには隣のリポジトリが無い。',
      '直接 existsSync で見に行くと、**3リポジトリの揃ったセッションでは通り、',
      'CIでは必ず落ちる** — 2026-08-22〜24 に実際そうなり、サイトのCIが赤で',
      '固定され、auto-merge が動かずデプロイが止まった。',
      '',
      '逆に「隣が無ければスキップ」にすると、**ずれたまま緑になる。**',
      'どちらもやらないために、写しで判定して写しだと出力に書く。',
      '',
      `写しの寿命は ${SNAPSHOT_MAX_DAYS}日。**古い写しは、無い検査と同じ。**`,
      'ファイルが消えていないことを継続的に見張るのは隣のCIの仕事で、ここではない。',
    ],
    synced_at: today.toISOString().slice(0, 10),
    max_age_days: SNAPSHOT_MAX_DAYS,
    probes,
  };
  fs.writeFileSync(SNAPSHOT, `${JSON.stringify(doc, null, 2)}\n`);
  return { ok: true, doc };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--sync')) {
    const r = sync();
    if (!r.ok) {
      console.error(`隣のリポジトリが無い: ${r.missingRepos.join(', ')}`);
      console.error('  **3リポジトリが揃った場所で実行すること。**'
        + '揃っていない場所で書くと、無いものを「無かった」として固めてしまう。');
      process.exit(1);
    }
    const n = Object.values(r.doc.probes).reduce((a, p) => a + p.files.length, 0);
    console.log(`写しを更新した: ${Object.keys(r.doc.probes).length}件の交差検査 / ${n}ファイル`
      + ` → data/crossrepo-probes.json（${r.doc.synced_at}）`);
    process.exit(0);
  }

  const doc = JSON.parse(fs.readFileSync(VENDORS, 'utf8'));
  const { problems, rows, sources } = validate(doc);
  const n = (s) => rows.filter((r) => r.state === s).length;

  console.log('縮退運転 — **「代替がある」を実際に動かして確かめる**\n');
  console.log(`  事業者 ${rows.length}件: 代替 ${n('fallback')} / 縮退のみ ${n('degraded')}`
    + ` / 単一障害点 ${n('spof')} / 未検証 ${n('unverified')} / 効かない ${n('broken')}\n`);
  const mark = {
    fallback: '✓ 代替あり', degraded: '△ 縮退のみ', spof: '— 単一障害点',
    unverified: '? 未検証', broken: '✗ 効かない',
  };
  for (const r of rows) {
    console.log(`  ${mark[r.state].padEnd(14)} ${r.id.padEnd(14)} ${r.detail}`);
  }
  console.log('');
  console.log('  **△ は「落ちない」ではない。**肩代わりはしないが、失われずに後で戻せる。');
  console.log('  **単一障害点は落とさない。**分かっていることは壊れていることではない。');
  console.log('  落とすのは、代替を名乗っているのに動かして確かめられないとき。');
  console.log('');
  console.log('  ここで確かめていないこと: **実際にその事業者を落として試したことは無い。**');
  console.log('  確かめているのは、こちら側の受け方（判定・遮断器・別経路の実在）だけ。');

  // **何で判定したかを混ぜない。**隣を見た probe と、写しで通した probe は別物。
  const cross = Object.keys(CROSS_REPO).filter((id) => sources[id]);
  if (cross.length) {
    const snap = readSnapshot();
    console.log('');
    console.log('  隣のリポジトリを見る検査:');
    for (const id of cross) {
      const where = { live: '**隣を実際に見た**', snapshot: '写しで判定（隣が無い）' }[sources[id]]
        ?? sources[id];
      console.log(`    ${id.padEnd(18)} ${where}`);
    }
    if (snap?.synced_at && cross.some((id) => sources[id] === 'snapshot')) {
      console.log(`    写しは ${snap.synced_at} 時点（上限 ${SNAPSHOT_MAX_DAYS}日）。`
        + '3リポジトリが揃った場所で --sync して更新する');
    }
  }

  if (problems.length) {
    console.error('\n縮退運転: 問題');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    // **「確かめた」と「写しで通した」を同じ文で締めない。**
    const bySnapshot = Object.keys(CROSS_REPO).filter((id) => sources[id] === 'snapshot');
    if (bySnapshot.length) {
      console.log(`\n代替を名乗るものはすべて通った（うち ${bySnapshot.length}件は写しでの判定）。`);
    } else {
      console.log('\n代替を名乗るものは、すべて動かして確かめてある。');
    }
  }
}
