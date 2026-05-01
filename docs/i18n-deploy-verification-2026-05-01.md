# i18n プロジェクト デプロイ後検証レポート

**実施日**: 2026-05-01
**実施環境**: Claude in Chrome（実ブラウザ経由）
**対象**: 引き継ぎドキュメント §4.1 / spec §8.1 / §8.3

---

## サマリー

**判定: PASS**（重大なリグレッションなし。要対応の軽微な発見あり）

| カテゴリ | 結果 |
|---|---|
| Sitemap (index/ja/en) | PASS |
| robots.txt | PASS |
| llms.txt | PASS |
| hreflang 双方向性（5 paired pairs） | PASS（10 ページすべて整合） |
| JSON-LD（Article/Breadcrumb/WebPage/FAQPage） | PASS |
| CSS キャッシュバスト（?v=20260501） | PASS |
| content-language meta カバレッジ | PASS（検証 9 ページすべて） |
| GA4 page_language 注入 | PASS（GA4 が載っているページに正しく注入） |
| AI クローラー allowlist | PASS |
| IndexNow 鍵配信 | PASS（両鍵が 200 で稼働中、§2.1 残課題） |
| **発見事項** | 5 件、いずれも MUST ではなく SHOULD レベル |

---

## 1. Sitemap 検証

| URL | HTTP | URL 数 | スペック値 | 判定 |
|---|---|---|---|---|
| `/sitemap.xml` (index) | 200 | 2 sub-sitemaps | 2 | PASS |
| `/sitemap-ja.xml` | 200 | **180** | 180 | PASS |
| `/sitemap-en.xml` | 200 | **17** | 17 | PASS |

`sitemap-ja.xml` のサンプル URL: `/about/`, `/ar/`, `/blog/` ← 全 10 ロケールおよび主要セクションが含まれていることを確認。
`sitemap-en.xml` のサンプル URL: `/en/`, `/en/blog/`, `/en/blog/captio-shutdown-alternatives`, `/en/blog/fastest-note-app-iphone-2026`, `/en/blog/how-to-email-yourself-note-iphone` ← 17 件すべて `/en/` 配下。

`sitemap-ja.xml` には 103 件、`sitemap-en.xml` には 26 件の `xhtml:link` エントリ（sitemap レベル hreflang）が含まれており、Phase 2 PR #171 の構造と整合。

---

## 2. robots.txt 検証

`/robots.txt` HTTP 200。主要ディレクティブ：

**AI 検索 / 回答エンジン（Allow）**:
- GPTBot, ChatGPT-User, OAI-SearchBot
- ClaudeBot, anthropic-ai, Claude-Web
- PerplexityBot, Perplexity-User
- Google-Extended（Gemini 等の AI 学習 opt-in 別管理）
- Applebot, Applebot-Extended
- Bingbot, DuckDuckBot

すべて `Allow: /` + `Disallow: /admin/` の標準構造。

**学習専用クローラー（Disallow）**: CCBot, Bytespider, Amazonbot, meta-externalagent

**全体**: `User-agent: *` → `Allow: /`、`Disallow: /admin/`、`Disallow: /*?utm_*`、`Disallow: /*?fbclid=`、`Disallow: /*?gclid=`

**Sitemap 参照**: `https://simplememofast.com/sitemap.xml`

**判定**: PASS。spec §8.3-6 が要求する `GPTBot|ClaudeBot|PerplexityBot|Bingbot|Applebot` すべて確認済み。

---

## 3. llms.txt 検証

`/llms.txt` HTTP 200。Phase 2 PR #171 が要求する Disclaimer / License セクションが両方存在。

**Disclaimer / Non-affiliation セクション**:
- "SimpleMemo is an independent iOS app developed by AI Ataka."（**F3 で要修正**）
- "Not affiliated with the original Captio app by Ben Lenarts (Tupil/Boonbits, Netherlands)..."
- "Not affiliated with Emburse Captio (the expense management SaaS by Captio Tech SL, Spain)..."
- "Not affiliated with Captioo or 808 inc."

**License for AI Use セクション**:
- "Public website content under https://simplememofast.com/ may be cited and referenced by AI search engines and assistants."
- "Application source code is proprietary and is not included on this website."

**判定**: PASS（構造）。F3 の修正後により完全な状態に。

---

## 4. hreflang 双方向性チェック（5 paired pairs）

