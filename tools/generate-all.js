#!/usr/bin/env node
/**
 * TikTok 6-Slide Generator
 *
 * Usage:
 *   OPENAI_API_KEY=sk-proj-... node generate-all.js [--variant=B] [--day=2]
 */

import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";

// ── Config ──────────────────────────────────────────────────────
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY is not set.");
  process.exit(1);
}

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

// ── Args ────────────────────────────────────────────────────────
const args = process.argv.slice(2).join(" ");
const variant = /--variant=B/i.test(args) ? "B" : "A";
const day = /--day=2/i.test(args) ? 2 : 1;

// ── Scripts ─────────────────────────────────────────────────────
const SCRIPTS = {
  A: [
    '"I forget. Until it\'s urgent."',
    '"So I made a rule: email it now."',
    '"One tap → it\'s in my inbox."',
    '"Inbox = can\'t-ignore-it."',
    '"No apps. No lists. Just friction."',
    '"What\'s your \'can\'t-ignore-it\' system?"',
  ],
  B: [
    '"Procrastination: my cardio."',
    '"I don\'t need motivation."',
    '"I need friction."',
    '"So I email the task. Instantly."',
    '"Now it stares at me in my inbox."',
    '"What\'s your \'can\'t-ignore-it\' system?"',
  ],
};

const slideTexts = SCRIPTS[variant];

// ── Style Template ──────────────────────────────────────────────
const STYLE_TEMPLATE = `
Create a TikTok vertical slide image (portrait, 2:3 ratio).

VISUAL SCENE (real photograph, NOT flat graphics):
- A person's hand holding an iPhone, slightly overhead angle.
- Phone screen glows softly with a minimal app interface (blurred/abstracted).
- Clean modern desk — dark surface.
- Soft ambient lighting: warm from one side, cool blue fill from the other.
- Shallow depth of field: phone sharp, background softly blurred.
- Minimal props in blurred background suggesting productivity.

TEXT OVERLAY:
- Large bold white sans-serif text, upper-center or center.
- Behind text: frosted-glass semi-transparent dark panel (rounded corners).
- Only the specified text — no extra words.

MOOD: Premium, editorial, aspirational productivity app ad.
Color grading: slightly desaturated, lifted shadows, subtle blue-teal tint.
No watermarks, no stock photo feel, no cartoons, no flat design.
`.trim();

// ── Day2 Variation Tokens ───────────────────────────────────────
const DAY1_VARIATIONS = [
  { framing: "slightly overhead, phone tilted right", palette: "warm amber + cool blue", background_detail: "coffee cup, notebook blurred", text_box_style: "frosted dark panel, center" },
  { framing: "eye-level, phone held upright", palette: "warm amber + cool blue", background_detail: "coffee cup, notebook blurred", text_box_style: "frosted dark panel, center" },
  { framing: "close-up on phone screen, fingers visible", palette: "warm amber + cool blue", background_detail: "minimal desk, soft bokeh", text_box_style: "frosted dark panel, upper area" },
  { framing: "overhead flat-lay, phone on desk", palette: "warm amber + cool blue", background_detail: "keyboard edge, plant leaf blurred", text_box_style: "frosted dark panel, center" },
  { framing: "slightly overhead, phone tilted left", palette: "warm amber + cool blue", background_detail: "airpods, notebook blurred", text_box_style: "frosted dark panel, center" },
  { framing: "medium shot, both hands on phone", palette: "warm amber + cool blue", background_detail: "coffee cup, clean desk", text_box_style: "frosted dark panel, lower-center" },
];

const DAY2_VARIATIONS = [
  { framing: "top-down flat lay, phone centered on desk", palette: "cool teal + soft pink accent", background_detail: "minimalist desk, single succulent plant", text_box_style: "translucent light panel with blur, top-aligned" },
  { framing: "close-up, one thumb on screen", palette: "cool teal + soft pink accent", background_detail: "window light casting shadows", text_box_style: "translucent light panel with blur, center" },
  { framing: "over-the-shoulder, looking down at phone", palette: "cool teal + soft pink accent", background_detail: "cozy workspace, warm blanket edge", text_box_style: "translucent light panel with blur, upper" },
  { framing: "side angle, phone resting on notebook", palette: "cool teal + soft pink accent", background_detail: "pen, glasses blurred in foreground", text_box_style: "translucent light panel with blur, center" },
  { framing: "inbox UI close-up on phone screen (the odd slide)", palette: "monochrome with single blue accent", background_detail: "phone fills most of the frame, dark background", text_box_style: "small subtle text overlay at top" },
  { framing: "wide shot, person at desk with phone", palette: "cool teal + soft pink accent", background_detail: "modern home office, bookshelves blurred", text_box_style: "large frosted panel, center" },
];

const variations = day === 2 ? DAY2_VARIATIONS : DAY1_VARIATIONS;

// ── Build Prompt ────────────────────────────────────────────────
function buildPrompt(text, index) {
  const v = variations[index];
  const vDesc = Object.entries(v).map(([k, val]) => `- ${k}: ${val}`).join("\n");

  return `
${STYLE_TEMPLATE}

--- Slide ${index + 1} of 6 ---
Exact text to render:
${text}

Scene variation:
${vDesc}

RULES:
- Real photograph with text overlay — NOT a flat graphic.
- Text must be large, legible, perfectly readable.
- Portrait orientation.
- Each slide should feel like part of a cohesive series but with subtle scene variation.
`.trim();
}

// ── Generate ────────────────────────────────────────────────────
async function run() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = path.join(import.meta.dirname, "out", `batch_${variant}_day${day}_${timestamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n  Variant: ${variant} | Day: ${day}`);
  console.log(`  Output:  ${outDir}\n`);

  const results = [];

  for (let i = 0; i < 6; i++) {
    const text = slideTexts[i];
    const prompt = buildPrompt(text, i);

    console.log(`  [${i + 1}/6] Generating: ${text}`);
    const t0 = Date.now();

    const result = await client.images.generate({
      model: "gpt-image-1",
      prompt: prompt,
      n: 1,
      size: "1024x1536",
      quality: "high",
    });

    const imageData = result.data[0];
    const filename = `slide_${i}.png`;
    const outPath = path.join(outDir, filename);

    if (imageData.b64_json) {
      fs.writeFileSync(outPath, Buffer.from(imageData.b64_json, "base64"));
    } else if (imageData.url) {
      const resp = await fetch(imageData.url);
      fs.writeFileSync(outPath, Buffer.from(await resp.arrayBuffer()));
    }

    const size = (fs.statSync(outPath).size / 1024).toFixed(0);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`         → ${size}KB (${sec}s)`);

    results.push({
      slide_index: i,
      slide_text: text,
      variation: variations[i],
      output_file: filename,
      file_size_kb: parseInt(size),
      generation_time_s: parseFloat(sec),
      revised_prompt: imageData.revised_prompt || null,
    });
  }

  // Save batch log
  const logData = {
    timestamp: new Date().toISOString(),
    model: "gpt-image-1",
    size: "1024x1536",
    variant,
    day,
    style_template: STYLE_TEMPLATE,
    slides: results,
  };

  const logPath = path.join(outDir, "batch_log.json");
  fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));

  console.log(`\n  Done! ${results.length} slides saved to:`);
  console.log(`  ${outDir}\n`);
}

run().catch((err) => {
  console.error("Failed:", err.message);
  if (err.status) console.error("Status:", err.status);
  process.exit(1);
});
