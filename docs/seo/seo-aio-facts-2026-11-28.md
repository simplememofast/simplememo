# SEO/AIO：事実の訂正とページ単位の修正（2026-11-28）

サイト全体の監査（指摘56件。1件ずつ別の検証者が反証を試み、通ったものだけを採用）から、
**いま本当に誤っている事実**と、**ページ単位で直せる不具合**だけを直した記録。
全ページに効く変更は、2026-11-13 のオーナー判断3（`docs/seo/gsc-page-indexing-2026-11-12.md`）の
とおり 12 月上旬の一括デプロイへ回した（下の「扱わなかったもの」）。

## この PR の範囲の決め方

| 規則 | この PR での扱い |
| --- | --- |
| オーナー判断3（2026-11-13）：全ページ・生成器に効く変更は1回のデプロイにまとめる | ページ単位の訂正と、定例のストア情報の同期だけ。生成器と共通部品は変えていない |
| R10（2026-11-14、`docs/GROWTH_ROI_PLAN_2026-08-20.md`）：英語は事実の訂正と保守だけ | 手書きの英語ページは、日本語と同じ事実の訂正だけ。新しい節・CTR の書き直しは無し |
| 題の変更はオーナーの承認と title_test が要る | `<title>`・og:title・H1 は1つも変えていない |
| 排他的な実験の対象ページ | ストアの数字（版・評価）の同期だけ。題・本文・CTA は変えていない |
| PR #2430 の計測の窓（〜2026-12-26） | `/blog/google-keep-shutdown`・`/blog/line-keep-alternative`・`/obsidian/pricing/`（日英）とそのカードは触っていない |

## 直したもの

### 1. App Store の公開情報（2026-11-27 に iTunes Lookup で確認）

- 版 5.9.35、評価 4.2（30件）。`check-store-facts.mjs --net --write` と `sync_constants.js --write` で同期した。
- `/obsidian/` の評価の表示5か所は同期の規則の外にあるので、数字だけを手で直した（2026-10-05 に作った時点の 27 は、当時の評価の件数と同じ）。

### 2. llms.txt（AI 向けの事実の一覧）

- **製品の定義**：「メモをメールへ送る iOS アプリ・Captio の代替」から、「iPhone と Apple Watch で書くか話して、自分宛てのメールへ送る。設定でオンにすると Obsidian の保管庫への追記と Notion への保存も行う。Obsidian 公式のアプリではない」へ。送り先は設定で決まり、メモごとに選ばない。
- **データの扱い**：プライバシーポリシー §1(E)・§1(G)・§4・§12 と /privacy-architecture/ に合わせた。当社の中継サーバーは本文を保存しない。配信の Resend は送ったメールを保存する（公表されている標準プランは30日、当社に適用される期間は確認中）。
- **Obsidian の Quick Capture**：iOS 26 向けに 1.14 Mobile（2026-10-05）で公開版になり、1.15 Mobile（2026-11-02）で音声の文字起こしが加わった（公式の変更履歴で確認）。Quick Capture より速いとは書かない注記も足した。
- **AI の機能**：AI タグ付けと対話メモを「事実の行」から外して1段落にまとめた。対話メモを「optional（任意）」と書かない（設定でオンにする機能ではないため）。
- そのほか：App Store の表示名、出典 URL の末尾の規則、料金の出典（/legal・/en/faq）、robots で許可している名前つきのクローラーの数（19種・11社）、読めなくなっていた検証メモの行の書き直し（`/obsidian/properties/` の行は、GUI で操作したのが3件のうち1件だという範囲に直した）。著者名は SimpleMemo Developer にそろえた。

### 3. 製品の定義と端末（`/faq`・`/about/` と英語版）

- `/faq` の「どんなアプリですか？」から、製品と食い違う「タグ付け・同期の設定は無い／メールに送るだけ」を外し、トップの FAQ と同じ定義にした。
- 対応端末の回答に「iPad・Mac・Android の版はありません」を足した。
- `/about/` の要点（英語は TL;DR）の第1段落を、Notion・Apple Watch・Siri を含む今の定義にした。
- `/about/`・`/voices/` の JSON-LD の sameAs から個人のプロフィール URL を外し、トップと同じブランドのアカウントにそろえた。

