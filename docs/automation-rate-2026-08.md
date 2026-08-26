# 全領域の自動化率 — 実測

> **測定日: 2026-08-22 / 175タスク / 13領域**
> 台帳: `data/automation-coverage.json` ／ 集計: `node scripts/automation-rate.mjs`
> ロードマップ: `autopilot-roadmap.md`
> **分類は3リポジトリの実装を1件ずつ当てて決めた。**証跡の実在はCIが確認している。
>
> ⚠ **これは 2026-08-22 時点の断面。**以後の実装で数字は動いている
> （2026-08-26 時点: 194タスク / 総合自動化率 61.3%）。
> **この表の数字を現在値として引用しない。**現在値は `node scripts/automation-rate.mjs`、
> 公開ページ `/autopilot/` はその値と一致することを CI が確認している
> （`scripts/check-autopilot-page.mjs`）。以下は当時の記録として残す。

---

## 0. 全体

| 指標 | 値 | 分母 |
|---|---:|---|
| **総合自動化率** | **58.6%** | 定義タスク 186（未実装を含む・**最も厳しい**） |
| AI実行率 | 70.2% | 実施中タスク 151（未実装を除く） |
| AI関与率 | 87.4% | 同上（提案・下書きまで含める・**最も甘い**） |
| カバー率 | 87.3% | そもそも誰かがやっているタスクの割合 |

内訳: 自律 8 / ゲート付き実行 98 / 提案 26 / 人間 19 / **未実装 22** / 意図的にやらない 3

**4つを必ず並べて出す。**分母を1つに決めると必ず都合のよい数字になる。
**総合自動化率とカバー率を隠してAI関与率だけ出すのが、ここで一番やってはいけないこと。**

### 読み方

- **総合自動化率 58.6%** — 「あるべきタスクの6割弱をAIが実行している」。**これが現在地**
- **カバー率 87.3%** — 誰もやっていないタスクは**22件**（当初68件）
- AI関与率 87.4% / AI実行率 70.2%

### 2026-08-22 の実装で動いた分

**AI実行 45 → 106件**（未実装 68 → 22 / カバー率 60.0% → 87.3%）。
1日で **44項目**を実装した。

その後 main と合流して**分母が 172 → 173 に増えている**（向こうで棚卸しが
1件増えたため）。率にすると **27.6% → 61.3%** だが、
**始点と終点で分母が違う**ので、動いたぶんは件数で読むほうが正しい。

### この先の天井

> **⚠ 以下は 2026-08-22 時点の分母（173）での計算。**現在値は §「2026-08-25 の棚卸し追加」を見ること。

```
  現在                       106 / 173 = 61.3%
  未実装 22 件を全部埋めても            →  74.0%
  提案どまり 26 件も実行へ上げたら        →  89.0%  ← **天井**
  95.3% に必要                          165 件（あと 59 件）
```

**89.0% が天井。**人間専任19件を人間に残す限り、AI実行に回せるのは最大154件。
**90%超を数字として出すには、人間専任のどれかをAIに渡すしかない。**


残る未実装22件のうち、**手を動かして埋まるのは5件程度**:
広告2件（資格情報が無く、かつ自社分析が「この予算規模ではやるべきでない」）／
構造的に不可能2件（副系のログは外部から読めない）／macOS必須1件／
母数不足2件／実顧客の返信が要る2件／物理・銀行データが要る3件／
本番で1回回すのが要る1件／iOS側の変更が要る1件 は、**いま埋められない。**

---

## 1. 領域別（総合自動化率の高い順）

| 領域 | 総合 | 実行 | 関与 | カバー | 自律/ゲート/提案/人間/未実装 |
|---|---:|---:|---:|---:|---|
| ⑫ 事業継続性 | **100.0%** | 100.0% | 100.0% | 100.0% | 0/9/0/0/0 |
| ⑩ AgentOps・ガバナンス | **91.7%** | 100.0% | 100.0% | 91.7% | 0/11/0/0/1 |
| ⑤ AI予算・トークン管理 | **86.7%** | 92.9% | 92.9% | 93.3% | 0/13/0/1/1 |
| ② バグ修正 | **82.4%** | 87.5% | 93.8% | 94.1% | 1/13/1/1/1 |
| ⑪ データ・プライバシー | **70.0%** | 70.0% | 90.0% | 100.0% | 0/7/2/1/0 |
| ⑥ アプリ運営意思決定 | **69.2%** | 75.0% | 91.7% | 92.3% | 0/9/2/1/1 |
| ① 次期機能開発 | **66.7%** | 71.4% | 100.0% | 93.3% | 3/7/4/0/1 |
| ③ 自律型マーケティング | **65.4%** | 81.0% | 90.5% | 80.8% | 3/14/2/2/5 |
| ④ 自動本番デプロイ | **50.0%** | 50.0% | 71.4% | 100.0% | 1/6/3/4/0 |
| ⑧ カスタマーサポート | **50.0%** | 66.7% | 100.0% | 75.0% | 0/4/2/0/2 |
| ⑦ 法人経営 | **30.8%** | 40.0% | 90.0% | 76.9% | 0/4/5/1/3 |
| ⑨ マネタイズ | **12.5%** | 20.0% | 80.0% | 62.5% | 0/1/3/1/3 |
| ⑬ アナログ領域 | **0.0%** | 0.0% | 22.2% | 69.2% | 0/0/2/7/4 |

---

## 2. タスク単位（全176件）

`node scripts/automation-rate.mjs --area <領域名の一部>` で同じものが出る。

### ⑫ 事業継続性

