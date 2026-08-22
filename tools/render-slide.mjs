#!/usr/bin/env node
/**
 * TikTok 1枚スライドの「画撮」レンダラ（HTML → ヘッドレスChromium → 1080x1920 PNG）
 *
 *   node tools/render-slide.mjs            # 全デザインを出力
 *   node tools/render-slide.mjs A-strike   # 1つだけ
 *
 * 【なぜ生成AIではなくHTMLの画撮なのか】
 * generate-slide.js は gpt-image-1 に「文字を描かせて」いる。文字は毎回変形し、
 * 同じコピーで同じ画が出ない。auto-post-tiktok.yml が 2026-08-11 に止まった理由
 * （画像品質が公開基準に達していない）の中心がここ。HTMLを撮れば文字は画素として
 * 正確に出て、同じ入力から必ず同じ画が出る。OPENAI_API_KEY も要らない。
 *
 * 【依存なし】Chromium は Playwright 同梱のものを使い、切り出しは標準ライブラリだけで行う
 *   （scripts/qa/verify-screenshots.py と同じ方針。pip/npm install を前提にしない）。
 *
 * ⚠️ ビューポート不足の罠（2026-08-22 実測）
 *   --window-size=1080,1920 を渡してもビューポートは 1833px しかない（ウィンドウ枠の分）。
 *   スクリーンショットは 1920px 分出るが、下 87px は「描画されていない背景色」で埋まる。
 *   C-split では下端87pxの青が黒帯になっていたのに、終了コードは 0 だった。
 *   → ウィンドウを内容より高くして撮り、1920px へ切り出す。さらにページ側が
 *     innerHeight 不足を検知したらマーカー画素を打ち、下の crop が落とす。
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const CHROME = process.env.CHROME_BIN
  || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = path.join(ROOT, "out");
const FONT_DIR = path.join(ROOT, "fonts");

const W = 1080, H = 1920;
const VIEWPORT_PAD = 120;               // ウィンドウ枠ぶんの余裕（実測87px）
const SAFE = { left: 64, right: 120, top: 140, bottom: 280 };  // compose-slides.js と同じ
const BOX_W = W - SAFE.left - SAFE.right;                       // 896
const MARK = [255, 0, 255];             // ビューポート不足マーカー（左上3x3）

// ── フォント（OFL。取得してキャッシュする。バイナリはコミットしない） ──────
const FONTS = {
  "Anton-400.woff2": "https://fonts.googleapis.com/css2?family=Anton&display=swap",
  "Inter-var.woff2": "https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap",
};
function ensureFonts() {
  fs.mkdirSync(FONT_DIR, { recursive: true });
  for (const [file, css] of Object.entries(FONTS)) {
    const dest = path.join(FONT_DIR, file);
    if (fs.existsSync(dest)) continue;
    const ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141.0.0.0 Safari/537.36";
    const sheet = execFileSync("curl", ["-sS", "-A", ua, css]).toString();
    // latin サブセット（U+0000-00FF を含む @font-face）だけ取る
    const block = sheet.split("@font-face").find((b) => b.includes("U+0000-00FF"));
    if (!block) throw new Error(`latin サブセットが見つかりません: ${css}`);
    const url = block.match(/url\((https:\/\/[^)]+)\)/)[1];
    execFileSync("curl", ["-sS", "-o", dest, url]);
    console.log(`  fetched ${file}`);
  }
}
const b64 = (f) => fs.readFileSync(path.join(FONT_DIR, f)).toString("base64");

// ── 共通スタイル ────────────────────────────────────────────────
const css = () => `
@font-face{font-family:'Anton';src:url(data:font/woff2;base64,${b64("Anton-400.woff2")}) format('woff2');font-display:block}
@font-face{font-family:'Inter';src:url(data:font/woff2;base64,${b64("Inter-var.woff2")}) format('woff2');font-weight:100 900;font-display:block}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#04060c}
body{font-family:'Inter',sans-serif;color:#fff;-webkit-font-smoothing:antialiased}
.stage{position:relative;width:${W}px;height:${H}px;overflow:hidden}
.grain{position:absolute;inset:0;opacity:.05;mix-blend-mode:overlay;pointer-events:none}
.type{font-family:'Anton',sans-serif;text-transform:uppercase;letter-spacing:-.018em}
.ln{white-space:nowrap;line-height:.92}
.ln>span{display:inline-block}
.brand{position:absolute;left:${SAFE.left}px;bottom:186px;display:flex;align-items:center;gap:13px}
.brand .dot{width:32px;height:32px;border-radius:9px;background:linear-gradient(145deg,#7cbcff,#2f7fd4);
  box-shadow:0 0 0 1px rgba(255,255,255,.16),0 6px 18px rgba(106,180,255,.4)}
.brand .name{font-size:25px;font-weight:700;color:rgba(255,255,255,.55)}
#vpmark{position:absolute;left:0;top:0;width:3px;height:3px;background:rgb(255,0,255);z-index:99}
`;

const GRAIN = `<svg class="grain" xmlns="http://www.w3.org/2000/svg"><filter id="n">
<feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3"/></filter>
<rect width="100%" height="100%" filter="url(#n)"/></svg>`;

const BRAND = (dark) => `<div class="brand">
<div class="dot"${dark ? ' style="background:#04060c;box-shadow:0 0 0 1px rgba(4,6,12,.22)"' : ""}></div>
<div class="name"${dark ? ' style="color:rgba(4,6,12,.6)"' : ""}>simplememo</div></div>`;

const L = (lines) => lines.map((t) => `<div class="ln"><span>${t}</span></div>`).join("");

/**
 * 行ごとに nowrap のまま、収まる最大サイズまで二分探索で詰める。
 * 自動折り返しに任せると "IT." のような孤立行が出て、緑のまま崩れた画が出る。
 */
