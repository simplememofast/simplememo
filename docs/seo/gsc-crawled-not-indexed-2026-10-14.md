# GSC「クロール済み - インデックス未登録」123件（2026-10-14）

対象: ページのインデックス登録 →「クロール済み - インデックス未登録」
レポート最終更新 2026/10/09、該当 123件、検証: 開始 2026/09/29 → 不合格 2026/10/10。
オーナー提示の123件すべてを `gsc-crawled-cases-2026-10-14.json` に記録し、
`scripts/gsc-crawled-indexing.mjs` の配信方針チェック（CI: GSC Crawled URL Checks）に加えた。

前回: `gsc-crawled-not-indexed-2026-09-24.md`、ケース台帳 `gsc-crawled-cases-2026-09-29.json`。

## 結論を先に

1. **123件のうち、サイトの技術的な欠陥が原因のものは0件。**
   全2,530ページを全数検査した（canonical・hreflang 11本の相互参照・html lang/dir・robots・サイトマップ・title/description）。
   本番は repo とバイト単位で一致し、Googlebot の UA でも出し分けは無い。
2. **半数以上（72件）は、2026-10-08 の #2031 で公開した機械翻訳ページを、Google が公開2〜3日後にクロールして保留したもの。**
   公開翌日までに別の76URLには既に表示が出ている（2026-10-12 スナップショット、134表示）。
   「検証」が 10/10 に不合格になったのも、検証期間中にこれらが同じ問題の新しい事例として加わったため
   と考えられる（不合格URLの特定は GSC の「詳細を表示」でしか分からない。推定）。
3. **ただし、機械翻訳ページに品質上の欠陥がサイト全体に広がっていた。** Google の判定を待つ前に、
   次の欠陥をこの回で直した（オーナー判断 2026-10-14:「index のまま直して待つ」「機械翻訳の表示を入れる」）。
   - 日付の直訳（例「2026 año 3 mes 5 día」「2026 year 8 month」）: es/pt-BR/id/tr/ar/en の生成ページで約1,900か所、title/meta にも出ていた → 生成器で各言語の日付書式へ
   - 「ブレスト」→「乳房／breast／胸」など 9言語の誤訳、「議事録」→「minutos（分）」、fleeting notes →「自由のノート」、ネタ帳 →「物語の本」、CODE →「CÓDIGO」、Templater ページの「ceremony（儀式）」「Templateter」ほか → 66単位・計248件を訳し直し（title・h1・meta・パンくずを優先）
   - 機械翻訳であることの表示が0件 → 生成ページの h1 直下に各言語1行の注記と原文リンク
   - /voices/ の翻訳版が、機械翻訳した引用を「そのまま引用」と書いていた → 翻訳である旨に訂正（8言語。英語の人手版 /en/voices/ の「verbatim」も同様に訂正）
   - 8ロケールのホームが同じ言語のページへ1本もリンクしていなかった → ナビ・フッターの導線を追加
   - 日本固有の12トピック（特商法表記、日本のアプリ比較、LINE Keep、確定申告、就活 等）×8言語 → 台帳の `noindex` で検索対象外（93ページ。LINE系3トピックはLINE利用圏の zh-Hant を残す）
4. **残り51件は、すでに正しい状態で Google の再クロール待ち、または想定どおり。** サイト側の追加作業は無い。

## 123件の内訳

| 区分 | 件数 | 状態 | 対応 |
|---|---:|---|---|
| A. 301 済みの旧URL（`.html` / `?lang=` / 統合済み） | 25 | 全件1ホップで200・自己canonicalの正規URLへ着地。16件はクロールが301導入前、9件は導入後（Google側のラベルが古い） | なし（再クロール待ち） |
| B. 生データ（`/data/*.json` 13・CSV 1） | 14 | 全件 `X-Robots-Tag: noindex` を確認。クロール（09-03〜09-26）はすべて noindex 導入（#1668、09-29）より前 | なし。次回クロールで「noindex で除外」へ移る |
| C. 動画ファイル（`/assets/video/*.mp4?v=`） | 3 | `VideoObject` の `contentUrl`・`<video>` から参照。Google は「動画ファイルの URL を noindex / robots.txt でブロックしない」よう求めている | なし（このバケットに残るのが正常。noindex を付けない） |
| D. 新ロケールページ（#2031） | 72 | 公開2〜3日後のクロール。技術欠陥0。品質欠陥は上記のとおり修正 | 修正済み。登録は Google の判定待ち |
| E. JA/EN の正規ページ | 9 | 下表 | ページごと |
| 計 | 123 | | |