### 4. 保存とデータの扱いの回答

- `/faq`・`/en/faq` の「メモの内容はどこかのサーバーに保存されますか？」の冒頭の「いいえ」を外した。プライバシーポリシーは、Resend が送ったメールを本文ごと保存すると書いているため。
- `/faq` の「メール本文・認証コード・メールアドレスはサーバーに残りますか？」にも、Resend が送ったメールを保存することを足した。
- `/devlog/privacy-first-design`（日英）：
  - 利用解析の回答を、現在形の「使用しています」から、版による違い・2026-09-06 に確かめた 5.8.17 の扱い・5.9.35 のリリースノートの案内に直し、今の扱いはポリシーで確かめてもらう形にした。外部 SDK の回答も「5.9.32 までの版は、版と設定により AppsFlyer を使うことがある」に揃えた。
  - 保存の回答から、2026-11-18 の改定で無くなった保存の例外を外した。
  - 日付の行に「保存と利用解析のFAQを訂正：2026年11月28日」を足した（本文の 9/6 の確認日は残した）。
- `/blog/captio-discontinued`（日英）、`/vs/obsidian-share-sheet/`（日英）、`/note-to-email/`（日英）の保存の記述：Resend を「通過するだけ」と書いていた所と、「どこかのサーバーに保存されますか」への答えから Resend の保存が抜けていた所を直した。「当社サーバーには保存しない（送信時に通過するのみ）」という当社のサーバーに限った書き方は、/privacy-architecture/ と同じなので残した。

### 5. Obsidian の Quick Capture に合わせた訂正

「早期アクセス版」「Obsidian には文字起こしの機能が無い」という古い記述を、次のページとその英語版で直した。

- `/blog/obsidian-voice-input`
- `/blog/obsidian-iphone-memo`
- `/vs/obsidian/`
- `/vs/notion-vs-obsidian/`
- `/vs/obsidian-share-sheet/`
- `/obsidian/compare/logseq/`
- `/obsidian/compare/`
- `/blog/obsidian-voice-fastest-route`

あわせて、Quick Capture より速い・確実だと読める言い方を外した。

- `/vs/obsidian/` の FAQ：Quick Capture と並べて 0.4秒を「違い」としていた文。
- `/vs/obsidian/`・`/blog/obsidian-voice-input`（日英）の「どれを選ぶか」の一覧：「アイデアを瞬時に」「高速インボックス」「思いつきを逃したくない」を、届け先の違い（メールと保管庫の両方・Apple Watch）で書き分けた。
- `/vs/obsidian-share-sheet/`（日英）の「共有シートがあればこのアプリは不要では？」：0.4秒を理由に挙げず、iOS 26 では公式の Quick Capture をまず試すよう案内した。
- `/blog/obsidian-voice-fastest-route` の結論：「この表の5経路なら」と範囲を書き、Quick Capture は数えておらず順位も付けていないと書いた。

Quick Capture と速さを比べた計測は無い。題・H1・canonical・CTA のリンク先は変えていない。

### 6. ストアの表示名（`/download/`・`/captio-alternative/`）

- 日本の App Store の今の名前「Obsidian連携音声シンプルメモ」と、ほかの国・地域の「Simple Memo - Obsidian Voice」を書いた。以前の名前と旧名も残した。
- SoftwareApplication（#app）の alternateName に、今のストア名を足した。トップと site-constants の分は、実験の評価の後に回す。

### 7. ページの不具合

| 不具合 | 直し方 |
| --- | --- |
| `/en/blog/brain-science-memo` の meta・og・twitter の description が、値の中の生の `"` で途中で切れていた（#1618 由来） | `&quot;` に直した。同じ崩れを止める検査（[ATTR]）を `scripts/lib/seo-page.js` に error で足した（全2,535面のうち該当はこの3個だけ。`<link>` の `disabled` と `link-` で始まる独自要素は落とさない） |
| 記事に表示している更新日と JSON-LD の dateModified のずれ（3面）、article:modified_time のずれ（4面） | 表示と meta を、既にある dateModified の日付にそろえた（繰り上げはしていない） |
| 遅延読み込みのスクリーンショット13枚に width/height が無い | PNG の実寸を付けた |
| `/blog/brain-science-memo` の説明文が、本文に無い「29%」の出どころを説明すると約束していた | 説明文からその約束を外した |
| `/resources/obsidian-uri/` が、daily で「追記」を選べる・「このツールは上書き URI を作らない」・「追記したいときだけ選ぶ」と書いていた | 実装（daily は append を付けない。従来互換では「既存ノートに本文を末尾追記する」が初期状態でオン。拡張では overwrite=true を選べる）に合わせた |
| `/note-to-email/` の FAQ が「件名と署名は自由に設定できる」と書いていた | 件名はメモの1行目で、設定の「件名」が先頭に付く、という作りに直した（/faq と英語版は #1926 で直し済み） |

