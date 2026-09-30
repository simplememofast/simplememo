# C21: Obsidian slow startup — source and measurement evidence candidate

manual SEO/AIO Goal source-preparation candidate only. Canonical candidate: `/obsidian/troubleshooting/slow-startup/`. Original title: 「Obsidianが重い・起動が遅いときの切り分け手順」. Original unique_value: 「プラグイン数と起動の関係を検証Vaultで実測（同一環境比較なら公平に測れる）」. Queue remains **pending**; this evidence candidate is not a publication or delivery receipt.

Author: シンプルメモ開発者. Verification day: 2026-09-30. The nine original measured launches ran from 17:59:56 UTC through the final known-text observation at 18:00:08 UTC. Publication metadata remains `2026-10-01`; verification time must not become an invented future publication second.

## Frozen proof and publication assets

Original verification receipt: 28,171 bytes, SHA256 `9e1ed3d446d2e2a338d41ae8748389eb368abd5f1d5c6c01286adf05387a3bbe`. All **23 assertions** independently checked. All **82 receipt.files** independently rehashed; **83 entries including the receipt itself**. This count is the explicit receipt scope, not all runtime cache files.

The six following assets are exact byte-for-byte copies of frozen originals. The images are original app-window captures, not generated or recreated screenshots. HTML `width`/`height` uses the actual PNG dimensions; CSS display size does not alter source bytes.

| Proposed public path | Bytes | SHA256 |
| --- | ---: | --- |
| `/assets/img/obsidian/slow-startup/trial-01-actual-gui.png` | 33439 | `9457e4539346056cb505424bf7d101e1252cd6cc4d5f9d863499905b5c9cec54` |
| `/assets/img/obsidian/slow-startup/trial-02-actual-gui.png` | 33802 | `d9acbaa779f7461c5560f7fb100d65ed0dbbc9ccd9a58a4e4722ccf0a83904eb` |
| `/assets/img/obsidian/slow-startup/trial-03-actual-gui.png` | 33792 | `258d098be539a1f1e39f9f99ee347ab9c8c76e27d3ed3d0775c6dd78145f00bf` |
| `/assets/img/obsidian/slow-startup/master-General-version.png` | 70807 | `7b94548f984630d1ad3dbdd346630eb0607194380f8716479ffbfdc6fe5cc5b8` |
| `/assets/downloads/obsidian-slow-startup/startup-trials-20260930.csv` | 1648 | `2ef15c31bccc4cf6a7c090dedbafec1e4fa886938df8655fbf2d0a39c33b45ae` |
| `/assets/downloads/obsidian-slow-startup/authored-input-20260930.md` | 148 | `27d196595d0eb59cb698b63b480dfb44592e3021666ce754df8dae3f9dcc5899` |

The CSV contains all nine unrounded observations, condition order, actual loaded counts/versions, shared resource readings and exit results. The displayed comparison table is derived by rounding original milliseconds to whole ms; the raw CSV is never regenerated from the table. The Markdown is the author's direct file-bootstrap input, not an app-authored save result. It remained byte-equal in all measured fixtures.

## Software and fixture

- Existing official Obsidian 1.13.7 AppImage SHA256: `e0d8e0a611624de8c9c7dcd8a9e648279fb0a0d552faa1312b7e4f3a5fa72663`. Actual General GUI readouts show app and installer 1.13.7. This is the fixed observed version, not a future latest-version claim.
- Official Templater 2.25.1 assets inherited read-only from the previous verified source, commit `0ffe956a58360aee949df114ded2fd7431447ebb`; previous receipt SHA256 `c6a12c63984bbbfe9d9b9b665e9716690b250db4c1e0f98780bb73c9ac78134b`. No new fetch/install was performed for C21.
- Official QuickAdd 2.29.0 assets inherited read-only from the previous verified source, commit `718116c45d89c75ba8fe84ada2742a61e1f2cee8`; previous receipt SHA256 `0a52075f1b39c6f85bf8dc4b6809339e7b5efa2edfe3709b2a9c3cc002a6ce06`. No new fetch/install was performed for C21.
- Both plugin asset sets are installed in every condition. Only the enabled community-plugin list differs. Actual runtime enabled membership and plugin instances/versions were independently read; counts are not inferred from filenames, manifest presence or screenshots.
- Same authored one-note Markdown, workspace/core/settings and six plugin asset files. Per-vault prelaunch maps match except the enabled-plugin list. Actual core sets are the same five: file-explorer, backlink, outline, properties, bookmarks.
- No startup Templater template, QuickAdd choice/macro, provider generation, system command or AI key was exercised. No UI clicks, note-open/write APIs or plugin commands occurred in timed windows.

