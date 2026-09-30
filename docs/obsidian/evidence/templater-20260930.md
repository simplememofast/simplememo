# C13 user-directed Templater publication — 2026-09-30

This is a manual publication under the user's October SEO/AIO Goal. It is separate from the stopped scheduled Actions lane and unfinished Company runs. No scheduler, collector, probe, prospective measurement gate, original experiment period, budget, stop condition or historical run outcome is changed. C13 becomes publicly delivered when the reviewed PR merges and its corresponding Pages deployment succeeds; an unmerged preview is not delivery.

## Actual application verification

An isolated synthetic Vault was used in the Linux environment on 2026-09-30. Official Obsidian 1.13.7 ran as a desktop GUI on the already-installed Xorg dummy display. The AppImage SHA-256 matched the official release digest `e0d8e0a611624de8c9c7dcd8a9e648279fb0a0d552faa1312b7e4f3a5fa72663`. The real Settings window displayed application and installer version 1.13.7. Templater 2.25.1's official `main.js`, `manifest.json` and `styles.css` were installed locally and enabled using the GUI. The Community Plugins search/download route itself was not exercised.

Official Templater source: [2.25.1 release](https://github.com/SilentVoid13/Templater/releases/tag/2.25.1), source commit `0ffe956a58360aee949df114ded2fd7431447ebb`. Its [settings documentation](https://github.com/SilentVoid13/Templater/blob/0ffe956a58360aee949df114ded2fd7431447ebb/docs/src/settings.md) separately supports the meaning of `None` and the device-local Trigger setting. Source inspection is distinct from GUI observation.

Core/Templater commands were invoked through the running application's `executeCommandById`; the insert-template picker was selected in the actual GUI. Enabling the new-file Trigger used the real settings toggle, risk acknowledgement and Enable button. These are real application results, not a claim that every command was launched manually from the command palette.

| Case | Observed result |
| --- | --- |
| Insert `Templates/Simple.md` into `Notes/Normal.md` | Title and date/time expressions expanded; the existing note body remained |
| Core Daily notes creates `Daily/2026-09-30.md`, Trigger OFF | Both date and title expressions remained as literal `<% … %>` commands |
| Turn Trigger ON, ordinarily reopen that existing Daily note | Saved Markdown SHA-256 remained identical; expressions were still literal |
| Explicit Templater active-file replacement on that note | Both expressions expanded |
| Core Daily notes creates a new file at the same path, Trigger ON and matching `None` | Both expressions expanded, without Folder templates or regex assignment |

The final OFF/ON cases used the same date format `YYYY-MM-DD`, folder `Daily`, template `Templates/Daily.md`, and date-named path. For the new-file control, only the prior synthetic test file was removed from the isolated Vault and recreated. This is a controlled verification step, not advice to delete a reader's daily note. Automatic opening of Daily notes on startup was disabled; its special startup path was not tested. Observations occurred around 10:46–10:50 UTC / 19:46–19:50 JST. Date/time text inside the screenshots uses the Linux environment's UTC clock.

`result: templater-…-expanded` is fixed fixture text present even in the unexpanded OFF case. Success is established by the actual date/title substitutions and saved Markdown, not that marker.

## Unchanged public originals

All four screenshots were inspected and copied byte-for-byte without image editing. Settings screenshot dimensions are 900×700; note screenshots are 1024×800. No personal Vault, account or message content appears.

| Screenshot | SHA-256 |
| --- | --- |
| [Insert result](../../../assets/img/obsidian-templater/insert-template.png) | `92f901c241efd580377f7d0e752279456f693a6e2392d2361d01ec6641cb0889` |
| [Daily Trigger OFF](../../../assets/img/obsidian-templater/daily-trigger-off.png) | `844859e2c978bcaad83effd514f7c47c2c7bf8c56e443ef90c5de19c16178986` |
| [Trigger ON and None](../../../assets/img/obsidian-templater/trigger-on-settings.png) | `7e81bbe38480f81e7a033f43fb963cdd2ab82f07e7a743b1270f2df74830ca07` |
| [New Daily Trigger ON](../../../assets/img/obsidian-templater/daily-trigger-on.png) | `73b25dbbca1a55fc96d0898c63ff40de6b62213913e82e9a63ebf97e7c755931` |

The [Simple template](../../../assets/downloads/obsidian-templater/Simple.md), [Daily template](../../../assets/downloads/obsidian-templater/Daily.md), [normal insert output](../../../assets/downloads/obsidian-templater/normal-output.md), [OFF output](../../../assets/downloads/obsidian-templater/daily-trigger-off.md), [ON output](../../../assets/downloads/obsidian-templater/daily-trigger-on.md) and [explicit replacement output](../../../assets/downloads/obsidian-templater/daily-manual-recovered.md) also match the retained originals byte-for-byte. ON and recovered output can be identical; they are separate operations on this synthetic fixture, not independent audience samples.

## Limits and existing observations

Linux desktop GUI verification is recorded separately from the existing §28 SimpleMemo/iOS verification classification. That classification remains `Not verified`, with `verified` and `testedSimpleMemoVersion` null. The desktop screenshot version is named explicitly. No iOS Simulator or physical iPhone, Android, Mac, Siri, Watch, voice quality, speed, external capture, SimpleMemo delivery, sync or productivity benefit was verified.

The only existing article body additions are a context link in daily-note's cause 3 and a context link in journaling's template section. Plugin hub, Obsidian root hub, the OneLink pilot, existing CTA destinations and existing article search metadata remain under their original owners. The new article's original observations justify its `llms.txt` citation-source entry; that entry is not evidence that an AI crawler uses this file or cites the article.

`growth/data/annotations.json` and notes on the existing nonexclusive brand/next-step observations identify the concurrent manual publication. All changed content, shared metadata, screenshots, Markdown, OG generator entry, sitemap, distribution seed and evidence paths are disclosed in the PR. The original experiment definitions remain intact. A new URL's absent pre-publication observations are missing, not zero; the first post-publication data must be read through the existing collectors. No isolated traffic, CVR, AI citation, native autonomy or Company outcome is claimed.

## Editorial and delivery validation

Editorial assessment against the existing rubric: Intent 20/20, Originality 20/20, Verification 10/15, Completeness 14/15, Topical Fit 10/10, Internal Linking 10/10, Conversion Fit 8/10; total **92/100**. Verification is deliberately limited because only the stated Linux operations were exercised. This is editorial assessment, not audience impact.

The three article pages were rendered in Chromium at 320/390/768/1440px: 12 cases had no horizontal overflow. All four new article screenshots were scrolled into view and decoded at each width: 16 image checks passed, with no overflow after loading. Three JSON-LD blocks parsed, the four visible FAQ answers matched their schema, and four demonstrated code blocks matched the original Markdown. The article has one named next step and a JA-only canonical, with no invented EN alternate. The two existing article edits contain only the agreed context-link paragraph each.

Local SEO checked 441 HTML files: 0 errors and 49 metadata-length warnings, none for this new article. Warning-only exit 1 is accepted by the existing workflow. Exact-head CI evidence belongs in the PR; successful production delivery must be tied to the actual merged commit. Neither this evidence note nor the queue's prepared `done` entry substitutes for those delivery results.