総合 **100.0%** ／ 実行 100.0% ／ 関与 100.0% ／ カバー 100.0%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | 実行経路の二重化（主系・副系） | 主系1/6・副系10/10。冗長化が実際に効いた（**初出荷は2026-08-23**・PR #538。それまでの11回と、その後の08-24・08-25 は不発。1回出たことと任せられることは別）<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md`<br>`data/autopilot-runs.json` |
| ゲート付き実行 | 冪等性 | 当日ブランチ占有・run_id冪等・messageId冪等・WatchRequestLedger<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md`<br>`scripts/autopilot-budget.mjs` |
| ゲート付き実行 | 再試行 | 09:20の再試行経路・Resend 429の単発リトライ<br>`.github/workflows/obsidian-autopilot.yml`<br>`../simplememo-api/src/resend.ts` |
| ゲート付き実行 | Circuit Breaker | 2026-08-22実装（simplememo-api・16テスト）。Resendはベンダー台帳で**代替が無い critical**。設計の芯は「開く条件」ではなく**「4xxでは開かない」**こと — 宛先不正やドメイン未認証で開くと1件の設定ミスが全ユーザーの送信を止める。KVが読めないときは閉じている扱い（**ブレーカー自身を単一障害点にしない**）。**本番でまだ1回も開いていない**<br>`../simplememo-api/src/circuit-breaker.ts`<br>`../simplememo-api/src/resend.ts`<br>`../simplememo-api/test/circuit-breaker.test.ts` |
| ゲート付き実行 | Dead Letter Queue | 2026-08-22実装（simplememo-api）。**本文も平文の宛先も保存しない** — 再送のために本文を貯めると、保持期間の議論をやり直さずに新しい個人データストアを作ることになる。テンプレート由来は再送できるが、**メモ中継は再送できない**（落ちた事実だけ残す）。種別が不明なときは再送しない側へ倒す。保持35日・剪定つき<br>`../simplememo-api/src/dlq.ts`<br>`../simplememo-api/migrations/0018_email_dead_letters.sql`<br>`../simplememo-api/data/data-retention.json` |
| ゲート付き実行 | バックアップ・復元 | 2026-08-22実装（simplememo-api）。**対象を手で並べない** — 並べると新しいテーブルが黙って対象外になり、症状は復元しようとした日にしか出ない。対象は保持台帳の d1_table から取るので、**保持方針を書いた時点で自動的にバックアップ対象になる。**1つでも失敗したら失敗として終わる（部分的なバックアップを成功と呼ばない）。**通しの復元演習は未実施**で、RESTORE.md の冒頭にそう書いてある<br>`../simplememo-api/scripts/backup-d1.mjs`<br>`../simplememo-api/docs/RESTORE.md`<br>`../simplememo-api/data/data-retention.json` |
| ゲート付き実行 | 手動復旧手順 | 2026-08-22。**手順書が証明に変わった。**それまで RESTORE.md の冒頭には「通しで試したことは一度も無い」と書いてあった。migrations から空のDBを作り、14テーブルを取得→JSON→DELETE→INSERT で往復させ、行が欠けず値が変わらないこと・**部分的に残った行と混ざらないこと**を毎回CIで確かめる。演習と本番の復元は**同じ関数（restoreStatements）を通る** — 別々に書くと、演習は通るのに本番だけ壊れている状態が作れる。`--selftest` が壊れた復元を落とせることも先に確かめる（落ちない検査は検査ではない）。残る弱さ: **本番D1への接続そのものは演習では確かめられない**（wrangler と資格情報が要る）。「どこまで戻すか」の判断基準は未決のまま<br>`../simplememo-api/scripts/restore-drill.mjs`<br>`../simplememo-api/scripts/backup-d1.mjs`<br>`../simplememo-api/docs/RESTORE.md`<br>`../simplememo-api/test/restore.test.ts`<br>`../simplememo-api/.github/workflows/ci.yml`<br>`../simplememo-api/data/data-retention.json` |
| ゲート付き実行 | 障害訓練 | 2026-08-22実装（切替ドリル）。認証切れ・モデル障害・API障害の演習はまだ<br>`scripts/autopilot-drill.mjs` |
| ゲート付き実行 | 外部サービス停止時の縮退運転 | 2026-08-22。台帳の「代替がある」を**実際に動かして確かめる**ようにした。6つの実験（API到達不能で走らない / 副系の実在 / モデル縮退と全滅 / egress縮退 / 遮断器と死信 / 端末Outbox）を判定関数とファイルの実在で毎回通す。**代替と縮退を分けて数える** — 混ぜると resilience を過大に見積もる。Resendが落ちてもメールは送れない（代替なし）が、失われず後で戻せる（縮退あり）。この作業で台帳の4件を代替から降格した（回避策・停止・欠測は代替ではない）。現状: 代替2 / 縮退のみ2 / 単一障害点6。**単一障害点では落とさない**（分かっていることは壊れていることではない）。落とすのは代替を名乗って確かめられないときと、どの事業者も使っていない実験があるとき。残る弱さ: **実際にその事業者を落として試したことは無い。**確かめているのはこちら側の受け方だけ<br>`scripts/check-degradation.mjs`<br>`data/vendor-register.json`<br>`scripts/autopilot-gate.mjs`<br>`.github/workflows/seo-check.yml`<br>`../simplememo-api/src/circuit-breaker.ts`<br>`../simplememo-ios/SimpleMemo/OutboxManager.swift` |

### ⑩ AgentOps・ガバナンス

総合 **91.7%** ／ 実行 100.0% ／ 関与 100.0% ／ カバー 91.7%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | 実行の完全記録（主系） | Actionsのrunログは全部読める<br>`.github/workflows/obsidian-autopilot.yml` |
| **未実装** | 実行の完全記録（副系） | スケジュール起動セッションのログが外部から読めない。構造的に不可<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md` |
| ゲート付き実行 | 誰が何を変更したかの監査ログ | 経路・結果・介入は機械可読。判断の根拠はまだ散文<br>`data/autopilot-runs.json` |
| ゲート付き実行 | 最小権限（AIに与えない権限の明文化） | actions:write 非付与。CIが実際に検出する<br>`../simplememo-ios/.github/workflows/claude.yml`<br>`scripts/check-authority.mjs` |
| ゲート付き実行 | Prompt Injection・Tool Poisoning対策 | 2026-08-22実装。外部文字列が入る口6件を台帳にし、口ごとに緩和策と**残存リスク**を必須にした（残存リスクが空＝考えていない、として落とす）。ワークフローの run: に ${{ github.event.* }} が直接埋まっていないかを走査する（env: 経由は安全なので除外）。自己検証で、脆弱なワークフローを差し込むと検出し、env: 経由では誤検出しないことを確認した。残る弱さ: **検査できるのは口の棚卸しとシェル注入だけ**で、モデルが読んだ本文に従ってしまう経路そのものは検査していない<br>`data/injection-surface.json`<br>`scripts/check-injection-surface.mjs`<br>`.github/workflows/seo-check.yml`<br>`../simplememo-ios/.github/workflows/release-command.yml` |
| ゲート付き実行 | AIへの送信内容のredact | PII無し・サイズ上限つき要約のみ<br>`../simplememo-ios/scripts/qa/build-ai-triage-bundle.sh` |
| ゲート付き実行 | エージェント別 Kill Switch | 2026-08-22実装。経路6件（主系・副系2・代走・監査・ASC）を個別に止められる。実行判定が AGENT_STOPPED を返し、**全体停止は常にこれより強い**（両方立っているとき経路側が先に出たら落ちる）。主系ワークフローも全体と agents.actions の両方を見る。止めるのはAIができる（`--contain` / `--trip`、理由は escalation-rules の trigger に限定）が、**解除の関数はスクリプトに存在せず、追加すると検査が落ちる。**修理上限に達した経路は着手前に落ちる（--contain --dry-run）。残る弱さ: **本番で1回も止めていない**（止まることを確かめていない停止機構は、無いのと同じに近い）<br>`.github/workflows/obsidian-autopilot.yml`<br>`data/emergency-stop.json`<br>`scripts/check-emergency-stop.mjs`<br>`scripts/autopilot-gate.mjs`<br>`scripts/autopilot-selfheal.mjs`<br>`scripts/autopilot-drill.mjs` |
| ゲート付き実行 | 失敗理由とバックアップ切替の観測 | by_route・primary_ever_shipped・failure_class<br>`data/autopilot-runs.json`<br>`scripts/autopilot-runs.mjs` |
| ゲート付き実行 | 基盤故障の自己修復と、その歯止め | 検証の弱体化・権限の拡大をCIが実検出<br>`scripts/autopilot-selfheal.mjs`<br>`scripts/check-authority.mjs` |
| ゲート付き実行 | バックアップ切替の演習 | 2026-08-22実装。判定の論理を15シナリオで検証。**実際のネットワーク・認証の挙動は証明しない**<br>`scripts/autopilot-drill.mjs` |
| ゲート付き実行 | 自律システムとは別系統の監査AI | 2026-08-22実装。**監査の中身ではなく独立を機械が守る**：①憲章と所見を自己修復レーンが書き換えられない ②監査は repair と別モデル ③所見は追記のみ（連番が飛ぶと落ちる）。監査AIは何も直さない（直す権限を持たせると「直したことにして所見を閉じる」が最短経路になる）。**まだ一度も走らせていない。**残る弱点（監査が article と同じモデル）も憲章に明記<br>`data/audit-charter.json`<br>`data/audit-findings.json`<br>`scripts/check-audit-independence.mjs`<br>`data/model-routing.json` |
| ゲート付き実行 | 認証切れ・モデル障害・API障害の演習 | 2026-08-22実装。判定に4つの故障軸（資格情報の拒否・モデル全滅/縮退・GitHub API到達不能・egress遮断）を足し、26シナリオで固定。**「秘密鍵が無い」と「拒否された」を別コードにした** — 混ぜると期限切れが毎日「設計どおりのスキップ」として黙殺される。**本番を落とす本物の演習ではない**（判定の論理だけ）<br>`scripts/autopilot-gate.mjs`<br>`scripts/autopilot-drill.mjs` |

### ⑤ AI予算・トークン管理

