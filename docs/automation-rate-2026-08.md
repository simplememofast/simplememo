# 全領域の自動化率 — 実測

> **測定日: 2026-08-22 / 173タスク / 13領域**
> 台帳: `data/automation-coverage.json` ／ 集計: `node scripts/automation-rate.mjs`
> ロードマップ: `autopilot-roadmap.md`
> **分類は3リポジトリの実装を1件ずつ当てて決めた。**証跡の実在はCIが確認している。

---

## 0. 全体

| 指標 | 値 | 分母 |
|---|---:|---|
| **総合自動化率** | **35.1%** | 定義タスク 170（未実装を含む・**最も厳しい**） |
| AI実行率 | 52.2% | 実施中タスク 107（未実装を除く） |
| AI関与率 | 83.5% | 同上（提案・下書きまで含める・**最も甘い**） |
| カバー率 | 67.3% | そもそも誰かがやっているタスクの割合 |

内訳: 自律 6 / ゲート付き実行 54 / 提案 36 / 人間 19 / **未実装 56** / 意図的にやらない 2

**4つを必ず並べて出す。**分母を1つに決めると必ず都合のよい数字になる。
**総合自動化率とカバー率を隠してAI関与率だけ出すのが、ここで一番やってはいけないこと。**

### 読み方

- **AI関与率 83.5%** — 「誰かがやっているタスクの8割にAIが関わっている」。**この数字だけ見ると誤解する**
- **総合自動化率 35.1%** — 「あるべきタスクのうちAIが実行しているのは3割」。**これが現在地**
- **カバー率 67.3%** — 3割強は**誰もやっていない**。自動化以前に未着手

つまり **AIが関わっている領域では実際に手を動かしているが、そもそも手が付いていない領域が4割ある**。

---

## 1. 領域別（総合自動化率の高い順）

| 領域 | 総合 | 実行 | 関与 | カバー | 自律/ゲート/提案/人間/未実装 |
|---|---:|---:|---:|---:|---|
| ⑩ AgentOps・ガバナンス | **58.3%** | 77.8% | 100.0% | 75.0% | 0/7/2/0/3 |
| ③ 自律型マーケティング | **53.8%** | 70.0% | 90.0% | 76.9% | 2/12/4/2/6 |
| ⑤ AI予算・トークン管理 | **46.7%** | 70.0% | 90.0% | 66.7% | 0/7/2/1/5 |
| ⑫ 事業継続性 | **44.4%** | 66.7% | 100.0% | 66.7% | 0/4/2/0/3 |
| ② バグ修正 | **43.8%** | 58.3% | 91.7% | 75.0% | 0/7/4/1/4 |
| ⑪ データ・プライバシー | **33.3%** | 50.0% | 83.3% | 66.7% | 0/3/2/1/3 |
| ⑥ アプリ運営意思決定 | **23.1%** | 37.5% | 87.5% | 61.5% | 0/3/4/1/5 |
| ① 次期機能開発 | **21.4%** | 33.3% | 100.0% | 64.3% | 0/3/6/0/5 |
| ④ 自動本番デプロイ | **21.4%** | 30.0% | 60.0% | 71.4% | 0/3/3/4/4 |
| ⑧ カスタマーサポート | **12.5%** | 33.3% | 100.0% | 37.5% | 0/1/2/0/5 |
| ⑨ マネタイズ | **12.5%** | 25.0% | 75.0% | 50.0% | 0/1/2/1/4 |
| ⑦ 法人経営 | **0.0%** | 0.0% | 50.0% | 15.4% | 0/0/1/1/11 |
| ⑬ アナログ領域 | **0.0%** | 0.0% | 12.5% | 61.5% | 0/0/1/7/5 |

### この表から読めること

1. **⑩AgentOpsと③マーケティングが先頭。**AgentOpsは2026-08-22に集中実装した分（運転台帳・権限表・自己修復・切替演習）。マーケは毎朝の記事ループが実際に回っているから。
2. **⑦法人経営は総合0.0%・カバー率15.4%。**13タスク中11が未実装。「構想中心」という外部レビューの評価がそのまま数字になっている。
3. **⑬アナログ領域の総合0.0%は正常。**7タスクが `human_only` で、これは失敗ではなく**設計**。ただし**AIが担える側が全部未実装**なので伸ばす余地は残る。
4. **AI関与率は多くの領域で90%超。**「AIが関わっていない領域はほぼ無い」が「AIが実行まで持っている領域は少ない」。

---

## 2. タスク単位（全172件）

`node scripts/automation-rate.mjs --area <領域名の一部>` で同じものが出る。

