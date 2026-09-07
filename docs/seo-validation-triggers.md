# SEO Validationの起動経路

<!-- fact-check: internal -->

2026-09-07、作業ブランチへのpushとPR更新の両方で検証が起動していた設定を変更した。
作業中の検証はmain宛てPRのopened・synchronize・reopened・ready_for_reviewで実行する。
PR作成前はローカルの `node scripts/preflight.mjs` を使える。
Draftで検証が完了した後でも、Readyへ移すと検証が起動し、自動マージの判定へ進む。

PRでは既存のcheckout設定を維持し、マージ対象の内容を検査する。mainへのpushの検証、
検査コマンド、権限、IndexNowの通知条件も維持する。古いPR検証は新しい更新で取り消すが、
mainの検証はコミットごとに実行する。

自動マージは全対象ブランチでpull_request検証の成功だけを受け付ける。
移行前のブランチ定義がpush検証を発火させても、その結果ではマージしない。
現在のPRのdraft・リポジトリ・base・head SHAも照合し、検証後に更新された内容を出荷しない。
宣言を実装前にコミットする価値契約の要件は変更しない。

GitHubの仕様上、GITHUB_TOKENによる自動マージではmain pushワークフローが起動しない。
その経路のIndexNow通知は既存のauto-merge内の処理が担う。

起動回数の削減と請求額の削減は別に測る。PRチェックとpushチェックは検査する木が異なる
場合があるため、「同一コミットの検査はすべて同じ」とは扱わない。

仕様：[GitHub Actionsのイベント](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)
