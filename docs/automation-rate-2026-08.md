# 全領域の自動化率 — 実測

> **測定日: 2026-08-22 / 174タスク / 13領域**
> 台帳: `data/automation-coverage.json` ／ 集計: `node scripts/automation-rate.mjs`
> ロードマップ: `autopilot-roadmap.md`
> **分類は3リポジトリの実装を1件ずつ当てて決めた。**証跡の実在はCIが確認している。

---

## 0. 全体

| 指標 | 値 | 分母 |
|---|---:|---|
| **総合自動化率** | **45.9%** | 定義タスク 172（未実装を含む・**最も厳しい**） |
| AI実行率 | 60.3% | 実施中タスク 131（未実装を除く） |
| AI関与率 | 85.5% | 同上（提案・下書きまで含める・**最も甘い**） |
| カバー率 | 76.2% | そもそも誰かがやっているタスクの割合 |

内訳: 自律 6 / ゲート付き実行 73 / 提案 33 / 人間 19 / **未実装 41** / 意図的にやらない 2

**4つを必ず並べて出す。**分母を1つに決めると必ず都合のよい数字になる。
**総合自動化率とカバー率を隠してAI関与率だけ出すのが、ここで一番やってはいけないこと。**

### 読み方

- **AI関与率 85.5%** — 「誰かがやっているタスクの8割強にAIが関わっている」。**この数字だけ見ると誤解する**
- **総合自動化率 45.9%** — 「あるべきタスクのうちAIが実行しているのは4割半」。**これが現在地**
- **カバー率 76.2%** — 4分の1弱は**誰もやっていない**。自動化以前に未着手

### 2026-08-22 の実装で動いた分

37.2% → **45.9%**（AI実行タスク 64 → 79）。16項目を実装した。

前半9件（障害演習・タスク単位の予算・モデルルーター・実験基盤の対照群・データ品質・
取引先の許可リスト・シグナル統合台帳・公開面の事実検査）と、
後半7件（性質テスト・モデル評価セット・有人移管・SBOM／秘密情報・
Circuit Breaker・Dead Letter・第三者SDK送信監査）。

**分類を書き換えたのではなく、動くものを足した。**証跡ファイルを指せないタスクを
AI実行側に数えることはCIが禁止しているので、順序は常に実装 → 台帳になる。

### この先の天井

```
  現在                        79 / 172 = 45.9%
  未実装 41 件を全部埋めても            →  69.8%
  提案どまり 33 件も実行へ上げたら        →  89.0%  ← **天井**
```

**89.0% が天井。**人間専任19件（実機での事前確認・App Store公開・価格変更・
危機対応・アナログ領域の6件など）を人間に残す限り、AI実行に回せるのは最大153件。
**90%超を数字として出すには、人間専任のどれかをAIに渡すしかない。**

---

## 1. 領域別（総合自動化率の高い順）

| 領域 | 総合 | 実行 | 関与 | カバー | 自律/ゲート/提案/人間/未実装 |
|---|---:|---:|---:|---:|---|
| ⑤ AI予算・トークン管理 | **66.7%** | 76.9% | 92.3% | 86.7% | 0/10/2/1/2 |
| ⑩ AgentOps・ガバナンス | **66.7%** | 80.0% | 100.0% | 83.3% | 0/8/2/0/2 |
| ⑫ 事業継続性 | **66.7%** | 75.0% | 100.0% | 88.9% | 0/6/2/0/1 |
| ② バグ修正 | **64.7%** | 68.8% | 93.8% | 94.1% | 1/10/4/1/1 |
| ⑪ データ・プライバシー | **60.0%** | 66.7% | 88.9% | 90.0% | 0/6/2/1/1 |
| ③ 自律型マーケティング | **57.7%** | 75.0% | 90.0% | 76.9% | 2/13/3/2/6 |
| ① 次期機能開発 | **57.1%** | 61.5% | 100.0% | 92.9% | 2/6/5/0/1 |
| ④ 自動本番デプロイ | **42.9%** | 46.2% | 69.2% | 92.9% | 1/5/3/4/1 |
| ⑧ カスタマーサポート | **37.5%** | 75.0% | 100.0% | 50.0% | 0/3/1/0/4 |
| ⑥ アプリ運営意思決定 | **30.8%** | 50.0% | 87.5% | 61.5% | 0/4/3/1/5 |
| ⑨ マネタイズ | **12.5%** | 25.0% | 75.0% | 50.0% | 0/1/2/1/4 |
| ⑦ 法人経営 | **7.7%** | 20.0% | 80.0% | 38.5% | 0/1/3/1/8 |
| ⑬ アナログ領域 | **0.0%** | 0.0% | 12.5% | 61.5% | 0/0/1/7/5 |

### この表から読めること

1. **⑫事業継続性と⑩AgentOpsが先頭。**冗長化・自己修復・障害演習・Circuit Breaker・
   Dead Letter が揃った領域。**運用が止まらないための機構は、いちばん自動化しやすい**
   — 判断が要らず、正解が決定論的だから。
