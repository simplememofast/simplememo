# AI Citation Strategy — Per-Platform Playbook

**Last updated:** 2026-05-20
**Owner:** AI Ataka
**Status:** Living document — revise as platform behavior shifts (target: monthly review)
**Related files:** `/robots.txt`, `/llms.txt`, `SEO_AIO_STRATEGY_v1.md`

This is the internal playbook for getting SimpleMemo cited by AI answer engines. It pairs with `/llms.txt` (which is the *external* surface readable by bots) and `/robots.txt` (which is the access policy). Three things drive AI citation today:

1. **Crawl access** — the right bots can reach the right pages (handled by `/robots.txt`).
2. **Citable content** — pages have structured, self-contained, attributable claims (handled by content design).
3. **Platform-specific surfaces** — each AI product has different ranking signals, surfaces, and quirks (this document).

For each platform below: (a) how it surfaces citations, (b) the specific levers we control, (c) the measurement signal we use to know it's working.

---

## 1. Google AI Overviews (formerly SGE) + Gemini

**Why it matters:** Google AI Overviews now appears above the blue-link results for ~25% of informational queries in JP/EN markets. A citation here is worth more visibility than a #1 organic ranking because the overview box steals attention before the user scrolls.

**How citations get selected:**
- Pulls primarily from the top ~20 organic Google index results for the query
- Strong preference for pages with clear, declarative, ≤2-sentence answers in the first 200 words after an `<h2>` matching the question intent
- Heavy reliance on schema.org structured data (FAQPage, HowTo, Product, Organization)
- E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) heuristics — about-author bio, citation chains, and updatedAt freshness matter

**Levers we control:**
- ✅ `Google-Extended` bot allowed in `/robots.txt`
- ✅ FAQPage JSON-LD on `/faq` and 7+ high-impression pages
- ✅ Author bio + organization schema on `/about/`
- ✅ `dateModified` populated on every blog post
- 🟡 **Action:** Audit top-10 highest-impression pages in GSC and ensure each leads with a 1-2 sentence direct answer to the implied query
- 🟡 **Action:** Add `mainEntityOfPage` JSON-LD pointing comparison pages (`vs/*`) at the relevant Product entity

**Measurement signal:**
- GSC "AI Overviews appearances" filter (when Google exposes it; otherwise infer from drops in CTR on positions 1-3 for informational queries)
- Manual quarterly test: search 20 brand+topic queries in incognito, screenshot if SimpleMemo appears in Overviews

---

## 2. Perplexity

**Why it matters:** Perplexity is the answer engine most likely to **cite by URL** with a visible source list under each answer. The threshold to be cited is lower than AI Overviews — being in the top 5 web results for a niche query usually gets you a citation. It also drives unusually high-intent traffic (users who searched on Perplexity are 3-5x more likely to convert vs. organic Google).

**How citations get selected:**
- Live web search per query via Bing index + custom Perplexity index
- Citation slot is the 4-6 sources shown in the source carousel under the answer
- Heavily favors recent (last 6-12 months) content with clear date stamps
- Penalizes thin "SEO answer pages" — prefers pages with original benchmarks, comparison tables, dated screenshots, or first-party data

**Levers we control:**
- ✅ `PerplexityBot` + `Perplexity-User` allowed in `/robots.txt`
- ✅ First-party benchmark data on `/blog/fastest-memo-app-benchmark` and `/blog/benchmark-methodology`
- ✅ Comparison tables on every `/vs/*` page
- 🟡 **Action:** Keep dated examples in every comparison page (e.g., "as of 2026-05-20, Notion's free plan...") — Perplexity weights freshness aggressively
- 🟡 **Action:** Add a `lastReviewed` visible note at the top of high-traffic comparison pages
- 🟡 **Action:** Cross-link from `/blog/captio-discontinued` to authoritative sources (App Store removal notice, developer X post) to inherit their authority signal

**Measurement signal:**
- Referrer traffic from `perplexity.ai` in Cloudflare Pages analytics
- Brand-mention queries on perplexity.ai weekly: "SimpleMemo", "Captio alternative", "fastest iOS memo app"

---

## 3. Microsoft Copilot (Bing Chat / Edge Copilot)

**Why it matters:** Copilot lives inside Windows 11, Edge sidebar, Bing, and Microsoft 365. Single underrated reach for global B2B users. Citation behavior is more "blue-link adjacent" than other AI engines — Copilot often shows numbered footnotes with URLs.

**How citations get selected:**
- Bing index is the primary source (single bot covers both)
- Site authority signals from Bing Webmaster Tools matter (separate from GSC)
- Schema.org data and BingPreferred meta tags
- Recency boost similar to Perplexity but less aggressive

