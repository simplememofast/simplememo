# C20 user-directed local Git conflict recovery — 2026-10-01

This manual user-directed source preparation implements the original C20 canonical coverage item. C17 closeout is retained. C20 remains pending until final exact-head SEO Validation, normal main merge, matching successful Pages deployment and actual production HTML/assets readback are independently confirmed. This document records source and private browser evidence; it is not proof of public delivery.

The candidate covers keeping both available authored versions, comparing their content, explicitly deciding a recovery, saving it in real Obsidian, completing a local Git merge and reopening the actual Markdown. Existing C05 `/obsidian/sync/` already demonstrates Git conflict-marker generation and gives a short manual-edit/commit explanation. C20 adds retained originals, the exact choice and observed recovery rather than repeating the generation/comparison article. If the final article loses that distinction, use Existing Page First and keep C20 pending.

## Actual fixture and source boundaries

Observed on 2026-09-30 in Debian 13 Linux x86_64, English Obsidian UI with author-created Japanese content. Actual General settings showed app and installer version 1.13.7. The previously verified official AppImage was reused unchanged: SHA256 `e0d8e0a611624de8c9c7dcd8a9e648279fb0a0d552faa1312b7e4f3a5fa72663`. No community plugin was loaded.

One new offline local Git repository held the practice note `作業メモ.md`. The initial text and two edits were written directly as Markdown; Git branch creation and merge were local shell actions. The shared header is fictional practice text. Version A changes one check item to heading order; B changes the same line to the internal-link destination.

Before merging, the verifier deliberately saved each original to a separate location. Copies displayed in the vault were named `原文の控え/案A.md` and `原文の控え/案B.md`. These are manual retained originals, not an automatically generated service `conflicted copy`. The two items happen to be compatible in this authored example, so the author explicitly chose two separate lines in A/B order. Other conflicts can need a different decision.

## Ordered observations

| Stage | Observation UTC | Actual result |
| --- | --- | --- |
| Local merge | 14:08:57.623961 | Git exit 1, `UU`, unmerged index stages 1/2/3, actual body markers |
| Original comparison | 14:12:12.606 | Both retained originals shown in the actual app |
| Conflict opened | 14:14:13.584 | Actual working Markdown opened from the file explorer |
| Explicit chosen text saved | 14:15:24.422 | Actual editor input, asynchronous saving completed; selected items and no markers |
| Local Git completion | 14:17:25.759606 | Target explicitly staged; merge commit has the two original parents; unmerged index empty and status clean |
| Reopen | 14:17:26.553 | Actual file-explorer reopen, both selected items visible; raw file SHA unchanged |

Times describe recorded stage observations, not an unsupported claim about exact PNG capture timing. The actual editor was focused and the explicitly chosen full resolution typed. Git completed after the GUI save; the target remained `UU` before staging. The final commit blob matched the saved result and both original commit blobs matched their retained copies.

GUI file-explorer clicks opened retained A, the conflicted working note and the final working note. Actual Control+E showed reading view. APIs assisted workspace split/B opening, sidebar layout, settings window and state readouts. Git commands were shell operations, not an Obsidian Git plugin. This does not describe every action as an unaided mouse click. An attempted Quick Switcher route did not open because that core feature was disabled; no successful shortcut or app fault is claimed.

The immutable private receipt SHA256 is `00127ee2acc6be2726c2c77fb63dc0f46deee9833ad6e7b46114d68446425676`. All **22 bounded assertions pass**. Root independently checked the 20 receipt-listed files and receipt itself and visually reviewed the selected originals. App and isolated display processes exited normally before the receipt was finalized. The assertion count is functional evidence, not a quality, security or business result score.

## Public-original source mapping

The following publication source paths are byte-identical to the originals; their existence in source is not a served-output claim. Three raw app-window PNGs are selected without cropping, retouching or generated substitutes. Four Markdown snapshots retain their exact original bytes. The filenames distinguish stages; the original target was `作業メモ.md`. Keeping each snapshot under a distinct name is intentional so readers can compare them without overwriting one another.

| Publication source path | Bytes | SHA256 |
| --- | --- | --- |
| `/assets/img/obsidian-sync-conflict/preserved-originals.png` | 35972 | `26e9c8df6650614596c4b9a9ecc22cf10c1e45b76fd0c6fc4b1697210df129a9` |
| `/assets/img/obsidian-sync-conflict/conflict-markers.png` | 46952 | `3456c9795a4ee5d5c795972dd2812bf9de70d2fafc2606f6ae283953a5245a99` |
| `/assets/img/obsidian-sync-conflict/resolved-reopened.png` | 43494 | `328b600802b5641ffd3642e5e885c31bff9bdfaabbbbdd1d819b90d6d911f6a9` |
| `/assets/downloads/obsidian-sync-conflict/original-a.md` | 183 | `c54e38d348edda8981df6b0b09b336a5833627cf6d361f7179aea0676ffb3977` |
| `/assets/downloads/obsidian-sync-conflict/original-b.md` | 192 | `5ccb9c97d365eaecd847da8b61511b42fbb2a992e948b157e19dc2469d96c8d9` |
| `/assets/downloads/obsidian-sync-conflict/conflicted-note.md` | 288 | `0c885bde8e234b15300418231df46372372e8a30d8178e48e734e54ae55230cb` |
| `/assets/downloads/obsidian-sync-conflict/resolved-note.md` | 251 | `69d3ace2d907d3d548a1fe592e3f64e82fbd0a2c09bab5533cf61251b485f1a5` |

