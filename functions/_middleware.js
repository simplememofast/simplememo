// Site-wide URL normalizer for canonical-redirect cleanup.
//
// Cloudflare Pages serves three URL shapes that resolve to the same content:
//
//   /blog/<slug>            ← canonical (no extension)
//   /blog/<slug>.html       ← Pages serves the .html file directly
//   /blog/<slug>?lang=ja    ← query string ignored by Pages, same content
//
// Each blog post's HTML carries <link rel="canonical"> pointing at the clean
// extension-less URL, so Google correctly skips indexing the variants — but
// it still crawls them and reports them as "Crawled — currently not indexed"
// in Search Console (54 entries as of the 2026-05-08 snapshot). The clutter
// is harmless to rankings but wastes crawl budget and obscures real index
// issues.
//
// This middleware fixes that by returning a 301 from the variants to the
// canonical URL. Once Google sees the 301 it drops the variant from the
// index entirely — GSC backfills clear in a few weeks. Bonus: human users
// who land on an old `?lang=en` bookmark get redirected to the canonical
// page, which is a better UX than serving identical content from two URLs.
//
// Normalizations, in order (all folded into a single 301 so no request ever
// costs more than one hop):
//
//   0. Host: `www.simplememofast.com` → apex. `_redirects` has the same rule,
//      but `_redirects` runs AFTER Pages Functions — so before this was
//      mirrored here, a www URL that also needed a path or query fix cost two
//      hops (`https://www…/x.html` → 301 middleware, host kept → `https://www…/x`
//      → 301 `_redirects` → apex) and the intermediate www URL became one more
//      GSC "Page with redirect" row. The `_redirects` rule stays as the
//      fallback if a Functions deploy ever fails. The `http://` leg of
//      `http://www…` is out of our hands: the edge's Always Use HTTPS 301
//      runs before anything in this repo, so that spelling always costs
//      one extra hop.
//
//   0b. Collapse runs of duplicate slashes (`/en/vs/notion//` → `/en/vs/notion/`).
//      Pages resolves the extra slashes and serves 200, so these are true
//      duplicate URLs — the 2026-08-05 GSC snapshot had five of them parked
//      in "Alternate page with proper canonical tag" (all `/en/vs/*//`).
//      The canonical tag was doing its job, but a canonical is a hint;
//      a 301 removes the duplicate outright. Runs first so every later rule
//      sees a clean path.
//
//   1. Strip any `?lang=*` query parameter. The site does not use this
//      parameter — locale is determined by path (`/en/*` for EN, root for
//      JA). This 301 is the SOLE handler for `?lang=`: robots.txt
//      deliberately does NOT Disallow it, because a robots block would
//      stop Googlebot from ever fetching the URL and therefore from ever
//      seeing this redirect (it would just sit in GSC as "blocked by
//      robots.txt" instead of being dropped from the index).
//
//   2. Strip `.html` site-wide (was: `/blog/*.html` only). Every page on
//      this site is canonically extension-less, and Pages itself already
//      308-redirects `X.html` → `X`. Handling it here instead upgrades that
//      308 to a 301 and, more importantly, folds it into the SAME hop as
//      the `?lang=` strip and the retired-path lookup — `/blog/x.html?lang=ja`
//      is one 301, not three. `index.html` maps to the directory form
//      (`/vs/notion/index.html` → `/vs/notion/`), never to `/vs/notion/index`,
//      which would 404. `/404.html` is exempt: it is Pages' error document,
//      not a page with a canonical URL.
//
//      Verified safe: no `X.html` on this site has a sibling directory `X/`,
//      so stripping the extension can never make a path ambiguous
//      (`scripts/check-internal-redirects.js` re-checks this on every run).
//
//   3. Strip referral/attribution params (`ref`, `from`, `source`, `q`) that
//      identify a traffic source rather than a document. Analytics params
//      (`utm_*`, `gclid`, `fbclid`) are left intact — see the note at the
//      call site.
//
//   4. Map retired paths to their live targets, and answer 410 Gone for
//      slugs that never existed here.
//
// /admin/* is protected by its own middleware (Cloudflare Access auth).
// We must pass those requests through unmodified — root middleware runs
// FIRST, and a 301 here would prevent the Access auth from being checked.

