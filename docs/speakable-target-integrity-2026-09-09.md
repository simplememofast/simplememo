# Speakable selector integrity — 2026-09-09

An audit found 44 nonexistent CSS selectors in `SpeakableSpecification` declarations on 44 pages. These referred to removed section classes or to the other language's mission statement after localization. Remove only the nonexistent entries; preserve each declaration's remaining targets and all visible markup.

The browser's DOM parser and `querySelectorAll` resolve all 641 remaining selectors across 241 pages to nonempty text. All tracked HTML is included in the scan. Before/after checks confirm that content outside JSON-LD is byte-identical on the 44 edited pages. Other structured-data fields are unchanged. The sitemap is regenerated because 24 affected pages have older content-derived modification dates.

This repairs metadata references. It does not establish Google feature eligibility, search ranking, AI citations, conversion gains, or a higher AI execution rate. Google's documented consumer use of speakable is currently for English-language topical news on Google Home in the US; generic Schema.org validity has a different scope. See [Google's speakable documentation](https://developers.google.com/search/docs/appearance/structured-data/speakable).

Validation: Chrome DOM selector scan (641 selectors, zero missing or empty); SEO validation; 193 of 194 preflight checks initially passed, and the remaining sitemap check passed after regeneration. Page text, FAQ declarations, CTA configuration, experiment dates and decisions remain unchanged.
