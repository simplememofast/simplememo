/**
 * Search Console snapshot store + the expected-CTR model everything else
 * measures against.
 *
 * A snapshot is one directory under growth/data/gsc/<label>/ holding
 * `meta.json` plus one JSON file per dimension. Snapshots are committed, so
 * "what did the data look like when we made that call" is answerable from git
 * instead of from someone's memory of a dashboard.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const GSC_DIR = path.join(ROOT, 'growth/data/gsc');

/**
 * Fallback CTR-by-position curve, used only until the site's own data can
 * support a derived curve (see `buildCtrCurve`). Reference values for Japanese
 * informational SERPs — deliberately conservative, because over-stating
 * expected CTR manufactures "opportunities" that are really just normal
 * performance.
 */
export const REFERENCE_CTR_CURVE = {
  1: 0.28, 2: 0.15, 3: 0.10, 4: 0.07, 5: 0.055,
  6: 0.043, 7: 0.034, 8: 0.028, 9: 0.023, 10: 0.020,
  11: 0.016, 12: 0.014, 13: 0.012, 14: 0.011, 15: 0.010,
  16: 0.009, 17: 0.008, 18: 0.007, 19: 0.007, 20: 0.006,
};

/** Positions past 20 are a long flat tail; one value avoids fake precision. */
const TAIL_CTR = 0.004;

/** Minimum impressions in a position bucket before we trust its own CTR. */
const MIN_BUCKET_IMPRESSIONS = 500;

export function listSnapshots() {
  if (!fs.existsSync(GSC_DIR)) return [];
  return fs.readdirSync(GSC_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => fs.existsSync(path.join(GSC_DIR, name, 'meta.json')))
    .sort();
}

export function loadSnapshot(label) {
  const dir = path.join(GSC_DIR, label);
  const metaPath = path.join(dir, 'meta.json');
  if (!fs.existsSync(metaPath)) throw new Error(`no such GSC snapshot: ${label}`);
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const read = (name) => {
    const p = path.join(dir, `${name}.json`);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
  };
  return {
    label,
    meta,
    queries: read('queries'),
    pages: read('pages'),
    queryPages: read('query-pages'),
  };
}

/** Newest snapshot, or null when none has been ingested yet. */
export function latestSnapshot() {
  const all = listSnapshots();
  return all.length ? loadSnapshot(all[all.length - 1]) : null;
}

/** The snapshot before `label` — the baseline for period-over-period deltas. */
export function previousSnapshot(label) {
  const all = listSnapshots();
  const i = all.indexOf(label);
  return i > 0 ? loadSnapshot(all[i - 1]) : null;
}

/**
 * Weighted pool-adjacent-violators: the closest non-increasing fit to `values`.
 *
 * Expected CTR has to fall as position gets worse — that is what "expected"
 * means here. A curve derived from one small site does not come out that way:
 * each bucket is dominated by whichever handful of pages happen to sit in it,
 * so one exceptional page lifts its whole position. Left alone, the 2026-08-09
 * snapshot expected 9.8% at position 5 and 1.4% at position 7, which quietly
 * inverts every detector downstream — a page at 7 could not register a CTR gap
 * however badly it did, while an ordinary page at 10 looked like a crisis.
 */
function isotonicNonIncreasing(values, weights) {
  const blocks = values.map((v, i) => ({ sum: v * weights[i], w: weights[i], n: 1 }));
  for (let i = 1; i < blocks.length; i++) {
    while (i > 0 && blocks[i - 1].sum / blocks[i - 1].w < blocks[i].sum / blocks[i].w) {
      blocks[i - 1].sum += blocks[i].sum;
      blocks[i - 1].w += blocks[i].w;
      blocks[i - 1].n += blocks[i].n;
      blocks.splice(i, 1);
      i--;
    }
  }
  const out = [];
  for (const b of blocks) for (let k = 0; k < b.n; k++) out.push(b.sum / b.w);
  return out;
}

/**
 * Derive expected CTR by position from the site's own rows.
 *
 * Preferred over the reference table because SimpleMemo's SERPs are mostly
 * Japanese informational queries where the generic curves (built from
 * English-language, commercially-skewed samples) run high. A bucket falls back
 * to the reference value when it has too little volume to be believable, and
 * the whole curve is then forced non-increasing (see above).
 */
