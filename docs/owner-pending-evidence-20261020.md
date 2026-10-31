# オーナー判断待ち2件の照合（2026-10-20 JST）

## 結論

#2008 は過去の失敗記録が残っているだけではない。10月20日の失敗が複数ある。ただし Autopilot Act は同日12:00 JSTの定期実行で成功した。Issue単位の open/closed だけで各workflowを未回復と扱わない。

no_artifact は未修理。10月20日の Obsidian Autopilot は新しいモデル実行失敗ではなく、修理上限による実行前の封じ込めで止まった。停止フラグがfalseでも封じ込めは有効。

調査対象main tree: 9719681381f45547347b95d501adfbc51e371f51。以下は取得時点の観測であり、将来の復旧を保証しない。メールは再取得しておらず、GitHub上の一次記録を照合した。

## cron監視の内訳

#2008 の本文は10月6日の集計。最新コメントは10月20日09:59 JSTの過去24時間集計。起動欠落欄は欠落を報告していない。取得した直近100件のschedule履歴と各job・ログを照合した。

| 対象 | 現在確認できた状態・原因 | 証拠 |
|---|---|---|
| Autopilot Act | 10/19失敗後、10/20 12:00 JST schedule成功。自己検査、同期、台帳検査、PR生成まで成功。全体復旧や記事出荷の証明ではない | [run 39361954596](https://github.com/simplememofast/simplememo/actions/runs/39361954596) |
| Obsidian Autopilot | 10/20 10:07 JST起動。封じ込め段で失敗、モデル段はskipped。ログはno_artifact修理5回/上限3、AUTOPILOT_RECOVERY_ONCE空 | [run 39351679428](https://github.com/simplememofast/simplememo/actions/runs/39351679428) |
| Devlog Syndication | 10/20 02:47 JSTのdevto/hatena/hatenadiaryは執筆で週次利用上限。is_error:true、記事JSONなし、投稿skipped。livedoorのsuccessは執筆・投稿ともskippedで出荷証拠ではない | [run 39297066749](https://github.com/simplememofast/simplememo/actions/runs/39297066749) |
| Devlogの後続 | 10/20 17:36 JSTの定期runは取得時in_progress。devto jobはsuccess、hatenaは進行中。全媒体復旧の判定は保留 | [run 39394615166](https://github.com/simplememofast/simplememo/actions/runs/39394615166) |
| Decision Monitor | 10/20 14:26 JST失敗。publication_stalled: #2106 open 11h、mergeable_state=unstable。GH_PAT不足ではない（WRITE_TOKEN_AVAILABLE:true） | [run 39374888700](https://github.com/simplememofast/simplememo/actions/runs/39374888700)、[PR #2106](https://github.com/simplememofast/simplememo/pull/2106) |
| AI Visibility Probe | Codex週次観測が8日以内という条件を満たさず失敗。ログの表現はstale or futureで、日時の正しい再観測が必要 | [run 39348860127](https://github.com/simplememofast/simplememo/actions/runs/39348860127) |
| SEO Daily | measure jobは成功。Bing read-only jobがauth_requiredで失敗。SEO取得全体の停止と混同しない | [run 39345794141](https://github.com/simplememofast/simplememo/actions/runs/39345794141) |
| PageSpeed | production-enの中央値が既存performance/LCP/TBT予算を超過。単一計測の通信要因か恒常的回帰かは未確定。閾値は緩めない | [run 39344245976](https://github.com/simplememofast/simplememo/actions/runs/39344245976) |
| Main Daily Validation | Autopilot page vs ledgerでvdc/umr/tucの得点不一致。合計は一致。台帳側の配点や数値を変えて通すべきではない | [run 39325666240](https://github.com/simplememofast/simplememo/actions/runs/39325666240) |

#2008 は複数workflowの集約Issueで、個別復旧後も他の失敗があればopenでよい。今回閉じる根拠はない。
PR #2112はviewport観測メタデータの更新で、2件の修理や停止解除ではない。

## no_artifactの原因と修理回数

対象行 ap-20261006-actions は external_ref=37403744008、outcome=no_artifact、PR/artifactなし。
10/6のjobではモデル段successの後、成果物の実行ID照合がmissingで失敗した。
「SDKが正常終了した」と「成果物が出荷された」は別。

[PR #2062](https://github.com/simplememofast/simplememo/pull/2062)が確定した構造上の欠陥：
宣言後にhealth-intakeでdata/autopilot-actions.jsonをコミットするとundeclared pathになり、decision-ciを通せなかった。
同PRはhealth-intakeを読むだけに変更し、PR前のverify-localと終了理由の記録を追加した。マージSHAはa35323d7b1723c066a835b0cd024eb1019de99ed。

ただし10/6の「PRを作らず終了した直接理由」は未確定。当時の最終出力・拒否2件の詳細・作業ツリーが保存されていなかった。
この欠陥の是正だけを根拠にrepair_ofを追記してはならない。

修理5回は10/6のrunを5回再実行した意味ではなく、同一failure_classの修理累計。台帳のno_artifact修理対象は：
- PR #1051: ap-20260905-actions-33959414641
- PR #1237: ap-20260910-actions-codex-01a087f9-4092-7bc3-8274-69722c79e45b
- PR #1470: ap-20260915-actions-codex-01a0a1b9-4982-70f3-b2d6-eed77be68e26
- PR #1813: ap-20260920-actions-codex-01a0bb78-4965-7242-bedf-29a93d1b0bf9 と ap-20261001-actions-codex-01a0f41e-d80a-7a70-b927-485e8385da0e

出荷した4行が5故障をrepair_ofで名指ししている。10/5と10/6の2故障を修理済みとする出荷行はない。

## 停止・台帳・既存承認の境界

- data/emergency-stop.jsonは全体も全個別経路もstopped:false、policy.ai_may_resume:false。
- scripts/autopilot-selfheal.mjsは台帳から別途封じ込めを導出するため、falseは稼働許可の証拠にならない。
- data/authority-matrix.jsonの上限は3。検証緩和・権限拡大・権限表の自己変更は禁止。
- data/autopilot-status.jsonのdate_jstは2026-10-05。これはPR #2002の手動依頼出荷の記録で、自律運転の成功ではない。本文には10/10までの集計も混在しており、ファイル全体を単純に10/5の写しと断定しない。日付だけ現在へ更新して鮮度を偽装しない。
- data/autopilot-actions.jsonのact-selfheal-escalated-no_artifactはrun_repaired、act-health-2008はissue_closedが閉じ条件。どちらも現時点で満たしていない。

## 所有者に必要な具体的判断

推奨は修理上限の引き上げ・恒久解除ではなく、既存の1回限り試運転を行うかの判断。

既存の[操作手順](obsidian/ACTIONS_RECOVERY_ONE_USE.md)と[PR #2064](https://github.com/simplememofast/simplememo/pull/2064)に従い、
所有者がRepository VariablesのAUTOPILOT_RECOVERY_ONCEへ試す日のJST日付を設定する。翌日なら2026-10-21。
07:30 JST設定の定期run（遅延あり）のattempt=1だけが候補。手動起動・再実行では通らない。
AIは変数を作成・変更しない。現在の変数はAPIで読んでいないため、今日のrunで空だったこと以上は断定しない。

試運転時も予算・重複・緊急停止・宣言照合は維持する。
対象は10/5・10/6の2行、各行の指紋・修理5回・上限3が既存コードの固定条件と一致する必要がある。
新しい故障や行の変更があれば拒否する。試運転成功だけでは過去の故障は閉じない。

恒久再開の判断材料：
1. 試運転のrun、終了理由、宣言と差分の照合、診断artifactが取得できること。
2. 実在PRのCI成功・マージ・成果物とrun_idの対応を確認すること。
3. 10/5・10/6のどの原因をどう是正したかを明示し、両故障を修理済みと認定できるか所有者が判断すること。
4. 認定後にのみ実際の出荷行へrepair_ofを記録し、封じ込めと2件の閉じ条件を再評価すること。
原因を確定できないまま恒久解除する場合は、修理済みの偽装ではなく別の明示的なリスク受容判断が必要。

## 今回の変更と未実施

本PRは証拠と判断条件の文書化のみ。停止・修理上限・repair_of・承認変数・秘密情報・公開ページの実績は変更しない。
既存の対策を重複実装する安全な追加修正は、この照合では特定していない。現行検証を緩める修正は行わない。
Devlogの後続run、#2106の検証、Bing再認証、週次観測と性能問題は個別に復旧証拠が必要。
実行コードを変更していないため新規テストは追加していない。判断の根拠は上記job・ログ・main上の台帳と設定の照合。
