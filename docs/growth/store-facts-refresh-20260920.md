# Public App Store facts refresh — 2026-09-20

The AI citation guide still named public version 5.8.9 and rating 4.2 from 25 ratings. This change corrects those published facts using a fresh Apple Japan storefront response and the existing constants synchronizer.

## Source and verification

- Source: https://itunes.apple.com/lookup?id=6758438948&country=jp
- Read on 2026-09-20 at 01:02:11 UTC; the existing strict network checker independently returned the same values before synchronization.
- App ID: 6758438948; seller: YURIKA, K.K.
- Public version: 5.8.66; Apple currentVersionReleaseDate: 2026-09-18T19:33:43Z.
- Japan rating: raw average 4.11538, displayed to one decimal as 4.1; 26 ratings.
- Minimum iOS: 16.0. The free app download is distinct from subscription pricing.
- The lookup does not verify in-app subscription prices. Their existing 2026-08-22 owner confirmation remains unchanged.

These values concern the public Japan storefront. They do not establish the distribution or acceptance of a newer TestFlight build, a global rating, new functionality, or business improvement.

## Published scope and interpretation

The existing `check-store-facts.mjs --net --write --strict` and `sync_constants.js --write` update the canonical ledger, visible rating text, JSON-LD ratings and software versions, and `llms.txt`. The citation guide now explains the individual source dates and keeps the oldest-source stamp used by the existing synchronizer. Its document update date does not renew historic measurements or price evidence. Source-derived sitemap dates are regenerated for changed HTML. The synchronizer now also covers the English download and review pages and the compact Japanese review summary. Regression checks retain the surrounding review quote and leave competitor pages unchanged. English visible rating references name the Japan storefront and link to the Japan source; download CTAs keep their existing storefront. Quoted customer reviews remain unchanged.

This is a user-directed factual correction within the unfinished-site work, not a new intervention experiment. No experiment lifecycle, baseline, evaluation deadline or success result changes. Rating and schema changes are concurrent changes for existing pre/post comparisons; their effects cannot be attributed to another intervention alone. The annotation date is the observation date. Actual publication is established by the merged commit and successful production deployment.

Affected HTML files (30):

- `ai-tags/index.html`
- `ar/index.html`
- `captio-alternative/index.html`
- `download/index.html`
- `en/ai-tags/index.html`
- `en/captio-alternative/index.html`
- `en/download/index.html`
- `en/fastest-voice-memo/index.html`
- `en/hands-free/index.html`
- `en/index.html`
- `en/note-to-email/index.html`
- `en/obsidian/index.html`
- `en/siri/index.html`
- `en/voice-input/index.html`
- `en/voices/index.html`
- `es/index.html`
- `fastest-voice-memo/index.html`
- `hands-free/index.html`
- `id/index.html`
- `index.html`
- `ko/index.html`
- `note-to-email/index.html`
- `obsidian/index.html`
- `pt-BR/index.html`
- `siri/index.html`
- `tr/index.html`
- `voice-input/index.html`
- `voices/index.html`
- `zh-Hant/index.html`
- `zh/index.html`
