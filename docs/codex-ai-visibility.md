# 週次AI検索露出調査 — Codexへの移管

2026-09-13、オーナーの「Codex側で巻き取るようにして」に基づく移管。
Claudeの組織利用許可の変更・再認証は不要。旧失敗runやClaude実費は保存する。

## 予約と実行

- Codex heartbeat: `simplememo-ai`、このタスクで毎週水曜06:47 JST。
  ネイティブ予約とローカルscheduler DBの両方でACTIVEを確認した。
  作成時の次回予定は2026-09-16 06:47:08 JST。自然起動の成功はまだ未観測。
- 最新mainの専用worktreeで `python3 scripts/codex-ai-visibility-probe.py` を実行する。
  作業中checkoutを切り替えない。過去の会話から5問に回答せず、スクリプトが
  固定質問ごとに別のCodex CLIセッションを起動する。
- 先に同週の観測PRとmainを確認する。進行中のPRがあれば再取得せず完了させる。
  スクリプトにも全worktree共通のローカルロックと、JSTのISO週単位の成功済み判定がある。
  取得後・PR作成前に中断した場合も、共通ローカル領域の検証済み結果を新worktreeへ再利用する。
  コマンドの成功だけで配送済みとせず、PR・CI・mainのデータまで照合する。

## 観測の契約

系列は `codex-astra-web-v1`。要求モデルは設定済みの `gpt-6-astra`、推論はmedium。
CLIイベントには実際のモデル名がないため、要求モデルとCLIの版を記録する。
Q1〜Q5の質問は旧系列と同じで、指名質問Q5を非指名言及率の分母から除外する。
モデルと実行基盤が変わるので、Claude系列や旧手動3社系列との連続比較はしない。

空の一時ディレクトリ、`--ephemeral`、ユーザー設定を読み込まない実行、
`project_doc_max_bytes=0`でリポジトリ・過去回答・AGENTSの文脈を除く。
シェル、apps、plugins、記憶、追加エージェントを無効にしてlive web searchを使う。
検索IDの開始/完了対応、searchアクション、回答、正常終了、別々の実タスクIDが
そろったものだけ有効とする。単なるURL、ページを開く操作、検索失敗は数えない。

停止キーは全体と `owner-session`。既存の全体月次枠・analysis月次枠・未レビュー超過のゲートを
各問の前に確認する。1問180秒でプロセス群を終了、5問まで、内部再試行なし。
既存ChatGPTログインを毎回確認し、保存済みAPIキー認証やAPIキー環境変数があれば停止する。APIキー追加、
利用枠リセット、上限解除はしない。Codex CLIのtoken usageは保存できるが、
ドル実費は観測不能なのでnull。旧Claudeの0.25ドル上限をCodexで強制できるとは
主張せず、Claude実費台帳へ推計や0ドルを追記しない。

## 保存・検査・監視

最新値は既存の `data/ai-visibility-probe.json`、各回の結果は
`data/ai-visibility-history/`へ保存する。旧Claudeの最終結果も同ディレクトリに
退避済み。原JSONLとstderrは `~/.config/simplememo/ai-visibility/runs/` のローカル
領域に残し、公開するのは中立な質問・回答・検索クエリ・ID・ハッシュ・使用量だけ。
回答はモデルの観測結果であり、製品の機能や推奨の正しさを保証するものではない。

```sh
python3 scripts/ai-visibility-probe.test.py
python3 scripts/codex-ai-visibility-probe.test.py
python3 scripts/codex-ai-visibility-probe.py --check-report
python3 scripts/codex-ai-visibility-probe.py --health
```

SEO Validationは観測形式とテストを確認する。過去のPRを時間経過で失敗させない。
GitHubの既存 `AI Visibility Probe` は毎日06:47 JSTにmainの結果を読む監視へ変更。
Claude実行、秘密鍵、モデル課金、観測PRの発行は行わない。有効5問が欠ける場合、
または観測から8日を超える場合に失敗し、既存Cron HealthのIssue経路で検知する。
MacやCodexが動かず観測されなかった週も、古いデータを成功とは判定し続けない。

初回の移管確認は2026-09-13 00:10〜00:12 JST、run
`63f96a63-0dad-4ebf-827e-3a838a9ea417`。5問すべて別セッションで検索完了を確認。
Q1〜Q4は本文言及・自社引用とも0/4、Q5は両方あり。サンプルは各問1回に限る。
これは手動での移管確認であり、週次予約からの無人成功とは区別する。

Issue #1193のClaude利用許可待ちは、今回の移管により不要になる。
main反映後の新監視が成功するまでAI担当で追跡し、成功確認後に移管完了として
閉じる。旧Claudeの定期runが復旧したとは記録しない。汎用のcron復旧条件は変更しない。

Codex実行の仕様: [OpenAI公式の非対話実行](https://learn.chatgpt.com/docs/non-interactive-mode)。
