# RSIプレスリリース — 主張の裏取り台帳

> **用途:** 2026年9月上旬配信予定の「再帰的自己改善（RSI）でアプリ運営が自動化された」
> プレスリリースについて、オーナーが挙げた①〜⑦の全項目を3リポジトリの実装で裏取りし、
> **書けるもの／書けないもの**の線を引く。原稿は `pr-rsi-2026-09.md`、
> 配信までの段取りは `pr-rsi-2026-09-plan.md`。
> **作成: 2026-08-22 / 調査対象: simplememo・simplememo-api・simplememo-ios の HEAD**

---

## 0. 先に結論（3行）

1. **①②③の一部・④は、証跡が強い。**特に「毎朝06:00に自分でネタを選び、記事を書き、
   9種のCIを通し、PRを出し、検証が通ったときだけ本番へマージされる」ループは
   **12日間の実運転ログ付き**で残っている。ここがプレスリリースの本体。
2. **⑤⑥⑦と、③のうち広告運用・Computer Use配信・実機撮影は、3リポジトリに証跡がない。**
   一部は「設計だけ済んでいる」、一部は「調査レポートだけ」、一部は「言及ゼロ」。
   **現状の文面のまま出すと、記者が1次資料を当たった瞬間に崩れる項目が7つある。**
3. **最大の論点は事実ではなく訴求。**自社のPR実績n=5で、
   **AIを前面に出した回（PR④）が469PV・転載22で最下位**、
   AIに触れなかったObsidian回（PR②）が12,188PV・転載34で最高だった。
   VISION §0 も「AIを前面に出さない」と定めている。→ §8で扱う。

---

## 1. 判定の凡例

| 記号 | 意味 |
|---|---|
| ✅ **実装・稼働中** | コードかワークフローが存在し、実行ログ・成果物が残っている |
| 🟡 **部分的** | 仕組みはあるが、一部が手動・停止中・未接続 |
| 🔵 **設計のみ** | 設計文書・調査レポートはあるが実装が無い |
| ❌ **証跡なし** | 3リポジトリを検索した範囲で該当する実装・文書が無い |

「❌ 証跡なし」は「やっていない」の証明ではない。**このセッションから検証できない**という意味で、
リポジトリ外（オーナーの別環境・SaaS管理画面）で動いている可能性は否定しない。
ただし**プレスリリースに書くなら、記者に見せられる証跡が要る**ので、同じ扱いにしてある。

---

## 2. ① 次期機能開発

| 項目 | 判定 | 証跡 |
|---|---|---|
| サービスコンセプト／ビジョンの定期自己改良 | 🟡 部分的 | `simplememo-ios/docs/VISION.md`（Capture OS）は存在し、**3リポジトリすべての `CLAUDE.md` が「設計に入る前に読め」と参照する強制ゲート**になっている。§13に6問のチェックリスト、§14に未決定論点。ただし**VISION.md自体を定期改訂するcron/workflowは無い**（§12「現在地（2026-08-11時点）」は手動更新）。「定期」は書けない |
| ユーザリクエスト／エンゲージとビジョンに応じた採用 | ✅ | **最も強い証跡。**`simplememo-ios/docs/reports/feature_requests_2026-07-31_obsidian_user.md`。★3レビュー起点でWatch同期不具合を4回診断してくれたユーザーの要望2件を起票 → `RETENTION_MONETIZATION_COHORT_2026-07-29.md` の「Obsidian設定済みinstallのD7継続が未設定の**2.5〜3.7倍**」という実測で優先度を決定 → v4.9.33（実装）→ v4.9.37（発見性の追補）→ v4.9.48「Obsidianのみに保存」→ v5.8.0 追記テンプレート、と**4ビルドに分けて納品**。VISION §13との整合も文書内で検証済み |
| 最新トレンド・競合分析による機能レコメンド | 🟡 部分的 | `docs/trend-radar-prompt.md`（Googleトレンド／はてブ／App Storeランキング上位50の3面監視・対応SLA・D-SCORE連動）は**プロンプト文面まで完成、実組み込みは未了**（文書自身が「本書は文面まで」と明記）。`growth/data/mentions/`（週1回・WebSearchによる言及ウォッチ）は実装済みだが**スナップショットは2026-08-12の1件のみ** |
| 利用者実態のデータ分析による機能サジェスト | ✅ | `simplememo-api/src/analytics.ts`（393KB）＋D1ファネル。`docs/reports/FUNNEL_EVALUATION_2026-08-05 / 08-09 / 08-16 / 08-20.md` と**4回連続の定点評価**、`FUNNEL_IMPROVEMENT_ANALYSIS_2026-08-03.md`、`ONBOARDING_REDESIGN_2026-08-06.md`（データ起点のUI再設計） |