export function buildCtrCurve(rows) {
  const buckets = new Map();
  for (const r of rows) {
    if (r.position == null || r.impressions == null) continue;
    const p = Math.min(21, Math.max(1, Math.round(r.position)));
    const b = buckets.get(p) || { clicks: 0, impressions: 0 };
    b.clicks += r.clicks || 0;
    b.impressions += r.impressions;
    buckets.set(p, b);
  }

  const raw = [];
  const weights = [];
  const derived = [];
  for (let p = 1; p <= 20; p++) {
    const b = buckets.get(p);
    if (b && b.impressions >= MIN_BUCKET_IMPRESSIONS) {
      raw.push(b.clicks / b.impressions);
      weights.push(b.impressions);
      derived.push(p);
    } else {
      raw.push(REFERENCE_CTR_CURVE[p]);
      // A reference value is trusted as much as a bucket sitting exactly on the
      // volume threshold — enough to hold its ground against a thin derived
      // neighbour, not enough to override a well-populated one.
      weights.push(MIN_BUCKET_IMPRESSIONS);
    }
  }
  const fitted = isotonicNonIncreasing(raw, weights);

  const curve = {};
  for (let p = 1; p <= 20; p++) curve[p] = fitted[p - 1];

  const tail = buckets.get(21);
  const tailRaw = tail && tail.impressions >= MIN_BUCKET_IMPRESSIONS
    ? tail.clicks / tail.impressions
    : TAIL_CTR;
  curve.tail = Math.min(tailRaw, curve[20]);

  return { curve, derivedPositions: derived };
}

/**
 * Language segment of a page path. The site publishes Japanese at the root and
 * every other language under its own prefix.
 */
export function segmentOfPath(pagePath) {
  if (!pagePath) return 'JA';
  if (pagePath === '/en' || pagePath.startsWith('/en/')) return 'EN';
  if (/^\/(zh-Hant|zh|ko|es|pt-BR|id|ar|tr)(\/|$)/.test(pagePath)) return 'other';
  return 'JA';
}

/** Queries carry no URL, so the script they are written in stands in for one. */
export function segmentOfQuery(query) {
  return /[ぁ-んァ-ヶ一-龥]/.test(query || '') ? 'JA' : 'EN';
}

/** Below this a segment cannot support its own curve and inherits the site's. */
const SEGMENT_MIN_IMPRESSIONS = 3000;

/**
 * One expected-CTR curve per language, because they are not the same SERP.
 *
 * On the 2026-08-09 snapshot the site clicks at 2.50% across Japanese pages and
 * 0.69% across English ones, and the split holds position by position — 3.12%
 * vs 0.51% at position 8, 4.52% vs 1.48% at position 6. A single curve fitted
 * across both is really the Japanese curve, since Japanese traffic is 77% of
 * impressions, and it then judges every English page against an expectation
 * three-odd times what English pages on this site have ever achieved. That is
 * how two English pages came to sit in the top four "opportunities" while
 * performing normally for their segment.
 *
 * What this fixes and what it does not: comparing English pages against other
 * English pages is now fair, so the ranking within a segment means something.
 * But the English curve is fitted on the site's own English pages, so it
 * encodes their current performance as the standard — it can say which English
 * page is worst, never whether English as a whole is underperforming. That
 * question (why 0.69% against 2.50% at the same positions — weaker SERP
 * competition, brand recognition, or simply worse pages) is not answerable from
 * Search Console alone and stays open.
 */
export function buildSegmentCurves(rows, overall) {
  const bySegment = new Map();
  let totalClicks = 0;
  let totalImpressions = 0;
  for (const r of rows) {
    if (r.position == null || r.impressions == null) continue;
    const s = segmentOfPath(r.page);
    if (!bySegment.has(s)) bySegment.set(s, []);
    bySegment.get(s).push(r);
    totalClicks += r.clicks || 0;
    totalImpressions += r.impressions;
  }
  const siteCtr = totalImpressions ? totalClicks / totalImpressions : 0;

  const out = {};
  for (const [segment, segRows] of bySegment) {
    const clicks = segRows.reduce((s, r) => s + (r.clicks || 0), 0);
    const impressions = segRows.reduce((s, r) => s + r.impressions, 0);
    if (impressions < SEGMENT_MIN_IMPRESSIONS) continue;

    const buckets = new Map();
    for (const r of segRows) {
      const p = Math.min(21, Math.max(1, Math.round(r.position)));
      const b = buckets.get(p) || { clicks: 0, impressions: 0 };
      b.clicks += r.clicks || 0;
      b.impressions += r.impressions;
      buckets.set(p, b);
    }

    // Positions this segment cannot fill on its own inherit the site curve,
    // rescaled by how much harder this segment converts overall. Falling back
    // to the site curve unscaled is what produced the original error.
    const ratio = siteCtr > 0 ? (clicks / impressions) / siteCtr : 1;
    const raw = [];
    const weights = [];
    const derived = [];
    for (let p = 1; p <= 20; p++) {
      const b = buckets.get(p);
      if (b && b.impressions >= MIN_BUCKET_IMPRESSIONS) {
        raw.push(b.clicks / b.impressions);
        weights.push(b.impressions);
        derived.push(p);
      } else {
        raw.push(overall[p] * ratio);
        weights.push(MIN_BUCKET_IMPRESSIONS);
      }
    }
    const fitted = isotonicNonIncreasing(raw, weights);
    const curve = {};
    for (let p = 1; p <= 20; p++) curve[p] = fitted[p - 1];
    curve.tail = Math.min(overall.tail * ratio, curve[20]);

    out[segment] = {
      curve,
      derivedPositions: derived,
      impressions,
      clicks,
      ctr: clicks / impressions,
      ratio_to_site: ratio,
    };
  }
  return out;
}

