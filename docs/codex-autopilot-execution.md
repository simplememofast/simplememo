# Obsidian autopilot: Mac Codex execution contract

2026-09-07の所有者指示による実行元の移管。記事の判断・品質・排他・停止の要件は
`docs/obsidian/AUTOPILOT_RUNBOOK.md`が正本であり、毎回全文を読む。
この文書はClaude固有の実行環境だけを対応させる。設定変更と無人初回の公開成功は別判定。

## 実行元と識別

| 用途 | 予定（Asia/Tokyo） | automation ID | 既存route / stop key |
|---|---|---|---|
| 主系 | 06:00 | `obsidian-autopilot-retry-standby` | `actions` |
| 未完日の補完 | 09:20 / 12:20 | 同上 | `ccr-0920` |
| 旧Claude Actions | 手動のみ | `.github/workflows/obsidian-autopilot.yml` | `actions` |

旧CCR trigger A `trig_01TRBdBgSA9646FS4LDQgJdt`、B `trig_01RC44fYy1D5TGryJ36ixCU1`、
retry `trig_01ESF9AHax6buS9X1pdFv657`は停止を維持する。同役割の予約を増やさない。
MacのローカルCodexプロジェクトの既存ログインとGitHub接続を使う。
Claude OAuth・`auth.json`・APIキーをコピーせず、API追加課金、利用枠リセット、
モデルの利用制限回避を行わない。Codexモデル・reasoningは保存されたautomation設定に従う。

起動した実タスクの`CODEX_THREAD_ID`と予定スロットを記録する。遅延時は予定スロットを
予約実行記録で照合し、確認できなければ主系/補完を推定して実装しない。
run IDは `ap-<YYYYMMDD>-<route>-codex-<実タスクID>`、
台帳の`external_ref`は`codex:<実タスクID>`、`source`は`codex-automation`。
`reason`にもengine、automation ID、予定スロットを残す。GitHub run IDを捏造しない。
gateの旧引継ぎメッセージにある`GITHUB_RUN_ID`は、この実タスク由来の識別へ対応させる。

## 着手前の確認

1. latest mainを専用worktreeへ取得し、CLAUDE.md、Runbook、ローカルタスクSKILLと
   `references/retry-procedure-v5.md`を全文読む。ユーザーのcheckoutを変更しない。
   作業環境・GitHub接続による配送は`docs/prtimes-d14-capture.md` §6に従う。
2. `data/emergency-stop.json`の全体と自routeの停止を最初に読む。
   停止・予算・未レビュー超過の解除や閾値変更を自分で行わない。
   `node scripts/autopilot-selfheal.mjs --contain --dry-run`と`--json`を読み、
   修理対象とkind（repair/article）を確定する。上限到達なら着手しない。
3. `node scripts/autopilot-budget.mjs --check`、
   `--check-run-cap --task <kind>`を実行する。kindの月次枠も`--check --task <kind>`で確認。
   CLIの読取エラーを予算内としない。既存の主系/補完別ゲートを維持する。
   Codexで実費を取得できない場合はローカルにnullと理由を残し、Claude実費台帳に
   0ドルや推計を追記しない。既存のClaude SDKのドル停止閾値がCodexでも働くとは報告しない。
   実行は1アクションに限定し、開始後90分までに実装を区切って実状態を記録する。
   これは作業手順上の区切りであり、Codexの強制終了タイマーを保証しない。
4. GitHub接続で当日共有ブランチ、同headのPR（state=all）、latest mainのstatus、
   本番`https://simplememofast.com/data/autopilot-status.json`を読む。
   別の実行中/queuedの旧Actions runとCodexタスクも確認する。
   Codexはautomation_runs等のローカル予約記録から対象タスクIDを取得し、
   `wait_threads`/`read_thread`の実状態を確認する。現在の自タスクは除く。
   経過90分だけで他のCodex実行を死亡扱いしない。読めなければ未確認として止まる。
5. 5分以内の根拠をローカルのsnapshotへ保存し、
   `node scripts/codex-autopilot-preflight.mjs --input <snapshot.json>`を実行する。
   下記の各値には取得元・取得時刻を別のローカル証跡として添える。
   `run:false`または検査例外なら実装・claim・投稿へ進まない。forceは使わない。

snapshotは`schema_version:1`、`task_id`、ISO8601 `observed_at`、`state`を持つ。
stateの必須値は`route`、当日JSTの`todayJst`、booleanの`credentialsAvailable`、
`emergencyStop`、`agentStopped`、`githubApiReachable`、`budgetOver`、`runCapOverrun`、
`branchClaimed`、`prTodayExists`、日付文字列の`prodStatusDate`と`mainStatusDate`、
`primaryRunStatus`（他実行の`none/completed/queued/in_progress`）。
`credentialsAvailable`は実際に動いているCodexセッションと利用状態の確認結果であり、
Claude secretの存在を装う値ではない。秘密情報をsnapshotへ入れない。
claimがある場合は`claimHasWork`、`claimAgeMinutes`、`claimDeclarations`も実測し、
読めない値はnullのまま渡す。fixtureを本番の入力として使わない。

## 実装と配送

当日共有ブランチ`claude/obsidian-auto-<YYYYMMDD>`を原子的な新規ref作成でclaimする。
既存refエラーの後に無条件updateしない。Runbookが許す宣言のみの死んだclaimは
所有タスク終了とPR/実装なしを再確認してfast-forwardで引き継ぐ。force push・削除は禁止。
引継ぎ中の競合は最新refを読み直し、無条件に書き戻さない。

実装・health-intake等の台帳更新より先に、候補2件と較正値を読み、Runbook §2-1の
価値契約を宣言コミットでpushする。不適格を候補名/モデル/route変更で回避しない。
修理可能な故障があればレーンFを先に評価し、直っている修理を再実装しない。
記事なら1件まで。ゲート不合格なら理由を記録し、公開のために基準を下げない。

データはローカルで利用可能な正規の取得結果を日付・カバレッジ込みで読む。
`DATA_REPORT: ready/partial/unavailable`を分け、欠損や旧日付を今日の0件としない。
GCPサービスキーを旧Actionsから取り出さない。部分データで許されるレーンだけ選ぶ。
LOGは必要な直近範囲、当日typed action reportがあるときはそのreportを使い、
Runbookの最小成果物・配信の種・公開品質検査は省略しない。

通常のPR経路を使い、マージ前に実run ID・PR番号・lane・actionを共有runs台帳へ記帳する。
記事のbaselineを取り、必要な生成物・検証を揃えて、最終HEADのSEO Validation成功後に
auto-mergeする。マージ後はlatest mainの実内容、本番statusと記事本文を照合する。
closed-unmerged、PR待ち、保守のみ、新記事公開、未確認を分ける。
古い失敗runをshippedに書き換えたり、実行成功を公開成功へ読み替えたりしない。

## 監視とロールバック

`autopilot-health.yml`はmainと本番の当日statusを検査し続ける。
旧Actionsログは手動診断の参考で、Claude cronが無いこと自体は故障ではない。
不調時はCodex実タスク・共有claim・PR・Pagesの順で確認する。
Macの未起動、利用枠上限、接続切れは無人実行の未確認/失敗として残す。

移管記録には元予約停止、保存された時刻、次回実行予定、実タスクID、公開URLを別々に残す。
当日すでに公開/保守完了なら移管テストで追加記事を作らない。
Claudeへのロールバックは所有者が選んだときだけ、Codexの同役割予約を停止してから行う。
手動workflow_dispatchを残すだけではClaudeの認証や今後の契約を保証しない。
