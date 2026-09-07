# 日次取り込みの伏字確認

2026-09-07 JST。単発Routine `trig_01N1SWZdPwKTot2SbT71UV2U` の依頼内容を、取得した実行ログと保存された成果物から確認した。Routine自身の終了証跡は未取得であり、この確認セッションを無人復旧として扱わない。

対象の修正は simplememo-api PR #244（commit `3f52472ee7866df8ea28ba6c95cbce05e250d829`）。公開フォーム由来の端末・OS・アプリ版の内訳を許可制で伏せ、件数は保持する。APIから得る写しの `facts` に `redactFacts` を適用する変更。

| 実際の定期実行 | 成果物commit | collected_at (UTC) | total | with_device | by_device.other | 許可外キー |
|---|---|---|---:|---:|---:|---:|
| [33961458095](https://github.com/simplememofast/simplememo-api/actions/runs/33961458095) | `948a0bf` | 2026-09-05T10:44:32.322Z | 27 | 2 | 2 | 0 |
| [34029257450](https://github.com/simplememofast/simplememo-api/actions/runs/34029257450) | `68c6b5b` | 2026-09-06T11:06:05.938Z | 29 | 2 | 2 | 0 |

両runのAPI上のeventはschedule、statusはcompleted、conclusionはsuccess。成功状態だけで結論せず、実ログ内のHTTP200と成果物commitの一致、修正commitが成果物commitの祖先であることを確認した。対象commitの `data/repro-facts.json` はstate=okで、端末・OS・アプリ版の全キーを修正の許可パターンと突き合わせた。伏せられた原文はこの記録へ載せない。

端末欄2件がotherへ集約され、with_device=2と一致する。totalの27→29は別日時の母集団の増加であり、伏字による増減と解釈しない。ここで確認したのはこの2回の出口であり、将来の全入力の安全性、過去のGit履歴からの除去、問い合わせそのものの解決を証明しない。

確認手順は `gh run view <run> --repo simplememofast/simplememo-api --json event,status,conclusion,jobs`、実ログの取得、`git show <commit>:data/repro-facts.json`、`git merge-base --is-ancestor 3f52472 <commit>`。ログは検査プロセス内だけで扱い、原文を公開記録へコピーしていない。

## アクションの扱い

`act-routine-run-trig_01N1SWZdPwKTot2SbT71UV2U` はacknowledgedへ移す。依頼内容は上記で確認できた一方、元Routineの終了状態は観測できていないためdoneにはしない。routine-runsの実行状態・open_findings・open_budgetを成功に書き換えない。既存のepisode比較が異なる実行/状態を観測すればアクションをopenへ戻す。同じ未確認セッションだけを毎日再調査する要求を止め、受容の根拠を残す。配点と過去の故障記録は変更しない。
