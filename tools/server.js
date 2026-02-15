#!/usr/bin/env node
/**
 * Admin Server — TikTok Slide Builder
 *
 * Usage:  node server.js
 * Open:   http://localhost:3456
 */

import express from "express";
import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
import { generateSet, composeSlide } from "./compose-slides.js";

const app = express();
const PORT = 3456;

app.use(express.json());

// Serve admin UI
app.use("/admin", express.static(path.join(import.meta.dirname, "..", "admin")));

// Serve generated images
app.use("/slides", express.static(path.join(import.meta.dirname, "out")));

// Latest generation state
let latestDir = null;
let latestPlan = null;

// ── Generate 6 slides ───────────────────────────────────────────
app.post("/api/generate", async (req, res) => {
  try {
    const { variant = "A", brand = false } = req.body || {};
    console.log(`[generate] variant=${variant} brand=${brand}`);

    const t0 = Date.now();
    const { plan, buffers } = await generateSet({ variant, brand });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dirName = `slides_${variant}_${timestamp}`;
    const outDir = path.join(import.meta.dirname, "out", dirName);
    fs.mkdirSync(outDir, { recursive: true });

    const files = [];
    for (let i = 0; i < 6; i++) {
      const filename = `slide_${i + 1}.png`;
      fs.writeFileSync(path.join(outDir, filename), buffers[i]);
      files.push({
        index: i,
        filename,
        url: `/slides/${dirName}/${filename}`,
        size_kb: Math.round(buffers[i].length / 1024),
      });
    }

    const logData = { timestamp: new Date().toISOString(), variant, brand, output_size: "1080x1920", slides: plan };
    fs.writeFileSync(path.join(outDir, "slide_plan.json"), JSON.stringify(logData, null, 2));

    latestDir = outDir;
    latestPlan = logData;

    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[generate] done in ${sec}s → ${dirName}`);

    res.json({ ok: true, dir: dirName, files, plan: logData, time_s: parseFloat(sec) });
  } catch (e) {
    console.error("[generate] error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Regenerate single slide ─────────────────────────────────────
app.post("/api/regenerate", async (req, res) => {
  try {
    const { dir, index, variant = "A", brand = false } = req.body || {};
    if (index < 0 || index > 5) return res.status(400).json({ ok: false, error: "index must be 0-5" });

    const outDir = path.join(import.meta.dirname, "out", dir);
    if (!fs.existsSync(outDir)) return res.status(404).json({ ok: false, error: "dir not found" });

    // Re-read plan
    const planPath = path.join(outDir, "slide_plan.json");
    const plan = JSON.parse(fs.readFileSync(planPath, "utf-8"));
    const slide = plan.slides[index];

    const bgDir = path.join(import.meta.dirname, "backgrounds", "master");
    const bgFile = path.join(bgDir, slide.background);

    // Regenerate with new random layout/position (keep same crop for consistency, or randomize)
    const LAYOUTS = ["poster_dark", "caption_subtle", "caption_light"];
    const POSITIONS = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"];
    const newLayout = LAYOUTS[Math.floor(Math.random() * LAYOUTS.length)];
    const newPosition = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];

    const buf = await composeSlide(bgFile, slide.text, newLayout, newPosition, slide.crop_variant, brand);

    const filename = `slide_${index + 1}.png`;
    fs.writeFileSync(path.join(outDir, filename), buf);

    // Update plan
    plan.slides[index].layout_variant = newLayout;
    plan.slides[index].text_position = newPosition;
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));

    res.json({
      ok: true,
      index,
      url: `/slides/${dir}/${filename}?t=${Date.now()}`,
      layout: newLayout,
      position: newPosition,
      size_kb: Math.round(buf.length / 1024),
    });
  } catch (e) {
    console.error("[regenerate] error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── ZIP download ────────────────────────────────────────────────
app.get("/api/zip/:dir", (req, res) => {
  const outDir = path.join(import.meta.dirname, "out", req.params.dir);
  if (!fs.existsSync(outDir)) return res.status(404).send("Not found");

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${req.params.dir}.zip"`);

  const archive = archiver("zip", { zlib: { level: 5 } });
  archive.pipe(res);

  for (let i = 1; i <= 6; i++) {
    const f = path.join(outDir, `slide_${i}.png`);
    if (fs.existsSync(f)) archive.file(f, { name: `slide_${i}.png` });
  }

  const planFile = path.join(outDir, "slide_plan.json");
  if (fs.existsSync(planFile)) archive.file(planFile, { name: "slide_plan.json" });

  archive.finalize();
});

// ── Start ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  TikTok Slide Builder`);
  console.log(`  http://localhost:${PORT}/admin/\n`);
});
