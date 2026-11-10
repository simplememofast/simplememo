#!/usr/bin/env node
/**
 * 追跡ファイルに資格情報の形をした値が入っていないか（2026-11-10 監査）。
 *
 *   node scripts/check-secret-shapes.mjs            # 追跡ファイルを走査（該当があれば exit 1）
 *   node scripts/check-secret-shapes.mjs --selftest
 *
 * 出すのは `path:line kind` だけで、値は出さない。生成ロケールと js/i18n/ は
 * 日本語版の写しなので読まない（元を読めば足りる）。バイナリ（NUL を含む）も読まない。
 * 許可はパス＋種類の明示リスト（ALLOW）。いまは空で通る。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanText, SECRET_SHAPES, SHAPE_SAMPLES } from './lib/secret-shapes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED = /^(?:ar|es|id|ko|pt-BR|tr|zh|zh-Hant)\/|^js\/i18n\//;
/** `path` と `kind` の組で許す。足すときは、なぜ実値でないかを書く。 */
const ALLOW = [];

function selftest() {
  let failed = 0;
  const t = (name, ok) => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`); };
  for (const [kind, sample] of SHAPE_SAMPLES.positive) {
    const hits = scanText(sample);
    t(`拾う: ${kind}`, hits.some((h) => h.kind === kind));
    t(`出力に値が入らない: ${kind}`, !JSON.stringify(hits).includes(sample.slice(-12)));
  }
  for (const sample of SHAPE_SAMPLES.negative) t(`拾わない: ${sample.slice(0, 40)}`, scanText(sample).length === 0);
  t('どの形にも陽性の検体がある（形を足したら検体も足す）',
    SECRET_SHAPES.every(([kind]) => SHAPE_SAMPLES.positive.some(([k]) => k === kind)));
  console.log(`\n  自己テスト 失敗 ${failed} 件`);
  return failed;
}

if (process.argv.includes('--selftest')) process.exit(selftest() ? 1 : 0);

const files = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0').filter((f) => f && !GENERATED.test(f));
const findings = [];
let unread = 0;
let binary = 0;
for (const file of files) {
  let buf;
  // A tracked path missing from the checkout (deleted locally, or a gitlink) is counted, not hidden.
  try { buf = fs.readFileSync(path.join(ROOT, file)); } catch { unread += 1; continue; }
  if (buf.includes(0)) { binary += 1; continue; }
  for (const hit of scanText(buf.toString('utf8'))) {
    if (ALLOW.some((a) => a.path === file && a.kind === hit.kind)) continue;
    findings.push(`${file}:${hit.line} ${hit.kind}`);
  }
}
if (findings.length) {
  console.error(`資格情報の形をした値が ${findings.length} 件（値は出していない）:`);
  for (const f of findings) console.error(`  ${f}`);
  console.error('実値なら、消すだけでなく発行元で失効させること（公開リポジトリは履歴も読める）。');
  process.exit(1);
}
console.log(`資格情報の形をした値なし（追跡ファイル ${files.length} 件。うちバイナリ ${binary} 件と読めなかった ${unread} 件は読んでいない）。`);
