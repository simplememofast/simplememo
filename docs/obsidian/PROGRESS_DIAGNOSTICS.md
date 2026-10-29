# Autopilot の途中診断

2026-10-29 run `40803103665` は、75分の action 上限で終了した。
保存された head は `ba210136802e8d06a59d3a5647b23a214e116dc4`。
SDK初期化から最初の宣言コミットまで約65分あり、その内訳は未観測。
終了後にしか書かれない execution JSON が欠けたため、費用も不明のまま。
この変更は過去の時間・費用を復元せず、保存済みの11ファイルを再生成しない。

## 保存するもの

`scripts/lib/autopilot-progress.mjs` はモデル開始前に workflow のコミットから
取り出す。モデルは `context / selection / declaration / implementation /
validation / record / handoff` の各工程の開始・終了で前景の記録コマンドを呼ぶ。
JSONL の各行を同期書き込みし、`fsync` が済んでから戻る。
時刻は記録器が UTC で付け、観測した終了値だけを整数で受け取る。
不明な終了値は null、検証状態は unknown。観測した検証の終了値があっても
`reported_passed / reported_failed` とし、独立した検証とは呼ばない。

保存先は runner temp の固定ファイル。256行・128 KiBを上限とし、過去の行を
上書きしない。会話・SDK内容・コマンド・パス・検索結果・秘密・自由文は受け取らない。
ファイル・行の型、固定語、日時、連番を読み直してから出力し、余分なキーも拒否する。
リンク、通常ファイルでないもの、過大入力を拒否する。最後の行が書きかけなら
それ以前の検査済み行だけを残し、truncated と記す。

主モデルの終了直後、既存の再開・probe より前に、workflow のコミットから改めて
取り出した記録器で `autopilot-progress-<run ID>-<attempt>` を保存する（7日）。
upload は新規ディレクトリ内の投影済み JSON だけで、生の journal は渡さない。
記録・保存・upload は非致命的で、成功・公開・費用の判定を変更しない。
追加する3段は各1分以内。model の start/end は前後の記録器の到達時刻であり、
SDK内部の開始・終了時刻や厳密な所要時間ではない。
費用は収集しない（`cost_observation: not_collected`）。不明費用を0にしない既存処理は維持する。

## 保証の境界

- fsync は記録済みの行を action の強制終了から守る。モデルが記録しなかった工程、
  思考時間やSDK内部の待ち時間は観測できない。無記録の区間を「停止」と断定しない。
- journal と記録器はモデルと同じ runner にある。すべて `untrusted_runner` の
  診断資料であり、改ざん耐性・工程完了・検証合格・公開許可の証拠にはしない。
- action timeout 後の後段が動けば artifact を回収できる。ジョブ全体のキャンセル、
  runner 消失、ジョブ上限、upload障害では回収を保証しない。モデル内コマンドの
  stdout が Actions のログへ逐次出ることにも依存しない。
- 75分を延長せず、予算・権限・actionの固定版・既存の再開条件を変更しない。
  内側の終了期限、SDKの途中イベント、独立した永続先への送信は未実装の別設計。
  この変更だけでタイムアウトの解消や完走は保証しない。
- 生成localeの touches は既存の `decision-ci --verify-local` が差分と照合する。
  候補選択前の静的な依存閉包検査は別件。古い不変の宣言を遡って書き換えず、
  カタログ・registry・生成JS/画像等も含む範囲を決めてから追加する。

## 本番適用前

この候補はローカル検証用。push・PR操作・merge・deploy・workflow dispatch、
外部モデルの起動、費用の発生は行わない。

関連する既存PRは先に読み、取り込んでいない。
[#2199](https://github.com/simplememofast/simplememo/pull/2199) は同じ workflow の
プロンプト手順5、[#2126](https://github.com/simplememofast/simplememo/pull/2126) は
同じ workflow と `autopilot-publish.mjs` を変更するため、適用順で再照合が必要。
[#2204](https://github.com/simplememofast/simplememo/pull/2204) の失敗台帳、
[#1603](https://github.com/simplememofast/simplememo/pull/1603) の復旧許可案、
[#2178](https://github.com/simplememofast/simplememo/pull/2178) のviewport案とはファイル重複なし。
台帳・復旧許可・封じ込めの変更はこの候補に含めない。

適用前に最新mainとの配線検査をやり直し、上の競合を確認する。
実際の Actions における timeout 後の artifact 回収はオフライン検査では未実証。
別途許可された実行で確かめるまで、運転復旧済みと記帳しない。