### 8. リンクとカード

- 本文からのリンクが少なかった `/obsidian/templates/`・`/obsidian/properties/`・`/blog/iphone-memo-katsuyou` へ、既存の題のままのリンクを足した。訳の単位は増えていない。
- ハブ（`/blog/`・`/comparison/`・`/guides/`・`/vs/`・`/obsidian/compare/` と英語版）のカードのうち、リンク先が今は否定している数字・計測・最上級を載せていたものを、リンク先の題と説明文に合わせた。
- 古い題のまま残っていた関連リンクを、リンク先の今の題に合わせた。
- オーナー判断 #55 ①（題・CTA の見出しで条件の無い言い切りをしない）に沿って、「入口をいちばん短くする」の CTA を条件つきの文言に置き換えた。

### 9. 道具

- **IndexNow**（`scripts/indexnow-notify.js`、新規 `scripts/indexnow_content_changes.py`）：
  - 差分のあるファイルではなく、内容が変わったページだけを通知するようにした。内容の定義は sitemap の lastmod と同じ。
  - 比較が失敗したときは、従来どおり変更した .html の全件を通知する。
  - 送信の前に、本番がマージ後の内容を配信しているかを最大5分確かめる。確かめられなくても送る。
  - 過去のマージで再生すると、スクリプトや CSS だけの一斉変更（#2381・#2385・#2396）は、2,288・2,301・2,106 URL の通知が 11・0・4 に減った。
  - 手順は `docs/indexnow-setup.md`。
- **週次レポート**（`growth/scripts/weekly-report.mjs`）：台帳で abandoned と判定したページを CTR の表から外し、進行中の排他的な実験のページに印を付けた。

### 10. 翻訳

- 変わった日本語の単位を、生成している8言語へ訳した。生成の英語ページに出る単位も訳した。
- 訳したのは AI で、言語ごとに別の AI が意味・条件・日付・用語を照合した。人の査読ではない。
- 訳は catalogs と overrides の両方に入れた（#2396・#2408 と同じ形）。
- 査読で見つかった既存の訳の誤りも直した：日付の直訳（「2024 8」など）、終わったことを未来形にした訳、意味の取り違え（「終了していません」を「完了していない」）、URI の値 `true` の翻訳、文のつながり。
- 使われなくなった単位の訳は、catalogs と overrides から外した。overrides に古い単位が残ると、`import_site_translations.py` が止まるため。

## 確かめたこと

- **SEO Validation の手元での再現**（`seo-core`・`seo-translations`・`seo-pages`・`seo-generators`・`seo-company` の各段を、変更をコミットした手元の写しで実行）：154段が成功し、5段は `if:` つきで対象外だった。落ちた8段（npm ci・sudo・読み取り専用のパス・ブラウザの統合など手元の環境によるもの）は、main（1bc52a2cf）で同じテスト名・同じ理由で落ちる。
- **生成と検査**：`build_site_translations.py --check`、`generate_sitemap.py --check`、`inject_faq_schema.py --check`、`finalize_split_pages.py --check`、`sync_shared_chrome.py --check`、`sync_page_design.py --check`、`sync_constants.js --check`、`check-store-facts.mjs --check`、`check-public-facts.mjs --check`、`check-content-graph.mjs`、`check-internal-redirects.mjs`、`generate_dev_feed.py --check`、`seo-check.js`（error 0）が通った。
- **題と凍結ページ**：変更した全 HTML で `<title>`・og:title・twitter:title・H1 の前後を比べて差が無いこと、凍結中のページとその各言語版が数字を除いて前後で同一であることを、スクリプトで確かめた。
- **独立の査読**：
  - 実装の各まとまりごとに、別の AI が反証を試みた。
  - 差分全体を9つの観点（事実・制約・技術・各言語の表示・名乗り・見落としなど）で査読した。指摘50件のうち8件は反証され、残りは直すか、上の「扱わなかったもの」に回した。
  - 査読の後に直した部分は、もう一度だけ査読した。