### ⑩ AgentOps・ガバナンス

総合 **58.3%** ／ 実行 77.8% ／ 関与 100.0% ／ カバー 75.0%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | 実行の完全記録（主系） | Actionsのrunログは全部読める<br>`.github/workflows/obsidian-autopilot.yml` |
| **未実装** | 実行の完全記録（副系） | スケジュール起動セッションのログが外部から読めない。構造的に不可<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md` |
| ゲート付き実行 | 誰が何を変更したかの監査ログ | 経路・結果・介入は機械可読。判断の根拠はまだ散文<br>`data/autopilot-runs.json` |
| ゲート付き実行 | 最小権限（AIに与えない権限の明文化） | actions:write 非付与。CIが実際に検出する<br>`../simplememo-ios/.github/workflows/claude.yml`<br>`scripts/check-authority.mjs` |
| 提案のみ | Prompt Injection・Tool Poisoning対策 | 本文が一切シェルに渡らない設計。外部コンテンツを読む経路の対策は無い<br>`../simplememo-ios/.github/workflows/release-command.yml` |
| ゲート付き実行 | AIへの送信内容のredact | PII無し・サイズ上限つき要約のみ<br>`../simplememo-ios/scripts/qa/build-ai-triage-bundle.sh` |
| 提案のみ | エージェント別 Kill Switch | 予算ゲートが実質これ（主系のみ）。副系は止められない<br>`.github/workflows/obsidian-autopilot.yml` |
| ゲート付き実行 | 失敗理由とバックアップ切替の観測 | by_route・primary_ever_shipped・failure_class<br>`data/autopilot-runs.json`<br>`scripts/autopilot-runs.mjs` |
| ゲート付き実行 | 基盤故障の自己修復と、その歯止め | 検証の弱体化・権限の拡大をCIが実検出<br>`scripts/autopilot-selfheal.mjs`<br>`scripts/check-authority.mjs` |
| ゲート付き実行 | バックアップ切替の演習 | 2026-08-22実装。判定の論理を15シナリオで検証。**実際のネットワーク・認証の挙動は証明しない**<br>`scripts/autopilot-drill.mjs` |
| **未実装** | 自律システムとは別系統の監査AI | 監査対象のログが揃ってきたのは2026-08-22から。まず記録を貯める段階 |
| **未実装** | 認証切れ・モデル障害・API障害の演習 | 演習の前に、切替が起きたことを観測する仕組みが要った（2026-08-22に実装） |

### ③ 自律型マーケティング

総合 **53.8%** ／ 実行 70.0% ／ 関与 90.0% ／ カバー 76.9%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | 検索データの取り込み（GSC / BigQuery） | 日次自動<br>`growth/scripts/ingest-bigquery.mjs`<br>`.github/workflows/seo-daily.yml` |
| ゲート付き実行 | データ鮮度の監視 | 鮮度落ちで失敗する<br>`growth/scripts/bq-preflight.mjs` |
| **未実装** | OAuth切れ・API障害時の自動復旧 | 検知はする。復旧は人 |
| **自律** | 施策の選定（レーンA〜E） | ノイズフロア・品質ゲートに基づきAIが単独で選ぶ<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md` |
| ゲート付き実行 | 記事の実装と内部リンク配線 | 出荷10件すべてAIが執筆。人は中身に触っていない<br>`docs/obsidian/AUTOPILOT_LOG.md` |
| ゲート付き実行 | OG画像の生成 | Playwright。毎回自動<br>`scripts/generate-og-batch.js` |
| ゲート付き実行 | デスクトップQRの生成と検証 | 35件を独立デコード検証<br>`scripts/generate-qr-codes.mjs` |
| ゲート付き実行 | 品質ゲート（ノイズフロア・品質80点・検証規約） | 「毎日出すために基準を下げる」を失敗と定義<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md` |
| ゲート付き実行 | 本番デプロイ（検証済みSHAのみマージ） | SEO Validation合格時のみ<br>`.github/workflows/auto-merge.yml` |
| ゲート付き実行 | 停止の検知（緑のまま何もしていない） | 12:00と07:00の二重<br>`.github/workflows/autopilot-health.yml`<br>`.github/workflows/cron-health.yml` |
| **未実装** | ahrefs / AppsFlyer / Firebase のデータ連携 | 自動連携なし。手動エクスポート |
| **未実装** | App Store Connect のデータ連携 | 受け皿だけ。鍵は既にある<br>`growth/data/appstore/` |
| 人間 | AIプローブ（生成AI検索での露出確認） | 月1・オーナーが手動<br>`growth/input/AI_PROBE_PROTOCOL.md` |
| 提案のみ | 言及・競合ウォッチ | 週1・WebSearch。スナップショット1件のみ<br>`growth/data/mentions/` |
| 提案のみ | トレンドレーダー（Googleトレンド/はてブ/ランキング） | 2026-08-22にRunbook §6の保守メニューへ組み込み。PR起案の判断は人<br>`docs/trend-radar-prompt.md`<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md` |
| ゲート付き実行 | PR企画の採点とゲート判定 | 算数とゲートの矛盾をCIが落とす。採点は人が置く<br>`growth/scripts/d-score.mjs` |
| **自律** | PR原稿の執筆 | 本原稿がその実例<br>`docs/pr-autopilot-2026-09.md` |
| ゲート付き実行 | PR原稿の事実・数値・引用元の検査 | 2026-08-22実装。site-constants.json と benchmark.json を正として、旧アプリ名・古い起動時間・廃止済みトライアル・誇大表現・価格ドリフトをCIが落とす。**引用元の確認（出典が実在するか）はまだ人**<br>`scripts/check-pr-facts.mjs`<br>`data/site-constants.json`<br>`data/benchmark.json` |
| 提案のみ | ヒーロー画像の生成 | AIが依頼文を書き、生成は外部ツールで人が実行<br>`docs/siri-hero-banner-brief.md` |
| 人間 | PR TIMES への配信操作 | 管理画面から手動。APIが無い<br>`data/authority-matrix.json` |
| ゲート付き実行 | キャンペーンパラメータの付与 | CIが強制。49件がpage-level ct=保持<br>`scripts/tag-cta-placements.js`<br>`data/cpp-map.json` |
| **未実装** | App Store CPP（訴求別ページ）の実験 | 34本作成済みだが実験として回っていない<br>`data/cpp-map.json` |
| 提案のみ | SNS投稿（X日本語） | Cowork定期タスクでバッチ運用<br>`admin/brand/docs/cowork-x-engagement-brief.md` |
| 意図的にやらない | SNS投稿（X英語・TikTok） | アカウントBAN／品質未達で運用停止中<br>`README.md` |
| **未実装** | リスティング広告の運用 | 調査レポートのみ。資格情報も無い<br>`../simplememo-ios/docs/reports/APPLE_ADS_AUTOMATION_2026-08-17.md` |
| 意図的にやらない | 広告パフォーマンスの監視と自動調整 | 自社分析が『この予算規模ではやるべきでない』と結論<br>`../simplememo-ios/docs/reports/APPLE_ADS_AUTOMATION_2026-08-17.md` |
| **未実装** | 対照群による増分効果測定 | 未実施 |
| ゲート付き実行 | 紹介・レビュー促進・休眠復帰 | cronで自動送信<br>`../simplememo-api/src/lifecycle.ts`<br>`../simplememo-api/src/nudge.ts` |

