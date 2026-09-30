# App StoreキャンペーンによるCTA掲載ページ群の観測

開始：2026年9月30日08:42 JST。[配線変更](https://github.com/simplememofast/simplememo/pull/1695)の本番配備後、公開HTMLのApp Storeリンクを読み戻して確認した。

## 目的と単位

サイト内の自社App Storeボタンのうち、進行中の実験で計測維持が必要な6ページを除き、**CTA掲載ページ**のURLパスに`obsidian`を含む群（`web_obsidian_v1`）とそれ以外（`web_other_v1`）の2キャンペーンに集約する。言語、CTA配置、商品ページの違いは各群内で合算する。2026年9月30日のコード上では前者48ページ・144ボタン、後者373ページ・1,140ボタン。これは掲載ページ群に割り当てたリンクトークンであり、リンクをコピー・共有しても同じ群に残る。入口から別ページへ移動する場合もあるため、Campaignだけで実際に押したページ、検索着地ページ、検索語、自然検索流入、購入意図、同一利用者の属性を確定しない。QR画像、外部記事、アプリ内リンクの配線は今回の変更対象外。

除外ページは`/obsidian/getting-started/`、`/note-to-email/`、`/blog/free-memo-apps-ranking`、`/en/blog/free-memo-apps-ranking`、`/blog/line-keep-alternative`、`/en/blog/line-keep-alternative`。初めの2ページは10月23日、残り4ページは10月3日に進行中の実験を評価する。評価後も**この6ページ**をv1に追加せず、追加する場合は別バージョンの計測契約を作る。群判定は正準URLのパスから言語接頭辞を除き、`obsidian`が`/`または`-`で区切られた語として入るかで決める。新規公開ページはこの固定ルールでv1へ入るため、公開日・URL・群を記録し、ページ集合が違う期間を同一コホートとして比較しない。

従来の`jp/en × 配置`8トークンは履歴として残し、新トークンへ過去分を付け替えない。`pt`、`ppid`、App StoreアプリID、ボタンの表示文、`data-cta-placement`・`data-cta-cluster`・`data-cta-variant`は維持する。GA4にはページパスと配置を引き続き記録するが、`ct`による前後の同一系列比較はしない。AppleのStandardレポートでWeb参照元が見えても、DetailedのCampaign行が秘匿されることがある。空欄をサイト経由初回DLの0件と扱わない。

## 読み取り契約

1. [AppleのCampaign links説明](https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links)に従い、各トークンの初回DLが5人以上になり、開始から24時間以上経ってからApple画面・APIのCampaignを確認する。指標ごとにも表示閾値5があり、Detailedは少数行が省略・統合され得る。空欄は0へ置き換えない。
2. 両群に同じ取得日・UTC期間・初回DL定義を適用する。Appleの同じCampaign面で商品ページ閲覧、初回DL、継続、売上・購読が表示された場合だけ群別に読む。Appleの表示コンバージョン率はApple自身の定義を使う。異なる人数単位の閲覧とDLを割った独自の「検索着地DL率」は作らない。
3. GA4の自然検索着地→自社Storeクリックは、成熟済み・着地欠損の品質判定を通った窓で別に読む。Apple群とCTAクリックを照合するときは、GA4の`data-cta-cluster`ではなく、クリックイベントの`page_path`に同じURL名の判定と上記6ページの除外を適用する。`vs`・`blog`クラスタにもObsidian名のページがある。GA4はクリック時のページを観測する一方、Appleは共有・再利用されたリンクも含むトークンの帰属で、両者の母集団が一致するとは限らない。Appleのキャンペーンには直接・紹介・AI経由も入り得るため、Appleの初回DLをGA4のOrganic Searchセッションで割らない。Obsidian群内にはObsidian本体の入手・料金を探す人もいる。
4. AppleのCampaignで見える受取額や継続は、同じ獲得日の成熟コホートと指標の表示範囲が確認できた場合だけ参考にする。少数値の秘匿、後日の返金・更新、Appleの推定受取額と最終入金額の差を残す。**純LTVの優位**はこれだけでは確定しない。

主判定は、少なくとも両群にAppleの初回DLが表示された後の同じ期間で、初回DL数とAppleの同一定義のファネル指標を比較できるか。最初の確認は本番配備後30日、閾値未達なら90日まで観測する。90日でも片群が表示されなければ`measurement_failed`として、施策の勝敗を判定しない。先に進行中のページ実験の評価を守り、キャンペーン変更時刻をそれぞれの交絡として記録する。今回の配線だけを流入・DL・売上の増加実績にしない。