2. **⑦法人経営は依然として最下位級。**13タスク中8が未実装で、
   経理・税務・労務・契約審査は証跡ゼロ。**ここは実装の問題ではなく、
   証跡の形をオーナーが決めるところから。**
3. **⑬アナログ領域の総合0.0%は正常。**7タスクが `human_only` で、これは失敗ではなく**設計**。
4. **AI関与率は多くの領域で90%超。**「AIが関わっていない領域はほぼ無い」が
   「AIが実行まで持っている領域は少ない」。

---

## 2. タスク単位（全174件）

`node scripts/automation-rate.mjs --area <領域名の一部>` で同じものが出る。

### ⑤ AI予算・トークン管理

総合 **66.7%** ／ 実行 76.9% ／ 関与 92.3% ／ カバー 86.7%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | 実費の記録（月次台帳） | 2026-08-22実装<br>`data/autopilot-cost.json`<br>`scripts/autopilot-budget.mjs` |
| ゲート付き実行 | 実費の抽出（実行ログから） | total_cost_usd を抽出しサマリと通知へ<br>`.github/workflows/obsidian-autopilot.yml` |
| ゲート付き実行 | 上限超過での自己停止 | 予算ゲートが主系runを止める。副系は止められない<br>`.github/workflows/obsidian-autopilot.yml` |
| 人間 | 月次上限の決定 | 現在 placeholder $40。実測由来ではない<br>`data/authority-matrix.json` |
| ゲート付き実行 | 1記事あたり単価の算出 | usd_per_shipped。課金者あたりは無い<br>`scripts/autopilot-budget.mjs` |
| ゲート付き実行 | タスク単位の予算 | 2026-08-22実装。article/repair/analysis/pr/qa_triage の5種別に月次枠。**合計が月次上限を超えるとCIが落ちる**（超えたら枠は装飾）。種別の枠切れでは主系全体を止めない — 記事の枠切れが修理まで巻き込むため。**枠も暫定**（月次上限が placeholder なので、そこから割った枠も placeholder）<br>`data/autopilot-cost.json`<br>`scripts/autopilot-budget.mjs`<br>`.github/workflows/obsidian-autopilot.yml` |
| ゲート付き実行 | モデル別・再試行別の内訳 | 2026-08-22実装。実行ログの modelUsage から記録。**費用の按分はログに無いので回数しか言えない**<br>`data/autopilot-cost.json`<br>`scripts/autopilot-budget.mjs` |
| ゲート付き実行 | 品質・速度・価格に応じたモデルルーター | 2026-08-22実装。種別→モデルを台帳化し、ワークフローが --resolve で引く。**引かれない表は装飾**なので、ワークフローが実際に呼んでいることをCIが見る。**不可逆なタスク（対外配信）を最安ティアに落とすことを禁止**（節約額より失う額が大きい）<br>`data/model-routing.json`<br>`scripts/check-model-routing.mjs`<br>`.github/workflows/obsidian-autopilot.yml` |
| 提案のみ | 小型→大型→人間への段階的移管 | QA分類のみ実装（2モデル→不一致なら人間）<br>`../simplememo-ios/scripts/qa/ai_triage.sh` |
| **未実装** | Prompt Cache・結果キャッシュ・コンテキスト圧縮 | 実費が月$25前後の見込みで、最適化の効果より実装コストが上回る段階 |
| ゲート付き実行 | 無限ループ・重複実行の防止 | --max-turns 250・当日ブランチ占有・冪等性チェック<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md` |
| ゲート付き実行 | 異常消費の検知 | 2026-08-22実装。絶対額ではなく直近中央値との比。実績5件未満では『判定していない』と言う<br>`scripts/autopilot-budget.mjs`<br>`data/autopilot-cost.json` |
| 提案のみ | モデル障害・レート制限時のフォールバック | QA分類は2モデル構成。autopilot 側も 2026-08-22 に fallback を台帳へ定義し、resolve が縮退先を返すようにした。**ただし使えないモデルを検知して渡す経路がまだ無い**ので、実行者は提案のまま<br>`../simplememo-ios/scripts/qa/ai_triage.sh` |
| ゲート付き実行 | 新モデル導入前の固定評価セット | 2026-08-22実装。失敗分類の6ケースを固定し、合格ライン83%＋**「分からない」と答えられること2件を必須通過**にした。合格条件は決定論（ラベルの照合のみ）— AIにAIを採点させると採点側を替えた時点で履歴が無効になるため。**評価はまだ一度も走らせていない**ので policy.enforce は false（true にすると現行3モデルが未評価で落ちる）<br>`data/model-eval-set.json`<br>`scripts/check-model-eval.mjs`<br>`data/model-routing.json` |
| **未実装** | 副系CCRの実費観測 | スケジュール起動セッションのログが外部から読めない。構造的に不可<br>`data/autopilot-cost.json` |

### ⑩ AgentOps・ガバナンス

総合 **66.7%** ／ 実行 80.0% ／ 関与 100.0% ／ カバー 83.3%

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
| ゲート付き実行 | 認証切れ・モデル障害・API障害の演習 | 2026-08-22実装。判定に4つの故障軸（資格情報の拒否・モデル全滅/縮退・GitHub API到達不能・egress遮断）を足し、26シナリオで固定。**「秘密鍵が無い」と「拒否された」を別コードにした** — 混ぜると期限切れが毎日「設計どおりのスキップ」として黙殺される。**本番を落とす本物の演習ではない**（判定の論理だけ）<br>`scripts/autopilot-gate.mjs`<br>`scripts/autopilot-drill.mjs` |

### ⑫ 事業継続性

総合 **66.7%** ／ 実行 75.0% ／ 関与 100.0% ／ カバー 88.9%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | 実行経路の二重化（主系・副系） | 主系0/3・副系10/10。冗長化が実際に効いた<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md`<br>`data/autopilot-runs.json` |
| ゲート付き実行 | 冪等性 | 当日ブランチ占有・run_id冪等・messageId冪等・WatchRequestLedger<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md`<br>`scripts/autopilot-budget.mjs` |
| ゲート付き実行 | 再試行 | 09:20の再試行経路・Resend 429の単発リトライ<br>`.github/workflows/obsidian-autopilot.yml`<br>`../simplememo-api/src/resend.ts` |
| ゲート付き実行 | Circuit Breaker | 2026-08-22実装（simplememo-api・16テスト）。Resendはベンダー台帳で**代替が無い critical**。設計の芯は「開く条件」ではなく**「4xxでは開かない」**こと — 宛先不正やドメイン未認証で開くと1件の設定ミスが全ユーザーの送信を止める。KVが読めないときは閉じている扱い（**ブレーカー自身を単一障害点にしない**）。**本番でまだ1回も開いていない**<br>`../simplememo-api/src/circuit-breaker.ts`<br>`../simplememo-api/src/resend.ts`<br>`../simplememo-api/test/circuit-breaker.test.ts` |
| ゲート付き実行 | Dead Letter Queue | 2026-08-22実装（simplememo-api）。**本文も平文の宛先も保存しない** — 再送のために本文を貯めると、保持期間の議論をやり直さずに新しい個人データストアを作ることになる。テンプレート由来は再送できるが、**メモ中継は再送できない**（落ちた事実だけ残す）。種別が不明なときは再送しない側へ倒す。保持35日・剪定つき<br>`../simplememo-api/src/dlq.ts`<br>`../simplememo-api/migrations/0018_email_dead_letters.sql`<br>`../simplememo-api/data/data-retention.json` |
| **未実装** | バックアップ・復元 | 本番データはCloudflare D1とApp Store側にあり、復元手順が未整備。**2026-08-22にベンダー台帳で代替の有無を明示** — Apple・Resend・レジストラの3社に代替が無い |
| 提案のみ | 手動復旧手順 | 文書はある<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md`<br>`../simplememo-api/DEPLOYMENT.md` |
| ゲート付き実行 | 障害訓練 | 2026-08-22実装（切替ドリル）。認証切れ・モデル障害・API障害の演習はまだ<br>`scripts/autopilot-drill.mjs` |
| 提案のみ | 外部サービス停止時の縮退運転 | autopilotは二重化。GitHub/Apple/Cloudflareは単一障害点<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md` |

### ② バグ修正

総合 **64.7%** ／ 実行 68.8% ／ 関与 93.8% ／ カバー 94.1%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | 監視カバレッジの棚卸し | 2026-08-22実装。13系統を棚卸しし、**検知器が実在するか**と**実際に起きた障害種別に検知経路があるか**をCIが確かめる。『全部見ています』ではなく『何が空いているか』を言うための台帳<br>`data/monitoring-coverage.json`<br>`scripts/check-monitoring.mjs` |
| 提案のみ | 統合監視（Crash/API/Watch/課金/問い合わせ） | **棚卸しで穴が特定できた。3系統は気づく経路が無い** — Apple Watchアプリ・課金・問い合わせ。クラッシュ率と送信成功率は指標があるが常時監視になっていない（段階公開中だけガードが見る／人が日次メールを読んだとき）。**executor を上げるのは穴が埋まってから**<br>`data/monitoring-coverage.json`<br>`scripts/check-monitoring.mjs` |
| 提案のみ | 問い合わせから再現テストを自動生成 | 手動運用。ただしWatch同期は実績あり<br>`../simplememo-ios/docs/qa/REGRESSION_TEST_TEMPLATE.md` |
| ゲート付き実行 | Unit / UI / 契約テストの実行 | XCTest/XCUITest＋Watchブリッジ契約テスト2コピー＋parity CI<br>`../simplememo-ios/.github/workflows/qa-ios.yml` |
| **未実装** | Visual Regression Test | アプリ側に無い |
| ゲート付き実行 | オフライン・タイムアウト・500・429の決定論再現 | QAStubURLProtocol。低速回線とバックグラウンド復帰は無い<br>`../simplememo-ios/docs/qa/AUTOMATED_QA_ARCHITECTURE.md` |
| 人間 | 実機/シミュレータでの操作・撮影・計測 | macOS必須。Runbook §7「できないこと」の筆頭<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md` |
| 提案のみ | アクセシビリティ・文字切れ・多言語の自動検査 | サイト側のみ。アプリ側は無い<br>`scripts/seo-check.js` |
| 提案のみ | 性能・起動時間の計測 | 定点実測。本番の継続監視ではない<br>`data/benchmark.json` |
| ゲート付き実行 | 依存脆弱性・秘密情報・SBOM・署名検査 | 2026-08-22実装（simplememo-api）。SBOM 259件（**実行時はわずか1件**、残り258は開発時）・integrity欠落0件・秘密情報スキャン。**値は出力しない**（出力に秘密を写したら意味が無い）。**既知脆弱性の照合（npm audit）は意図的に含めない** — 外部DB依存でCIの合否が日替わりになり、やがて無視されるため<br>`../simplememo-api/scripts/check-supply-chain.mjs`<br>`../simplememo-api/data/sbom.json` |
| ゲート付き実行 | Fuzz / Property-based / Mutation Test | 2026-08-22実装。実行判定と予算集計の**不変条件12件**を、種を固定した乱択400ケース／件で検査する。ドリル（26の具体例）が守れない**書かなかった組み合わせ**を踏むのが目的。変異テストで検出力を確認（forceが予算を飛び越える／認証切れが予算の陰に隠れる、をどちらも検出）。**アプリ側のfuzzは未実装**<br>`scripts/property-tests.mjs`<br>`scripts/autopilot-gate.mjs`<br>`scripts/autopilot-budget.mjs` |
| ゲート付き実行 | 失敗の分類（独立2モデル監査） | 2026-08-22実装。割れたら人間に上げる<br>`../simplememo-ios/scripts/qa/ai_triage.sh` |
| ゲート付き実行 | 回帰の合否判定（決定論的） | AIには判定させない設計<br>`../simplememo-ios/docs/qa/AUTOMATED_QA_ARCHITECTURE.md` |
| ゲート付き実行 | セキュリティ監査と修正 | AIが発見しAIが修正。High 1件含む4件<br>`../simplememo-ios/docs/reports/SECURITY_HARDENING_2026-07.md` |
| **自律** | カナリア公開と自動ロールバック | 露出群/対照群を bucketOf で復元して比較し、悪化なら自動で撤回する。**2026-08-22実装。本番でまだ1回も発火していない**（段階公開中のフラグがゼロのため）。実装した≠動いた<br>`../simplememo-api/src/rollout-guard.ts`<br>`../simplememo-api/test/rollout-guard.test.ts` |
| ゲート付き実行 | 誤修正率・再発率・MTTRの計測 | 2026-08-22に検知時刻を投入。検知まで中央値2.1h/最大50.7h、修理まで中央値0.9h。誤修正率・再発率はまだ<br>`data/autopilot-runs.json`<br>`scripts/autopilot-runs.mjs` |
| ゲート付き実行 | 基盤故障の検知と自己修復 | 2026-08-22実装。レーンF<br>`scripts/autopilot-selfheal.mjs` |