## Pre-registered finite measurement

Three conditions, three measurements each, balanced interleaved order `0,1,2 / 1,2,0 / 2,0,1`. All planned nine measurements were successful, without outlier removal or adaptive substitute trials.

| Actual community plugins loaded | n | CDP-ready median ms (min–max) | Known Markdown visible median ms (min–max) |
| --- | ---: | --- | --- |
| 0; both installed but disabled | 3 | 324 (313–356) | 917 (892–949) |
| 1; Templater 2.25.1 | 3 | 325 (315–339) | 948 (926–973) |
| 2; Templater 2.25.1 + QuickAdd 2.29.0 | 3 | 329 (325–332) | 1017 (1016–1105) |

Both clocks are monotonic spawn-to-observation, including process spawn overhead; the display was already ready. CDP-ready is the first successful connection-endpoint response, with approximately25ms polling plus response overhead. It is not GUI evidence. Known-Markdown-ready is actual active Markdown preview, heading and exact authored marker observed after connection, including connection/readout overhead. It is not first paint, fully initialized plugins or editing readiness. Loaded state is captured later as a separate timestamped readout.

All measured apps ended normally with captured exit0 and released their own debugging listener. The preparation app and both owned display lifecycles have separate exit0/release records. Other processes were never stopped or modified. Saved PNGs were visually reviewed; the pictured fixed note/version readouts match captions. Images alone do not prove plugin counts or timing.

## Failures and methodological gaps retained

The initial unmeasured preparation stopped because a port-release guard used a naive bind and treated TCP TIME_WAIT as an active listener after actual app exit0. The original pass=false preparation record, failure record and original runner remain unchanged. Separate listener/connection/reusable-bind checks showed release; a recorded correction was made before the first timed trial. Only the original uninvoked nine measurements were then run. The master timing is never promoted to a measured sample.

A metadata-freeze expected count of11 overlooked an already saved preparation trust-prompt image; the actual12 were viewed and the count corrected. Original CSV/summary/compact output bytes were checked, not overwritten. No GUI/timing rerun repaired this bookkeeping issue.

Each measured run used a fresh directory cloned from prepared common preferences, excluding specified cache directories. **Complete per-trial global-profile prelaunch hashes were not captured.** Common seed/copy code and per-vault file maps support the stated preparation scope; they do not attest every global-profile byte. Shared OS page/disk caches were warmed by preparation and repeated launches. No OS reboot/cache flush, physical cold-start test or untouched first-ever factory-profile test occurred.

Shared CPU observation was approximately35–44%, with other live apps present. Five visible logical CPUs, four CPU-equivalent cgroup quota and16GiB memory limit are environment facts. Resource brackets include instrumentation/state/images, so they are not plugin CPU attribution. Separate build work was seen during preparation inspection, not established as active in every timed snapshot. No private host/process paths or real-person names are exposed in proposed article/downloads.

Different plugin identities accompany counts; n=3 per condition is small. This is a scoped same-environment setup comparison, not plugin-count-only causality, a general monotonic law, a reader-specific diagnosis or a performance guarantee. It does not establish typical-problem coverage, Windows/macOS/iOS results, large real-user vault performance, SimpleMemo/sync/productivity/traffic effects.

## Article contribution and separate publication gates

The full article leads with author-owned backup/copy isolation before plugin-disable/restricted-mode suggestions. Reader diagnostics, backup verification, re-enabling plugins, storage/OS/sync checks are clearly recommendations, not operations performed in the timed nine. One article NextStep goes to existing `/obsidian/plugins/`; no protected hub, owners, queue or public metadata are edited.

New authored OG is a1200×630 social card, not GUI proof. Four static article widths, FAQs/schema, table values, exact CSV/Markdown downloads, raw PNG loading and the actual local NextStep click were tested separately using an existing browser. This static QA is not a tenth startup measurement or ordinary repository CI.

