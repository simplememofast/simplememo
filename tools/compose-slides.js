#!/usr/bin/env node
/**
 * TikTok Slide Compositor v3
 * Background photo + SVG text overlay → 1080×1920 PNG
 *
 * Changes v3:
 *  - Auto-sizing text band (content-driven, not fixed width)
 *  - TikTok safe areas (top/right/bottom UI avoidance)
 *  - Font-size stepping with word-wrap
 *  - Text width estimation for SVG (no Canvas available)
 *  - Premium band design (rgba(35,35,35,0.68), radius 16, shadow)
 */

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

// ── Output size ─────────────────────────────────────────────────
const W = 1080;
const H = 1920;

// ── TikTok safe areas ───────────────────────────────────────────
const SAFE_LEFT = 64;
const SAFE_RIGHT = 120;
const SAFE_TOP = 140;
const SAFE_BOTTOM = 280;
const SAFE_MAX_W = W - SAFE_LEFT - SAFE_RIGHT; // 896

// ── Band design tokens ──────────────────────────────────────────
const BAND_PAD_X = 40;
const BAND_PAD_Y = 28;
const BAND_RADIUS = 16;
const BAND_MIN_W = 320;
const MAX_TEXT_LINES = 3;

// Font size steps per slide role (descending)
const FONT_STEPS = {
  hook: [96, 80, 64, 48],
  body: [76, 64, 52, 42],
  cta:  [68, 56, 46, 38],
};

// ── Scripts (legacy fallback) ───────────────────────────────────
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

// ── Text width estimation (Inter 800 heuristic) ─────────────────
function estimateTextWidth(text, fontSize) {
  let width = 0;
  for (const ch of text) {
    if (ch === ' ') width += fontSize * 0.28;
    else if (ch >= 'A' && ch <= 'Z') width += fontSize * 0.68;
    else if (ch >= 'a' && ch <= 'z') width += fontSize * 0.55;
    else if (ch >= '0' && ch <= '9') width += fontSize * 0.58;
    else if ('.,;:!?'.includes(ch)) width += fontSize * 0.30;
    else if ('-\u2013\u2014/'.includes(ch)) width += fontSize * 0.42;
    else if ("'\"'\u2018\u2019\u201c\u201d".includes(ch)) width += fontSize * 0.28;
    else if (ch === '#') width += fontSize * 0.65;
    else if (ch === '>') width += fontSize * 0.60;
    else if (ch === '=') width += fontSize * 0.60;
    else if (ch === '+') width += fontSize * 0.60;
    else if (ch === '<') width += fontSize * 0.60;
    else width += fontSize * 0.55;
  }
  return width * 1.08; // 8% safety margin
}

// ── Word-wrap with number+unit keep-together ────────────────────
function wrapTextSvg(inputLines, fontSize, maxWidth) {
  const result = [];
  for (const line of inputLines) {
    const lineW = estimateTextWidth(line, fontSize);
    if (lineW <= maxWidth) {
      result.push(line);
    } else {
      const words = line.split(/\s+/);
      let currentLine = '';
      for (let wi = 0; wi < words.length; wi++) {
        let word = words[wi];
        // Keep number+unit pairs together
        if (wi < words.length - 1 && /^\d+$/.test(word) && /^(min|AM|PM|hours?|days?|sec|seconds?|minutes?)/.test(words[wi + 1])) {
          word = word + ' ' + words[wi + 1];
          wi++;
        }
        const testLine = currentLine ? currentLine + ' ' + word : word;
        if (estimateTextWidth(testLine, fontSize) <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) result.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) result.push(currentLine);
    }
  }
  return result;
}

// ── Slide role ──────────────────────────────────────────────────
function getSlideRole(slideIndex) {
  if (slideIndex === 0) return 'hook';
  if (slideIndex === 5) return 'cta';
  return 'body';
}

// ── Measure and layout with auto-fit ────────────────────────────
function measureAndLayoutSvg(lines, slideIndex, maxWidth) {
  const role = getSlideRole(slideIndex);
  const steps = FONT_STEPS[role];
  const linesFiltered = lines.filter(l => l && l.length > 0);

  for (const fs of steps) {
    const textMaxW = maxWidth - BAND_PAD_X * 2;
    const wrapped = wrapTextSvg(linesFiltered, fs, textMaxW);

    if (wrapped.length <= MAX_TEXT_LINES) {
      let maxLineWidth = 0;
      for (const line of wrapped) {
        const w = estimateTextWidth(line, fs);
        if (w > maxLineWidth) maxLineWidth = w;
      }
      return {
        lines: wrapped,
        fontSize: fs,
        lineHeight: Math.round(fs * 1.35),
        maxLineWidth,
      };
    }
  }

  // Fallback: smallest font
  const smallestFs = steps[steps.length - 1];
  const textMaxW = maxWidth - BAND_PAD_X * 2;
  const fallbackWrapped = wrapTextSvg(linesFiltered, smallestFs, textMaxW);
  let fallbackMaxW = 0;
  for (const line of fallbackWrapped) {
    const w = estimateTextWidth(line, smallestFs);
    if (w > fallbackMaxW) fallbackMaxW = w;
  }
  return {
    lines: fallbackWrapped,
    fontSize: smallestFs,
    lineHeight: Math.round(smallestFs * 1.35),
    maxLineWidth: fallbackMaxW,
  };
}