- **名乗りの照合**：追加した行すべてで、名乗りの照合を通した。

## 扱わなかったもの（理由と、次に扱う時期）

### 12月上旬の一括デプロイへ回す（2026-11-13 のオーナー判断3「全ページに効く変更は1回のデプロイにまとめる」）

- **使われていない Noto Sans JP の先読み（preload）の削除**: 2,025ページ超（実験中の13ページとその訳を除く）。本文は Hiragino/システムフォントで描かれていて、先読みした約85KBのフォントは使われていない（本番の Chrome 158 で 17ページ・9言語を確認、FontFace は全部 unloaded）。外すと転送が 85〜170KB 減り、モバイルの LCP が 200〜330ms 速くなる（監査の計測）。全ページを作り直すので、IndexNow が約1,900 URL を送る。
- **生成8言語の JSON-LD の名前**: 組織（#organization）と製品（#app）の名前が訳されている、`isPartOf` が存在しない `<言語>/#website` を指す、VideoObject の inLanguage がページの言語になっている（1,768ページ）。生成器 `localized_schema` の修正。
- **Obsidian 系21ガイドの author/publisher に @id を付ける**（JA の原稿だけを直し、生成で反映。202 URL の lastmod が動く）。
- **英語ページのパンくずのハブ名**: ハブの H1 の宣伝文句がパンくずの名前に入っている（例: "Write on iPhone. Find it in your chosen Obsidian note."）。`finalize_split_pages.py` にハブ名の対応表を足す。`/en/methods/` は実験 title-2026-11-11-second-brain-term の評価（12-14）の後。
- **生成翻訳の長いタイトル・誤訳**（es/pt-BR/id/tr/ar で 70 字超が 528件。Timeboxing を「boxing」と訳した137単位など）。範囲はオーナー判断どおり「各言語の表示の80%を占める305ページ・887単位」から。
- **生成英語ページの機械翻訳のままの description（29件）と og:title（19件）**。
- **`/obsidian/getting-started/` の訳が「日本語を選ぶ」と案内している**（9言語・7単位）。翻訳ではなく翻案の誤り。
- **旧称「Captio式シンプルメモ」の保護**：翻訳の単位では「Captio」と「シンプルメモ」が別々に保護されるので、生成8言語では存在しない名前（「Captio式SimpleMemo」「SimpleMemo estilo Captio」など）が旧称として出る（`/about/` の要点など4単位）。`/download/` のように名前全体を `translate="no"` の span で包むと直るが、`check-public-facts.mjs` は span の前後で行を分けるので「旧称」と同じ行と見なされなくなる。保護の対象語に足すか、検査の行の扱いを合わせて直す。

### 2027-01-01〜01-07 に行う（年替わり）

- タイトルに「2026」を含むページ（日本語39・英語31）。**出典を開き直して事実を確かめてから**数字だけ替える。2027年1月1日（JST）より前に「2027」を出さない。計測の記録（ベンチマーク）は、測り直すまで計測した年のままにする。
- `/blog/best-memo-apps-2026` の「【2026年9月】」も同じ時に、出典の再確認とあわせて。

### 2026-12-26 以降（#2430 の計測の窓が明けてから）

- `/blog/line-keep-alternative` の「LINEのKeepメモはどこにありますか？」の回答（見出しと2文）。
- `/blog/` などのハブにある `/blog/google-keep-shutdown`・`/blog/line-keep-alternative`・`/obsidian/pricing/` のカード（いまのカードは記事の改稿前の題と内容のまま）。

### オーナーの判断が要るもの

