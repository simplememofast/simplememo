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

/**
 * Where snapshots live. Overridable so the daily job can ingest a fresh window,
 * run the detectors against it and throw it away.
 *
 * Snapshots of record stay weekly and committed. Writing one every day would
 * put ~180 MB of near-duplicate JSON a year into a repo that a static site is
 * served from, and — worse — would break decay: `previousSnapshot` returns the
 * label immediately before, so consecutive 28-day windows would be compared
 * against a baseline sharing 27 of their 28 days. Every delta would collapse
 * toward zero and the cause classification would be reading noise.
 */
export const GSC_DIR = process.env.GROWTH_GSC_DIR
  ? path.resolve(ROOT, process.env.GROWTH_GSC_DIR)
  : path.join(ROOT, 'growth/data/gsc');

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
    // Impressions-only rows from the generative-AI export. Deliberately a
    // separate field rather than a flag on `pages`: everything that consumes
    // `pages` divides clicks by impressions somewhere, and these rows have no
    // clicks to divide.
    pagesAio: read('pages-aio'),
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
 * A position bucket this dominated by one page is that page's CTR wearing a
 * bucket's name, and everything else at that position then gets judged against
 * a single competitor's idiosyncrasy.
 */
const MAX_BUCKET_CONCENTRATION = 0.5;

/** Bucket rows by rounded position, keeping the largest page's share. */
function positionBuckets(rows) {
  const buckets = new Map();
  for (const r of rows) {
    if (r.position == null || r.impressions == null) continue;
    const p = Math.min(21, Math.max(1, Math.round(r.position)));
    const b = buckets.get(p) || { clicks: 0, impressions: 0, top: 0 };
    b.clicks += r.clicks || 0;
    b.impressions += r.impressions;
    b.top = Math.max(b.top, r.impressions);
    buckets.set(p, b);
  }
  return buckets;
}

const usable = (b) => b
  && b.impressions >= MIN_BUCKET_IMPRESSIONS
  && b.top / b.impressions <= MAX_BUCKET_CONCENTRATION;

/**
 * Level, fitted across every row at once: how this site's clicks compare to
 * what the reference curve predicts for the positions it actually holds.
 *
 * One number, pooled over all positions, is the most this site's volume can
 * support. Estimating twenty of them — one per position — is what went wrong:
 * on the 2026-08-09 snapshot the Japanese position-5 bucket was 79% a single
 * page, position 13 was 95% one page, and the English position-7 bucket held
 * exactly one page, so that page was measured against itself and could not
 * deviate from expectation by construction.
 */
export function fitCalibration(rows) {
  let clicks = 0;
  let expected = 0;
  for (const r of rows) {
    if (r.position == null || !r.impressions) continue;
    const p = Math.min(20, Math.max(1, Math.round(r.position)));
    clicks += r.clicks || 0;
    expected += r.impressions * REFERENCE_CTR_CURVE[p];
  }
  return expected > 0 ? clicks / expected : 1;
}

/**
 * Expected CTR by position: shape borrowed, level measured.
 *
 * The shape comes from the reference table because this site cannot estimate
 * one — 240 pages spread over twenty positions leaves a handful of pages per
 * bucket, and the resulting "curve" was mostly noise (it came out
 * non-monotonic, and had to be forced back into order before it could be used
 * at all). The level comes from the site's own rows, pooled into the single
 * calibration factor above, which its volume does support.
 *
 * A bucket still overrides the calibrated reference where it has both the
 * volume and the diversity to be believable — so the curve sharpens on its own
 * as the site grows, rather than staying pinned to a borrowed shape forever.
 */
