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

- **（同じ日の続きで直した。下の「続き」の節）`/obsidian/` のハブ**（video-2026-08-11-five-clips。評価日 2026-11-14 を過ぎている）：比較表の「×保管庫の読み込みを待つ」「×声メモはプラグイン前提」と、本文の「保管庫の読み込みを待っているうちに、思いつきが抜ける」は、iOS 26 の公式 Quick Capture（1.14 公開版・1.15 の音声）に合わせて直す必要がある。「×Siriでは追記できない」も、1.15 の「Quick Capture を Spotlight と Siri に追加」と照らして確かめ直す。
- **トップ（日英）と各言語のトップ**（title-2026-08-20-home-grammar。評価日 2026-11-20 を過ぎている）：
  - 英語トップの FAQ「What is Simple Memo?」が、/en/faq で直した定義（Apple Watch・Notion、整理は届いた先で行う）と違う。
  - （同じ日の続きで直した。題の試験の範囲は日本語のトップだけ）英語トップの「no persistent server storage of your memo text (transit only during send)」は、当社のサーバーに限った書き方になっていない（Resend は送ったメールを保存する）。
  - SoftwareApplication（#app）の alternateName と `data/site-constants.json` に、今のストア名を足す（`inject_app_schema.py` も同じコミットで回す）。
- **`/en/comparison/` の `/en/blog/best-memo-apps-2026` のカード**（aio-2026-08-12-entity-attribution）：ラベル「Ranking」・題「Best 10 Memo Apps 2026」は、リンク先（20件、順位ではない）と合わない。同じページの CollectionPage の hasPart も、10件とも題がハブ自身の題で、URL が日本語のページになっている（凍結中のページを指す項目があるので、評価の後にまとめて直す）。
- **（同じ日の続きで直した）`/obsidian/` の「30件のレビュー」**：数字は評価の件数（書かれたレビューは9件）。ラベルを「件の評価」に直す（各言語の訳も）。

### 題の変更（オーナーの承認と title_test が要る）

- `/blog/email-yourself-memo` の og:title・twitter:title・JSON-LD の題は、2026-10-03 の改題（#1903）より前の「自分にメール送るアプリiPhone — メモをワンタップ送信する方法【2026年】」のまま。`<title>` に揃えたいが、og:title は検索結果の題に使われることがあるので、題の変更として扱うかを決める。
- （同じ日の続きで、title_test に登録して直した）`/blog/obsidian-voice-fastest-route` の題と H1「Obsidianに音声で挿す最速の経路」：本文は、公式の Quick Capture を数えておらず順位も付けていないと書くようになったので、「最速」が本文で支えられていない。
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
- （済み）IndexNow の送信前の確認（最大5分）は、#2431 と #2432 のマージで GitHub のランナーで動いた。要約は `docs/indexnow-setup.md` の稼働確認に書いた。
- 英語のカタログの `ja:8672397889113d4a5db0`（/obsidian/properties/ の題）は直訳のまま。生成英語ページの og:title にも出るので、R10 と題の扱いを決めてから直す。

## マージの後にすること（済み）

- #2431 は 2026-11-27T23:52:22Z（JST 11-28 08:52）にマージされ、Cloudflare Pages の配備は 23:52:54Z に終わった。本番の読み戻し（2026-11-28T01:48Z）で、llms.txt・/faq・開発記録・/note-to-email/ などの新しい本文と、sitemap の lastmod を確かめた。`growth/data/annotations.json` に行を足した。
- IndexNow の初回の要約を `docs/indexnow-setup.md` の稼働確認に書いた（406 URL、本番の公開を22秒で確認、HTTP 200）。
- マージは JST の同じ日（11-28）なので、sitemap は作り直さなくてよかった。

## 続き：同じ日の2本目の PR（2026-11-28）

オーナーの承認（2026-11-28）を受けて、#2431 の記録で「判断が要る」とした項目のうち、事実を確かめられたものを直した。

### 1. 個人の呼び名を、公開のページと文書から外した