All change sources: frozen C21 proof/receipt/records, prior C13/C14 official-asset provenance, read-only C21 measurement handoff, read-only existing site's C17 head/footer template, new private article/FAQ/schema/table/OG/audit prose, and the six unmodified original asset copies. No frozen proof was regenerated. New spending, paid call, credentials, sender identity, dependencies, installation or provider invocation: none. Codex-session cost is unknown.

Fresh main/open PR duplicate and full path scope, Existing Page First, owners/stops/windows, manual-publication admission and policy applicability must be reviewed before publication. Explicit manual-user goal is not a blanket waiver of Company experimental measurement contracts. Actual publication-day metadata, final ordinary exact-head CI, merge, corresponding Pages deployment and served HTML/original asset readback are separate outstanding gates. Preserve original queue title/unique_value/status and other rows/owners; do not mark done from this private artifact. October double traffic remains mature same-definition measurement pending; no Company unattended-rate or natural-schedule credit.


## Declared complete publication component source scope

9new contentfiles (HTML, editorialOG, raw4PNG+CSV+MD, evidence) + one contextual C14 actual-enable paragraph sentence +9support paths =19. Raw6 does not mean6PNG. Frozen private candidate41 entries plus its ownmanifest; originalreceipt23assertions/82files and83 inclreceipt retained. Existing author-checker and savedQA are not a missing earlier independently saved root witness. A NEWroot final independent read-only review now rehashed82receipt/41private/6raw/all9records and CSV, recomputed statistics and inspected7original/editorial/private images, quality90; review SHA256 edfb253cd2e1e719e4c6c6374c82b71ca71934e4ad5416ac0d03cb56506565b7. NoGUI/QA rerun or earlier witness was invented. The HTML evidence link uses https://github.com/simplememofast/simplememo/blob/main/docs/obsidian/evidence/slow-startup-20260930.md rather than an internal /docs edge href.

Original9 timed launches,3percondition, order0/1/2 then1/2/0 then2/0/1 preserved without replacement/exclusion. CDPendpoint-ready and knownMarkdown-text-ready distinct; plugininstances actualruntime checked after textready. Differentpluginidentities confound counts; warmOS caches/preparedprofile clones/shared35-44%CPU/concurrentwork/n3/per-trial global-profile prehash gap remain. No plugin-count causal law, firstpaint/fullplugininit/cold-firststart/typicalreader diagnoses/largeVault/otherOS/mobile/SimpleMemo/sync/productivity/traffic claims. Authored148Binput directbootstrap is not app-savedoutput proof. Original actual shutdown was ownedSIGTERM/wait0, not naturally GUI Close; historicaltool exits are not independently observed in this helper.

Original unmeasured master naiveTIME_WAIT release failure remains failed, corrected guard does not turn master into one of9measuredsamples. Original12-PNG metadata correction and firstprivate image-dimension QA failure retained; actual4sourcePNG have1100x820trial/900x700General dimensions and sourcepixels unchanged. No newGUI/QA/OG/deps/account/secret/provider/identity/spending added; actualCodexcostunknown.

Source input is explicitcommitted local snapshot b9755be0d753fc9c80ea0ec43f8606376e62ff66 with27ordered source targets including preparedC33; candidate source27 alone is not production proof. GSC candidateadds only C21HTML/original1648BCSV/originaltrial03PNG three comparisons. Candidate30 HTML10/assets20 is sourceonly, not proof of served30. Original85/order/all27/dynamic2/strict logic/actual gsc-indexing workflow untouched. Component19 preserves C33/C32rows; combined20 additionally needs actualC33delivery guard and freshmain preservation before appending its evidence and marking onlyC33done. No actualguard is called by component preview.

OriginalC21title/unique/pending and all oldJSONmeta/rows/order/owners/stops/windows/budgets/contracts inverseexact. Global13Company collision remains unwaived; existingnonexclusive brand/engage append is only confounderrecord, not Company registration/unattended/schedule credit. Manualpolicy42 stays distinct. Finalactualfreshmain/openPR/fullowner review, currentreader aftersourcecalendar/support, historyawareJA generator, ordinaryfinalheadCI, matchingmerge/Pages and actualpublicHTML/allraw sourcebytes remain pending. Current sourcecalendar 2026-10-01JST is not a deliverytimestamp. October2x same-definition maturemeasurement pending; missingbaseline not0.
