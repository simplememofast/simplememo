# PR TIMESのD+14指標取得と台帳反映

2026-09-07更新。現行の実行担当は、このMacのGPT/Codex定期タスク `pr-d14-capture`（毎日10:00 JST）。旧Claudeタスクは停止済み。接続済みChromeで分析画面を読み、利用可能なGitHub接続で検証済みの台帳差分をPRへ届ける。

この文書は対象リポジトリのローカルファイルとして読む。タスクの正本は移行プロジェクトの `scheduled/pr-d14-capture/SKILL.md`、スケジュールは `scheduled-tasks.json` と保存済みautomation。旧Coworkの環境ID・ツール名・git proxyエラーを現在の接続可否の証拠にしない。以前の調査記録はこのファイルのGit履歴に残っている。

## 1. 対象と期限

最新の `origin/main` を取得し、対象リポジトリの開発規約を確認する。ユーザーの作業チェックアウトをリセットせず、台帳を変更する作業には清潔な個別worktreeを使う。

```sh
node scripts/pr-evaluation-due.mjs --json
```

このスクリプトが返す `id` と `missing` を使う。`type: pr_release`、`status: running`、`evaluation_at` がJSTの当日以前で、転記先に値のないものだけが対象になる。空配列なら指標取得・台帳編集・PR作成を行わない。タスクが接続点検を指示している場合は、その結果だけをローカルへ残す。

2026-09-07に確認したPR⑥ `pr-2026-rsi-autopilot` は、配信日2026-09-03、評価日2026-09-17、転記先5項目はすべてnullだった。これは固定の実行条件ではなく確認記録であり、毎回最新台帳を読む。D+1の既存値をD+14へ流用しない。

## 2. アカウント・対象・集計期間

接続済みChromeを、その実行で利用できるCUAの画面操作APIで扱う。ログイン後のページを公開HTTP取得へ置き換えない。ページ内部API・隠し状態・秘密情報を読む迂回は使わない。

リリースの公開URLは `growth/data/annotations.json` の対象行から得る。企業と対象リリースが一致することを確認し、PR TIMES管理画面の「分析データ」→「レポート」を開く。

PR⑥で確認した経路は次の通り。別のリリースIDを推測して開かない。

- 公開URL: https://prtimes.jp/main/html/rd/p/000000009.000182412.html
- 一覧: https://prtimes.jp/my_c3/action.php?run=mypage&page=accessreleasedata&date_s=2026-09-03&date_e=2026-09-17
- 詳細: https://prtimes.jp/my_c3/action.php?run=mypage&page=accessreleasedataday&release_id=9&date_s=2026-09-03&date_e=2026-09-17

開始日を配信日、終了日を評価日に固定する。遅れて取得する場合も終了日を延長しない。URLのクエリだけでなく、画面の開始日・終了日を照合する。未来の日付が当日へ短縮される挙動を確認済みなので、評価前の画面をD+14として扱わない。評価日当日に取得する場合は、最終日が途中集計であることと取得時刻を記録する。

対象行の公開URL、詳細の見出し・公開日時・「公開済みページ」を照合する。一覧上部の会社合計を使わない。詳細から一覧へ戻った時にも日付を確認する。

## 3. 五つの指標

| フィールド | 取得・算出方法 |
|---|---|
| `pv` | 対象リリースの「ページビュー」。非負整数。会社合計や日別1行を転記しない |
| `syndication_count` | 対象の「転載サイト」全件数。「掲載メディア一覧」の見出しの全件数と照合 |
| `mobile_ratio` | スマートフォンの%を100で割る。PC・スマートフォン・タブレットのラベルを毎回確認し、日別比率を単純平均しない |
| `google_referral_ratio` | Google系参照元の訪問者数合計÷表示された全参照元行の訪問者数合計。記事全体のUUやPVを分母にしない |
| `day1_senders_vs_prev3avg` | 配信当日のアプリ送信者数÷前3日平均。PR TIMESにはない。認可済みのアプリ側実測経路が使える場合だけ取得し、不明はnull |

参照元サイト一覧は全ページを読み、読んだ行数と全件数を照合する。Google検索・ニュース・Googleアプリ等の採用行を列挙し、分子・分母を残す。`google` を含む文字列を一律に加算しない。全行未取得、分類不明、期間不一致、分母0なら比率はnull。Googleニュースからの参照だけでDiscover流入を確認したとは報告しない。

転載数はPR TIMESが捕捉した件数であり、インターネット全体の掲載数ではない。媒体が示す欠測や遅延も記録する。アプリ側の値を得るために、別サービスの秘密を読み出したり認証制限を回避したりしない。

読めた値は1項目ごとに、取得時刻・対象URL・表示期間・項目ラベル・単位・画面上の根拠とともに、タスクの非公開ローカル記録へ保存する。未取得はnullにし、0や推測値で埋めない。分析画面の閲覧と公開リポジトリへ載せる範囲は、既存のユーザー許可で照合する。公開範囲が不明なら数値はローカルに保ち、PRへ勝手に追加しない。

## 4. 部分取得からの再開

`scripts/pr-evaluation-due.mjs` は、転記先の5項目のどれかに値があれば、手作業と競合しないよう対象から外す。したがって、部分取得のまま `discover_boarding_post` に書くと翌日の自動再試行が止まる。