- `/captio/`（日本語と9言語）の囲みの見出しを「ブログ記事から来た方へ」に替え、同じ名前の CSS クラスと HTML コメントも中立の名前にした。古い見出しの訳は、翻訳の台帳から消した。
- 文書（`docs/` の調査記録・監査の写し・引き継ぎの文書、`data/corporate-obligations.json` の自由記述）では、旧ブログのドメインを「〈旧ブログのドメイン〉」、外部サイトの個人のプロフィールを「〈個人のプロフィール〉」に伏せた。文書はサイトでは配信されていない（`/docs/`・`/data/` は 404）が、リポジトリが公開なので外した。
- 管理画面の CSV（`admin/brand/content/captio-handled.csv`）にあった個人アカウントの除外の行は、名前を平文で置かず、照合用の符号（`fnv1a:` ＋16進8桁）で書く形にした。`admin/brand/index.html` に `capUserKey()` を足し、除外の対象（47件）と判定は変えていない。符号は照合のためのもので、秘匿の仕組みではない。管理画面は 2026-10-20 から廃止されていて（`/admin/*` は 410。`scripts/admin-retirement.test.mjs`）、配信される物は変わらない。
- git の履歴には残る（書き換えていない）。

### 2. アプリのコード（App Store 版 5.9.35、次の 5.9.37、Relay API）で確かめて直したもの

4つの記述を、それぞれ別の AI が調べ、さらに別の AI が反証を試みた。4件とも「サイトの一部が誤り」という判定は覆らなかった。

- **ログ（/faq と英語版）**：「DEBUG ビルドを含むすべてのビルドで、メールアドレス・認証コード・トークン・URL を出力しない」「エラーログは型名のみ」は誤りだった。DEBUG ビルドは、認証メールのリンクを開いたときの URL（認証コードと使い捨てトークンを含む）や、一部のエラーの詳細を Xcode のコンソールに出す。リリース版のアプリのコードが書くログは、購入・復元・購読確認の診断だけ。メモ本文は、DEBUG ビルドでもアプリのコードがログに渡さない。答えを、アプリと Relay API の「コードが出すログ」に範囲を絞って書き直した（SDK・OS・Cloudflare が自動で残す記録は、この答えの範囲の外）。
- **件名（/faq と英語版、llms.txt）**：60文字で切るのは1行目だけで、末尾に「…」が付き、件名テンプレートは別に付く。Obsidian 連携と「AIタグ自動追加」がオンのときは、1行目を端末内で20文字以内に縮めたものになる（Apple Intelligence が作った題ではない）。
- **AI タグ（llms.txt、/faq の「どんなアプリですか？」と英語版）**：5.9.35 で外に出るのはタグだけで、Obsidian の追記行に #タグ として付く。題と種別（todo／idea／log）はノートにもメールにも書かれず、メールにタグは付かない。
- **英語のトップの保存の言い方**：「no persistent server storage of your memo text (transit only during send)」を、当社のサーバーに限った書き方にし、配信の Resend が送ったメールを保存することを添えた（#2431 で /faq に入れた説明と同じ）。
- **外部 SDK と利用解析（開発記録 /devlog/privacy-first-design と /devlog/outbox-architecture、/blog/memo-app-privacy、各英語版）**：5.9.35 は AppsFlyer SDK を含まず、自社の利用イベントと購読状態の分析も送らない（分析について送るのは、過去の分析データの削除と失効の要求だけ）。現在形で「AppsFlyer を使う」「有効になっている」と書いていた文を、「5.9.32 までの版は、版と設定により…ことがある」と「5.9.35 は送らない」に分けた。/blog/memo-app-privacy の照合日は 2026-11-28 にした。

### 3. `/obsidian/` のハブ（video-2026-08-11-five-clips の範囲。評価日 11-14 の後）