### ⑪ データ・プライバシー

総合 **60.0%** ／ 実行 66.7% ／ 関与 88.9% ／ カバー 90.0%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | データ分類（送信可否の allowlist） | CIで強制<br>`../simplememo-ios/scripts/qa/check_analytics_allowlist.py` |
| 提案のみ | 収集同意 | App Analytics共有オプトイン依存 |
| ゲート付き実行 | 保持期間の定義（棚卸しと逸脱検査） | 2026-08-22実装。23ストアを棚卸しし、**ずれたらCIが落ちる**形にした（新テーブルは保持方針を書くまで通らない／保持期間を宣言したのに削除コードが無いと落ちる）<br>`../simplememo-api/data/data-retention.json`<br>`../simplememo-api/test/data-retention.test.ts` |
| ゲート付き実行 | 保持期間の自動削除 | 2026-08-22に app_analytics_events を90日で剪定するようにした（オーナー判断）。棚卸しで見つかった最大の穴がこれ。**23ストア中6つが自動削除つき**になった。**残る10ストアはまだ無期限**（重複送信防止の台帳が中心。email_suppression は意図的に無期限）<br>`../simplememo-api/src/analytics.ts`<br>`../simplememo-api/test/analytics-retention.test.ts`<br>`../simplememo-api/data/data-retention.json` |
| 提案のみ | 削除要求への対応 | APIは実装済み。運用手順は未整備<br>`../simplememo-api/docs/reports/API_PATCH_REQUEST_v2_4_7_account_delete.md` |
| ゲート付き実行 | AIへの送信可否の制御 | redact済み要約のみ。メモ本文fixtureは架空<br>`../simplememo-ios/scripts/qa/build-ai-triage-bundle.sh` |
| ゲート付き実行 | 端末内の暗号化 | AES-GCM-256・Keychain・Data Protection属性<br>`../simplememo-ios/docs/reports/SECURITY_HARDENING_2026-07.md` |
| **未実装** | アクセス履歴 | **前提の棚卸しは2026-08-22に完了**（どこに何があるかは特定済み）。誰がいつ読んだかの記録は未実装 |
| ゲート付き実行 | 第三者SDKのデータ送信監査 | 2026-08-22実装（simplememo-ios）。送信先ホスト4件・第三者SDK5件を棚卸しし、宣言していないホスト・SDKが増えると落ちる。宣言どうしの矛盾（台帳は「トラッキングしない」/ PrivacyInfoがtrue）も見る。**作った初回実行で AppsFlyerLib の記載漏れを自分で検出した。****実際に飛んでいるパケットは見ていない**（実機のプロキシ観測が要る）ので runtime_verified は全部 false<br>`../simplememo-ios/scripts/qa/check_third_party_egress.py`<br>`../simplememo-ios/data/third-party-egress.json`<br>`../simplememo-ios/SimpleMemo/PrivacyInfo.xcprivacy` |
| 人間 | 推論をどこで回すかの決定 | VISION §14 未決定論点。Capture本文は個人情報そのもの<br>`../simplememo-ios/docs/VISION.md` |