Final result SHA was unchanged before/after reopening. The private reader check confirmed both article raw code blocks equal the complete conflicted and resolved files. The article download names intentionally retain the stage aliases. A separate private Chromium reader check actually downloaded all four Markdown aliases with matching names and bytes. Public downloads and reader import/recovery operations remain unverified.

Public source omits private execution paths, hostnames, runtime identifiers and real personal names. Public author is `シンプルメモ開発者` / `SimpleMemo Developer`. Original raw images and Markdown remain unchanged; privacy-sensitive receipt fields stay private.

## Limits and quality gates

Runbook §28 classification stays `Not verified`, `verified: null`, `testedSimpleMemoVersion: null`. These Linux desktop/Git observations do not establish automatic conflicted-copy generation, actual two-device concurrency, a synchronization transport, remote push/pull, Obsidian Sync, iCloud, Syncthing/Dropbox or accounts. iOS/Android/macOS, physical devices, SimpleMemo delivery, long-term backup durability, security, speed, productivity and traffic effects were not tested. Keeping both items is this explicit authored choice, not the default answer for every conflict. No claim of zero loss is made.

Private final candidate assessment: Intent 19/20, Originality 20/20, Verification 14/15, Completeness 14/15, Topical Fit 10/10, Internal Linking 7/10, Conversion Fit 8/10; **92/100**. Actual Chromium checks covered 320, 390, 768 and 1440px, three loaded raw PNGs, four real Markdown downloads with matching bytes, four visible/schema FAQ pairs, both complete saved code blocks and the actual next-step click to the existing sync reference. The generated editorial OG is 1200×630 and was visually checked separately; it is not GUI evidence. These are isolated localhost observations, not production operation or provider sync. An Ahrefs request on the existing reference page after navigation was aborted before sending and recorded separately; the four C20 page checks had no console/page/resource errors. Current-source review and final exact-head CI, merge, corresponding Pages and actual production readback remain required; no business outcome is measured.

New Lane E retains the original queue, quality threshold ≥80, unique original evidence and scoped verification. Old existing-URL expected-click NoiseFloor is not applied to the new canonical coverage candidate. Preserve every owner, evaluation date and stop. The protected sync hub is an outbound reference only and receives no new link or other edit from this candidate.

The two source inbounds are the existing official-sync FAQ phrase (link only; visible answer and schema unchanged) and the iCloud reference-list context already discussing Git/Syncthing conflicts (one explicitly Git-only recovery sentence). Existing titles, descriptions, canonical/hreflang, FAQ, CTA attributes/destinations and next-step contracts are retained. The protected sync hub, pricing, vault, installation, plugins and Logseq HTML are unchanged.


## Manual authority, full scope and delivery boundary — 2026-10-01 JST

The existing user SEO/AIO Goal explicitly requests necessary task execution through deploy. The active site-content authority permits implementation, internal links, OG and ordinary PRs. Measurement coexistence policy's explicit-request publication row applies with full impact scope and actual publication timing; this is not a prospective Company measurement plan or approval of its global collision. Raw images, downloads, OG, graph/data and GSC code remain declared. No existing experiment support contract, owner, stop, baseline, evaluation date or historical claim is rewritten to admit this source change.

Changes comprise the article, three original PNGs and four original Markdown aliases, editorial OG, this evidence document, two limited inbounds, one graph entry, one distribution seed, C20 preparation note, one annotation, one appended confounder note on each of the existing brand/engage nonexclusive observations, one llms source, the October audit note, assigned JA sitemap entries and three C20 GSC comparison targets. Original 85 cases, the six C13/C14 targets, the three C17 targets, strict bounded propagation and the already repaired workflow failure condition remain intact. This script changes no workflow.

The prepared source dates use the current JST calendar day, not an invented exact public second. Actual serving starts must be established later from final-head CI, main merge, the corresponding successful Pages deployment and production readback. Only the listed C20 HTML, resolved Markdown and reopened PNG are added to served comparison; source equality for all seven originals does not prove all seven served bytes or whole-site parity. September monthly sessions, October doubling, Google indexing, citations, CTA conversion, physical mobile, SimpleMemo/provider transport, speed, productivity and durability remain unmeasured. No Company completion/score or natural schedule recovery is claimed; current execution cost is unknown.

## Current source reader checks

The article and both actual inbound pages passed local Chromium checks at 320, 390, 768 and 1440px (12 cases), with one H1, expected self-canonical, no sideways overflow, loaded visible images and no page/local-resource error. Both new inbound links were expanded where required and actually followed to the article. All four Markdown downloads had the expected names and original bytes. Nonvisible language-specific images were excluded from visibility checks; their complete delivery is not attested. External requests were blocked. The first custom reader script waited on a nonvisible image and timed out; that script/result remains private as an automation error, not an app or production regression. Existing normal preflight passed 218/218. These checks precede final exact-head CI and public delivery.
