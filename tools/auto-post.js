#!/usr/bin/env node
/**
 * Auto-post: pick a random pattern, generate 6 slides, post to TikTok.
 *
 * Usage:
 *   node auto-post.js [--variant=W|A|B|C]
 *
 * Environment:
 *   POSTIZ_API_KEY  – Postiz API key (or set in .env)
 *
 * The script:
 *   1. Loads pattern libraries (W, A, B, C)
 *   2. Picks a random pattern avoiding recent N
 *   3. Hook swap for variety
 *   4. NG filter check
 *   5. Generates 6 slides via compose-slides.js
 *   6. Uploads & posts to TikTok via Postiz
 *   7. Logs pattern_id and result
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import { composeSlide } from "./compose-slides.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.postiz.com/public/v1";
const SLIDE_COUNT = 6;
const SCHEDULE_DELAY_MS = 60_000;
const AVOID_RECENT_N = 20;
const ROOT = resolve(import.meta.dirname, "..");
const BG_DIR = join(ROOT, "admin", "bg");
const HISTORY_PATH = join(import.meta.dirname, ".auto-post-history.json");
const HOOK_HISTORY_PATH = join(import.meta.dirname, ".auto-hook-history.json");
const DEFAULT_BG_TYPES = ["desk", "desk", "desk", "desk", "desk", "desk"];

// CLI args
const cliArgs = process.argv.slice(2).join(" ");
const cliVariant = (cliArgs.match(/--variant=([WABC])/i) || [, null])[1];

// Load .env
function loadEnv() {
  const envPath = resolve(import.meta.dirname, ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const API_KEY = process.env.POSTIZ_API_KEY;
const TIKTOK_INTEGRATION_ID = process.env.POSTIZ_TIKTOK_ID || "cmlm8shaq014jns0yd392f591";

if (!API_KEY) {
  console.error("Error: POSTIZ_API_KEY not set.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Pattern & hooks loading
// ---------------------------------------------------------------------------

function loadPatternLib(variant) {
  const filePath = join(ROOT, "admin", "patterns", `${variant}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function loadHooks() {
  const filePath = join(ROOT, "admin", "patterns", "hooks.json");
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// History (avoid recent patterns & hooks)
// ---------------------------------------------------------------------------

function getHistory() {
  try {
    if (existsSync(HISTORY_PATH)) {
      return JSON.parse(readFileSync(HISTORY_PATH, "utf-8"));
    }
  } catch {}
  return [];
}

function addToHistory(patternId) {
  const h = getHistory();
  h.unshift(patternId);
  writeFileSync(HISTORY_PATH, JSON.stringify(h.slice(0, 200)));
}

function getHookHistory() {
  try {
    if (existsSync(HOOK_HISTORY_PATH)) {
      return JSON.parse(readFileSync(HOOK_HISTORY_PATH, "utf-8"));
    }
  } catch {}
  return [];
}

function addToHookHistory(hookId) {
  const h = getHookHistory();
  h.unshift(hookId);
  writeFileSync(HOOK_HISTORY_PATH, JSON.stringify(h.slice(0, 200)));
}

// ---------------------------------------------------------------------------
// Pattern selection
// ---------------------------------------------------------------------------

function selectPattern(patterns) {
  const recent = getHistory().slice(0, AVOID_RECENT_N);

  let candidates = patterns.filter((p) => !recent.includes(p.id));
  if (candidates.length === 0) {
    console.log("  All patterns used recently, resetting.");
    candidates = patterns;
  }

  // Weighted random
  const totalWeight = candidates.reduce((s, p) => s + (p.weight || 1), 0);
  let r = Math.random() * totalWeight;
  for (const p of candidates) {
    r -= p.weight || 1;
    if (r <= 0) return p;
  }
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Hook swap (with category weighting)
// ---------------------------------------------------------------------------

const HOOK_CATEGORY_WEIGHTS = { pain: 3.0, gain: 2.5, contrarian: 2.0, identity: 1.5, "quiet-luxury": 1.0 };

function swapHook(slides, hooksLib, variant, preferredCategory) {
  if (!hooksLib || !hooksLib.hooks || hooksLib.hooks.length === 0) {
    return { slides, hookId: null };
  }
  // Filter by variant if available
  let pool = hooksLib.hooks;
  if (variant) {
    const variantHooks = pool.filter((h) => h.variant === variant);
    if (variantHooks.length > 0) pool = variantHooks;
  }
  // Filter by preferred category if specified
  if (preferredCategory) {
    const catHooks = pool.filter((h) => h.category === preferredCategory);
    if (catHooks.length > 0) pool = catHooks;
  }
  const recentHooks = getHookHistory().slice(0, 10);
  let available = pool.filter((h) => !recentHooks.includes(h.id));
  if (available.length === 0) available = pool;

  // Weighted random by category
  const totalWeight = available.reduce((s, h) => s + (HOOK_CATEGORY_WEIGHTS[h.category] || 1), 0);
  let r = Math.random() * totalWeight;
  let pick = available[0];
  for (const h of available) {
    r -= HOOK_CATEGORY_WEIGHTS[h.category] || 1;
    if (r <= 0) { pick = h; break; }
  }

  const newSlides = [...slides];
  newSlides[0] = pick.text;
  addToHookHistory(pick.id);
  return { slides: newSlides, hookId: pick.id, hookTone: pick.tone, hookCategory: pick.category };
}

// ---------------------------------------------------------------------------
// NG Filter
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set(["i","a","an","the","is","it","to","my","in","of","and","or","but","not","no","do","be","so","that","this","for","you","your","just","don","t","s","re","ll","ve","m","d"]);

function ngFilter(slides) {
  const issues = [];

  // Word repetition across slides
  const wordSlideCount = {};
  for (const lines of slides) {
    const text = lines.join(" ").toLowerCase().replace(/[^a-z0-9\s]/g, "");
    const words = text.split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    const seen = new Set();
    for (const w of words) {
      if (!seen.has(w)) {
        seen.add(w);
        wordSlideCount[w] = (wordSlideCount[w] || 0) + 1;
      }
    }
  }
  for (const [w, count] of Object.entries(wordSlideCount)) {
    if (count >= 3) issues.push({ type: "word_repeat", word: w, count });
  }

  // Long hook check
  const hookWords = slides[0].join(" ").split(/\s+/).filter((w) => w.length > 0).length;
  if (hookWords > 12) {
    issues.push({ type: "long_hook", words: hookWords });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Slide rules validation
// ---------------------------------------------------------------------------

function validateSlideRules(slides, slideRules) {
  if (!slideRules) return [];
  const warnings = [];
  for (let i = 0; i < slides.length; i++) {
    const rule = slideRules[`slide${i + 1}`];
    if (!rule) continue;
    const text = slides[i].filter((l) => l).join(" ");
    const chars = text.length;
    const words = text.split(/\s+/).filter((w) => w.length > 0).length;
    const lineCount = slides[i].filter((l) => l && l.length > 0).length;

    if (rule.maxChars && chars > rule.maxChars) {
      warnings.push({ slide: i + 1, type: "chars", value: chars, max: rule.maxChars });
    }
    if (rule.maxWords && words > rule.maxWords) {
      warnings.push({ slide: i + 1, type: "words", value: words, max: rule.maxWords });
    }
    if (rule.maxLines && lineCount > rule.maxLines) {
      warnings.push({ slide: i + 1, type: "lines", value: lineCount, max: rule.maxLines });
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Slide generation (server-side via Sharp, bgType-aware)
// ---------------------------------------------------------------------------

const LAYOUTS = ["poster_dark", "caption_subtle", "caption_light"];
const POSITIONS = [
  "top-left", "top-center", "top-right",
  "bottom-left", "bottom-center", "bottom-right",
];
const CROPS = ["wide", "zoom-in", "left-focus", "right-focus"];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function assignLayouts() {
  return shuffle(["poster_dark", "poster_dark", "caption_subtle", "caption_subtle", "caption_light", "caption_light"]);
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

function resolveBgPath(slideIndex, bgType) {
  // Type-specific path first
  if (bgType !== "desk") {
    const typePath = join(BG_DIR, bgType, `${slideIndex + 1}.jpg`);
    if (existsSync(typePath)) return typePath;
  }

  // Desk (default) path
  let bgPath = join(BG_DIR, `${slideIndex + 1}.jpg`);
  if (existsSync(bgPath)) return bgPath;

  // Legacy fallback
  bgPath = join(import.meta.dirname, "backgrounds", "master", `${slideIndex + 1}.png`);
  if (existsSync(bgPath)) return bgPath;

  throw new Error(`Background not found for slide ${slideIndex + 1} (${bgType})`);
}

async function generateSlides(slides, bgTypes, brandSlideOnly, libConfig) {
  // Layout consistency: use fixed values from lib config if available
  const layouts = (libConfig && libConfig.fixedLayout)
    ? Array(SLIDE_COUNT).fill(libConfig.fixedLayout)
    : assignLayouts();
  const positions = (libConfig && libConfig.fixedPosition)
    ? Array(SLIDE_COUNT).fill(libConfig.fixedPosition)
    : assignPositions();
  const crops = assignCrops();
  const buffers = [];

  for (let i = 0; i < SLIDE_COUNT; i++) {
    const bgType = bgTypes[i] || "desk";
    const bgPath = resolveBgPath(i, bgType);
    // Brand footer: only on specified slide (or never if -1)
    const showBrand = brandSlideOnly !== undefined ? (i === brandSlideOnly) : false;
    const buf = await composeSlide(bgPath, slides[i], layouts[i], positions[i], crops[i], showBrand, i);
    buffers.push(buf);
    console.log(`  [${i + 1}/6] ${bgType.padEnd(6)} ${layouts[i].padEnd(16)} ${crops[i].padEnd(12)} ${positions[i]}${showBrand ? ' +brand' : ''}`);
  }

  return buffers;
}

// ---------------------------------------------------------------------------
// Postiz upload & post
// ---------------------------------------------------------------------------

async function uploadImage(buffer, filename) {
  const blob = new Blob([buffer], { type: "image/png" });
  const form = new FormData();
  form.append("file", blob, filename);

  const res = await fetch(`${BASE_URL}/upload`, {
    method: "POST",
    headers: { Authorization: API_KEY },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function createTikTokPost(images, caption, title) {
  const scheduleDate = new Date(Date.now() + SCHEDULE_DELAY_MS).toISOString();

  // Build TikTok title: explicit title > caption first line, max 90 chars
  let tiktokTitle = title || "";
  if (!tiktokTitle && caption) {
    tiktokTitle = caption.split("\n")[0];
  }
  if (tiktokTitle.length > 90) {
    tiktokTitle = tiktokTitle.slice(0, 90).replace(/\s+\S*$/, "");
  }

  const payload = {
    type: "schedule",
    date: scheduleDate,
    shortLink: false,
    tags: [],
    posts: [
      {
        integration: { id: TIKTOK_INTEGRATION_ID },
        value: [
          {
            content: caption,
            image: images.map((img) => ({ id: img.id, path: img.path })),
          },
        ],
        settings: {
          __type: "tiktok",
          title: tiktokTitle,
          privacy_level: "SELF_ONLY",
          duet: false,
          stitch: false,
          comment: true,
          autoAddMusic: "no",
          brand_content_toggle: false,
          brand_organic_toggle: false,
          content_posting_method: "UPLOAD",
        },
      },
    ],
  };

  const res = await fetch(`${BASE_URL}/posts`, {
    method: "POST",
    headers: {
      Authorization: API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Post creation failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n=== Auto Post to TikTok ===\n");

  // 1. Load all pattern libraries
  const variants = cliVariant ? [cliVariant.toUpperCase()] : ["W", "A", "B", "C"];
  let allPatterns = [];
  let defaultBgTypes = DEFAULT_BG_TYPES;
  const libConfigs = {};

  for (const v of variants) {
    const lib = loadPatternLib(v);
    if (lib) {
      console.log(`Loaded ${lib.patterns.length} patterns from ${v}.json`);
      // Tag patterns with their source variant
      for (const p of lib.patterns) {
        p._variant = v;
        p._brandSlideOnly = lib.brandSlideOnly;
      }
      allPatterns.push(...lib.patterns);
      libConfigs[v] = lib;
      if (lib.defaultBgTypes) defaultBgTypes = lib.defaultBgTypes;
    }
  }

  if (allPatterns.length === 0) {
    console.error("No patterns found!");
    process.exit(1);
  }

  // 2. Load hooks
  const hooksLib = loadHooks();
  if (hooksLib) {
    console.log(`Loaded ${hooksLib.hooks.length} hook alternatives`);
  }

  // 3. Select pattern
  const pattern = selectPattern(allPatterns);
  let slides = pattern.slides.map((s) => [...s]); // deep copy
  const bgTypes = pattern.bgTypes || defaultBgTypes;
  const patternVariant = pattern._variant || "A";
  const brandSlideOnly = pattern._brandSlideOnly !== undefined ? pattern._brandSlideOnly : -1;

  console.log(`\nSelected: ${pattern.id} [${pattern.category}] variant=${patternVariant}`);
  console.log(`  Hook: "${slides[0].join(" ")}"`);
  console.log(`  BgTypes: ${bgTypes.join(" → ")}`);
  if (brandSlideOnly >= 0) console.log(`  Brand: Slide ${brandSlideOnly + 1} only`);

  // 4. Hook swap (always enabled for auto-post for max variety)
  let hookId = null;
  if (hooksLib) {
    const result = swapHook(slides, hooksLib, patternVariant);
    slides = result.slides;
    hookId = result.hookId;
    if (hookId) {
      console.log(`  Hook swapped → ${hookId} (${result.hookTone}/${result.hookCategory}): "${slides[0].join(" ")}"`);
    }
  }

  // 5. NG filter check
  const ngIssues = ngFilter(slides);
  if (ngIssues.length > 0) {
    for (const issue of ngIssues) {
      if (issue.type === "word_repeat") {
        console.log(`  NG: "${issue.word}" repeated in ${issue.count} slides`);
      } else if (issue.type === "long_hook") {
        console.log(`  NG: Hook has ${issue.words} words (max 12)`);
      }
    }
  }

  // 5b. Slide rules validation
  const libConfig = libConfigs[patternVariant] || null;
  if (libConfig && libConfig.slideRules) {
    const ruleWarnings = validateSlideRules(slides, libConfig.slideRules);
    for (const w of ruleWarnings) {
      console.log(`  SlideRule: slide ${w.slide} ${w.type}=${w.value} exceeds max=${w.max}`);
    }
  }

  // 6. Generate slides
  console.log("\nGenerating slides...");
  if (libConfig && libConfig.fixedLayout) {
    console.log(`  Layout: ${libConfig.fixedLayout} (fixed) / Position: ${libConfig.fixedPosition} (fixed)`);
  }
  const buffers = await generateSlides(slides, bgTypes, brandSlideOnly, libConfig);

  // 7. Upload
  console.log("\nUploading to Postiz...");
  const uploaded = [];
  for (let i = 0; i < SLIDE_COUNT; i++) {
    const name = `slide_${i + 1}.png`;
    process.stdout.write(`  ${name} ... `);
    const result = await uploadImage(buffers[i], name);
    console.log(`OK → ${result.path}`);
    uploaded.push(result);
  }

  // 8. Build caption
  const hook = slides[0].filter((t) => t).join(" ");
  const caption = `${hook}\n\nSimple Memo - one tap, straight to your inbox.\n\n#simplememo #productivity #notetaking #lifehack #iphone`;
  const title = hook; // Hook as TikTok title (max 90 chars enforced in createTikTokPost)

  // 9. Create post
  console.log(`\nCreating TikTok post (scheduled +1 min)...`);
  console.log(`  Title: "${title}"`);
  const result = await createTikTokPost(uploaded, caption, title);
  console.log("Post created:", JSON.stringify(result, null, 2));

  // 10. Record history
  addToHistory(pattern.id);
  console.log(`\nDone! Pattern ${pattern.id} (hook: ${hookId || 'original'}) recorded to history.`);
  console.log(`Caption:\n${caption}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
