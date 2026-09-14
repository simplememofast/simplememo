# Bing search and AI citation collection

Bing evidence joins the existing private Growth + Autonomy review. Search Console, Bing API search, Bing browser search, Bing AI citations and the fixed AI visibility probe are distinct series. Configuration, manual verification and successful unattended execution are distinct states.

## Owners and activation state

- `seo-daily.yml`: the existing daily schedule runs an independent `Bing search read-only` job when `BING_API_ENABLED=true`. It adds no timer and does not depend on GSC success.
- Native `obsidian`: the existing daily owner imports verified artifacts and collects browser evidence once per JST ISO week, with bounded recovery on later existing runs.
- API activation requires a Bing OAuth client and user consent for `Webmaster.read`. A merged reader or a skipped job does not establish connection. The initial rollout is disabled until the credentials are supplied and validated.
- AI Performance remains a browser/export source. No documented public AI Performance API was established when this adapter was designed. Search API data must not be substituted for AI citations.

## Official API and private delivery

The reader refreshes an access token at `https://www.bing.com/webmasters/oauth/token`, then uses only `GetRankAndTrafficStats`, `GetQueryStats` and `GetPageStats` at the official JSON API for `https://simplememofast.com/`. It never submits URLs or modifies the property. Bearer credentials stay in headers, not URLs. Each request has a 20-second timeout and at most three attempts for transport errors, 429 or 5xx responses. Authentication errors stop further authenticated reads. Error bodies and credentials are excluded from logs and receipts.

Set the following GitHub Actions secrets through a secure input channel after OAuth registration and consent: `BING_WEBMASTER_CLIENT_ID`, `BING_WEBMASTER_CLIENT_SECRET`, `BING_WEBMASTER_REFRESH_TOKEN`. Never put values in command arguments, conversation text or Git. Reuse the existing `ANALYTICS_RECIPIENT_PUBLIC_KEY_BASE64` repository variable; its private key remains on the Company host. Verify credentials with a private first API capture before setting `BING_API_ENABLED=true`; the next existing scheduled run establishes provider execution. Do not dispatch a second GSC query just to test Bing. If a provider changes refresh-token rotation, collection stops with `refresh_rotation_required` until a secure update path is reviewed.

The sole uploaded file is `bing-search.enc.json` in `bing-search-encrypted-<run>-<attempt>`, retained for 14 days. Encryption uses the existing RSA-OAEP/AES-GCM analytics envelope. The local reader checks the original GitHub repository, workflow, main SHA, run, attempt, event, timestamps, successful Bing job and artifact identity before admitting it. It revalidates cached output against fresh GitHub metadata and hashes. Missing artifacts retry on the next existing tick; no replacement workflow is dispatched. Only three recent completed runs are considered.

Private API output, receipts and handoff health live in `~/.config/simplememo/company-os/data/bing-webmaster/api/`. Browser observations live under `YYYY-Www/` alongside `verification.json`. Directories are 0700 and files 0600, outside Git. Do not copy private reports into site assets.

## Browser capture state

Read the private `data/bing-webmaster/COLLECTION.md` for the account, capture projection and current evidence. Use the supported browser UI; do not extract cookies, intercept tokens or call undocumented internal endpoints.

```sh
node scripts/bing-capture.mjs status
node scripts/bing-capture.mjs begin
# Retain the returned attempt ID; capture only missing sections.
node scripts/bing-capture.mjs complete --attempt ID
# Or record the actual failure, without making up a successful observation:
node scripts/bing-capture.mjs fail --attempt ID --outcome provider_transient
node scripts/bing-capture.mjs view
```

Valid failure outcomes: `auth_required`, `provider_transient`, `export_unavailable`, `invalid_data`. There are at most three attempts per week and at least six hours between transient attempts. A mutation lock prevents concurrent reservations or conflicting completion. `in_progress` requires inspection of the original task, not expiry-based re-execution. Authentication failures persist across weeks until newer valid evidence establishes recovery. Preserve a successfully collected section when retrying the other one.

`observed-ui.json` schema 1 includes `property`, `method: authenticated_visible_browser_ui_dom`, `observed_at`, `origin`, real owner/task evidence and filter/window metadata. Search has `state: collected`, `scope` and `retained_daily_rows` containing `date`, `clicks`, `impressions`. AI has `state: collected`, `daily_rows` containing `date`, `citations_display`, `citations_exact` (null for rounded values) and `cited_pages`, plus the displayed period/total and retained query/page samples. `verification.json.files` includes the SHA256 of `observed-ui.json`. A checksum verifies retained-file integrity, not provider truth or autonomous execution. The agent must verify account/property, date/filter scope and the source-to-file transcription separately.

## Review and interpretation

`company-os collect` imports the API artifact independently of other sources. `growth-status` and `review --cadence weekly` render current verified evidence automatically. Regeneration must not append text to the review JSON's `markdown` field: it is the Markdown file path.

Observations older than eight days, future dates, duplicate dates, wrong properties, null counts and altered aggregates are rejected. A comparison window requires every date. Missing rows never become zero; rounded `K` citation displays never become exact integers. CTR uses summed clicks divided by summed impressions. API/UI parity, search type, country/device scope and query/page date semantics require validation against the provider; retain API labels separately until verified. Query and cited-page lists are samples, not the complete population.

Provider outages, revocation, processing delay and UI changes remain possible. API scheduling removes dependence on browser login and the local Mac for search acquisition; local import and AI browser capture still need the native host. A saved retry policy does not prove recovery, and one successful run does not guarantee later runs.

## Recovery and rollback

Inspect private handoff health and original job logs without printing credentials. Retain failures and keep independent sources running. Resolve user authentication through the supported consent flow; do not repeatedly attempt a blocked login or replace it with a broader API key. Disable `BING_API_ENABLED` to stop API calls. Revert the integration through a reviewed PR if needed, preserving private evidence, original GSC collection and the existing AI probe.

Official references: [access options](https://learn.microsoft.com/en-us/bingwebmaster/getting-access), [OAuth](https://learn.microsoft.com/en-us/bingwebmaster/oauth2), [API interface](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi?view=bing-webmaster-dotnet), [AI Performance help](https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c).