### オーナーの列挙に**入っていなかった**が、書ける材料

- **ビジョン整合が「読め」ではなくCIで効いている**：`scripts/check-content-graph.mjs` が
  `/obsidian/` 配下のページを `data/content-graph.json`（cluster/intent/funnel/relevance/
  parent/siblings/nextStep）への登録なしにマージさせない。**23ページが台帳に登録済み。**
  「戦略文書に書いた分類を、CIが機械的に強制する」は珍しい。
- **やらないことの明文化がゲートになっている**：VISION §9「作らないもの」（Todo管理画面・
  Calendar UI・Knowledge Base・Read Later画面）。機能追加AIの暴走を、**機能を足す側ではなく
  足さない側の規律**で止めている。RSIの安全設計として、これは記者に効く。

---

## 3. ② バグ修正

| 項目 | 判定 | 証跡 |
|---|---|---|
| ユーザからの問い合わせ | ✅ | Apple Watch同期不具合（v4.9.16〜4.9.30）を**ユーザーと4往復して診断・解決**、`docs/reports/watch_sync_診断改修案_2026-07-26.md` |
| QA/CI・シミュレータによるセルフチェック | ✅ | `simplememo-ios/docs/qa/AUTOMATED_QA_ARCHITECTURE.md`（**2026-07-31導入**）。目的が明記されている：「リリース確認をほぼ無人化し、人間の確認を実機特有の**3〜5分**へ減らす」。`QAStubURLProtocol` をセッション構築時に注入して**テストから本番APIへの到達を構造的にゼロ**にし、成功/オフライン/タイムアウト/500/429をリクエスト粒度で決定論再現。`WatchBridgeContractTests` は2コピーを `watch-bridge-parity.yml` が同一性強制。ワークフローは `qa-ios.yml` / `qa-static.yml` |
| 複数AIモデルによる多重監査 | 🟡 **要修正** | **「複数モデル」の証跡は無い。**`scripts/qa/ai_triage.sh` は `QA_TRIAGE_MODEL:-claude-sonnet-5` の**単一モデル**。ただし**多重（多層）監査**は事実：①決定論的XCTest/XCUITest ②AIによる失敗分類（`docs/qa/AI_TRIAGE_PROMPT.md` — 5分類・確信度・最小再現手順・`insufficient_evidence` を用意して断定を避けさせる設計）③人間の実機スモーク3〜5分。セキュリティも2026-02の再監査 → 2026-07の堅牢化と**複数ラウンド**。→ **「複数のAIモデル」ではなく「複数の層」と書き換える**（§8-2） |
| セキュリティアタックの可能性ブロック | ✅ | `docs/reports/SECURITY_HARDENING_2026-07.md`（2026-07-13）。iOS 65 Swiftファイル＋Relay API＋CI/CD＋設定類を監査し、**AIが発見してAIが修正**：R-1 High（`/v1/verify/confirm` のKV結果整合性を突いた並列リクエストで5回制限を実質超過できた＝他人のメールを勝手にverified化する入口）、R-2（`locale="constructor"` によるプロトタイプ経由参照）、R-3（型検証の穴 — 配列 `toEmail` が `RegExp.test` のToString強制で通過）、R-4（OTP生成の剰余バイアス）。制約は「正規クライアントに対して観測可能な差分ゼロ」 |

### 入っていなかったが、書ける材料