| ページ | htmlLang | content-language | hreflang ja | hreflang en | hreflang x-default | 判定 |
|---|---|---|---|---|---|---|
| `/captio-alternative/` | ja | ja | self | `/en/captio-alternative/` | self | PASS |
| `/en/captio-alternative/` | en | en | `/captio-alternative/` | self | `/captio-alternative/` | PASS |
| `/note-to-email/` | ja | ja | self | `/en/note-to-email/` | self | PASS |
| `/en/note-to-email/` | en | en | `/note-to-email/` | self | `/note-to-email/` | PASS |
| `/privacy` | ja | ja | self | `/en/privacy` | self | PASS |
| `/en/privacy` | en | en | `/privacy` | self | `/privacy` | PASS |
| `/terms` | ja | ja | self | `/en/terms` | self | PASS |
| `/en/terms` | en | en | `/terms` | self | `/terms` | PASS |
| `/blog/ios-quick-capture-comparison` | ja | ja | self | `/en/blog/...` | self | PASS |
| `/en/blog/ios-quick-capture-comparison` | en | en | `/blog/...` | self | `/blog/...` | PASS |

**全 10 ページすべて正しい双方向性 + canonical 整合性を確認**。

ペアが片方向だけ存在するケースや、x-default が JA を指していない異常はゼロ。

注: `/privacy.html` を直接叩くと `/privacy` (拡張子なし) に正規化される。`canonical` も `/privacy`、hreflang も `/privacy` を参照。spec §0.1 の URL マップと整合。

---

## 5. ホームページ + 副ロケール hreflang クラスタ

| ページ | hreflang ロケール数 | 確認 |
|---|---|---|
| `/` (homepage) | **11** | ja, en, zh-Hans, zh-Hant, ko, es, pt-BR, id, ar, tr, x-default |
| `/ar/` | **11** | 同上 |

**`/ar/` の dir="rtl"** も正しく設定済み（`htmlDir: "rtl"`）。spec §5.6 が要求する RTL 設定が適用されている。

---

## 6. JSON-LD 検証

| ページ | Article | BreadcrumbList | WebPage | FAQPage | 判定 |
|---|---|---|---|---|---|
| `/captio-alternative/` | YES | YES | YES | YES | PASS |
| `/en/captio-alternative/` | YES | YES | YES | YES | PASS |

両ページとも spec §7.5 / Phase 2 が要求する 4 種すべて検出。Google Rich Results Test で再確認推奨（手動：https://search.google.com/test/rich-results）。

`/en/send-email-to-yourself/` の AggregateRating チェック: SimpleMemo 自体に偽の評価値が紐づいていないことを確認（spec §12.2 戦略整合性チェック PASS）。

---

## 7. CSS キャッシュバスト

検証 9 ページすべてで `assets/css/style.min.css?v=20260501` を確認。PR #175 の本番反映が完了している。

---

## 8. GA4 page_language 注入

| ページ | GA4 ロード | page_language | 判定 |
|---|---|---|---|
| `/` | YES | YES | PASS |
| `/captio-alternative/` | YES | YES | PASS |
| `/en/captio-alternative/` | YES | YES | PASS |
| `/note-to-email/` | YES | YES | PASS |
| `/en/note-to-email/` | YES | YES | PASS |
| `/vs/notion/` | YES | YES | PASS |
| `/faq` | **NO（GA4 未搭載）** | N/A | 注意（§9 参照） |

GA4 が搭載されているページには Phase 3 PR #172 の page_language 注入が正しく反映されている。

---

## 9. 発見事項（Findings）

検証中に見つかった軽微な不整合 5 件。いずれも本番ブロッカーではない。

### F1. `/faq` ページに GA4 が搭載されていない

**観察**: `/faq` のスクリプトに G-EPZVZKCVQG が含まれていない。代わりに Ahrefs Analytics と Cloudflare Insights のみ稼働。
**インパクト**: PR #172 が「197 ファイル」を対象としたとあるが、`/faq` はそもそも対象外だった可能性。スパロビジョン外。
**推奨アクション**: 全 HTML を grep で `G-EPZVZKCVQG` の有無を一覧化し、漏れがないか確認。漏れがあれば `inject_ga4_page_language.py` を再実行する前に GA4 タグ自体の注入を別スクリプトで行う。

### F2. OG 画像のパスが JA/EN で異なる（既知の §3.2 残課題）

**観察**:
- JA: `/assets/img/og/captio-alternative.png` （`og/` サブフォルダあり）
- EN: `/assets/img/og-captio-alternative.png` （フラット）