D のロケール別: id 18 / ko 12 / pt-BR 12 / ar 11 / zh-Hant 7 / es 6 / tr 4 / zh 2。
うち `/es/line-keep/` は今回 noindex 対象（台帳の種別 `noindex-html`）。

### E. JA/EN の正規ページ9件

| URL | 見立て | この回の対応 | 次の手 |
|---|---|---|---|
| `/vs/memo-post/` | Google が見ているのは 8/05 版（#1784 の事実訂正前） | ロケール版は noindex（日本のアプリ） | **オーナー: URL検査で登録をリクエスト**（訂正済み版が公開中） |
| `/en/obsidian/plugins/templater/` | #2031 の機械生成。誤訳（ceremony・Templateter・Cursis・全大文字の文・404字の説明） | 誤訳を訂正（本文の主要な誤訳を含む約30単位。同じページの8言語も） | 公開後にURL検査でリクエスト |
| `/blog/best-note-to-self-apps-2026` | #2031 の機械生成JA。既存JAページ（`/blog/email-yourself-app-comparison` 等）と意図が重なる | なし | 10/09〜11/05 の窓（11/08頃）で統合を判定。それまでJA側からリンクを足さない |
| `/iphone-shortcuts-email-guide/` | 同上（`/note-to-email/` 等と重なる） | なし | 同上 |
| `/blog/ios26-speechanalyzer-live-mic` | #2031 の機械生成JA。重なりは無い | なし | 次回、JA の `/blog/` 一覧へ掲載（8言語の訳が要る） |
| `/en/captio-migration-guide/` | `/en/captio-alternative/` と移行の意図が重なる。差出人の記述（`from:noreply@captio`）に出典が無い | なし | 差出人の記述を訂正（オーナーの受信箱で確認できれば具体化）。統合は11/08頃に判定 |
| `/vs/apple-notes/` | 日本語の検索での呼び方（iPhoneの「メモ」）と合わない。参考文献にリンクの無い項目 | なし | 改題・計測節の整理（`data/benchmark.json` の値のみ）。次回 |
| `/use-cases/managers/` | 本文が薄く、1on1 の助言が `/use-cases/meeting-notes/` と矛盾 | なし | 本文の改修。次回 |
| `/obsidian/compare/memos/` | 日本語の需要がほぼ無い（需要は英語の "memos vs obsidian"） | なし | EN 版の訳修正（日付は今回直った）。Google の判断として正当 |

## 「検証を再開」について

まだ押さない（従来の方針どおり）。

- 検証は、記録された URL がまだ問題を抱えていれば不合格になる。新しいロケールページは通常のクロールで
  「同じ問題の別の事例」として加わる（Search Console ヘルプ 7440203）。
- C の mp4 3件はこのバケットに残り続ける（正しい状態）。A/B は「Other」（修正済み扱い）になるので原因ではない。
- 押さなくても登録の判定は同じ。検証は表示上の手続き。
- 押す目安: ロケール別の未登録件数が減り、E の正規ページが URL 検査で「登録されています」になってから。

## 変更点（この PR）

### 1. 日付の書式（生成器）

`scripts/site_translation_dates.py`。翻訳エンジンは数字を保護マーカーとして見ているため、
年/月/日を単語ごとに直訳していた。原文の翻訳単位から日付の実際の数字を取り出し、
**その日付だけ**を各言語の書式に置き換える（期間「1年で削除」・別の年・版番号は変えない）。

| 言語 | 例（前 → 後） |
|---|---|
| en | 2026 years 8 month 11 days → August 11, 2026 |
| es | 2026 año 1 mes 31 día → 31 de enero de 2026 |
| pt-BR | 2026 ano 05 mês 07 dia → 7 de maio de 2026 |
| id | 2026 tahun 10 bulan 4 hari → 4 Oktober 2026 / tanggal 13 bulan 7 tahun 2026 → tanggal 13 Juli 2026 |
| tr | 2026 yıl 10 ay 4 gün → 4 Ekim 2026 / 2026 yılı 9 ayı → 2026 yılı Eylül ayı |
| ar | 2026 سنة 1 شهر 31 يوم → 31 يناير 2026 |

中国語・韓国語は 年/月/日・년/월/일 がそのまま正しいので対象外。

### 2. 誤訳の訂正（overrides）

`data/i18n/overrides/<locale>.json` に 66単位・計248件（en 32 / zh-Hans 22 / zh-Hant 22 / ko 16 / es 33 / pt-BR 28 / id 30 / ar 35 / tr 30）。
同じ内容を `data/i18n/translations/<locale>.json` にも反映した（取り込み元の下書きは repo 外のため）。
すべて `site_translation_validation.validate()`（マーカー・入れ子・未翻訳）と描画を通している。
訂正の一部は、PR 作成前の反証レビュー（訳文担当）が指摘・起案したもので、指摘のあった
「es だけ直っていない全部大文字の文」「h1・パンくずに届いていない fleeting notes の訂正」
「Templater ページの英語以外の誤訳」も同じ回で直した。

