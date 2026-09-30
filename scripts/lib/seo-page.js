/** Per-page SEO rules. No file reads, CLI state or output on import.
 * Preserve the existing detectors, message order and noindex short circuit.
 */

/**
 * Read one attribute off the first <meta> tag whose `key` attribute equals
 * `value`, regardless of attribute order or quote style. Scoping the scan to
 * a single tag is what keeps a value containing an apostrophe (or a page that
 * writes `content` before `name`) from being mis-measured.
 * Returns null when no such tag exists.
 */
function getMetaContent(html, key, value) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = {};
    for (const a of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      attrs[a[1].toLowerCase()] = a[3] !== undefined ? a[3] : a[4];
    }
    if ((attrs[key] || '').toLowerCase() === value) {
      return attrs.content !== undefined ? attrs.content : null;
    }
  }
  return null;
}

/**
 * ISO 8601 date-time carrying an explicit timezone — `Z` or `±hh:mm`.
 * A bare `2026-08-11` fails, and so does a local time with no offset.
 */
const ISO_DATETIME_TZ =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Every JSON-LD node on a page, flattened: top-level objects, arrays of them,
 * and the members of an `@graph`. Yields the nested objects too, since a
 * VideoObject is as likely to hang off `video:` or `mainEntity:` as it is to
 * be the block's root.
 *
 * A block that does not parse is reported and skipped rather than thrown on:
 * the extraction below is a regex, and a page that defeats it should not be
 * able to fail the build on its own.
 */
function jsonLdNodes(html, rel, warnings) {
  const nodes = [];
  const walk = (value) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === 'object') {
      nodes.push(value);
      Object.values(value).forEach(walk);
    }
  };
  const blocks =
    html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of blocks) {
    const body = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    try {
      walk(JSON.parse(body));
    } catch (e) {
      warnings.push(`[SCHEMA] Unparseable JSON-LD block (${e.message}): ${rel}`);
    }
  }
  return nodes;
}

/** A node's `@type`, always as an array — schema.org allows one or many. */
function nodeTypes(node) {
  const type = node['@type'];
  if (Array.isArray(type)) return type;
  return type ? [type] : [];
}


