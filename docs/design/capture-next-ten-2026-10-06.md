# Next ten capture guides

This release extends the `/obsidian/` reading system to another ten Japanese pages, including the body, diagrams, tables, code examples, FAQ, sources, related reading and footer. It excludes the homepage and pages covered by the previous capture-design releases.

## Selection and measurement limits

These are priority pages, not a measured lifetime-value ranking. Selection uses the existing `monetizationRelevance` hypothesis in `growth/lib/gsc.mjs` (highest tier: repeated capture, Obsidian, voice, Watch and Captio intent), followed by clicks, impressions and path as a deterministic tie-breaker. The source is the verified GSC daily handoff collected on 2026-10-03, covering 2026-09-02 through 2026-09-29, run 37081053944. Previously redesigned pages and English equivalents are excluded. The retained CTA measurement has quality blockers and cannot establish page-level LTV or conversion uplift.

| Page | Clicks | Impressions |
| --- | ---: | ---: |
| `/obsidian/plugins/dataview/` | 7 | 324 |
| `/blog/email-to-obsidian` | 7 | 104 |
| `/blog/obsidian-iphone-memo` | 4 | 159 |
| `/siri/` | 3 | 203 |
| `/apple-watch-obsidian/` | 3 | 62 |
| `/fastest-voice-memo/` | 2 | 163 |
| `/obsidian/compare/` | 2 | 53 |
| `/obsidian/compare/capacities/` | 1 | 15 |
| `/captio/` | 1 | 11 |
| `/blog/obsidian-voice-fastest-route` | 1 | 6 |

## Design and preservation

- Opt-in classes load the established `capture-editorial.css` and `capture-content.css`. `capture-next.css` scopes specialized components to these ten pages; it does not change the previous twelve.
- Desktop chapters pair a numbered heading with a bounded reading column. Comparison tables and galleries span the wider page; mobile uses one column and labelled keyboard-scrollable regions.
- Page-specific reading routes and a native contents disclosure provide entrances into long articles. Header, footer, FAQ and final reading links continue the same typography and palette.
- Real, already-published app screenshots appear in device frames with clear captions. The old Watch promotional mockup becomes a labelled role diagram; the old voice-input UI animation becomes a real app screenshot with its existing five-step explanation. The Watch trademark/independence caption remains. New labels do not add product capabilities.
- Original H1, metadata, JSON-LD, canonical/hreflang, managed comments, existing anchors and link destinations remain. App Store links and every `data-cta-*` value are unchanged. Existing prose remains except for the removed mock interface's placeholder copy and its animation caption. The iPhone FAQ uses native disclosures with the original questions, answers and source link.
- Sitemap lastmod values follow the existing generator. No experiment definitions, evaluation dates or decisions change. This visual release overlaps the running site-wide brand intervention and the Siri video intervention; before/after changes must not be attributed solely to either intervention or this design release.

## Acceptance

Review covers the entire page, including the last content blocks. Automated checks supplement direct visual inspection; they do not establish contest results or universal accessibility compliance. Release evidence records responsive geometry, keyboard controls, accessibility findings, browser checks, source/CTA preservation, CI and production verification.

Completed-draft adversarial review found a missing base layout on the voice-route article, FAQ rows without the shared summary class, and four-column footers using the three-column variant. Those issues are fixed and visually rechecked. A final small spacing correction separates the comparison hub's standalone cards. All ten pages were checked at 375px and 1440px with FAQ expanded; text-range comparisons found no clipping by hidden/clip ancestors. All eight tables fit their cells at a 700px print width. No major or moderate review findings remain.