- **タイトルの試験の候補**（タイトルの変更はオーナーの承認と title_test の登録が要る）: `/obsidian/what-is-vault/`（保存場所・名前変更の検索に題が答えていない）、`/vs/ios-reminders/`（「リマインダーとは」「メモとの違い」。VISION では Reminders は届け先）、`/note-to-email/`（「自分にメールを送る」を題の先頭に）。どれも監査の反証で「効果は小さく、測りにくい」と判定された。
- **9言語のトップの訴求**（Captio の代替・ワンタップ送信・AES-GCM、英語は AI を前面）。日本語のトップの「話すだけで、メールとObsidianへ残る」に合わせるか。トップは実験中・英語は R10。
- **robots.txt の CCBot・Amazonbot の遮断**: 理由を書いた記録が残っていない。続けるかどうか。
- **動画の実験（video-2026-08-11-five-clips）の評価**: 評価日（11-14）を過ぎている。動画がページの主内容になっていないので、動画の検索結果にはまず出ない（監査の見立て）。
- **`#app` の applicationCategory（ProductivityApplication は Google の一覧に無い値）と、`/captio-alternative/` の Premium の価格が価格の検査の外にあること**（sync_constants の規則を足す）。
- **pt-BR だけで汎用の `pt` の hreflang が無い**: まず Search Console で Portugal などの表示を測る。
- **アラビア語のウェブフォントの font-display: swap**（CLS 0.04〜0.06）。optional にすると初回の表示は端末のフォントになる。ブランドの判断。
- **プレスキットの製品説明に Notion・アプリ内の音声入力・対話メモが無い**（生成元は `scripts/build-citation-assets.py`）。Notion の扱いの判断（docs/notion-dependency-review-2026-09-07.md）が先。

### 実験の評価の後に行う（排他的な実験の対象ページ）

- **`/obsidian/` のハブ**（video-2026-08-11-five-clips。評価日 2026-11-14 を過ぎている）：比較表の「×保管庫の読み込みを待つ」「×声メモはプラグイン前提」と、本文の「保管庫の読み込みを待っているうちに、思いつきが抜ける」は、iOS 26 の公式 Quick Capture（1.14 公開版・1.15 の音声）に合わせて直す必要がある。「×Siriでは追記できない」も、1.15 の「Quick Capture を Spotlight と Siri に追加」と照らして確かめ直す。
- **トップ（日英）と各言語のトップ**（title-2026-08-20-home-grammar。評価日 2026-11-20 を過ぎている）：
  - 英語トップの FAQ「What is Simple Memo?」が、/en/faq で直した定義（Apple Watch・Notion、整理は届いた先で行う）と違う。
  - 英語トップの「no persistent server storage of your memo text (transit only during send)」は、当社のサーバーに限った書き方になっていない（Resend は送ったメールを保存する）。
  - SoftwareApplication（#app）の alternateName と `data/site-constants.json` に、今のストア名を足す（`inject_app_schema.py` も同じコミットで回す）。
- **`/en/comparison/` の `/en/blog/best-memo-apps-2026` のカード**（aio-2026-08-12-entity-attribution）：ラベル「Ranking」・題「Best 10 Memo Apps 2026」は、リンク先（20件、順位ではない）と合わない。同じページの CollectionPage の hasPart も、10件とも題がハブ自身の題で、URL が日本語のページになっている（凍結中のページを指す項目があるので、評価の後にまとめて直す）。
- **`/obsidian/` の「30件のレビュー」**：数字は評価の件数（書かれたレビューは9件）。ラベルを「件の評価」に直す（各言語の訳も）。

### 題の変更（オーナーの承認と title_test が要る）

- `/blog/email-yourself-memo` の og:title・twitter:title・JSON-LD の題は、2026-10-03 の改題（#1903）より前の「自分にメール送るアプリiPhone — メモをワンタップ送信する方法【2026年】」のまま。`<title>` に揃えたいが、og:title は検索結果の題に使われることがあるので、題の変更として扱うかを決める。
- `/blog/obsidian-voice-fastest-route` の題と H1「Obsidianに音声で挿す最速の経路」：本文は、公式の Quick Capture を数えておらず順位も付けていないと書くようになったので、「最速」が本文で支えられていない。
- `/blog/obsidian-iphone-memo` の題「…最速のクイックキャプチャは？」：本文の FAQ は最速を決めていない。

### 次の保守で直す候補（ページ単位）

