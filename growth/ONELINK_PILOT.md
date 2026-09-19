# Obsidian Web→アプリ pilot：最初の1配置

2026-09-07作成。変更対象は `/obsidian/` 冒頭のApp Storeバッジ1個。
公開条件を満たすまではPRをdraftに保つ。リンク保存やCI成功だけでは開始しない。

## 保存済み設定と変更内容

| 項目 | 値 |
|---|---|
| OneLink名 / campaign | `obsidian_bridge_pilot_v1` |
| media source | `owned_web` |
| template / app | `it5q` / `id6758438948` |
| pilot短縮URL | `https://simplememofast.onelink.me/it5q/l250gib4` |
| iOS CPP | `1408d7a4-3249-4c87-a079-e13032312579` |
| 計測属性 | route=`onelink`, traffic=`pilot`, cluster=`obsidian`, placement=`hero`, variant=`onelink_v1` |
| 変更前のApple campaign | `jp__hero`、provider=`128498560` |
| QA媒体 / campaign | `seo_aio_qa` / `obsidian_bridge_qa_20260907` |
| QA短縮URL | `https://simplememofast.onelink.me/it5q/4x0jfkpw` |

pilotは管理画面の保存完了と一覧、長いURLのpid・c・CPPで照合済み。
pilotへのテストアクセスは行っていない。検証にはQA媒体を使い、QAの結果を
pilotの実績として数えない。既存利用者もストアへ遷移する設定である。

ボタンの文言・外観・位置はそのまま。nav2個・末尾バッジ・参考資料の直接Appleリンクと
既存QRは変更しない。リンクはHTML内に固定し、Smart Scriptや非同期URL置換を追加しない。
OneLink側の障害時に自動fallbackする実装ではない。直接リンクはnavと末尾から利用できる。

## 公開前に揃える証拠

- [ ] 新しい実行環境・GCD計測を含む**公開バイナリ**の版、build、ソース対応を確認する。
  現在の審査中バイナリへ後からマージしたコードが入るとは仮定しない。
- [ ] QAリンクで公開版の未インストール→ストア→初回起動と既存利用者の遷移を確認し、
  媒体・campaign・版/build・D1受信を照合する。内部/開発利用の除外条件も確定する。
  接続された開発版iPhoneを無断で削除・置換しない。
- [ ] SDKの自動収集・ATT設定・公開バイナリの通信を確認し、公開説明との対応を記録する。
- [ ] GA4の完全日で品質SQLと実スキーマを検証する。取得の5暦日・翌日表条件を維持する。
  pilot開始前のOneLink列0を需要0と解釈しない。
- [ ] 下記の先行施策の停止条件と重複を解消し、判断の根拠を実験台帳に残す。
- [ ] 適用直前のmainに合わせて差分・CIを確認し、実際の開始時刻・本番SHA・URL・配置・
  計測版とApple campaignの系列変更を `growth/experiments/experiments.json` の
  `measurement_changes` に記録する。準備日を開始日にしない。

### 同じページで稼働中の施策

2026-09-07にmainの台帳で確認。評価日は終了済みの証拠ではない。

| ID | 評価予定 | 今回との関係 |
|---|---|---|
| `monitor-2026-08-09-obsidian-ctr` | 9/13 | 同ページの後発実験を優先しない停止条件あり |
| `cta-2026-08-10-desktop-qr` | 9/13 | QRは維持するが同ページの後発実験を優先しない条件あり |
| `video-2026-08-11-five-clips` | 10/11 | 動画は維持するが同ページの後発実験を優先しない条件あり |
| `internal-link-2026-09-02-003` | 10/12 | 同じハブを含む。内部遷移の変化をpilot単独へ帰属させない |

先行施策が未完のまま新しい実験をrunningにしない。結果・停止条件に沿って先行施策を
評価するか、計測接続としての介入の扱いを明示してから開始を決める。
この準備差分では既存の開始日・評価日・status・結論を変更しない。

## 開始後の読み方

[`ANALYTICS_API.md`](ANALYTICS_API.md#onelink-pilot-intent)の既存取得経路を使う。
`web_to_app_impression` と `web_to_app_click` は同意図の表示・タップであり、
ストア到着・インストールではない。直接Appleの `app_store_click` と重複なく読むには
`sessions_with_any_app_route_click_24h` を使い、個別ルートを足さない。
公開直後のイベント受信でpage_path=`/obsidian/`、placement=`hero`、variant=`onelink_v1`
とQA除外を確認する。固定ファネルの集計表を個別イベントの確認へ置き換えない。

QAで検証したリダイレクトはAppleのpt/ctを保持しなかった。従来 `jp__hero` の減少は
導線変更による系列断絶を含み、需要減少やコンバージョン悪化と即断しない。
他ページでも同じctを使うため、このct全体を `/obsidian/` の前後比較に使わない。
QRやnavを無作為な対照群と見なさず、単純な前後差を因果効果へ置換しない。

`owned_web` は自社サイト経由の分類でありSEOの証明ではない。GA4の参照元分類と
AppsFlyer/D1を個人単位で結べるとは仮定しない。A24・R7・D35は実際の開始後の
同じ獲得条件と各成熟期間で集計し、QA・帰属不明・欠測を分ける。

## 不具合時の戻し方

heroのhrefを次へ戻し、`data-app-route` / `data-app-traffic` を外してvariantを `v1` に戻す。

```text
https://apps.apple.com/jp/app/id6758438948?ppid=1408d7a4-3249-4c87-a079-e13032312579&pt=128498560&ct=jp__hero&mt=8
```

HTML内では `&` を `&amp;` とする。復旧時刻と本番SHAを同じ計測変更履歴に残す。
通常のPR・SEO Validation・Git経由の本番反映を使い、過去のQA/pilot記録を削除しない。
