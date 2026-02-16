#!/usr/bin/env node
/**
 * Auto-post v2: pick a random pattern from A/B/C, optionally swap hook,
 * generate 6 slides with visual type awareness, post to TikTok.
 *
 * Usage:
 *   node auto-post.js [--variant=A|B|C] [--hook-swap]
 *
 * Environment:
 *   POSTIZ_API_KEY  – Postiz API key (or set in .env)
 *
 * The script:
 *   1. Loads pattern libraries (A/B/C) and hooks
 *   2. Picks a random pattern avoiding recent N
 *   3. Optionally swaps slide 1 with a random hook
 *   4. Generates 6 slides via compose-slides.js (bgType-aware)
 *   5. Uploads & posts to TikTok via Postiz
 *   6. Logs pattern_id, hook_id, and result
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
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
const PATTERNS_DIR = join(ROOT, "admin", "patterns");
const BG_DIR = join(ROOT, "admin", "bg");
const HISTORY_PATH = join(import.meta.dirname, ".auto-post-history.json");
const HOOK_HISTORY_PATH = join(import.meta.dirname, ".auto-hook-history.json");
const DEFAULT_BG_TYPES = ["desk", "desk", "hand", "hand", "proof", "desk"];

// Parse CLI args
const args = process.argv.slice(2).join(" ");
const cliVariant = (args.match(/--variant=([ABC])/i) || [, null])[1];
const hookSwapEnabled = /--hook-swap/i.test(args);

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
  writeFileSync(HOOK_HISTORY_PATH, JSON.stringify(h.slice(0, 50)));
}

// ---------------------------------------------------------------------------
// Load pattern libraries
// ---------------------------------------------------------------------------

function loadPatternLib(variant) {
  const path = join(PATTERNS_DIR, `${variant}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

function loadHooks() {
  const path = join(PATTERNS_DIR, "hooks.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

// ---------------------------------------------------------------------------
// Pattern selection (multi-variant, weighted, avoid recent)
// ---------------------------------------------------------------------------

function selectPattern(allPatterns) {
  const recent = getHistory().slice(0, AVOID_RECENT_N);

  let candidates = allPatterns.filter((p) => !recent.includes(p.id));
  if (candidates.length === 0) {
    console.log("  All patterns used recently, resetting.");
    candidates = allPatterns;
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
// Hook swap
// ---------------------------------------------------------------------------

function swapHook(slides, hooksLib) {
  if (!hooksLib || !hooksLib.hooks || hooksLib.hooks.length === 0) {
    return { slides, hookId: null };
  }
  const recentHooks = getHookHistory().slice(0, 10);
  let available = hooksLib.hooks.filter((h) => !recentHooks.includes(h.id));
  if (available.length === 0) available = hooksLib.hooks;

  const pick = available[Math.floor(Math.random() * available.length)];
  const newSlides = [...slides];
  newSlides[0] = pick.text;
  addToHookHistory(pick.id);
  return { slides: newSlides, hookId: pick.id, hookTone: pick.tone };
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
// Slide generation (server-side via Sharp, bgType-aware)
// ---------------------------------------------------------------------------

const CROPS = ["wide", "zoom-in", "left-focus", "right-focus"];

// Slide-specific layout rules (matches client-side)
const SLIDE_LAYOUT_RULES = {
  0: { layouts: ["poster_dark", "poster_dark", "caption_subtle"], positions: ["top-center", "top-left", "top-right"] },
  1: { layouts: ["poster_dark", "caption_subtle", "caption_light"], positions: ["top-left", "top-center", "bottom-left"] },
  2: { layouts: ["caption_subtle", "poster_dark", "caption_light"], positions: ["bottom-left", "bottom-center", "top-left"] },
  3: { layouts: ["caption_subtle", "poster_dark", "caption_light"], positions: ["top-right", "top-center", "bottom-right"] },
  4: { layouts: ["poster_dark", "caption_subtle"], positions: ["bottom-center", "bottom-left", "bottom-right"] },
  5: { layouts: ["poster_dark", "caption_light"], positions: ["bottom-center", "top-center"] },
};

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function assignLayouts() {
  return Array.from({ length: 6 }, (_, i) => pickRandom(SLIDE_LAYOUT_RULES[i].layouts));
}

function assignPositions() {
  return Array.from({ length: 6 }, (_, i) => pickRandom(SLIDE_LAYOUT_RULES[i].positions));
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

async function generateSlides(slides, bgTypes) {
  const layouts = assignLayouts();
  const positions = assignPositions();
  const crops = assignCrops();
  const buffers = [];

  for (let i = 0; i < SLIDE_COUNT; i++) {
    const bgType = bgTypes[i] || "desk";
    const bgPath = resolveBgPath(i, bgType);
    const buf = await composeSlide(bgPath, slides[i], layouts[i], positions[i], crops[i], false);
    buffers.push(buf);
    console.log(`  [${i + 1}/6] ${bgType.padEnd(6)} ${layouts[i].padEnd(16)} ${crops[i].padEnd(12)} ${positions[i]}`);
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

async function createTikTokPost(images, caption) {
  const scheduleDate = new Date(Date.now() + SCHEDULE_DELAY_MS).toISOString();

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
  console.log("\n=== Auto Post to TikTok v2 ===\n");

  // 1. Load all pattern libraries
  const variants = cliVariant ? [cliVariant.toUpperCase()] : ["A", "B", "C"];
  let allPatterns = [];
  let defaultBgTypes = DEFAULT_BG_TYPES;

  for (const v of variants) {
    const lib = loadPatternLib(v);
    if (lib) {
      console.log(`Loaded ${lib.patterns.length} patterns from ${v}.json`);
      allPatterns.push(...lib.patterns);
      if (lib.defaultBgTypes) defaultBgTypes = lib.defaultBgTypes;
    }
  }

  if (allPatterns.length === 0) {
    console.error("No patterns found!");
    process.exit(1);
  }

  console.log(`Total: ${allPatterns.length} patterns across ${variants.join("/")}`);

  // 2. Load hooks
  const hooksLib = loadHooks();
  if (hooksLib) {
    console.log(`Loaded ${hooksLib.hooks.length} hook alternatives`);
  }

  // 3. Select pattern
  const pattern = selectPattern(allPatterns);
  let slides = pattern.slides.map((s) => [...s]); // deep copy
  const bgTypes = pattern.bgTypes || defaultBgTypes;

  console.log(`\nSelected: ${pattern.id} [${pattern.category}]`);
  console.log(`  Hook: "${slides[0].join(" ")}"`);
  console.log(`  BgTypes: ${bgTypes.join(" → ")}`);

  // 4. Hook swap (always enabled for auto-post for max variety)
  let hookId = null;
  if (hooksLib) {
    const result = swapHook(slides, hooksLib);
    slides = result.slides;
    hookId = result.hookId;
    if (hookId) {
      console.log(`  Hook swapped → ${hookId} (${result.hookTone}): "${slides[0].join(" ")}"`);
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

  // 6. Generate slides
  console.log("\nGenerating slides...");
  const buffers = await generateSlides(slides, bgTypes);

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

  // 9. Create post
  console.log("\nCreating TikTok post (scheduled +1 min)...");
  const result = await createTikTokPost(uploaded, caption);
  console.log("Post created:", JSON.stringify(result, null, 2));

  // 10. Record history
  addToHistory(pattern.id);
  console.log(`\nDone! Pattern ${pattern.id}${hookId ? ` + hook ${hookId}` : ""} recorded.`);
  console.log(`Caption:\n${caption}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
