#!/usr/bin/env node
/**
 * TikTok Slide Compositor v2
 * Background photo + SVG text overlay → 1080×1920 PNG
 *
 * Changes v2:
 *  - caption_none → caption_subtle (thin white box 18% for readability)
 *  - Stronger text shadows everywhere
 *  - Updated scripts (punchier copy)
 *  - Brand footer ON by default
 *  - 1枚目ABテスト用 --ab モード
 */

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

// ── Output size ─────────────────────────────────────────────────
const W = 1080;
const H = 1920;
const SAFE = 120;

// ── Scripts (強め版) ────────────────────────────────────────────
const SCRIPTS = {
  A: [
    ["I screenshot it.", "Then it dies."],
    ["Notes apps don't fail.", "I do."],
    ["So I email myself", "one verb."],
    ["Inbox guilt", "actually works."],
    ["No system.", "One habit."],
    ["Where do your tasks", "go to die?"],
  ],
  B: [
    ["I nod. I forget.", "Every time."],
    ["To-do apps are", "where tasks go to die."],
    ["So I email the task.", "Instantly."],
    ["Now it stares back", "in my inbox."],
    ["No system.", "Just friction."],
    ["Be honest\u2014", "notes app or inbox?"],
  ],
  C: [
    ["If it's not in my inbox,", "it's gone."],
    ["Slack scrolls.", "Notes get buried."],
    ["Email doesn't.", ""],
    ["One tap,", "one reminder."],
    ["Boring on purpose.", "That's why it works."],
    ["What actually works", "for you?"],
  ],
};

// 1枚目ABテスト候補
const SLIDE1_AB = [
  ["I screenshot it.", "Then it dies."],
  ["I nod. I forget.", "Every time."],
  ["If it's not in my inbox,", "it's gone."],
];

// ── Layout variants ─────────────────────────────────────────────
// caption_none を廃止 → caption_subtle (極薄白ボックス)
const LAYOUTS = ["poster_dark", "caption_subtle", "caption_light"];
const POSITIONS = [
  "top-left", "top-center", "top-right",
  "bottom-left", "bottom-center", "bottom-right",
];
const CROPS = ["wide", "zoom-in", "left-focus", "right-focus"];

function assignLayouts() {
  const pool = ["poster_dark", "poster_dark", "caption_subtle", "caption_subtle", "caption_light", "caption_light"];
  return shuffle(pool);
}

function assignPositions() {
  const picked = [];
  const available = [...POSITIONS];
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * available.length);
    picked.push(available[idx]);
    available.splice(idx, 1);
    if (available.length === 0) available.push(...POSITIONS);
  }
  return picked;
}