- **AIがテスト設計中に、誰も報告していないバグを見つけて回帰資産にした**：
  `AUTOMATED_QA_ARCHITECTURE.md` §4。Watch→iPhone送信の `requestId` 重複排除が存在せず、
  sendMessage失敗→transferUserInfoフォールバックで**同一メモが2通送信されうる**
  （messageIdが経路ごとに別UUIDになるためサーバ側の冪等性も効かない）ことを発見 →
  `WatchRequestLedger` を追加して入口でclaim。**ユーザー報告ゼロの潜在バグをAIが先に見つけた例**は、
  「AIが自分で品質を上げている」の最も具体的な証拠になる。
- **AIに「分からない」と言わせる設計**：`AI_TRIAGE_PROMPT.md` は `insufficient_evidence` を
  明示的な選択肢として持ち、「推測で断定せず、根拠が足りなければこれを選べ」と指示している。
  RSIの信頼性を語るとき、**幻覚対策が仕様として書かれている**のは強い。

---

## 4. ③ 自己改善型自律マーケティング

### 4-1. SEO/AIO/ASO — ✅ ここが本丸

**毎日のループ全体が実装済みで、12日ぶんの実運転ログがある。**

```
06:00 JST  obsidian-autopilot.yml（GitHub Actions・主系）
           ↓ 当日ブランチをclaimして排他 → データを読む → レーンA〜Eから1件だけ選ぶ
           ↓ 記事実装 → 内部リンク配線 → content-graph登録 → OG画像生成 → QR生成
06:00 JST  seo-daily.yml（BigQueryのサーチコンソール一括エクスポートを取り込み・検出器）
07:00 JST  cron-health.yml（scheduled runの失敗を単一Issueに集約）
07:30 JST  CCR Routine（副系・主系が動かなかった日のフォールバック）
09:20 JST  CCR Routine（再試行）
   ↓
SEO Validation（9チェック）が通ったときだけ auto-merge.yml が**検証済みSHAを指定して**マージ
   ↓ Cloudflare Pages が main へのpushで自動デプロイ
10:00 JST  simplememo-api の autopilot_report cron が本番のstatus JSONを読み、Resendで日報メール
12:00 JST  autopilot-health.yml（「緑のまま何もしていない」を検知してIssue化）
```

| 要素 | 証跡 |
|---|---|
| 運転開始 | 2026-08-11（PR #470と同時導入）。**本日2026-08-22で12日目** |
| 手順書 | `docs/obsidian/AUTOPILOT_RUNBOOK.md`（473行）。原則5つ・レーンA〜E・実装規約・9チェック・出荷手順・§7「できないこと（正直に）」まで |
| 実行ログ | `docs/obsidian/AUTOPILOT_LOG.md`（**1,236行**）。書かなかった回も記録 |
| 状態の外形 | `data/autopilot-status.json`（`streak` / `data_freshness` / `reason` / `verified` / `checks` / `owner_requests` / `next`）を毎回上書き。**スキップした日も更新する**設計で、更新が無い日は日報が「上流停止」と報告する |
| 品質ゲート | `scripts/seo-check.js`（**261ファイル・0 errors 0 warnings**）、`check-css-version` / `check-benchmark` / `check-url-normalization` / `check-internal-redirects`（**13,195 href/src + 5,203 JSON-LD/meta + 576 sitemap URL をすべて直接200で検証**）/ `sync_constants` / `tag-cta-placements` / `check-experiments` / `check-content-graph` / `generate_sitemap.py --check` |
| 実験台帳 | `growth/experiments/experiments.json` — **35件（21 open・due 0・overdue 0）**。評価日をCIが監視し、期限切れがあればジョブサマリに出す |
| コンテンツキュー | `growth/content/coverage-queue.json` — 36件（done 5 / pending 29 / blocked 2） |
| 1回あたりの実費 | 主系の2026-08-22 run で `total_cost_usd: 0.81` |

**`growth/README.md` の冒頭が、この仕組みの存在理由を1段落で説明している**（引用価値が高い）：

> 2026-07-01/02、12ページをリタイトルして評価日を07-29/30と報告書に書いた。日付は過ぎた。
> 以後6週間の報告書はいずれも「7/29に判断」と繰り返して先へ進んだ。壊れてはいなかったし、
> 誰も不注意ではなかった — **単に、期限切れになれる成果物が無かった**。計画は散文の中に住んでいて、
> 散文は手を挙げない。

