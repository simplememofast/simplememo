# OneLink pilot: 2026-09-19 readiness

担当: SimpleMemo Developer。対象: [Draft PR #1047](https://github.com/simplememofast/simplememo/pull/1047)。
**未開始。Draft維持。** 2026-09-07の準備head `66331d2eb2a57fdc4181c948226be0e3818a2875`は現在mainへ無条件マージしない。

## 取得した証拠と残条件

| ゲート | 既存証拠・今回のreadback | 判定 |
|---|---|---|
| 公開version/build/source | [既存公開観測](../app-store-release-5.8.66-observation-20260919.md)は5.8.66 / 1671、tag `v5.8.66` = `5dec6d81a34f08f88697759bcf5d861bdb79d389`。独自の再提出・公開観測は起動しない | 既存の配布証拠を利用。QA端末が同じ公開バイナリかは別途照合が必要 |
| GCD実装 | 同tagのAppDelegateがSDK開始前に`AppsFlyerAttributionObserver`をdelegateへ登録。5分類プロパティをallowlistで送る。SDK pinは6.18.1 | ソース確認済み。公開端末でのcallback成功の代用ではない |
| QA→store→first-open→D1 | 既存QA短縮URLと`seo_aio_qa` / `obsidian_bridge_qa_20260907`を使う契約を維持。今回D1はSELECTのみで限定照会 | QAの一貫した実機経路は未確認 |
| 既存利用者と内部除外 | cached/unknownとfirst_launchを分離し、QA・debug・simulatorを隔離する実装を確認 | 実機による遷移と実際の内部除外は未確認 |
| SDK / ATT / 公開説明 | 同tagはNSPrivacyTracking=false、TrackingDomains空。現行privacy文書はSDK開始と設定する仮名識別子・イベント、SDK独自収集との区別を説明 | 静的宣言だけでは実通信やATT挙動を証明しない。公開版の観測が残る |
| GA4完全日・品質 | 既存run35362309412の暗号化取得後の私有reportをSHA-256一致で確認。対象9/8–9/14、翌日9/15表もpresent、取得9/18 | 完全日集計の取得は確認。OneLink対象イベントがないためpilotの実イベント品質は未検証 |
| 共存 | 共存関数の実判定でglobal観測2件は非排他、video/internal-linkは同ページ干渉 | 介入の開始はhold |

D1の照会範囲は2026-09-07以降の`acquisition_attribution_received`。
version/build、attribution_scope/channel/campaignで集約し、最大40組に限定した。
応答は21組、rows_read=511、rows_written=0、changed_db=false。
5.8.66 / 1671にはfirst_launch/cached・unknownの記録があったが、QAとpilotの予約済み分類はこの照会結果になかった。
取得できたunknownの受信をQA成功へ置き換えず、App Store配布の証明にも使わない。
利用者ID・session・生イベント・認証情報は私有証拠に限定する。

GA4のreport hashは`5b89e005e580dbb60dda46c5659f01808e3d4bf68450f11fd79cc24b4e34c473`。
[取得run35362309412](https://github.com/simplememofast/simplememo/actions/runs/35362309412)、source `4dd860bd158b464ba47c5f8318bd12ccf77c68f8`。
productionの品質集計で欠損session/CTA次元・不正target等は検出されなかったが、OneLinkの分母は観測されていない。
その品質列の0は、未開始の需要0、実機QA成功、D1到達、インストール、売上の証拠ではない。
新たなBigQuery実行・課金・収集予約は行っていない。

## 共存の判定

[measurement-coexistence-policy](measurement-coexistence-policy.md)と現行台帳を使用。
`ownershipConflict` / `nonexclusiveObservation`を、対象`/obsidian/`、HTML変更`obsidian/index.html`と文書変更の全範囲で実行した。

| 既存ID | 判定と根拠 |
|---|---|
| brand-2026-08-11-entity-merge | `nonexclusive=true`、干渉false。coexistence発効 `2026-09-14T23:50:51.382Z` |
| engage-2026-08-11-next-step | 同じ明示移行・発効時刻。元契約hashの検証を維持 |
| video-2026-08-11-five-clips | 干渉true。`/obsidian/`を含む5面、明示移行なし。後発の同ページ実験を優先しない停止条件、評価10/11 |
| internal-link-2026-09-02-003 | 干渉true。同ハブと5子ページ、明示移行なし。title変更後の期間分離・内部遷移の欠測等の停止条件を維持、評価10/12 |
| monitor-2026-08-09-obsidian-ctr / cta-2026-08-10-desktop-qr | 現行台帳はevaluated。古いPR文書の稼働中記述だけで現行ロックと扱わない |

評価日の到来だけで先行契約を終了させない。OneLinkの指標名が違うことや、動画・QRを編集しないことだけでは独立性を証明できない。
URL分離のPR #1484も同期間の併発変更として既に注記されている。
実開始を許可する場合は、全変更範囲、比較設計、実測baseline・母数、停止条件、既存の干渉処理を事前に確定する。

## 開始時だけ行うこと

上記公開前ゲートが揃った時点のmainから、冒頭App Storeバッジ1個だけを保存済みpilotへ接続する。
nav、末尾、QR、本文・見た目は比較上の変更範囲として確認し、意図しない差分を入れない。
準備日を開始日にせず、実際の適用UTC、本番SHA、URL・placement、計測version、Apple pt/ct系列の切替を元実験台帳へ記録する。
QAの検証にはQA短縮URLを使い、pilotへ試験アクセスを流さない。

公開版未インストール端末での確認が必要でも、既存端末の削除、ログアウト、アプリ置換は自動で行わない。
既存の実機担当・公開担当が出した同一版の証拠をまず利用する。
条件を満たした最小差分だけを通常PR・同一SHA CI・main・Pages・本番readbackへ進める。
公開後もWeb表示/タップ、store到着、first-open、保存、継続、LTVを別々に検証する。
