#!/usr/bin/env node
/**
 * **採用された改善1件あたりのAI原価。**
 *
 *   node scripts/ai-unit-cost.mjs            # 集計を表示
 *   node scripts/ai-unit-cost.mjs --check    # 台帳の整合を見る（値の大小では落ちない）
 *   node scripts/ai-unit-cost.mjs --json     # 機械可読
 *   node scripts/ai-unit-cost.mjs --selftest # 境界の固定
 *
 * 【なぜ要るか】
 * data/automation-coverage.json は長らくこの行を `nobody` で持ち、理由をこう書いていた:
 *
 *   「**分子はあるが分母が無い。**実費と1記事あたり単価は出せるが、『採用された』
 *     改善1件あたりは出せない —— 却下・revert・計測失敗に終わった分を分母から
 *     外す仕組みが無いため。この数字が無いと、AI費用の増加が成果の増加かどうかを
 *     判定できない」
 *
 * 半分は既に古い。`data/autopilot-cost.json` の run には `outcome` があり、
 * `shipped` / `no_artifact` / `failed` を区別している。**残っていたのは revert だけ。**
 * 出荷したあとで戻した変更は、いまも「採用」として数えられてしまう。
 *
 * 【分子に失敗も入れる】
 * 分母から外した run の費用は**分子に残す。**失敗した試行は、採用1件を得るための
 * 原価の一部だからで、成功した run だけを割ると「うまくいった日だけ見た単価」になる。
 * これは自分に都合のよい数え方であって、原価ではない。
 *
 * 【値は簡単には出さない】
 * 費用の分散が大きい（観測済み 0 〜 11.93 USD）。分母が数件の平均は数字の形をした
 * 雑音なので、`MIN_ADOPTED` に達するまで **measured を名乗らない。**
 * このリポジトリが率に対して分母20を要求しているのと同じ理由で、
 * 「判定していない」と「異常なし」を同じ語で呼ばないため。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/autopilot-cost.json');

/**
 * run の結末。**`reverted` はここで初めて足した語。**
 *
 * `shipped`     … 出荷された（採用の候補）
 * `reverted`    … 出荷したあとで戻した。**費用は残るが採用ではない**
 * `no_artifact` … 走ったが成果物が出なかった
 * `failed`      … 落ちた
 */
export const OUTCOMES = ['shipped', 'reverted', 'no_artifact', 'failed'];

/** 採用として数える結末。**ここだけが分母。** */
export const ADOPTED_OUTCOMES = ['shipped'];

/**
 * これに達するまで measured を名乗らない。
 * 費用の分散が大きいので、数件の平均は方向すら示さない。
 */
export const MIN_ADOPTED = 10;