### ③ 自律型マーケティング

総合 **57.7%** ／ 実行 75.0% ／ 関与 90.0% ／ カバー 76.9%

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
| ゲート付き実行 | ヒーロー画像の生成 | 2026-08-22実装。1200x630（G1ゲート）をPlaywrightで生成し、**出力の実寸を検証する**（生成できたかではなく出た画像で判定）。文言は data/pr-claims.json から読むので、**主張検査を通っていない見出しの画像は原理的に作れない**。裏の取れていない主張があるときは既定で生成を拒否し、--allow-unsupported を付けた場合だけ DRAFT リボン付きで出る<br>`scripts/generate-pr-hero.mjs`<br>`data/pr-claims.json` |
| 人間 | PR TIMES への配信操作 | 管理画面から手動。APIが無い<br>`data/authority-matrix.json` |
| ゲート付き実行 | キャンペーンパラメータの付与 | CIが強制。49件がpage-level ct=保持<br>`scripts/tag-cta-placements.js`<br>`data/cpp-map.json` |
| **未実装** | App Store CPP（訴求別ページ）の実験 | 34本作成済みだが実験として回っていない<br>`data/cpp-map.json` |
| 提案のみ | SNS投稿（X日本語） | Cowork定期タスクでバッチ運用<br>`admin/brand/docs/cowork-x-engagement-brief.md` |
| 意図的にやらない | SNS投稿（X英語・TikTok） | アカウントBAN／品質未達で運用停止中<br>`README.md` |
| **未実装** | リスティング広告の運用 | 調査レポートのみ。資格情報も無い<br>`../simplememo-ios/docs/reports/APPLE_ADS_AUTOMATION_2026-08-17.md` |
| 意図的にやらない | 広告パフォーマンスの監視と自動調整 | 自社分析が『この予算規模ではやるべきでない』と結論<br>`../simplememo-ios/docs/reports/APPLE_ADS_AUTOMATION_2026-08-17.md` |
| **未実装** | 対照群による増分効果測定 | 未実施 |
| ゲート付き実行 | 紹介・レビュー促進・休眠復帰 | cronで自動送信<br>`../simplememo-api/src/lifecycle.ts`<br>`../simplememo-api/src/nudge.ts` |

