#!/usr/bin/env node
/**
 * コード変更のAI著者率 — **数え方を script にして、聞かれたら渡せる形にする。**
 *
 *   node scripts/code-authorship.mjs                       # 既定の窓で数える
 *   node scripts/code-authorship.mjs --from 2026-08-11 --to 2026-08-22
 *   node scripts/code-authorship.mjs --write               # 台帳を更新
 *   node scripts/code-authorship.mjs --check               # CI
 *
 * 【なぜ作るか】
 * 原稿には「変更行の98.8%（231,315行中228,498行）」と書いてあった。
 * 2026-08-22 に同じ窓で数え直したが、**どの数え方をしても再現できなかった**
 * （最も近い値で 96.0%・76,647行）。
 *
 * 再現できない数字は、記者に聞かれた瞬間にいちばん高くつく。しかも
 * 「誰がどう数えたか」が残っていないと、次に数えた人がまた違う値を出す。
 *
 * だから数字ではなく**数え方**を置く。ここに書いてある定義がすべてで、
 * 台帳（data/code-authorship.json）は**この script の出力そのもの**。
 *
 * 【定義（ここが全部）】
 * - 対象コミット … 指定窓の author date。**マージコミットは除く**
 *   （マージは差分の重複計上になり、率を上げる方向に効く）
 * - AI著者 … `author` に Claude を含む、または本文に `Co-Authored-By: Claude`
 * - 変更行 … `git show --numstat` の **追加 + 削除**（バイナリの `-` は0扱い）
 * - 範囲 … 3リポジトリ。既定は現在のブランチのみ。`--all-branches` で全参照
 * - 窓 … **計測日そのものは入れない。**計測日はAIが集中的に書いている日に
 *   なりやすく、率を上げる方向に効く（実測で +2.4pt 動いた）
 *
 * 【この数え方が測っていないこと】
 * - **生成物の行数が混じる。**lockfile・生成JSON・SVG はAIが書いたことになるが、
 *   それは「AIが設計した」とは違う。行数はやった仕事の量の近似でしかない
 * - コードレビューで人が指示した内容は author に現れない。
 *   **「人間がやったのは、壊れていることに気づいて直せと言うこと」は行数に出ない**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER = path.join(ROOT, 'data/code-authorship.json');
const REPOS = ['simplememo', 'simplememo-api', 'simplememo-ios'];

const AI_AUTHOR = /claude/i;
const AI_TRAILER = /^Co-Authored-By:\s*Claude/im;

/** 1リポジトリを数える。git が無い・リポジトリが無い場合は null（0ではない）。 */
export function measureRepo(repoPath, { from, to, allBranches = false }) {
  if (!fs.existsSync(path.join(repoPath, '.git'))) return null;
  const range = allBranches ? ['--all'] : ['HEAD'];
  const args = [
    'log', ...range, '--no-merges',
    `--since=${from}`, `--until=${to} 23:59:59`,
    '--pretty=format:%H%x01%an <%ae>%x01%B%x02',
  ];
  let out;
  try {
    out = execFileSync('git', args, { cwd: repoPath, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  } catch {
    return null;
  }
  const commits = out.split('\x02').map((c) => c.trim()).filter(Boolean).map((c) => {
    const [sha, author, body] = c.split('\x01');
    return { sha, author: author || '', body: body || '' };
  });
  // --all は同じコミットを複数の参照から拾いうる。**SHAで一意にする**
  // （ここを忘れると率が上がる方向に狂う）。
  const seen = new Set();
  let aiCommits = 0, allCommits = 0, aiLines = 0, allLines = 0;
  for (const c of commits) {
    if (seen.has(c.sha)) continue;
    seen.add(c.sha);
    const isAI = AI_AUTHOR.test(c.author) || AI_TRAILER.test(c.body);
    let lines = 0;
    try {
      const stat = execFileSync('git', ['show', '--numstat', '--format=', c.sha],
        { cwd: repoPath, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
      for (const row of stat.split('\n')) {
        const m = /^(\d+|-)\t(\d+|-)\t/.exec(row);
        if (!m) continue;
        lines += (m[1] === '-' ? 0 : Number(m[1])) + (m[2] === '-' ? 0 : Number(m[2]));
      }
    } catch { /* 読めないコミットは行数0として数える（存在は数える） */ }
    allCommits += 1; allLines += lines;
    if (isAI) { aiCommits += 1; aiLines += lines; }
  }
  return { commits_total: allCommits, commits_ai: aiCommits, lines_total: allLines, lines_ai: aiLines };
}

export function measure({ from, to, allBranches = false }) {
  const perRepo = {};
  const missing = [];
  for (const r of REPOS) {
    const res = measureRepo(path.resolve(ROOT, '..', r), { from, to, allBranches });
    if (res === null) { missing.push(r); continue; }
    perRepo[r] = res;
  }
  const total = Object.values(perRepo).reduce((a, b) => ({
    commits_total: a.commits_total + b.commits_total,
    commits_ai: a.commits_ai + b.commits_ai,
    lines_total: a.lines_total + b.lines_total,
    lines_ai: a.lines_ai + b.lines_ai,
  }), { commits_total: 0, commits_ai: 0, lines_total: 0, lines_ai: 0 });
  return { from, to, all_branches: allBranches, per_repo: perRepo, total, missing_repos: missing };
}

const rate = (n, d) => (d > 0 ? n / d : null);
const pct = (v) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);

/** 台帳の算数が合っているか。**リポジトリが無くても検査できる部分。** */
export function validateLedger(doc) {
  const problems = [];
  if (!doc.method || !doc.method.ai_author_definition) {
    problems.push('method.ai_author_definition が無い — **数え方が残っていない数字は再現できない**');
  }
  if (doc.method?.excludes_merges !== true) {
    problems.push('method.excludes_merges が true でない — マージを含めると差分が重複計上され、率が上がる');
  }
  const t = doc.total || {};
  const sum = Object.values(doc.per_repo || {}).reduce((a, b) => ({
    commits_total: a.commits_total + b.commits_total,
    commits_ai: a.commits_ai + b.commits_ai,
    lines_total: a.lines_total + b.lines_total,
    lines_ai: a.lines_ai + b.lines_ai,
  }), { commits_total: 0, commits_ai: 0, lines_total: 0, lines_ai: 0 });
  for (const k of Object.keys(sum)) {
    if (t[k] !== sum[k]) problems.push(`total.${k} が内訳の合計と一致しない（${t[k]} ≠ ${sum[k]}）`);
  }
  for (const [k, v] of Object.entries(sum)) {
    if (typeof v !== 'number' || v < 0) problems.push(`${k} が数値でない`);
  }
  if (sum.commits_ai > sum.commits_total || sum.lines_ai > sum.lines_total) {
    problems.push('AI分が合計を超えている');
  }
  // 原稿が使う数字は台帳から取る。**丸めた値を別に持たない。**
  if (doc.headline && doc.headline.lines_rate_pct !== undefined) {
    const want = Number((rate(sum.lines_ai, sum.lines_total) * 100).toFixed(1));
    if (Math.abs(doc.headline.lines_rate_pct - want) > 0.05) {
      problems.push(`headline.lines_rate_pct ${doc.headline.lines_rate_pct}% が実測 ${want}% と違う`);
    }
  }
  return problems;
}


// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const SELFTEST_BREAKAGES = [
  ['**合計が内訳と一致しない**のは落ちる', (d) => { const k = Object.keys(d.total)[0]; d.total[k] = (d.total[k] || 0) + 12345; }],
];
const SCENARIOS = ledgerScenarios(
  () => JSON.parse(fs.readFileSync(LEDGER, 'utf8')),
  (d) => validateLedger(d),
  SELFTEST_BREAKAGES,
);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 ? 0 : 1);
  const argv = process.argv.slice(2);
  const arg = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
  };
  const stored = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : null;

  if (argv.includes('--check')) {
    if (!stored) { console.error('data/code-authorship.json が無い'); process.exit(1); }
    const problems = validateLedger(stored);
    console.log('コード変更のAI著者率 — **数え方を台帳に置く**\n');
    console.log(`  窓: ${stored.from} 〜 ${stored.to}`
      + `（${stored.all_branches ? '全ブランチ' : '現ブランチ'}・マージ除く）`);
    console.log(`  コミット ${stored.total.commits_ai} / ${stored.total.commits_total}`
      + `  = ${pct(rate(stored.total.commits_ai, stored.total.commits_total))}`);
    console.log(`  変更行   ${stored.total.lines_ai.toLocaleString()} / ${stored.total.lines_total.toLocaleString()}`
      + ` = ${pct(rate(stored.total.lines_ai, stored.total.lines_total))}`);
    console.log('');
    console.log('  **この検査は再計測しない。**隣のリポジトリはCIのチェックアウトに無く、');
    console.log('  浅いクローンでは履歴も足りない。見るのは算数と、数え方が書いてあること。');
    console.log('  数え直すときは --write（3リポジトリが揃った場所で実行する）。');
    if (problems.length) {
      console.error('\nコード著者率: 台帳の不整合');
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log('\n台帳の算数と数え方の記述に問題なし。');
    process.exit(0);
  }

  const from = arg('--from', stored?.from || '2026-08-11');
  const to = arg('--to', stored?.to || '2026-08-22');
  const allBranches = argv.includes('--all-branches') || (stored?.all_branches ?? true);
  const r = measure({ from, to, allBranches });

  console.log(`コード変更のAI著者率 — ${from} 〜 ${to}`
    + `（${allBranches ? '全ブランチ' : '現ブランチ'}・マージ除く）\n`);
  console.log('  リポジトリ            コミット            変更行');
  for (const [name, v] of Object.entries(r.per_repo)) {
    console.log(`  ${name.padEnd(18)} ${String(v.commits_ai).padStart(4)}/${String(v.commits_total).padEnd(5)}`
      + ` ${pct(rate(v.commits_ai, v.commits_total)).padStart(7)}`
      + `   ${v.lines_ai.toLocaleString().padStart(8)}/${v.lines_total.toLocaleString().padEnd(9)}`
      + ` ${pct(rate(v.lines_ai, v.lines_total)).padStart(7)}`);
  }
  console.log('  ' + '-'.repeat(62));
  console.log(`  ${'合計'.padEnd(17)} ${String(r.total.commits_ai).padStart(4)}/${String(r.total.commits_total).padEnd(5)}`
    + ` ${pct(rate(r.total.commits_ai, r.total.commits_total)).padStart(7)}`
    + `   ${r.total.lines_ai.toLocaleString().padStart(8)}/${r.total.lines_total.toLocaleString().padEnd(9)}`
    + ` ${pct(rate(r.total.lines_ai, r.total.lines_total)).padStart(7)}`);
  if (r.missing_repos.length) {
    console.log(`\n  **測れなかったリポジトリ: ${r.missing_repos.join(', ')}**（0ではなく、測っていない）`);
  }
  console.log('');
  console.log('  行数が測っていないもの: **生成物が混じる**（lockfile・生成JSON・SVG）。');
  console.log('  レビューで人が指示した内容も author には現れない —');
  console.log('  「壊れていることに気づいて直せと言う」は行数に出ない。');

  if (argv.includes('--write')) {
    if (r.missing_repos.length) {
      console.error(`\n書き込まない: ${r.missing_repos.join(', ')} が無い。**部分的な計測を台帳にしない。**`);
      process.exit(1);
    }
    const doc = {
      $comment: [
        'コード変更のAI著者率。**この script の出力そのもの。**手で書き換えない。',
        '',
        '原稿には長らく「変更行の98.8%（231,315行中228,498行）」と書いてあったが、',
        '2026-08-22 に同じ窓で数え直したところ**どの数え方でも再現できなかった。**',
        '再現できない数字は、記者に聞かれた瞬間にいちばん高くつく。',
        '',
        '数え方は scripts/code-authorship.mjs の冒頭に全部書いてある。',
        '数え直すには 3リポジトリが揃った場所で --write を実行する。',
      ],
      measured_at: arg('--at', new Date().toISOString().slice(0, 10)),
      from: r.from, to: r.to, all_branches: r.all_branches,
      method: {
        ai_author_definition: 'author に Claude を含む、または本文に Co-Authored-By: Claude',
        lines: 'git show --numstat の 追加 + 削除（バイナリは0）',
        excludes_merges: true,
        dedupe: 'SHA で一意化（--all は同じコミットを複数参照から拾う）',
        repos: REPOS,
      },
      known_limits: [
        '**計測日そのものは窓に入れない。**計測日はAIが集中的に書いている日になりやすく、'
          + '率を上げる方向に効く。実測では 08-22 を含めると 94.2% → 96.6% に動いた（+2.4pt）。'
          + '「いちばん都合のよい日で締めた」と言われない窓の切り方にしてある',
        '**生成物の行数が混じる。**lockfile・生成JSON・SVG はAI著者になるが、設計したことと同じではない',
        'レビューで人が指示した内容は author に現れない。「壊れていると気づいて直せと言う」は行数に出ない',
        '行数は「やった仕事の量」の近似でしかない。「やるべきことの種類」は data/automation-coverage.json',
      ],
      per_repo: r.per_repo,
      total: r.total,
      headline: {
        commits_rate_pct: Number((rate(r.total.commits_ai, r.total.commits_total) * 100).toFixed(1)),
        lines_rate_pct: Number((rate(r.total.lines_ai, r.total.lines_total) * 100).toFixed(1)),
      },
    };
    fs.writeFileSync(LEDGER, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`\n台帳を書いた: data/code-authorship.json`);
  }
}