// BEGIN data-publication (scripts/check-publication.mjs --write)
// **サイトが配信しない data/*.json。**一覧は data/publication-policy.json が正。
// 手で編集しない —— `node scripts/check-publication.mjs --write` が書く。
//
// **これは非公開化ではない。**リポジトリ自体が公開なので、同じ内容は GitHub 上で
// 読める（publication-policy.json の repository_is_public）。ここで止めているのは
// サイト経由の配信・索引・キャッシュだけ。
const UNSERVED_DATA = new Set([
  "audit-charter.json",
  "audit-findings.json",
  "autonomy-timeline.json",
  "autopilot-actions-report.json",
  "autopilot-actions.json",
  "benchmark.json",
  "check-blindspots.json",
  "check-selftests.json",
  "content-graph.json",
  "corporate-obligations.json",
  "cpp-map.json",
  "credential-expiry.json",
  "crossrepo-probes.json",
  "emergency-stop.json",
  "escalation-rules.json",
  "feature-backlog.json",
  "feature-outcomes.json",
  "financial-policy.json",
  "ingest-recovery.json",
  "injection-surface.json",
  "kpi-definitions.json",
  "model-eval-set.json",
  "model-routing.json",
  "monitoring-coverage.json",
  "pr-claims.json",
  "publication-policy.json",
  "revenue-series.json",
  "review-intake.json",
  "review-replies.json",
  "signal-ledger.json",
  "site-constants.json",
  "spend-approvals.json",
  "stop-drills.json",
  "vendor-register.json",
]);
// END data-publication

function isBlockedDataPath(pathname) {
  if (!pathname.startsWith("/data/")) return false;
  return UNSERVED_DATA.has(pathname.slice("/data/".length));
}