総合 **86.7%** ／ 実行 92.9% ／ 関与 92.9% ／ カバー 93.3%

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
| ゲート付き実行 | 小型→大型→人間への段階的移管 | 2026-08-22実装。種別ごとに小型→大型→人間のはしごを台帳で持ち、`--escalate <種別> --attempt N` が次の段を返す（人間に達すると exit 3）。**すべてのはしごが human で終わること**と、1段目が rules[種別].model と一致することを検査する（不一致を実際に1件検出して直した）。主系ワークフローは --resolve の結果でモデルを選ぶので、台帳が実行に効いている。残る弱さ: attempt を数えて自動で上げる呼び出し元がまだセッション側にしかない<br>`data/model-routing.json`<br>`scripts/check-model-routing.mjs`<br>`.github/workflows/obsidian-autopilot.yml`<br>`../simplememo-ios/scripts/qa/ai_triage.sh` |
| 意図的にやらない | Prompt Cache・結果キャッシュ | **やらないと決めた。**Prompt Cache は毎朝のプロンプトが静的でAPI側のキャッシュが効く範囲にあり、こちらで持つと二重管理になる。結果キャッシュで重いのは内部リンクの200検証（13,273件）だが、これはCIの話でセッションのトークンではない — **節約したい対象が違う** |
| ゲート付き実行 | コンテキスト圧縮（毎朝の1枚） | 2026-08-22実装。毎朝のセッションは着手前に Runbook・status・運転台帳・実費台帳・自己修復の判定・緊急停止・移管規則を**それぞれ読んでいた。**同じことを毎日6ファイル分のトークンで再構成していたので、1枚にまとめた。**新しい情報を作らない** — 既存の集計関数を呼ぶだけで、数字は台帳が正。未修理の故障も自己修復の判定をそのまま使う（数え直すとレーンFと表示がずれる）<br>`scripts/daily-brief.mjs`<br>`data/emergency-stop.json`<br>`data/autopilot-runs.json` |
| ゲート付き実行 | 無限ループ・重複実行の防止 | --max-turns 250・当日ブランチ占有・冪等性チェック<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md` |
| ゲート付き実行 | 異常消費の検知 | 2026-08-22実装。絶対額ではなく直近中央値との比。実績5件未満では『判定していない』と言う<br>`scripts/autopilot-budget.mjs`<br>`data/autopilot-cost.json` |
| ゲート付き実行 | モデル障害・レート制限時のフォールバック | 2026-08-22実装。縮退先を台帳に持ち、実行判定が DEGRADE_MODEL / FAIL_NO_MODEL を返す（使えるモデルが尽きたら走らない — 静かに寝ない）。両コードに移管規則がある。**不可逆な種別に最安のモデルを割り当てると落ちる。**残る弱さ: 使えないモデルを検知して渡す経路が無いので、縮退の起点は今も人かセッションの観測<br>`data/model-routing.json`<br>`scripts/check-model-routing.mjs`<br>`scripts/autopilot-gate.mjs`<br>`data/escalation-rules.json`<br>`../simplememo-ios/scripts/qa/ai_triage.sh` |
| ゲート付き実行 | 新モデル導入前の固定評価セット | 2026-08-22実装。失敗分類の6ケースを固定し、合格ライン83%＋**「分からない」と答えられること2件を必須通過**にした。合格条件は決定論（ラベルの照合のみ）— AIにAIを採点させると採点側を替えた時点で履歴が無効になるため。**評価はまだ一度も走らせていない**ので policy.enforce は false（true にすると現行3モデルが未評価で落ちる）<br>`data/model-eval-set.json`<br>`scripts/check-model-eval.mjs`<br>`data/model-routing.json` |
| **未実装** | 副系CCRの実費観測 | スケジュール起動セッションのログが外部から読めない。構造的に不可<br>`data/autopilot-cost.json` |

### ② バグ修正

総合 **82.4%** ／ 実行 87.5% ／ 関与 93.8% ／ カバー 94.1%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | 監視カバレッジの棚卸し | 2026-08-22実装。13系統を棚卸しし、**検知器が実在するか**と**実際に起きた障害種別に検知経路があるか**をCIが確かめる。『全部見ています』ではなく『何が空いているか』を言うための台帳<br>`data/monitoring-coverage.json`<br>`scripts/check-monitoring.mjs` |
| ゲート付き実行 | 統合監視（Crash/API/Watch/課金/問い合わせ） | 2026-08-22。棚卸しで名指しした穴3系統のうち**2つを塞いだ。**問い合わせ＝受け口はあったが来たことに気づく経路が無かったので、未応答の滞留を日報に載せた。Watch＝計測イベントは2026-07から流れていたのに誰も見ていなかったので、詰まり・手動修復を24h窓で判定する検知器を書いた。**どちらも「読めなかった」を 0件 と書かない** — 混ぜると穴が「異常なし」に見える。Watchは母数が小さいので分母20件未満では判定しない（毎日「異常」が出る検知器は読まれなくなる）。残る穴: **課金1系統。**購入失敗イベントを受ける経路がiOS側に無く、ASCの売上データも接続直後で降りてきていない [2026-08-22追記] **計測の事故が起きる境目**（iOS↔relay のイベント名）に検査を足した。従来の検査は「サーバに登録したのに iOS 側のセットに入れ忘れる」だけを見ており、**逆向き（iOSが送るのにサーバの allowlist に無い）は素通り**していた。その場合サーバは受け取って黙って捨て、端末には200が返るので送信側にも症状が出ない。サーバ allowlist の写しを iOS 側に置いたので**隣のリポジトリが無いCIでも動く** — 隣を見に行く形にすると検査が常にスキップされ、事故は起きたまま緑になる<br>`data/monitoring-coverage.json`<br>`scripts/check-monitoring.mjs`<br>`../simplememo-api/src/inquiry.ts`<br>`../simplememo-api/src/watch-health.ts`<br>`../simplememo-api/src/autopilot-report.ts`<br>`.github/workflows/autopilot-health.yml`<br>`.github/workflows/cron-health.yml`<br>`../simplememo-ios/scripts/qa/check_analytics_crossrepo.py`<br>`../simplememo-ios/data/analytics-server-allowlist.json` |
| 提案のみ | 問い合わせから再現テストを自動生成 | 手動運用。ただしWatch同期は実績あり<br>`../simplememo-ios/docs/qa/REGRESSION_TEST_TEMPLATE.md` |
| ゲート付き実行 | Unit / UI / 契約テストの実行 | XCTest/XCUITest＋Watchブリッジ契約テスト2コピー＋parity CI<br>`../simplememo-ios/.github/workflows/qa-ios.yml` |
| **未実装** | Visual Regression Test | アプリ側に無い |
| ゲート付き実行 | オフライン・タイムアウト・500・429の決定論再現 | QAStubURLProtocol。低速回線とバックグラウンド復帰は無い<br>`../simplememo-ios/docs/qa/AUTOMATED_QA_ARCHITECTURE.md` |
| 人間 | 実機/シミュレータでの操作・撮影・計測 | macOS必須。Runbook §7「できないこと」の筆頭<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md` |
| ゲート付き実行 | アクセシビリティ・文字切れ・多言語の自動検査 | 2026-08-22。**多言語だけアプリ側にも入った。**初回の実行で3件出た（どれも目視では見つからない）: NSLocalizedString の直接呼び出し2箇所（キーが無い言語では`onboarding.page2.apple_signin.error_generic` という文字列がそのままエラーとして表示されていた）/ premium.* 5キーが全10言語で二重定義（50行、後の行が静かに勝つので先の行を直しても画面は変わらない）/ premium.unlimited がどの言語にも無い。全部直した。**未翻訳では落とさない**（8言語が46.3%なのは既知）が、基準線から下がると落ちる。残る弱さ: **文字切れとアクセシビリティはアプリ側で未検査。**文字切れは実機のフォントとレイアウトが要り、文字数比での近似は誤検出だらけになるので採らなかった（ドイツ語が日本語の3倍は正常）<br>`../simplememo-ios/scripts/qa/check_localization.py`<br>`../simplememo-ios/data/localization-baseline.json`<br>`../simplememo-ios/.github/workflows/qa-static.yml`<br>`scripts/seo-check.js` |
| ゲート付き実行 | 性能・起動時間の計測 | 2026-08-22。**本番の常時監視になった。**それまでは段階公開中だけガードが見ており、平常時に起動が壊れても気づく経路が無かった。指標も読み方の文書も既にあり、**無かったのは毎日それを見る仕組み**だけだった（POSTを叩いた日にしか読まれていなかった）。判定は文書の読み方をそのまま機械にした: **比率をそのまま閾値にしない** — iOSは毎フォアグラウンド復帰で breadcrumb を上書きするので、正常利用後のkillでもlaunch_incomplete が出る（scene_did_become_active は恒常的に最多で実害の証拠にならない）。**前段ステージが1件でも出たら分母を問わず劣化**、比率は前週比の跳ねだけに使う。残る弱さ: **起動「時間」は測っていない。**0.4秒は今も定点実測で、本番の起動所要時間を集める経路はiOS側に無い。ここが監視しているのは完走したかどうかだけ<br>`../simplememo-api/src/launch-health-monitor.ts`<br>`../simplememo-api/src/autopilot-report.ts`<br>`../simplememo-api/test/launch-health-monitor.test.ts`<br>`../simplememo-api/docs/launch_health.md`<br>`data/monitoring-coverage.json` |
| ゲート付き実行 | 依存脆弱性・秘密情報・SBOM・署名検査 | 2026-08-22実装（simplememo-api）。SBOM 259件（**実行時はわずか1件**、残り258は開発時）・integrity欠落0件・秘密情報スキャン。**値は出力しない**（出力に秘密を写したら意味が無い）。**既知脆弱性の照合（npm audit）は意図的に含めない** — 外部DB依存でCIの合否が日替わりになり、やがて無視されるため<br>`../simplememo-api/scripts/check-supply-chain.mjs`<br>`../simplememo-api/data/sbom.json` |
| ゲート付き実行 | Fuzz / Property-based / Mutation Test | 2026-08-22実装。実行判定と予算集計の**不変条件12件**を、種を固定した乱択400ケース／件で検査する。ドリル（26の具体例）が守れない**書かなかった組み合わせ**を踏むのが目的。変異テストで検出力を確認（forceが予算を飛び越える／認証切れが予算の陰に隠れる、をどちらも検出）。**アプリ側のfuzzは未実装**<br>`scripts/property-tests.mjs`<br>`scripts/autopilot-gate.mjs`<br>`scripts/autopilot-budget.mjs` |
| ゲート付き実行 | 失敗の分類（独立2モデル監査） | 2026-08-22実装。割れたら人間に上げる<br>`../simplememo-ios/scripts/qa/ai_triage.sh` |
| ゲート付き実行 | 回帰の合否判定（決定論的） | AIには判定させない設計<br>`../simplememo-ios/docs/qa/AUTOMATED_QA_ARCHITECTURE.md` |
| ゲート付き実行 | セキュリティ監査と修正 | AIが発見しAIが修正。High 1件含む4件<br>`../simplememo-ios/docs/reports/SECURITY_HARDENING_2026-07.md` |
| **自律** | カナリア公開と自動ロールバック | 露出群/対照群を bucketOf で復元して比較し、悪化なら自動で撤回する。**2026-08-22実装。本番でまだ1回も発火していない**（段階公開中のフラグがゼロのため）。実装した≠動いた<br>`../simplememo-api/src/rollout-guard.ts`<br>`../simplememo-api/test/rollout-guard.test.ts` |
| ゲート付き実行 | 誤修正率・再発率・MTTRの計測 | 2026-08-22に検知時刻を投入。検知まで中央値2.1h/最大50.7h、修理まで中央値0.9h。誤修正率・再発率はまだ<br>`data/autopilot-runs.json`<br>`scripts/autopilot-runs.mjs` |
| ゲート付き実行 | 基盤故障の検知と自己修復 | 2026-08-22実装。レーンF<br>`scripts/autopilot-selfheal.mjs` |

