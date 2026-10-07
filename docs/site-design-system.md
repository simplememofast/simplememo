# Public page design

The Obsidian landing page establishes the shared palette, typography and real product imagery. Marketing, articles, references and local tools share these foundations while retaining layouts suited to their content.

- Use `assets/css/site-design.css` for shared refinements. Existing capture layouts remain authoritative for their components.
- Run `python3 scripts/sync_page_design.py --write` after adding public pages or changing the shared stylesheet. The dependency-free migration preserves original copy, scripts, destinations, form controls and code examples. It adds structure only to pages that have not yet adopted the reading design.
- Run the same command with `--check` and `--selftest`, then `python3 scripts/sync_shared_chrome.py --write` and its `--check`.
- Regenerate homepage performance assets and sitemap dates using the existing build tools. Keep the content hashes in HTML in sync with the files they load.
- Keep existing campaign parameters and placement identities. A layout-only change must not create a new analytics history. Explicit `data-cta-position` is available when structural markup shifts the byte-based classifier across a boundary.
- Preserve native tables in a labelled, keyboard-focusable viewport. Screenshots are evidence: keep their original pixels and identify their language when used on a different language page.
- Review the whole page at mobile and desktop widths, including the final reading list and footer. Check readable contrast, focus, disclosure controls, reduced motion, print and JavaScript-disabled access. A screenshot of the hero alone is insufficient.

Administration pages, internal documentation and test fixtures are outside the public-page migration. The offline Memo Inbox and transactional screens retain their original controls and behavior.

The citation-assets generator applies the page design before shared chrome, so regenerating its reports, media kit or Markdown tools preserves this design without a second manual pass. Headings that already contain authored step numbers do not receive an additional decorative number.

The separately reviewed noindex URI results HTML is also pinned in `data/full-public-assets-manifest.json`. After changing its final source, refresh only that secondary entry's `sourceBytes` and `sourceSha256` from the file bytes. Preserve the raw evidence entries, title, canonical and noindex policy. Verify with `node --test scripts/full-public-assets-rate-limit.test.mjs` and `node scripts/gsc-crawled-indexing.mjs`.

Keep the home review and FAQ sections fully laid out. Their interactive descendants must remain within resolved section bounds even before scrolling; a short intrinsic placeholder can otherwise overlap downstream controls during accessibility navigation and measurement.
