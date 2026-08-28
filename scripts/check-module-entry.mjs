#!/usr/bin/env node
/**
 * **export しているスクリプトが、import されたときに勝手に走らないことの検査。**
 *
 *   node scripts/check-module-entry.mjs            # 表示
 *   node scripts/check-module-entry.mjs --check    # CI
 *   node scripts/check-module-entry.mjs --selftest
 *
 * 【なぜ要るか — 2026-08-28 に実際に踏んだ】
 * `check-release-gate.mjs` は evaluateSubmission / evaluateRelease を export して
 * いるが、トップレベルで `process.argv` を読んで表示し、`--check` があれば
 * `process.exit()` する。ガードが無いので、**import した瞬間にそれが走る。**
 *
 * 実測（呼び出し側が `--check` を持っていた場合）:
 *
 *     $ node importer.mjs --check
 *     …門の要約が出る…
 *     importer の終了コード: 0        ← importer 自身のコードは1行も走っていない
 *
 * **黙って exit 0 する。**呼び出し側が検査なら、何も見ずに緑になる。
 * この台帳が繰り返し潰してきた fail-open と同じ形で、しかも
 * 「落ちる」ではなく「通る」側に倒れるぶん質が悪い。
 *
 * 【なぜ検査にするか】
 * 直した2本を直しただけでは、次に export を足した人がまた踏む。
 * リポジトリの他の52本は既にガードを持っていて、**慣習は最初からあった** ——
 * 守れていなかったのは 2026-08-28 に足した2本だけだった。
 * 散文で「気をつける」ではなく、形で止める。
 *
 * 【規則】
 * **export があり、かつトップレベルで process.argv / process.exit に触るなら、
 * isMain ガードが要る。** どちらか片方しか無いものは対象外:
 *   - export だけ（CLI なし）… import 専用。走るものが無い
 *   - CLI だけ（export なし）… 誰も import しない
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, run } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 走査対象。growth/scripts も CI から呼ばれるので含める。 */
const DIRS = ['scripts', 'scripts/lib', 'growth/scripts'];

/**
 * ガードの形。`process.argv[1]` を実パスに直して `import.meta.url` と比べる、
 * というのがこのリポジトリの慣習（52本が同じ書き方）。
 * **形を1つに縛らない** —— 判定は「argv[1] と import.meta.url の両方に触れて
 * いるか」で見る。書き方が違っても、その2つを突き合わせていれば通す。
 */
export function hasEntryGuard(src) {
  return /process\.argv\s*\[\s*1\s*\]/.test(src) && /import\.meta\.url/.test(src);
}

/** import されうるか（何かを export しているか）。 */
export function exportsSomething(src) {
  return /^\s*export\s+(function|const|let|class|default|\{)/m.test(src);
}

/**
 * ガードの外で `process.exit()` を呼ぶか。
 *
 * **見るのは exit だけ。**`const write = process.argv.includes('--write')` のように
 * argv を const へ読むだけなら、import されても何も起きない（出力もしないし
 * 止めもしない）。そこまで止めると、直す必要のないものを直すことになる。
 *
 * **`isMain` ブロックの中身は数えない。**ガード済みのコードを見つけて
 * 「CLI がある」と言うと、正しく直したものまで対象になる。
 */
export function hasTopLevelExit(src) {
  return /process\.exit\s*\(/.test(stripGuardedBlocks(src));
}

/**
 * `if (isMain) { … }` / `if (import.meta.url === …) { … }` の中身を落とす。
 * 波括弧を数えて対応を取る（正規表現では入れ子を取れない）。
 */
export function stripGuardedBlocks(src) {
  const re = /if\s*\(\s*(?:isMain|!?\s*import\.meta\.url)[^)]*\)\s*\{/g;
  let out = src;
  for (;;) {
    re.lastIndex = 0;
    const m = re.exec(out);
    if (!m) return out;
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < out.length && depth > 0) {
      if (out[i] === '{') depth += 1;
      else if (out[i] === '}') depth -= 1;
      i += 1;
    }
    // 対応する `}` が無い（切れたソース）ならそこで打ち切る。無限ループにしない。
    if (depth !== 0) return out.slice(0, m.index);
    out = out.slice(0, m.index) + out.slice(i);
  }
}

/** 1本ぶんの判定。問題があれば理由を返す。無ければ null。 */
export function inspect(src) {
  if (!exportsSomething(src)) return null;
  if (!hasTopLevelExit(src)) return null;
  if (hasEntryGuard(src)) return null;
  return 'export しているのに、ガードの外で process.exit() を呼んでいる'
    + ' — **import した側が黙って exit 0 する**';
}

export function listFiles(root = ROOT) {
  const files = [];
  for (const d of DIRS) {
    const dir = path.join(root, d);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.mjs')) continue;
      const p = path.join(dir, name);
      if (fs.statSync(p).isFile()) files.push(p);
    }
  }
  return files.sort();
}