### 4-2. データ源の実態（**ここが原案と食い違う**）

| データ源 | 原案の記載 | 実態 |
|---|---|---|
| BigQuery経由サーチコンソール | 自動 | ✅ **稼働中**（2026-08-13にエクスポート開始）。`growth/lib/bigquery.mjs` は依存ゼロの自前実装。ただし**28日ぶん貯まるまでスナップショットを作らない**規律があり、2026-08-22時点で**7/28日**。本格稼働は2026-09-06前後 |
| ahrefs | 自動 | 🔵 **分析レポートはあるが自動連携ではない**（`docs/seo/gsc-ahrefs-fix-2026-08-08.md` 等は手動エクスポートを読んだもの） |
| AppsFlyer | 自動 | 🔵 数値の引用はある（8/18週のオーガニック+52%）が、**取り込みスクリプトも受け皿ディレクトリも無い** |
| Firebase / GA4 | 自動 | 🟡 `growth/data/ga4/README.md` に受け皿はあるが**月1の手動エクスポート**。ログに「GA4のBigQueryリンク（無料・一度きり）を設定すれば全自動化可能」＝**未設定** |
| App Store Connect | — | 🔵 `growth/data/appstore/` は**受け皿だけ**。「iOSリポジトリが既に持つASC APIキーでAnalytics Reports APIを叩く道がある＝新種のキーは不要（オーナー判断待ち）」 |

→ **「BigQuery経由サーチコンソール、ahrefs、AppsFlyer、Firebaseなどのデータ分析に基づく」は、
現状 BigQuery/GSC のみが自動。** 4つ並べると1つを除いて崩れる。

### 4-3. 次配信プレスリリース策定の自動化

| 項目 | 判定 | 証跡 |
|---|---|---|
| PR企画のスコアリング | 🟡 部分的 | **D-SCORE**（S1新規性30 / S2エンティティ到達20 / S3具体名詞15 / S4変化15 / S5時流10 / S6ニュース動詞 / S7ローンチ設計、**合格60**）が `experiments.json` の `pr_release` レコード型として実装済み。n=5のバックテストで較正されている。**ただし較正の根拠文書 `docs/GROWTH_ROI_PLAN_2026-08-20.md` はリポジトリに存在しない**（4箇所から参照されているだけ）。→ アクション化（plan §3） |
| トレンド起点の起案 | 🔵 設計のみ | `docs/trend-radar-prompt.md` の対応SLA（当日＝サイト＋X＋noteで資産化 / 2〜5日内＝角度があればPR起案・60未満は撃たない）。**実組み込みは未了** |
| Computer Useほか自律ブラウザ操作での配信 | ❌ **証跡なし** | 前回原稿 `docs/pr-voice-input-2026-06.md` の冒頭に「**配信は PR TIMES 管理画面から手動**」と明記。3リポジトリにPR TIMES APIもブラウザ自動化も無い |
| ヒーローバナー自動作成 | 🟡 部分的 | `docs/siri-hero-banner-brief.md` は**gpt-image2用のプロンプト文面をAIが書いたもの**（生成実行は外部ツール・人手）。一方 **OG画像の自動生成は実装済み**（`scripts/generate-og-batch.js` + Playwright。autopilotが毎回実行し、chromiumのパス差異をsymlinkで補う手順まで手順書にある） |
| タグ付け・配信日時・配信先・キャンペーンパラメータの自動付与 | 🟡 部分的 | キャンペーンパラメータは✅（`ct=<page-id>__<placement>` ＋ `data-cta-placement/cluster/variant` を全CTAに付与、`tag-cta-placements.js --check` がCIで強制、**49件がpage-level ct=を保持**、`data/cpp-map.json` でCPP ppid配線）。**配信日時・配信先はPR TIMES管理画面側なので自動化されていない** |

### 4-4. リスティング広告のMCP/API自動運用 — 🔵 **調査レポートのみ・未実装**

`simplememo-ios/docs/reports/APPLE_ADS_AUTOMATION_2026-08-17.md`（621行）。中身は濃いが、
**§12（2026-08-18追記）が自分で「実行できない」と書いている**：

