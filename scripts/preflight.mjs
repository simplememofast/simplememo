#!/usr/bin/env node
/**
 * Local checks derived from .github/workflows/seo-check.yml.
 *
 *   node scripts/preflight.mjs [--list] [--only <filter>]
 *   node scripts/preflight.mjs --selftest
 *
 * Node, Python and grouped node --test commands retain their interpreter,
 * arguments and ordering. Conditional steps, shell compositions and variables
 * are reported rather than executed. Unknown syntax and empty selections fail.
 * Generators run only in a disposable committed copy beside the repository.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runChecks } from './lib/preflight-runner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = path.join(ROOT, '.github/workflows/seo-check.yml');

/**
 * 実行行の形。**インタプリタも取り出す** —— `node` だけを回していたころ、
 * `python3 scripts/generate_sitemap.py --check` は「対象外」として表に出しつつ
 * 一度も回していなかった。2026-09-03 に台帳（check-selftests.mjs）が python を
 * 列挙するようになったので、鏡もここで合わせる。
 * **1か所だけ直すと、鏡が古い版を映し続ける。**
 */
const RUN_RE = /^(node|python3)\s+((?:scripts|growth\/(?:scripts|queries))\/[A-Za-z0-9_.-]+\.(?:m?js|py))(?:\s+(.*))?$/;

// Keep node's test-runner flag and file grouping intact. Only explicit local
// test files are accepted here; unknown options/paths still fail the audit.
const TEST_FILE_RE = /^(?:scripts|growth\/lib)\/[A-Za-z0-9_.-]+\.test\.mjs$/;
export function parseCommand(line) {
  const words = line.trim().split(/\s+/);
  if (words[0] === 'node' && words[1] === '--test') {
    const files = words.slice(2);
    return files.length && files.every((file) => TEST_FILE_RE.test(file))
      ? { runner: 'node', script: '--test', args: files } : null;
  }
  if (words[0] === 'node' && words.length === 2 && TEST_FILE_RE.test(words[1])) {
    return { runner: 'node', script: words[1], args: [] };
  }
  const m = line.match(RUN_RE);
  if (!m) return null;
  const args = m[3]?.trim() || '';
  if (!/^[A-Za-z0-9_./:=,+@%\s-]*$/.test(args)) return null;
  return { runner: m[1], script: m[2], args: args === '' ? [] : args.split(/\s+/) };
}