- 「摩擦」の1文に、iOS 26 では公式の Quick Capture（1.14〜）なら保管庫の読み込みを待たずに書けることを足した。
- 比較表の Obsidian の列を、iOS 26 の Quick Capture に合わせた（待たずに書ける 1.14〜、音声も文字に 1.15〜、Siri から Quick Capture を開ける 1.15〜。Apple Watch のアプリが無いことは残した）。1.15 の項目は、公式の変更履歴（2026-11-02）を 2026-11-28 に読んで確かめた。
- 見出しの「同じ目的、違う速さ。」を「同じ目的、違う役割。」にした（Quick Capture と速さを比べた計測は無い）。
- 「30件のレビュー」を「30件の評価」にした（30 は評価の件数）。
- デモのメールの欄の「件名: AI生成タイトル」と本文の #タグ を、5.9.35 の実際（件名はメモの1行目、メールにタグは付かない）に合わせた。デモの文字列は訳してよいプログラムの文字列として登録されているので、`data/i18n/dynamic-text.json` の登録（スクリプトのハッシュと位置）も新しいスクリプトに合わせ、2単位の訳を9言語（実行時の訳のファイルは全言語に作られるので英語も）に足した。
- 動画・VideoObject・題・CTA は変えていない。実験の notes に記した。
- デモの訳を足したので、実行時の訳のファイル（`js/i18n/<言語>/messages.*.js`。名前は中身のハッシュ）が作り直された。それを読み込む各言語のページ（`/ai-tags/`・`/methods/second-brain/` の生成翻訳を含む約20ページ×各言語）では、参照の名前だけが変わった。古いファイルは、キャッシュに残る古いページが読みに来ても壊れないよう残した（どのページからも参照されていない）。

### 4. 題の試験：`/blog/obsidian-voice-fastest-route`

- 題・og:title・twitter:title・H1・JSON-LD の headline・パンくずを「Obsidianに音声で挿す5つの経路 — 画面数とタップ数で数える」にした。本文の「最速」の定義（省けない操作の数）は残した。
- このページへのリンクの文字（/blog/ のカードと構造化データ、/obsidian/・/obsidian/airpods/・/data/voice-shift/ の関連リンク、/en/blog/・/en/obsidian/）も揃えた。
- `growth/experiments/experiments.json` に `title-2026-11-28-voice-route-superlative` を登録した。日本語のページは直近28日の表示が0回で、差は測れない見込み。主な目的は事実の訂正で、結果にかかわらず最上級には戻さない。

### オーナー・開発者の判断が要るもの（今回わかったこと）

- **AI タグの説明（約30ページ）**：`/ai-tags/`（日英と8言語）、英語のトップ、日本語のトップの構造化データ、`/blog/ai-vs-simple-memo`、`/vs/` の各ページなどが、「題・タグ・種別を付ける」「件名も自動生成」「Inbox へ振り分け」と書いている。5.9.35 で外に出るのはタグだけ。サイトを今のアプリに合わせるか、アプリが題やプロパティを書くように戻すかを決める。`/ai-tags/` とトップは実験の範囲で、`/ai-tags/` の動画の中身は直せない。
- **プライバシーポリシー（日英と8言語）**：
  - 「リマインダー、カレンダーへの保存は iPhone の中で行い」は、データの経路としては正しいが、今選べる送り先のように読める（5.9.35 には機能が入っているが、遠隔の切り替えで閉じている。配信側の段階公開を100%にすると、アプリの更新なしで開く）。
  - 1(E) の版ごとの表に 5.9.35 の行が無い。表の 5.9.11〜5.9.14 の AppsFlyer の行は、iOS の台帳の記録と合わない可能性があり、確かめ直しが要る。
  - 「（開発時の DEBUG ビルドを除く）」の例外に当たるサーバーのコードは無い。
- **アプリの文言**：設定の「AIタグ自動追加」の解錠の文（英語）が「題・タグ・プロパティ付きで Obsidian に保存」と書いている。
- **残した記述**：`/devlog/day1` の「エラーログでは localizedDescription を使わず type(of:) のみ」は、1日目の記録として残した。
- **12月上旬の一括デプロイで直す訳（今回の照合で見つかったもの）**：`/faq` の件名の節で、今回直した答えの隣にある問いと箇条（6単位）が機械訳のまま。es は件名を「tema」「sujeto」、ko は「제목」の「제」が欠けた「목」、tr は「özne」（文法の主語）と訳している。設定の名前（「AIタグ自動追加」）の訳も、es・pt-BR・ar で「IA」と「AI」が混在している。

