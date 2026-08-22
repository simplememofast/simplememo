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
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, baseState, CODES } from './autopilot-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDORS = path.join(ROOT, 'data/vendor-register.json');

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
  /** メール送信は回路遮断器と死信で受ける（送信先が落ちても呼び続けない）。 */
  circuit_breaker: () => {
    const files = [
      '../simplememo-api/src/circuit-breaker.ts',
      '../simplememo-api/src/dlq.ts',
      '../simplememo-api/migrations/0018_email_dead_letters.sql',
    ].map((p) => path.join(ROOT, p));
    const missing = files.filter((f) => !fs.existsSync(f));
    return { ok: missing.length === 0, detail: missing.length ? `不足: ${missing.length}` : '遮断器 + 死信 + 保管' };
  },
  /** 端末側 Outbox が貯めて復旧後に再送する。 */
  device_outbox: () => {
    const hits = ['../simplememo-ios/SimpleMemo/OutboxManager.swift',
      '../simplememo-ios/SimpleMemo/Outbox.swift']
      .map((p) => path.join(ROOT, p)).filter((f) => fs.existsSync(f));
    return { ok: hits.length > 0, detail: hits.length ? path.basename(hits[0]) : '見つからない' };
  },
};

export function validate(doc, probes = PROBES) {
  const problems = [];
  const rows = [];
  const used = new Set();

  const run = (id, label, vendorId) => {
    used.add(id);
    const probe = probes[id];
    if (!probe) {
      problems.push(`${vendorId}: probe "${id}" が実装されていない`);
      return { ok: false, detail: `未実装 (${id})` };
    }
    const r = probe();
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
  return { problems, rows };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const doc = JSON.parse(fs.readFileSync(VENDORS, 'utf8'));
  const { problems, rows } = validate(doc);
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

  if (problems.length) {
    console.error('\n縮退運転: 問題');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n代替を名乗るものは、すべて動かして確かめてある。');
}
