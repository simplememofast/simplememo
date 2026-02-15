#!/usr/bin/env node
/**
 * Auto-post: pick a random pattern, generate 6 slides, post to TikTok.
 *
 * Usage:
 *   node auto-post.js
 *
 * Environment:
 *   POSTIZ_API_KEY  – Postiz API key (or set in .env)
 *
 * The script:
 *   1. Loads pattern library (admin/patterns/A.json)
 *   2. Picks a random pattern avoiding recent N
 *   3. Generates 6 slides via compose-slides.js
 *   4. Uploads & posts to TikTok via Postiz
 *   5. Logs pattern_id and result
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
const PATTERNS_PATH = join(ROOT, "admin", "patterns", "A.json");
const BG_DIR = join(ROOT, "admin", "bg");
const HISTORY_PATH = join(import.meta.dirname, ".auto-post-history.json");

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
// History (avoid recent patterns)
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
// Slide generation (server-side via Sharp)
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

async function generateSlides(pattern) {
  const layouts = assignLayouts();
  const positions = assignPositions();
  const crops = assignCrops();
  const buffers = [];

  for (let i = 0; i < SLIDE_COUNT; i++) {
    // Background: try .jpg first (admin/bg), then .png (tools/backgrounds/master)
    let bgPath = join(BG_DIR, `${i + 1}.jpg`);
    if (!existsSync(bgPath)) {
      bgPath = join(import.meta.dirname, "backgrounds", "master", `${i + 1}.png`);
    }
    if (!existsSync(bgPath)) {
      throw new Error(`Background not found for slide ${i + 1}`);
    }

    const buf = await composeSlide(bgPath, pattern.slides[i], layouts[i], positions[i], crops[i], false);
    buffers.push(buf);
    console.log(`  [${i + 1}/6] ${layouts[i].padEnd(16)} ${crops[i].padEnd(12)} ${positions[i]}`);
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
  console.log("\n=== Auto Post to TikTok ===\n");

  // 1. Load patterns
  if (!existsSync(PATTERNS_PATH)) {
    console.error(`Patterns file not found: ${PATTERNS_PATH}`);
    process.exit(1);
  }
  const lib = JSON.parse(readFileSync(PATTERNS_PATH, "utf-8"));
  console.log(`Loaded ${lib.patterns.length} patterns`);

  // 2. Select pattern
  const pattern = selectPattern(lib.patterns);
  console.log(`Selected: ${pattern.id} [${pattern.category}] — "${pattern.slides[0].join(" ")}"`);

  // 3. Generate slides
  console.log("\nGenerating slides...");
  const buffers = await generateSlides(pattern);

  // 4. Upload
  console.log("\nUploading to Postiz...");
  const uploaded = [];
  for (let i = 0; i < SLIDE_COUNT; i++) {
    const name = `slide_${i + 1}.png`;
    process.stdout.write(`  ${name} ... `);
    const result = await uploadImage(buffers[i], name);
    console.log(`OK → ${result.path}`);
    uploaded.push(result);
  }

  // 5. Build caption
  const hook = pattern.slides[0].filter((t) => t).join(" ");
  const caption = `${hook}\n\nSimple Memo - one tap, straight to your inbox.\n\n#simplememo #productivity #notetaking #lifehack #iphone`;

  // 6. Create post
  console.log("\nCreating TikTok post (scheduled +1 min)...");
  const result = await createTikTokPost(uploaded, caption);
  console.log("Post created:", JSON.stringify(result, null, 2));

  // 7. Record history
  addToHistory(pattern.id);
  console.log(`\nDone! Pattern ${pattern.id} recorded to history.`);
  console.log(`Caption:\n${caption}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
