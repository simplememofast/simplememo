#!/usr/bin/env node
/**
 * コード変更のAI著者率 — **数え方を script にして、聞かれたら渡せる形にする。**
 *
 *   node scripts/code-authorship.mjs                       # 既定の窓で数える
 *   node scripts/code-authorship.mjs --from 2026-08-11 --to 2026-08-22
 *   node scripts/code-authorship.mjs --write               # 台帳を更新（見出しの窓）
 *   node scripts/code-authorship.mjs --write-window --from 2026-08-11 --to 2026-09-01
 *                                                          # 見出しとは別の窓を windows[] に足す／更新する
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
 * - AI著者 … `author` に Claude / Codex を含む、または本文に `Co-Authored-By: Claude` / `Co-Authored-By: Codex`、
 *   または本文に Claude Code の足跡（`Generated with [Claude Code]` / セッション URL / `Claude-Session:`）— 定義 v3（2026-09-04）
 *   過去の台帳は当時の定義を保持し、新しい計測には使用した定義を記録する。
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
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER = path.join(ROOT, 'data/code-authorship.json');
const REPOS = ['simplememo', 'simplememo-api', 'simplememo-ios'];

const AI_AUTHOR = /claude|\bcodex\b/i;
const AI_TRAILER = /^Co-Authored-By:[ \t]*(?:Claude|Codex(?:[ \t<]|$))/im;
export const AUTHOR_METHOD = {
  definition_version: 3,
  ai_author_definition: 'author に Claude / Codex を含む、または本文に Co-Authored-By: Claude / Co-Authored-By: Codex、または本文に Claude Code の足跡（Generated with [Claude Code] / claude.ai/code/session / Claude-Session:）。定義 v3（2026-09-04。v2 に Codex の署名とトレーラーを追加）',
};
/**
 * [2026-09-02] 定義 v2。**PR 本文の末尾に付く機械の足跡**も AI 著者の印に数える。
 * GitHub の squash マージはコミット本文に PR 本文を写すが、Claude Code が作る PR 本文の末尾は
 * 「🤖 Generated with [Claude Code]」とセッション URL であって Co-Authored-By ではない。
 * v1（署名とトレーラーだけ）ではそれが人側に落ちる。8/11〜9/1 の実測では v1 と v2 の値は
 * 一致した（足跡を持つ squash コミットがまだ無かった）ので、公開値は動いていない。
 * 手で書ける印なので「厳密に AI が書いた」証明ではないが、**申告の無いコミットを人側に数える**
 * 方針は変えない —— 申告の書式を1つ増やしただけ。
 */
const AI_FOOTPRINT = /Generated with \[Claude Code\]|claude\.ai\/code\/session|^Claude-Session:/im;

