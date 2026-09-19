# Backlog Recovery: 2026-09-19 continuation

担当: SimpleMemo Developer。照合基準: main `a65042d101778d09a23d34958a2bc7eb96d7524e`。
この記録はユーザー依頼による修復・文書反映であり、自律運転の成果点や実験成功へ加算しない。

## 現在の判定

| 対象 | 確認できた成果 | 未完了条件 |
|---|---|---|
| [Issue #497](https://github.com/simplememofast/simplememo/issues/497) | PR #1484はCI成功後にmain・Pagesへ反映。日英ページ分離の実装あり | 既存担当が本番全対象readbackと残る翻訳・head変換の補正を継続中。Issue openを維持 |
| [Draft PR #1047](https://github.com/simplememofast/simplememo/pull/1047) | 公開版の参照、GCDソース、既存GA4完全日集計、D1の限定照会、共存判定を再照合 | QA短縮URLから公開版fresh install・既存利用者遷移・first-open・D1の一貫した証拠、内部除外、実通信、個別実験の干渉解消。Draft維持 |
| [Issue #1454](https://github.com/simplememofast/simplememo/issues/1454) | PR #1487の初動8件の資料はmain反映済み。現在窓口と原票取得経路を追加確認 | Ahrefs全119グループと全履歴の照合、現行公開版実機資料、媒体別の適格性・紹介権限。営業・掲載は未完了 |

文書が配備されたことと3系統の全実完了は別。上表の未完了を消すために本文、母数、失敗、停止条件を削除しない。

## 作業保全と担当

2026-09-19T11:22:31Z、指定Macは接続可能だった。既存ブランチ
`Codex/resolve-all-backlog-20260919` は `bc374087609846264ffecfbf4baa5bd13b5dc568`。
未コミット365ファイルを非公開領域へ保存し、binary patch・元ファイル・SHA-256一覧を確保した。
元worktreeの書換え、リセット、削除、他人のプロセス終了は行っていない。
cwdのプロセス確認では、この確認処理以外の同worktree利用を検出しなかったが、他作業コピーの担当不存在を意味しない。

PR #1484の既存担当が稼働中のため、その実装・本番readback・close判定を重複しない。
この継続では独立worktreeから文書と送信下書きの名義修正だけを扱う。
別セッションのPR #1490で更新された100候補台帳は最新mainを正とし、古い写しを再適用しない。

最新mainの全体およびowner-sessionのemergency-stopはfalse。
`CLAUDE.md`、Cloudflareの私有Runbook、authority matrix、運転Runbook、identity policy、対象Issue/PRの本文と最新コメントを照合した。
停止解除、権限・資格情報の変更、購入、審査・観測期間の短縮は行わない。

## #497: 出荷済みの範囲と新たな失敗

- [PR #1484](https://github.com/simplememofast/simplememo/pull/1484): 検証head `fa2a8a122de48ebcce5563338b6d3a0aa61cdd91`、merge `20748de41d2364bfaa59191f111de25e1c81a702`、2026-09-19T11:17:40Z。
- [移行記録](i18n-split-2026-09-19.md): 156分離ページ、新規EN155面、194組、SEO 0 errors / 0 warnings、QR46件、回帰検査とmobile表示確認を参照。元checkpointの365ファイルをそのまま出荷したわけではない。
- `en/captio/`のCTAだけの薄い抽出物は現在mainのENペアとして採用せず、`/captio/`はJA-only cleanupに残る。本文削除による検出0を完成証拠にしない。
- 公開後readbackは既存担当が402面を照合中。一括取得のアクセス制限は成功や不存在へ変換しない。

追加の合成検体で、`normalize_i18n_head.py`の実際の`replace_i18n_lines`を実行した。
RSS alternateと本文は保持された一方、複数行scriptのテンプレート内canonicalと、複数行コメント内hreflangの見本タグが削除された。
これはHTML構文を見ずに所有タグらしい行を除去するための失敗である。
既存担当に再現条件を引き継いだ。公開ページで当該破損が既に発生したという証拠ではない。担当からは実head・実タグ範囲だけを変換する補正、保持テスト、旧関数へ差し替えると失敗する反証テスト、全431対象のdry-run差分0が完了したとの報告を受けた。これは担当のローカル検証報告であり、補正PRのCI・配備・本番readbackはまだ別のゲートとして残る。

既存担当の補正では、実headに限定した変換、RSS・コメント・script・Smart App Banner保持、inline head、新規ファイル、実変換と再実行の冪等性を同じ差分で確認する。
残るalt/aria-label/用語構造化データの日本語も確認する。JA本文、言語往復、両言語mobile、canonical/hreflang/FAQ、画像・QR・CPP・CTA計測の検査を維持する。
補正PRの同一SHA CI・本番readbackまで揃ってからIssueを閉じる。

## #1047: 公開条件の実測

詳細は [OneLink readiness](growth/onelink-pilot-readiness-20260919.md)。
現行ソースの共存判定は、全サイト観測2件を非排他として認める一方、Obsidianを含むvideo・internal-linkの2件に干渉を検出した。
`running`という文字列だけを理由にした判定ではない。
古いPR headをマージせず、条件が揃った時点の最新mainから冒頭CTA1個の最小差分を作る。
実開始時刻は未発生であり、今回の記録日を開始日へ転用しない。

## #1454 / #1487: 準備、送信、掲載を分ける

基準は [初動8件の調査](seo/ja-editorial-first8-review-20260919.md) と
元の [100候補台帳](../growth/plans/ja-editorial-links-2026-09-18.json)。
PR #1490の`asset_audit`や`submission_window`は資料の所在・窓口の観測であり、全履歴の照合や公開版実機検証、送信許可を代替しない。
`planned_not_activated`、`automatic_outreach:false`、候補の`outreach_authorized:false`を維持する。

PR #1487は2026-09-19T10:37:54Zに`c2a04486d2d220e26ff91334cdea884277f370f6`へ統合済み。
同SHAのCloudflare deployment `53cfa4d3-58b7-4734-a57e-11c31906b786`はsuccess。
PR SEO Validation run [35437403562](https://github.com/simplememofast/simplememo/actions/runs/35437403562) はsuccess。
main側SEOの`check`は [35437960955](https://github.com/simplememofast/simplememo/actions/runs/35437960955) でskippedと読み戻した。
「mainの全SEO再検査も成功」とは記録しない。新証拠のない再実行は行わない。

2026-09-19の既存AhrefsログインではSimpleMemoプロジェクトを確認できたが、参照ドメイン詳細は月間行数上限を表示し、リセット日は10月3日だった。
原票の追加69グループは取得できていない。ダッシュボードの現在の参照ドメイン総数は、元119グループの全明細・履歴の代わりにはならない。
ローカルで見つかった内部URL・anchor・4xx等の監査CSVも全被リンク原票とは異なる。
上限回避、別資格情報の発行、購入はしない。既存の認可経路が利用可能になるか、既存の完全原票を取得できた時点で再開する。

関連の公開下書きは承認済み名義へ修正した。下書きの存在や「ASSET_READY」を送信可能判定へ直結しない。
Gmail検索0件も未送信証明にしない。送信試行、相手への到達、受領・返信、記事掲載、自社URLへの実リンク確認は独立した状態として記録する。
私信、個人アドレス、原票、端末識別子、analytics行は公開文書に含めない。

## 継続条件

- 5.8.67の審査・公開、4件初回送信の72h評価、9月23日GSC監査は専任タスクの証拠を再利用する。新しい提出・観測・予約を重複作成しない。
- 単なる実行枠待ちや計測成熟待ちは人間タスクにしない。安全に実行可能な項目を先に進め、本人操作・新しい意思決定が不可欠になった場合だけ具体的に通知する。
- Backlog Recoveryのwatchは最大48回。各回で実行回数、対象SHA、変化した証拠、次の機械判定を私有記録へ残す。変化なしのコメント・CI再実行はしない。
- 3系統が全実完了した場合のみ既存Backlog Recoveryを停止する。他の専任タスクは変更しない。48回上限への到達を成功扱いせず、未完理由を保持する。
- 既存の「SimpleMemo Backlog Recovery」を認可済みのスケジュール画面で読み戻し、監視中・実行中、指示内の最大48回と専任担当を尊重する条件を確認した。設定は変更せず、新規watchも作成しない。今回の画面から消費済み回数・残回数は確定できないため、48回未使用とは記録しない。
- この文書の保存や既存予約の表示は、その回の処理成功や3系統完了の証拠ではない。

## この文書反映の検証

文書と送信下書きの修正を通常のpreflight・PR・同一SHA CI・main・Pagesで反映する。
配備後はGitHubのblob一致と、docsに対する既存の公開遮断を読み戻す。docs URLの403/404を製品ページの公開成功や障害へ読み替えない。
この反映のPR/CI/deploymentとreadbackの証拠はPRの最終記録へ追記する。
