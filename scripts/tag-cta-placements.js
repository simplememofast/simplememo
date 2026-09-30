#!/usr/bin/env node
/**
 * Give every App Store CTA a placement identity.
 *
 *   node scripts/tag-cta-placements.js --check   # CI: exit 1 if any CTA is untagged/mislabelled
 *   node scripts/tag-cta-placements.js --write   # apply
 *
 * Two dimensions are kept in different places:
 *
 *   data-cta-*   placement / cluster / variant → GA4, via js/app-store-tracking.js.
 *                No length limit, so this carries the full detail including the
 *                variant slot for future A/B work.
 *   ct=web_obsidian_v1 / web_other_v1 → App Store Connect. These pool CTA
 *                links by the path carrying the clicked CTA,
 *                except pages under a registered CTA/analytics freeze.
 *                The token is a page-group proxy, never a search-query label.
 *
 * Changing `ct=` starts new campaign histories. The prior language/placement
 * tokens remain in old reports; GA4 still carries placement and page_path.
 * Apple's per-campaign first-download threshold makes the two pooled groups
 * more likely to become readable, but does not guarantee that either will.
 */

const fs = require('fs');
const path = require('path');
const { collectHtmlFiles, toUrlPath } = require('./lib/site-files');
const { CAMPAIGN_OBSIDIAN, CAMPAIGN_OTHER, FROZEN_EXPERIMENT_PATHS, campaignTokenOf } = require('./lib/cta-page-groups');

const ROOT_DIR = path.resolve(__dirname, '..');
const SKIP_DIRS = ['node_modules', 'scripts', 'docs', 'screenshots', '.git', 'admin', 'tools', 'growth'];

// Apple allows at most 30 campaign-token characters:
// https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links
const CT_MAX = 30;

// Exclude these pages from the entire v1 pilot to preserve the registered
// CTA/campaign state and keep the v1 cohort definition fixed. The four blog
// paths are evaluated on 2026-10-03; the two guides on 2026-10-23. Bringing
// them in later requires a separately versioned campaign, never a silent v1
// cohort expansion.
// The shared rule keeps the classifier and prospective diagnostics identical.

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');
const CHECK = args.has('--check');
const SELFTEST = args.has('--selftest');
if (!WRITE && !CHECK && !SELFTEST) {
  console.error('usage: tag-cta-placements.js --check | --write | --selftest');
  process.exit(2);
}