### ① 次期機能開発

総合 **57.1%** ／ 実行 61.5% ／ 関与 100.0% ／ カバー 92.9%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| 提案のみ | ビジョン文書の維持（機能追加の必読ゲート） | 3リポジトリのCLAUDE.mdが強制参照。定期改訂の仕組みは無い<br>`../simplememo-ios/docs/VISION.md` |
| ゲート付き実行 | AIが変更してはいけない安全原則の固定 | VISION §9「作らないもの」＋§13の6問。claude.ymlのactions:write非付与<br>`../simplememo-ios/docs/VISION.md`<br>`.github/workflows/seo-check.yml` |
| ゲート付き実行 | 要望・レビュー・問い合わせ・競合情報の重複排除 | 2026-08-22実装。要望・レビュー・問い合わせ・競合・利用実態を1台帳に統合し、dedupe_key で同じ話を1行にする。**声の大きさを「何回転記されたか」で測らないため。**実際「送信の確実性」は問い合わせ・レビュー実測・アンケートの3経路から来ており、台帳を作るまで別々の紙に載っていた。declined は理由が無いとCIが落ちる<br>`data/signal-ledger.json`<br>`scripts/check-signals.mjs` |
| ゲート付き実行 | 期待効果・確信度・工数・リスクによる自動優先順位付け | 2026-08-22実装。**確信度は evidence_strength から機械的に決まり、手で置けない**（主観にすると順位はいくらでも動く）。リスクは点数を下げるのではなく承認を要求する — 掛け算にすると期待効果が大きければ危険な案が1位になる。根拠が弱い候補は「やらない」ではなく「まず測る」に落ちる<br>`data/feature-backlog.json`<br>`scripts/feature-score.mjs`<br>`.github/workflows/seo-check.yml` |
| 提案のみ | ユーザー要望の受領と設計への落とし込み | AIが設計文書まで。採否はオーナー判断<br>`../simplememo-ios/docs/reports/feature_requests_2026-07-31_obsidian_user.md` |
| 提案のみ | 継続率データによる優先度判断 | D7継続2.5〜3.7倍を根拠に優先度決定。決定は人<br>`../simplememo-api/docs/reports/RETENTION_MONETIZATION_COHORT_2026-07-29.md` |
| 提案のみ | PRD・受入条件・UX・多言語の作成 | 都度作成・定型化されていない<br>`../simplememo-ios/docs/obsidian-only-mode-design.md` |
| ゲート付き実行 | Issue→ブランチ→PR→テスト→配信を結ぶ共通実行ID | 2026-08-22実装<br>`data/autopilot-runs.json`<br>`scripts/autopilot-runs.mjs` |
| ゲート付き実行 | 遠隔操作できるFeature Flag | [2026-08-22訂正] 「アプリ本体に無い」は誤りだった。v4.7から WPFlag 15個が /v1/config 経由で遠隔操作できていた。同日、段階公開・キャッシュ期限・取得経路のテストを追加。**④の同名タスクだけ訂正して、この①側を直し漏らしていた**<br>`../simplememo-ios/SimpleMemo/FeatureFlagRollout.swift`<br>`../simplememo-ios/SimpleMemo/FeatureFlags.swift`<br>`../simplememo-api/src/config.ts` |
| ゲート付き実行 | 対照群・最低サンプル数・停止条件を持つ実験基盤 | 2026-08-22実装。open な実験は control.kind（holdout/pre_post/none）・min_sample・stop_conditions が無いとCIが落ちる。**対照群が無いこと自体は禁じていない** — 無いのに書かないことを禁じている。pre_post には confounders を必須にした（書かないと因果を主張しているのと同じ）<br>`growth/experiments/experiments.json`<br>`growth/lib/ledger.mjs`<br>`growth/scripts/check-experiments.mjs` |
| 提案のみ | D7/D28・課金・解約まで含む評価 | D28はBQ蓄積28日到達待ち（9/6前後）<br>`../simplememo-api/docs/reports/FUNNEL_EVALUATION_2026-08-20.md` |
| **自律** | 失敗機能の自動停止とバックログ差し戻し | ガードレール指標が有意かつ実害を伴って悪化したら kill を自律実行する（承認を挟まない＝可逆で安全な方向のため）。**2026-08-22実装。本番でまだ1回も発火していない**（段階公開中のフラグがゼロのため）。実装した≠動いた。バックログ差し戻しは未実装<br>`../simplememo-api/src/rollout-guard.ts`<br>`../simplememo-api/test/rollout-guard.test.ts` |
| **自律** | 判断理由と結果のDecision Ledger | 機能開発の判断も入るようになった（カナリアガードが判定・根拠・実行有無を毎回KVへ記録する）。**2026-08-22実装。本番でまだ1回も発火していない**（段階公開中のフラグがゼロのため）。実装した≠動いた<br>`docs/obsidian/AUTOPILOT_LOG.md`<br>`growth/experiments/experiments.json`<br>`data/autopilot-runs.json`<br>`../simplememo-api/src/rollout-guard.ts`<br>`../simplememo-api/test/rollout-guard.test.ts` |
| **未実装** | 本番改善サイクルの完走（機能側） | コンテンツ側は完走。機能側0件 |