**インパクト**: Phase 4-b（OGP 画像 4 枚）が未着手のため。spec §7.3 の言語別 OGP 画像化が完了すれば、両方が `/og-default-ja.png` / `/og-default-en.png` / `/og-captio-ja.png` / `/og-captio-alternative-en.png` のいずれかに切り替わる予定。
**推奨アクション**: §3.2 の OGP 画像 4 枚を制作・配置するタイミングで両ファイル名を統一。

### F3. llms.txt の Developer 表記が事業主体名と不一致【本 PR で対応】

**ユーザー確認**: 正式な法人名は **YURIKA, K.K.**（株式会社 YURIKA）。

**対応済み**:
- MTPE ドラフト `docs/en-captio-alternative-draft.md` の 2 箇所（FAQ Q1, Disclaimer）を `YURIKA, K.K.` に更新（2026-05-01）
- 本 PR で `/llms.txt` の 3 箇所を以下に更新：
  - Line 3 (TL;DR): `Built by AI Ataka in 2026` → `Built by YURIKA, K.K. (Japan) in 2026`
  - Line 6 (Developer): `Developer: AI Ataka` → `Developer: YURIKA, K.K. (Japan)` + `Founder / author: AI Ataka` を追加
  - Line 91 (Disclaimer): `developed by AI Ataka` → `developed by YURIKA, K.K. (Japan). Founder and primary author: AI Ataka.`

**今後検討**:
- 同様の修正が `/about/`、フッター、Schema.org Organization markup（`legalName` フィールド）等に必要かは別途確認。
- `AI Ataka` は引き続き「founder/author」の persona として有効。法人名 `YURIKA, K.K.` は entity-attribution の文脈でのみ使用。

### F4. `/en/captio-alternative/` の現行ページの FAQ は 18 件

**観察**: 現行ページの `details` 要素は 18 件。引き継ぎドキュメント §3.3 注釈には「既存 9 FAQ」とあるが現状はすでに拡張されている可能性。
**インパクト**: MTPE ドラフトの FAQ（12 問）と置換した場合、件数が減る。FAQPage JSON-LD は `inject_faq_schema.py` を再実行すれば自動同期。
**推奨アクション**: HTML 統合前に既存 18 FAQ の内容を確認し、ドラフト 12 問に統合・整理するか、既存 18 を保持して周辺セクションだけ拡張するか判断。

### F5. IndexNow 鍵が両方とも 200 で配信中【既に解消済】

**観察**: 検証時点では `dda35fda390ffabbcce681394b3a57cc.txt` および `3b4a3c278a4cc17ab7e03d6e7739bd21.txt` が両方 200 だった。
**対応済**: PR #177 で `3b4a3c27...` を撤去済み。本番では `dda35fda...` のみ 200、`3b4a3c27...` は 404（CF エッジキャッシュ自然失効後）。
**残課題**: なし（§2.1 完了）。

---

## 10. 次のアクション（優先順位順）

| # | 重要度 | アクション |
|---|---|---|
| 1 | 中 | F3 の `/llms.txt` の Developer 表記を `YURIKA, K.K.` に修正 → **本 PR で実施** |
| 2 | 中 | ~~§2.1 IndexNow 鍵重複解消~~ → **PR #177 で完了済** |
| 3 | 低 | F1 の GA4 タグ未搭載ページの一覧化（不要なら N/A） |
| 4 | - | §1.1〜§1.4 の手動オペレーター作業（GA4 admin / Search Console / Bing 登録） |
| 5 | - | §3.2 OGP 画像 4 枚の制作（外部リソース） |
| 6 | - | 7 日後の Search Console「Scaled content abuse」警告チェック |
| 7 | - | 30 日後の `/docs/i18n-30day-baseline.md` 数値ベースライン記録 |

---

## 11. ツール手動再確認推奨

私の検証は実ブラウザで JS を実行する形式のため、Google 公式チェックや SaaS チェッカーでも 1 度確認しておくのが堅実：

- [Merkle hreflang Tester](https://technicalseo.com/tools/hreflang/) — 5 paired URL を入力
- [Google Rich Results Test](https://search.google.com/test/rich-results) — `/captio-alternative/` と `/en/captio-alternative/` を入力
- [W3C XML Sitemap Validator](https://www.xml-sitemaps.com/validate-xml-sitemap.html) — `sitemap.xml`
- [Robots.txt Validator](https://technicalseo.com/tools/robots-txt/) — 構文エラーゼロ確認
- [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) — paired ページの OGP プレビュー
- [Twitter Card Validator](https://cards-dev.twitter.com/validator) — 同上

---

**END OF REPORT**