const FIT = `
async function fit(){
  await document.fonts.ready;
  for (const el of document.querySelectorAll('.type')){
    const maxW=+el.dataset.w, maxH=+el.dataset.h, cap=+(el.dataset.cap||260);
    let lo=24, hi=cap;
    while(hi-lo>1){ const m=(lo+hi)>>1; el.style.fontSize=m+'px';
      (el.scrollWidth<=maxW && el.scrollHeight<=maxH) ? lo=m : hi=m; }
    el.style.fontSize=lo+'px';
  }
  const k=document.querySelector('.kill>span');
  if(k){ const r=k.getBoundingClientRect(), s=document.querySelector('.strike');
    const h=Math.max(9, r.height*.075);
    s.style.left=(r.left-10)+'px'; s.style.width=(r.width+20)+'px';
    s.style.top=(r.top+r.height*0.47-h/2)+'px'; s.style.height=h+'px'; s.style.opacity=1; }
  // ビューポートが内容より低いと下端が描画されない。撮る前に気づけるよう印を打つ。
  if(window.innerHeight < ${H}){
    const m=document.createElement('div'); m.id='vpmark'; document.body.appendChild(m);
  }
}
fit();`;

// ── デザイン ───────────────────────────────────────────────────
const DESIGNS = {
  /* 巨大タイポ + 実測位置に合わせた打ち消し線。サムネイルで一番強い。 */
  "A-strike": ({ lines, killIndex, sub }) => `<style>${css()}
.stage{background:
  radial-gradient(1200px 820px at 14% 16%, rgba(106,180,255,.22), transparent 60%),
  radial-gradient(880px 880px at 96% 92%, rgba(47,127,212,.15), transparent 58%), #04060c}
.wrap{position:absolute;left:${SAFE.left}px;top:0;height:${H}px;width:${BOX_W}px;
  display:flex;flex-direction:column;justify-content:center;padding-bottom:120px}
.rule{width:112px;height:9px;border-radius:5px;background:#6ab4ff;margin-bottom:40px;
  box-shadow:0 0 28px rgba(106,180,255,.8)}
.sub{margin-top:56px;font-size:40px;font-weight:600;line-height:1.42;color:rgba(255,255,255,.56)}
.sub b{color:#6ab4ff;font-weight:700}
.strike{position:absolute;background:#ff4d45;border-radius:99px;opacity:0;
  box-shadow:0 0 24px rgba(255,77,69,.65);transform:rotate(-1.6deg)}
</style><div class="stage">${GRAIN}<div class="wrap"><div class="rule"></div>
<div class="type" data-w="${BOX_W}" data-h="640" data-cap="215">${lines.map((t, i) =>
    `<div class="ln${i === killIndex ? " kill" : ""}"${i === killIndex ? ' style="color:#6ab4ff"' : ""}><span>${t}</span></div>`).join("")}</div>
${sub ? `<div class="sub">${sub}</div>` : ""}</div>
<div class="strike"></div>${BRAND(false)}</div><script>${FIT}<\/script>`,

  /* 受信箱の通知UI風。「自分ごと」に見える形。 */
  "B-inbox": ({ kicker, subject }) => `<style>${css()}
.stage{background:radial-gradient(1050px 900px at 50% 12%, rgba(106,180,255,.17), transparent 56%), #04060c}
.wrap{position:absolute;left:${SAFE.left}px;top:0;height:${H}px;width:${BOX_W}px;
  display:flex;flex-direction:column;justify-content:center;gap:46px;padding-bottom:120px}
.kick{color:rgba(255,255,255,.42)}
.card{background:linear-gradient(180deg,rgba(20,27,41,.96),rgba(12,17,27,.96));
  border:1px solid rgba(106,180,255,.24);border-radius:36px;padding:50px 44px 44px;
  box-shadow:0 44px 130px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.08)}
.meta{display:flex;align-items:center;gap:15px;margin-bottom:32px}
.pill{font-size:22px;font-weight:800;letter-spacing:.11em;color:#04060c;background:#6ab4ff;
  padding:9px 17px;border-radius:999px}
.from{font-size:26px;color:rgba(255,255,255,.46);font-weight:500}
.time{margin-top:30px;font-size:25px;color:rgba(255,255,255,.3);font-weight:500;
  display:flex;align-items:center;gap:11px}
.time::before{content:'';width:9px;height:9px;border-radius:50%;background:#3fb950;
  box-shadow:0 0 12px rgba(63,185,80,.9)}
</style><div class="stage">${GRAIN}<div class="wrap">
<div class="type kick" data-w="${BOX_W}" data-h="300" data-cap="112">${L(kicker)}</div>
<div class="card"><div class="meta"><span class="pill">INBOX</span><span class="from">from: you</span></div>
<div class="type" data-w="${BOX_W - 88}" data-h="430" data-cap="150">${L(subject)}</div>
<div class="time">now</div></div></div>${BRAND(false)}</div><script>${FIT}<\/script>`,

  /* 問題(沈む) / 答え(光る) の対比。スクロールを止めさせる色面。 */
  "C-split": ({ top, bottom }) => `<style>${css()}
.half{position:absolute;left:0;width:${W}px;display:flex;align-items:center}
.t{top:0;height:${H / 2}px;background:linear-gradient(180deg,#0b111d,#060910)}
.b{top:${H / 2}px;height:${H / 2}px;background:linear-gradient(165deg,#7cbcff 0%,#3f8fdd 100%)}
.b::after{content:'';position:absolute;inset:0;opacity:.2;
  background:radial-gradient(720px 440px at 80% 14%,#fff,transparent 62%)}
.pad{position:relative;z-index:2;padding-left:${SAFE.left}px;padding-right:${SAFE.right}px;width:100%}
.tag{font-size:24px;font-weight:800;letter-spacing:.24em;margin-bottom:26px}
.t .tag{color:rgba(124,188,255,.62)} .b .tag{color:rgba(4,6,12,.5)}
.t .type{color:rgba(255,255,255,.72)} .b .type{color:#04060c}
</style><div class="stage">
<div class="half t"><div class="pad"><div class="tag">EVERY DAY</div>
<div class="type" data-w="${BOX_W}" data-h="600" data-cap="205">${L(top)}</div></div></div>
<div class="half b"><div class="pad"><div class="tag">ONE HABIT</div>
<div class="type" data-w="${BOX_W}" data-h="620" data-cap="225">${L(bottom)}</div></div></div>
${GRAIN}${BRAND(true)}</div><script>${FIT}<\/script>`,
};