### ④ 自動本番デプロイ

総合 **42.9%** ／ 実行 46.2% ／ 関与 69.2% ／ カバー 92.9%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | サイトの本番デプロイ | mainマージ＝Cloudflare Pagesが自動デプロイ<br>`.github/workflows/auto-merge.yml` |
| ゲート付き実行 | バージョン・価格・名称の単一情報源化 | CIがドリフトを落とす。App Store側とは繋がっていない<br>`data/site-constants.json`<br>`scripts/sync_constants.js` |
| 提案のみ | ビルドとTestFlight内部配信 | タグ作成は人。以降はXcode Cloud＋自動アタッチ<br>`../simplememo-ios/docs/release-automation.md` |
| ゲート付き実行 | 申請項目・リリースノート・サブタイトルの投入 | Apple商標スキャン込み。5.2.5リジェクトの恒久対策<br>`../simplememo-ios/scripts/prepare_app_store_version.rb` |
| 人間 | App Review への提出 | submit-v* タグ作成は人。Hard Ruleで実機確認が先<br>`../simplememo-ios/.github/workflows/submit-review.yml` |
| 人間 | 実機での事前確認 | Hard Rule。技術的強制ではなく人間のルール<br>`../simplememo-ios/docs/release-automation.md` |
| 人間 | App Store への公開（審査通過後） | automatic_release がハードコードで false。恒久的に手動<br>`../simplememo-ios/fastlane/Fastfile` |
| ゲート付き実行 | 証明書・APIキー・Provisioning Profile の期限監視 | 2026-08-22実装。CIが毎PRで検査し30日前に警告・7日前で落とす。TLSは実測するが、発行元が信用集合に無ければ**期限を報告しない**（中間者復号の環境でプロキシの証明書を本番の期限として書かないため）。**critical 3件（証明書・Profile・ドメイン）の期限日はまだ未把握** — 人が調べて埋めるまで、その3件は監視できていない<br>`data/credential-expiry.json`<br>`scripts/check-expiry.mjs`<br>`.github/workflows/seo-check.yml` |
| 提案のみ | 段階公開への自動昇格 | **意図的に提案止まり。**露出を広げる方向は不可逆（広げてから戻しても見た人が見なかったことにはならない）なので人が承認する。/admin/rollout-guard に積まれる<br>`../simplememo-api/src/rollout-guard.ts`<br>`../simplememo-api/test/rollout-guard.test.ts` |
| **自律** | Crash-free率・送信成功率による自動停止 | 起動完走率（launch_incomplete の裏返し＝クラッシュ代理指標）・送信成功率・エディタ→送信到達率の3本で判定。1指標でも割れたら止める。**2026-08-22実装。本番でまだ1回も発火していない**（段階公開中のフラグがゼロのため）。実装した≠動いた<br>`../simplememo-api/src/rollout-guard.ts`<br>`../simplememo-api/test/rollout-guard.test.ts` |
| 人間 | Remote Feature Flag と緊急Kill Switch | [2026-08-22訂正] 前回の「iOS側が入るまで実際には止められない」は誤り — v4.7から /v1/config + REMOTE_FLAGS_JSON で全体キルができていた。同日、不足分（段階公開・キャッシュ期限・取得経路のテスト）を実装し両側が揃った。**human_only なのは kill を叩くのが人間だから** — AIが自動で kill する経路は無い。さらに**本番で kill を1回も通していない**（止まることを確かめていない停止機構は無いのと同じ）<br>`../simplememo-api/src/flags.ts`<br>`../simplememo-api/src/config.ts`<br>`../simplememo-ios/SimpleMemo/FeatureFlagRollout.swift`<br>`../simplememo-ios/SimpleMemoTests/FeatureFlagRolloutTests.swift`<br>`../simplememo-ios/docs/feature-flag-client-spec.md` |
| ゲート付き実行 | 審査項目・商標・プライバシー表示の整合確認 | 2026-08-22に検査を拡張。名前・サブタイトル（5.2.5・商標）に加え、キーワード欄とリリースノート（長さ上限・3.1.2の語）も毎PRで見る。自己テスト20件追加。**キーワードの実値はまだASC内にあり移していない**ので、その分は NOTE として毎回出る<br>`../simplememo-ios/scripts/lib/app_metadata.rb`<br>`../simplememo-ios/.github/workflows/qa-static.yml` |
| **未実装** | AI・外部サービス停止時の独立した緊急停止経路 | AgentOps側のKill Switch設計と一体。副系を止める手段が無い問題と同根 |
| 提案のみ | ChatOps によるリリース起動 | issue コメントで起動。コメントするのはオーナー<br>`../simplememo-ios/.github/workflows/release-command.yml` |

