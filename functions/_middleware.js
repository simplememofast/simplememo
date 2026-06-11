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
// Two normalizations:
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
//      /contact.html, /faq.html, /legal.html keep their extension as the
//      canonical URL form — those would 404 on the extension-less version,
//      so we deliberately leave them alone.
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

  // /docs/ holds internal working files that live in the repo but must not
  // be publicly served (Cloudflare Pages deploys every tracked file).
  if (path === "/docs" || path.startsWith("/docs/")) {
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

  // 2. Strip .html from /blog/*.html only (canonical form is extensionless).
  if (path.startsWith("/blog/") && path.endsWith(".html")) {
    url.pathname = path.slice(0, -".html".length);
    needsRedirect = true;
  }

  if (needsRedirect) {
    return Response.redirect(url.toString(), 301);
  }

  return context.next();
};
