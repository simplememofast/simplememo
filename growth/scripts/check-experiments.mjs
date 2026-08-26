#!/usr/bin/env node
/**
 * CI gate: no experiment may quietly sail past its evaluation date.
 *
 *   node growth/scripts/check-experiments.mjs           # annotate, never block
 *   node growth/scripts/check-experiments.mjs --strict  # exit 1 when overdue
 *
 * Why overdue experiments do NOT fail CI by default
 * ------------------------------------------------
 * On this repo a green SEO Validation is what lets auto-merge.yml merge to
 * main, and merging to main *is* the production deploy. If an unevaluated
 * retitle blocked that pipeline, an overdue experiment would also block every
 * unrelated bugfix — turning a bookkeeping lapse into a shipping outage, and
 * creating pressure to rubber-stamp decisions just to unblock a deploy. That
 * trade is not worth it.
 *
 * So the default is loud but non-blocking: a GitHub Actions `::warning::`
 * annotation (surfaces at the top of the PR's checks) plus a table in the job
 * summary. Both are visible without opening a log. `--strict` exists for a
 * scheduled job or a local run where blocking is the point.
 *
 * A malformed ledger DOES fail, always. An entry that cannot be parsed is an
 * entry that can never come due, so a broken file would silently switch this
 * whole gate off — the exact failure it is here to prevent.
 *
 * [2026-08-26] **上の段落は「項目」の話でしかなく、「台帳」は素通りしていた。**
 * `experiments` のキーを1文字打ち間違えると、ループは0周し、validate は0件、
 * summarize は total 0 を返し、この門は36件の実験を載せたまま
 * 「評価日を過ぎた実験は無い」と報告して exit 0 した。実測して塞いである
 * （`--selftest`）。空の配列は正当。**無いのと読めないのは違う。**
 */

import fs from 'node:fs';
import { loadLedger, validate, summarize, daysOverdue, today, DECISIONS } from '../lib/ledger.mjs';

const strict = process.argv.includes('--strict');
const asOf = today();

// ── 自己テスト（**この門が落ちることを確かめる**） ─────────────────
//
// 冒頭に「A malformed ledger DOES fail, always」と書いてあるが、
// **2026-08-26 まで、それは壊れた「項目」の話でしかなかった。**
// 壊れた「台帳」——`experiments` のキーを1文字打ち間違えた形——は
// 素通りし、36件の実験を載せたまま「評価日を過ぎた実験は無い」と報告した。
// ここで固定するのは、その2つを取り違えないこと。
if (process.argv.includes('--selftest')) {
  // 実データの走っている実験を型として使う（**推測で作った検査は、推測の分だけ効かない**）。
  const real = loadLedger().experiments.find((e) => e.status === 'running');
  const base = () => JSON.parse(JSON.stringify(real));
  const one = (over = {}) => ({ version: 1, experiments: [{ ...base(), ...over }] });
  const has = (problems, needle) => problems.some((x) => x.includes(needle));

  const SCENARIOS = [
    ['実データの台帳が検査を通る', () => {
      const l = loadLedger();
      if (!Array.isArray(l.experiments) || l.experiments.length < 10) {
        throw new Error(`実験が ${l.experiments?.length} 件しか読めていない`);
      }
      const problems = validate(l);
      if (problems.length) throw new Error(problems[0]);
    }],
    ['**台帳のキーを打ち間違えると落ちる**（36件を載せたまま門が黙って開いた形）', () => {
      const p = validate({ version: 1, experimets: [base()] });
      if (!p.length) throw new Error('打ち間違いが通った（**この門は黙って開く**）');
      if (summarize({ version: 1, experimets: [base()] }, asOf).total !== 0) {
        throw new Error('前提が変わった: 打ち間違いでも total が出ている');
      }
    }],
    ['空の配列は通る（**無いのと読めないのは違う**）', () => {
      const p = validate({ version: 1, experiments: [] });
      if (p.length) throw new Error(p[0]);
    }],
    ['**走っているのに評価日が無ければ落ちる**（永遠に期日が来ない実験を作らない）', () => {
      const p = validate(one({ evaluation_at: null }));
      if (!has(p, 'requires evaluation_at')) throw new Error(JSON.stringify(p));
    }],
    ['**走っているのに baseline が空なら落ちる**（2026-07-01/02 の7件がこれで潰れた）', () => {
      const p = validate(one({ baseline: { note: '数値なし' } }));
      if (!has(p, 'baseline に数値が1つも無い')) throw new Error(JSON.stringify(p));
    }],
    ['**stop_conditions が空なら落ちる**（止める条件を決めていない実験は止まらない）', () => {
      const p = validate(one({ stop_conditions: [] }));
      if (!has(p, 'stop_conditions')) throw new Error(JSON.stringify(p));
    }],
    ['**control.kind が空欄なら落ちる**（空欄と「無いと決めた」は違う）', () => {
      const p = validate(one({ control: null }));
      if (!has(p, 'control.kind')) throw new Error(JSON.stringify(p));
    }],
    ['pre_post なのに confounders が無ければ落ちる（因果を黙って主張しない）', () => {
      const p = validate(one({ control: { kind: 'pre_post', note: 'x' } }));
      if (!has(p, 'confounders')) throw new Error(JSON.stringify(p));
    }],
    ['**min_sample が無ければ落ちる**（母数の下限を決めずに評価日を迎えるとノイズを結論にする）', () => {
      const p = validate(one({ min_sample: null }));
      if (!has(p, 'min_sample')) throw new Error(JSON.stringify(p));
    }],
    ['**inconclusive なのに baseline が無ければ落ちる**（待っても解けないものを、待てば解けるように見せない）', () => {
      const p = validate({ version: 1, experiments: [{
        ...base(), status: 'evaluated', decision: 'inconclusive',
        evaluated_at: '2026-08-26', baseline: { note: '数値なし' },
      }] });
      if (!has(p, 'measurement_failed')) throw new Error(JSON.stringify(p));
    }],
    ['id の重複は落ちる（同じ実験を二重に数えない）', () => {
      const p = validate({ version: 1, experiments: [base(), base()] });
      if (!has(p, 'duplicate id')) throw new Error(JSON.stringify(p));
    }],
    ['知らない status は落ちる', () => {
      const p = validate(one({ status: 'たぶん走ってる' }));
      if (!has(p, 'not one of')) throw new Error(JSON.stringify(p));
    }],
    ['**評価日を過ぎた実験は overdue に出る**（期日の判定が効いている）', () => {
      const l = one({ evaluation_at: '2026-01-01' });
      const sum = summarize(l, '2026-08-26');
      if (sum.overdue.length !== 1) throw new Error(`overdue=${sum.overdue.length}`);
      if (daysOverdue(l.experiments[0], '2026-08-26') < 200) throw new Error('日数が合わない');
    }],
    ['評価日が先なら overdue にならない（常に鳴る門も何も見ていない）', () => {
      const sum = summarize(one({ evaluation_at: '2099-01-01' }), '2026-08-26');
      if (sum.due.length || sum.overdue.length) throw new Error('先の日付が期日扱い');
    }],
  ];

  let failed = 0;
  for (const [name, fn] of SCENARIOS) {
    try { fn(); console.log(`  ok   ${name}`); }
    catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
  }
  console.log(`\n  自己テスト ${SCENARIOS.length} 件中 ${failed} 件失敗`);
  process.exit(failed === 0 ? 0 : 1);
}