// ── コピー（compose-slides.js の SLIDE1_AB / SCRIPTS と同じ路線） ──────
const SLIDES = {
  "A-strike": { lines: ["I screenshot it.", "Then it dies."], killIndex: 1,
                sub: "So I stopped saving things.<br>I <b>email them to myself</b> instead." },
  "B-inbox":  { kicker: ["I nod.", "I forget."], subject: ["Call the", "landlord"] },
  "C-split":  { top: ["Notes get", "buried."], bottom: ["Email", "doesn't."] },
};

// ── PNG（標準ライブラリのみ。切り出しと検査に使う） ────────────────
function decode(file) {
  const d = fs.readFileSync(file);
  let i = 8, idat = [], meta = null;
  while (i < d.length) {
    const len = d.readUInt32BE(i), type = d.toString("ascii", i + 4, i + 8);
    if (type === "IHDR") meta = { w: d.readUInt32BE(i + 8), h: d.readUInt32BE(i + 12), ctype: d[i + 17] };
    else if (type === "IDAT") idat.push(d.subarray(i + 8, i + 8 + len));
    i += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[meta.ctype];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = meta.w * ch, rows = [];
  let prev = Buffer.alloc(stride), p = 0;
  for (let y = 0; y < meta.h; y++) {
    const f = raw[p], line = Buffer.from(raw.subarray(p + 1, p + 1 + stride));
    p += 1 + stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    rows.push(line); prev = line;
  }
  return { ...meta, ch, rows };
}
function encode(file, w, h, ch, rows) {
  const stride = w * ch, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rows[y].copy(raw, y * (stride + 1) + 1, 0, stride); }
  const chunk = (type, body) => {
    const b = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const out = Buffer.alloc(b.length + 8);
    out.writeUInt32BE(body.length, 0); b.copy(out, 4);
    out.writeUInt32BE(((zlib.crc32 ? zlib.crc32(b) : crc(b)) >>> 0), b.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 2;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]));
}
let TBL = null;
function crc(buf) {
  if (!TBL) { TBL = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TBL[n] = c; } }
  let c = -1;
  for (const b of buf) c = TBL[(c ^ b) & 255] ^ (c >>> 8);
  return c ^ -1;
}