/** Topic cluster from the URL — the axis the growth loop reports on. */
function clusterOf(urlPath) {
  const p = urlPath.replace(/^\/(en|es|ko|zh|zh-Hant|ar|id|pt-BR|tr)\//, '/');
  if (/^\/(obsidian|apple-watch-obsidian)\/|^\/blog\/obsidian-|^\/resources\/obsidian-uri\//.test(p)) return 'obsidian';
  if (/^\/(siri|voice-input|hands-free|fastest-voice-memo)\//.test(p)) return 'voice';
  if (/^\/apple-watch\//.test(p)) return 'watch';
  if (/^\/(captio|captio-alternative)\/|^\/blog\/captio/.test(p)) return 'captio';
  if (/line-keep/.test(p)) return 'line-keep';
  if (/^\/ai-tags\//.test(p)) return 'ai';
  if (/^\/vs\//.test(p)) return 'vs';
  if (/^\/use-cases\//.test(p)) return 'use-case';
  if (/^\/(guides|methods|how-to)\//.test(p)) return 'guide';
  if (/^\/glossary\//.test(p)) return 'glossary';
  if (/^\/blog\//.test(p)) return 'blog';
  if (p === '/') return 'home';
  return 'other';
}

/**
 * Remove the attributes this script writes, so placement is always measured
 * against the same baseline document. See the call site for why this matters.
 */
function stripCtaAttrs(html) {
  return html
    .replace(/\s+data-cta-(?:placement|cluster|variant)="[^"]*"/g, '')
    // **ct= の中身も正規化する。**属性を剥がすだけでは足りない ——
    // トークンの長さが変わると後続アンカーのバイト位置がずれ、0.25/0.75 の
    // 境界にいる CTA が mid ↔ bottom で振動する。
    //
    // [2026-08-28] 実際にそうなった。670種類のページ別トークンを
    // `{言語}__{配置}` の8種類へ畳んだとき、`vs/line-keep-memo/` の1件が
    // **毎回ラベルを変え、--write と --check が永久に食い違った。**
    // すぐ上のコメントが data-cta-* について書いているのと同じ欠陥で、
    // **同じ理由が ct= にも掛かっていることを、長さが変わるまで誰も踏めなかった。**
    // 固定長へ潰すので、以後どんなトークン設計へ変えても位置は動かない。
    .replace(/((?:[?&]|&amp;)ct=)[^"&]*/g, '$1x');
}

/**
 * Query parameters in HTML source are separated by `&amp;`, so the character
 * immediately before every parameter after the first is `;`, not `&`. Matching
 * on `[?&]ct=` alone silently stopped recognising every CTA on the site the
 * moment `pt=` was added ahead of `ct=` — 892 links were reclassified as
 * editorial references in one edit.
 */
const PARAM_CT = /(?:[?&]|&amp;)ct=/;
const PARAM_PT = /(?:[?&]|&amp;)pt=/;

/** Byte ranges of page chrome, so nav/footer CTAs are not mistaken for content. */
function chromeZones(html) {
  const zones = [];
  for (const re of [/<header\b[\s\S]*?<\/header>/gi, /<nav\b[\s\S]*?<\/nav>/gi]) {
    for (const m of html.matchAll(re)) zones.push(['nav', m.index, m.index + m[0].length]);
  }
  for (const m of html.matchAll(/<footer\b[\s\S]*?<\/footer>/gi)) {
    zones.push(['footer', m.index, m.index + m[0].length]);
  }
  return zones;
}

/**
 * Placement for each App Store anchor, in document order.
 *
 * Content CTAs are named by position rather than by class because the site has
 * no consistent CTA class to key off — `app-store-badge` is used for both the
 * hero and the closing CTA on the same page.
 */
function classify(html) {
  const zones = chromeZones(html);
  const anchors = [];
  for (const m of html.matchAll(/<a\b[^>]*href="[^"]*apps\.apple\.com[^"]*"[^>]*>/gi)) {
    anchors.push({ tag: m[0], index: m.index });
  }
  const zoneOf = (i) => {
    for (const [kind, a, b] of zones) if (i >= a && i < b) return kind;
    return null;
  };
  for (const a of anchors) {
    a.zone = zoneOf(a.index);
    // Links to a competitor's App Store page are editorial references, not our
    // CTAs, and must not be tagged or tokenised.
    a.isOwn = /id6758438948/.test(a.tag);
    // An inline prose link to our App Store page ("… — App Store" inside a
    // source list) is a reference, not a call to action. The site's own
    // convention separates them: every real CTA already carries a `ct=`
    // campaign token and reference links do not. Without this split the last
    // reference link on a page steals the `bottom` label from the actual
    // closing CTA — which is how a placement measurement ends up meaning
    // different things on different pages.
    a.isCta = a.isOwn && PARAM_CT.test(a.tag);
    if (/class="[^"]*(nav-cta|global-nav)/.test(a.tag)) a.zone = 'nav';
  }
  // Placement is where the CTA physically sits in the content, NOT its ordinal
  // among CTAs. Ordinal looked right and was badly wrong: most pages carry a
  // single content CTA and it lives at the end, so "first content CTA" labelled
  // 168 of 207 bottom-of-page CTAs as `hero`. Comparing hero-vs-bottom would
  // then have compared "pages with one closing CTA" against "pages with two",
  // which is not a placement question at all.
  //
  // The fraction is measured across <main>, which 237 of 240 pages have. Using
  // it rather than "between the chrome" matters: 222 pages carry two or more
  // <nav> blocks (breadcrumbs, footer nav), so taking the last nav's end as the
  // content start dragged the origin most of the way down the page and made
  // nearly every CTA look like it was at the top.
  let contentStart = 0;
  let contentEnd = html.length;
  const main = html.match(/<main\b[^>]*>[\s\S]*?<\/main>/i);
  if (main) {
    contentStart = main.index;
    contentEnd = main.index + main[0].length;
  } else {
    // No <main>: fall back to the FIRST nav/header ending and the FIRST footer
    // start — first, not last, for the reason above.
    contentStart = zones.filter(([k]) => k === 'nav')
      .reduce((end, [, , b], i) => (i === 0 ? b : Math.min(end, b)), 0);
    contentEnd = zones.filter(([k]) => k === 'footer')
      .reduce((start, [, a]) => Math.min(start, a), html.length);
  }
  const span = Math.max(1, contentEnd - contentStart);

  for (const a of anchors) {
    if (!a.isCta || a.zone) continue;
    // An explicitly identified closing CTA must keep its measurement identity
    // when nearby editorial text changes the byte-position fallback.
    const position = a.tag.match(/\bdata-cta-position="(hero|mid|bottom)"/);
    if (position) {
      a.placement = position[1];
      continue;
    }
    const frac = (a.index - contentStart) / span;
    a.placement = frac < 0.25 ? 'hero' : frac > 0.75 ? 'bottom' : 'mid';
  }
  for (const a of anchors) {
    if (!a.isOwn) a.placement = null;
    else if (!a.isCta) a.placement = 'reference';
    else if (a.zone === 'nav') a.placement = 'nav';
    else if (a.zone === 'footer') a.placement = 'footer';
  }
  return anchors;
}

/**
 * Prove the classifier actually discriminates.
 *
 * data/check-selftests.json: "落ちることを確かめていない検査は、無いのと同じ".
 * Wired into seo-check.yml directly because check-selftests.mjs enumerates
 * `.mjs` only and cannot see this `.js` file — act-ci-selftest-ratchet-js-blind.
 *
 * Every assertion below is a bug this script's own comments record as having
 * shipped: reference links stealing `bottom`, ordinal-vs-position mislabelling
 * 168 of 207 CTAs as `hero`, competitor links getting tagged, and --write /
 * --check disagreeing forever because measuring the tagged document is not
 * idempotent.
 */
if (SELFTEST) {
  const failures = [];
  const t = (name, cond) => { if (!cond) failures.push(name); };
  const own = (extra = '') => `<a href="https://apps.apple.com/jp/app/id6758438948?pt=1&amp;ct=jp__x&amp;mt=8"${extra}>D</a>`;
  const ref = '<a href="https://apps.apple.com/jp/app/id6758438948?mt=8">App Store</a>';
  const rival = '<a href="https://apps.apple.com/jp/app/id999999999?ct=jp__x">Rival</a>';
  const placements = (html) => classify(html).map((a) => a.placement);

  // 位置で決まること。**序数ではない** —— 序数で測っていた版は 207 件中 168 件の
  // 末尾CTAを hero と呼んでいた（本体のコメント）。
  const long = 'p'.repeat(4000);
  t('main の先頭側の CTA は hero',
    placements(`<main>${own()}${long}${long}</main>`)[0] === 'hero');
  t('main の末尾側の CTA は bottom',
    placements(`<main>${long}${long}${own()}</main>`)[0] === 'bottom');
  t('main の中ほどの CTA は mid',
    placements(`<main>${long}${own()}${long}</main>`)[0] === 'mid');
  t('明示された末尾 CTA は本文の長さで区分が変わらない',
    [long, long.repeat(8)].every((copy) =>
      placements(`<main>${long}${own(' data-cta-position="bottom"')}${copy}</main>`)[0] === 'bottom'));
  t('不明な明示位置は位置からの分類を維持する',
    placements(`<main>${long}${own(' data-cta-position="sidebar"')}${long}</main>`)[0] === 'mid');
  t('明示位置はナビゲーションや参照リンクを上書きしない',
    placements(`<nav>${own(' data-cta-position="bottom"')}</nav><main>${long}</main>`)[0] === 'nav'
    && placements(`<main>${ref.replace('<a ', '<a data-cta-position="bottom" ')}${long}</main>`)[0] === 'reference');
  // chrome は位置ではなくゾーンで決まる。
  t('nav の中の CTA は nav', placements(`<nav>${own()}</nav><main>${long}</main>`)[0] === 'nav');
  t('footer の中の CTA は footer', placements(`<main>${long}</main><footer>${own()}</footer>`)[0] === 'footer');
  t('nav クラスを持つ CTA は本文にあっても nav',
    placements(`<main>${long}${own(' class="global-nav__cta"')}</main>`)[0] === 'nav');
  // **本文中の参照リンクが bottom を横取りしない。**ct= の有無で分ける。
  t('ct= を持たない自社リンクは reference', placements(`<main>${long}${ref}</main>`)[0] === 'reference');
  t('参照リンクは本物の CTA から bottom を奪わない', (() => {
    const p = placements(`<main>${long}${own()}${ref}</main>`);
    return p[0] === 'bottom' && p[1] === 'reference';
  })());
  // 他社のストアリンクは編集上の引用。**印を付けない。**
  t('他社アプリのリンクは placement を持たない', placements(`<main>${long}${rival}</main>`)[0] === null);

  // 冪等性。**属性を剥がしてから測らないと --write と --check が永久にすれ違う。**
  const tagged1 = `<main>${long}<a data-cta-placement="hero" data-cta-cluster="other" data-cta-variant="v1" href="https://apps.apple.com/jp/app/id6758438948?pt=1&amp;ct=jp__x&amp;mt=8">D</a>${long}</main>`;
  t('付与済みの属性を剥がすと素の文書に戻る', !/data-cta-/.test(stripCtaAttrs(tagged1)));
  t('剥がしてから測れば同じ位置に落ち着く',
    placements(stripCtaAttrs(tagged1))[0] === placements(`<main>${long}${own()}${long}</main>`)[0]);

  // クラスタとロケール。
  t('クラスタは URL から引く', clusterOf('/obsidian/airpods/') === 'obsidian' && clusterOf('/resources/obsidian-uri/') === 'obsidian' && clusterOf('/vs/notion/') === 'vs' && clusterOf('/') === 'home');
  t('ロケール接頭辞はクラスタを変えない', clusterOf('/en/obsidian/') === 'obsidian');
  t('Obsidian名のある日英パスは同じキャンペーンに集約する',
    ['/obsidian/', '/en/obsidian/pricing/', '/blog/obsidian-voice-input',
      '/en/blog/email-to-obsidian', '/vs/notion-vs-obsidian/'].every((p) =>
      campaignTokenOf(p) === CAMPAIGN_OBSIDIAN));
  t('Obsidian名のないパスは比較群に集約する',
    ['/', '/en/', '/use-cases/reading/', '/blog/email-yourself-memo'].every((p) =>
      campaignTokenOf(p) === CAMPAIGN_OTHER));
  t('評価中のページは既存キャンペーンを維持する',
    [...FROZEN_EXPERIMENT_PATHS].every((p) => campaignTokenOf(p) === null));
  t('2つのトークンはAppleの長さ制限内で異なる',
    CAMPAIGN_OBSIDIAN !== CAMPAIGN_OTHER
      && [CAMPAIGN_OBSIDIAN, CAMPAIGN_OTHER].every((token) => token.length <= CT_MAX));

  failures.forEach((f) => console.error(`  ✗ ${f}`));
  console.log(`自己テスト 17 件中 ${failures.length} 件失敗`);
  process.exit(failures.length ? 1 : 0);
}

const problems = [];   // missing metadata, provider token, or expected campaign
let tagged = 0;
let filesChanged = 0;

for (const file of collectHtmlFiles(ROOT_DIR, { skipDirs: SKIP_DIRS, skipFiles: ['404.html'] })) {
  let html = fs.readFileSync(file, 'utf8');
  const orig = html;
  const rel = path.relative(ROOT_DIR, file);
  const urlPath = toUrlPath(ROOT_DIR, file);
  const cluster = clusterOf(urlPath);

  // Classify against the document with our own attributes stripped.
  //
  // Measuring the live document is not idempotent: adding data-cta-* makes the
  // HTML longer, which shifts every later anchor's byte offset, which moves its
  // position fraction. On two pages a CTA sat close enough to a 0.25/0.75
  // boundary that it flipped label on every run — --write and --check
  // disagreed forever and CI would have stayed red. Normalising first means
  // the same page always yields the same placements, however many times the
  // script has run over it.
  const measured = classify(stripCtaAttrs(html));
  if (!measured.some((a) => a.isOwn)) continue;
  // Attribute stripping never reorders anchors, so the Nth measured anchor is
  // the Nth live anchor.
  const anchors = classify(html);
  anchors.forEach((a, i) => { a.placement = measured[i]?.placement ?? null; });

  // Rebuild back-to-front so earlier offsets stay valid.
  for (const a of [...anchors].reverse()) {
    if (!a.placement) continue;
    let tag = a.tag;

    // Campaign identity is pooled by the clicked link's page; GA4 keeps placement.
    tag = tag.replace(/((?:[?&]|&amp;)ct=)([^"&]*)/, (match, pre) => {
      const next = campaignTokenOf(urlPath);
      if (next === null) return match;
      if (next.length > CT_MAX) {
        throw new Error(`${rel}: campaign token exceeds ${CT_MAX} characters`);
      }
      return pre + next;
    });

    for (const [attr, value] of [
      ['data-cta-placement', a.placement],
      ['data-cta-cluster', cluster],
      ['data-cta-variant', 'v1'],
    ]) {
      if (new RegExp(`\\b${attr}="`).test(tag)) {
        tag = tag.replace(new RegExp(`(\\b${attr}=")[^"]*(")`), `$1${value}$2`);
      } else {
        tag = tag.replace(/^<a\b/, `<a ${attr}="${value}"`);
      }
    }

    if (tag !== a.tag) {
      html = html.slice(0, a.index) + tag + html.slice(a.index + a.tag.length);
      tagged++;
    }
  }

  if (html !== orig) {
    if (WRITE) { fs.writeFileSync(file, html); filesChanged++; }
    else problems.push(`${rel}: ${anchors.filter((a) => a.placement).length} CTA(s) differ in placement metadata or campaign token`);
  }

  // A campaign token without the provider token records nothing. Every `ct` on
  // this site shipped without `pt` until 2026-08-11, and App Analytics showed
  // "not enough data" for ninety days rather than an error — the tracking looked
  // installed and was inert. Note the provider token is NOT the vendor number;
  // it comes from App Store Connect's own campaign-link generator.
  const missingPt = anchors.filter((a) => a.isCta && !PARAM_PT.test(a.tag));
  if (missingPt.length) {
    problems.push(`${rel}: ${missingPt.length} CTA(s) carry ct= without pt= — App Analytics will not record them`);
  }
}

problems.forEach((p) => console.log(`  ${p}`));
if (WRITE) {
  console.log(`done: ${tagged} CTA(s) tagged across ${filesChanged} file(s)`);
  process.exit(problems.length ? 1 : 0);
}
if (problems.length) {
  console.error(`FAIL: ${problems.length} file(s) — see above. Run node scripts/tag-cta-placements.js --write for metadata/campaign differences; missing pt= must be added to the href.`);
  process.exit(1);
}
console.log('OK: every App Store CTA carries placement/cluster/variant metadata and its expected campaign token');
