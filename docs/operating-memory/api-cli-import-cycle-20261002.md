# CLI起動時のimport循環を検査する

2026-10-02の後追い学習。対象はSimpleMemo APIのバックアップ候補v2と、修正を配送した[PR381](https://github.com/simplememofast/simplememo-api/pull/381)。この記録は通常コード配送の学習であり、Companyの自律実行や本番復旧の証明ではない。

## 実際に起きたこと

候補v2の元restore suiteは36PASS・3FAILだった。legacy manifest欠測、正常な`--out`、改変rawの`--restore`を確認する実CLI子プロセスがexit13で終了した。

`backup-d1.mjs`のmain分岐が`await import('./restore-drill.mjs')`を待ち、`restore-drill.mjs`は逆方向に`backup-d1.mjs`を静的importしていた。CLIとして起動するとmainの評価完了を互いに待つ。ヘルパーとしてimportするwrapperではmain分岐に入らないため、この起動経路の成功は判断できない。

修正は純関数の静的import1行追加と、main内のawait動的import2行削除だけ。39件のテスト期待値、SQL/FK/REST処理、復旧後の人間再開境界は維持した。元の逆向き参照は実行時の関数内で使い、SQLiteの読み込みも遅延したままである。

## 修正の確認範囲

- 同じ39件が隔離ローカルNode24.19.0で39/39PASS。
- [通常PRのrestore check](https://github.com/simplememofast/simplememo-api/actions/runs/36903178778/job/110507079372)はNode22.23.3で39/39PASS。`:memory:` migrationで42テーブルを確認した。
- [実マージfdde81b](https://github.com/simplememofast/simplememo-api/commit/fdde81b62a8cc1dd9b7e48a981c178dafabd30f2)の4ファイルが検査済み候補と一致し、試験済みPRのtreeとも一致した。[main通常CI](https://github.com/simplememofast/simplememo-api/actions/runs/36904407907)の3チェックも成功した。

この42はローカル演習の実schemaであり、本番DBの実在確認ではない。通常Build成功・version作成から、active provider、本番backup/restore、正しい復旧点、安全停止・人間再開を推定しない。

## 次の変更で守ること

逆向きimportを含むCLIのmain分岐にawaitを加えるときは、元のCLI入口を子プロセスで検査する。隔離fixture・fake export・remote拒否の既存テストでexit、期待拒否、出力を確認し、wrapper-importや構文検査だけで合格にしない。循環import自体を一律に禁止する条件ではない。

今回の後追い記録を新しい再発防止実績や自律率の改善として数えない。v2失敗原本を残し、具体的な3行変更後の別実行として39PASSを扱う。

## 保存済み一次根拠

個人情報・秘密・raw出力・私有絶対パスを含めず、受領書のSHA256だけを記す。

- v2実失敗: `dc4bf5be560f80d824d73c6096a903cf9634cfca8eadd9c6f10f7dd2db3b9fa4`
- v3実39PASS: `ee024274a270ed2ce13acc884ba744f1ce05c8fcc0110501444ac96f4974b6bc`
- 通常PR Node22: `39781974d32f1b1fb6c5db981b7392d129f30c14cc349130b83b9e92ae330aee`
- 実配送の独立受入: `a67d9e521adc675b03a6bfa35284762f4da2be33dd1674c5f766b23bc45a1a4f`