const ledger = loadLedger();
const problems = validate(ledger);
if (problems.length) {
  console.error('Experiment ledger is malformed:');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nA malformed entry can never come due, which disables this gate. Fix before merging.');
  console.error('（台帳そのものが読めない場合も同じ。**「実験が無い」と「台帳が読めない」を混ぜない。**）');
  process.exit(1);
}

const { total, open, due, overdue } = summarize(ledger, asOf);
console.log(`Experiment ledger: ${total} total, ${open} open, ${due.length} due, ${overdue.length} overdue (as of ${asOf})`);

if (!due.length) {
  console.log('No experiment is past its evaluation date.');
  process.exit(0);
}

const rows = due
  .map((e) => ({ e, d: daysOverdue(e, asOf) }))
  .sort((a, b) => b.d - a.d);

for (const { e, d } of rows) {
  const label = d > 0 ? `${d} day(s) OVERDUE` : 'due today';
  console.log(`  ${label.padEnd(18)} ${e.id}  ${e.page}  (${e.type}, evaluation_at ${e.evaluation_at})`);
  // Annotation text is single-line by contract; GitHub renders \n as a literal.
  console.log(
    `::warning file=growth/experiments/experiments.json::${e.id} (${e.page}) is ${label}. ` +
    `Evaluate with: node growth/scripts/experiments.mjs evaluate ${e.id} --decision <${DECISIONS.join('|')}>`
  );
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    `### ⏰ ${rows.length} experiment(s) awaiting a decision`,
    '',
    '| Days overdue | Experiment | Page | Evaluation date |',
    '|---:|---|---|---|',
    ...rows.map(({ e, d }) => `| ${d} | \`${e.id}\` | \`${e.page}\` | ${e.evaluation_at} |`),
    '',
    'These pages stay frozen — do not stack a new title change on top of an unevaluated one.',
    '',
    '```sh',
    'node growth/scripts/experiments.mjs due',
    'node growth/scripts/experiments.mjs evaluate <id> --decision keep --note "..."',
    '```',
  ].join('\n');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
}

if (strict && overdue.length) {
  console.error(`\nFAIL (--strict): ${overdue.length} experiment(s) overdue.`);
  process.exit(1);
}
process.exit(0);
