# Static page localization

`data/i18n/pages.json` associates each topic with ten language routes. Its
`existing` entries identify editorial documents that the translation builder
must preserve. Other entries are generated from the group's `source` document.
The registry is shared by language menus, canonical/hreflang generation and
sitemaps. Links to a translated topic retain the original query and fragment.
For editorial pages with different section IDs, the registry's `anchors`
maps the same section to its actual ID in each locale. Shared-page metadata
(`og:url` and `twitter:url`) uses the translated canonical URL as well.

## Updating translations

1. Edit the editorial source. Extract the current translation units into a
   local working file:

   ```sh
   python3 scripts/build_site_translations.py --extract /path/to/catalog.json
   ```

2. Translate each required unit without changing its protected markers.
   Draft JSONL records have `id`, `source` (the exact extracted text), `text`
   (the translation), and `target` (the target locale). Files are named
   `translations-SOURCE-TARGET.jsonl`. Reviewed corrections belong in
   `data/i18n/overrides/TARGET.json`, keyed by unit ID, with `source` and `text`.
   Imports reject stale corrections instead of silently discarding them.

3. Import drafts, inspect the report, and correct incomplete records:

   ```sh
   python3 scripts/import_site_translations.py /path/to/drafts --write --report /path/to/report.json
   ```

   Partial catalogs can be saved for continuing work. An incomplete import
   returns a nonzero status and does not publish HTML.

4. Review meaning as well as structure. Confirm negation, who performed an
   action, what was actually observed, inclusive/exclusive bounds, quantities,
   prices, Free plan limits, filenames and instructions. Machine translation
   and a structurally valid catalog do not establish linguistic correctness.

5. Generate the complete site, then run the existing shared-content and SEO
   checks:

   ```sh
   python3 scripts/build_site_translations.py --selftest
   python3 scripts/build_site_translations.py --write
   python3 scripts/normalize_i18n_head.py
   python3 scripts/sync_shared_chrome.py --write
   python3 scripts/inject_faq_schema.py
   python3 scripts/generate_sitemap.py
   python3 scripts/build_site_translations.py --check
   ```

   The builder collects all missing or invalid translations before writing
   public HTML. An unregistered public page also fails the build. Re-run the
   full repository validation and check the deployed pages after merging.

## Protected content

- Inline HTML structure, links, tracking parameters and identities are
  preserved. New markup from translation output is rejected.
- Generated pages retain the editorial source's CTA placement, campaign and
  approved CPP destination, including its existing QR code. Translation alone
  is not evidence that the App Store destination has localized CPP assets.
  Existing editorial routes keep their own independently verified mappings.
- Quantities with Japanese magnitude units are converted exactly before being
  restored. Free's daily allowance uses reviewed language-specific phrases.
- Download attributes, inline code and local ZIP members identify literal
  example filenames. Those names remain consistent with the actual downloads.
  Original screenshots, code samples and spoken Siri examples are retained.
- URI actions and parameter names, the `.obsidian` folder, `.md` extension,
  email addresses and product labels are protected from translation. A product
  name such as Keep is distinguished from the ordinary English verb.
- Korean particles after protected product names use a reviewed pronunciation
  list when the markers are restored. Unknown names and ordinary words are not
  guessed; the translation's markup and literal product names stay intact.
- FAQ structured data comes from the translated visible questions and answers.
  Do not separately translate its JSON-LD text.
- Arabic documents use `dir="rtl"`. Check actual mobile and desktop rendering,
  keyboard operation and mixed-direction content before publishing.
  Shared styles load the Arabic subset of Noto Sans Arabic locally; its SIL
  Open Font License is stored beside the font in `assets/fonts/`. The font is
  requested only where Arabic glyphs are used.
- Copyright lines come from the reviewed locale entries in
  `data/site-constants.json`; the generator and constants checker use the same
  text. Brand and publisher names retain their official spelling.

## Explanatory diagrams

`data/i18n/diagrams.json` contains reviewed labels for the explanatory SVGs.
The builder checks source labels, translates visible and accessible text, and
preserves the chart geometry and data. Long footnotes wrap without dropping
qualifiers; Arabic labels use right-to-left positioning. Generated SVG paths
include content hashes, and both generated and existing editorial pages receive
the corresponding display references. Links with a `download` attribute retain
their original source files, matching their descriptions of the original data.
Original app screenshots and evidence images remain unchanged.

## Dynamic interface text

`data/i18n/dynamic-text.json` records approved interface literals, source-script
hashes and exact ranges. Changed scripts fail until their bindings are reviewed
and updated. Parameterized messages preserve the original expressions; user
notes, recipients and other form values are not translation inputs.

Generated scripts in `js/i18n/LOCALE/` are named by their final content hashes.
Module imports are rewritten before hashing. Generated HTML loads only the
runtime and localized scripts it uses. Utility language links preserve their
query and fragment, and app-opening links retain their original root route.

Catalogs are public build inputs in this public repository. They must contain
no credentials, private paths, personal records or review screenshots. The
site middleware does not serve `/data/i18n/`; browsers receive generated HTML
and interface scripts instead. Keep translation engine logs and private review
artifacts outside the repository.
