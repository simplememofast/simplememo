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
   - 「ブレスト」→「乳房／breast／胸」など 9言語の誤訳、「議事録」→「minutos（分）」、fleeting notes →「自由のノート」、ネタ帳 →「物語の本」、CODE →「CÓDIGO」ほか → 126単位を訳し直し（title・h1・meta を優先）
   - 機械翻訳であることの表示が0件 → 生成ページの h1 直下に各言語1行の注記と原文リンク
   - /voices/ の翻訳版が、機械翻訳した引用を「そのまま引用」と書いていた → 翻訳である旨に訂正（8言語）
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
| `/en/obsidian/plugins/templater/` | #2031 の機械生成。誤訳（ceremony・Templateter・Cursis・全大文字の文・404字の説明） | 誤訳を訂正 | 公開後にURL検査でリクエスト |
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

`data/i18n/overrides/<locale>.json` に126単位（＋/voices/ 16単位）。同じ内容を
`data/i18n/translations/<locale>.json` にも反映した（取り込み元の下書きは repo 外のため）。
すべて `site_translation_validation.validate()`（マーカー・入れ子・未翻訳）を通している。

- 「ブレスト」を含む9単位を、9言語すべてで訳し直した（用語だけでなく、同じ文の「議事録→minutes」
  「デジタル清書→digital calligraphy」「自由な発想→ideas gratuitas（無料の）」も）。
- 検索結果に出る title・h1・meta description のうち、fleeting notes（zh/zh-Hant/es/tr）、議事録（pt-BR/id/tr/es/ar）、
  CODE/PARA（pt-BR/es/id/tr）、ブログネタ（es/pt-BR/id/tr/ar）の誤訳。
- `/en/obsidian/plugins/templater/` の誤訳一式と、全部大文字の文（templater・compare/anytype の en/es/id）。

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
- **機械翻訳の残りの誤訳**: 候補の機械的な抽出では、本文の「議事録→minutes」143単位、「ネタ」系78、CODE/PARA 83 などが
  まだ残る（正しく訳されているものを含む概数）。この回は検索結果に出る title・h1・meta を優先した。
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