/** Shared classification keeps extraction and audit in agreement. */
function* workflowCommands(yamlText) {
  let stepHasIf = false;
  for (const raw of String(yamlText ?? '').split('\n')) {
    let line = raw.trim();
    if (line.startsWith('- ')) { stepHasIf = false; line = line.slice(2).trim(); }
    if (/^if:\s/.test(line)) { stepHasIf = true; continue; }
    const inline = line.match(/^run:\s+(.+)$/);
    if (inline) line = inline[1].trim();
    if (!/^(node|python3|npx)(?:\s|$)/.test(line)) continue;
    if (/[|&;><]/.test(line)) { yield { kind: 'composed', line }; continue; }
    if (/\$|`/.test(line)) { yield { kind: 'variable', line }; continue; }
    if (stepHasIf) { yield { kind: 'conditional', line }; continue; }
    const command = parseCommand(line);
    if (command) yield { kind: 'taken', line, command };
    else yield { kind: /^npx\s/.test(line) ? 'out_of_scope' : 'unknown', line };
  }
}

export function extractCommands(yamlText) {
  const out = [];
  const seen = new Set();
  for (const entry of workflowCommands(yamlText)) {
    if (entry.kind !== 'taken') continue;
    const key = JSON.stringify(entry.command);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(entry.command);
    }
  }
  return out;
}

export function auditExtraction(yamlText) {
  const dropped = { composed: [], variable: [], conditional: [], out_of_scope: [], unknown: [] };
  let taken = 0;
  for (const entry of workflowCommands(yamlText)) {
    if (entry.kind === 'taken') taken += 1;
    else dropped[entry.kind].push(entry.line);
  }
  return { taken, dropped };
}

// **import されたときに走らせない。**export しているものを import した側が
// `--check` を持っていると、ここが `process.exit()` を呼んで
// **呼び出し側のコードを1行も走らせずに exit 0 する**（2026-08-28 に実測）。
// 検査は scripts/check-module-entry.mjs。
/**
 * **導出そのものを固定する。**
 *
 * この道具が壊れる形は毎回同じ —— **拾えなくなるだけなので、残りが全部通れば緑になる。**
 * 実際に2回起きている:
 *   - 2026-09-01: 1行形式の `run: node ...` を拾わず、CI 108 本のうち 47 本（43%）を
 *     落としたまま「61 本中 N 本失敗」と出していた
 *   - 2026-09-03: `.mjs` しか拾わず、`seo-check.js` など 8 本を落としていた
 *     （data/autopilot-actions.json#act-ci-selftest-ratchet-js-blind と同じ形）
 *
 * どちらも症状に出ない。だから**境界を検体で留めておく。**
 */
function selftest() {
  const cases = [];
  const t = (name, fn) => cases.push([name, fn]);
  const yaml = (...lines) => lines.join('\n');
  const names = (text) => extractCommands(text).map((c) => `${c.script} ${c.args.join(' ')}`.trim());

  t('1行形式の run: を拾う（2026-09-01 まで 47 本落としていた）', () => {
    const got = names(yaml('      - name: x', '        run: node scripts/a.mjs --check'));
    assertEq(got.join(), 'scripts/a.mjs --check');
  });
  t('ブロック形式も拾う', () => {
    const got = names(yaml('      - name: x', '        run: |', '          node scripts/b.mjs'));
    assertEq(got.join(), 'scripts/b.mjs');
  });
  t('**`.js` も拾う**（2026-09-03 まで主検査を落としていた）', () => {
    const got = names(yaml('      - name: x', '        run: node scripts/seo-check.js --selftest'));
    assertEq(got.join(), 'scripts/seo-check.js --selftest');
  });
  t('growth/scripts も拾う', () => {
    const got = names(yaml('        run: node growth/scripts/c.mjs --check'));
    assertEq(got.join(), 'growth/scripts/c.mjs --check');
  });
  t('growth/queries の実SQL検体も実行対象へ入れる', () => {
    const text = yaml('        run: python3 growth/queries/voice-shift-v2.test.py');
    const got = extractCommands(text);
    assertEq(got.length, 1);
    assertEq(`${got[0].runner} ${got[0].script}`, 'python3 growth/queries/voice-shift-v2.test.py');
    assertEq(auditExtraction(text).taken, 1);
    assertEq(auditExtraction(text).dropped.unknown.length, 0);
  });
  // 手元で回すと検査ではなく**副作用**になる。IndexNow の実送信がこれ。
  t('**`if:` 付きのステップは取らない**（手元では意味が違う）', () => {
    const text = yaml('      - name: x', "        if: github.ref == 'refs/heads/main'",
      '        run: node scripts/d.js --since 1');
    assertEq(names(text).join(), '');
    assertEq(auditExtraction(text).dropped.conditional.join(), 'node scripts/d.js --since 1');
  });
  t('`if:` は次のステップへ漏れない', () => {
    const text = yaml('      - name: x', "        if: github.ref == 'refs/heads/main'",
      '        run: node scripts/d.mjs', '      - name: y', '        run: node scripts/e.mjs');
    assertEq(names(text).join(), 'scripts/e.mjs');
  });
  t('合成された行は取らない', () => {
    assertEq(names(yaml('        run: |', '          node scripts/f.mjs || EXIT=$?')).join(), '');
  });
  t('変数を含む行は取らない', () => {
    assertEq(names(yaml('        run: node scripts/g.mjs --x ${{ github.sha }}')).join(), '');
  });
  t('同じ script+args は1本にまとめる', () => {
    const text = yaml('        run: node scripts/h.mjs --check', '        run: node scripts/h.mjs --check');
    assertEq(names(text).length, 1);
  });
  // **台帳が python を列挙するようになったら、鏡もここで合わせる。**
  // 2026-09-03 まで python は「対象外」として表に出しつつ一度も回していなかった。
  t('**python の検査も回す**（2026-09-03 まで対象外にしていた）', () => {
    const text = yaml('      - name: x', '        run: python3 scripts/generate_sitemap.py --check');
    const got = extractCommands(text);
    assertEq(got.length, 1);
    assertEq(`${got[0].runner} ${got[0].script} ${got[0].args.join(' ')}`,
      'python3 scripts/generate_sitemap.py --check');
  });
  t('インタプリタを取り違えない（node の行は node で回す）', () => {
    const got = extractCommands(yaml('        run: node scripts/a.mjs'));
    assertEq(got[0].runner, 'node');
  });
  t('growth/lib の直接実行テストを拾う', () => {
    const text = yaml('        run: node growth/lib/x.test.mjs');
    assertEq(names(text).join(), 'growth/lib/x.test.mjs');
    assertEq(auditExtraction(text).taken, 1);
  });
  t('node --test の複数ファイルを同じコマンドとして実行する', () => {
    const text = yaml('        run: node --test scripts/a.test.mjs growth/lib/b.test.mjs');
    const got = extractCommands(text);
    assertEq(JSON.stringify(got), JSON.stringify([
      { runner: 'node', script: '--test', args: ['scripts/a.test.mjs', 'growth/lib/b.test.mjs'] },
    ]));
    assertEq(auditExtraction(text).taken, 1);
  });
  t('node --test の未知の引数・パスを対象外扱いで隠さない', () => {
    for (const command of [
      'node --test', 'node --test tools/a.test.mjs',
      'node --test scripts/a.test.mjs --watch',
      'node --test scripts/a.test.mjs growth/lib/../send.mjs',
      'node growth/lib/production.mjs',
    ]) {
      const text = yaml(`        run: ${command}`);
      assertEq(extractCommands(text).length, 0);
      assertEq(auditExtraction(text).dropped.unknown.length, 1);
    }
  });
  t('テスト形式でも条件付き・合成・変数を実行しない', () => {
    for (const [text, reason] of [
      [yaml('      - name: x', '        if: inputs.run', '        run: node --test scripts/a.test.mjs'), 'conditional'],
      ['run: node --test scripts/a.test.mjs || true', 'composed'],
      ['run: node --test scripts/a.test.mjs $TEST_FILES', 'variable'],
    ]) {
      assertEq(extractCommands(text).length, 0);
      assertEq(auditExtraction(text).dropped[reason].length, 1);
    }
  });
  t('実CLI: 後ろのテストファイルの失敗でも一括検証を失敗させる', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-node-test-'));
    try {
      fs.mkdirSync(path.join(dir, 'scripts'));
      fs.mkdirSync(path.join(dir, '.github/workflows'), { recursive: true });
      fs.copyFileSync(fileURLToPath(import.meta.url), path.join(dir, 'scripts/preflight.mjs'));
      fs.mkdirSync(path.join(dir, 'scripts/lib'));
      fs.copyFileSync(path.join(ROOT, 'scripts/lib/preflight-runner.mjs'), path.join(dir, 'scripts/lib/preflight-runner.mjs'));
      fs.writeFileSync(path.join(dir, '.github/workflows/seo-check.yml'),
        'run: node --test scripts/first.test.mjs scripts/second.test.mjs\n');
      const first = path.join(dir, 'scripts/first.test.mjs');
      const second = path.join(dir, 'scripts/second.test.mjs');
      fs.writeFileSync(first, 'import { test } from "node:test"; test("first", () => {});\n');
      fs.writeFileSync(second, 'import { test } from "node:test"; test("second", () => { throw new Error("fixture failure"); });\n');
      const run = () => spawnSync(process.execPath, ['scripts/preflight.mjs'], { cwd: dir, encoding: 'utf8' });
      const failed = run();
      assertEq(failed.status, 1);
      if (!failed.stdout.includes('1 本中 1 本失敗')) throw new Error(failed.stdout + failed.stderr);
      fs.writeFileSync(second, 'import { test } from "node:test"; test("second", () => {});\n');
      const passed = run();
      assertEq(passed.status, 0);
      if (!passed.stdout.includes('1 本中 0 本失敗')) throw new Error(passed.stdout + passed.stderr);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  t('npx は対象外', () => {
    const d = auditExtraction(yaml('        run: npx playwright test')).dropped;
    assertEq(d.out_of_scope.join(), 'npx playwright test');
  });
  t('実CLI: 鏡を作れないときは生成器を本物の木で実行せず失敗する', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-mirror-failure-'));
    try {
      fs.mkdirSync(path.join(dir, 'scripts'));
      fs.mkdirSync(path.join(dir, '.github/workflows'), { recursive: true });
      fs.copyFileSync(fileURLToPath(import.meta.url), path.join(dir, 'scripts/preflight.mjs'));
      fs.mkdirSync(path.join(dir, 'scripts/lib'));
      fs.copyFileSync(path.join(ROOT, 'scripts/lib/preflight-runner.mjs'), path.join(dir, 'scripts/lib/preflight-runner.mjs'));
      fs.writeFileSync(path.join(dir, '.github/workflows/seo-check.yml'),
        'run: node scripts/check-generators.mjs --run\nrun: node scripts/seo-check.js\n');
      fs.writeFileSync(path.join(dir, 'scripts/check-generators.mjs'),
        'import fs from "node:fs"; fs.writeFileSync("generator-ran", "changed original tree");\n');
      fs.writeFileSync(path.join(dir, 'scripts/seo-check.js'),
        'require("node:fs").writeFileSync("later-check-ran", "checked");\n');
      const run = () => spawnSync(process.execPath, ['scripts/preflight.mjs'], { cwd: dir, encoding: 'utf8' });
      const refused = () => {
        const result = run();
        assertEq(fs.existsSync(path.join(dir, 'generator-ran')), false);
        assertEq(result.status, 1);
        if (!result.stdout.includes('2 本中 1 本失敗')) throw new Error(result.stdout + result.stderr);
        assertEq(fs.existsSync(path.join(dir, 'later-check-ran')), true);
        fs.unlinkSync(path.join(dir, 'later-check-ran'));
      };
      refused(); // No Git repository: makeMirror cannot list the files.
      const git = args => {
        const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
        assertEq(result.status, 0);
      };
      git(['init', '-q']);
      git(['add', '-A']);
      git(['-c', 'user.email=preflight@local', '-c', 'user.name=preflight', 'commit', '-qm', 'fixture']);
      fs.symlinkSync(path.join(dir, 'scripts'), path.join(dir, 'directory-link'), 'dir');
      refused(); // The untracked directory symlink cannot be copied as a file.
      fs.unlinkSync(path.join(dir, 'directory-link'));
      const passed = run();
      assertEq(passed.status, 0);
      assertEq(fs.existsSync(path.join(dir, 'generator-ran')), false); // Ran only in the disposable mirror.
      assertEq(fs.existsSync(path.join(dir, 'later-check-ran')), true);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  // **見たことのない書き方は「たぶん要らない」ではなく「まだ分かっていない」。**
  // **見たことのない書き方は「たぶん要らない」ではなく「まだ分かっていない」。**
  // 既知の除外を広げすぎると、ここが構造的に到達不能になる（実際に一度そうした）。
  t('分類できない実行行は unknown に落ちる（＝緑にしない）', () => {
    assertEq(auditExtraction(yaml('        run: node tools/j.mjs')).dropped.unknown.length, 1);
  });
  t('python でも scripts/ の外なら unknown', () => {
    assertEq(auditExtraction(yaml('        run: python3 tools/j.py')).dropped.unknown.length, 1);
  });
  t('実データ: 取りこぼしの分類に unknown が無い', () => {
    const d = auditExtraction(fs.readFileSync(WORKFLOW, 'utf8')).dropped;
    assertEq(d.unknown.join(' / '), '');
  });
  t('実データ: 1本も拾えない、が起きていない', () => {
    const n = extractCommands(fs.readFileSync(WORKFLOW, 'utf8')).length;
    if (!(n > 100)) throw new Error(`導出が ${n} 本しかない — 壊れている可能性`);
  });

  let failed = 0;
  for (const [name, fn] of cases) {
    try { fn(); console.log(`  ok   ${name}`); }
    catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
  }
  console.log(`\n  自己テスト ${cases.length} 件中 ${failed} 件失敗`);
  return failed === 0 ? 0 : 1;
}

function assertEq(got, want) {
  if (got !== want) throw new Error(`got ${JSON.stringify(got)} / want ${JSON.stringify(want)}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
const argv = process.argv.slice(2);
if (argv.includes('--selftest')) process.exit(selftest());
let only = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--list') continue;
  if (argv[i] === '--only' && argv[i + 1] && !argv[i + 1].startsWith('--')) {
    only = argv[++i];
    continue;
  }
  console.error(`不正な引数: ${argv[i]} — --list / --only <filter> を指定してください`);
  process.exit(2);
}

let workflow;
let cmds;
try {
  workflow = fs.readFileSync(WORKFLOW, 'utf8');
  cmds = extractCommands(workflow);
} catch (e) {
  console.error(`ワークフローが読めない: ${WORKFLOW}\n${e.message}`);
  process.exit(2);
}
if (cmds.length === 0) {
  // **0本を「全部通った」と出さない。**導出が壊れたときに緑になるのが一番まずい
  console.error('ワークフローから1本も拾えなかった — 導出が壊れている');
  process.exit(2);
}
// **取らなかった行を先に出す。**本数が減っただけの導出は、残りが全部通れば
// 緑になる（2026-09-01 まで47本を落としたまま緑を出していた）。
{
  const audit = auditExtraction(workflow);
  const d = audit.dropped;
  const n = d.composed.length + d.variable.length + d.conditional.length
    + d.out_of_scope.length + d.unknown.length;
  if (n > 0) {
    console.log(`導出で取らなかった ${n} 行（理由つき。**黙って減らさない**）:`);
    const show = (label, xs) => {
      for (const x of xs) console.log(`  ${label}  ${x}`);
    };
    show('合成    ', d.composed);
    show('変数    ', d.variable);
    show('条件付き', d.conditional);
    show('対象外  ', d.out_of_scope);
    show('**不明**', d.unknown);
    console.log('');
  }
  if (d.unknown.length) {
    // 見たことのない書き方は「たぶん要らない」ではなく「まだ分かっていない」。
    console.error('導出が分類できない実行行がある — 緑にしない');
    process.exit(2);
  }
}
if (only !== null) cmds = cmds.filter((c) => `${c.script} ${c.args.join(' ')}`.includes(only));
if (cmds.length === 0) {
  console.error(`条件に一致する検査がありません: ${only}`);
  process.exit(2);
}

if (argv.includes('--list')) {
  for (const c of cmds) console.log(`${c.runner ?? 'node'} ${c.script} ${c.args.join(' ')}`.trim());
  console.log(`\n${cmds.length} 本（.github/workflows/seo-check.yml から導出）`);
  process.exit(0);
}

console.log(`CI から導出した ${cmds.length} 本のローカル検査を回す\n`);
const failed = runChecks(cmds, { root: ROOT });

console.log(`\n${cmds.length} 本中 ${failed.length} 本失敗`);
for (const f of failed) {
  console.log(`\n--- ${f.label} ---`);
  console.log(f.out.split('\n').slice(-12).join('\n'));
}
if (failed.length) {
  console.log('\n**手元で落ちるものもここに出る。**外部の資格情報や BigQuery が要るものは');
  console.log('手元では通らないが、**それを skip に分類して黙らせていない** ——');
  console.log('分類を持つと、本当に落ちたものがそこに紛れる。');
}
process.exit(failed.length ? 1 : 0);
}