- 「ブレスト」を含む9単位を、9言語すべてで訳し直した（用語だけでなく、同じ文の「議事録→minutes」
  「デジタル清書→digital calligraphy」「自由な発想→ideas gratuitas（無料の）」も）。
- 検索結果に出る title・h1・meta description・パンくずのうち、fleeting notes、議事録、CODE/PARA、
  ブログネタ、Zettelkasten の誤訳。
- `/obsidian/plugins/templater/` の生成版（en と8言語）: 「式が残った→ceremony」「根拠と範囲→Ensis」
  「Templateter」「展開→deploy」、全部大文字の文、UI の値 None の誤訳。`/obsidian/compare/anytype/` の全部大文字の文。
- `/voices/` の8言語: 機械翻訳した引用を「そのまま引用」としていた記述。
- `/autopilot/` の es: 「2026年6月から9月までの4か月」「同じ192タスクを分母に固定」の意味の崩れ。

トルコ語では、日付を月名へ置き換えた後の接尾辞を母音調和に合わせ直す（「13 Eylül'daki」→「13 Eylül'deki」）。

**残っているもの**: 本文の誤訳は、候補の機械的な抽出で「議事録→minutes」143単位、「ネタ」系78、CODE/PARA 83 などが
まだある（正しく訳されたものを含む概数）。この回は検索結果に出る部分と、明白な意味の誤りを優先した。
アラビア語・トルコ語・インドネシア語は、母語話者による確認を受けていない。

### 3. 機械翻訳の注記

`scripts/site_translation_notice.py`。生成ページ（台帳の `existing` 以外）の h1 直下に、
各言語で「原文（日本語／英語）から機械翻訳したページ」と原文へのリンクを1行入れる。
人手の編集版（JA/EN の既存ページ、ロケールのホーム）には入らない。
Google の有用性チェック項目（自動化の開示）と、サイトの誠実性方針に沿う。順位を上げる根拠は無い。

### 4. 地域に関係のないページの noindex（台帳）

`data/i18n/pages.json` の各グループに任意の `noindex: [locale…]` を追加。対象ロケールは:

- 生成ページに `<meta name="robots" content="noindex, follow">`（言語メニューからは引き続き読める）
- 同じグループの hreflang・x-default・サイトマップから除外（`localization_registry.indexed()`）
- 人手の編集版（`existing`）は指定できない（台帳の検証で拒否）

対象12トピック: `legal.html`、`obsidian/community/`、`vs/memo-post/`、`vs/moca/`、`vs/stock/`、
`line-keep/`、`blog/line-keep-alternative`、`vs/line-keep-memo/`（この3つは zh-Hant を残す）、
`blog/freelance-memo-management`、`use-cases/job-hunting/`、`data/voice-shift/`、`voices/`。計93ページ。
過去28日の表示は計4（ko/pt-BR/id の line-keep-alternative 各1、ko の vs/memo-post 1）で、失うものはほぼ無い。

### 5. ロケールのホームの導線

8ロケールのホーム（人手版の旧LP）は、ロゴ・言語メニュー・App Store 以外のリンクが無く、
各ロケール247ページがホームから辿れなかった。生成ページと同じヘッダー9ハブ・フッター導線を入れ、
AI タグのカードが `/en/ai-tags/` を指していたのを各ロケール版へ直した。

### 6. 記録

- `growth/data/annotations.json`: #2031（10-08）が台帳に無かったので後追いで記録し、評価中の実験の交絡として明記。この PR も記録。
- `docs/seo/gsc-crawled-cases-2026-10-14.json`: 123件と「前回のクロール」日。種別に `video`（200・video/mp4・noindex なし、HEAD で検査）と `noindex-html` を追加。

## 意図的にやっていないこと

- **実行中・評価待ちの実験の対象ページ**（`/obsidian/`・`/obsidian/plugins/`・`/blog/fastest-memo-app-benchmark`・
  `/blog/email-yourself-memo`・`/voice-input/` 等）の JA 原文は触っていない。監査で出た
  「/obsidian/ ハブにガイド一覧」「プラグインのハブから Templater へリンク」は、それぞれの実験の評価後に回す。
- **意図が重なる生成JAページ8件**は、統合も noindex もリンク追加もしていない。「表示ゼロ＋強い競合ページ」の
  証拠がそろうまで統合しない方針に従い、10/09〜11/05 の窓（11/08頃）で判定する。