**Levers we control:**
- ✅ `Bingbot` allowed in `/robots.txt` (single bot = three surfaces: Bing search + Copilot + ChatGPT Search index)
- 🟡 **Action:** Submit `sitemap.xml` to Bing Webmaster Tools if not already (separate from GSC submission)
- 🟡 **Action:** Add `<meta name="ms.locale" content="ja-JP">` on JP pages — Copilot uses this for locale-specific answers
- 🟡 **Action:** IndexNow ping on every publish (we already have `scripts/indexnow-notify.js` — verify it's wired into the deploy hook)

**Measurement signal:**
- Bing Webmaster Tools "AI clicks" report (when available)
- Test queries in Edge Copilot sidebar: "best iOS memo to email app", "Captio successor 2026"

---

## 4. ChatGPT (ChatGPT Search + ChatGPT Browse + GPT model knowledge)

**Why it matters:** Largest user base of any AI engine. Three distinct citation surfaces:
1. **ChatGPT Search** (live web, citation links visible) — uses OAI-SearchBot + Bing index
2. **ChatGPT Browse** (on-demand fetch by URL) — uses ChatGPT-User
3. **Trained model knowledge** (no live web) — uses GPTBot for periodic training crawls

**How citations get selected:**
- For Search: similar to Bing — index recency + topical authority + answer-shaped content
- For Browse: any user-shared URL is fetched; what matters is that the page is parseable and self-contained
- For trained knowledge: persistent presence over many training cycles, with consistent factual framing (this is why `/llms.txt` mandatory-wording rules matter — they reduce hallucination risk in trained output)

**Levers we control:**
- ✅ `GPTBot` + `ChatGPT-User` + `OAI-SearchBot` allowed in `/robots.txt`
- ✅ `/llms.txt` mandatory-wording section to anchor factual claims across training cycles
- 🟡 **Action:** Maintain consistent factual phrasing across ALL pages — if `/about/`, `/faq`, and `/glossary/e2e-encryption/` describe encryption differently, training will pick the median framing. We standardize on the `/llms.txt` wording.
- 🟡 **Action:** Open a free ChatGPT account quarterly and test 10 brand+topic queries; if hallucinations creep in, post a correction to a high-authority page (Reddit, HN, Wikipedia talk) that GPTBot will pick up next cycle.

**Measurement signal:**
- Referrer traffic from `chatgpt.com` (live citation surface)
- Quarterly "trained knowledge" test: ask ChatGPT-4o-without-browsing "What is SimpleMemo?" and check accuracy

---

## 5. Anthropic Claude (Claude.ai + Claude in Slack/Notion/etc.)

**Why it matters:** Claude is the developer-favorite AI engine; SimpleMemo's audience overlaps heavily with Claude's user base (technical iOS users, productivity tooling buyers). Citation surfaces:
1. **Claude on the web** (claude.ai with web search enabled)
2. **Claude in integrations** (Cursor, Notion, Slack AI) — typically no citations but model knowledge matters
3. **Trained model knowledge** via ClaudeBot

**How citations get selected:**
- When web search is enabled, Claude cites by URL in the answer footer
- Recency and authority weighted similar to Perplexity
- Anthropic emphasizes "constitutional AI" — pages that are clear about what they're NOT (e.g., our `/llms.txt` "WRONG" section) tend to be more reliably represented

**Levers we control:**
- ✅ `ClaudeBot` + `anthropic-ai` + `Claude-Web` allowed in `/robots.txt`
- ✅ Explicit "What SimpleMemo is NOT" sections on `/llms.txt` and `/about/`
- ✅ E2EE clarification on `/glossary/e2e-encryption/` (already states explicitly: NOT E2EE)
- 🟡 **Action:** When Claude misattributes (e.g., calls SimpleMemo "end-to-end encrypted"), reply in the chat with the correct framing and the `/glossary/e2e-encryption/` link — Anthropic uses these corrections as RLHF signal
- 🟡 **Action:** Cross-link to other authority sources (NIST AES-GCM docs, Apple Keychain docs) on encryption pages — Claude weights citation chains

**Measurement signal:**
- Referrer traffic from `claude.ai`
- Internal test: ask Claude 3.7 / Opus with web search "Is SimpleMemo E2EE?" — the answer should be "No, only on-device Outbox + send history are AES-GCM encrypted"

---

## 6. Apple Intelligence (Siri + Spotlight + Safari + Mail)

**Why it matters:** Apple Intelligence is the only AI engine with **first-party iOS surface** — and SimpleMemo is iOS-only. Citation here is structurally aligned with our distribution channel.

**How citations get selected:**
- Applebot indexes the open web; Applebot-Extended is the opt-in token for Apple Intelligence training
- Apple aggressively prefers App Store metadata + the developer's primary website for app-related queries
- Schema.org `MobileApplication` JSON-LD is highly weighted

**Levers we control:**
- ✅ `Applebot` + `Applebot-Extended` allowed in `/robots.txt`
- ✅ `MobileApplication` schema on homepage (`index.html` `@type: MobileApplication`)
- ✅ `apple-itunes-app` meta tag with app-id on every page
- 🟡 **Action:** Audit App Store metadata (`docs/aso_metadata_*.md`) quarterly to keep description, keywords, and screenshots aligned with the website's authoritative facts
- 🟡 **Action:** Add `applicationCategory: "ProductivityApplication"` to schema (verify this is set)

**Measurement signal:**
- Spotlight test on iOS: type "memo email" — does SimpleMemo appear in Suggested?
- Siri test: "Find a fast memo app" — does Siri surface SimpleMemo?

---

## 7. xAI / Grok

**Why it matters:** Smaller surface than the above six, but high signal in the developer/builder demographic on X/Twitter. SimpleMemo's "vibe coding" + "indie iOS app" narrative resonates with this audience.

**How citations get selected:**
- **xAI does not publish a documented Grok crawler user-agent.** Grok pulls primarily from X (Twitter) data with ad-hoc web fetches.
- This means: **traditional SEO levers do not apply to Grok.** Content on simplememofast.com is not directly the lever.

**Levers we control:**
- N/A in robots.txt (no published bot to allow or block)
- ⚠️ **The X account is the actual surface.** [@simplememofast](https://x.com/simplememofast) and developer-personal posts about SimpleMemo are what Grok cites.
- 🟡 **Action:** Maintain a steady cadence of X posts referencing SimpleMemo's facts (launch speed, AES-GCM scope, Captio relationship) in declarative form
- 🟡 **Action:** When SimpleMemo is mentioned by others on X, reply with the canonical fact + the relevant simplememofast.com link — this seeds Grok's retrieval pool

**Measurement signal:**
- Ask Grok directly via X: "@grok what is SimpleMemo"
- Track mentions in https://x.com/search?q=simplememo

---

## 8. Tier-2 / Niche Engines (Le Chat, Cohere, You.com, Meta AI, DuckDuckGo AI Chat)

We allow all of these in `/robots.txt`. They are lower priority than the top 7 above but cumulatively significant:

| Engine | Bot allowed | Notes |
|---|---|---|
| Mistral Le Chat | `MistralAI-User` | Strong in EU; FR/DE markets |
| Cohere | `cohere-ai` | Used by enterprise RAG products (Notion AI, Oracle) |
| You.com | `YouBot` | Aggregator — uses many sub-models |
| Meta AI | `meta-externalagent` | WhatsApp / Instagram / Facebook AI answers |
| DuckDuckGo AI Chat | `DuckDuckBot` | Privacy-focused; routes to GPT/Claude/Llama under the hood |

**Levers we control:**
- All bots allowed; no engine-specific content tuning
- 🟡 **Action:** Monitor referrer logs for sudden traffic from any of these — if one spikes, do a deeper read on its citation behavior

---

## Cross-Cutting Content Levers (apply to all platforms)

These are the structural rules that every page should follow to maximize citation odds across all AI engines simultaneously:

1. **Lead with the answer.** First 200 words after the H1 should declaratively answer the implied query. AI engines extract from the top of the page.
2. **Use H2 questions verbatim.** Match likely query phrasing: "What is SimpleMemo?" "How fast is SimpleMemo?" — exact-match H2 questions get cited as Q&A pairs.
3. **Pair every claim with a citation or first-party data.** "0.3 second launch" alone is weak; "0.3 second launch (per our [benchmark methodology](https://...))" is strong.
4. **Maintain visible dateModified.** AI engines weight freshness heavily; an undated page looks stale.
5. **Avoid superlatives without proof.** "Fastest" without benchmark = AI skips. "Fastest, measured at 0.3s vs. 1.4s for Apple Notes" = AI cites.
6. **Negative space is content.** Explicitly stating what SimpleMemo is NOT (E2EE, Android, team tool) prevents the wrong inference and increases citation accuracy.
7. **Canonical facts in one place.** `/llms.txt` is the single source of truth for facts that appear across many pages. Drift between pages confuses AI training.

---

## Implementation Status (as of 2026-05-20)

- [x] `/robots.txt`: 17 AI bots explicitly allowed across 11 vendors (this PR)
- [x] `/llms.txt`: Citation guidelines + authoritative-source map + Q&A block (this PR)
- [x] FAQPage JSON-LD on `/faq` + 7 high-impression pages
- [x] `MobileApplication` schema on homepage
- [x] `dateModified` on all blog posts and key pages
- [x] First-party benchmark data published (`/blog/fastest-memo-app-benchmark`, `/blog/benchmark-methodology`)
- [x] E2EE clarification in `/glossary/e2e-encryption/`
- [ ] Bing Webmaster Tools sitemap submission (verify)
- [ ] IndexNow auto-ping on deploy (verify wiring in deploy hook)
- [ ] Add `lastReviewed` visible note to top of `/vs/*` pages
- [ ] Quarterly hallucination audit: 10 brand+topic queries per major engine

---

## Review Cadence

- **Monthly:** Skim referrer logs from each AI engine; note any drift.
- **Quarterly:** Run the full hallucination audit (10 queries × 7 engines = 70 manual tests). Update `/llms.txt` mandatory-wording section if any new misattribution patterns appear.
- **On product change:** Whenever pricing, encryption scope, or ownership changes, update `/llms.txt` within 24h and bump the "Last updated" stamp.
