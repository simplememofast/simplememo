#!/usr/bin/env node
/**
 * プレスリリースのヒーロー画像（PR TIMES サムネイル）を生成する。
 *
 *   node scripts/generate-pr-hero.mjs
 *   node scripts/generate-pr-hero.mjs --allow-unsupported   # 下書き（透かし入り）
 *   node scripts/generate-pr-hero.mjs --out path.png
 *
 * 依存: npm install --no-save playwright（OG生成と同じ方式）
 * Chromium: CHROMIUM_PATH を見る。無ければ Playwright 同梱のものを使う
 *   （generate-og-feature.js と同じ規約。実行環境に別バージョンの
 *    Chromium が置いてあるとき、再ダウンロードせずにそれを使うため）
 *
 * ## 見出しをここに書かない
 *
 * 文言は data/pr-claims.json から読む。**主張検査が見ているのと同じ場所**
 * なので、検査を通っていない見出しの画像は原理的に作れない。
 * 画像に文字を直接書けるようにすると、原稿・検査・画像で3つの正ができて、
 * 一番人目に触れる画像だけが古いまま残る。
 *
 * ## 裏の取れていない主張が入った画像は「完成品」にしない
 *
 * 支持率が閾値を割った工程があるとき、既定では生成を拒否する。
 * どうしても見たいときは --allow-unsupported を付けるが、その画像には
 * **消せない透かしが入る**。下書きが完成品として流通する事故を防ぐため。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { WIDTH, HEIGHT, LEAD_MAX_GLYPHS, splitHeadline, buildHTML } from './pr-hero-layout.mjs';
import { evaluate } from './check-pr-claims.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const claimsDoc = readJSON('data/pr-claims.json');
  const coverage = readJSON('data/automation-coverage.json');
  const constants = readJSON('data/site-constants.json');

  const { claims } = evaluate(claimsDoc, coverage);
  const unsupported = claims.filter((c) => !c.supported);
  const allow = argv.includes('--allow-unsupported');

  if (unsupported.length && !allow) {
    console.error(`裏の取れていない主張が ${unsupported.length} 件あります:`);
    for (const c of unsupported) {
      console.error(`  「${c.phrase}」${(c.support * 100).toFixed(0)}%`);
    }
    console.error('');
    console.error('この見出しの画像は作れません。実装を足すか、見出しを直してください。');
    console.error('下書きを見たいだけなら --allow-unsupported（DRAFT の透かしが入ります）。');
    process.exit(1);
  }

  const outIdx = argv.indexOf('--out');
  const out = outIdx >= 0 ? argv[outIdx + 1] : path.join(ROOT, 'build/pr-hero.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });

  // nowrap で組むので、長すぎる見出しは**黙って切れる**。切れた画像が
  // そのまま配信されるのが最悪なので、生成前に落とす。
  const { lead } = splitHeadline(claimsDoc.headline);
  if (lead.length + 2 > LEAD_MAX_GLYPHS) {
    console.error(`見出しの「」内が長すぎます: ${lead.length + 2}字（上限 ${LEAD_MAX_GLYPHS}字）`);
    console.error(`  「${lead}」— このままだと画像で切れます`);
    process.exit(1);
  }

  const html = buildHTML({
    headline: claimsDoc.headline,
    subhead: claimsDoc.subhead,
    appName: constants.appNameJa,
    draft: unsupported.length > 0,
  });

  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({ path: out });
  await browser.close();

  // 出力の実寸を確かめる。G1（1200px）は生成できたかではなく **出た画像** で決まる。
  const buf = fs.readFileSync(out);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w !== WIDTH || h !== HEIGHT) {
    console.error(`寸法が違います: ${w}x${h}（期待 ${WIDTH}x${HEIGHT}）`);
    process.exit(1);
  }

  console.log(`ヒーロー画像を生成: ${out}`);
  console.log(`  ${w}x${h} / ${(buf.length / 1024).toFixed(0)}KB`);
  console.log(`  見出し: ${claimsDoc.headline}`);
  if (unsupported.length) {
    console.log(`  **DRAFT の透かし入り** — 裏の取れていない主張 ${unsupported.length}件`);
  }
}
