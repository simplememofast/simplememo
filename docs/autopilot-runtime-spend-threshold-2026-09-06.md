# 実行中の支出閾値と停止理由

通常run [33996430959](https://github.com/simplememofast/simplememo/actions/runs/33996430959)
は2026-09-05 22:37:46〜23:22:58 UTCにモデルを実行し、250ターン上限で失敗した。
SDKの記録は251ターン・permission_denials_count=0。実費は
$19.600872199999998で、終了後にarticleの1回上限$10の超過が検出された。
旧workflowは--max-turnsだけを渡しており、金額の閾値を実行中に参照していなかった。

## 変更

`autopilot-budget.mjs --runtime-budget --task KIND` が既存の
`rules.KIND.max_usd_per_run` を読み、workflowのroute出力からSDKの
`--max-budget-usd`へ渡す。月次動作がskip_runなら、記録済み支出を引いた残枠の
上界との小さい方を使う。未計測の副系費用を無料・利用可能残高へ読み替えない。
warn_onlyの月次方針、予算額、モデル、250ターン上限は変更しない。

不正値・非有限値・未知の種別・枠切れ・当該種別の未レビュー超過からは、正の
実行許可額を返さない。既存の月次ゲート・超過レビュー・実費記録も維持する。
未レビュー超過をAIが解除する変更ではない。自律施策のCIでは予算処理と
停止理由の検査コードも自己変更の禁止対象とする。

SDK結果が`error_max_budget_usd`または`error_max_turns`で、is_error・実際の費用/
ターン数・渡した閾値も一致する場合、既知の停止として記録する。追加の有料認証診断を
呼ばず、未完の失敗を維持する。判定処理はモデル開始前の固定SHAのworktreeから実行する。
結果欠測・矛盾・別のエラーはunknownとし、資格情報の成否を推測しない。
Actは既知の上限停止を資格情報不良に変換せず、未完の作業と実費の確認へ回す。

## 固定版での実測

[固定したactionの引数処理](https://github.com/anthropics/claude-code-action/blob/16b3b310c3d7b5279df73130324d5205aeea8eac/base-action/src/parse-sdk-options.ts)
はCLI引数をextraArgsで渡す。
[公式SDKの説明](https://code.claude.com/docs/en/agent-sdk/agent-loop#turns-and-budget)
も支出閾値と`error_max_budget_usd`を案内している。

別キャッシュへSDK 0.3.245を配置し、同梱CLI 2.1.245を使用した。資格情報を持たない
一時ディレクトリからloopback HTTP検体だけへ接続し、同じRead→完了の応答を返した。
実際のモデル・外部API・課金・本番ファイルへの操作はない。

| 条件 | 検体へのモデル要求 | CLI結果 | 検体usageからの計算額 |
|---|---:|---|---:|
| 支出閾値なし | 2回 | success / exit 0 | $0.09 |
| 閾値$0.0001 | 1回 | error_max_budget_usd / exit 1 | $0.045 |

この結果が示すのは次の呼出の抑止。費用は応答後に加算されるため、進行中の応答分は
閾値を超え得る。請求額が厳密に予算以下になること、実際の作業を予算内で完了できることは
証明していない。検体の計算額を実費台帳・自律成果へ加点していない。
実費超過の事後検知と人によるレビューを残す理由でもある。

## 検査

予算の自己検査15件には、実workflowのroute shell→実CLI→step outputと、article/
repairで異なるポリシー値を渡す照合を含む。月次残枠無視、未レビュー超過無視、
不正値許容、producer切断、consumer切断、金額直書き、CLI入口切断の7変異を検出した。

認証診断12検体に加え、停止理由13検体を実CLIと実workflow shellで検査した。
成功状態とerror subtypeが矛盾する検体が最初は不足しており、その判定を外す変異が
通ったため追加した。追加後は誤分類を検出した。費用照合削除、診断抑止削除、
出力切断、分類step無効化、Act読取切断もそれぞれ検出した。Actの自己検査611件と
全171件のpreflightも通過した。

導入後の通常運転での閾値停止・未完作業の保全・費用内の出荷は、実際の記録で別途確認する。
過去のrunのGitHub結論、実費、起動元、超過レビューは書き換えていない。

## 別途残る観測の問題

00:13 UTC時点のmainには上記runの実費が記録されているが、task_kindは欠測だった。
従来の種別ごとの超過ゲートは、この行をarticleの超過としてまだ照合できない。
ログの実行時種別を正しく取り込む経路は別途必要で、今回のSDK配線だけで解消したとは扱わない。