export function validate(root = ROOT) {
  const problems = [];
  for (const p of listFiles(root)) {
    const why = inspect(fs.readFileSync(p, 'utf8'));
    if (why) problems.push(`${path.relative(root, p)}: ${why}`);
  }
  return problems;
}

// ============================================================

function selftest() {
  const GUARDED = `
import fs from 'node:fs';
export function evaluate(x) { return x; }
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) process.exit(1);
}
`;
  const UNGUARDED = `
export function evaluate(x) { return x; }
const args = process.argv.slice(2);
if (args.includes('--check')) process.exit(1);
`;
  const CLI_ONLY = `
const args = process.argv.slice(2);
if (args.includes('--check')) process.exit(1);
`;
  const LIB_ONLY = `
export function evaluate(x) { return x; }
export const K = 1;
`;

  const scenarios = [
    ['ガード済みは通る', () => {
      assert(inspect(GUARDED) === null, 'isMain があるのに落ちた');
    }],
    ['**ガード無しは落ちる**', () => {
      assert(inspect(UNGUARDED) !== null,
        'export + トップレベルCLI + ガード無し を見逃した — これが 2026-08-28 の実物');
    }],
    ['CLI だけなら対象外', () => {
      assert(inspect(CLI_ONLY) === null, '誰も import しないものを止めている');
    }],
    ['argv を読むだけなら対象外', () => {
      // 出力もせず exit もしないなら、import されても何も起きない。
      const inert = "export const K = 1;\nconst write = process.argv.includes('--write');\n";
      assert(inspect(inert) === null, 'argv を読むだけのものを止めている');
    }],
    ['export だけなら対象外', () => {
      assert(inspect(LIB_ONLY) === null, '走るものが無いのに止めている');
    }],
    ['isMain の中の process.exit は数えない', () => {
      // ガード済みの中身を数えてしまうと、正しく直したものが落ち続ける。
      assert(hasTopLevelExit(GUARDED) === false, 'isMain ブロックの中を数えている');
      assert(hasTopLevelExit(UNGUARDED) === true, 'ガード外の exit を見落とした');
    }],
    ['入れ子の波括弧でも対応が取れる', () => {
      const nested = `
export const K = 1;
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  for (const x of []) { if (x) { console.log({ a: 1 }); } }
  process.exit(0);
}
`;
      assert(hasTopLevelExit(nested) === false, '入れ子を抜けきれず、中の exit を拾った');
    }],
    ['対応する } が無くても止まる', () => {
      // 途中で切れたソースを渡しても無限ループにしない。
      const truncated = 'export const K = 1;\nconst isMain = process.argv[1] === fileURLToPath(import.meta.url);\nif (isMain) {\n  process.exit(0);';
      const t0 = Date.now();
      stripGuardedBlocks(truncated);
      assert(Date.now() - t0 < 1000, '打ち切れずに回り続けた');
    }],
    ['**実リポジトリが通る**', () => {
      const problems = validate();
      assert(problems.length === 0,
        `ガード無しが残っている:\n    ${problems.join('\n    ')}`);
    }],
    ['実ファイルを壊すと落ちる', () => {
      // 実物からガードを抜いた形が落ちることを、実データの上で確かめる。
      const real = fs.readFileSync(path.join(ROOT, 'scripts/check-pr-claims.mjs'), 'utf8');
      assert(inspect(real) === null, '実物が既に落ちている');
      const stripped = real.replace(/const isMain = [^\n]*\n/, 'const isMain = true;\n')
        .replace(/import\.meta\.url/g, "'x'");
      assert(inspect(stripped) !== null, 'ガードを抜いても落ちなかった — 検査が効いていない');
    }],
    ['走査が空でない', () => {
      // ディレクトリ名を間違えて0件を走査し、緑になる形を止める。
      assert(listFiles().length >= 40, `走査対象が ${listFiles().length} 本しかない`);
    }],
  ];
  return run(scenarios, { label: 'モジュール入口' });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) {
    process.exit(selftest() === 0 ? 0 : 1);
  } else {
    const files = listFiles();
    const problems = validate();
    console.log('モジュール入口 — export したものが import で勝手に走らないか\n');
    console.log(`  走査          ${files.length} 本`);
    console.log(`  ガード付き    ${files.filter((p) => hasEntryGuard(fs.readFileSync(p, 'utf8'))).length} 本`);
    console.log(`  問題          ${problems.length} 本`);
    if (problems.length) {
      console.log('\n落ちた:');
      for (const x of problems) console.log(`  - ${x}`);
      console.log('\n直し方: exit を呼ぶブロックを次で囲む。');
      console.log("  const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);");
      console.log('  if (isMain) { … }');
    }
    if (args.includes('--check')) process.exit(problems.length ? 1 : 0);
  }
}
