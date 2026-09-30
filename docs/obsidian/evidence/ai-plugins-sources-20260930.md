# C18 — Obsidian AI plugin source comparison, 2026-09-30

Manual SEO/AIO GoalによるC18の公開用ソース準備記録です。canonicalは `/obsidian/ai-plugins/`。元title/unique_value/status:pendingを保持します。固定3版の公式資料・コードに基づくprivacy経路表で、原本・私的QAは公開配送の証明ではなく、plugin runtime/backend認証でもありません。最終HEADの通常CI・対応main merge/Pages・実公開HTML/引用export/編集OGのreadbackを別に確認するまで完了としません。

## Fixed sources and acquisition

The original receipt was observed at 2026-09-30T14:25:02.853705+00:00. Its SHA256 is `0f3367a4b9d106c57445bc3b2975ae58269c405b86fb5cc5232ece24064c5dbf`.

| Plugin | Fixed release/commit | Manifest minimum Obsidian |
| --- | --- | --- |
| Copilot 4.0.12 | [8c56781c43fd696e8b2707f170b1f2e2fc61f28b](https://github.com/logancyang/obsidian-copilot/tree/8c56781c43fd696e8b2707f170b1f2e2fc61f28b) | 1.11.4 |
| Smart Connections 4.7.2 | [92e8d56c668f7711054b3a9de16bb73c12e5fa83](https://github.com/brianpetro/obsidian-smart-connections/tree/92e8d56c668f7711054b3a9de16bb73c12e5fa83) | 1.8.7 |
| Text Generator 0.8.7 | [4b9ddf876793d79ba680941d0d093471eaa150eb](https://github.com/nhaouari/obsidian-textgenerator-plugin/tree/4b9ddf876793d79ba680941d0d093471eaa150eb) | 1.6.0 |

Official registry: [obsidianmd/obsidian-releases at 2db5da29e67e7600176c8c9450fd1c36c3a6831b](https://github.com/obsidianmd/obsidian-releases/blob/2db5da29e67e7600176c8c9450fd1c36c3a6831b/community-plugins.json), SHA256 `c4b896508cb3aa754c1ec42ddbbcaf996d0a1cad0dd5e5c4ff57ecf2ae2f3772`.

Acquisition provenance is inherited from the original receipt: normal official release redirects/tag resolution, archives for Copilot/Text Generator, selective fixed Git text reads for Smart after its archive reached the preparation's 32 MiB cap. The truncated acquisition archive is not a full dependency/bundle audit and not a denial of source access. Source scripts were not executed. The preview stage did not fetch sources again or download dependencies.

The new review recalculated 24 quoted ranges in 14 unique files, 579 quoted lines, original SHA256/byte counts, exact numbered quotations, pinned repository/commit URL structure, the registry digest, and all three manifest snapshots. No mismatch was found. Local equality supports source reproducibility; it does not independently re-attest the upstream acquisition timestamp or current release state.

## What each source proves

- Copilot: official docs distinguish model/agent, Miyo indexing/search, hosted Skill/document/project routes and Self-Host Mode limits. The checked KeychainService range establishes a SecretStorage availability check and guarded getter only, not actual persisted-key encryption. The README's transient/non-retained/non-training hosted handling, UUID use, selected diagnostic upload and 60-day deletion are provider statements; backend enforcement was not audited.
- Smart Connections: local model/index/API-key-free behavior is attributed to README. Own main.js schedules the GitHub latest-release GET and passes a smartconnections.app URL to StoryModal; this is source-path evidence, not an observed packet. Imported model/HTTP/settings/dependency behavior is incomplete and unmeasured. Local embedding does not establish zero network traffic or guaranteed note disclosure.
- Text Generator: default-settings constants establish the fixed static provider/endpoint, empty API key, encrypt_keys=false, includeClipboard=true, template variables and disabled attachment/suggestion/JavaScript flags. The builder can make clipboard available; that does not establish inclusion in an actual default request. The key removal/storage code and fixed-prefix fallback are quoted separately; an empty plain key field does not establish encrypted persistence. The Ollama basePath implementation establishes local-capable provider configuration, not local processing by every feature.

These are the primary-source contributions used in the comparison. Actual model calls or paid provider tests are not necessary to describe these specific static constants, branches and attributed documentation statements; the article does not convert them into runtime results.

## Derived citation export and original preservation

The proposed download is `assets/downloads/obsidian-ai-plugins/source-quotes-20260930.json`: 44,287 bytes, SHA256 `cb8faf1dde375bd5a4c7091a0a25d291a67d254f23d3b0b07a9561b0fe50c6fa`. It is a derived publication export of the same 24 original fixed quotation objects plus source/review limits. The original receipt and original draft remain the sources of provenance and were not replaced by this export.

All 1,804 original source/draft files included in the preparation's preservation map remain byte/hash equal after the preview. This excludes `.git` internals and includes the source archives, checked files and frozen draft. No original was edited or regenerated. The old source matrix's broader README/SecretStorage wording remains preserved; the new article uses the narrower capability/getter wording supported by Q09.

## Private HTML and visual checks

The static article was served only on an owned loopback preview server using an existing browser; all external page requests were aborted. This browser session renders HTML, not an installed Obsidian plugin or provider network audit. The server and browser were shut down after the checks.

- 320, 390, 768 and 1440 px: HTTP200, one H1, metadata/canonical/schema checks, no document horizontal overflow, comparison 3 rows and all 5 FAQ display/schema answers equal.
- Nine source excerpt controls actually opened. The actual local download equals all 44,287 source-export bytes and has 24 quotations.
- Exactly one Next Step points to existing `/obsidian/plugins/`; the click reached its local read-only page. No inbound or protected hub content was edited.
- Generated source-summary OG PNG is 1200×630, 71,985 bytes, SHA256 `8b804039331978203be33553a521da463c3cc0da87b9963dae5a872bbe414b63`. Reviewer viewed it and the four viewport tops plus mobile/desktop comparison screenshots. It is an authored article summary, not an Obsidian app screenshot or packet evidence.
- The initial mobile table caption wrapped too narrowly; the new private responsive caption rule was corrected, then the same four-width checks passed and the corrected mobile comparison was viewed.

## Limits and publication status

No plugin installation/enabling/settings-GUI operation, real key/account, model generation, paid-provider invocation, actual payload capture, full dependency audit, backend privacy enforcement, price/productivity ranking, physical/mobile device test, SimpleMemo delivery/AI-tag verification, synchronization, AI citation or traffic lift is established here. The Codex session's actual cost is unknown.

This source preparation resolves the three publication-date fields to 2026-10-01 JST as a calendar day only. Source-observation time is not a deployment timestamp; no merge or delivery second is invented. Fresh main/open PR/full scope/owner/stop/window review is required at application and recorded separately by root. Final exact-head normal CI, corresponding main merge and Pages result, actual served HTML/quote export/OG readback remain outstanding. No Company prospective measurement contract, owner, stop, schedule or success metric is changed or waived; C18 remains pending.

All change sources in this private candidate: the fixed C18 source receipt and 24 quotations, frozen claim boundaries/gaps/outline; the existing Zettelkasten page wrapper/CSS/fonts/footer as a read-only presentation template; newly authored body/comparison/FAQ/schema/OG and derived quotation export; independent hash/quote checks and local-only preview QA. Protected `/ai-tags/`, `/obsidian/` and `/obsidian/plugins/` were not edited.


## 全変更範囲・手動権限と公開境界 — 2026-10-01 JST

明示されたmanual Goalと既存content権限、measurement-coexistence-policyの明示依頼公開の行に基づくsource準備です。全14ファイルは記事HTML、同じ24引用を保つ派生JSON、編集OG、このevidence、QuickAddの既存AI未検証paragraph後の1文、graph/distribution/coverage/annotation/experiments/llms/October audit/JA sitemap/GSCです。既存QuickAddのhead/FAQ/schema/CTA/NextStepと元本文は案内1文を除き全bytesを保持し、hub/plugins/AI-tagsやowned sync/pricing/vault等は変更しません。C18は第三者AIプラグインの固定privacy経路、QuickAddは実GUI Capture、AI-tagsは自社機能で混ぜません。

全14範囲をCompany prospective計測として判定したglobal衝突は残し、manual publicationを実験通過・Company無人率・自然schedule復旧・流入/CVR/AIO引用の単独効果へ読み替えません。public scopeの直接HTML ownersと全範囲、元のowners/stop/budget/window/contractsを最新で確認し、brand/engageの既存非排他観測notesだけへ交絡各1件を追記します。ほかの旧JSON row/order/meta/元キューtitle/unique/pendingは逆変換で完全一致を確認します。新規baselineの欠測は0でなく成熟した同定義10月計測待ちです。

GSCの元85ケースとC13/C14/C17/C20/C26/C27の既存18比較を保持し、C18 HTML・同じ24引用の派生JSON・編集OGの3比較だけを追加します。集計は既存dynamic2箇所によりHTML7/assets14で、旧85/18対象内容・strict伝播/failure条件とworkflow先行修復は変えません。編集OGと派生exportはGUI原画像ではありません。新たな修復、dispatch、collectorや測定契約は作りません。

公開メタデータは適用時のJST暦日のみを使い、未来のmerge/配信秒を創作しません。公開開始は最終HEAD CI・対応merge/Pages・本番readbackの別証拠から記録します。source表の静的定数/分岐と提供元説明に、plugin GUIや有料provider実通信の要件を追加せず、runtime未確認を明示します。Copilot SecretStorage getterは暗号化保存の実証でなく、Smart local説明はzero-networkでなく、Text Generator clipboardflagは実payloadでなくencrypt_keys=falseのfallbackを保持します。全依存/実キー/payload/backend保持や非学習遵守/実端末/価格・生産性/速度/Sync/SimpleMemo/流入は未検証です。新支出・keys/accounts/deps/provider calls/送信者identityは追加せず、Codex実費は不明です。


## C27一次配信closeoutを合わせた全15変更 — 2026-10-01 JST

C18の上記14ファイルはそのままのcomponentです。追加1ファイルはC27 evidenceで、既存coverage/auditは共有します。C27の実一次配信だけを根拠として元pending→done/done_noteを記録し、C18はpendingを保持。この15ファイルのcombined closeout/source準備自身は通常CI・main・対応Pages・85+21本番readbackまで未完です。C18の原article/export/OG/QuickAdd1文/全metadataとGSC85+18→21、C27原本と全既存JSON/owner/stop/budget/window/契約を保全し、Company global13衝突を免除しません。
