# Notion comparison correction — 2026-09-07

The Japanese and English `/vs/notion/` pages said Simple Memo had no direct Notion integration, while `/notion/` already documented it. The comparison also presented an unverified launch-speed benchmark and personal story, described Notion as unencrypted, and understated its offline support. Readers could be sent through an unnecessary email automation instead of the supported connection.

The corrected article explains the email-recipient prerequisite, the default additional copy in SimpleMemo Inbox, and the Premium Notion-only setting. It links to the existing setup guide. These two guide pages were in the public sitemap but had no incoming navigation links from the other 267 sitemap pages, including slash/extension variants. No new landing page or PR release is introduced.

The article body, search/social descriptions, Article metadata, visible FAQs and generated FAQPage now agree. Unsupported speed comparisons, delivery guarantees and the unverifiable first-person story were removed. The existing App Store destinations and CTA measurement attributes remain unchanged. The shared tracking script is not modified.

## Evidence used

- Public app version source: `simplememo-ios` tag `v5.8.17`, commit `3bf3f41374ea555de9602fe1b913fede887821ed`; `SimpleMemo/NotionManager.swift` and `SimpleMemo/SettingsViewController.swift`. The public `/v1/notion/config` returned HTTP 200 with `available: true` at 2026-09-07 11:35 JST. These establish implementation and availability, not an actual device connection/save test.
- Existing integration description: `/notion/` and `/en/notion/`, introduced in site PR #998. This correction does not announce a new feature release or change its PR launch gates.
- [Notion offline help](https://www.notion.com/help/use-pages-offline): desktop/mobile support on all plans, downloaded-page editing and page creation; the browser is excluded.
- [Notion security practices](https://www.notion.com/help/security-and-privacy): encryption at rest and in transit. Device-local encryption is not a claim of end-to-end delivery encryption.
- [Notion plans](https://www.notion.com/pricing): distinguish individual Free usage from paid collaboration/administration features. The article does not publish a fixed regional price or claim the public API requires a paid plan.

Official references were checked on 2026-09-07. No new Notion connection, authorization, memo, email, purchase, or PR distribution was performed for this editorial correction.

## Evaluation

`growth/experiments/experiments.json` records this as `notion-comparison-accuracy-2026-09-07`. Existing 42 experiment records, baselines, states, dates and decisions are preserved. A future before/after analysis must account for the changed article, metadata and internal link. This is not evidence of increased SEO/AIO traffic or LTV.

Validation uses the existing SEO, FAQ, sitemap, locale and experiment checks, plus browser checks of the two changed pages and comparison of App Store link attributes against the base commit. Actual GA4 collection, search indexing, AI citations and device delivery remain separate observations.