- **機械翻訳の残りの誤訳**（§2「残っているもの」）。
- mp4 への noindex、`/data/benchmark-2026.csv` 等の追加の noindex（JSON 以外の生データは今回の123件に入っていない）。

## オーナー操作（GSC）

1. URL 検査で `https://simplememofast.com/vs/memo-post/` の登録をリクエスト（訂正済みの版が公開中で、Google は 8/05 版を見ている）。
2. この PR の公開後、`/en/obsidian/plugins/templater/` の登録をリクエスト。
3. 検証の「詳細を表示」で、不合格になった URL の種類（ロケール HTML／既存 JA・EN／mp4）を控える（原因の推定の確認用）。
4. 「検証を再開」はまだ押さない（上記）。
5. ロケール版の大量の登録リクエストはしない（Search Console ヘルプ: "no need to resubmit"）。

## 次の確認

- 10/22 頃: 日付・誤訳の修正版が再クロールされ始めたか（URL 検査で抜き取り）。
- 11/08 頃（10/09〜11/05 の28日窓）: ロケール別の表示・登録状況、意図が重なる生成JA 8件の統合判定、
  JA 既存ページの週次表示に悪化が無いか。

## 追補（2026-10-15）: 続きの修正

PR #2080 の後に、報告で「次回」としていた項目のうち、事実の裏付けが取れるものを直した。

### 未登録だった JA/EN ページの記述

| ページ | 直したこと |
|---|---|
| `/use-cases/managers/`（JA・EN） | 1on1 の記録を「評価面談の材料」として、例文に「◎」「委譲が弱い」と書いていた。兄弟ページ `/use-cases/meeting-notes/` の方針（評価や感想は書かない）と矛盾していたため、「相手の言葉・合意・次回確認すること」を残す書き方に改め、評価に使う記録は社内ルールと本人への共有範囲を確認する旨を添えた。本文のどの主張も裏付けていなかった参考文献（日本生産性本部のトップページ、EN は HBR・Google re:Work の一般ページ）は外した。 |
| `/vs/memo-post/`（JA・EN） | 参考文献にリンクの無い名前だけの項目（App Store・TrustRadius）と、メモポストの記述を裏付けない PCMag・HBR の一般ページが並んでいた。メモポスト公式サイト（料金プラン・Android 対応・アカウント登録を 2026-10-15 に確認）と、開発者の note（Mac 版の記録、2024-12-31）に差し替えた。 |
| `/vs/apple-notes/`（JA・EN） | 参考文献のリンクの無い項目（G2）を外した。 |
| `/en/captio-migration-guide/`（と生成版9言語） | 「`from:noreply@captio` で全部出る」と、Captio の差出人を出典なしで断定していた。「captio」や覚えている語句で探し、見つかった1通の差出人を確かめてから、そのアドレスで検索する書き方に改めた。 |

原文の変更で生じた翻訳単位（13単位）は、生成している各言語（8〜9言語）で訳し直した。

### 機械翻訳の型の誤訳（本文）

`議事録`（会議の記録）を時間の「分」（minutos・dakika・menit・دقائق）、`ネタ`（題材・アイデア）を「物語」（cuento・hikaye・cerita・قصة・故事）、
方法名の `CODE`/`PARA` を「CÓDIGO・KOD・KODE」、`フリーティングノート` を「自由・解放・無料のノート」と訳していた単位を、
言語ごとに訳者と反証役の2段で判定し、誤っていたものだけを訳し直した（誤検出は見送り）。

訂正は計457件（ar 87 / es 79 / id 91 / tr 69 / pt-BR 58 / zh-Hans 36 / zh-Hant 36 / en 1）。候補366件のうち誤検出として見送ったのは1件で、
残りは同じ単位に誤訳が実際に残っていた。訳者が候補の抽出から漏れていた同じ型の誤訳（「凍結のメモ」「免费笔记」「Freeting」など）も見つけて訂正した。
各訂正は `validate()`（マーカー・入れ子・未翻訳）を通し、反証役が日本語原文（保護値を代入）と1件ずつ突き合わせた（手直し54件）。
同じ単位の他の明白な誤訳（タップ→grifo など）も直したが、原文に無い内容は足していない。母語話者の確認は受けていない。

**まだ残っているもの**: この4つの型以外の本文の誤訳。反証役が隣接単位で見つけた未訂正の例（es「Página de la segunda explicación del cerebro」、
リンク文言と遷移先の title の食い違い）もある。全ページを人手で読む工程は無く、型ごとの抽出・訂正を続けるのが現実的な進め方。
