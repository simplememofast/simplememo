#!/usr/bin/env node
/**
 * **CI が走らせるものを、手元で同じだけ回す。**
 *
 *   node scripts/preflight.mjs            # 全部
 *   node scripts/preflight.mjs --list     # 何を回すかだけ出す
 *   node scripts/preflight.mjs --only pub # 名前で絞る
 *
 * 【なぜ要るか — 2026-08-28 に実際に踏んだ】
 * 出荷の門（check-release-gate）を作ったとき、**手で9本選んで回して出した。**
 * CI は73本回していて、その中の `check-publication` が落ちた ——
 * 公開リポジトリに新しいデータファイルを足したのに、公開してよいかを
 * 分類していなかった。**データファイルを足したコミットで、データファイルに
 * 効く検査を回していなかった。**
 *
 * 【一覧を手で持たない】
 * **`.github/workflows/seo-check.yml` から導く。**手で持つと、CI に検査を足した
 * 日にここが古くなり、「手元で通ったのにCIで落ちる」が戻ってくる。
 * 導出なので、CI に1本足せばここも1本増える。
 *
 * 【手元でだけ落ちるものがある — 2026-08-28 の実測】
 * `check-generators --run` は `data/financial-policy.json` と
 * `data/revenue-series.json` が再生成で変わると言う。**これは main でも同じ**
 * （origin/main の当該2ファイルへ戻して確かめた）。CI では通っているので、
 * 生成器の出力がこの環境と CI で違う。**私の変更で増えたものではない。**
 *
 * **それでも skip の一覧は作らない。**下の理由のとおり。
 * 実行した人は「53本中1本、しかも既知の1本」を読めばよく、
 * 2本目が増えた日には数が変わって気づける。
 *
 * 【落ちたものを隠さない】
 * 手元では通らないもの（外部の資格情報や BigQuery が要るもの）もある。
 * **それを「skip」に分類して黙らせない** —— 落ちたものは落ちたものとして出し、
 * 何が要るかは実行した人が読む。分類を持つと、**本当に落ちたものがそこに紛れる。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = path.join(ROOT, '.github/workflows/seo-check.yml');

/**
 * ワークフローから `node <script> <args>` の行を拾う。**純関数。**
 *
 * 行頭の空白と `-` を落としてから見る（YAML のブロック内なので字下げがある）。
 * `&&` や `|` でつながった行は**取らない** —— 手元で意味が変わりうるものを
 * 黙って走らせない。
 */
export function extractCommands(yamlText) {
  const out = [];
  for (const raw of String(yamlText ?? '').split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('node ')) continue;
    if (/[|&;><]/.test(line)) continue;          // 合成された行は取らない
    if (/\$\{\{|\$[A-Z_]/.test(line)) continue;  // 変数を含む行は手元で意味が変わる
    const m = line.match(/^node\s+((?:scripts|growth\/scripts)\/[A-Za-z0-9_.-]+\.mjs)(.*)$/);
    if (!m) continue;
    const args = m[2].trim();
    out.push({ script: m[1], args: args === '' ? [] : args.split(/\s+/) });
  }
  // 同じ script+args は1回だけ
  const seen = new Set();
  return out.filter((c) => {
    const k = `${c.script} ${c.args.join(' ')}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// **import されたときに走らせない。**export しているものを import した側が
// `--check` を持っていると、ここが `process.exit()` を呼んで
// **呼び出し側のコードを1行も走らせずに exit 0 する**（2026-08-28 に実測）。
// 検査は scripts/check-module-entry.mjs。
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
const argv = process.argv.slice(2);
const only = (() => {
  const i = argv.indexOf('--only');
  return i >= 0 ? argv[i + 1] : null;
})();

let cmds;
try {
  cmds = extractCommands(fs.readFileSync(WORKFLOW, 'utf8'));
} catch (e) {
  console.error(`ワークフローが読めない: ${WORKFLOW}\n${e.message}`);
  process.exit(2);
}
if (cmds.length === 0) {
  // **0本を「全部通った」と出さない。**導出が壊れたときに緑になるのが一番まずい
  console.error('ワークフローから1本も拾えなかった — 導出が壊れている');
  process.exit(2);
}
if (only) cmds = cmds.filter((c) => `${c.script} ${c.args.join(' ')}`.includes(only));

if (argv.includes('--list')) {
  for (const c of cmds) console.log(`node ${c.script} ${c.args.join(' ')}`.trim());
  console.log(`\n${cmds.length} 本（.github/workflows/seo-check.yml から導出）`);
  process.exit(0);
}

console.log(`CI と同じ ${cmds.length} 本を回す（seo-check.yml から導出）\n`);
const failed = [];
for (const c of cmds) {
  const label = `${c.script} ${c.args.join(' ')}`.trim().replace(/^scripts\//, '');
  const r = spawnSync('node', [c.script, ...c.args], { cwd: ROOT, encoding: 'utf8' });
  if (r.status === 0) {
    console.log(`  ok    ${label}`);
  } else {
    failed.push({ label, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() });
    console.log(`  FAIL  ${label}`);
  }
}

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
