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
//   1. Strip any `?lang=*` query parameter. The site does not use this
//      parameter — locale is determined by path (`/en/*` for EN, root for
//      JA). This 301 is the SOLE handler for `?lang=`: robots.txt
//      deliberately does NOT Disallow it, because a robots block would
//      stop Googlebot from ever fetching the URL and therefore from ever
//      seeing this redirect (it would just sit in GSC as "blocked by
//      robots.txt" instead of being dropped from the index).
//
//   2. Strip `.html` from `/blog/*.html` URLs only. The blog directory's
//      canonical form is extension-less. Root-level pages such as
//      /contact.html, /faq.html, /legal.html are left alone here: Pages
//      itself already serves them at both forms and 308-redirects the
//      .html form to the extension-less one (e.g. /faq.html → /faq; see
//      the note in _headers), so no extra handling is needed.
//
//   3. Strip referral/attribution params (`ref`, `from`, `source`, `q`) that
//      identify a traffic source rather than a document. Analytics params
//      (`utm_*`, `gclid`, `fbclid`) are left intact — see the note at the
//      call site.
//
//   4. Map retired paths to their live targets, and answer 410 Gone for
//      slugs that never existed here.
//
// Other directories (/vs/, /use-cases/, /glossary/, /guides/) use
// /<dir>/<slug>/ (folder + index.html). Direct .html requests under those
// paths are rare; if Search Console shows them later we can add similar
// scoped rules. Keeping the rule narrow today avoids accidentally breaking
// any path that intentionally serves a .html file.
//
// /admin/* is protected by its own middleware (Cloudflare Access auth).
// We must pass those requests through unmodified — root middleware runs
// FIRST, and a 301 here would prevent the Access auth from being checked.

export const onRequest = async (context) => {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // Preserve Cloudflare Access auth chain for /admin/*.
  if (path.startsWith("/admin/")) {
    return context.next();
  }

  // /docs/, /scripts/, /tools/ and /CLAUDE.md hold internal working files
  // that live in the repo but must not be publicly served (Cloudflare Pages
  // deploys every tracked file). 2026-07-07 audit: /CLAUDE.md, /scripts/*
  // and /tools/.env.example were live 200 — ops-intel leak, no public pages
  // under any of these paths.
  if (
    path === "/docs" ||
    path.startsWith("/docs/") ||
    path === "/scripts" ||
    path.startsWith("/scripts/") ||
    path === "/tools" ||
    path.startsWith("/tools/") ||
    path === "/CLAUDE.md"
  ) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    });
  }

  let needsRedirect = false;

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

  // 2. Strip .html from /blog/*.html only (canonical form is extensionless).
  let pathname = path;
  if (pathname.startsWith("/blog/") && pathname.endsWith(".html")) {
    pathname = pathname.slice(0, -".html".length);
  }

  // 3. Retired paths → their final targets, applied to the ALREADY
  //    normalized pathname so every variant of a retired URL costs exactly
  //    one hop. Before this, `/blog/memo-shuukan-tips.html?lang=ja` went
  //    .html-strip → 301 → _redirects → 301 (two hops, and GSC reports every
  //    intermediate). Mirrors _redirects, which stays in place as the
  //    fallback if a Function deploy ever fails — keep the two in sync.
  const RETIRED = {
    "/blog/captio-alternatives-comparison": "/captio-alternative/",
    "/blog/memo-shuukan-tips": "/blog/memo-habit",
    "/en/blog/why-captio-died": "/en/captio-alternative/",
    "/privacy-policy": "/privacy",
    "/privacy-policy/": "/privacy",
    "/vs/whatsapp/": "/vs/",
    "/vs/telegram/": "/vs/",
    "/vs/trello/": "/vs/",
    "/vs/slack-self-dm/": "/vs/",
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
