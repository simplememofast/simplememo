# Obsidian autopilot: Mac Codex execution contract

2026-09-07の所有者指示による実行元の移管。記事の判断・品質・排他・停止の要件は
`docs/obsidian/AUTOPILOT_RUNBOOK.md`が正本であり、毎回全文を読む。
この文書はClaude固有の実行環境だけを対応させる。設定変更と無人初回の公開成功は別判定。

**予約保存の確認状況（2026-09-07 16:28 JST）:** 所有者が「A：独立タスクで定期運転を復旧」を選択。
ネイティブ予約ツールで下表の2件を作成し、ローカルscheduler DBと各automation.tomlの両方で
`ACTIVE`・`cron`・SimpleMemoプロジェクトへの紐付けを確認した。毎回独立したローカルタスクを起動する。
保存されたモデルは `gpt-6-astra`、reasoningは `medium`（作成時のローカル設定に合わせた）。

作成直後の `next_run_at` は主系が **2026-09-08 06:01:49 JST**、補完が
**2026-09-08 09:20:01 JST**。予定スロットは下表どおりで、次回実行時刻とは区別する。
旧ID `obsidian-autopilot-retry-standby` は未保存だった設計上のIDであり、実予約の識別には使わない。
主系と補完を別予約にしたのは、分の異なる予定を組み合わせて意図しない追加実行を作らないため。
予約保存は確認済みだが、**初回の自然起動・無人運転・公開成功はまだ未確認**。
旧Claude予約は再有効化していない。追加作成前には下表の実IDを読み戻し、重複を避ける。

**旧再試行の停止理由（2026-09-07 19:12 JST）:** 実APIを全3ページ読み直し、
retry `trig_01ESF9AHax6buS9X1pdFv657` の `enabled=false` を再確認した。
所有者の移管指示と上記2予約の保存状態を根拠に、`data/routine-runs.json` の当該1件を
原因未判定の `open_findings` から理由付きの `intentional_stops` へ移した。
元の発見・観測証跡は `previous_finding` に保存し、実件数に合わせ `open_budget` は9から8へ減らした。
既存の `routine_resolved` はこの停止理由と観測を照合して調査を閉じられる。
これは旧予約の停止理由の確定であり、利用枠障害の復旧や新予約の無人成功ではない。
過去の故障run、復旧実績、自律スコアの評価基準は変更していない。

予約の設定後は、保存された実ID・有効状態・予定時刻・次回実行時刻を読み戻す。
ツールのカード表示や本書のマージを保存完了とせず、構造化した保存状態が取得できなければ
読み取り専用のローカル予約記録と設定ファイルで確認する。予約保存、予約からの実タスクの
起動、停止/予算ゲートの通過、PRと本番の一致をそれぞれ別の証跡として残す。
保存を確認できない段階では、自然起動・無人運転・公開成功として記帳しない。

## 実行元と識別

| 用途 | 予定（Asia/Tokyo） | automation ID | 既存route / stop key |
|---|---|---|---|
| 主系 | 06:00 | `obsidian` | `actions` |
| 未完日の補完 | 09:20 / 12:20 | `obsidian-2` | `ccr-0920` |
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

1. latest mainを専用worktreeへ取得し、`CLAUDE.md`、
   `docs/obsidian/AUTOPILOT_RUNBOOK.md`、本書、`docs/cost-delegation.md`を全文読む。
   ユーザーのcheckoutを変更しない。Codexではこのリポジトリ内の手順を正本とし、
   旧Claude環境のローカルタスクSKILLや`references/retry-procedure-v5.md`を前提にしない。
   必要な手順や根拠が不足する場合は推測して進めず、未確認として止まる。
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
   費用判断は `docs/cost-delegation.md` に従い、開始前の費用想定を実タスクID付きで保存する。
   有料の追加実行・再試行・方針変更の前には最新の総費用見込みを
   `autopilot-budget.mjs --check-cost-forecast` に渡す。5倍超なら追加支出前に所有者へ上げる。
   Codexの実費が読めなければ金額を捏造せず、観測不能として既存の作業時間・月次枠を守る。
4. GitHub接続で当日共有ブランチ、同headのPR（state=all）、latest mainのstatus、
   本番`https://simplememofast.com/data/autopilot-status.json`を読む。
   別の実行中/queuedの旧Actions runとCodexタスクも確認する。
   Codexはautomation_runs等のローカル予約記録から対象タスクIDを取得し、
   `wait_threads`/`read_thread`の実状態を確認する。現在の自タスクは除く。
   確認対象は予約一覧の未終了実行と、当日claim/未解決PRの所有タスク。
   過去の出荷台帳に残るIDだけを、新しい日の排他所有者として持ち越さない。
   そのIDが当日claim等に結び付く場合は終了証跡が必要で、読めなければ止まる。
   未解決PR・当日claimがないこと、予約実行一覧を完全に取得できたことも根拠に残す。
   APIでタスクが見つからない場合は、最新mainの
   `python3 scripts/codex-routine-observer.py --thread-state <実タスクUUID>`で
   指定IDのローカルSQLiteとsession/archived sessionの終了証跡を読む。
   `state:completed`は直近ターンの終了だけを示し、業務成功・出荷を意味しない。
   `in_progress`は稼働中、`unknown`・読取エラーは未確認として止まる。
   経過90分や予約一覧のARCHIVED表示だけで終了扱いしない。claim直前にも再確認する。
5. 5分以内の根拠をローカルのsnapshotへ保存し、
   `python3 scripts/codex-routine-observer.py --preflight <snapshot.json>`を実行する。
   このラッパーは既存のNodeゲートを呼び、実行中の`CODEX_THREAD_ID`・初回ターン・
   routeに結び付けた判定を非公開の`~/.codex/simplememo-autopilot-receipts/`へ保存する。
   出力の`decision.run`を確認する。後日の手動フォローアップは初回判定を上書きできない。
   一度許可された初回ターンを、後続の拒否判定で未着手スキップに変えない。
   下記の各値には取得元・取得時刻を別のローカル証跡として添える。
   `decision.run:false`または検査例外なら実装・claim・投稿へ進まない。forceは使わない。
   Routine Observerが判定ハッシュと初回終了状態を公開台帳へ収集し、Actが未記帳の
   失敗・中断・証拠のあるスキップだけを取り込む。正常終了だけで出荷・修復済みとしない。
   自動検知の帰属には、初めて終了を観測した回のlaunchd親PID・interval起動・
   インストール済み監視スクリプトの一致を検証した証跡を使う。
   既に観測済みの過去行を、後日の定期監視で自動検知へ付け替えない。
   `preflight_error`は既存レーンFへ送る。予算・停止による拒否は修理による解除対象にしない。

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