## 続き：同じ日の3本目の PR（2026-11-28）

2本目の記録で「判断が要る」とした AI タグの説明とプライバシーポリシーを、オーナーの依頼（2026-11-28）を受けて、アプリのコード（App Store 版 5.9.35）に合わせて直した。

### 1. AI タグの説明を 5.9.35 に合わせた

- 5.9.35 の「AIタグ自動追加」は既定でオフで、Obsidian 連携を設定したときだけオンにできる（無料）。オンにすると、Obsidian のノート（デイリーノートか、設定で選んだノート）に追記する1行に、端末内で選んだタグ（最大3個。付かないこともある）を `- 14:21 #タグ #タグ 本文` の形で付ける。Apple Intelligence に対応した iPhone では Apple の Foundation Models、ほかでは端末内のルールで選ぶ。題・種別（todo／idea／log）・プロパティは書かず、内容でノートを振り分けもしない。メールにタグは付かない。件名はメモの1行目で、連携とこの設定がオンのときは、端末内の決まったルールで20文字以内に縮めたもの。
- 直したページ（日本語と英語、39ファイル）：`/ai-tags/`（本文・FAQ と構造化データ・meta と og の description・デモ・動画の caption と VideoObject）、トップ（日本語は description と構造化データ、英語は本文と構造化データ）、`/vs/` の11ページ（一覧、Apple Notes、Evernote、Google Keep、Email Me、Obsidian の共有シート、Craft、メモポスト、OneNote、Standard Notes、Tana）、`/blog/ai-vs-simple-memo`・`/blog/how-to-choose-memo-app`・`/blog/iphone-memo-tips`・`/download/`・`/voices/`・`/privacy-architecture/`（各英語版も）、`/en/blog/how-to-email-yourself-note-iphone`、`llms.txt`。
- 方法：記述の候補を検索で集め、ページの組ごとに別の AI が直す案を作り、さらに別の AI が反証を試みた。採用は105件。英語から作る日本語のページ（`/blog/how-to-email-yourself-note-iphone`）を直接直す案は採らず、英語の元の文を直して訳を作り直した。
- デモ（日英）：ノートに追記される1行（`- 14:21 #買い物 #日用品 帰りに…`）を見せる形にし、バッジを「選んだノートに追記」「件名は1行目（20字まで）」にした。日本語のデモの文字列は訳してよいプログラムの文字列なので、`data/i18n/dynamic-text.json` の登録（12件）を新しいスクリプトに合わせ、タグとバッジの訳を9言語に足した。タグの訳は Obsidian のタグの形（空白の無い1語）にした。
- 動画（`assets/video/ai-tags.mp4`）の中身は、題・タグ・種別を付ける場面と「整理は、AIにやらせる。」の結びのままで、今回は作り直していない（作り直しには Pillow・ffmpeg・日本語フォントの取得が要る）。ページの caption と VideoObject、`scripts/build-videos.py` の説明文と `assets/video/manifest.json` は「AI が求める題・タグ・種別を示した図解で、ノートに書かれるのはタグだけ」と書いた。
- 題（`/ai-tags/` の「AIが整える」、英語の「AI files it.」、英語のトップの「AI Auto-Tagging Notes to Email & Obsidian」）は題の規則（オーナーの承認と title_test）に当たるので変えていない。
- 生成翻訳（8言語）：新しい文（各言語60単位。うちデモのタグ5つ）を、言語ごとに別の AI が訳し、さらに別の AI が事実の要約と英語版に照らして点検した。設定の名前は、各言語の台帳で最も多い形に揃えた（混在の解消は12月上旬の一括デプロイ）。
- 8言語の手書きのトップ（`/zh/`・`/zh-Hant/`・`/ko/`・`/es/`・`/pt-BR/`・`/id/`・`/ar/`・`/tr/`）：翻訳の生成の対象外なので、description（meta・og・twitter）・構造化データの featureList・AI タグのバナーにあった「題・タグ・種別を付ける」「件名にも短い題が付く」を直接直した（33か所）。言語ごとに別の AI が直す案を作り、別の AI が反証を試みた。設定の名前は、アプリの表示どおり英語の「AI Auto-Tagging」のまま。題・og:title・twitter:title・H1 は変えていない。
- デモのメモ文（「オンボーディングで最初の1通を送るまでを30秒にできたら、離脱が減りそう」）の既存の訳は、英・簡・繁・西で意味が崩れ（中国語は「入职」＝入社、英語は「reduce the withdrawal」など）、葡は「as primeiras 1 mensagens」（1なのに複数形）だった。新しいタグの訳と揃うよう、この5言語を訳し直し、別の AI 2体（意味と数字の扱い、母語としての自然さ）が反証を試みた。ほかの4言語は点検済みの訳のまま。

