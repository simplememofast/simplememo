#!/usr/bin/env node
/**
 * Post slides to TikTok draft via Postiz API.
 *
 * Usage:
 *   node post-to-tiktok.js <slides-dir> [caption]
 *
 * Example:
 *   node post-to-tiktok.js out/slides_A_2026-02-15T12-02-06
 *   node post-to-tiktok.js out/slides_A_2026-02-15T12-02-06 "Custom caption here"
 *
 * Environment:
 *   POSTIZ_API_KEY  – Postiz API key (or set in .env)
 *
 * The script:
 *   1. Reads slide_1.png … slide_6.png from the directory
 *   2. Uploads each image to Postiz
 *   3. Creates a scheduled TikTok post (far-future date = draft)
 */

import { readFileSync, existsSync, createReadStream } from "fs";
import { resolve, join } from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.postiz.com/public/v1";
const TIKTOK_INTEGRATION_ID = "cmlm8shaq014jns0yd392f591";
const SLIDE_COUNT = 6;
const DRAFT_DATE = "2099-12-31T00:00:00.000Z"; // far-future = stays as draft

// Load .env manually (no extra dependency)
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
if (!API_KEY) {
  console.error("Error: POSTIZ_API_KEY not set. Add it to tools/.env or export it.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function uploadImage(filePath) {
  const blob = new Blob([readFileSync(filePath)], { type: "image/png" });
  const form = new FormData();
  form.append("file", blob, filePath.split("/").pop());

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
  const payload = {
    type: "schedule",
    date: DRAFT_DATE,
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
// Default caption from slide_plan.json
// ---------------------------------------------------------------------------

function buildCaption(slidesDir) {
  const planPath = join(slidesDir, "slide_plan.json");
  if (!existsSync(planPath)) {
    return "Simple Memo - one tap, straight to your inbox.\n\n#simplememo #productivity #notetaking #lifehack #iphone";
  }
  const plan = JSON.parse(readFileSync(planPath, "utf-8"));
  const hook = plan.slides?.[0]?.text?.join(" ") || "";
  return `${hook}\n\nSimple Memo - one tap, straight to your inbox.\n\n#simplememo #productivity #notetaking #lifehack #iphone`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const slidesDir = resolve(process.argv[2] || ".");
  const caption = process.argv[3] || buildCaption(slidesDir);

  // Verify slides exist
  const slidePaths = [];
  for (let i = 1; i <= SLIDE_COUNT; i++) {
    const p = join(slidesDir, `slide_${i}.png`);
    if (!existsSync(p)) {
      console.error(`Missing: ${p}`);
      process.exit(1);
    }
    slidePaths.push(p);
  }

  console.log(`Uploading ${SLIDE_COUNT} slides from ${slidesDir} …`);

  // Upload all images
  const uploaded = [];
  for (const p of slidePaths) {
    const name = p.split("/").pop();
    process.stdout.write(`  ${name} … `);
    const result = await uploadImage(p);
    console.log(`✓ ${result.path}`);
    uploaded.push(result);
  }

  // Create post
  console.log("\nCreating TikTok draft post …");
  const result = await createTikTokPost(uploaded, caption);
  console.log("✓ Post created:", JSON.stringify(result, null, 2));
  console.log(`\nCaption:\n${caption}`);
  console.log("\nDone! Check Postiz dashboard to review and publish.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