- **関連リンクの古い題**：
  - 「おすすめメモアプリ10選 2026」（リンク先は20件）が9ページに残っている。凍結中の `/blog/business-memo-apps-2026` は除く。
  - 「Captio代替サービス完全比較」が6ページ（`/comparison/` を含む）に残っている。
- **`/comparison/` の言い回し**：
  - 見出し「総合比較記事 — おすすめランキング・まとめ」のランキング。
  - CTA の説明の「計測した8アプリで最速」。条件つきの「最速」は #45 で残した形。
- **`/blog/iphone-memo-tips` の説明文**：「最速で」「徹底解説」。
- **`/obsidian/plugins/`（日英）の本文の冒頭**：
  - 「デイリーノートへ直接追記します」を、条件つき（連携をオンにしていれば）にする。
  - 共通の CTA の説明「メールにもデイリーノートにも同じ1行が残ります」は、追記先を「指定したノート」にした場合と、「Obsidian のみに保存」（Premium）の場合を含まない。
- **CTA の見出しの言い切り（#55）の残り**：`/obsidian/apple-watch-not-working/`・`/use-cases/job-hunting/`・`/vs/google-keep/`・`/vs/memo-post/`。
- **公開日のずれ**：b9b88324b（「Stagger blog dates」）で JSON-LD の datePublished と article:published_time をずらした日本語の記事24本（`/blog/email-self-task-management`・`/blog/iphone-memo-tips`・`/blog/brain-science-memo` など）で、表示の公開日・git の最初の追加日と合わない。1本の PR で全部を戻す（英語版も）。
- **冒頭の要約の箱**：`/faq`・`/en/faq`・`/vs/`・`/blog/`・`/vs/captioo/`（と英語版）・`/en/captio-alternative/` の要点（TL;DR）が、Q&A で直した製品の定義（iPhone と Apple Watch、メールに加えて Obsidian と Notion）より前の「メモ→メール送信アプリ」のまま。
- **`/obsidian/daily-note/`（日英）と `/obsidian/shortcuts-not-working/`**：Obsidian の公式の経路として 1.11 のショートカットだけを挙げ、iOS 26 の Quick Capture（今日のデイリーノートにも保存できる）に触れていない。
- **「1つのことだけ」の定義**：`/blog/captioo-alternative`（日英）と `/vs/` のいくつかのページの「メール送信に完全特化」「does one thing」は、Obsidian・Notion の届け先と AI タグがある今の製品と合わない。
- **保存の記述の一斉の見直し**：`/vs/standard-notes/`・`/blog/ai-vs-simple-memo`（「送信して終了」）・`/vs/memo-post/`（「中継するだけ」）・`/glossary/e2e-encryption/`・`/blog/email-yourself-app-comparison` と英語版に、Resend が送ったメールを保存することを足す（/privacy と同じ文で）。
- **`/blog/fastest-memo-app-benchmark` の CTA と説明**：「ベンチマーク最速のメモアプリ」「各5回」など、オーナー判断 #61（条件を添える）の残り。
- **画像**：`/blog/email-yourself-memo` の OG 画像の文字が、改題前の題のまま。

### 道具と台帳

- `growth/scripts/weekly-report.mjs --selftest` を SEO Validation に足す（ワークフローの変更になる）。
- `growth/scripts/analyze.mjs` の表示に台帳の印を付ける。`growth/scripts/build-queues.mjs` で、ページ集合の実験も扱う。
- IndexNow の送信前の確認（最大5分）は、まだ GitHub のランナーで動いていない。初回の要約を `docs/indexnow-setup.md` に残す。
- 英語のカタログの `ja:8672397889113d4a5db0`（/obsidian/properties/ の題）は直訳のまま。生成英語ページの og:title にも出るので、R10 と題の扱いを決めてから直す。

## マージの後にすること

- 本番を読み戻してから、`growth/data/annotations.json` に行を足す（本番の SHA と時刻つき）。
- IndexNow の初回の要約（「本番の公開: 確認済み／確認できず」「結果: 送信済み（HTTP …）」）を、`docs/indexnow-setup.md` の稼働確認として書く。
- sitemap の lastmod はマージした JST の日付で決まる。日付をまたいだら作り直す。
