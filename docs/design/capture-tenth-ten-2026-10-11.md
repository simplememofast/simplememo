# Tenth group of ten: practical writing, comparisons and tools

## Selection and scope

Continue the previous ranking after excluding 92 already redesigned topics.
The verified committed `growth/data/gsc/2026-10-10` snapshot covers
2026-09-09 through 2026-10-06. Rank the 163-topic editorial inventory by
`monetizationRelevance`, then clicks, impressions and path. These are declared
intent proxies and search observations, not measured lifetime value.

| Japanese route | Intent score | Clicks | Impressions |
|---|---:|---:|---:|
| `/obsidian/zettelkasten/` | 1 | Not observed | Not observed |
| `/blog/memo-taking-tips` | 0.5 | 6 | 221 |
| `/blog/second-brain-capture-first` | 0.5 | 3 | 73 |
| `/resources/obsidian-uri/` | 0.5 | 3 | 13 |
| `/blog/business-memo-apps-2026` | 0.5 | 2 | 104 |
| `/vs/` | 0.5 | 2 | 46 |
| `/vs/bear/` | 0.5 | 2 | 38 |
| `/blog/email-yourself-app-comparison` | 0.5 | 2 | 26 |
| `/blog/freelance-memo-management` | 0.5 | 2 | 24 |
| `/vs/joplin/` | 0.5 | 2 | 21 |

Every topic includes Japanese, English, Simplified Chinese, Traditional Chinese,
Korean, Spanish, Brazilian Portuguese, Indonesian, Arabic and Turkish: 100 pages.
Six independent English articles remain separate sources. The existing pipeline
generates the other 84 translations from the ten Japanese sources.

## Design and preservation

Reuse `capture-eighth.css` and `capture-ninth.css`, with a scoped
`capture-tenth.css` layer. The design covers introductions, reading indexes,
chapter hierarchy, app comparisons, practical examples, tables, FAQ, related
links, author notes and the shared header/footer.

The Zettelkasten introduction reuses an unaltered screenshot already present in
the article. The duplicate is decorative; the original image, alt text, caption
and Linux qualification remain. No invented application screen or new product
claim is added. Editorial introductions retain their own existing chapter links.

The URI tool gains the same navigation and visual system. Its form IDs, names,
values, validation attributes, hidden rows, readonly output and JavaScript remain
unchanged. Its article is divided into chapters without nesting unrelated
sections inside the preceding chapter. No URI is automatically executed.

Tables scroll inside labelled keyboard-focusable regions. Native details/summary
remain keyboard-operable. Existing CTA destinations and tracking attributes,
article prose, headings, anchors, raw code, evidence images, metadata, footer
copy and runtime scripts are preserved across all 100 pages. The generator
reformats FAQ JSON-LD; seven translated FAQ answers also correctly decode the
existing `&amp;` entity. Parsed structured content is otherwise unchanged.

## Review and validation

The first visual pass found missing inner spacing on the tool output panel;
it is now explicit. The 400-layout sweep found long translated rank labels
forcing overflow; flexible wrapping fixes this without truncation. Adversarial
review identified Joplin number badges overlapping the article after the old
padding was removed. Logical padding and logical positioning now provide 20px
of clearance in both directions. Re-review found the issue resolved.
The markup gate also caught 13 redundant image closing tags introduced during
serialization. Void-image children were restored to their browser reading order
and all affected translations were regenerated; content invariants still pass.

Browser checks cover every page at 320, 375, 430 and 1440px, with no page overflow
or clipped reading blocks. Direct visual review covers introductions, article
examples, comparison lists, the tool and closing navigation. Keyboard checks
cover all ten themes and all ten locales in a rotating sample: menu and language
Enter/Escape, and FAQ Enter toggles where present. The business-app article has
no FAQ. The URI generator's new/open/extended/reset flows pass in all ten locales.
Copy returns the displayed URI, JavaScript-disabled fallback and native FAQ work,
print labels are dark, and reduced-motion mode disables smooth scrolling.

The content invariant audit compares all 100 pages with the base commit,
including form control signatures, links and CTA attributes, code, images,
metadata and parsed JSON-LD. It finds no unintended differences. Runtime scripts
remain byte-identical. CSS is content-hashed and registered in the asset checker.

No award outcome or revenue improvement is claimed. Publication also requires
complete repository checks, static translation synchronization, successful
required CI, and production readback of every changed page and its CSS bytes.