// ── Safe area for a position ────────────────────────────────────
function getSafeArea(position) {
  let maxW;
  if (position.endsWith("left") || position.endsWith("right")) {
    maxW = W - SAFE_LEFT - SAFE_RIGHT - 40;
  } else {
    maxW = SAFE_MAX_W;
  }
  return { maxW };
}

// ── SVG text overlay (auto-sizing band) ─────────────────────────
function escXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildSvgOverlay(lines, layout, position, brand, slideIndex) {
  const safe = getSafeArea(position);
  const measured = measureAndLayoutSvg(lines, slideIndex, safe.maxW);
  const { fontSize, lineHeight } = measured;
  const wrappedLines = measured.lines;

  // Calculate band dimensions (content-driven)
  let bandContentW = measured.maxLineWidth + BAND_PAD_X * 2;
  if (wrappedLines.length >= 3) bandContentW = Math.min(bandContentW * 1.05, safe.maxW);
  const boxW = Math.max(BAND_MIN_W, Math.min(Math.round(bandContentW), safe.maxW));
  const textBlockH = wrappedLines.length * lineHeight;
  const boxH = textBlockH + BAND_PAD_Y * 2 + Math.round(fontSize * 0.15);
  const boxR = BAND_RADIUS;

  // Position the band
  let boxX, boxY;
  if (position.endsWith("left")) {
    boxX = SAFE_LEFT;
  } else if (position.endsWith("right")) {
    boxX = W - SAFE_RIGHT - boxW;
  } else {
    boxX = Math.round((W - boxW) / 2);
  }
  if (position.startsWith("top")) {
    boxY = SAFE_TOP + 20;
  } else {
    boxY = H - SAFE_BOTTOM - boxH - 20;
  }

  // Text anchor
  let textAnchor = "middle";
  let textX = boxX + boxW / 2;
  if (position.endsWith("left")) { textAnchor = "start"; textX = boxX + BAND_PAD_X; }
  else if (position.endsWith("right")) { textAnchor = "end"; textX = boxX + boxW - BAND_PAD_X; }

  const textY = boxY + BAND_PAD_Y + fontSize;

  // SVG filters
  const globalShadow = `<filter id="gs"><feDropShadow dx="0" dy="3" stdDeviation="8" flood-color="#000" flood-opacity="0.55"/></filter>`;
  const bandShadow = `<filter id="bs"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000" flood-opacity="0.16"/></filter>`;

  let boxSvg = "";
  let textFill = "#ffffff";
  let textFilterAttr = "";

  if (layout === "poster_dark") {
    boxSvg = `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="${boxR}" fill="rgba(35,35,35,0.68)" filter="url(#bs)" />`;
    textFill = "#ffffff";
  } else if (layout === "caption_light") {
    boxSvg = `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="${boxR}" fill="rgba(255,255,255,0.55)" filter="url(#bs)" />`;
    textFill = "#111111";
  } else {
    boxSvg = `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="${boxR}" fill="rgba(255,255,255,0.18)" />`;
    textFill = "#ffffff";
    textFilterAttr = ` filter="url(#gs)"`;
  }

  const textLines = wrappedLines.map((line, i) => {
    return `<text x="${textX}" y="${textY + i * lineHeight}" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-size="${fontSize}" font-weight="800" fill="${textFill}" text-anchor="${textAnchor}"${textFilterAttr}>${escXml(line)}</text>`;
  }).join("\n    ");

  // Brand footer
  let brandSvg = "";
  if (brand) {
    brandSvg = `
    <text x="${W - SAFE_RIGHT}" y="${H - SAFE_BOTTOM + 40}" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-size="26" font-weight="500" fill="rgba(255,255,255,0.35)" text-anchor="end" filter="url(#gs)">SimpleMemo</text>`;
  }

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>${globalShadow}${bandShadow}</defs>
  ${boxSvg}
  ${textLines}
  ${brandSvg}
</svg>`;
}

// ── Compose single slide ────────────────────────────────────────
export async function composeSlide(bgPath, lines, layout, position, cropVariant, brand, slideIndex) {
  const meta = await sharp(bgPath).metadata();
  const crop = getCropRegion(meta.width, meta.height, cropVariant);

  const bg = await sharp(bgPath)
    .extract(crop)
    .resize(W, H, { fit: "cover" })
    .png()
    .toBuffer();

  const svgOverlay = buildSvgOverlay(lines, layout, position, brand, slideIndex);
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

    const buf = await composeSlide(bgFile, texts[i], layouts[i], positions[i], crops[i], brand, i);
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
  const layout = "poster_dark";
  const position = "top-center";
  const crop = "wide";

  const results = [];
  for (let i = 0; i < SLIDE1_AB.length; i++) {
    const buf = await composeSlide(bgFile, SLIDE1_AB[i], layout, position, crop, brand, 0);
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