- `pv`・`syndication_count`・判定に必要な2比率が揃うまでは、値を `logs/capture-YYYYMMDD.json` に保ち、確定台帳へ部分転記しない。
- 次回は最新mainの対象行とローカル取得記録を照合する。取得対象・期間・単位が一致する確認済み値を再利用し、不足分を埋める。
- 判定不能なら実行結果に `measurement_failed` 相当の理由を残す。実験の `status: evaluated` やアクションの `done` で隠さない。
- 既に別の担当が一部を転記した行は、最新mainと証拠を照合して扱いを判断する。既存値を消して期限判定を再通過させない。

送信者比率だけ取得できない場合は、他の必要値が揃えばnullと理由を明記して確定できる。

## 5. 判定と三つの転記先

```text
boarded = google_referral_ratio > 0.9 AND mobile_ratio > 0.5
```

どちらかの比率がnullなら `boarded` もnull。判定はこの目安に基づくもので、流入原因の実証と混同しない。D-SCOREの予測とずれた場合も、相関する要因を原因と断定しない。

確定転記は、期限・対象・期間・公開範囲を確認し、必要値が揃った場合に行う。対象行以外を変えない。

1. `growth/experiments/experiments.json`: `discover_boarding_post` の5値と `boarded`、`decision`、`evaluated_at` を記録する。decisionは `growth/lib/ledger.mjs` の `DECISIONS` から選ぶ。非乗車は `iterate`。「乗車」「非乗車」をdecisionへ入れない。判定不能のまま確定・完了にしない。
2. `growth/data/annotations.json`: 対象PRのラベルをD+14の実測値へ更新し、既存の配信日・見出し・注記を必要な範囲で保持する。`n,nnnPV`、`転載nn`、`D-SCORE nn`、`乗車`/`非乗車` の読める形式を使う。「非乗車」以外の場所に「乗車判定」と書くと既存パーサがtrueと読むため避ける。
3. `data/autopilot-actions.json`: 対象アクションを `done` にする場合、`closed_jst` と実測値・判定の `evidence` を同時に記録する。完了条件を満たさなければ閉じない。並行タスクの行や追記を巻き戻さない。

**この取得タスクでは `d_score_pre` を再採点しない。**既存の点数と採点履歴を保持し、「再採点は未実施」と報告する。採点時刻の警告を消すために点数・実験状態・検査スクリプトを変えない。

PR⑥は既にD+1の値がannotationsにあるため、backtestの件数nが増えることを合格条件にしない。対象PRのPVが今回の実測へ更新されたことと、他のPRの値が保たれたことを確認する。

提出前に以下を実行し、失敗を解消する。

```sh
node scripts/pr-evaluation-due.mjs --selftest
node growth/scripts/check-experiments.mjs
node growth/scripts/d-score.mjs --check
node scripts/autopilot-act.mjs --check
node growth/scripts/d-score.mjs --backtest
```

## 6. GitHubへの保存とPR

CLIのGit認証と、接続済みGitHubの認証は別に確認する。`git push` が認証不足、または `gh` が未導入という理由だけで、利用可能なGitHub接続も使用不能とは判断しない。2026-09-07にはこのMacのGitHub接続が対象リポジトリの `permissions.push: true` を返した。各実行の実際の成否は別に確認する。

CLIが使える場合は通常のGit経路を使える。使えない場合は、利用可能なGitHub connectorの対応ツールで、同じリポジトリの認可範囲内に保存する。

1. 最新mainのcommit SHAとtree SHAを読み、ローカルで検証した基点と一致することを確認する。更新されていたら新しいmainへ対象行だけを適用し直して検証する。
2. 最新treeを `base_tree_sha` として、変更対象ファイルだけを含むtreeを作る。`create_tree` の基点を省略してリポジトリを作り直さない。
3. 同じ基点commitを親にしてcommitを作り、開発規約どおりの `claude/` ブランチへ保存する。既存ブランチがある場合は、保存済みcommitとリモートの状態を照合する。`force` 更新で他の変更を上書きしない。
4. 既存PRを照合して重複作成を避け、対象差分のPRを1件作る。PRのhead SHAと実際の変更ファイルを検証する。PR作成の成功だけでmain反映済みにしない。
5. そのhead SHAのSEO Validationが成功したことと、PRのマージを確認する。マージ前にheadが変わったら新しい検証を待つ。既にマージされたPRへ後から追加commitを積まない。
6. 最新mainの対象3ファイルを読み、今回の値と証拠が反映されたことを内容で確認する。squash mergeのため、祖先判定だけを完了証拠にしない。

tree SHA・commit SHA・branch・PR番号を、各操作の成功ごとにローカルへ保存する。タイムアウト等で結果が曖昧なら同じbranch/PRを調べ、確認前に作り直さない。403等で実際に拒否されたら、その経路の失敗を記録し、認証を迂回しない。

保存経路が使えなくても取得値を捨てず、`logs/capture-YYYYMMDD.json` と `logs/ledger-YYYYMMDD.patch` に残す。main未反映を明記する。許可のないメール送信や別サービスへの転送はしない。

## 7. 結果の記録

`run-result.json` には、期限対象の有無、取得できた項目、ローカル保存先、PR、CI、mainの内容確認を別々に記録する。未確認を成功や0件へ置き換えない。取得前・取得途中・取得済みだが未反映・main反映済みを区別する。

期限前の経路確認、手順書の更新、GitHubの権限確認は、D+14当日の取得・転記の完了ではない。今回開いたブラウザタブだけ閉じ、旧Claude側を再開して二重実行を起こさない。