> §0-3の「まず `/v1/suggestions/target-cpas/query` を叩いて¥40の妥当性を見る」は
> **このリポジトリの資格情報だけでは実行できない**。3リポジトリをgrepした限り
> Apple Ads の資格情報はどこにも無い。

さらに **§4.3 が「リアルタイム監視と自動調整」を自ら否定している**：

> ¥4,000/日 ÷ 実効CPT ¥26.5 = 最大151タップ/日。実際は20〜50タップ/日。
> これを30〜60KWに配ると1KWあたり1日1タップ未満。CRを±10ptの精度で推定するには
> 1KWあたり30〜50タップ必要 → **1つのKWの良し悪しが判定できるまで15〜50日かかる。**
> 日次でKW入札を動かすツールは、統計的に無意味な変更を毎日繰り返すだけでCPIをむしろ悪化させる。

→ **「広告パフォーマンスのリアルタイム監視と自動調整」は、実装が無いだけでなく、
自社の分析が「この予算規模ではやるべきでない」と結論している。**書けない。

### 4-5. 機能リリース毎の特集LP・素材・アプリ内画撮・実機操作

| 項目 | 判定 | 証跡 |
|---|---|---|
| 特集ランディングページの自律作成 | ✅ | `/siri/`・`/voice-input/`・`/obsidian/*`（12ページ）・`/hands-free/`・`/ai-tags/` などを自律生成。iPhoneビューポート（390×844 DPR3）の実描画QAまでセッション内で実施 |
| 必要素材（OG・QR）の自律作成 | ✅ | OG画像（Playwright）・デスクトップQR（**35件を独立デコード検証**）。QRは「App Storeクリックの約35%がPCで行き止まり」という2026-08-10実測が根拠 |
| **アプリ内画撮・実機操作の自律作成** | ❌ | **Runbook §7「できないこと（正直に）」の筆頭**：「iOS Simulator / 実機iPhoneの操作・撮影・計測（macOS必須）」。撮影はオーナーのMacで `simplememo-ios/scripts/qa/capture-article-screenshots.sh <slug>` を手動実行。理由も明記されている — **macOSランナーは2026-07-31に1日で$10を焼き、予算枯渇がrelease/TestFlightまで止めたため、GitHub Actionsから外した** |

### 4-6. AIエージェントによるSNSマーケティング — 🟡 **大半が停止中**

`simplememo/README.md` の冒頭に停止告知が出ている：

| チャネル | 状態 |
|---|---|
| X（日本語） | 🟡 Claude定期タスク（Cowork）でのバッチ運用に**一本化**。ワークフロー経路は二重運用防止のため停止 |
| X（英語） | ❌ **アカウントBAN1回目**を受けて停止。回復とライブラリ鮮度化が先 |
| TikTok | ❌ 画像品質が基準未達で停止。加えて `privacy_level: "SELF_ONLY"` が3箇所にハードコードされており、**これまでの投稿はすべて非公開で積まれていた疑い** |
| scheduled経路 | ❌ 2026-08-07以降**壊れたまま**。原因は特定済み（`/admin/*` がCloudflare Access配下に移ったのにワークフローはBasic認証しか送っておらず、投稿本文を出す前に302でログイン画面へ飛ぶ）。再開にはAccessのサービストークンが要る |

→ **「AIエージェントによるSNSマーケティングの自動化」は、2チャネルが停止・1チャネルがBAN。**
このまま書くと最も痛い形で崩れる。ただし**Xの日本語だけは Cowork で稼働中**なので、
そこに絞れば書ける。

---

## 5. ④ 自動本番デプロイ

