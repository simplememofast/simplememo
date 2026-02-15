#!/usr/bin/env node
/**
 * TikTok Slide Image Generator
 *
 * Usage:
 *   OPENAI_API_KEY=sk-proj-... node generate-slide.js
 *
 * Generates a single 1024x1536 TikTok slide image using gpt-image-1.
 */

import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";

// ── Config ──────────────────────────────────────────────────────
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY environment variable is not set.");
  console.error("Usage: OPENAI_API_KEY=sk-proj-... node generate-slide.js");
  process.exit(1);
}

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

// ── Style Template ──────────────────────────────────────────────
const STYLE_TEMPLATE = `
Create a TikTok vertical slide image (portrait orientation, 2:3 ratio).

VISUAL SCENE (this is the main focus — NOT just text on a background):
- Show a realistic scene of a person's hand holding an iPhone, seen from a slightly overhead angle.
- The phone screen should glow softly with a minimal email/memo app interface (blurred or abstracted is fine).
- The setting is a clean, modern desk or table — dark wood or matte black surface.
- Soft ambient lighting: warm desk lamp glow from one side, cool blue fill light from the other.
- Shallow depth of field: the phone and hand are sharp, background is softly blurred.
- A few minimal props in the blurred background: a coffee cup, a notebook, AirPods — suggesting productivity.

TEXT OVERLAY:
- The specified text must appear as a large, bold, white sans-serif overlay on the image.
- Text should be positioned in the upper-center or center of the image.
- Behind the text: a frosted-glass / semi-transparent dark panel (rounded corners, subtle blur) so text is perfectly readable over the photo.
- Text must be the exact English words specified below — no extra words, no labels.

OVERALL MOOD: Premium, editorial, aspirational. Like an ad for a productivity app.
Color grading: slightly desaturated with lifted shadows, subtle blue-teal tint.
No watermarks, no stock photo feel, no cartoons, no flat design.
`.trim();

// ── Slide Content ───────────────────────────────────────────────
const SLIDE_TEXT = `"I forget. Until it's urgent."`;
const SLIDE_INDEX = 0;

// ── Variation Tokens ────────────────────────────────────────────
const VARIATION = {
  framing: "slightly overhead angle, phone tilted 15 degrees",
  palette: "warm amber desk lamp + cool blue ambient, desaturated edit",
  text_box_style: "frosted glass dark panel, center-aligned, large rounded corners",
  background_detail: "clean dark desk, blurred coffee cup and notebook in background",
};

// ── Build Prompt ────────────────────────────────────────────────
function buildPrompt(slideText, slideIndex, variation) {
  const variationDesc = Object.entries(variation)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  return `
${STYLE_TEMPLATE}

--- Slide ${slideIndex + 1} of 6 ---
Exact text to render on the image:
${slideText}

Scene variation for this slide:
${variationDesc}

CRITICAL RULES:
- This must look like a real photograph with text overlaid — NOT a flat graphic or text-only card.
- The text must be large, legible, and perfectly readable.
- Portrait orientation (taller than wide).
`.trim();
}

// ── Generate Image ──────────────────────────────────────────────
async function generateImage() {
  const prompt = buildPrompt(SLIDE_TEXT, SLIDE_INDEX, VARIATION);

  console.log("Generating slide image...");
  console.log("Model: gpt-image-1");
  console.log("Size: 1024x1536");
  console.log("Text:", SLIDE_TEXT);
  console.log("");

  const result = await client.images.generate({
    model: "gpt-image-1",
    prompt: prompt,
    n: 1,
    size: "1024x1536",
    quality: "high",
  });

  const imageData = result.data[0];

  // Output directory
  const outDir = path.join(import.meta.dirname, "out");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `slide_${SLIDE_INDEX}_${timestamp}.png`;
  const outPath = path.join(outDir, filename);

  if (imageData.b64_json) {
    const buffer = Buffer.from(imageData.b64_json, "base64");
    fs.writeFileSync(outPath, buffer);
  } else if (imageData.url) {
    console.log("Downloading from URL...");
    const response = await fetch(imageData.url);
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(outPath, Buffer.from(arrayBuffer));
  } else {
    console.error("Error: No image data returned.");
    process.exit(1);
  }

  console.log(`Image saved: ${outPath}`);
  console.log(`Size: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);

  // Save generation log
  const logPath = path.join(outDir, `slide_${SLIDE_INDEX}_${timestamp}.json`);
  fs.writeFileSync(
    logPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        model: "gpt-image-1",
        size: "1024x1536",
        slide_index: SLIDE_INDEX,
        slide_text: SLIDE_TEXT,
        variation: VARIATION,
        style_template: STYLE_TEMPLATE,
        full_prompt: prompt,
        output_file: filename,
        revised_prompt: imageData.revised_prompt || null,
      },
      null,
      2
    )
  );
  console.log(`Log saved: ${logPath}`);
}

// ── Run ─────────────────────────────────────────────────────────
generateImage().catch((err) => {
  console.error("Generation failed:", err.message);
  if (err.status) console.error("Status:", err.status);
  if (err.error) console.error("Detail:", JSON.stringify(err.error, null, 2));
  process.exit(1);
});
