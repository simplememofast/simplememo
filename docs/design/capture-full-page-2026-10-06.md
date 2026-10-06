# Full-page capture design

This extends the 2026-10-05 capture-page design through the entire reading experience. The scope remains the homepage, the ten priority guides listed in `capture-quality-2026-10-05.md`, and the `/obsidian/` reference. Priority reflects conversion relevance and search evidence, not measured customer lifetime value.

## What changes below the hero

- Guides use numbered chapters, a heading column and a reading column on desktop, and a single column on mobile. Tables, screenshots and comparisons use the wider chapter layout. Paragraphs retain a bounded reading measure within the wider page.
- Notes, numbered steps, comparison tables and code examples share the reference palette. Tables retain their semantics in labelled, keyboard-scrollable viewports; the first column stays visible on mobile.
- The voice-input guide separates its five existing explanations into labelled cards. Its three real app screenshots have device frames and captions. Existing guide screenshots retain their aspect ratio and are not enlarged beyond their natural dimensions.
- Homepage sections now share one spacing and type hierarchy. Feature cards, real app screens, developer story, reviews, pricing, FAQ, references and final reading links are part of this system. Mobile pricing cards stack vertically. The first-view photograph and the four feature banners are unchanged.
- FAQ rows, related reading, references and final destinations continue the design to the footer. The reference LP also receives this treatment at its previously unstyled tail.

The opt-in `capture-full` class isolates these rules. The shared font stack remains Hiragino-first; body copy is 16px on mobile and 17px on desktop. Content, link destinations, structured data, navigation/footer markup and CTA attributes are preserved. Added text is limited to section and screenshot labels.

## Review record

The first completed-draft review identified missing stylesheet loading on the reference LP and unreadable print colors. Loading was fixed; follow-up review caught legacy high-specificity print overrides and edge-to-edge related links on the reference. A dedicated print cascade layer and an explicit reading width resolve those issues. Self-review also removed whole-card link underlines and prevented low-resolution evidence screenshots from being stretched.

Acceptance includes the whole page, not only the first viewport: chapter rhythm, table handling, app-screen fidelity, lower-page links and sources, mobile gutters, keyboard controls, and print readability. Automated checks supplement direct visual review; neither establishes contest results or certifies every assistive technology.

Final adversarial review found no remaining major or moderate issues. It checked all twelve comparison tables at a 700px print width, app galleries, FAQ print colors, and all twelve pages at 375, 430 and 1440px. Captio's legacy nonwrapping cells now wrap in print; the reference's final reading list retains 20px mobile gutters.