### ⑪ データ・プライバシー

総合 **70.0%** ／ 実行 70.0% ／ 関与 90.0% ／ カバー 100.0%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | データ分類（送信可否の allowlist） | CIで強制<br>`../simplememo-ios/scripts/qa/check_analytics_allowlist.py` |
| 提案のみ | 収集同意 | App Analytics共有オプトイン依存 |
| ゲート付き実行 | 保持期間の定義（棚卸しと逸脱検査） | 2026-08-22実装。23ストアを棚卸しし、**ずれたらCIが落ちる**形にした（新テーブルは保持方針を書くまで通らない／保持期間を宣言したのに削除コードが無いと落ちる） [2026-08-22追記] 棚卸しの記述そのものが実態と違っていた例が1件出た — reminder_events は `holds: [email_hash, event, at]` と書いてあったが **email_hash 列は存在せず、webhook の生の本文（宛先の平文・件名）を無期限に持っていた。**許可リストで落とし、窓180日にして剪定へ入れた。**誰も読まないテーブルを検出する検査**も足した（DELETE は読者に数えない） さらに、**台帳の記述そのものをスキーマと突き合わせる検査**を足した（2方向 — 存在しない列を書いていないか／書かれていない自由文の列が無いか）。**22表中14表がずれていた。**求めるのは TEXT/BLOB と身元を示唆する名前の列だけで、全列を書かせると台帳が読まれなくなる（読まれない台帳は無いのと同じ）<br>`../simplememo-api/data/data-retention.json`<br>`../simplememo-api/test/data-retention.test.ts`<br>`../simplememo-api/scripts/check-write-only-tables.mjs`<br>`../simplememo-api/src/webhook-redact.ts`<br>`../simplememo-api/scripts/check-retention-schema.mjs` |
| ゲート付き実行 | 保持期間の自動削除 | 2026-08-22に app_analytics_events を90日で剪定するようにした（オーナー判断）。棚卸しで見つかった最大の穴がこれ。**23ストア中6つが自動削除つき**になった。**残る10ストアはまだ無期限**（重複送信防止の台帳が中心。email_suppression は意図的に無期限）<br>`../simplememo-api/src/analytics.ts`<br>`../simplememo-api/test/analytics-retention.test.ts`<br>`../simplememo-api/data/data-retention.json` |
| 提案のみ | 削除要求への対応 | 2026-08-22に網羅の検査を実装。**ただし実行者は提案のまま。**権限表はこの領域を `requires_approval: true` / `human_only: [実行の承認]` と定めており、それに反する分類はしない。

実装したこと: 消す対象をハンドラの中に手で並べるのをやめ、保持台帳（data-retention.json）を正にして実装との食い違いをCIで落とす。27ストアを4分類（削除14 / 意図的に残す2 / 届かない2 / 個人に紐づかない9）。**この作業で穴が2つ出た** — 同じ日に作った inquiries（personal・本文を保持）と email_dead_letters が削除経路に入っていなかった。症状が出るのは削除要求が来た日で、差分に「消し忘れ」は現れないのでレビューでは気づけない。**「届かない」に名前を与えたのが要点**（消せないものを「消している」と書かないため）。