export const onRequest = async (context) => {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // Preserve Cloudflare Access auth chain for /admin/*. On the www host this
  // passes through too — `_redirects` still moves it to the apex afterwards,
  // and auth-before-redirect is the safer order for those paths anyway.
  if (path.startsWith("/admin/")) {
    return context.next();
  }

  let needsRedirect = false;

  // 0. Host: www → apex, folded into the same 301 as every fix below.
  //    Exact-match so preview deployments (*.pages.dev) are untouched.
  if (url.hostname === "www.simplememofast.com") {
    url.hostname = "simplememofast.com";
    needsRedirect = true;
  }

  // 0b. Collapse runs of duplicate slashes before anything else inspects the
  //    path. Pages treats `//docs//x` as `/docs/x`, so the internal-path
  //    block below has to reason about the collapsed form or it can be
  //    walked around with an extra slash.
  let pathname = path.includes("//") ? path.replace(/\/{2,}/g, "/") : path;

  // /docs/, /scripts/, /tools/, /growth/ and /CLAUDE.md hold internal working
  // files that live in the repo but must not be publicly served (Cloudflare
  // Pages deploys every tracked file). 2026-07-07 audit: /CLAUDE.md, /scripts/*
  // and /tools/.env.example were live 200 — ops-intel leak, no public pages
  // under any of these paths.
  //
  // /growth/ matters more than the others: it holds committed Search Console
  // snapshots and App Store Connect exports. Without this block, click,
  // impression and revenue figures would be readable at a guessable URL,
  // indexable by search engines and cacheable by intermediaries.
  //
  // 2026-08-26: this block does NOT make those files private. The repository
  // itself is public (api.github.com/repos/simplememofast/simplememo returns
  // private: false), so every path 404'd here is still readable on GitHub.
  // What the block buys is that the site does not serve, link or expose them
  // to crawlers — not confidentiality. See data/publication-policy.json
  // (`repository_is_public`); do not read these 404s as "not public".
  if (
    pathname === "/docs" ||
    pathname.startsWith("/docs/") ||
    pathname === "/scripts" ||
    pathname.startsWith("/scripts/") ||
    pathname === "/tools" ||
    pathname.startsWith("/tools/") ||
    pathname === "/growth" ||
    pathname.startsWith("/growth/") ||
    pathname === "/CLAUDE.md" ||
    // 【2026-08-26】**data/*.json の遮断はここでしか効かない。**
    //
    // 2026-08-25 に _redirects へ `/data/x.json /404.html 404` を並べたが、
    // **一度も効いていなかった。**Cloudflare Pages は実在する静的ファイルを
    // 優先し、そのパスの _redirects を無視する。対照実験（2026-08-26・本番）:
    //
    //   /privacy-policy               → 301  （ファイルが無い → _redirects が効く）
    //   /data/credential-expiry.json  → 200  （ファイルが在る → 無視される）
    //   /growth/experiments/...json   → 404  （この middleware は効く）
    //
    // Functions は静的アセットより先に走るので、ここに置けば実在しても止まる。
    // check-publication.mjs は「_redirects にブロックが在ること」を検査していたが、
    // **在ることと効くことは別だった。**設定を grep する検査は、効果を確かめない。
    isBlockedDataPath(pathname)
  ) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    });
  }

  // 1. Drop ?lang= (case-sensitive — URLSearchParams is, and we never use
  //    other casings either way).
  if (url.searchParams.has("lang")) {
    url.searchParams.delete("lang");
    needsRedirect = true;
  }

  // 1b. Drop referral/attribution params that carry no content meaning.
  //     Each one mints a distinct crawlable URL for the same page — GSC has
  //     collected `/?ref=launches.uicomet.com`, `/?from=AppAgg.com&…` and
  //     `/blog/?q={search_term_string}` (a literal from a since-removed
  //     SearchAction schema) that way. A 301 folds the backlink into the
  //     canonical URL instead of leaving a near-duplicate parked in the
  //     index.
  //
  //     `utm_*`, `gclid` and `fbclid` are deliberately NOT stripped: GA4 and
  //     the ad platforms read them off the landing URL, so a redirect would
  //     silently break campaign attribution. Those URLs are handled by the
  //     self-referencing canonical instead, which is also why robots.txt no
  //     longer Disallows them — a robots block would stop Googlebot from
  //     fetching the page and therefore from ever seeing the canonical
  //     (same reasoning as `?lang=` above).
  for (const param of ["ref", "from", "source", "q"]) {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      needsRedirect = true;
    }
  }

  // 2. Strip .html site-wide (canonical form is extensionless everywhere).
  //    `/404.html` is Pages' error document and has no canonical URL of its
  //    own, so it is left alone. `index.html` collapses to the directory
  //    form — `/vs/notion/index.html` → `/vs/notion/`, not `/vs/notion/index`.
  if (pathname !== "/404.html" && pathname.endsWith(".html")) {
    pathname = pathname.endsWith("/index.html")
      ? pathname.slice(0, -"index.html".length)
      : pathname.slice(0, -".html".length);
  }

  // 3. Retired paths → their final targets, applied to the ALREADY
  //    normalized pathname so every variant of a retired URL costs exactly
  //    one hop. Before this, `/blog/memo-shuukan-tips.html?lang=ja` went
  //    .html-strip → 301 → _redirects → 301 (two hops, and GSC reports every
  //    intermediate). Mirrors _redirects, which stays in place as the
  //    fallback if a Function deploy ever fails — keep the two in sync.
  const RETIRED = {
    "/blog/captio-alternatives-comparison": "/captio-alternative/",
    "/blog/line-keep-migration": "/blog/line-keep-alternative",
    "/blog/memo-app-free-guide": "/blog/free-memo-apps-ranking",
    "/blog/memo-shuukan-tips": "/blog/memo-habit",
    "/devlog/captio-alternative": "/captio-alternative/",
    "/en/blog/why-captio-died": "/en/captio-alternative/",
    "/privacy-policy": "/privacy",
    "/privacy-policy/": "/privacy",
    "/vs/whatsapp/": "/vs/",
    "/vs/telegram/": "/vs/",
    "/vs/trello/": "/vs/",
    "/vs/mem/": "/vs/",
    "/vs/slack-self-dm/": "/vs/",
    // A backlink (featureupvote.com, DR72) carries a stray closing paren.
    // `_redirects` has caught the bare form since it was added, but only
    // AFTER this middleware passed it through — so `/)?lang=ja` cost two
    // hops (301 here to `/)`, then 301 from `_redirects` to `/`) and GSC
    // counts every intermediate URL separately. Mirroring it here folds
    // both variants into the single hop the rest of this map already gets.
    "/)": "/",
    "/%29": "/",
  };
  if (RETIRED[pathname]) {
    pathname = RETIRED[pathname];
  }

  // 4. Slugs that never existed on this site but are repeatedly crawled
  //    because they are linked from off-site (see
  //    docs/seo/gsc-index-triage-2026-07-02.md — fabricated HN-style slugs
  //    that mimic our own vocabulary). A 404 invites Google to keep
  //    re-checking; 410 Gone is the explicit "this will never exist" signal
  //    and drops the URL from the index far faster. Verified absent from the
  //    full git history, all current sources and every sitemap.
  const GONE = new Set([
    "/blog/offline-first-outbox-teardown",
    "/blog/email-inbox-as-task-manager",
    "/blog/energy-budget-field-notes",
    "/blog/ios-cold-start-1-4s-to-287ms",
    "/blog/i-was-wrong-about-todo-debt",
    "/blog/no-third-party-deps-ios-18-months",
  ]);
  if (GONE.has(pathname)) {
    return new Response("Gone", {
      status: 410,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  }

  if (pathname !== path) {
    url.pathname = pathname;
    needsRedirect = true;
  }

  if (needsRedirect) {
    return Response.redirect(url.toString(), 301);
  }

  return context.next();
};
