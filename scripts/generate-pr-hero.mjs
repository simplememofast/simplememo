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
import { evaluate } from './check-pr-claims.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

// PR TIMES のサムネイル。D-SCORE の G1 ゲートが 1200px を要求している。
export const WIDTH = 1200;
export const HEIGHT = 630;

const ICON = 'data:image/png;base64,' +
  fs.readFileSync(path.join(ROOT, 'assets/img/app-icon-256.png')).toString('base64');

/** 見出しの「」で囲まれた部分を大きく、残りを小さく組む。 */
/** 1行に収まる最大字数。64px・字送り-.03em・内寸1064px から。 */
export const LEAD_MAX_GLYPHS = 16;

export function splitHeadline(headline) {
  const m = headline.match(/^「(.+?)」(.*)$/);
  if (!m) return { lead: headline, rest: '' };
  return { lead: m[1], rest: m[2].replace(/^[、,]\s*/, '') };
}

export function buildHTML({ headline, subhead, appName, draft }) {
  const { lead, rest } = splitHeadline(headline);
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700;900&display=swap');
*{box-sizing:border-box;margin:0}
body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;
  font-family:"Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",sans-serif;
  background:linear-gradient(148deg,#0B1F1A 0%,#0E2A23 46%,#123A30 100%);
  color:#F2F7F5;display:flex;flex-direction:column;justify-content:space-between;
  padding:62px 68px;position:relative}
/* 地の上に薄い等高線。ベタ塗りだと写真の隣で沈む */
body::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:repeating-linear-gradient(115deg,rgba(84,196,172,.055) 0 1px,transparent 1px 46px)}
.top{display:flex;align-items:center;gap:16px;position:relative;z-index:1}
.icon{width:52px;height:52px;border-radius:12px}
.brand{font-size:21px;font-weight:700;letter-spacing:.02em}
.eyebrow{margin-left:auto;font-size:15px;font-weight:700;letter-spacing:.16em;
  color:#54C4AC;border:1px solid rgba(84,196,172,.42);border-radius:2px;padding:7px 15px}
.mid{position:relative;z-index:1}
.lead{font-size:64px;font-weight:900;line-height:1.18;letter-spacing:-.03em;
  white-space:nowrap}
.lead .mark{color:#54C4AC}
.rest{margin-top:20px;font-size:26px;font-weight:700;line-height:1.55;
  color:#CBDDD7;max-width:34ch;text-wrap:balance}
.sub{position:relative;z-index:1;font-size:17px;line-height:1.75;color:#8FA9A2;
  max-width:64ch;border-top:1px solid rgba(242,247,245,.16);padding-top:20px}
/* 下書きの印は本文の上に重ねない。角のリボンなら一目で分かり、かつ読める。
   透かしを斜めに掛けると、DRAFT だと分かる代わりに中身が読めなくなり、
   結局「透かしの無い版をくれ」と言われて意味が消える。 */
.draft{position:absolute;top:34px;right:-62px;z-index:3;width:250px;
  transform:rotate(45deg);background:#B4453C;color:#fff;text-align:center;
  font-size:19px;font-weight:900;letter-spacing:.22em;padding:9px 0;
  box-shadow:0 2px 14px rgba(0,0,0,.35)}
.draft small{display:block;font-size:10px;font-weight:500;letter-spacing:.06em;
  opacity:.9;margin-top:1px}
</style></head><body>
  <div class="top">
    <img class="icon" src="${ICON}" alt="">
    <div class="brand">${esc(appName)}</div>
    <div class="eyebrow">PRESS RELEASE</div>
  </div>
  <div class="mid">
    <div class="lead">「<span class="mark">${esc(lead)}</span>」</div>
    ${rest ? `<div class="rest">${esc(rest)}</div>` : ''}
  </div>
  <div class="sub">${esc(subhead)}</div>
  ${draft ? '<div class="draft">DRAFT<small>裏取り未完</small></div>' : ''}
</body></html>`;
}

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
