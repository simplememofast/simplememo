# Obsidian Web→アプリ計測：ハブ9言語の冒頭CTA

2026-09-07作成、2026-10-11に現行main・公開アプリ・管理画面設定と再照合。
変更対象は日本語 `/obsidian/` と生成翻訳8ページの冒頭App Storeボタン、計9個。
翻訳元のリンク・計測属性を引き継ぐ既存ルールを維持する。公開条件を満たすまではPRをdraftに保つ。
この候補の作成、保存済みリンク、CI成功は、本番開始や実インストール帰属の証明ではない。
対象URLは `/obsidian/`、`/ar/obsidian/`、`/es/obsidian/`、`/id/obsidian/`、
`/ko/obsidian/`、`/pt-BR/obsidian/`、`/tr/obsidian/`、`/zh/obsidian/`、`/zh-Hant/obsidian/`。
独立した英語編集ページ `/en/obsidian/` はこの候補の対象外。
この9配置の検証だけで、公式サイト全体の計測改善を完了とはしない。

## 保存済み設定と変更範囲

| 項目 | 値 |
|---|---|
| OneLink名 / campaign | `obsidian_bridge_pilot_v1` |
| media source | `owned_web` |
| template / app | `it5q` / `id6758438948` |
| pilot短縮URL | `https://simplememofast.onelink.me/it5q/l250gib4` |
| iOS CPP | `1408d7a4-3249-4c87-a079-e13032312579` |
| 計測属性 | route=`onelink`, traffic=`pilot`, cluster=`obsidian`, placement=`hero`, variant=`onelink_v1` |
| 変更前の現行Apple campaign | `web_obsidian_v1`、provider=`128498560` |
| QA媒体 / campaign | `seo_aio_qa` / `obsidian_bridge_qa_20260907` |
| QA短縮URL | `https://simplememofast.onelink.me/it5q/4x0jfkpw` |

2026-10-11、認証済み管理画面でQAとpilotの媒体・campaign・対象アプリ・CPPを読み戻した。
iOS未インストール時はApp Storeへ、既存利用者も同じストアへ遷移する設定。
これは設定の確認であり、端末上の遷移やインストール帰属の確認ではない。
QAの確認にはQA媒体を使い、pilotの実績に算入しない。

ボタンの文言・画像・位置は維持。ほかのAppleリンク、QR、Smart App Bannerはこの候補では変更しない。
各ページのheroのhrefと計測属性だけを切り替え、Smart Scriptや非同期URL置換を追加しない。
9ページは同じpilot URLを使い、AppsFlyerの当該campaignの数値には合算される。
GA4でpage_pathを分けても、それをAppsFlyerのページ別・言語別インストール数とは扱わない。
OneLink障害時の自動fallbackはない。既存の直接Appleリンクは引き続き利用できる。
サイトマップは現行mainを保持し、古い候補の日付へ巻き戻さない。

## 公開前に揃える証拠

- [x] 保存済みQA/pilotのmedia source、campaign、app、CPP、既存ユーザーの設定を確認。
- [ ] QAで使う公開バイナリの版・buildとソース対応を照合。
  2026-10-11時点の公開版は5.9.16。計測実装の現行基準はiOS PR669。
  PR668およびそれ以前の候補を再投入しない。QA時点で版が変わった場合は再照合する。
- [ ] テスト端末の過去のインストール歴と、必要な登録方法を確認してから、QAリンク→
  App Store→インストール→初回起動を実施。時刻、版/build、媒体、campaign、first_launch、
  D1受信を照合する。再インストールやcached callbackを新規インストールとして数えない。
  既存メモのあるアプリを削除せず、端末識別子を公開記録やチャットへ貼らない。
- [ ] 既存利用者の実遷移、QA・内部・開発利用の除外を確認。
- [ ] 公開版の同意・拒否・撤回、ATT拒否/制限、旧SDKキャッシュの通信を確認し、
  archiveの集約privacy reportと公開説明を照合。5.9.16で撤去された独自設定画面を要求しない。
- [ ] GA4の既存品質・ファネルSQLと実スキーマの検証を維持。
  5暦日の成熟期間、翌日表の条件、欠測・品質不備の表示を維持する。