// ── 1枚撮る ────────────────────────────────────────────────────
export function render(name) {
  if (!DESIGNS[name]) throw new Error(`unknown design: ${name}`);
  fs.mkdirSync(OUT, { recursive: true });
  const htmlPath = path.join(OUT, `${name}.html`);
  const rawPath = path.join(OUT, `${name}.raw.png`);
  const pngPath = path.join(OUT, `${name}.png`);
  fs.writeFileSync(htmlPath, DESIGNS[name](SLIDES[name]));

  execFileSync(CHROME, [
    "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${W},${H + VIEWPORT_PAD}`,   // 枠の分だけ高く取る（下端の描画漏れ対策）
    "--virtual-time-budget=8000",               // fonts.ready と fit() の完了を待つ
    `--screenshot=${rawPath}`, `file://${htmlPath}`,
  ], { stdio: "pipe" });

  const img = decode(rawPath);
  if (img.w !== W || img.h < H) throw new Error(`撮影サイズが不正: ${img.w}x${img.h}`);
  const [r, g, b] = [img.rows[0][0], img.rows[0][1], img.rows[0][2]];
  if (r === MARK[0] && g === MARK[1] && b === MARK[2]) {
    throw new Error(`NG: ${name} はビューポート不足で下端が描画されていません。VIEWPORT_PAD を増やしてください。`);
  }
  encode(pngPath, W, H, img.ch, img.rows.slice(0, H));   // 1080x1920 へ切り出す
  fs.unlinkSync(rawPath);
  console.log(`  ${name}.png  ${(fs.statSync(pngPath).size / 1024).toFixed(0)} KB`);
  return pngPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ensureFonts();
  const only = process.argv[2];
  console.log(`画撮中 (${W}x${H})...`);
  for (const name of only ? [only] : Object.keys(DESIGNS)) render(name);
  console.log(`完了 → tools/out/`);
}