| 項目 | 判定 | 証跡 |
|---|---|---|
| TestFlight配信の自動化 | ✅ | `v*` タグ → Xcode Cloud「Release to TestFlight」がiOS/watchOSをアーカイブ → `attach-testflight-testers.yml` がASC APIを**VALID処理済みビルドが出るまでポーリングして**Yurika Groupへ自動アタッチ。`buildDistributionAudience: APP_STORE_ELIGIBLE`（`INTERNAL_ONLY` では自動アタッチされないことを2026-07-05に実地で確認済み） |
| Xcode Cloud経由 App Store バージョンアップの自動化 | ✅ | `submit-v*` タグ → `scripts/prepare_app_store_version.rb`（stdlib のみ）がリリースノート読取・AppStoreVersion解決・**ビルドを `processingState: VALID` かつ `buildAudienceType: APP_STORE_ELIGIBLE` で厳密に解決**・サブタイトル同期・Apple商標スキャン → fastlane `precheck`/`deliver` |
| 必要素材・アップデート分・申請項目入力の自動化 | ✅ | 上記に加え、`metadata/subtitle/*.txt` の検証（長さ・単一行・商標）が**ネットワーク到達前**に走り、同じチェックがPR毎の QA Static Checks でも走る。**2026-08-10のGuideline 5.2.5リジェクト（サブタイトルの「Apple Watch」「AirPods」）を受けて追加された恒久対策** |
| ChatOps | ✅ | `release-command.yml`。issue #35 への `SIMPLEMEMO_RELEASE 5.8.0 DRY_RUN / TESTFLIGHT / SUBMIT` で全チェーンを起動。**セッションからは issue コメントしか叩けない**（`actions: write` 無し・repository_dispatch 遮断・タグpush拒否）という制約を逆手に取った設計 |
| **iOSシミュレータ利用含む実機テストのヒューマンレス** | ❌ **逆** | `docs/release-automation.md` の **Hard Rule**：「**実機で確認してから submit する。後ではなく先に。**」。§7も「Simulator/実機の操作はできない（macOS必須）」。**承認後の公開も恒久的に手動**（`automatic_release` が Fastfile にハードコード `false`、「will remain a manual action」と明記） |

### 入っていなかったが、**これが一番のネタ**

**`claude.yml` は意図的に `actions: write` を持っていない。**理由がコメントに書いてある：

> `release.yml` は `submit_review: true` で **タグ→Xcode Cloud→TestFlight→App Review提出の
> 全チェーン**を走らせる。このチェーンを止めているのは
> `docs/release-automation.md` の**人間のHard Ruleだけ**で、技術的な制御ではない。
> `actions: write` があれば、確認を求めないbypassPermissionsのClaudeが
> `gh workflow run release.yml -f submit_review=true` を呼んで、
> **人間を一切介さずApp Storeへ出荷できてしまう。**
> claude-code-action がこの権限を必要とする中核機能は無い — リポジトリの読み取り・コミット・
> push・PR作成・コメントはすべて権限なしで動く。必要になったら、この権限を広げるのではなく
> **プロンプト面の狭い別ワークフローを作れ。**

**「AIに何をさせないかを、権限の形で明文化してある」** — これは
「自律運用は暴走する」という記者の最初の疑問への、コード上の回答になる。
RSIのプレスリリースで最も差がつくのは、できることの数ではなく**この一節**。

---

## 6. ⑤ AI予算に応じたトークンマネジメント — ❌ **証跡ゼロ**

「トークン予算」「AI予算」「アロケーション」「予算配分」「月次予算」で
3リポジトリ全文検索して**0件**。

関連する実測はある（が、別のもの）：

- 主系autopilotの1回あたり `total_cost_usd: 0.81`（実行ログに残る）
- `simplememo-ios/CLAUDE.md`：「macOSランナーはGitHub Actionsで回さない
  （**2026-07-31に1日で$10を焼き、予算枯渇は release/TestFlight まで止める**）」
  → **予算制約が実際に開発方針を変えた実績**。ただしこれは「AIが自己分析して週次で
  最適配分した」ではなく「**上限に当たって人間が方針を変えた**」

→ **プレスリリースに「毎週の開発・マーケティングにアロケーションを自己分析しながら
最適配分している」とは書けない。**書くなら先に実装が要る（plan §4-A）。

---

## 7. ⑥ アプリ運営意思決定 ／ ⑦ 法人経営の自動化 — ❌ **証跡ゼロ**

### ⑥ App Store内の売上・マーケデータの自動取得と分析からの月次予算自動調整

