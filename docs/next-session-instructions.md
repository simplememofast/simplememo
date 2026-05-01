# 次セッション指示書 — i18n プロジェクト残作業

> **作成日**: 2026-05-01（前回セッション終了時）
> **対象**: 次セッション（cowork / 人間オペレーター / 別の Claude セッション）
> **目的**: このドキュメント 1 本だけで残作業が着手・完遂できる状態にする
> **完了条件**: §5 受入基準のチェックボックスがすべて埋まる

---

## 0. 前回までの完了状態（2026-05-01）

15 PR がマージ・本番デプロイ済。i18n コード化可能な範囲は **完全終了**：

| PR | ブランチ / 内容 |
|---|---|
| #170 | Phase 1 hreflang/canonical/lang/content-language 基盤 |
| #171 | Phase 2 sitemap 分割 + FAQPage Schema + robots/llms 強化 |
| #172 | Phase 3 GA4 page_language（197 ファイル）+ IndexNow + CDN |
| #173 | Phase 4-d 言語別フォント最適化 |
| #174 | Follow-up: content-language sweep（163 JA-only ファイル） |
| #175 | CSS cache-bust（CF エッジ無効化） |
| #176 | 引き継ぎドキュメント `i18n-remaining-work.md` |
| #177 | IndexNow 鍵重複解消 |
| #178 | Phase 4-c MTPE AI ドラフト + レビュー指示書 |
| #180 | MTPE 完了の 4 階層判定基準 |
| #181 | F3: llms.txt YURIKA, K.K. 統一 |
| #182 | Phase 4-a 言語スイッチャー UI（10 paired ページ） |
| #183 | Phase 4-b OGP デザイン仕様書 + 4 SVG mocks |
| #184 | 監査クリーンアップ（重複 switcher / Yurika Inc. / dateModified） |

監査結果と未着手の詳細は以下を参照：

- `docs/i18n-remaining-work.md` — 残作業の親ドキュメント
- `docs/i18n-deploy-verification-2026-05-01.md` — 検証レポート
- `docs/en-captio-alternative-mtpe-review.md` — MTPE レビュー指示書

---

## 1. 着手タスク（優先度順）

### 🔴 P0 — 手動オペレーター作業 4 件（合計 ~60 分、ダッシュボードのみ）

すべてユーザーアカウントが必要。コード化不可。

#### 1.1 GA4 admin: `page_language` Custom Dimension 登録

**所要 5 分**。詳細手順は `docs/i18n-remaining-work.md §1.1`。