- [ ] 計測接続の変更として下記の共存記録を準備し、最終変更範囲と公開承認を照合。
- [ ] 最終SHAのSEO Validationを通し、本番配信と照合。実際の開始時刻・本番SHA・URL・配置・
  計測版・Apple campaignの系列変更を `growth/experiments/experiments.json` の
  `measurement_changes` と `growth/data/annotations.json` に記録する。準備日を開始日にしない。

## 既存実験との共存

[全サイト観測と記事別事前計測の共存方針](../docs/growth/measurement-coexistence-policy.md)の、
明示依頼による変更の扱いに従う。今回は計測経路を接続する変更であり、新しい効果比較実験を
runningにしたり、自律実験のゲート通過・成功として計上したりしない。
指標が異なることだけで、同じページへの影響が独立しているとは判断しない。

2026-10-11の現行台帳・継続評価に残る対象:

| ID | 評価予定 | 変更時に残す記録 |
|---|---|---|
| `video-2026-08-11-five-clips` | 10/11 | 動画・配置は維持。計測導線変更の時刻と範囲を併発変更として追記。動画施策単独の因果を主張しない |
| `internal-link-2026-09-02-003` | 10/12 | 内部リンクは維持。ハブの導線変更前後を分ける。内部遷移の変化をpilot単独の効果としない |
| `monitor-2026-08-09-obsidian-ctr--review-2026-10-14` | 10/14 | 9/14〜10/11の元の観測窓・親baselineを維持。変更が観測窓に入れば時刻を併記 |

開始日・評価日・母数・status・停止条件・結論をロック解除のために変更しない。
評価日は終了証明ではない。停止条件に実際に該当する場合は、その元契約に従って処理する。
公開直前にも台帳と継続評価を読み直し、後から加わった対象を見落とさない。
計測目的の文書変更も全変更範囲へ含め、保守的なglobal判定を黙って除外しない。

## 開始後の読み方

[`ANALYTICS_API.md`](ANALYTICS_API.md#onelink-pilot-intent)の既存取得経路を使う。
`web_to_app_impression` と `web_to_app_click` は表示・クリックであり、ストア到着やインストールではない。
直接Appleの `app_store_click` と重複なく読むには `sessions_with_any_app_route_click_24h` を使い、
個別ルートのセッション数を足さない。QA除外と、page_path=`/obsidian/`、placement=`hero`、
variant=`onelink_v1` の受信を確認する。固定集計表を個別イベントの証明へ置き換えない。

このheroは現在 `web_obsidian_v1` を使う。古い候補の `jp__hero` を現行値や復旧先として扱わない。
OneLink経由では従来のApple pt/ct系列との連続性を仮定しない。`web_obsidian_v1` の減少は
導線切替の影響を含み、このct全体を9個のheroの対照群や需要減少の証明に使わない。
QR・navも無作為な対照群ではない。

`owned_web` は自社サイト経由の分類であり、SEOの証明ではない。GA4とAppsFlyer/D1を個人単位で
照合できるとは仮定しない。GA4の訪問→クリック率、AppsFlyerの帰属インストール数と同期間の
installs/clicks比率、Appleのストア内CVRを区別する。期間比率を同一訪問者集団のインストールCVRと呼ばない。
欠測・未検証・非表示・QA・帰属不明を0や本番実績へ置き換えない。
A24・R7・D35は実開始後の獲得条件と成熟期間を揃えて読む。

## 不具合時の戻し方

日本語元ページと生成翻訳8ページのheroのhrefを次へ戻し、`data-app-route` / `data-app-traffic` を外してvariantを `v1` に戻す。

```text
https://apps.apple.com/jp/app/id6758438948?ppid=1408d7a4-3249-4c87-a079-e13032312579&pt=128498560&ct=web_obsidian_v1&mt=8
```

HTML内では `&` を `&amp;` とする。通常のPR・SEO Validation・Git経由の本番反映を使い、
復旧時刻・本番SHAを同じ計測変更履歴に残す。過去のQA/pilot記録は削除しない。