### 2. OG 画像

- トップ（日英）のカードの副題を「Obsidian連携でオンにすれば、AIがタグを自動で付ける。」「Opt-in AI adds tags for Obsidian.」にした（`scripts/generate-og-feature.js`）。新しい名前（`index-20261128.jpg`・`index-en-20261128.jpg`）にして、使っている13ページ（と生成翻訳）の参照を付け替えた。古いカードは、共有済みのリンクのキャッシュのために残した。
- `/ai-tags/` のカードは、右下の注記の2行目「メモが外部サーバーへ送られることはありません。」を「タグ付けのためにメモが外部へ送られることはありません。」に替えた（`og/ai-tags-20261128.jpg`）。メールの配送では本文が当社の Relay API と配信の Resend を通るので、範囲を限った。元の絵（`assets/img/ai-tags-banner-ja.png`）は画像生成の署名付きの来歴（C2PA）を持ち、書き換えると署名が壊れるので、そのままにした。新しいカードは、元の絵から `scripts/build-ai-tags-banner.py` と同じ切り出しをして、注記の2行だけを消し、同じ位置・大きさ・色で描き直したもの（ブラウザの canvas で作った）。元の絵と、そこから作る `og/ai-tags.jpg`・本文用のバナー（`ai-tags-banner-ja.*`。今はどのページも使っていない）には古い注記が残る。

### 3. プライバシーポリシー（日英と8言語）

- 1(E) の版ごとの表に 5.9.35 の行を足した（利用状況と購読状態の分析は送らず、過去の分析データの削除・失効の依頼だけを送る。一部は自動。AppsFlyer はアプリに含まない。設定の「過去の分析データ」）。5.9.33 と 5.9.34 も、App Store で公開していない版として書いた（App Store Connect の版の一覧と、版ごとのセッションの記録で確かめた）。
- 表の 5.9.11〜5.9.14 の「AppsFlyer を開始しない」は正しかった（開始の条件がコンパイル時に false）。合わないのは iOS の台帳（`data/third-party-egress.json` と `docs/release/analytics-optin/privacy-alignment-plan.md` の記述）のほうで、iOS のリポジトリで直す。
- リマインダーとカレンダーへの保存：5.9.35 では、入口がすべて遠隔の切り替え（`routing_suggest_v2`、既定はオフ）の後ろにある。今選べる送り先のように読めないよう、「アプリで使える場合も、その保存は iPhone の中で行う」と書き分けた。
- ログ：「当社のログにも記録しません（開発時の DEBUG ビルドを除く）」の例外に当たるコードは、アプリにも Relay API にも無かった。「Relay API のコードは、メモ本文をログに出力しない。アプリのコードも、DEBUG ビルドを含むどのビルドでも、メモ本文をログに渡さない」に替えた。
- 12 の「獲得元の区分」：版を限らずに「アプリは…iPhone の中にも記録します」と書いていた。記録するのは 5.9.9 以前（版による）と 5.9.16〜5.9.32 で（`analytics.appsflyerGCD.v1.` の値）、5.9.15 は 1(F) のとおり。5.9.35 は記録せず、起動時に、それより前の版が残したこの区分の記録を消す（`PrivacyChoiceStore.removeLegacyState()`）。旧版は利用者が更新するまで手元で動き続けるので、ポリシーのほかの箇所と同じく、旧版の動作は現在形のまま版を名指しして書き、5.9.35 の動作を足した。13(C) の「アプリが受け取る獲得元の区分」も「5.9.32 までの版のアプリが受け取る」にした。最初の案は旧版の動作を過去形にしていたが、反証の段で、すぐ上の AppsFlyer の項目（現在形）と食い違うと指摘されて改めた。
- 最終更新日を 2026-11-28 にした。
- 確かめ方：別の AI が案を作り、さらに別の AI が、App Store 版のタグの付いたコード、Relay API のコード、App Store Connect の記録で反証を試みた。
- 生成翻訳（8言語）：直した8単位を、言語ごとに別の AI が訳し、別の AI が時制・版の範囲・アプリの表示名に照らして点検した。「過去の分析データ」は、アプリが訳を持つ言語（zh-Hans・zh-Hant・es・pt・ar）ではその表示に、持たない言語（ko・id・tr）では英語の表示「Past analytics data」に揃えた。