### ⑧ カスタマーサポート

総合 **37.5%** ／ 実行 75.0% ／ 関与 100.0% ／ カバー 50.0%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| **未実装** | 問い合わせの自動分類 | 問い合わせ基盤自体が未整備。件数も少なく分類器を作る母数が無い |
| **未実装** | 回答・返金・障害案内 | 同上。加えて返金は不可逆で、承認境界の設計が先 |
| **未実装** | App Store レビュー返信 | ASC APIで可能だが未着手。レビュー返信は公開されるので文面の承認境界が先 |
| ゲート付き実行 | FAQとリリース内容の同期 | 2026-08-22実装。FAQ・トップ（日英）・llms.txt・運営者情報の**散文**を site-constants / benchmark と突き合わせ、旧アプリ名・古い起動時間・廃止済みトライアル・価格ドリフトで落とす。廃止済みトライアルは景表法・ストア審査上のリスク対応で消したもので、それまで「出現回数0」を確かめていたのは人の目視だった。**リリースノート本文との突き合わせは隣リポジトリのためCI外**<br>`scripts/check-public-facts.mjs`<br>`faq.html`<br>`data/site-constants.json` |
| **未実装** | CSAT計測 | 計測する接点（問い合わせ・返信）が未整備 |
| ゲート付き実行 | 重大案件の有人移管 | 2026-08-22実装。実行判定が返す故障・縮退コード5件と、運転台帳に**実際に現れた** failure_class 4件の全部に規則が要る（規則の無い種別があると落ちる）。危機領域は stop_automation: true を強制。**owner_direct の経路は未整備**で、名前が付いただけであることも台帳に書いてある<br>`data/escalation-rules.json`<br>`scripts/check-escalation.mjs`<br>`data/authority-matrix.json` |
| 提案のみ | 問い合わせからIssueと回帰テストを作成 | 手動では実績あり（Watch同期4往復→v4.9.30→回帰テスト化）<br>`../simplememo-ios/docs/reports/watch_sync_診断改修案_2026-07-26.md` |
| ゲート付き実行 | ライフサイクルメール（歓迎・確認・リマインド） | cronで自動送信。DRY_RUN/KILL_SWITCH/DAILY_CAP付き<br>`../simplememo-api/src/lifecycle.ts`<br>`../simplememo-api/src/reminder.ts` |