- GA4 (https://analytics.google.com/) → 管理 → カスタム定義 → カスタムディメンション → 「作成」
- 名前: `Page Language` / スコープ: **イベント**（重要）/ パラメータ: `page_language`
- 24-48 時間後、Explore レポートで `page_language` ディメンションが選択可能になる

**完了条件**: GA4 → 探索で `page_language` をディメンションに追加できる

#### 1.2 Search Console: `/en/` URL-prefix プロパティ追加

**所要 15 分**（verification PR デプロイ含む）。詳細は §1.2。

1. SC → プロパティ追加 → URL プレフィックス → `https://simplememofast.com/en/`
2. HTML タグ verification meta を取得 → リポジトリの `en/index.html` に挿入する PR 作成 → 自動マージ → デプロイ
3. SC で「認証」クリック → 成功確認
4. サイトマップ送信: `https://simplememofast.com/sitemap-en.xml`

**完了条件**: SC のプロパティリストに `/en/` が「確認済み」、`sitemap-en.xml` ステータス「成功」

#### 1.3 Bing Webmaster Tools: サイト登録 + sitemap 提出

**所要 10 分**。詳細は §1.3。

- https://www.bing.com/webmasters/ → 「Search Console からインポート」（推奨）
- サイトマップ提出: `https://simplememofast.com/sitemap.xml`（自動的に sub-sitemaps も処理）

**完了条件**: Bing Webmaster で sitemap.xml が「成功」状態

#### 1.4 Bing IndexNow: API 鍵登録

**所要 5 分**。§1.3 完了後。詳細は §1.4。

- 鍵: `dda35fda390ffabbcce681394b3a57cc`
- 検証 URL: `https://simplememofast.com/dda35fda390ffabbcce681394b3a57cc.txt`（既に本番で 200）
- Bing Webmaster → 設定 → IndexNow → 鍵を入力 → 検証
- 動作確認: `node scripts/indexnow-notify.js --all` → HTTP 200/202 期待

**完了条件**: Bing で鍵登録済 + notify スクリプトが 200 を返す

---

### 🟡 P1 — 外部リソース必要

#### 1.5 OGP PNG 4 枚 制作

**所要 4-6h（デザイナー）/ 1 分（rsvg）**。仕様書は `docs/ogp-design-spec.md`、SVG mocks は `docs/ogp-mocks/`。

#### 選択肢 A: デザイナー発注（推奨、品質高）
- 予算: $200-350（¥30,000-50,000）
- 仕様書 §7 のブリーフをそのままコピペ送付可
- 納品: 4 PNG（1200×630, ≤200 KB each）

#### 選択肢 B: rsvg-convert で SVG → PNG（即時、品質中）
```bash
brew install librsvg
cd docs/ogp-mocks/
for SRC in og-default-ja-mock.svg og-default-en-mock.svg og-captio-ja-mock.svg og-captio-alternative-en-mock.svg; do
  DEST="../../${SRC/-mock.svg/.png}"
  rsvg-convert -w 1200 -h 630 "$SRC" -o "$DEST"
done
```

#### 選択肢 C: 既存 `scripts/generate-og-images.js` パターン拡張
Puppeteer で Figma 風のレンダリング → PNG。最終品質は中-高。

**配置後の作業**: `og:image` メタタグを各 paired ページで該当画像へ切替（仕様書 §5.2）。

**完了条件**: PNG 4 枚がリポジトリルートに配置 + Facebook Debugger / Twitter Card Validator で正常表示

#### 1.6 `/en/captio-alternative/` MTPE ネイティブレビュー → HTML 統合

**所要 8-12h 合計**。spec §0.2 により後編集なしの公開禁止。

##### Step 1: ネイティブレビュー外注（2-3h、$150-200）
- ドラフト: `docs/en-captio-alternative-draft.md`（2,499 words）
- ブリーフ: `docs/en-captio-alternative-mtpe-review.md §7` をコピペ
- 推奨外注先: Upwork / Translated.com / 自前ネイティブ友人

##### Step 2: 4 階層判定をクリア（`docs/en-captio-alternative-mtpe-review.md §9`）

reviewer から以下 3 ファイルを受領：
- `docs/en-captio-alternative-final.md`（修正後本文）
- `docs/en-captio-alternative-mtpe-changelog.md`（変更ログ）
- `docs/en-captio-alternative-mtpe-signoff.md`（ネイティブ宣言 + 日付）

判定基準：
- **Layer 1**: Reviewer の sign-off にネイティブ英語宣言が含まれる
- **Layer 2**: 必須 3 ファイルが存在し、`final.md ≠ draft.md` で diff あり
- **Layer 3**: §3.2-§3.6 のチェックリストに reviewer 個別回答が記入済
- **Layer 4**: 公開 7 日後 Search Console「Scaled content abuse」警告ゼロ（公開後ゲート）

Layer 1-3 をクリアしないと HTML 統合に進まない（spec §0.2）。

##### Step 3: HTML 統合
1. 既存の `<head>`（hreflang/canonical/OGP/Schema）はそのまま温存
2. `<main>` 内本文を `final.md` ベースで置換
3. CTA ボタンは既存スタイルクラス（`.btn-primary` 等）を再利用
4. 内部リンク（`/en/note-to-email/`、App Store CTA 等）と外部リンク（Captio 公式残骸 / Note to Self Mail）を挿入

##### Step 4: スクリプト再実行
```bash
python3 scripts/normalize_i18n_head.py     # hreflang 自動再計算（変更なしのはず）
python3 scripts/inject_faq_schema.py        # FAQ 数が変わるため必須
python3 scripts/inject_ga4_page_language.py # 既に注入済（no-op のはず）
```

##### Step 5: CSS バージョン bump
```bash
NEW=$(date +%Y%m%d)  # e.g. 20260515
find . -name "*.html" -not -path "*/node_modules/*" -not -path "*/admin/*" \
  -not -path "*/scripts/*" -not -path "*/templates/*" -not -path "*/drafts/*" \
  -not -path "*/docs/*" -not -path "*/screenshots/*" -not -path "*/tools/*" \
  -not -path "*/tiktok/*" -exec sed -i '' -E "s|style\\.min\\.css\\?v=[0-9]+|style.min.css?v=${NEW}|g" {} \;
```

##### Step 6: PR → auto-merge → デプロイ → Layer 4 公開後検証

**完了条件**: 4 階層判定すべてクリア + 公開 7 日以内 Search Console 警告ゼロ

---

### 🟢 P2 — 小タスク（コード化可能、~30-60 分）

#### 1.7 Organization schema に `legalName` + `founder` 追加

**所要 30 分**。

現状の Organization JSON-LD（`/index.html`、`/en/index.html` 等）：
```json
{
  "@type": "Organization",
  "@id": "https://simplememofast.com/#organization",
  "name": "Captio式シンプルメモ",
  "alternateName": "Simple Memo - Captio-style",
  ...
}
```

以下に拡張：
```json
{
  "@type": "Organization",
  "@id": "https://simplememofast.com/#organization",
  "name": "Captio式シンプルメモ",
  "alternateName": ["Simple Memo - Captio-style", "SimpleMemo"],
  "legalName": "YURIKA, K.K.",
  "founder": {
    "@type": "Person",
    "@id": "https://simplememofast.com/about/#person",
    "name": "AI Ataka"
  },
  ...
}
```

これにより F3 の論理（entity = YURIKA, K.K. / persona = AI Ataka）を schema レベルで担保。AI 検索エンジンの cite 精度が上がる。

対象ファイル: Organization schema を持つすべてのページ（grep で特定可能）：
```bash
grep -rl '"@type":\s*"Organization"' --include="*.html" /Users/hajimeataka/simplememo
```

**完了条件**: Rich Results Test で legalName / founder が認識される

#### 1.8 `/en/about/` の処置決定

**選択肢**:
- A. 完全に作成（コンテンツ制作必要、~3-4h）
- B. `/about/` にリダイレクト（最小工数、`_redirects` に 1 行追加）
- C. 作成しない（MTPE ドラフトから該当リンクを削除）

推奨: **B**（被リンクが少なく、新規作成のコストに見合わない）

```
# _redirects に追加
/en/about/  /about/  301
```

---

## 2. モニタリング（継続）

### 2.1 24h-72h 監視

ツール検証：
- [Merkle hreflang Tester](https://technicalseo.com/tools/hreflang/) — 5 paired URL
- [Google Rich Results Test](https://search.google.com/test/rich-results) — `/captio-alternative/`, `/en/captio-alternative/`
- [Robots.txt Validator](https://technicalseo.com/tools/robots-txt/)
- Google Search Console URL Inspection — paired ページのインデックス状態

### 2.2 7 日後監視

- SC カバレッジ: `/en/*` インデックス進捗
- Bing インデックス: `site:simplememofast.com/en/`
- ChatGPT 流入: GA4 → 探索 → ai_traffic_source ディメンション
- **MTPE Layer 4**: SC「Scaled content abuse」警告ゼロ確認（MTPE 公開後 7 日以内）

### 2.3 30 日後（数値ベースライン記録）

新規ファイル `docs/i18n-30day-baseline.md` を作成（テンプレ：`docs/i18n-remaining-work.md §4.3`）：

| 指標 | 値 |
|---|---|
| App Store 月インストール数 | __ |
| SC 過去 28 日クリック数 | __ |
| SC CTR | __% |
| SC 平均順位 | __ |
| GA4 言語別比率 | ja __% / en __% |
| ChatGPT 流入数 | 月 __件 |
| Perplexity 流入数 | 月 __件 |
| Bing 表示回数 | __ |
| Bing クリック数 | __ |

### 2.4 90/180 日後（数値ゲート評価）

引き継ぎドキュメント §13.3 / spec §13 の判定：

- 中国語追加: `/en/` オーガニック月 500 訪問超 + 中国大陸 ICP 備案取得可能性
- en-US/en-GB 分割: 英国・豪州・カナダ流入が米国の 30% 超
- 英語版主力切替: 米国 MAU が日本 MAU の 50% 超 + CVR 同等

---

## 3. 重要な参照資料（リポジトリ内）

| ファイル | 用途 |
|---|---|
| `docs/i18n-remaining-work.md` | 全残作業の親ドキュメント（最重要） |
| `docs/i18n-deploy-verification-2026-05-01.md` | 前回セッション検証レポート |
| `docs/en-captio-alternative-draft.md` | Phase 4-c MTPE 元ドラフト |
| `docs/en-captio-alternative-mtpe-review.md` | MTPE レビュー指示書 + §9 4 階層判定 |
| `docs/ogp-design-spec.md` | Phase 4-b OGP 画像仕様書 |
| `docs/ogp-mocks/og-*.svg` | OGP モックアップ |
| `docs/indexnow-setup.md` | 既存 IndexNow 設定ガイド |
| `scripts/i18n_config.py` | i18n 設定（PAGE_PAIRS, locales 等） |
| `scripts/normalize_i18n_head.py` | hreflang/canonical 正規化（idempotent） |
| `scripts/generate_sitemap.py` | sitemap 再生成（idempotent） |
| `scripts/inject_lang_switcher.py` | 言語スイッチャー注入（idempotent） |
| `scripts/inject_faq_schema.py` | FAQPage 再生成（idempotent） |
| `scripts/inject_ga4_page_language.py` | GA4 page_language 注入（idempotent） |
| `scripts/indexnow-notify.js` | IndexNow 通知（既存 Node 版） |

---

## 4. 主要設定値（クイックリファレンス）

```
SITE_URL          = https://simplememofast.com
GA4 PROPERTY ID   = G-EPZVZKCVQG
INDEXNOW KEY      = dda35fda390ffabbcce681394b3a57cc
LEGAL ENTITY      = YURIKA, K.K.
FOUNDER/AUTHOR    = AI Ataka (persona)
APP STORE JP      = https://apps.apple.com/jp/app/captio-style-simple-memo/id6758438948
APP STORE US      = https://apps.apple.com/us/app/captio-style-simple-memo/id6758438948
PRICING JP        = ¥500/mo, ¥5,000/yr
PRICING US        = $2.99/mo, $29.99/yr
TRIAL             = 7 days unlimited, then 3/day Free
```

### Active Locales（10）

```
ja      → /                    (root)
en      → /en/
zh-Hans → /zh/                 (stub only)
zh-Hant → /zh-Hant/            (stub only)
ko      → /ko/                 (stub only)
es      → /es/                 (stub only)
pt-BR   → /pt-BR/              (stub only)
id      → /id/                 (stub only)
ar      → /ar/  (RTL)          (stub only)
tr      → /tr/                 (stub only)
```

### JA↔EN Paired Pages（5 ペア = 10 files）

```python
# scripts/i18n_config.py の JA_EN_PAIRS
("/captio-alternative/",                "/en/captio-alternative/")
("/note-to-email/",                     "/en/note-to-email/")
("/privacy",                            "/en/privacy")
("/terms",                              "/en/terms")
("/blog/ios-quick-capture-comparison",  "/en/blog/ios-quick-capture-comparison")
```

---

## 5. 受入基準（プロジェクト全体完了の最終チェック）

### 完了済（コード）
- [x] Phase 1 hreflang/canonical 基盤
- [x] Phase 2 sitemap + Schema + robots/llms
- [x] Phase 3 GA4 + IndexNow + CDN
- [x] Phase 4-a 言語スイッチャー
- [x] Phase 4-d 言語別フォント
- [x] content-language sweep
- [x] CSS cache-bust
- [x] IndexNow 鍵重複解消
- [x] 監査クリーンアップ（重複 switcher / Yurika Inc. / dateModified）

### 残（手動オペレーター）
- [ ] §1.1 GA4 admin: page_language Custom Dimension 登録
- [ ] §1.2 SC: /en/ URL-prefix プロパティ追加
- [ ] §1.3 Bing Webmaster: サイト登録 + sitemap 提出
- [ ] §1.4 Bing IndexNow: 鍵登録

### 残（外部リソース）
- [ ] §1.5 OGP PNG 4 枚 制作 + 配置 + メタタグ更新
- [ ] §1.6 MTPE ネイティブレビュー → 4 階層判定 → HTML 統合

### 残（小タスク・任意）
- [ ] §1.7 Organization schema legalName/founder 追加
- [ ] §1.8 /en/about/ 処置決定（リダイレクト推奨）

### モニタリング
- [ ] §2.1 24h-72h ツール検証
- [ ] §2.2 7 日後インデックス進捗 + MTPE Layer 4
- [ ] §2.3 30 日後ベースライン記録
- [ ] §2.4 90/180 日後数値ゲート評価

---

## 6. 次セッション着手の最初のコマンド

このドキュメントを開いた次のオペレーターが最初に実行すべきこと：

```bash
cd /Users/hajimeataka/simplememo
git checkout main && git pull origin main

# 状態確認
python3 scripts/normalize_i18n_head.py 2>&1 | tail -1
python3 scripts/inject_lang_switcher.py 2>&1 | tail -1
python3 scripts/generate_sitemap.py 2>&1 | tail -3

# 何も変更なしのはず（idempotent）
git status --short

# このドキュメントを開く
cat docs/next-session-instructions.md
```

その後、§1 の優先度順に着手。手動作業（§1.1-1.4）は cowork セッションでなくユーザー自身でないと不可。

---

## 7. このドキュメントの保守

- タスク完了時に §5 のチェックボックスを `[x]` にする
- 新しい発見・問題があれば §1 に追記
- 30 日経過時点で別ドキュメント `docs/i18n-30day-baseline.md` に数値を記録
- このドキュメント自体は 90 日後に廃止 or アーカイブ（プロジェクト全体完了時）

---

**END**