- `growth/data/appstore/` は**受け皿ディレクトリと .gitkeep だけ**
- `AUTOPILOT_LOG.md`（2026-08-11）に**未着手であることが明記**されている：
  「App Store Connect の ct= 別インストール/課金CSVの定期エクスポート（**オーナー判断待ち**）」
  「ASC APIキーでAnalytics Reports APIを叩く道がある＝新種のキーは不要（**オーナー判断待ち**）」
- さらに**構造的な壁も判明済み**：「App Store Connect『キャンペーン』が90日間で空だったのは
  計測の故障ではない。App Storeクリック2.1件/日 × インストール率 × App Analytics共有
  オプトイン率が、**Appleの表示閾値（少数は秘匿）未満**のため。流量が育つまで
  キャンペーン別は出ない」

### ⑦ 経理・会計・労務・財務、契約・決済、AIモデル契約レビュー、HaaS、事業計画・予実、ガバナンス倫理レビュー

3リポジトリ全文検索で**該当実装・該当文書ともに0件**。
（`VISION.md` §4.1 の Routing 例に「8月のResend 12,400円 → Intent: Expense」という
**将来機能の例示**が出てくるだけで、これは経理自動化の実装ではない）

→ **⑦は7項目すべてが検証不能。**リポジトリ外で実施されている可能性はあるが、
**プレスリリースで主張するなら、記者に見せられる形の証跡（スクリーンショット・
運用記録・第三者の確認）をオーナー側で用意する必要がある**（plan §4-B）。

---

## 8. 訴求上の最大の論点 — 「AIを前面に出す」は自社実測で負けている

### 8-1. n=5 のPR実績

`growth/data/annotations.json` に全5回が記録されている。

| 回 | 内容 | PV | 転載 | D-SCORE | Discover |
|---|---|---:|---:|---:|:--|
| PR① 2026-04-24 | 初回リリース（Captio式・即メール送信） | 217 | 0 | 46 | 非乗車 |
| **PR② 2026-06-01** | **新機能「Obsidian連携」提供開始** | **12,188** | **34** | **71** | **乗車** |
| PR③ 2026-07-06 | 話すだけでObsidianへ — Apple Watch初対応 | 10,434 | 28 | 65 | 乗車 |
| **PR④ 2026-08-03** | **AIタグ自動追加** | **469** | 22 | **21** | 非乗車 |
| PR⑤ 2026-08-18 | AirPodsに話すだけでObsidianへ（Siri対応） | 1,347 | 28 | 40 | 非乗車 |

PR④の台帳ラベルにこう書かれている：**「AI前面タイトルの負け実証・G2違反」**。

D-SCOREには配信可否のゲートG1〜G4があり、**G2 = `no_ai_or_clickbait_words`**。
1つでも落ちたら配信不可、という運用。

### 8-2. それでも今回のPRは「別カテゴリ」かもしれない

**PR④が負けたのは「プロダクトの機能としてAIを名乗った」から。**
「AIタグ自動追加」は、読者にとって**2026年に珍しくもない機能名**だった。
VISION §0 が禁じているのも同じこと — 「AIが賢い」ではなく
「何も整理しなくても正しい場所に残っている」を売れ、という**プロダクト訴求の話**。

今回の主張は**プロダクトではなく運営体制**で、
「**個人開発のiOSアプリが、毎朝6時に自分で改善案を選んで本番へ出荷している**」は
D-SCOREのS1（新規性）が構造的に高い。**同じ「AI」でも質が違う。**

**ただしこれは私が決めることではない。**やるべきことは2つ：

1. **見出し確定稿でD-SCOREを採点し、60未満なら撃たない**（自社ルール）
2. **G2の解釈をオーナーが明示的に決める** — 「G2はプロダクト訴求のAIを禁じたもので、
   運営体制のニュースには適用しない」と決めるのか、
   「AIという語を見出しから外す」（＝「無人で動くアプリ運営」等の言い換え）のか

採点案とゲート判定は `pr-rsi-2026-09-plan.md` §2 に置いた。

### 8-3. 既存の配信計画と競合している

`experiments.json` に **`pr-2026-multi-destination`（弾薬庫案2「Multi-Destination一括」）が
`status: planned`・D-SCORE事前採点 95** で登録済み（2026-08-20）。

