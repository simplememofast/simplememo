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


## Full viewport report is separate from the merge gate

`viewport-full-report.yml` runs the unchanged exhaustive report on the same PR event
merge tree and direct-main push event as SEO Validation. It has its own cancellation
group and keeps all pages, widths, Chromium and WebKit. The static nowrap check,
transport tests (including Xvfb setup), and Chromium pool integration test remain
mandatory in SEO Validation. Main Daily Validation calls both workflows separately.
No auto-merge rule, owner approval, authority boundary or token permission changes.

GITHUB_TOKEN merges do not create main push runs. The already-started PR report
continues after merge; the observer accepts only the exact same-repository merged
PR head associated with current main, under its existing provenance rules. The
checkout remains the event's merge tree, not a new checkout of that head. This is
not proof that the PR merge tree equals a later squash commit after base advances.
No new provenance claim or receipt reuse is introduced. Daily reports remain visible
but are not accepted by the observer as PR-head recovery evidence.

`viewport-health.mjs` now reads only Viewport Full Report. A green SEO Validation
cannot close a viewport action. A pending report stays pending; a missing, canceled,
incomplete, unmeasurable or wrong-source report never becomes healthy. During the
migration, old SEO reports are deliberately not used as fallback.

Local `scripts/preflight.mjs` follows the merge-gate commands; it no longer includes
the exhaustive report. Run `node scripts/check-viewport-overflow.mjs --check`
separately for the full local rendering check required by the Runbook.

## Mandatory gates run in isolated jobs

SEO Validation retains every existing mandatory check. `seo-core` keeps the
remaining steps in their original order, including the routine scope producer and
all five conditional consumers. Translations, shared chrome plus sitemap, generators,
and the three-file Autonomous Company suite each use an independent full-history
checkout of the same event revision and the same pinned Node version. Generator
writes/restores never share a worktree with readers. No artifacts or evidence are
reused across revisions, and no permissions or conditional exemptions are added.

The original `seo-check` check name is now an `always()` final aggregate. It requires
exactly all five mandatory lane results to be `success`; failure, cancellation,
skipping, missing results, and unexpected lane sets fail closed. Main-push IndexNow
notification stays after successful aggregation with its existing conditions and
nonblocking failure policy. Routine health stays independent and unchanged;
auto-merge still requires success of the entire SEO Validation workflow.

This changes dependency structure, not coverage. Local structural tests establish
step accounting, command extraction and failure propagation; only an actual run at
the published head can establish queue/setup overhead and whether the roughly
five-minute target is met. No measured runtime improvement is claimed here.