### ⑤ AI予算・トークン管理

総合 **46.7%** ／ 実行 70.0% ／ 関与 90.0% ／ カバー 66.7%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | 実費の記録（月次台帳） | 2026-08-22実装<br>`data/autopilot-cost.json`<br>`scripts/autopilot-budget.mjs` |
| ゲート付き実行 | 実費の抽出（実行ログから） | total_cost_usd を抽出しサマリと通知へ<br>`.github/workflows/obsidian-autopilot.yml` |
| ゲート付き実行 | 上限超過での自己停止 | 予算ゲートが主系runを止める。副系は止められない<br>`.github/workflows/obsidian-autopilot.yml` |
| 人間 | 月次上限の決定 | 現在 placeholder $40。実測由来ではない<br>`data/authority-matrix.json` |
| ゲート付き実行 | 1記事あたり単価の算出 | usd_per_shipped。課金者あたりは無い<br>`scripts/autopilot-budget.mjs` |
| **未実装** | タスク単位の予算 | 月次のみ |
| ゲート付き実行 | モデル別・再試行別の内訳 | 2026-08-22実装。実行ログの modelUsage から記録。**費用の按分はログに無いので回数しか言えない**<br>`data/autopilot-cost.json`<br>`scripts/autopilot-budget.mjs` |
| **未実装** | 品質・速度・価格に応じたモデルルーター | タスク単位の予算（未実装）が前提。月次上限だけでは判断材料が足りない |
| 提案のみ | 小型→大型→人間への段階的移管 | QA分類のみ実装（2モデル→不一致なら人間）<br>`../simplememo-ios/scripts/qa/ai_triage.sh` |
| **未実装** | Prompt Cache・結果キャッシュ・コンテキスト圧縮 | 実費が月$25前後の見込みで、最適化の効果より実装コストが上回る段階 |
| ゲート付き実行 | 無限ループ・重複実行の防止 | --max-turns 250・当日ブランチ占有・冪等性チェック<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md` |
| ゲート付き実行 | 異常消費の検知 | 2026-08-22実装。絶対額ではなく直近中央値との比。実績5件未満では『判定していない』と言う<br>`scripts/autopilot-budget.mjs`<br>`data/autopilot-cost.json` |
| 提案のみ | モデル障害・レート制限時のフォールバック | QA分類は2モデル構成。autopilot本体は無い<br>`../simplememo-ios/scripts/qa/ai_triage.sh` |
| **未実装** | 新モデル導入前の固定評価セット | 評価セットを作る前に、まず何を評価すべきかが定まっていない |
| **未実装** | 副系CCRの実費観測 | スケジュール起動セッションのログが外部から読めない。構造的に不可<br>`data/autopilot-cost.json` |

### ⑫ 事業継続性

総合 **44.4%** ／ 実行 66.7% ／ 関与 100.0% ／ カバー 66.7%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | 実行経路の二重化（主系・副系） | 主系1/6・副系10/10。冗長化が実際に効いた（初出荷は2026-08-23。それまでの11回と、その後の08-24・08-25 は不発）<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md`<br>`data/autopilot-runs.json` |
| ゲート付き実行 | 冪等性 | 当日ブランチ占有・run_id冪等・messageId冪等・WatchRequestLedger<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md`<br>`scripts/autopilot-budget.mjs` |
| ゲート付き実行 | 再試行 | 09:20の再試行経路・Resend 429の単発リトライ<br>`.github/workflows/obsidian-autopilot.yml`<br>`../simplememo-api/src/resend.ts` |
| **未実装** | Circuit Breaker | 外部依存の障害パターンをまだ観測できていない |
| **未実装** | Dead Letter Queue | Outbox（端末側）が実質これを担っている。サーバ側は未実装 |
| **未実装** | バックアップ・復元 | 本番データはCloudflare D1とApp Store側にあり、復元手順が未整備 |
| 提案のみ | 手動復旧手順 | 文書はある<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md`<br>`../simplememo-api/DEPLOYMENT.md` |
| ゲート付き実行 | 障害訓練 | 2026-08-22実装（切替ドリル）。認証切れ・モデル障害・API障害の演習はまだ<br>`scripts/autopilot-drill.mjs` |
| 提案のみ | 外部サービス停止時の縮退運転 | autopilotは二重化。GitHub/Apple/Cloudflareは単一障害点<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md` |

### ② バグ修正

総合 **43.8%** ／ 実行 58.3% ／ 関与 91.7% ／ カバー 75.0%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| 提案のみ | 統合監視（Crash/API/Watch/課金/問い合わせ） | 個別にはある。統合ビューが無い<br>`../simplememo-api/src/cron.ts` |
| 提案のみ | 問い合わせから再現テストを自動生成 | 手動運用。ただしWatch同期は実績あり<br>`../simplememo-ios/docs/qa/REGRESSION_TEST_TEMPLATE.md` |
| ゲート付き実行 | Unit / UI / 契約テストの実行 | XCTest/XCUITest＋Watchブリッジ契約テスト2コピー＋parity CI<br>`../simplememo-ios/.github/workflows/qa-ios.yml` |
| **未実装** | Visual Regression Test | アプリ側に無い |
| ゲート付き実行 | オフライン・タイムアウト・500・429の決定論再現 | QAStubURLProtocol。低速回線とバックグラウンド復帰は無い<br>`../simplememo-ios/docs/qa/AUTOMATED_QA_ARCHITECTURE.md` |
| 人間 | 実機/シミュレータでの操作・撮影・計測 | macOS必須。Runbook §7「できないこと」の筆頭<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md` |
| 提案のみ | アクセシビリティ・文字切れ・多言語の自動検査 | サイト側のみ。アプリ側は無い<br>`scripts/seo-check.js` |
| 提案のみ | 性能・起動時間の計測 | 定点実測。本番の継続監視ではない<br>`data/benchmark.json` |
| **未実装** | 依存脆弱性・秘密情報・SBOM・署名検査 | secret scanningは使えるがSBOM無し |
| **未実装** | Fuzz / Property-based / Mutation Test | 決定論的テストが先。この規模ではまだ費用対効果が読めない |
| ゲート付き実行 | 失敗の分類（独立2モデル監査） | 2026-08-22実装。割れたら人間に上げる<br>`../simplememo-ios/scripts/qa/ai_triage.sh` |
| ゲート付き実行 | 回帰の合否判定（決定論的） | AIには判定させない設計<br>`../simplememo-ios/docs/qa/AUTOMATED_QA_ARCHITECTURE.md` |
| ゲート付き実行 | セキュリティ監査と修正 | AIが発見しAIが修正。High 1件含む4件<br>`../simplememo-ios/docs/reports/SECURITY_HARDENING_2026-07.md` |
| **未実装** | カナリア公開と自動ロールバック | ②の閉ループが閉じない最大の理由 |
| ゲート付き実行 | 誤修正率・再発率・MTTRの計測 | 2026-08-22に検知時刻を投入。検知まで中央値2.1h/最大50.7h、修理まで中央値0.9h。誤修正率・再発率はまだ<br>`data/autopilot-runs.json`<br>`scripts/autopilot-runs.mjs` |
| ゲート付き実行 | 基盤故障の検知と自己修復 | 2026-08-22実装。レーンF<br>`scripts/autopilot-selfheal.mjs` |