function assignCrops() {
  const pool = [];
  while (pool.length < 6) pool.push(...shuffle([...CROPS]));
  return pool.slice(0, 6);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Crop logic ──────────────────────────────────────────────────
function getCropRegion(srcW, srcH, cropVariant) {
  const targetRatio = W / H;

  let extractW, extractH, left, top;

  if (cropVariant === "zoom-in") {
    extractW = Math.round(srcW * 0.65);
    extractH = Math.round(extractW / targetRatio);
    if (extractH > srcH * 0.65) {
      extractH = Math.round(srcH * 0.65);
      extractW = Math.round(extractH * targetRatio);
    }
    left = Math.round((srcW - extractW) / 2);
    top = Math.round((srcH - extractH) / 2);
  } else if (cropVariant === "left-focus") {
    extractH = srcH;
    extractW = Math.round(extractH * targetRatio);
    if (extractW > srcW) { extractW = srcW; extractH = Math.round(srcW / targetRatio); }
    left = 0;
    top = Math.round((srcH - extractH) / 2);
  } else if (cropVariant === "right-focus") {
    extractH = srcH;
    extractW = Math.round(extractH * targetRatio);
    if (extractW > srcW) { extractW = srcW; extractH = Math.round(srcW / targetRatio); }
    left = Math.max(0, srcW - extractW);
    top = Math.round((srcH - extractH) / 2);
  } else {
    const srcRatio = srcW / srcH;
    if (srcRatio > targetRatio) {
      extractH = srcH;
      extractW = Math.round(srcH * targetRatio);
      left = Math.round((srcW - extractW) / 2);
      top = 0;
    } else {
      extractW = srcW;
      extractH = Math.round(srcW / targetRatio);
      left = 0;
      top = Math.round((srcH - extractH) / 2);
    }
  }

  extractW = Math.min(extractW, srcW - left);
  extractH = Math.min(extractH, srcH - top);

  return { left, top, width: extractW, height: extractH };
}

// ── SVG text overlay ────────────────────────────────────────────
function escXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildSvgOverlay(lines, layout, position, brand) {
  const fontSize = lines.some(l => l.length > 25) ? 64 : 76;
  const lineHeight = fontSize * 1.35;
  const linesFiltered = lines.filter(l => l.length > 0);
  const textBlockH = linesFiltered.length * lineHeight;
  const boxPadH = 44;
  const boxPadW = 56;
  const boxW = Math.min(W - SAFE * 2, 880);
  const boxH = textBlockH + boxPadH * 2;
  const boxR = 20;

  // Position
  let boxX = (W - boxW) / 2;
  let boxY;
  if (position.startsWith("top")) {
    boxY = SAFE + 40;
  } else {
    boxY = H - SAFE - boxH - 40;
  }
  if (position.endsWith("left")) boxX = SAFE;
  else if (position.endsWith("right")) boxX = W - boxW - SAFE;

  // Text anchor
  let textAnchor = "middle";
  let textX = boxX + boxW / 2;
  if (position.endsWith("left")) { textAnchor = "start"; textX = boxX + boxPadW; }
  else if (position.endsWith("right")) { textAnchor = "end"; textX = boxX + boxW - boxPadW; }

  let textY = boxY + boxPadH + fontSize;

  // Global text shadow filter (used by ALL layouts for extra punch)
  const globalShadow = `<filter id="gs"><feDropShadow dx="0" dy="3" stdDeviation="8" flood-color="#000" flood-opacity="0.55"/></filter>`;

  let boxSvg = "";
  let textFill = "#ffffff";
  let textFilterAttr = "";

  if (layout === "poster_dark") {
    // Strong dark box
    boxSvg = `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="${boxR}" fill="rgba(0,0,0,0.65)" />`;
    textFill = "#ffffff";
  } else if (layout === "caption_light") {
    // White box
    boxSvg = `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="${boxR}" fill="rgba(255,255,255,0.55)" />`;
    textFill = "#111111";
  } else {
    // caption_subtle — thin white box (18% opacity) + shadow for safety
    boxSvg = `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="${boxR}" fill="rgba(255,255,255,0.18)" />`;
    textFill = "#ffffff";
    textFilterAttr = ` filter="url(#gs)"`;
  }

  const textLines = linesFiltered.map((line, i) => {
    return `<text x="${textX}" y="${textY + i * lineHeight}" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-size="${fontSize}" font-weight="800" fill="${textFill}" text-anchor="${textAnchor}"${textFilterAttr}>${escXml(line)}</text>`;
  }).join("\n    ");

  // Brand footer (always with shadow for visibility)
  let brandSvg = "";
  if (brand) {
    brandSvg = `
    <text x="${W - SAFE}" y="${H - 34}" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-size="26" font-weight="500" fill="rgba(255,255,255,0.35)" text-anchor="end" filter="url(#gs)">SimpleMemo (captio-style)</text>`;
  }

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>${globalShadow}</defs>
  ${boxSvg}
  ${textLines}
  ${brandSvg}
</svg>`;
}

// ── Compose single slide ────────────────────────────────────────
export async function composeSlide(bgPath, lines, layout, position, cropVariant, brand) {
  const meta = await sharp(bgPath).metadata();
  const crop = getCropRegion(meta.width, meta.height, cropVariant);

  const bg = await sharp(bgPath)
    .extract(crop)
    .resize(W, H, { fit: "cover" })
    .png()
    .toBuffer();

  const svgOverlay = buildSvgOverlay(lines, layout, position, brand);
  const svgBuf = Buffer.from(svgOverlay);

  return sharp(bg)
    .composite([{ input: svgBuf, top: 0, left: 0 }])
    .png({ quality: 95 })
    .toBuffer();
}

// ── Generate full set (6 slides) ────────────────────────────────
export async function generateSet(options = {}) {
  const {
    variant = "A",
    bgDir = path.join(import.meta.dirname, "backgrounds", "master"),
    brand = true,
  } = options;

  const texts = SCRIPTS[variant];
  if (!texts) throw new Error(`Unknown variant: ${variant}`);

  const layouts = assignLayouts();
  const positions = assignPositions();
  const crops = assignCrops();

  const plan = [];
  const buffers = [];

  for (let i = 0; i < 6; i++) {
    const bgFile = path.join(bgDir, `${i + 1}.png`);
    if (!fs.existsSync(bgFile)) throw new Error(`Background not found: ${bgFile}`);

    const slideConfig = {
      slide_index: i,
      background: `${i + 1}.png`,
      text: texts[i],
      layout_variant: layouts[i],
      text_position: positions[i],
      crop_variant: crops[i],
      brand,
    };
    plan.push(slideConfig);

    const buf = await composeSlide(bgFile, texts[i], layouts[i], positions[i], crops[i], brand);
    buffers.push(buf);
  }

  return { plan, buffers };
}

// ── Generate slide-1 A/B test (3 variants of slide 1 only) ─────
export async function generateABTest(options = {}) {
  const {
    bgDir = path.join(import.meta.dirname, "backgrounds", "master"),
    brand = true,
  } = options;

  const bgFile = path.join(bgDir, "1.png");
  const layout = "poster_dark"; // strongest readability for hook
  const position = "top-center"; // highest impact
  const crop = "wide";

  const results = [];
  for (let i = 0; i < SLIDE1_AB.length; i++) {
    const buf = await composeSlide(bgFile, SLIDE1_AB[i], layout, position, crop, brand);
    results.push({ text: SLIDE1_AB[i], buffer: buf });
  }
  return results;
}

// ── CLI ─────────────────────────────────────────────────────────
async function cli() {
  const args = process.argv.slice(2).join(" ");
  const variant = (args.match(/--variant=([ABC])/i) || [, "A"])[1].toUpperCase();
  const brand = !/--no-brand/i.test(args); // brand ON by default
  const abTest = /--ab/i.test(args);

  const t0 = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  if (abTest) {
    // A/B test mode: 3 variants of slide 1
    console.log(`\n  A/B Test Mode — Slide 1 × 3 variants\n`);
    const results = await generateABTest({ brand });
    const outDir = path.join(import.meta.dirname, "out", `ab_test_${timestamp}`);
    fs.mkdirSync(outDir, { recursive: true });

    for (let i = 0; i < results.length; i++) {
      const outPath = path.join(outDir, `slide1_v${i + 1}.png`);
      fs.writeFileSync(outPath, results[i].buffer);
      const kb = Math.round(results[i].buffer.length / 1024);
      console.log(`  [V${i + 1}] "${results[i].text.join(" / ")}" → ${kb}KB`);
    }

    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n  Done in ${sec}s → ${outDir}\n`);
  } else {
    // Normal mode: 6 slides
    console.log(`\n  Variant: ${variant} | Brand: ${brand ? "ON" : "OFF"}\n`);
    const { plan, buffers } = await generateSet({ variant, brand });

    const outDir = path.join(import.meta.dirname, "out", `slides_${variant}_${timestamp}`);
    fs.mkdirSync(outDir, { recursive: true });

    for (let i = 0; i < 6; i++) {
      const outPath = path.join(outDir, `slide_${i + 1}.png`);
      fs.writeFileSync(outPath, buffers[i]);
      const kb = Math.round(buffers[i].length / 1024);
      console.log(`  [${i + 1}/6] ${plan[i].layout_variant.padEnd(16)} ${plan[i].crop_variant.padEnd(12)} ${plan[i].text_position.padEnd(14)} → ${kb}KB`);
    }

    const logData = { timestamp: new Date().toISOString(), variant, brand, output_size: `${W}x${H}`, slides: plan };
    fs.writeFileSync(path.join(outDir, "slide_plan.json"), JSON.stringify(logData, null, 2));

    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n  Done in ${sec}s → ${outDir}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  cli().catch(e => { console.error(e); process.exit(1); });
}