/**
 * The curve to judge a row by. Falls back to the site-wide curve for segments
 * too small to fit their own — including snapshots ingested before segment
 * curves existed, which carry no `ctr_curve_segments` at all.
 */
export function curveFor(meta, segment) {
  return meta.ctr_curve_segments?.[segment]?.curve ?? meta.ctr_curve;
}

export function expectedCtr(curve, position) {
  if (position == null) return null;
  const p = Math.round(position);
  if (p >= 21) return curve.tail;
  return curve[Math.max(1, p)] ?? curve.tail;
}

/**
 * Position → how much headroom a ranking move realistically has.
 * Mirrors the brief's table: already-top results have little to gain, page-one
 * stragglers have the most, and anything past 30 is a different project.
 */
export function positionOpportunity(position) {
  if (position == null) return 0;
  if (position <= 3) return 0.2;
  if (position <= 10) return 1.0;
  if (position <= 20) return 0.8;
  if (position <= 30) return 0.4;
  return 0.1;
}

/**
 * Every canonical page path the repo actually publishes, e.g.
 * '/vs/capacities/' and '/blog/line-keep-alternative'.
 *
 * The site uses BOTH shapes — a directory page canonicalises with a trailing
 * slash, a flat `foo.html` page canonicalises without one — so a GSC URL cannot
 * be normalised by string rules alone. Guessing gets ~60 blog and devlog pages
 * wrong, and a wrong path silently fails to join against the page inventory,
 * which looks exactly like "that page has no data".
 */
let pagePathCache = null;
function knownPagePaths() {
  if (pagePathCache) return pagePathCache;
  const { collectHtmlFiles, toUrlPath } = createRequire(import.meta.url)('../../scripts/lib/site-files.js');
  const files = collectHtmlFiles(ROOT, {
    skipDirs: ['node_modules', 'scripts', 'docs', 'screenshots', '.git', 'admin', 'tools', 'growth'],
    skipFiles: ['404.html'],
  });
  pagePathCache = new Set(files.map((f) => toUrlPath(ROOT, f)));
  return pagePathCache;
}

/**
 * GSC page URL → the site's canonical path.
 *
 * Unknown paths are returned in their stripped form rather than coerced: GSC
 * legitimately reports URLs the repo does not publish (404s, fabricated
 * spam URLs, retired paths), and quietly reshaping those would hide them.
 */
export function toPath(url) {
  if (!url) return '';
  let u = String(url).trim()
    .replace(/^https?:\/\/[^/]+/, '')
    .split('?')[0].split('#')[0]
    .replace(/\/{2,}/g, '/');
  if (u === '' || u === '/') return '/';
  if (u.endsWith('/index.html')) u = u.slice(0, -'index.html'.length);
  else if (u.endsWith('.html')) u = u.slice(0, -5);

  const known = knownPagePaths();
  const bare = u.endsWith('/') && u.length > 1 ? u.slice(0, -1) : u;
  if (known.has(bare)) return bare;
  if (known.has(`${bare}/`)) return `${bare}/`;
  return u;
}

/**
 * Business relevance by URL — how close a page's readers are to installing.
 *
 * This is the one deliberately hand-maintained input in the scoring model. It
 * cannot be derived from Search Console (GSC knows about clicks, not
 * intent-to-install), and leaving it out would rank a page's traffic purely by
 * volume — which is exactly how a team ends up pouring effort into a large,
 * high-impression cluster whose readers never had any intention of installing
 * anything. Values follow the brief: 1.0 direct need · 0.7 adjacent · 0.3
 * information-only.
 */
export const BUSINESS_RELEVANCE = [
  [/^\/(obsidian|apple-watch-obsidian|siri|voice-input|hands-free|fastest-voice-memo|ai-tags)\//, 1.0],
  [/^\/blog\/obsidian-/, 1.0],
  [/^\/(captio|captio-alternative)\//, 1.0],
  [/^\/blog\/captio/, 1.0],
  [/^\/(apple-watch|note-to-email|templates)\//, 0.9],
  [/^\/vs\//, 0.7],
  [/^\/(use-cases|guides|methods|comparison|how-to)\//, 0.7],
  // LINE Keep readers are asking where a LINE feature went, not shopping for a
  // memo app — information-only by the brief's own read, so 0.3. This single
  // number is what stops the site's largest impression pool from permanently
  // outranking smaller, install-adjacent clusters in the queue.
  [/^\/(line-keep|vs\/line-keep-memo)\//, 0.3],
  [/^\/blog\/line-keep/, 0.3],
  [/^\/blog\/(.*-vs-|memo-app-)/, 0.5],
  [/^\/(glossary|devlog)\//, 0.3],
  [/^\/(about|faq|contact|privacy|terms|legal|voices)\//, 0.3],
];

export function businessRelevance(pagePath) {
  for (const [re, v] of BUSINESS_RELEVANCE) if (re.test(pagePath)) return v;
  return 0.5;
}