export function isAiAuthoredCommit({ author = '', body = '' }) {
  return AI_AUTHOR.test(author) || AI_TRAILER.test(body) || AI_FOOTPRINT.test(body);
}

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
    const isAI = isAiAuthoredCommit(c);
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
  //
  // [2026-08-26] ここは `doc.headline && doc.headline.lines_rate_pct !== undefined &&`
  // だった。**headline の鍵を消すと突き合わせが丸ごと消える**（実測: 消して --check
  // → exit 0）。この率（94.2%）は index.html / en/index.html / /autopilot/ と
  // 配信原稿が引いている数字で、**正を消せば公開面が野放しになる。**
  // #635 の `READY !== undefined &&` と同じ形。
  if (!doc.headline || doc.headline.lines_rate_pct === undefined) {
    problems.push('headline.lines_rate_pct が無い — **公開面が引く数字の正が消える。**'
      + `実測は ${Number((rate(sum.lines_ai, sum.lines_total) * 100).toFixed(1))}%`);
  } else {
    const want = Number((rate(sum.lines_ai, sum.lines_total) * 100).toFixed(1));
    if (Math.abs(doc.headline.lines_rate_pct - want) > 0.05) {
      problems.push(`headline.lines_rate_pct ${doc.headline.lines_rate_pct}% が実測 ${want}% と違う`);
    }
  }
  // [2026-09-02] 見出しの窓（8/11〜8/21）とは別の窓も台帳に持つ。原稿が「同期間」と書いて
  // 別の窓の値を引いた事故の再発防止 —— **原稿に出る率は、どれかの窓の値でなければならない**
  // （突き合わせは check-autopilot-page.mjs）。ここは各窓の算数だけを見る。
  for (const [i, w] of (doc.windows ?? []).entries()) {
    const at = `windows[${i}]`;
    if (!w || typeof w !== 'object') { problems.push(`${at}: object でない`); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w.from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(w.to ?? '')) problems.push(`${at}: from / to が YYYY-MM-DD でない`);
    if (!w.measured_at) problems.push(`${at}: measured_at が無い（同じ窓でも後から数えると絶対数が動く）`);
    const ws = Object.values(w.per_repo || {}).reduce((a, b) => ({
      commits_total: a.commits_total + b.commits_total, commits_ai: a.commits_ai + b.commits_ai,
      lines_total: a.lines_total + b.lines_total, lines_ai: a.lines_ai + b.lines_ai,
    }), { commits_total: 0, commits_ai: 0, lines_total: 0, lines_ai: 0 });
    for (const k of Object.keys(ws)) {
      if (w.total?.[k] !== ws[k]) problems.push(`${at}: total.${k} が内訳の合計と一致しない`);
    }
    if (ws.commits_ai > ws.commits_total || ws.lines_ai > ws.lines_total) problems.push(`${at}: AI分が合計を超えている`);
    const wc = Number((rate(ws.commits_ai, ws.commits_total) * 100).toFixed(1));
    const wl = Number((rate(ws.lines_ai, ws.lines_total) * 100).toFixed(1));
    if (w.rates?.commits_rate_pct !== wc) problems.push(`${at}: rates.commits_rate_pct ${w.rates?.commits_rate_pct} が実測 ${wc} と違う`);
    if (w.rates?.lines_rate_pct !== wl) problems.push(`${at}: rates.lines_rate_pct ${w.rates?.lines_rate_pct} が実測 ${wl} と違う`);
  }
  return problems;
}

/** 台帳が持つすべての率（見出し＋窓）。公開面の突き合わせが使う。 */
export function knownRates(doc) {
  const out = [];
  if (doc?.headline) out.push({ window: `${doc.from}〜${doc.to}`, commits: doc.headline.commits_rate_pct, lines: doc.headline.lines_rate_pct });
  for (const w of doc?.windows ?? []) out.push({ window: `${w.from}〜${w.to}`, commits: w.rates?.commits_rate_pct, lines: w.rates?.lines_rate_pct });
  return out;
}


// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const SELFTEST_BREAKAGES = [
  ['**合計が内訳と一致しない**のは落ちる', (d) => { const k = Object.keys(d.total)[0]; d.total[k] = (d.total[k] || 0) + 12345; }],
  // [2026-08-26] **正を消すと突き合わせも消える形**を固定する。
  // 消して --check したら exit 0 だった（この率は公開面が引いている）。
  ['**見出しの率の鍵を消すと落ちる**（正が無いのを「合っている」と読まない）',
    (d) => { delete d.headline; }],
  ['見出しの率が実測とずれれば落ちる', (d) => { d.headline.lines_rate_pct = 99.9; }],
  ['**窓の率が実測とずれれば落ちる**（「同期間」に別の窓の値を引いた事故を台帳側で止める）', (d) => {
    if (!d.windows?.length) throw new Error('検体に windows が無い — --write-window で1つ入れてから');
    d.windows[0].rates.commits_rate_pct = 99.5;
  }],
  ['窓の合計が内訳と一致しなければ落ちる', (d) => {
    if (!d.windows?.length) throw new Error('検体に windows が無い');
    d.windows[0].total.commits_total += 7;
  }],
];
const SCENARIOS = [...ledgerScenarios(
  () => JSON.parse(fs.readFileSync(LEDGER, 'utf8')),
  (d) => validateLedger(d),
  SELFTEST_BREAKAGES,
),
  ['Codex の署名・トレーラーを AI と数える', () => {
    assert(isAiAuthoredCommit({ author: 'Codex <noreply@openai.com>' }), 'Codex author');
    assert(isAiAuthoredCommit({ body: 'Fix delivery\n\nCo-Authored-By: Codex <noreply@openai.com>' }), 'Codex trailer');
    assert(isAiAuthoredCommit({ body: 'co-authored-by: codex <noreply@openai.com>' }), 'case insensitive');
  }],
  ['Claude の署名・トレーラー・足跡は従来どおり', () => {
    assert(isAiAuthoredCommit({ author: 'Claude <noreply@anthropic.com>' }), 'Claude author');
    for (const body of ['Co-Authored-By: Claude Code <noreply@anthropic.com>',
      'Generated with [Claude Code]', 'https://claude.ai/code/session/example', 'Claude-Session: example']) {
      assert(isAiAuthoredCommit({ body }), body);
    }
  }],
  ['本文での言及・似た名前・人の申告を AI と誤認しない', () => {
    for (const commit of [{ body: 'Fix the Codex integration' }, { body: 'Author-Role: human' },
      { author: 'Codexity <alice@example.com>' }, { body: 'Co-Authored-By: Codexity <alice@example.com>' }, {}]) {
      assert(!isAiAuthoredCommit(commit), JSON.stringify(commit));
    }
  }],
  ['実際の git 履歴のコミット数と変更行へ Codex 判定が反映される', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-authorship-'));
    try {
      const env = { ...process.env, GIT_AUTHOR_NAME: 'Alice', GIT_AUTHOR_EMAIL: 'alice@example.com',
        GIT_COMMITTER_NAME: 'Alice', GIT_COMMITTER_EMAIL: 'alice@example.com',
        GIT_AUTHOR_DATE: '2026-09-01T12:00:00Z', GIT_COMMITTER_DATE: '2026-09-01T12:00:00Z' };
      const git = (args, extra = {}) => execFileSync('git', args, { cwd: dir, env: { ...env, ...extra }, stdio: 'pipe' });
      git(['init', '-q']);
      const commits = [
        ['Codex author', { GIT_AUTHOR_NAME: 'Codex' }],
        ['Fix\n\nCo-Authored-By: Codex <noreply@openai.com>', {}],
        ['Fix\n\nCo-Authored-By: Claude <noreply@anthropic.com>', {}],
        ['Fix\n\nAuthor-Role: human', {}],
        ['Document Codex usage', {}],
      ];
      for (const [i, [body, author]] of commits.entries()) {
        fs.writeFileSync(path.join(dir, `${i}.txt`), 'one line\n');
        git(['add', `${i}.txt`]);
        git(['-c', 'commit.gpgsign=false', 'commit', '-qm', body], author);
      }
      const got = measureRepo(dir, { from: '2026-09-01', to: '2026-09-01' });
      assert(got.commits_total === 5 && got.commits_ai === 3, JSON.stringify(got));
      assert(got.lines_total === 5 && got.lines_ai === 3, JSON.stringify(got));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }],
];

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

  if (argv.includes('--write-window')) {
    if (r.missing_repos.length) {
      console.error(`\n書き込まない: ${r.missing_repos.join(', ')} が無い。**部分的な計測を台帳にしない。**`);
      process.exit(1);
    }
    if (!stored) { console.error('data/code-authorship.json が無い — 先に --write'); process.exit(1); }
    const entry = {
      measured_at: arg('--at', new Date().toISOString().slice(0, 10)),
      method: { ...AUTHOR_METHOD },
      from: r.from, to: r.to, all_branches: r.all_branches,
      per_repo: r.per_repo, total: r.total,
      rates: {
        commits_rate_pct: Number((rate(r.total.commits_ai, r.total.commits_total) * 100).toFixed(1)),
        lines_rate_pct: Number((rate(r.total.lines_ai, r.total.lines_total) * 100).toFixed(1)),
      },
      why: arg('--why', ''),
    };
    stored.windows = (stored.windows ?? []).filter((w) => !(w.from === entry.from && w.to === entry.to));
    stored.windows.push(entry);
    stored.windows.sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));
    stored.$windows_note ??= '見出し（from/to/headline）とは別の窓。原稿に出る率はここか見出しの値でなければならない（check-autopilot-page.mjs が突き合わせる）。同じ窓を --write-window し直すと上書きされる';
    fs.writeFileSync(LEDGER, `${JSON.stringify(stored, null, 2)}\n`);
    console.log(`\n窓を台帳に書いた: ${entry.from}〜${entry.to}（コミット ${entry.rates.commits_rate_pct}% / 変更行 ${entry.rates.lines_rate_pct}%）`);
    process.exit(0);
  }

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
        ...AUTHOR_METHOD,
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