### ⑪ データ・プライバシー

総合 **33.3%** ／ 実行 50.0% ／ 関与 83.3% ／ カバー 66.7%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | データ分類（送信可否の allowlist） | CIで強制<br>`../simplememo-ios/scripts/qa/check_analytics_allowlist.py` |
| 提案のみ | 収集同意 | App Analytics共有オプトイン依存 |
| ゲート | 保持期間の**定義**（棚卸しと逸脱検査） | 2026-08-22実装。23ストアを棚卸しし、ずれたらCIが落ちる形に<br>`../simplememo-api/data/data-retention.json` |
| ゲート | 保持期間の**自動削除** | app_analytics_events を90日で剪定（8/22・オーナー判断）。**23ストア中6つ**。残る10は無期限 |
| 提案のみ | 削除要求への対応 | APIは実装済み。運用手順は未整備<br>`../simplememo-api/docs/reports/API_PATCH_REQUEST_v2_4_7_account_delete.md` |
| ゲート付き実行 | AIへの送信可否の制御 | redact済み要約のみ。メモ本文fixtureは架空<br>`../simplememo-ios/scripts/qa/build-ai-triage-bundle.sh` |
| ゲート付き実行 | 端末内の暗号化 | AES-GCM-256・Keychain・Data Protection属性<br>`../simplememo-ios/docs/reports/SECURITY_HARDENING_2026-07.md` |
| **未実装** | アクセス履歴 | 同上 |
| **未実装** | 第三者SDKのデータ送信監査 | 同上。PrivacyInfo.xcprivacy はあるが実送信の監査は無い |
| 人間 | 推論をどこで回すかの決定 | VISION §14 未決定論点。Capture本文は個人情報そのもの<br>`../simplememo-ios/docs/VISION.md` |