export function loadLedger(file = LEDGER_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * 台帳の整合。**値の大小では落とさない** —— 単価が高いことは不整合ではない。
 * 落とすのは「数えられない形」だけ。
 */
export function validate(ledger) {
  const problems = [];
  const runs = ledger?.runs;
  if (!Array.isArray(runs)) return ['runs が配列でない'];

  runs.forEach((r, i) => {
    const at = `runs[${i}]${r.run_id ? `(${r.run_id})` : ''}`;
    if (r.outcome !== undefined && !OUTCOMES.includes(r.outcome)) {
      problems.push(`${at}: 知らない outcome 「${r.outcome}」（${OUTCOMES.join(' / ')}）`);
    }
    if (typeof r.total_cost_usd !== 'number' || Number.isNaN(r.total_cost_usd)) {
      problems.push(`${at}: total_cost_usd が数でない`);
    } else if (r.total_cost_usd < 0) {
      problems.push(`${at}: total_cost_usd が負`);
    }
    // **戻したなら、何を戻したかを書かせる。**
    // 理由の無い reverted は、あとから「無かったこと」にするのに使える。
    if (r.outcome === 'reverted' && !r.reverted_why) {
      problems.push(`${at}: outcome=reverted には reverted_why が要る（何を戻したか）`);
    }
    if (r.reverted_why && r.outcome !== 'reverted') {
      problems.push(`${at}: reverted_why があるのに outcome が ${r.outcome}`);
    }
  });
  return problems;
}

/**
 * 採用1件あたりの原価。**純関数。**
 *
 * `measured` が false のときに `usd_per_adopted` を読んではいけない。
 * 参考値として計算はするが、名乗れる数ではない。
 */
export function summarize(ledger, { minAdopted = MIN_ADOPTED } = {}) {
  const runs = (ledger?.runs ?? []).filter((r) => typeof r.total_cost_usd === 'number');
  const byOutcome = {};
  for (const o of OUTCOMES) byOutcome[o] = 0;
  let unknown = 0;
  for (const r of runs) {
    if (r.outcome && OUTCOMES.includes(r.outcome)) byOutcome[r.outcome] += 1;
    else unknown += 1;
  }

  // **分子は全部の費用。**分母から外した run のぶんも残す（上のコメント）。
  const total_usd = runs.reduce((s, r) => s + r.total_cost_usd, 0);
  const adopted = runs.filter((r) => ADOPTED_OUTCOMES.includes(r.outcome)).length;
  const reverted = byOutcome.reverted;

  // 出荷したもののうち、あとで戻した割合。分母は shipped + reverted。
  const shippedEver = adopted + reverted;
  const revert_rate = shippedEver > 0 ? reverted / shippedEver : null;

  return {
    runs: runs.length,
    unknown_outcome: unknown,
    by_outcome: byOutcome,
    total_usd: round4(total_usd),
    adopted,
    reverted,
    revert_rate,
    min_adopted: minAdopted,
    measured: adopted >= minAdopted,
    // 参考値。measured が false ならこの数を外に出さない。
    usd_per_adopted: adopted > 0 ? round4(total_usd / adopted) : null,
  };
}

const round4 = (n) => Math.round(n * 1e4) / 1e4;
const fmt = (n) => (n === null ? '—' : `$${n.toFixed(2)}`);
const pct = (r) => (r === null ? '—' : `${(r * 100).toFixed(1)}%`);

export function render(s) {
  const L = [];
  L.push('採用された改善1件あたりのAI原価（data/autopilot-cost.json）');
  L.push('');
  L.push(`  run ${s.runs} 件 / 実費合計 ${fmt(s.total_usd)}`);
  L.push(`  内訳: ${OUTCOMES.map((o) => `${o} ${s.by_outcome[o]}`).join(' / ')}`
    + (s.unknown_outcome ? ` / **outcome 未記入 ${s.unknown_outcome}**` : ''));
  L.push('');
  if (s.measured) {
    L.push(`  **採用1件あたり ${fmt(s.usd_per_adopted)}**（採用 ${s.adopted} 件）`);
  } else {
    L.push(`  [**未測定**] 採用 ${s.adopted} 件 < ${s.min_adopted} 件。`);
    L.push('    費用の分散が大きいので、数件の平均は方向すら示さない。');
    L.push(`    参考値は ${fmt(s.usd_per_adopted)} だが、**これは名乗れる数ではない。**`);
    L.push('    **「まだ測れていない」であって「原価が低い」ではない。**');
  }
  L.push('');
  L.push(`  出荷後に戻した割合: ${pct(s.revert_rate)}（reverted ${s.reverted} / 出荷 ${s.adopted + s.reverted}）`);
  L.push('');
  L.push('  **分子には失敗した run の費用も入れている。**採用1件を得るための原価は、');
  L.push('  うまくいかなかった試行を含めた額であって、成功分だけを割った額ではない。');
  return L.join('\n');
}

// ── 自己テスト（境界の固定） ──────────────────────────
const SCENARIOS = [
  ['分母が足りなければ measured を名乗らない', () => {
    const s = summarize({ runs: [{ total_cost_usd: 10, outcome: 'shipped' }] });
    assert(s.measured === false, 'measured は false');
    assert(s.usd_per_adopted === 10, '参考値は計算する');
  }],
  ['**失敗した run の費用は分子に残る**（成功分だけを割らない）', () => {
    const s = summarize({
      runs: [
        { total_cost_usd: 10, outcome: 'shipped' },
        { total_cost_usd: 90, outcome: 'failed' },
      ],
    }, { minAdopted: 1 });
    assert(s.measured === true, 'minAdopted 1 なら measured');
    assert(s.usd_per_adopted === 100, `分子は 100 のはず（実際 ${s.usd_per_adopted}）`);
  }],
  ['**reverted は分母から外れるが、費用は分子に残る**', () => {
    const s = summarize({
      runs: [
        { total_cost_usd: 10, outcome: 'shipped' },
        { total_cost_usd: 10, outcome: 'reverted', reverted_why: 'x' },
      ],
    }, { minAdopted: 1 });
    assert(s.adopted === 1, `採用は1（実際 ${s.adopted}）`);
    assert(s.usd_per_adopted === 20, `分子は 20 のはず（実際 ${s.usd_per_adopted}）`);
    assert(s.revert_rate === 0.5, 'revert 率は 0.5');
  }],
  ['採用0なら単価は null（0 で埋めない）', () => {
    const s = summarize({ runs: [{ total_cost_usd: 5, outcome: 'failed' }] });
    assert(s.usd_per_adopted === null, 'null');
    assert(s.revert_rate === null, '出荷0なら revert 率も null');
  }],
  ['outcome 未記入は「採用」に数えない', () => {
    const s = summarize({ runs: [{ total_cost_usd: 5 }] });
    assert(s.adopted === 0, '採用0');
    assert(s.unknown_outcome === 1, '未記入として別に数える');
  }],
  ['知らない outcome は検査で落ちる', () => {
    const p = validate({ runs: [{ total_cost_usd: 1, outcome: 'とりあえず成功' }] });
    assert(p.length === 1 && p[0].includes('知らない outcome'), p.join(' / '));
  }],
  ['**理由の無い reverted は落とす**（あとから無かったことにできる形を作らない）', () => {
    const p = validate({ runs: [{ total_cost_usd: 1, outcome: 'reverted' }] });
    assert(p.length === 1 && p[0].includes('reverted_why'), p.join(' / '));
  }],
  ['reverted_why があるのに outcome が違えば落とす', () => {
    const p = validate({ runs: [{ total_cost_usd: 1, outcome: 'shipped', reverted_why: 'x' }] });
    assert(p.length === 1 && p[0].includes('outcome が shipped'), p.join(' / '));
  }],
  ['費用が数でなければ落とす（欠測を0にしない）', () => {
    assert(validate({ runs: [{ outcome: 'shipped' }] }).length === 1, '1件');
    assert(validate({ runs: [{ total_cost_usd: -1, outcome: 'shipped' }] })[0].includes('負'), '負を弾く');
  }],
  ['実データが検査を通る', () => {
    assert(validate(loadLedger()).length === 0, validate(loadLedger()).join(' / '));
  }],
];

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function selftest() {
  let failed = 0;
  for (const [name, fn] of SCENARIOS) {
    try { fn(); console.log(`  ok   ${name}`); }
    catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
  }
  console.log(`\n  自己テスト ${SCENARIOS.length} 件中 ${failed} 件失敗`);
  return failed;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) {
    process.exit(selftest() === 0 ? 0 : 1);
  }
  const ledger = loadLedger();
  const problems = validate(ledger);
  const s = summarize(ledger);

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ...s, problems }, null, 2));
    process.exit(problems.length ? 1 : 0);
  }

  console.log(render(s));
  if (problems.length) {
    console.log('\nAI原価台帳: 不整合');
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  if (argv.includes('--check')) {
    if (selftest() !== 0) process.exit(1);
    console.log('\nAI原価台帳の整合に問題なし。');
  }
}
