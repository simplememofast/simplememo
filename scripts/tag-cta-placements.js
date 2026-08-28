#!/usr/bin/env node
/**
 * Give every App Store CTA a placement identity.
 *
 *   node scripts/tag-cta-placements.js --check   # CI: exit 1 if any CTA is untagged/mislabelled
 *   node scripts/tag-cta-placements.js --write   # apply
 *
 * The problem this solves: 65% of Japanese pages carry exactly four App Store
 * links and all four shared one `ct=` value, so App Store Connect could tell us
 * "this page produced installs" but never "this *placement* produced installs".
 * Two thirds of the CTA inventory was therefore unmeasurable, and any CTA test
 * would have been unreadable before it started.
 *
 * Two dimensions are added, deliberately in different places:
 *
 *   data-cta-*   placement / cluster / variant → GA4, via js/app-store-tracking.js.
 *                No length limit, so this carries the full detail including the
 *                variant slot for future A/B work.
 *   ct=…__<placement>  → App Store Connect. This is the only path that reaches
 *                *installs* rather than clicks, which is the metric that
 *                matters, but campaign tokens are length-limited so it carries
 *                placement only. `CT_MAX` below is enforced, not assumed.
 *
 * Rewriting `ct=` does break continuity in App Store Connect: the old
 * page-level token stops and per-placement tokens start. That is a one-time,
 * recoverable cost (the new tokens sum to the old one) and it buys the
 * placement dimension permanently, which at 45 paid users is plainly the right
 * trade.
 */

const fs = require('fs');
const path = require('path');
const { collectHtmlFiles, toUrlPath } = require('./lib/site-files');

const ROOT_DIR = path.resolve(__dirname, '..');
const SKIP_DIRS = ['node_modules', 'scripts', 'docs', 'screenshots', '.git', 'admin', 'tools', 'growth'];

/**
 * Apple's campaign-token length ceiling. **30, and this is now verified, not
 * guessed.**
 *
 * [2026-08-28] この定数は長らく 40 で、すぐ上のコメントが
 * 「Apple の上限はここからは確かめられないので、控えめに 40」と書いていた。
 * **確かめた。**Apple の一次情報（App Store Connect Help / Campaign links）に
 * こうある:
 *
 *   > You can use up to 30 alphanumeric characters and spaces, and the
 *   > following punctuation marks and characters:
 *   > [ ] / \ - ~ + = <> : ; , . _ ' " * & $ % # @ ? ! | { } ( )
 *
 * 40 は 30 より緩いので、**この推測値は上限を10文字ぶん見逃していた。**
 * 30 へ直す。既存ファイルは1つも変わらない（下の置換は既に `__placement` を
 * 持つトークンには何もしないので冪等）。効くのは**これから生成される分**だけ。
 *
 * **既に上限を超えているトークンは別に数えて報告する**（OVERSIZED の節）。
 * 直すと App Store Connect 側の履歴が切れるので、直すかどうかは持ち主の判断。
 * ただし「見えていない」状態にはしない。
 */
const CT_MAX = 30;

/**
 * 出荷済みトークンのうち、Apple の上限を超えているもの。**報告のみ。**
 *
 * 失敗にしないのは、直すこと自体にコストがある（トークンを変えると ASC が
 * 集計する単位が変わり、それまでの履歴と繋がらなくなる）から。
 * check-benchmark.mjs と同じ「報告のみ」の扱いで、判断は持ち主に残す。
 */
const oversized = [];

/**
 * **キャンペーントークンの言語。ページ単位の base は載せない。**
 *
 * [2026-08-28] それまでのトークンは `{ページ}-{言語}__{配置}` で、670種類あった。
 * **Apple の閾値がそれを許さない**（App Store Connect Help / Campaign links）:
 *
 *   > Data for a particular campaign will appear in the dashboard once it has
 *   > generated **first-time downloads from at least five individual users.**
 *
 * 実測の初回DLは 4.5〜5.0/日 ＝ 月およそ150件。1キャンペーンに5件要るので、
 * **月に閾値を越えられるのは理想条件でも最大30トークン。670個は2桁多い。**
 * 実際 ASC が返した Campaign 列は 5,018 Counts すべて空欄だった
 * （growth/reports/2026-08-28-campaign-token-cardinality.md）。
 *
 * **失う履歴は無い。**このファイル冒頭は「ct= を書き換えると ASC の継続性が
 * 切れる」と書いていて、それ自体は正しい。だが今回に限っては
 * **切れる履歴が存在しない** —— 旧トークンは1件も集計に現れていない。
 *
 * **ページ単位の粒度は失われない。**GA4 は `page_path` と
 * `data-cta-placement/cluster/variant` を別ディメンションで記録している
 * （js/app-store-tracking.js の dims()）。ct= に求めるのは、
 * **クリックではなくインストールと課金に届く粗い軸**だけ。
 *
 * **言語はページの位置ではなく既存トークンから引く。**実測すると
 * root(JA) のページに `-en` トークンが151件、`/en/` に `-jp` が31件あり、
 * **トークンの言語とページのロケールは一致していない。**dual-DOM の
 * 言語別CTAで説明が付く部分もあるが、確かめていない。
 * ここで直すと**粒度の変更と言語の付け替えが同じ変更に混ざる**ので、
 * 言語は今の値を保ち、食い違いは別に数えて報告する。
 */
