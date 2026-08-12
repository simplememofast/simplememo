#!/usr/bin/env node
/**
 * Generate — and decode back — the desktop QR codes under assets/img/.
 *
 *   npm i --no-save qrcode jsqr
 *   node scripts/generate-qr-codes.mjs [--check]
 *
 * The codes exist because roughly a third of App Store clicks come from
 * desktop, where the badge opens a page the visitor cannot install from
 * (21 of 60 in the 2026-07-13..08-09 GA4 window). See
 * growth/reports/2026-08-10-desktop-dead-end.md.
 *
 * They are generated rather than hand-placed for the same reason the GSC
 * snapshots are committed: an artefact nobody can reproduce is one nobody can
 * check. `--check` re-derives the module matrix from the SVG that actually
 * shipped and decodes it with an independent decoder, so an encoder fault or a
 * bad write shows up rather than being taken on trust.
 *
 * This repo has no package.json, so the two dependencies are not installed by
 * default and this script is not wired into CI. Run it by hand after changing
 * a campaign token or adding a page.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets/img');
const APP_ID = 'id6758438948';

/**
 * Provider token from App Store Connect's own campaign-link generator
 * (Analytics → Acquisition → Campaigns → +). Not a secret — it ships in every
 * public campaign link — and NOT the vendor number, which is a different
 * identifier used for sales reports. Without it, App Analytics recorded nothing
 * for any `ct` token: the Campaigns page read "not enough data" across 90 days.
 */
const PROVIDER_TOKEN = '128498560';

/**
 * Pages carrying a desktop QR. `en: true` means the page ships both languages
 * in one document and needs a code per store front.
 */
export const QR_PAGES = [
  { slug: 'vs-logseq',                   en: true },
  { slug: 'obsidian',                    en: false },
  { slug: 'blog-best-memo-apps-2026',    en: false },
  { slug: 'vs-dynalist',                 en: true },
  { slug: 'blog-free-memo-apps-ranking', en: true },
  { slug: 'blog-offline-memo-apps',      en: true },
  { slug: 'method-second-brain',         en: true },
  { slug: 'vs-capacities',               en: true },
  { slug: 'apple-watch',                 en: false },
  { slug: 'obsidian-logseq',             en: true },
  { slug: 'obsidian-getting-started',    en: true },
];

/** Campaign token follows the site convention: <slug>-<lang>__<placement>. */
export const storeUrl = (slug, lang) =>
  `https://apps.apple.com/${lang === 'jp' ? 'jp' : 'us'}/app/${APP_ID}`
  + `?pt=${PROVIDER_TOKEN}&ct=${slug}-${lang}__qr&mt=8`;

const fileFor = (slug, lang) => `qr-${slug}-${lang === 'jp' ? 'ja' : 'en'}.svg`;

const targets = QR_PAGES.flatMap(({ slug, en }) =>
  (en ? ['jp', 'en'] : ['jp']).map((lang) => ({ file: fileFor(slug, lang), url: storeUrl(slug, lang) }))
);

/* ── generate ──────────────────────────────────────────────────────────── */

async function generate() {
  const { default: QRCode } = await import('qrcode');
  for (const { file, url } of targets) {
    const svg = await QRCode.toString(url, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      // Four modules is the spec's quiet zone. An earlier revision of these
      // codes used 1 to make the code look larger in the same box; scanners
      // tolerate it unevenly, and the CSS padding around the image is not a
      // substitute because the SVG travels without it.
      margin: 4,
      width: 264,
    });
    fs.writeFileSync(path.join(OUT, file), svg);
    console.log(`  wrote ${file}`);
  }
}

/* ── check ─────────────────────────────────────────────────────────────── */

/** SVG path of horizontal runs → boolean module matrix. */
function matrixFromSvg(svg) {
  const size = Number(svg.match(/viewBox="0 0 (\d+)/)[1]);
  const d = svg.match(/<path stroke="[^"]*" d="([^"]*)"/)[1];
  const m = Array.from({ length: size }, () => new Uint8Array(size));
  let x = 0;
  let y = 0;
  for (const [, cmd, args] of d.matchAll(/([MmhH])\s*([-\d.\s]*)/g)) {
    const n = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd === 'M') { [x, y] = n; }
    else if (cmd === 'm') { x += n[0]; y += n[1]; }
    else if (cmd === 'h') { for (let i = 0; i < n[0]; i++) m[Math.floor(y)][x + i] = 1; x += n[0]; }
    else if (cmd === 'H') { for (let i = x; i < n[0]; i++) m[Math.floor(y)][i] = 1; x = n[0]; }
  }
  return { m, size };
}

/** Modules → RGBA. Extra white padding keeps a thin quiet zone from being
 *  mistaken for a content fault; the quiet zone is measured separately. */
function toRgba(m, size, scale = 8, pad = 4) {
  const w = (size + pad * 2) * scale;
  const data = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!m[r][c]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = (((r + pad) * scale + dy) * w + ((c + pad) * scale + dx)) * 4;
          data[px] = data[px + 1] = data[px + 2] = 0;
        }
      }
    }
  }
  return { data, w };
}

const MIN_QUIET_ZONE = 4;

async function check() {
  const { default: jsQR } = await import('jsqr');
  let bad = 0;
  for (const { file, url } of targets) {
    const p = path.join(OUT, file);
    if (!fs.existsSync(p)) { console.log(`  MISSING   ${file}`); bad++; continue; }
    const { m, size } = matrixFromSvg(fs.readFileSync(p, 'utf8'));
    const { data, w } = toRgba(m, size);
    const res = jsQR(data, w, w);

    let quiet = 0;
    while (quiet < size && !m[quiet].some(Boolean)) quiet++;

    if (!res) { console.log(`  UNREADABLE ${file}`); bad++; continue; }
    if (res.data !== url) {
      console.log(`  MISMATCH  ${file}\n     decoded:  ${res.data}\n     expected: ${url}`);
      bad++;
      continue;
    }
    if (quiet < MIN_QUIET_ZONE) {
      console.log(`  QUIET ZONE ${quiet} < ${MIN_QUIET_ZONE}  ${file}`);
      bad++;
      continue;
    }
    console.log(`  ok  quiet=${quiet}  ${file}`);
  }
  console.log(`\n${targets.length - bad} verified, ${bad} failed.`);
  return bad;
}

const mode = process.argv.includes('--check') ? 'check' : 'generate';
try {
  if (mode === 'generate') { await generate(); console.log(`\n${targets.length} code(s) written. Now run with --check.`); }
  else process.exit(await check() ? 1 : 0);
} catch (e) {
  if (e.code === 'ERR_MODULE_NOT_FOUND') {
    console.error(`Missing dependency. This repo has no package.json, so install them ad hoc:\n\n  npm i --no-save qrcode jsqr\n`);
    process.exit(2);
  }
  throw e;
}