### ⑥ アプリ運営意思決定

総合 **30.8%** ／ 実行 50.0% ／ 関与 87.5% ／ カバー 61.5%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | ファネル分析（インストール→初回メモ→継続→課金） | 4回連続の定点評価<br>`../simplememo-api/src/analytics.ts`<br>`../simplememo-api/docs/reports/FUNNEL_EVALUATION_2026-08-20.md` |
| 提案のみ | コホート分析（継続率・課金率） | 都度レポート<br>`../simplememo-api/docs/reports/RETENTION_MONETIZATION_COHORT_2026-07-29.md` |
| 提案のみ | KPI定義と集計SQLのバージョン管理 | —<br>`growth/lib/`<br>`../simplememo-api/docs/analytics-golden.md` |
| ゲート付き実行 | データ不足時に「何もしない」と判断 | ノイズフロア＝期待クリック3未満／28日窓未満でスナップショットを作らない<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md` |
| **未実装** | 売上・課金・返金・広告の照合 | ASC未接続。鍵は既にある<br>`growth/data/appstore/` |
| ゲート付き実行 | 欠損・遅延・重複データの検査 | 2026-08-22実装。**作った直後の初回実行で実データの欠陥を検出した** — 2026-08-09スナップショットの /vs/ticktick/ が2行あり、クリックが二重に乗りうる状態だった（URL正規化で衝突した行を畳んでいなかった）。取り込み側に mergeByKey を入れて恒久対策。重複と内部不整合は落とし、日付の欠けと鮮度は報告のみ<br>`growth/scripts/check-data-quality.mjs`<br>`growth/scripts/ingest-gsc.mjs` |
| **未実装** | CAC・LTV・回収期間・粗利の統合 | 広告が未実装でCACが存在せず、ASC売上も未接続 |
| 提案のみ | 季節性・外部要因の分離 | 系列台帳が下地<br>`growth/data/annotations.json` |
| **未実装** | 対照群に対する増分効果の評価 | 母数が小さく（App Storeクリック2.1件/日）、対照群を割ると両群とも検出力不足 |
| **未実装** | 予算変更幅・損失上限・撤回条件 | 動かす予算そのものが無い（広告未実装） |
| ゲート付き実行 | 可逆／不可逆の承認レベル分け | 2026-08-22実装。13領域中9が承認制<br>`data/authority-matrix.json`<br>`scripts/check-authority.mjs` |
| 人間 | 月次予算の決定 | — |
| **未実装** | 資金繰りシナリオ（悲観・標準・楽観） | 法人経営領域と一体。証跡の形から未着手 |

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

総合 **7.7%** ／ 実行 20.0% ／ 関与 80.0% ／ カバー 38.5%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| **未実装** | 仕訳・請求・領収書・銀行・カード・月次締めの統合 | 3リポジトリに証跡ゼロ |
| **未実装** | 税務・給与・社会保険・法定期限の管理 | 3リポジトリに証跡ゼロ |
| 提案のみ | 定型／非定型契約の分類 | ベンダー台帳で「どの事業者とどんな関係があるか」までは機械が持つようになった。**契約書そのものの分類は未着手**（契約書がリポジトリに無い）<br>`data/vendor-register.json`<br>`scripts/check-vendors.mjs` |
| **未実装** | 責任上限・知財・個人情報・準拠法の条項検査 | 3リポジトリに証跡ゼロ |
| ゲート付き実行 | 取引先・送金先・利用サービスの許可リスト | 2026-08-22実装。10社すべてに money_flow / payment_method / approved_by / spend_cap_ref を持たせ、金銭が動く相手は human 承認と上限の参照先が無いとCIが落ちる。**ここに無い相手への支払いは許可されていない**という形。上限が設定されているのは AI実費と広報配信の2つだけで、残り8社は "unset"（理由つき）<br>`data/vendor-register.json`<br>`scripts/check-vendors.mjs` |
| **未実装** | 支出上限と重要支出の二者承認 | 3リポジトリに証跡ゼロ |
| **未実装** | 契約・請求・納品・支払いの照合 | 3リポジトリに証跡ゼロ |
| 提案のみ | AI事業者のDPA・データ利用・SLA・撤退計画の審査 | 2026-08-22にベンダー台帳を作成（10社）。何を渡していて・止まると何が起きて・代替があるかを機械検査する。**DPAの確認そのものは人の作業で、いま6社が未確認**。確認したら enforce_unreviewed を true にすると CI が守る<br>`data/vendor-register.json`<br>`scripts/check-vendors.mjs` |
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