function validatePage(content, { rel, pageUrl, getSiteUrls, ownAppNames, canonicalAppId }) {
  const errors = [];
  const warnings = [];
  const context = { rel, pageUrl, getSiteUrls, ownAppNames, canonicalAppId, errors, warnings };
  if (/content\s*=\s*["'][^"']*noindex/i.test(content)) return { errors, warnings };
  checkLanguageMarkup(content, context);
  checkDocumentHead(content, context);
  checkPreviewMetadata(content, context);
  checkStructuredData(content, context);
  return { errors, warnings };
}

function checkLanguageMarkup(content, { rel, errors, warnings }) {
  // 0. Language-switch markup that nothing switches.
  //
  // `data-lang` spans are inert on their own: the stylesheet hides
  // [data-lang="en"] and js/lang.js is what reveals the right one. A page
  // carrying those spans WITHOUT that script renders the Japanese span and
  // only the Japanese span — including on pages declaring <html lang="en">.
  //
  // This shipped on 2026-08-11: the next-step card was written with both
  // spans and added site-wide, which put a Japanese-only card at the foot of
  // 39 English pages. Every existing check passed, because none of them knew
  // what language a page was supposed to be in. This one does.
  if (/data-lang\s*=\s*["']ja["']/i.test(content) && !/lang\.js/i.test(content)) {
    const langAttr = content.match(/<html[^>]*\blang\s*=\s*["']([^"']+)["']/i);
    const declared = langAttr ? langAttr[1].toLowerCase() : '';
    if (declared.startsWith('en')) {
      errors.push(`[LANG] English page renders Japanese-only data-lang spans (no lang.js to switch them): ${rel}`);
    } else {
      warnings.push(`[LANG] data-lang spans present but no lang.js to switch them: ${rel}`);
    }
  }
}

function checkDocumentHead(content, { rel, errors, warnings, pageUrl, getSiteUrls }) {
  // 1. Title tag
  const titleMatch = content.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!titleMatch || !titleMatch[1].trim()) {
    errors.push(`[TITLE] Missing or empty <title> tag: ${rel}`);
  } else if (titleMatch[1].length > 70) {
    warnings.push(`[TITLE] Title too long (${titleMatch[1].length} chars): ${rel}`);
  }

  // 2. Meta description
  //
  // Parsed per <meta> tag rather than with one document-wide regex. Two
  // real bugs made that necessary:
  //   - `content="([^"']*)"` stopped the value at the first apostrophe, so
  //     `content="…memos aren't. Set up…"` measured 35 chars instead of 141
  //     and skipped the >160 check entirely.
  //   - Widening it to a lazy `[\s\S]*?` then over-matched in the other
  //     direction on the ~15 pages that write the attributes content-first
  //     (`<meta content="…" name="description"/>`): the pattern anchored on
  //     an earlier `<meta content="…">` tag and swallowed everything up to
  //     the description, reporting 1,400+ chars.
  const desc = getMetaContent(content, 'name', 'description');
  if (desc === null || !desc.trim()) {
    errors.push(`[DESC] Missing meta description: ${rel}`);
  } else if (desc.length > 160) {
    warnings.push(`[DESC] Description too long (${desc.length} chars): ${rel}`);
  } else if (desc.length < 110) {
    // Ahrefs' Site Audit flags anything under 100 characters as "Meta
    // description too short" (59 pages in the 2026-08-05 crawl). 110 keeps a
    // margin above that line.
    warnings.push(`[DESC] Description too short (${desc.length} chars): ${rel}`);
  }

  // 3. Canonical tag
  if (!content.includes('rel="canonical"')) {
    errors.push(`[CANONICAL] Missing canonical tag: ${rel}`);
  }

  // 4. Hreflang tag
  //
  // Only meaningful when the other language actually exists as its own URL.
  // hreflang declares "the same document lives at this other address"; on a
  // page that has no counterpart there is no address to declare, so the tag
  // cannot be added and the warning can never be cleared.
  //
  // Unconditional, this warned on 163 of 240 pages — every JA-only article,
  // glossary entry, use-case and /vs/ comparison that has no /en/ twin. All
  // 163 were unfixable, and they buried the checks that do need acting on
  // (the run printed 163 warnings, 0 of them actionable). The 71 pages that
  // DO have a counterpart already carry a correct ja/en/x-default triple, so
  // the real gap this check exists to catch was, and is, empty.
  //
  // Note this is NOT the same thing as the site's bilingual `data-lang`
  // markup: 158 pages ship both languages inline at ONE url. That is what
  // check 0 above polices. Those pages are single-URL by design and are
  // correctly silent here.
  const counterpartUrl = pageUrl.startsWith('/en/')
    ? pageUrl.slice('/en'.length)
    : '/en' + pageUrl;
  if (getSiteUrls().has(counterpartUrl) && !content.includes('hreflang=')) {
    warnings.push(
      `[HREFLANG] Missing hreflang tag (counterpart ${counterpartUrl} exists): ${rel}`,
    );
  }
}

function checkPreviewMetadata(content, { rel, errors, warnings }) {
  // 5. Structured data (JSON-LD)
  if (!content.includes('application/ld+json')) {
    warnings.push(`[SCHEMA] No structured data (JSON-LD): ${rel}`);
  }

  // 6. Social previews need the full OG core and an explicit X card type.
  // X title/description/image may legitimately fall back to their OG values.
  for (const property of ['og:title', 'og:type', 'og:url', 'og:image']) {
    if (!getMetaContent(content, 'property', property)?.trim()) {
      errors.push(`[OG] Missing or empty ${property}: ${rel}`);
    }
  }
  if (!getMetaContent(content, 'name', 'twitter:card')?.trim()) {
    errors.push(`[TWITTER] Missing or empty twitter:card: ${rel}`);
  }

  // 7. Viewport
  if (!content.includes('viewport')) {
    errors.push(`[VIEWPORT] Missing viewport meta tag: ${rel}`);
  }

  // 8. Check for ?lang= in href attributes (should not exist in HTML source)
  const langParamLinks = content.match(/href="[^"]*\?lang=/g);
  if (langParamLinks) {
    warnings.push(`[LANG-PARAM] Found ${langParamLinks.length} links with ?lang= in source HTML: ${rel}`);
  }

  // 9. Check for deprecated schema types
  if (content.includes('"@type": "HowTo"') || content.includes('"@type":"HowTo"')) {
    errors.push(`[SCHEMA] Deprecated HowTo schema found: ${rel}`);
  }
}

function checkStructuredData(content, { rel, errors, warnings, ownAppNames: OWN_APP_NAMES, canonicalAppId: CANONICAL_APP_ID }) {
  // 10. Our own SoftwareApplication must carry the canonical @id.
  //
  // JSON-LD merges nodes by @id. A node naming our app without one is a
  // SEPARATE entity as far as a consumer is concerned, so the same product
  // gets published as several competing things — which is the exact condition
  // brand-2026-08-11-entity-merge exists to undo.
  //
  // That experiment was recorded as "resolved inside and out" on 2026-08-11
  // on the strength of a count over Organization nodes, all 223 of which did
  // point at the canonical @id. Nobody had counted SoftwareApplication, and
  // six of ours (ai-tags ja/en, apple-watch ja/en, voices,
  // en/send-email-to-yourself) carried no @id at all. A check that runs over
  // Organization cannot see that; this one looks at the node type that was
  // actually broken.
  //
  // Competitor apps are the reason this matches on the NAME rather than on
  // the type alone: /en/send-email-to-yourself/ lists seven rival apps as
  // SoftwareApplication nodes, and those must stay separate entities with no
  // @id of ours.
  for (const m of content.matchAll(/"@type":\s?"SoftwareApplication"([\s\S]{0,400}?)"name":\s?"([^"]+)"/g)) {
    const [between, name] = [m[1], m[2]];
    if (!OWN_APP_NAMES.has(name)) continue;          // a rival's node
    if (between.includes(CANONICAL_APP_ID)) continue; // @id already inside
    // The @id may also sit after the name within the same node.
    const after = content.slice(m.index, m.index + 1200);
    if (after.includes(CANONICAL_APP_ID)) continue;
    errors.push(
      `[SCHEMA] SoftwareApplication "${name}" is missing @id "${CANONICAL_APP_ID}" ` +
      `— it publishes as a separate entity: ${rel}`,
    );
  }

  // 11. VideoObject date-time properties need a time AND a timezone.
  //
  // Schema.org accepts a bare Date for uploadDate; Google's video structured
  // data does not, and reports anything without an offset as「日時値が無効
  // です」/「タイムゾーンがありません」. The five explainer videos shipped on
  // 2026-08-11 with `"uploadDate":"2026-08-11"`, and Search Console flagged
  // all five on 2026-08-12 (WNC-10030322). Nothing here could have caught it:
  // check 5 only asks whether a page has any JSON-LD at all, so a video whose
  // publication date Google cannot read still passed.
  //
  // Non-critical today, which is exactly why it needs a guard — Google's own
  // notice says non-critical issues get reclassified as critical, and by then
  // the markup would be one copied template away from spreading to every new
  // video page.
  for (const node of jsonLdNodes(content, rel, warnings)) {
    const types = nodeTypes(node);
    for (const prop of ['proficiencyLevel', 'dependencies']) {
      if (node[prop] !== undefined && !types.includes('TechArticle')) {
        errors.push(`[SCHEMA] ${prop} belongs to TechArticle: ${rel}`);
      }
    }
    // Unrated testimonial summaries stay visible, but cannot be Review rich results.
    if (types.includes('Review') && node.reviewRating?.ratingValue === undefined) {
      errors.push(`[SCHEMA] Review missing required reviewRating.ratingValue: ${rel}`);
    }
    if (!nodeTypes(node).includes('VideoObject')) continue;
    const name = node.name || node['@id'] || '(unnamed)';
    if (node.uploadDate === undefined) {
      errors.push(`[SCHEMA] VideoObject missing required uploadDate (${name}): ${rel}`);
    }
    // `expires` and the BroadcastEvent start/end pair are the other
    // date-times Google reads off a video; same format rule applies.
    for (const prop of ['uploadDate', 'expires', 'startDate', 'endDate']) {
      const value = node[prop];
      if (value === undefined) continue;
      if (typeof value !== 'string' || !ISO_DATETIME_TZ.test(value)) {
        errors.push(
          `[SCHEMA] VideoObject ${prop} needs a time and a timezone offset ` +
          `(got "${value}", want e.g. 2026-08-11T13:42:48+09:00) in ${name}: ${rel}`,
        );
      }
    }
  }
}

module.exports = { getMetaContent, validatePage };