見出し案は「**『明日牛乳』はリマインダーへ、『金曜15時 歯医者』はカレンダーへ**」で、
VISION §11 Phase 5 に対応する**プロダクト側の本命弾**。

**9月上旬はAppleウィーク（`trend-radar-prompt.md` が「年間最大の窓」と明記）。**
ここに何を当てるかは事業判断。→ plan §1 で3案を提示する。

---

## 9. 検索して「無かった」ものの一覧（透明性のため）

| 探したもの | 検索語 | 結果 |
|---|---|---|
| トークン予算管理 | トークン予算 / token budget / AI予算 / アロケーション / 予算配分 | 0件 |
| 経理・会計・労務 | 経理 / 会計 / 労務 / 士業 / freee / マネーフォワード / バックオフィス | 0件（無関係な語義一致のみ） |
| 契約・決済・HaaS | HaaS / 契約書 / 決済代行 / 請求書 | 0件（VISIONの例示のみ） |
| PR TIMES配信自動化 | PR TIMES / prtimes ＋ API / 自動配信 | 0件（前回原稿に「手動」と明記） |
| Apple Ads 資格情報 | APPLE_ADS_* / searchadsorg | 0件（レポート §12 が自ら確認済み） |
| ASC 売上API | salesReports / financeReports / Analytics Reports API | 実装0件（「オーナー判断待ち」の言及のみ） |
| 複数AIモデル監査 | Gemini / GPT- / Codex / 多重監査 / cross-model | 実装0件（`ai_triage.sh` は claude-sonnet-5 単独） |
| `GROWTH_ROI_PLAN_2026-08-20.md` | ファイル存在確認 | **リポジトリに無い**（4箇所から参照されているだけ） |

---

## 10. まとめ — 原稿に「書ける／書けない」

### 書ける（証跡あり・記者に出せる）

1. 毎朝06:00の自律コンテンツループ（12日間の実運転ログ・1,236行）
2. 検証を通ったコミットだけが本番へ出る仕組み（9チェック＋検証済みSHA指定マージ）
3. 「止まっていること」を検知する二重の見張り（cron-health / autopilot-health）
4. ユーザー要望 → 継続率データ → 4ビルドに分けた納品
5. AIが自分でテストを設計し、誰も報告していないバグを見つけて回帰資産にした
6. AIが発見しAIが修正したセキュリティ4件（High 1件含む）
7. タグ→Xcode Cloud→TestFlight自動アタッチ→App Review提出のChatOps
8. **AIに与えていない権限を、理由つきで明文化してある**（`actions: write`）
9. 「できないことを正直に書く」文化そのもの（Runbook §7・status JSONの `owner_requests`）

### 書けない（証跡なし・現状の文面だと崩れる）

1. 複数**AIモデル**による多重監査 → 「複数の**層**」に書き換え
2. ahrefs / AppsFlyer / Firebase のデータ分析に基づく自動改良 → BigQuery/GSCのみ
3. Computer Useによる自律ブラウザ操作でのPR配信 → 配信は手動
4. リスティング広告のMCP/API自動運用 → 調査レポートのみ・資格情報なし
5. 広告パフォーマンスのリアルタイム監視と自動調整 → **自社分析が「やるべきでない」と結論**
6. アプリ内画撮・実機操作の自律作成 → macOS必須・オーナーのMacで手動
7. SNSマーケの自動化 → X英語BAN・TikTok停止・scheduled経路が8/7から故障中
8. TestFlight実機テストのヒューマンレス → **Hard Ruleで人間必須**（意図的）
9. ⑤ トークンマネジメント → 証跡ゼロ
10. ⑥ 売上データからの月次予算自動調整 → 受け皿だけ・オーナー判断待ち
11. ⑦ 法人経営の自動化 全7項目 → 証跡ゼロ

**「書けない」の多くは、実は書き方を変えれば書ける。**
たとえば⑧は「人間を残していない」ではなく
「**出荷の最終判断だけは、権限の形で人間に固定してある**」と書けば、
弱点ではなく設計思想になる。原稿ではその方針を取った。