**オーナー確認事項:** 権限表のこの領域は2つの別物を1つに束ねている。(a) アプリ内の自己削除（POST /v1/account/delete）は承認を挟まず完了する — App Store Guideline 5.1.1(v) がそれを要求している。(b) 個別の連絡による削除要求は本人確認と承認が要る。いまの権限表は (b) の記述で (a) を覆っており、**実装は権限表より広い。**分けるかどうかは権限の話なので、こちらでは変えない<br>`../simplememo-api/scripts/check-deletion-coverage.mjs`<br>`../simplememo-api/data/data-retention.json`<br>`../simplememo-api/src/index.ts`<br>`../simplememo-api/test/deletion-coverage.test.ts`<br>`../simplememo-api/.github/workflows/ci.yml`<br>`data/authority-matrix.json` |
| ゲート付き実行 | AIへの送信可否の制御 | redact済み要約のみ。メモ本文fixtureは架空<br>`../simplememo-ios/scripts/qa/build-ai-triage-bundle.sh` |
| ゲート付き実行 | 端末内の暗号化 | AES-GCM-256・Keychain・Data Protection属性<br>`../simplememo-ios/docs/reports/SECURITY_HARDENING_2026-07.md` |
| ゲート付き実行 | アクセス履歴 | 2026-08-22実装（simplememo-api）。保持の棚卸しで「どこに何があるか」は分かったが、**そこへ誰がいつ触ったかの記録が無かった。**/admin/* は本番D1を読み書きしCSVも取り込む — **一番強い権限の操作だけが記録の外にあった。****認証の失敗こそ残す**（成功だけだと総当たりが残らない）。リクエストボディは入れない（監査の記録が監査対象になってはいけない）。保持180日 [2026-08-22追記] **記録するだけで、その記録を読むコードが無かった。**書き込み専用テーブルの検査で自分の作った穴として出た。認証失敗の件数と経路を日報に出す読者を足した — 記録しただけの監査ログは監査ではない<br>`../simplememo-api/src/access-log.ts`<br>`../simplememo-api/migrations/0019_admin_access_log.sql`<br>`../simplememo-api/src/index.ts`<br>`../simplememo-api/scripts/check-write-only-tables.mjs` |
| ゲート付き実行 | 第三者SDKのデータ送信監査 | 2026-08-22実装（simplememo-ios）。送信先ホスト4件・第三者SDK5件を棚卸しし、宣言していないホスト・SDKが増えると落ちる。宣言どうしの矛盾（台帳は「トラッキングしない」/ PrivacyInfoがtrue）も見る。**作った初回実行で AppsFlyerLib の記載漏れを自分で検出した。****実際に飛んでいるパケットは見ていない**（実機のプロキシ観測が要る）ので runtime_verified は全部 false [2026-08-22追記] **申告そのものと実装の突き合わせ**も足した。PrivacyInfo.xcprivacy は手で書いた宣言なので実装が増えても追随せず、**足りない申告は書いた本人には見えない。**突き合わせたら2種別が未申告だった（製品操作・クラッシュ）。**こちらでは申告を書き換えていない** — ASCの「App のプライバシー」への回答と揃える必要があり、片方だけ直すと逆に不整合になる。オーナー依頼に積んだ<br>`../simplememo-ios/scripts/qa/check_third_party_egress.py`<br>`../simplememo-ios/data/third-party-egress.json`<br>`../simplememo-ios/SimpleMemo/PrivacyInfo.xcprivacy`<br>`../simplememo-ios/scripts/qa/check_privacy_manifest.py`<br>`../simplememo-ios/data/privacy-manifest-policy.json` |
| 人間 | 推論をどこで回すかの決定 | VISION §14 未決定論点。Capture本文は個人情報そのもの<br>`../simplememo-ios/docs/VISION.md` |

### ⑥ アプリ運営意思決定

総合 **69.2%** ／ 実行 75.0% ／ 関与 91.7% ／ カバー 92.3%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | ファネル分析（インストール→初回メモ→継続→課金） | 4回連続の定点評価<br>`../simplememo-api/src/analytics.ts`<br>`../simplememo-api/docs/reports/FUNNEL_EVALUATION_2026-08-20.md` |
| ゲート付き実行 | コホート分析（継続率・課金率） | 2026-08-22。**都度レポートから週次の自動実行へ。**計算も、週次サマリの中でそれを呼ぶ経路も既にあり、**無かったのは定期的に回して読む仕組み**だった（人が叩いた日にしか読まれていない）。運用報告なので ENABLED フラグでは止めず、宛先の有無だけで自己ゲートする（autopilot_report / analytics_daily_report と同じ流儀）。この領域は母数が小さいので、**成熟30件未満では変化を解釈しない**し、差が**1人ぶんの幅**に収まるなら「区別できない」と書く（前週の母数が小さければそちらの分解能を使う）。**言うことが無い週は送らない** — 読めるようになった週・言える差が出た週・集計できなかった週の3つだけ。毎週同じ行を送ると読まれなくなる。残る弱さ: **D28 は BQ の28日蓄積待ち**（9/6前後）。実際に「読める」判定が出るのは母数が30件に届いてからで、いまの規模ではしばらく『母数不足』が続く<br>`../simplememo-api/src/cohort-report.ts`<br>`../simplememo-api/src/analytics.ts`<br>`../simplememo-api/src/index.ts`<br>`../simplememo-api/test/cohort-report.test.ts`<br>`../simplememo-api/docs/reports/RETENTION_MONETIZATION_COHORT_2026-07-29.md` |
| ゲート付き実行 | KPI定義と集計SQLのバージョン管理 | 2026-08-22実装。KPI6件の定義と、**算出元ファイルの sha256** を台帳に持つ。計算コードが変われば version を上げるまでCIが落ちる（`--bump <id> --why` で履歴が残る）。狙いは数字ではなく**定義の凍結** — 「自動化率が上がった」の半分が計算を変えたからだった、を起こさないため。導入直後にRunbookの編集で実際に発火し、履歴に「定義は変えていない」と残した。残る弱さ: 集計SQLはまだ台帳に無い（BigQuery側は analytics-golden.md 止まり） [2026-08-22追記] **原稿の「変更行の98.8%」が再現できなかった**ので、数え方そのものを script にして凍結した（KPI定義7件目）。台帳の算数と、**headline が実測とずれていないこと**をCIが見る — 「数字だけ良くする」経路をつぶすため。窓の切り方1つで 94.2% ↔ 96.6% と 2.4pt 動くので、**計測日を窓に入れない**ことを定義に含めた<br>`data/kpi-definitions.json`<br>`scripts/check-definitions.mjs`<br>`.github/workflows/seo-check.yml`<br>`growth/lib/`<br>`../simplememo-api/docs/analytics-golden.md`<br>`scripts/code-authorship.mjs`<br>`data/code-authorship.json` |
| ゲート付き実行 | データ不足時に「何もしない」と判断 | ノイズフロア＝期待クリック3未満／28日窓未満でスナップショットを作らない<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md` |
| 提案のみ | 売上・課金・返金・広告の照合 | 2026-08-22にASC取得の配線が入った（③参照）。**データが降りてくるのは翌日以降**で、まだ照合していない。広告は未実装なので4つのうち3つが対象。降りたら financial-policy.json の revenue_connected を人が true にする — **売上が取れているかはレポートの中身を見て判断する**<br>`growth/scripts/ingest-asc.mjs`<br>`data/financial-policy.json` |
| ゲート付き実行 | 欠損・遅延・重複データの検査 | 2026-08-22実装。**作った直後の初回実行で実データの欠陥を検出した** — 2026-08-09スナップショットの /vs/ticktick/ が2行あり、クリックが二重に乗りうる状態だった（URL正規化で衝突した行を畳んでいなかった）。取り込み側に mergeByKey を入れて恒久対策。重複と内部不整合は落とし、日付の欠けと鮮度は報告のみ<br>`growth/scripts/check-data-quality.mjs`<br>`growth/scripts/ingest-gsc.mjs` |
| 提案のみ | CAC・LTV・回収期間・粗利の統合 | 2026-08-22にASC取得の配線が入った（③参照）。**CACは依然として存在しない**（広告費ゼロ）。LTV・回収期間・粗利はASCの売上が降りれば出せる<br>`growth/scripts/ingest-asc.mjs`<br>`data/financial-policy.json` |
| ゲート付き実行 | 季節性・外部要因の分離 | 2026-08-22実装。曜日係数を実測から出し（日1.17 月1.12 火0.97 水0.93 木1.05 金0.83 土0.81）、外れ値を注釈台帳と突き合わせて説明のつかないものを名指しする。**28日未満では判定を拒否する** — 足りない標本で「効いた/効かなかった」を言わせないため。金土は平日比0.8倍まで落ちるので、金曜に出した施策は何もしなくても効かなく見える。残る弱さ: 分離できるのは曜日だけで、季節・外部イベントは注釈頼み<br>`growth/scripts/decompose-series.mjs`<br>`growth/data/annotations.json`<br>`.github/workflows/seo-check.yml` |
| **未実装** | 対照群に対する増分効果の評価 | 母数が小さく（App Storeクリック2.1件/日）、対照群を割ると両群とも検出力不足 |
| ゲート付き実行 | 予算変更幅・損失上限・撤回条件 | 2026-08-22実装。**動かす予算が小さいうちに書いた** — 大きくなってから書くと、そのときの都合に合わせた基準になる。AI実費は稼働中（変更幅25%・間隔14日・損失上限$60・撤回条件3件）、広告は未着手、価格はAI対象外。**損失上限が現在の上限以下だとCIが落ちる**（初日から発火する上限は上限ではない）<br>`data/financial-policy.json`<br>`scripts/check-financial-policy.mjs`<br>`data/authority-matrix.json` |
| ゲート付き実行 | 可逆／不可逆の承認レベル分け | 2026-08-22実装。13領域中9が承認制<br>`data/authority-matrix.json`<br>`scripts/check-authority.mjs` |
| 人間 | 月次予算の決定 | — |
| ゲート付き実行 | 資金繰りシナリオ（悲観・標準・楽観） | 2026-08-22実装。**出ていく側だけ**（悲観$150／標準$40／楽観$25）。収入はASC未接続で機械が読めないため、**ランウェイ（月数）は出さない** — 手元資金も収入も入っていないので月数を書くと嘘になる。CIが「収入未接続なのに runway_months を書いていないか」を見る<br>`data/financial-policy.json`<br>`scripts/check-financial-policy.mjs`<br>`data/vendor-register.json` |

### ③ 自律型マーケティング

総合 **65.4%** ／ 実行 81.0% ／ 関与 90.5% ／ カバー 80.8%

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
| ゲート付き実行 | App Store Connect のデータ連携 | 2026-08-22実装（オーナー承認を受けて着手）。**Sales and Trends ではなく Analytics Reports を使う** — 前者は vendorNumber が要り管理画面にしか無いが、後者はアプリIDだけで足りるので**オーナー作業ゼロで始められる。**鍵は fastlane が既に使っているものをそのまま使う。毎日20:30 JSTに取得。**行そのものは置かず、列名・行数・日付範囲・数値列の合計・名指しした分類列ごとの内訳だけ**（個人が特定できる列が将来増えたときに気づかず貯め始めるのを防ぐ。[2026-08-26] 内訳を足したのは、Cancellation Reason が文字列なので合計に入らず**⑨解約理由分析が読むべき値が1件も残っていなかった**ため）。**本番でまだ一度も走っていない** — ONGOINGのレポート要求を作った当日はApple側が生成しておらず、初回の0件は失敗ではない<br>`growth/scripts/ingest-asc.mjs`<br>`../simplememo-ios/scripts/asc_analytics.rb`<br>`../simplememo-ios/.github/workflows/asc-analytics.yml` |
| 人間 | AIプローブ（生成AI検索での露出確認） | 月1・オーナーが手動<br>`growth/input/AI_PROBE_PROTOCOL.md` |
| ゲート付き実行 | 言及・競合ウォッチ | 2026-08-22。スナップショットが1件だけだった状態から、**2件目を実際に取り、やらなかった週に落ちる検査を入れた。**手順書は「週1回・前回が7日以上前なら実行」と書いていたが、**その条件を誰も検査しておらず、実際に10日空いていた**（3日の遅れは誰にも見えていなかった）。検査は (1) 最新の古さ (2) **過去の間隔**（最新だけ見ると途中の空白が隠れる）(3) READMEの固定クエリが欠けていないか — 一部だけ検索して「やった」ことにすると**系列は連続しているのに中身が変わり**、あとから「あの週から言及が減った」に見える (4) 前回との差分が書かれているか、を見る。5通りとも壊して落ちることを確認した。**検索そのものはセッションのWebSearchで行う**（CIからは実行しない）ので、実行はAI・遅れの検知はCI、という分担。残る弱さ: **本文はフェッチしていない**（この環境のegress制限）。mentions_us は検索結果の要約だけを根拠にしており、中身の妥当性は機械には判定できない<br>`growth/scripts/check-mentions.mjs`<br>`growth/data/mentions/`<br>`growth/data/mentions/README.md`<br>`docs/obsidian/AUTOPILOT_RUNBOOK.md`<br>`.github/workflows/seo-check.yml` |
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

総合 **64.3%** ／ 実行 69.2% ／ 関与 100.0% ／ カバー 92.9%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | ビジョン文書の維持（機能追加の必読ゲート） | 2026-08-22実装。**参照と鮮度を機械が守る。**3リポジトリの CLAUDE.md が「設計に入る前に読め」と指す唯一の文書なのに、**参照が壊れても誰も落ちなかった** — 壊れたことは「読んだ人が違う節を読んで帰る」という形でしか現れず、しかもその人は自分が違う節を読んだことに気づかない。初回の実行で1件出た: 冒頭が「最後の『12. 機能追加時のチェック』が実際のゲート」と書いていたが §12 は「現在地」で、チェックは §13。**読者を1つ手前の節へ送っていた**（3リポジトリのCLAUDE.mdはどれも §13 と正しく書いており、間違っていたのはこの文書の自分自身への参照だけだった）。節番号の解決・必須節の存在・**現在地が90日を超えたら落とす**・未決定が空でないこと、の4つ。4通りとも壊した状態を作って落ちることを確認した。残る弱さ: **中身が正しいかは見ていない**（ビジョンの正しさは機械には決められない）。定期改訂そのものは人が書く — 機械がやるのは古くなったことを言うところまで<br>`../simplememo-ios/scripts/qa/check_vision.py`<br>`../simplememo-ios/docs/VISION.md`<br>`../simplememo-ios/.github/workflows/qa-static.yml`<br>`CLAUDE.md`<br>`../simplememo-api/CLAUDE.md`<br>`../simplememo-ios/CLAUDE.md` |
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

総合 **50.0%** ／ 実行 50.0% ／ 関与 71.4% ／ カバー 100.0%

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
| ゲート付き実行 | AI・外部サービス停止時の独立した緊急停止経路 | 2026-08-22実装。**主系と副系を同時に、意図が残る形で止める唯一のスイッチ。**予算ゲートは主系しか止めず、秘密鍵の削除は「静かに寝る」ので止めたのか壊れたのか区別がつかなかった。他のどの判定よりも先に効き、force でも飛び越えられない。**AIは止められるが解除できない**（非対称）。CIは台帳ではなく**配線**を見る（判定・ワークフロー・Runbookの3経路）<br>`data/emergency-stop.json`<br>`scripts/check-emergency-stop.mjs`<br>`scripts/autopilot-gate.mjs`<br>`.github/workflows/obsidian-autopilot.yml` |
| 提案のみ | ChatOps によるリリース起動 | issue コメントで起動。コメントするのはオーナー<br>`../simplememo-ios/.github/workflows/release-command.yml` |

### ⑧ カスタマーサポート

総合 **50.0%** ／ 実行 66.7% ／ 関与 100.0% ／ カバー 75.0%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| ゲート付き実行 | 問い合わせの自動分類 | 2026-08-22実装（simplememo-api・24テスト）。**AIに判定させず規則で分ける** — 回帰の合否をAIに判定させない設計と同じ理由で、分類の誤りは見落としとして静かに積み上がる。分けられないものは**「その他」ではなく unclassified**（その他は見返されないが、未分類は見返される）。重い用件（個人情報・退会・返金）を先に当て、当たったら自動で人へ上げる。**受け口は既定オフ**（INQUIRY_ENABLED）で、公開ページを mailto から切り替えるかは製品の判断。テストが実バグを検出した — 「送信できません」が「できな」に当たらず未分類に落ちていた<br>`../simplememo-api/src/inquiry.ts`<br>`../simplememo-api/migrations/0020_inquiries.sql`<br>`../simplememo-api/test/inquiry.test.ts` |
| **未実装** | 回答・返金・障害案内 | 同上。加えて返金は不可逆で、承認境界の設計が先 |
| **未実装** | App Store レビュー返信 | ASC APIで可能だが未着手。レビュー返信は公開されるので文面の承認境界が先 |
| ゲート付き実行 | FAQとリリース内容の同期 | 2026-08-22実装。FAQ・トップ（日英）・llms.txt・運営者情報の**散文**を site-constants / benchmark と突き合わせ、旧アプリ名・古い起動時間・廃止済みトライアル・価格ドリフトで落とす。廃止済みトライアルは景表法・ストア審査上のリスク対応で消したもので、それまで「出現回数0」を確かめていたのは人の目視だった。**リリースノート本文との突き合わせは隣リポジトリのためCI外** [2026-08-22追記] **公開表示の鮮度**も機械が見るようにした。評価（4.4）と件数（22）は JSON-LD の aggregateRating として12ページに出ているのに、どちらも人が App Store Connect を見て手で書いた値で、台帳のメモにも「NOT machine-verified」と書いてあった — **古くなっても誰も気づかない。**CIは45日を超えた確認日で落とす（ネットには触らない — PRのたびに外部APIを叩くと向こうの不調でCIが赤くなり、やがて無視される）。実物との突き合わせは日次ワークフローの --net で行う（**GitHubのランナーは itunes.apple.com に到達できる**が、エージェントのサンドボックスはプロキシがCONNECTを拒否するので確認できない）。**件数0で平均を出していないか**も見る — 実体の無い集計評価は公開してはいけない表示<br>`scripts/check-public-facts.mjs`<br>`faq.html`<br>`data/site-constants.json`<br>`scripts/check-store-facts.mjs`<br>`.github/workflows/seo-daily.yml` |
| 提案のみ | CSAT計測 | 2026-08-22。**計測する接点のうち「問い合わせ」はできた**（inquiry.ts）が、返信の自動化が無いので発火しない。answered のものだけ受ける設計にしてあり、返信を人がやった件だけ測れる。**まだ1件も測っていない**<br>`growth/scripts/ingest-asc.mjs`<br>`data/financial-policy.json` |
| ゲート付き実行 | 重大案件の有人移管 | 2026-08-22実装。実行判定が返す故障・縮退コード5件と、運転台帳に**実際に現れた** failure_class 4件の全部に規則が要る（規則の無い種別があると落ちる）。危機領域は stop_automation: true を強制。**owner_direct の経路は未整備**で、名前が付いただけであることも台帳に書いてある<br>`data/escalation-rules.json`<br>`scripts/check-escalation.mjs`<br>`data/authority-matrix.json` |
| 提案のみ | 問い合わせからIssueと回帰テストを作成 | 手動では実績あり（Watch同期4往復→v4.9.30→回帰テスト化）<br>`../simplememo-ios/docs/reports/watch_sync_診断改修案_2026-07-26.md` |
| ゲート付き実行 | ライフサイクルメール（歓迎・確認・リマインド） | cronで自動送信。DRY_RUN/KILL_SWITCH/DAILY_CAP付き<br>`../simplememo-api/src/lifecycle.ts`<br>`../simplememo-api/src/reminder.ts` |

### ⑦ 法人経営

総合 **30.8%** ／ 実行 40.0% ／ 関与 90.0% ／ カバー 76.9%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| **未実装** | 仕訳・請求・領収書・銀行・カード・月次締めの統合 | 3リポジトリに証跡ゼロ |
| 提案のみ | 税務・給与・社会保険・法定期限の管理 | 2026-08-22に台帳と検査を実装。**ただし6件すべて未把握。**決算期・従業員の有無・課税事業者かどうかがリポジトリから取れず、**機械はいま何も見張っていない。**埋まれば期限計算はできる（決算期が入れば申告期限は機械が出せる）。**「把握していない」を「余裕がある」と読ませない**ための器であって、実行ではない<br>`data/corporate-obligations.json`<br>`scripts/check-corporate.mjs` |
| 提案のみ | 定型／非定型契約の分類 | ベンダー台帳で「どの事業者とどんな関係があるか」までは機械が持つようになった。**契約書そのものの分類は未着手**（契約書がリポジトリに無い）<br>`data/vendor-register.json`<br>`scripts/check-vendors.mjs` |
| 提案のみ | 責任上限・知財・個人情報・準拠法の条項検査 | 2026-08-22に台帳と検査を実装。10社×4観点。**書面の契約書は無く、各社の規約への同意で成立している**ので、検査対象は規約本文であり確認は人が読むことでしか進まない。**現状40マスすべて unreviewed。**機械が守るのはベンダー台帳との照合（片方だけ増えると素通りする）と、riskと書いたら理由を要求すること<br>`data/corporate-obligations.json`<br>`scripts/check-corporate.mjs`<br>`data/vendor-register.json` |
| ゲート付き実行 | 取引先・送金先・利用サービスの許可リスト | 2026-08-22実装。10社すべてに money_flow / payment_method / approved_by / spend_cap_ref を持たせ、金銭が動く相手は human 承認と上限の参照先が無いとCIが落ちる。**ここに無い相手への支払いは許可されていない**という形。上限が設定されているのは AI実費と広報配信の2つだけで、残り8社は "unset"（理由つき）<br>`data/vendor-register.json`<br>`scripts/check-vendors.mjs` |
| ゲート付き実行 | 支出上限と重要支出の二者承認 | 2026-08-22実装。**実際に効いている** — autopilot-cost.json の monthly_usd_cap は承認台帳の最新値と一致していないとCIが落ちる。つまり**承認記録を書かずに上限を動かせない。**変更幅が25%を超えるときは承認者2人。**AIは承認者になれない**（止めることは許しているが、金額を上げることは許さない）。3つの分岐を差し替えで検出確認。ただし**効いている対象はAI実費1件だけ**で、広告・契約は動く金額そのものがまだ無い<br>`data/spend-approvals.json`<br>`scripts/check-financial-policy.mjs`<br>`data/autopilot-cost.json` |
| **未実装** | 契約・請求・納品・支払いの照合 | 3リポジトリに証跡ゼロ |
| 提案のみ | AI事業者のDPA・データ利用・SLA・撤退計画の審査 | 2026-08-22にベンダー台帳を作成（10社）。何を渡していて・止まると何が起きて・代替があるかを機械検査する。**DPAの確認そのものは人の作業で、いま6社が未確認**。確認したら enforce_unreviewed を true にすると CI が守る<br>`data/vendor-register.json`<br>`scripts/check-vendors.mjs` |
| 提案のみ | 董事会・株主・規制・契約記録の保存 | 2026-08-22に台帳と検査を実装。5件中2件は所在があり（規約への同意・App Reviewのやり取り）、**3件は所在が決まっていない**（議事録・株主名簿・事故記録）。事故記録は「発生していない」のか「記録する場所が無い」のかを区別できていない<br>`data/corporate-obligations.json`<br>`scripts/check-corporate.mjs` |
| **未実装** | 物理業務発注後の写真・受領・品質確認 | 3リポジトリに証跡ゼロ |
| ゲート付き実行 | 倫理・評判・長期影響の独立監査 | 2026-08-22実装。独立監査の4観点のうち ethics_reputation がこれ（5項目）。利用者に見えない不利益変更・実在しない実績の装い・人間だと誤認させる自動投稿・競合を貶める言及・**AIが書いたと分かる形になっているか**。**短期の指標では絶対に検知できない**種類の劣化なので別系統に置いた。**まだ一度も走らせていない**<br>`data/audit-charter.json`<br>`scripts/check-audit-independence.mjs` |
| ゲート付き実行 | エージェントごとの権限・認証情報・失効手順 | 2026-08-22実装。鍵13件それぞれに**使う経路・失効のさせ方・失効させると何が止まるか**を持たせ、ワークフローが実際に読む secret を現物から走査して台帳との食い違いを落とす。`--stop <経路>` で「この経路を止めるにはどれを失効させるか」に答える。**この作業で穴が1つ出た** — 緊急停止の最終手段は「credential-expiry.json の鍵を無効化する」と書いてあったのに、主系を止める鍵（GH_PAT）が台帳に無く、使用中の secret 11件のうち載っていたのは3件だけだった。最後の手段が指す先が空だった。残る弱さ: **失効操作そのものは人**（各社コンソールへのログインが要る）。critical 5件のうち4件は期限が未把握のまま<br>`data/credential-expiry.json`<br>`scripts/check-credentials.mjs`<br>`data/emergency-stop.json`<br>`data/authority-matrix.json`<br>`.github/workflows/seo-check.yml` |
| 人間 | 法務・税務・労務・事故時の専門家エスカレーション | 方針のみ。手順・連絡先・停止手段は未整備<br>`data/authority-matrix.json` |

### ⑨ マネタイズ

総合 **12.5%** ／ 実行 20.0% ／ 関与 80.0% ／ カバー 62.5%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| **未実装** | 価格・プラン・ペイウォールの実験 | 課金は不可逆で既存契約者への影響が読めない。権限表でAIは提案もしない扱い |
| 提案のみ | オンボーディング改善（課金導線） | データ起点の再設計。実施は人の判断<br>`../simplememo-ios/docs/reports/ONBOARDING_REDESIGN_2026-08-06.md` |
| 提案のみ | プレミアム機能の設計判断 | Obsidianのみモードをプレミアム限定にする判断はオーナー<br>`../simplememo-ios/docs/obsidian-only-mode-design.md` |
| 提案のみ | 解約理由分析 | 2026-08-22にASC取得の配線が入った（③参照）。Analytics Reports の Subscription 系に解約理由が含まれる見込みだが、**まだ取得していないので確認できていない。**含まれなければアプリ内の導線が要る<br>`growth/scripts/ingest-asc.mjs`<br>`data/financial-policy.json`<br>**[2026-08-26 追記] この見込みの立て方が間違っていた。**`Cancellation Reason` 列は 2026-08-25 の取得で既に届いており、読めなかったのは取得側が数値列の合計しか保存していなかったため（文字列の列は列名だけ残して捨てていた）。「上流がくれない」と「こちらが捨てている」は外から見ると同じ「無い」に見える |
| **未実装** | 課金失敗の回復 | StoreKit側の失敗イベントを受ける経路が未実装 |
| **未実装** | 返金・不正課金・チャージバック対応 | 金銭が動く不可逆な操作。承認境界の設計が先 |
| ゲート付き実行 | 短期CVRよりLTVと信頼を守る制約 | VISION §0「AIを前面に出さない」・§9「所有しない」が実質この制約。§13の6問がゲート<br>`../simplememo-ios/docs/VISION.md` |
| 人間 | 価格の変更 | AIは提案もしない（不可逆・既存契約者への影響が読めない）<br>`data/authority-matrix.json` |

### ⑬ アナログ領域

総合 **0.0%** ／ 実行 0.0% ／ 関与 22.2% ／ カバー 69.2%

| 実行者 | タスク | 状況・証跡 |
|---|---|---|
| **未実装** | イベント: 候補選定・見積比較・発注・リード集計 | AIが担える設計だが未着手 |
| 人間 | イベント: 現地設営・接客・実施 | 物理領域。人間が担う<br>`data/authority-matrix.json` |
| **未実装** | 人事: 募集・候補抽出・日程調整・書類作成 | 未着手 |
| 人間 | 人事: 採用・解雇・評価・健康情報の判断 | 人間が担う<br>`data/authority-matrix.json` |
| **未実装** | 公的資金: 制度探索・期限管理・申請書下書き | 未着手 |
| 人間 | 公的資金: 表明・提出・面談・法的責任 | 人間が担う<br>`data/authority-matrix.json` |
| 提案のみ | 契約: 定型契約・条項比較・リスク抽出 | 2026-08-22。⑦の条項検査と同じ機構。**定型／非定型の分類は、契約書がリポジトリに無いのでまだできない** — 現状あるのは「規約への同意」という形の定型のみ<br>`data/corporate-obligations.json`<br>`scripts/check-corporate.mjs` |
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
3. **開発領域の変更行比率94.2%に相当する客観指標が他領域には無い**

とくに1が効く。**開発領域には変更行という別の物差しがあり、そちらでは AI 94.2%**
（2026-08-11〜08-21・48,976行中46,159行・194コミット中193件。`node scripts/code-authorship.mjs` で再現できる。**旧稿の 98.8%／231,315行 は再現できなかった**）。

- 変更行 = **やった仕事の量**のうちAIが書いた割合
- タスク数 = **やるべきことの種類**のうちAIが実行している割合

**どちらも正しく、測っているものが違う。**プレスリリースに出すなら**両方**を出す。

---

## 4. 次に何を解くか

→ **`docs/autopilot-roadmap.md`** に依存関係と順序をまとめた。


---

## 2026-08-25 の棚卸し追加 — **率は下がった。下がったのが正しい**

外部レビューが挙げた①〜⑨の要素を1件ずつ実装に当て直し、**棚卸しに13件足した。**
足したのは「やっていなかったと気づいたこと」で、**10件が未実装**。

```
  2026-08-22   106 / 173 = 61.3%   （176タスク・うち intentional_no 3）
  2026-08-25   109 / 186 = 58.6%   （189タスク・うち intentional_no 3）
```

**実装は 106 → 109 に増えている。**率が下がったのは分母が 173 → 186 に増えたからで、
**やめたものは1つも無い。**

> **この下がり方は、この台帳が正しく働いた証拠として読むべきもの。**
> 棚卸しが甘いほど率は高く出る。「率を上げるいちばん簡単な方法は、
> できていないことを一覧に書かないこと」であって、
> **それをやらなかったので下がった。**

### 足した13件の内訳

| 領域 | 追加 | うち実装済み |
|---|---:|---:|
| ① 次期機能開発 | 4 | 1（過去の失敗を参照して同じ提案を繰り返さない） |
| ② バグ修正 | 1 | 0 |
| ③ 自律型マーケティング | 4 | 0（Decay検出は ai_proposes） |
| ⑤ AI予算・トークン管理 | 2 | 0 |
| ⑥ アプリ運営意思決定 | 1 | 1（結果の5分類） |
| ⑩ AgentOps・ガバナンス | 1 | 1（運転記憶） |

**未実装10件のうち、いちばん効くのは③の Marketing stop-loss。**
開発側には stop-loss がある（rollout-guard の kill / Crash-free率による自動停止）のに、
**マーケ側だけ無い。**海外の近接事例では AppDNA がまさにこの位置に
traffic cap と instant rollback を置いている
（`competitors-autonomous-app-ops-2026-08.md` §7）。

### この先の天井（2026-08-25 の分母で再計算）

```
  現在                       109 / 186 = 58.6%
  未実装 31 件を全部埋めても            →  75.3%
  提案どまり 27 件も実行へ上げたら        →  89.8%  ← **天井**
  95.3% に必要                          177 件（あと 68 件）
```

**天井は 89.0% → 89.8% とほぼ動かない。**人間専任19件（実機での事前確認・
App Storeへの公開・価格変更・事故対応）を人間に残す限り、ここが上限になる。
**95.3% は「まだ達成していない数字」ではなく「この設計では目指していない数字」**
という §numbers.md の結論は、分母が変わっても変わらない。