const langOf = (token, rel) => {
  const base = String(token).split('__')[0];
  if (/^(jp|en)$/.test(base)) return base;          // 既に畳んだ形（冪等）
  const m = base.match(/-(jp|en)$/);
  if (m) return m[1];
  // 接尾辞を持たないトークンだけ、ページの位置から決める
  return rel.startsWith('en/') ? 'en' : 'jp';
};

/** トークンの言語とページのロケールが食い違っている CTA。**報告のみ。** */
const langMismatch = [];

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');
const CHECK = args.has('--check');
if (!WRITE && !CHECK) {
  console.error('usage: tag-cta-placements.js --check | --write');
  process.exit(2);
}

/** Topic cluster from the URL — the axis the growth loop reports on. */
function clusterOf(urlPath) {
  const p = urlPath.replace(/^\/(en|es|ko|zh|zh-Hant|ar|id|pt-BR|tr)\//, '/');
  if (/^\/(obsidian|apple-watch-obsidian)\/|^\/blog\/obsidian-/.test(p)) return 'obsidian';
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

const problems = [];   // real failures: a CTA carrying no placement metadata
const notices = [];    // accepted: ct stayed page-level because it would overflow
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

    // ct= gains the placement suffix; a token already carrying one is left alone
    // so re-running is idempotent.
    tag = tag.replace(/((?:[?&]|&amp;)ct=)([^"&]*)/, (m, pre, token) => {
      const next = `${langOf(token, rel)}__${a.placement}`;
      if (next.length > CT_MAX) {
        // Accepted, not a failure. These pages keep their page-level token and
        // lose only the App-Store-side placement split; GA4 still receives the
        // full data-cta-* dimensions. Truncating the base to make room would
        // change the token App Store Connect groups on, which costs more
        // history than the split is worth on a long-tail blog page.
        // (The pre-existing tokens are already truncated to ~38 chars, which is
        // where the CT_MAX estimate comes from.)
        notices.push(`${rel}: ct stays page-level — "${next}" would be ${next.length} chars (> ${CT_MAX})`);
        return m;
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
    else problems.push(`${rel}: ${anchors.filter((a) => a.placement).length} CTA(s) not tagged with placement metadata`);
  }

  // A campaign token without the provider token records nothing. Every `ct` on
  // this site shipped without `pt` until 2026-08-11, and App Analytics showed
  // "not enough data" for ninety days rather than an error — the tracking looked
  // installed and was inert. Note the provider token is NOT the vendor number;
  // it comes from App Store Connect's own campaign-link generator.
  // 出荷済みトークンの長さを数える。**新規生成の門とは別の話** ——
  // CT_MAX を下げても既存は変わらないので、数えないと存在ごと消える。
  for (const a of anchors) {
    if (!a.isCta) continue;
    const m = a.tag.match(/(?:[?&]|&amp;)ct=([^"&]*)/);
    if (!m) continue;
    if (m[1].length > CT_MAX) oversized.push({ page: rel, token: m[1], length: m[1].length });
    const tokenLang = langOf(m[1], rel);
    const pathLang = rel.startsWith('en/') ? 'en' : 'jp';
    if (tokenLang !== pathLang) langMismatch.push({ page: rel, tokenLang, pathLang });
  }

  const missingPt = anchors.filter((a) => a.isCta && !PARAM_PT.test(a.tag));
  if (missingPt.length) {
    problems.push(`${rel}: ${missingPt.length} CTA(s) carry ct= without pt= — App Analytics will not record them`);
  }
}

problems.forEach((p) => console.log(`  ${p}`));
if (oversized.length) {
  const worst = [...oversized].sort((a, b) => b.length - a.length)[0];
  const uniq = new Set(oversized.map((o) => o.token)).size;
  console.log(`  note(報告のみ): 出荷済みの ct= で Apple の上限 ${CT_MAX} 文字を超えているもの`
    + ` — ${oversized.length} CTA / ${uniq} トークン（最長 ${worst.length} 文字: "${worst.token}"）。`);
  console.log('    **直すと App Store Connect 側の集計単位が変わり、それまでの履歴と繋がらない。**'
    + '判断は持ち主に残すが、見えていない状態にはしない');
}
if (langMismatch.length) {
  const byPath = langMismatch.reduce((acc, x) => { acc[x.pathLang] = (acc[x.pathLang] || 0) + 1; return acc; }, {});
  console.log(`  note(報告のみ): トークンの言語がページのロケールと食い違う CTA — ${langMismatch.length} 件`
    + `（${Object.entries(byPath).map(([k, v]) => `path=${k} に別言語 ${v}`).join(' / ')}）。`);
  console.log('    **粒度の変更とは別の話なので、この変更では直していない。**'
    + 'dual-DOM の言語別CTAで説明が付く部分もあるが、確かめていない');
}
if (notices.length) {
  console.log(`  note: ${notices.length} CTA(s) keep a page-level ct= (token length); GA4 placement is unaffected`);
}

if (WRITE) {
  console.log(`done: ${tagged} CTA(s) tagged across ${filesChanged} file(s)`);
  process.exit(problems.length ? 1 : 0);
}
if (problems.length) {
  console.error(`FAIL: ${problems.length} file(s) — see above. Placement metadata: node scripts/tag-cta-placements.js --write. Missing pt= must be added to the href.`);
  process.exit(1);
}
console.log(`OK: every App Store CTA carries placement/cluster/variant metadata (${notices.length} keep page-level ct=)`);
