# 自動マージの停止を実行履歴で確認

2026-09-09、既に発生した本番のGitHub Actions履歴を読み取り、成功した検証だけを
マージするゲートが実行を止めた例を確認した。新しい失敗PRや停止操作は作っていない。
機械可読の記録は `data/stop-drill-auto-merge-observation-20260909.json`。

| 時刻（UTC） | 観測 |
|---|---|
| 04:59:55 | [SEO Validation 34313069072](https://github.com/simplememofast/simplememo/actions/runs/34313069072)で、コミット済みの生成物が古いため検査が失敗。対象headは `c4207d1` |
| 05:00:01 | [自動マージ 34313120381](https://github.com/simplememofast/simplememo/actions/runs/34313120381)の `auto-merge` jobは `skipped`。実行stepは0件 |
| 05:11:20 | [修正版のSEO Validation 34313145190](https://github.com/simplememofast/simplememo/actions/runs/34313145190)が成功。対象headは `c479537` |
| 05:11:31 | [PR1200](https://github.com/simplememofast/simplememo/pull/1200)がマージされ、[自動マージ 34313881381](https://github.com/simplememofast/simplememo/actions/runs/34313881381)のログも修正版head `c479537`を明示 |

停止したrunのmain SHA `bd6b27b` にある `.github/workflows/auto-merge.yml` は、
`SEO Validation` の完了を受け、`conclusion == 'success'` のときだけマージjobを実行する。
その実運用jobがスキップされ、マージstepを実行しなかったことを直接確認できた。

GitHubのrun APIは元のイベント本文を返していないため、04:59の失敗runと05:00の
停止runの対応は時系列からの推定であり、親run IDの直接照合とは区別する。
一方、停止jobの状態・当時のゲート条件・後続マージの対象SHAはそれぞれ直接取得した。

今回確認したのは、成功していない検証を自動マージしない経路。
検証成功後にheadを更新する競合ケース、ロールバック、端末の機能停止、資格情報の失効を
この記録で実証したとはしない。停止機構の本番観測済み件数を2/11から3/11へ更新するが、
業務200全体のAI移管やAI実行率には加点しない。