export function buildCtrCurve(rows) {
  const buckets = positionBuckets(rows);
  const k = fitCalibration(rows);

  const raw = [];
  const weights = [];
  const derived = [];
  for (let p = 1; p <= 20; p++) {
    const b = buckets.get(p);
    if (usable(b)) {
      raw.push(b.clicks / b.impressions);
      weights.push(b.impressions);
      derived.push(p);
    } else {
      raw.push(REFERENCE_CTR_CURVE[p] * k);
      // Calibrated reference is trusted as much as a bucket sitting exactly on
      // the volume threshold — enough to hold its ground against a thin derived
      // neighbour, not enough to override a well-populated, diverse one.
      weights.push(MIN_BUCKET_IMPRESSIONS);
    }
  }
  const fitted = isotonicNonIncreasing(raw, weights);

  const curve = {};
  for (let p = 1; p <= 20; p++) curve[p] = fitted[p - 1];

  const tail = buckets.get(21);
  const tailRaw = usable(tail) ? tail.clicks / tail.impressions : TAIL_CTR * k;
  curve.tail = Math.min(tailRaw, curve[20]);

  return { curve, derivedPositions: derived, calibration: k };
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
export function buildSegmentCurves(rows) {
  const bySegment = new Map();
  for (const r of rows) {
    if (r.position == null || r.impressions == null) continue;
    const s = segmentOfPath(r.page);
    if (!bySegment.has(s)) bySegment.set(s, []);
    bySegment.get(s).push(r);
  }

  const out = {};
  for (const [segment, segRows] of bySegment) {
    const clicks = segRows.reduce((s, r) => s + (r.clicks || 0), 0);
    const impressions = segRows.reduce((s, r) => s + r.impressions, 0);
    if (impressions < SEGMENT_MIN_IMPRESSIONS) continue;

    const { curve, derivedPositions, calibration } = buildCtrCurve(segRows);
    out[segment] = {
      curve,
      derivedPositions,
      calibration,
      impressions,
      clicks,
      ctr: clicks / impressions,
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
  // **ホームページに規則が無かった。**`/` はどのパターンにも当たらず既定の 0.5、
  // つまり「判断がついていないページ」と同じ重みで並んでいた。実測では
  // 34クリック / 437表示 / CTR 7.8%（2026-08-24窓）で、サイト内で最も
  // インストールに近い面である。既定に落ちていたので誰も決めていなかった。
  [/^\/$/, 1.0],
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

/**
 * ロケール接頭辞は落としてから照合する。**落とさないと非日本語ページが全滅する。**
 *
 * BUSINESS_RELEVANCE の全パターンは `^\/` で始まっているので、`/en/note-to-email/`
 * はどの行にも当たらず既定の 0.5 になる。2026-08-24 スナップショットで測ると、
 * **規則に当たらず既定へ落ちていたのは 101ページ・クリックの38.2%・表示の49.3%**で、
 * その中身は「分類が難しいページ」ではなく、**英語ミラーがまるごと**だった:
 *
 *   /en/iphone-shortcuts-email-guide/     13クリック 1,813表示   （JA側は規則あり）
 *   /en/note-to-email/                     6クリック   126表示   （JA側は 0.9）
 *   /en/vs/google-keep-vs-apple-notes/     2クリック   778表示   （JA側は 0.7）
 *
 * つまり英語サイトは**丸ごと「中くらい」に沈められていた。**キューは相対順位で
 * 動くので、これは英語ページを一律に過小評価する方向にだけ効く。
 *
 * segmentOfPath と同じロケール集合を使う。**片方だけ増やすと静かにズレる。**
 */
const LOCALE_PREFIX = /^\/(en|zh-Hant|zh|ko|es|pt-BR|id|ar|tr)(?=\/|$)/;

export function businessRelevance(pagePath) {
  if (!pagePath) return 0.5;
  // `/en` → `/`、`/en/obsidian/` → `/obsidian/`。JAのパスは素通りする。
  const p = String(pagePath).replace(LOCALE_PREFIX, '') || '/';
  for (const [re, v] of BUSINESS_RELEVANCE) if (re.test(p)) return v;
  return 0.5;
}

/**
 * 課金相当性 — **その面の読者が「1日3通」の天井に当たる使い方をするか。**
 *
 * businessRelevance は「インストールにどれだけ近いか」の1次元で、**DLと課金を
 * 同じ数字で表している。**この2つは実際には割れる。いちばん分かりやすいのが
 * 「メモアプリ 無料」で、DLの母数としては優秀だが、**Free（1日3通）で
 * 足りる読者を集めている可能性が高い。**
 *
 * 値の根拠は値付けそのもの（data/site-constants.json）:
 *
 *     Free     1日3通
 *     Premium  月500円 / 年5,000円 — 送信無制限
 *
 * **Premium が売っているのは機能ではなく回数の上限**なので、課金するのは
 * 「毎日何度もキャプチャする習慣を持つ人」だけである。したがってこの軸が
 * 見ているのは題材への関心ではなく、**捕捉の頻度**。
 *
 * **段は3つしか置かない（1.0 / 0.5 / 0.2）。**最初 0.7 や 0.3 を混ぜて5段にしたが、
 * 実測すると 218ページ中129ページが businessRelevance との差 0.1〜0.2 に収まり、
 * **2軸目のほとんどが「1軸目から少し引いた値」になっていた。**
 * 差が 0.1 の2つの手入力値に意味は無い。刻めるだけの根拠が無いところは刻まない。
 *
 * ⚠ **この軸は宣言であって実測ではない。**
 *
 * 検証には ct= 別のインストール／課金が要るが、**このリポジトリには無い。**
 * growth/data/appstore は列名と合計しか持たず（公開リポジトリなので分類列ごとの
 * 内訳を置かない方針）、`App Downloads Standard` の列も Source Type / Page Type までで
 * Campaign が無い。突合するなら生データを持つ simplememo-ios 側でやる。
 *
 * **代わりに、今日から反証できる実測を1つ用意してある** —— freeSeekingShare()。
 * 「無料」「広告なし」等を含むクエリからの表示が、その面の何割かを数える。
 * 課金相当性を高く宣言した面が実際には無料狙いのクエリで出ているなら、
 * **その宣言は間違っている。**intent-axes.mjs がこの矛盾を出す。
 */
export const MONETIZATION_RELEVANCE = [
  // ── 高 1.0：使い方そのものが「1日に何度も」を含む ────────────────
  // ここだけは根拠が値付けから直接引ける。Premium が売っているのは回数の上限で、
  // **画面を見ないキャプチャと保管庫への日次追記は、1回で終わらない。**
  // （VISION §3.2 の Tier 1「画面を見ない Capture」がそのままこの層）
  [/^\/$/, 1.0],
  [/^\/(obsidian|apple-watch-obsidian)\//, 1.0],
  [/^\/blog\/obsidian-/, 1.0],
  [/^\/(siri|hands-free|voice-input|fastest-voice-memo|apple-watch)\//, 1.0],
  // 自分宛メールで捕まえ続ける流儀を名指しで探している人は、**既にその回数を出している。**
  [/^\/(captio|captio-alternative)\//, 1.0],
  [/^\/blog\/captio/, 1.0],

  // ── 低 0.2：無料狙い、または一度きりの答え探し ───────────────────
  // **この層のうち /blog/free-memo-apps だけが実測に裏づけられている**
  // （freeSeekingShare 95.6% / 2026-08-24窓）。残りは宣言。
  [/^\/blog\/free-memo-apps/, 0.2],
  [/^\/blog\/(best-memo-apps|memo-app-hikaku|how-to-choose|open-source-memo|student-memo)/, 0.2],
  // LINE Keep の行き先を訊いているだけ。保存先を1つ決めたら終わる。
  [/^\/(line-keep|vs\/line-keep-memo)\//, 0.2],
  [/^\/blog\/line-keep/, 0.2],
  [/^\/(glossary|devlog|about|faq|contact|privacy|terms|legal|voices)\//, 0.2],

  // ── 中 0.5：道具の常用者だが、頻度は分からない ──────────────────
  // **ここを 0.7 や 0.6 に刻まない。**刻めるだけの根拠が無い。
  // 乗り換え検討者も手法の実践者も「よく書く人」ではあるが、
  // 1日3通を超えるかは測っていない。
  [/^\/(note-to-email|ai-tags|templates)\//, 0.5],
  [/^\/methods\//, 0.5],
  [/^\/vs\//, 0.5],
  [/^\/(use-cases|guides|how-to|comparison)\//, 0.5],
];

export function monetizationRelevance(pagePath) {
  // 既定は「中」。**既定だけの段を作らない** —— 判断していないことを
  // 独自の値で表すと、あとから「そう決めた」と読めてしまう。
  if (!pagePath) return 0.5;
  const p = String(pagePath).replace(LOCALE_PREFIX, '') || '/';
  for (const [re, v] of MONETIZATION_RELEVANCE) if (re.test(p)) return v;
  return 0.5;
}

/**
 * **無料を明示して探しているクエリ。**課金相当性の宣言を反証するための実測。
 *
 * 語をここに固定してあるのは、**あとから語を足して都合のよい割合を作れないように**
 * するため。増やすときは kpi-definitions.json の version を上げることになる
 * （check-definitions.mjs が計算元のチェックサムを見ている）。
 */
export const FREE_SEEKING = /無料|むりょう|広告なし|課金なし|0円|フリーソフト|\bfree\b/i;

/**
 * ページごとの「無料狙いクエリからの表示」割合。**query-pages の可視分のみ。**
 *
 * GSC は下位クエリを匿名化して返さない（2026-08-24窓では表示の約64%が匿名化）。
 * だから**これは下限ではなく、可視スライスの中の割合**であって、
 * ページ全体の割合ではない。**0% を「無料狙いが無い」と読まないこと。**
 */
export function freeSeekingShare(queryPages, { minImpressions = 100 } = {}) {
  const agg = new Map();
  for (const r of queryPages || []) {
    const p = toPath(r.page);
    const cur = agg.get(p) || { impressions: 0, free: 0 };
    cur.impressions += r.impressions;
    if (FREE_SEEKING.test(r.query)) cur.free += r.impressions;
    agg.set(p, cur);
  }
  const out = new Map();
  for (const [p, v] of agg) {
    // **母数が足りない面では割合を作らない。**1クエリで跳ねる。
    if (v.impressions < minImpressions) continue;
    out.set(p, { ...v, share: v.free / v.impressions });
  }
  return out;
}
