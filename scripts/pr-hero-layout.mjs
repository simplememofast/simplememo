/**
 * ヒーロー画像の**組みだけ**を持つ。Playwright に依存しない。
 *
 * 切り出した理由: CI で前提条件を検査する check-pr-hero.mjs が、
 * 生成器を import しただけで playwright まで読み込んでいた。CI に
 * playwright は入っていないので、**次の実行で必ず落ちる**状態だった
 * （PR #530 では手前の検査が先に落ちたため露見しなかった）。
 *
 * 描画（ブラウザを起動して撮る）と組み（何をどう並べるか）は別の関心で、
 * 分けておくと組みの側だけをブラウザ無しで検査できる。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