### 4. #2436 のマージの後（済み）

- 2026-11-28T04:29:35Z にマージされ、Cloudflare Pages の配備チェックは 04:30:07Z に終わった。本番の読み戻し（04:54Z）で新しい本文を確かめ、`growth/data/annotations.json` に行を足した。
- IndexNow は、参照の付け替えだけのページを「内容の変更なし」として外し、93件を通知した（HTTP 200）。`docs/indexnow-setup.md` に3回目として書いた。

### オーナー・開発者の判断が要るもの（更新）

- 2本目の記録の「AI タグの説明」と「プライバシーポリシー」の項は、この PR で直した。
- **アプリの文言**：「AIタグ自動追加」を解錠するときの文（`settings.ai_format.unlock_message`）が、英語だけでなく日本語も「タイトル・タグ・プロパティ付きで Obsidian に保存」と書いている。英語は「メモは端末から出ない」とも書くが、メールの送信では本文が端末から出る。iOS のリポジトリで直す。
- **動画の作り直し**：`assets/video/ai-tags.mp4` の中身を 5.9.35 に合わせるには、作り直しの道具（Pillow・ffmpeg・日本語フォント）の取得が要る。
- **題**：`/ai-tags/` の「AIが整える」と英語の「AI files it.」、英語のトップの題。題の規則に当たる。
- **SKAdNetwork**：5.9.35 より前の版の Info.plist は、SKAdNetwork と AdAttributionKit の通知（ポストバック）の写しの送り先（`NSAdvertisingAttributionReportEndpoint`）を AppsFlyer にしていた（アプリのコードの注記では v2.1.0 で足し、5.9.35 で外した）。広告からのインストールで通知が作られると、SDK を開始しない版でも、OS がその写しを送る。ポリシーはこれに触れていない。Apple の動作についての記述になるので、書くかどうかと書き方を決める。
- **プライバシーポリシーの残り（今回の検証で見つかったもの）**：12 の「AppsFlyerによる計測」の項目は、5.9.9 以前の版も AppsFlyer の計測結果を受け取って大まかな区分を送ると書いているが、その仕組みは v5.8.66 で入り、それより古い版（v4.0〜v5.8.1）には無い（書きすぎの方向）。13(C) の「記録されたクリックは、一定の期間、アプリの初回起動と照合されることがあります」は現在形のままだが、新しいインストールは SDK を含まない 5.9.35 になり、OneLink は 2026-11-17 にやめている。どちらも版と時期で書き分けるかを決める。
- **12月上旬の一括デプロイ**：設定の名前（「AIタグ自動追加」）の訳。5.9.35 は日英以外の言語にこの設定の訳を持たず、画面には英語の「AI Auto-Tagging」が出る。サイトの8言語は訳した名前（zh-Hans の「AI标签自动添加」など。es・pt-BR・ar は「IA」と「AI」も混在）を使っている。今回の新しい文は、ページの中で揃うよう各言語の台帳で最も多い形にした。画面の表示に合わせるかを、全ページで一度に決める。（「過去の分析データ」は、zh-Hans・zh-Hant・es・pt・ar の訳をアプリが持っているので、ポリシーの訳はその表示に合わせた。）