### ⑥ アプリ運営意思決定

総合 **23.1%** ／ 実行 37.5% ／ 関与 87.5% ／ カバー 61.5%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | ファネル分析（インストール→初回メモ→継続→課金） | 4回連続の定点評価<br>`../simplememo-api/src/analytics.ts`<br>`../simplememo-api/docs/reports/FUNNEL_EVALUATION_2026-08-20.md` |
| 提案のみ | コホート分析（継続率・課金率） | 都度レポート<br>`../simplememo-api/docs/reports/RETENTION_MONETIZATION_COHORT_2026-07-29.md` |
| 提案のみ | KPI定義と集計SQLのバージョン管理 | `growth/lib/`<br>`../simplememo-api/docs/analytics-golden.md` |
| ゲート付き実行 | データ不足時に「何もしない」と判断 | ノイズフロア＝期待クリック3未満／28日窓未満でスナップショットを作らない<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md` |
| **未実装** | 売上・課金・返金・広告の照合 | ASC未接続。鍵は既にある<br>`growth/data/appstore/` |
| 提案のみ | 欠損・遅延・重複データの検査 | 鮮度監視のみ<br>`growth/scripts/bq-preflight.mjs` |
| **未実装** | CAC・LTV・回収期間・粗利の統合 | 広告が未実装でCACが存在せず、ASC売上も未接続 |
| 提案のみ | 季節性・外部要因の分離 | 系列台帳が下地<br>`growth/data/annotations.json` |
| **未実装** | 対照群に対する増分効果の評価 | 母数が小さく（App Storeクリック2.1件/日）、対照群を割ると両群とも検出力不足 |
| **未実装** | 予算変更幅・損失上限・撤回条件 | 動かす予算そのものが無い（広告未実装） |
| ゲート付き実行 | 可逆／不可逆の承認レベル分け | 2026-08-22実装。13領域中9が承認制<br>`data/authority-matrix.json`<br>`scripts/check-authority.mjs` |
| 人間 | 月次予算の決定 | — |
| **未実装** | 資金繰りシナリオ（悲観・標準・楽観） | 法人経営領域と一体。証跡の形から未着手 |

### ① 次期機能開発

総合 **21.4%** ／ 実行 33.3% ／ 関与 100.0% ／ カバー 64.3%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| 提案のみ | ビジョン文書の維持（機能追加の必読ゲート） | 3リポジトリのCLAUDE.mdが強制参照。定期改訂の仕組みは無い<br>`../simplememo-ios/docs/VISION.md` |
| ゲート付き実行 | AIが変更してはいけない安全原則の固定 | VISION §9「作らないもの」＋§13の6問。claude.ymlのactions:write非付与<br>`../simplememo-ios/docs/VISION.md`<br>`.github/workflows/seo-check.yml` |
| **未実装** | 要望・レビュー・問い合わせ・競合情報の重複排除 | 統合台帳が無い。都度レポート |
| **未実装** | 期待効果・確信度・工数・リスクによる自動優先順位付け | コンテンツ側のノイズフロアは有るが機能側は無い |
| 提案のみ | ユーザー要望の受領と設計への落とし込み | AIが設計文書まで。採否はオーナー判断<br>`../simplememo-ios/docs/reports/feature_requests_2026-07-31_obsidian_user.md` |
| 提案のみ | 継続率データによる優先度判断 | D7継続2.5〜3.7倍を根拠に優先度決定。決定は人<br>`../simplememo-api/docs/reports/RETENTION_MONETIZATION_COHORT_2026-07-29.md` |
| 提案のみ | PRD・受入条件・UX・多言語の作成 | 都度作成・定型化されていない<br>`../simplememo-ios/docs/obsidian-only-mode-design.md` |
| ゲート付き実行 | Issue→ブランチ→PR→テスト→配信を結ぶ共通実行ID | 2026-08-22実装<br>`data/autopilot-runs.json`<br>`scripts/autopilot-runs.mjs` |
| ゲート | 遠隔操作できるFeature Flag | **[8/22訂正] 「アプリ本体に無い」は誤り。**v4.7から `/v1/config` で遠隔操作できていた。同日、段階公開・キャッシュ期限・取得経路のテストを追加<br>`../simplememo-ios/SimpleMemo/FeatureFlagRollout.swift` |
| 提案のみ | 対照群・最低サンプル数・停止条件を持つ実験基盤 | サイト側のみ。評価日はCIが監視するが対照群の概念が無い<br>`growth/experiments/experiments.json` |
| 提案のみ | D7/D28・課金・解約まで含む評価 | D28はBQ蓄積28日到達待ち（9/6前後）<br>`../simplememo-api/docs/reports/FUNNEL_EVALUATION_2026-08-20.md` |
| **未実装** | 失敗機能の自動停止とバックログ差し戻し | **Feature Flag待ちではなくなった。**止める先はできたが、指標を見て kill を叩く経路が無い |
| ゲート付き実行 | 判断理由と結果のDecision Ledger | 機能開発の判断はまだ入っていない<br>`docs/obsidian/AUTOPILOT_LOG.md`<br>`growth/experiments/experiments.json`<br>`data/autopilot-runs.json` |
| **未実装** | 本番改善サイクルの完走（機能側） | コンテンツ側は完走。機能側0件 |

### ④ 自動本番デプロイ

総合 **21.4%** ／ 実行 30.0% ／ 関与 70.0% ／ カバー 71.4%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | サイトの本番デプロイ | mainマージ＝Cloudflare Pagesが自動デプロイ<br>`.github/workflows/auto-merge.yml` |
| ゲート付き実行 | バージョン・価格・名称の単一情報源化 | CIがドリフトを落とす。App Store側とは繋がっていない<br>`data/site-constants.json`<br>`scripts/sync_constants.js` |
| 提案のみ | ビルドとTestFlight内部配信 | タグ作成は人。以降はXcode Cloud＋自動アタッチ<br>`../simplememo-ios/docs/release-automation.md` |
| ゲート付き実行 | 申請項目・リリースノート・サブタイトルの投入 | Apple商標スキャン込み。5.2.5リジェクトの恒久対策<br>`../simplememo-ios/scripts/prepare_app_store_version.rb` |
| 人間 | App Review への提出 | submit-v* タグ作成は人。Hard Ruleで実機確認が先<br>`../simplememo-ios/.github/workflows/submit-review.yml` |
| 人間 | 実機での事前確認 | Hard Rule。技術的強制ではなく人間のルール<br>`../simplememo-ios/docs/release-automation.md` |
| 人間 | App Store への公開（審査通過後） | automatic_release がハードコードで false。恒久的に手動<br>`../simplememo-ios/fastlane/Fastfile` |
| ゲート | 証明書・APIキー・Provisioning Profile の期限監視 | 2026-08-22実装。CIが30日前に警告・7日前で落とす。**critical 3件の期限日は未把握**<br>`data/credential-expiry.json` |
| **未実装** | 段階公開への自動昇格 | Hard Ruleの手前 |
| **未実装** | Crash-free率・送信成功率による自動停止 | **[8/22訂正] 「止める手段が無い」は誤りだった。**機構は揃っている。無いのは**見て決める側** |
| 人間 | Remote Feature Flag と緊急Kill Switch | 8/22に両側実装（`/v1/config` に統合・iOS 35テスト）。**kill を叩くのは人間**で、AIが自動で叩く経路は無い。**本番で1回も通していない**<br>`../simplememo-api/src/flags.ts`・`../simplememo-ios/SimpleMemo/FeatureFlagRollout.swift` |
| 提案のみ | 審査項目・商標・プライバシー表示の整合確認 | 商標スキャンのみ実装<br>`../simplememo-ios/scripts/lib/app_metadata.rb` |
| **未実装** | AI・外部サービス停止時の独立した緊急停止経路 | AgentOps側のKill Switch設計と一体。副系を止める手段が無い問題と同根 |
| 提案のみ | ChatOps によるリリース起動 | issue コメントで起動。コメントするのはオーナー<br>`../simplememo-ios/.github/workflows/release-command.yml` |

### ⑧ カスタマーサポート

総合 **12.5%** ／ 実行 33.3% ／ 関与 100.0% ／ カバー 37.5%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| **未実装** | 問い合わせの自動分類 | 問い合わせ基盤自体が未整備。件数も少なく分類器を作る母数が無い |
| **未実装** | 回答・返金・障害案内 | 同上。加えて返金は不可逆で、承認境界の設計が先 |
| **未実装** | App Store レビュー返信 | ASC APIで可能だが未着手。レビュー返信は公開されるので文面の承認境界が先 |
| 提案のみ | FAQとリリース内容の同期 | FAQはある。リリースとの同期は手動<br>`faq.html` |
| **未実装** | CSAT計測 | 計測する接点（問い合わせ・返信）が未整備 |
| **未実装** | 重大案件の有人移管 | ルールが明文化されていない |
| 提案のみ | 問い合わせからIssueと回帰テストを作成 | 手動では実績あり（Watch同期4往復→v4.9.30→回帰テスト化）<br>`../simplememo-ios/docs/reports/watch_sync_診断改修案_2026-07-26.md` |
| ゲート付き実行 | ライフサイクルメール（歓迎・確認・リマインド） | cronで自動送信。DRY_RUN/KILL_SWITCH/DAILY_CAP付き<br>`../simplememo-api/src/lifecycle.ts`<br>`../simplememo-api/src/reminder.ts` |

### ⑨ マネタイズ

総合 **12.5%** ／ 実行 25.0% ／ 関与 75.0% ／ カバー 50.0%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| **未実装** | 価格・プラン・ペイウォールの実験 | 課金は不可逆で既存契約者への影響が読めない。権限表でAIは提案もしない扱い |
| 提案のみ | オンボーディング改善（課金導線） | データ起点の再設計。実施は人の判断<br>`../simplememo-ios/docs/reports/ONBOARDING_REDESIGN_2026-08-06.md` |
| 提案のみ | プレミアム機能の設計判断 | Obsidianのみモードをプレミアム限定にする判断はオーナー<br>`../simplememo-ios/docs/obsidian-only-mode-design.md` |
| **未実装** | 解約理由分析 | 解約理由を取る導線が無い |
| **未実装** | 課金失敗の回復 | StoreKit側の失敗イベントを受ける経路が未実装 |
| **未実装** | 返金・不正課金・チャージバック対応 | 金銭が動く不可逆な操作。承認境界の設計が先 |
| ゲート付き実行 | 短期CVRよりLTVと信頼を守る制約 | VISION §0「AIを前面に出さない」・§9「所有しない」が実質この制約。§13の6問がゲート<br>`../simplememo-ios/docs/VISION.md` |
| 人間 | 価格の変更 | AIは提案もしない（不可逆・既存契約者への影響が読めない）<br>`data/authority-matrix.json` |

### ⑦ 法人経営

総合 **0.0%** ／ 実行 0.0% ／ 関与 50.0% ／ カバー 15.4%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| **未実装** | 仕訳・請求・領収書・銀行・カード・月次締めの統合 | 3リポジトリに証跡ゼロ |
| **未実装** | 税務・給与・社会保険・法定期限の管理 | 3リポジトリに証跡ゼロ |
| **未実装** | 定型／非定型契約の分類 | 3リポジトリに証跡ゼロ |
| **未実装** | 責任上限・知財・個人情報・準拠法の条項検査 | 3リポジトリに証跡ゼロ |
| **未実装** | 取引先・送金先・利用サービスの許可リスト | 3リポジトリに証跡ゼロ |
| **未実装** | 支出上限と重要支出の二者承認 | 3リポジトリに証跡ゼロ |
| **未実装** | 契約・請求・納品・支払いの照合 | 3リポジトリに証跡ゼロ |
| **未実装** | AI事業者のDPA・データ利用・SLA・撤退計画の審査 | 3リポジトリに証跡ゼロ |
| **未実装** | 董事会・株主・規制・契約記録の保存 | 3リポジトリに証跡ゼロ |
| **未実装** | 物理業務発注後の写真・受領・品質確認 | 3リポジトリに証跡ゼロ |
| **未実装** | 倫理・評判・長期影響の独立監査 | 3リポジトリに証跡ゼロ |
| 提案のみ | エージェントごとの権限・認証情報・失効手順 | 権限表として一部定義。認証情報の失効手順は無い<br>`data/authority-matrix.json` |
| 人間 | 法務・税務・労務・事故時の専門家エスカレーション | 方針のみ。手順・連絡先・停止手段は未整備<br>`data/authority-matrix.json` |

### ⑬ アナログ領域

総合 **0.0%** ／ 実行 0.0% ／ 関与 12.5% ／ カバー 61.5%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| **未実装** | イベント: 候補選定・見積比較・発注・リード集計 | AIが担える設計だが未着手 |
| 人間 | イベント: 現地設営・接客・実施 | 物理領域。人間が担う<br>`data/authority-matrix.json` |
| **未実装** | 人事: 募集・候補抽出・日程調整・書類作成 | 未着手 |
| 人間 | 人事: 採用・解雇・評価・健康情報の判断 | 人間が担う<br>`data/authority-matrix.json` |
| **未実装** | 公的資金: 制度探索・期限管理・申請書下書き | 未着手 |
| 人間 | 公的資金: 表明・提出・面談・法的責任 | 人間が担う<br>`data/authority-matrix.json` |
| **未実装** | 契約: 定型契約・条項比較・リスク抽出 | 未着手 |
| 人間 | 契約: 非定型・高額・海外・知財の承認 | 人間が担う<br>`data/authority-matrix.json` |
| 提案のみ | R&D: 調査・仮説・プロトタイプ・実験 | 本セッション自体がその実例（調査→実装→検証） |
| 人間 | R&D: 安全性・知財・投資継続の判断 | 人間が担う<br>`data/authority-matrix.json` |
| **未実装** | 営業: リード選定・メール・提案書 | 未着手 |
| 人間 | 営業: 交渉・信頼形成・重要契約 | 人間が担う<br>`data/authority-matrix.json` |
| 人間 | 危機対応: 個人情報事故・法的請求・重大障害・炎上 | 自動停止して経営者へ移管する方針。手順は未整備<br>`data/authority-matrix.json` |

---

## 3. この測り方の限界（先に書く）

1. **タスク数の重み付けが粗い（全タスクが等価に数えられる）**
2. **タスク粒度が領域間で揃っていない（法人経営は粗く、マーケは細かい）**
3. **開発領域の変更行比率98.8%に相当する客観指標が他領域には無い**

とくに1が効く。**開発領域には変更行という別の物差しがあり、そちらでは AI 98.8%**
（2026-08-11〜08-22・231,315行中228,498行・56コミット中55件）。

- 変更行 = **やった仕事の量**のうちAIが書いた割合
- タスク数 = **やるべきことの種類**のうちAIが実行している割合

**どちらも正しく、測っているものが違う。**プレスリリースに出すなら**両方**を出す。

---

## 4. 次に何を解くか

→ **`docs/autopilot-roadmap.md`** に依存関係と順序をまとめた。
