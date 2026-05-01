# OGP 画像 4 枚 デザイン仕様書（Phase 4-b）

**作成日**: 2026-05-01
**対象**: 引き継ぎドキュメント §3.2 / spec §7.3
**配布物**: 同フォルダの 4 SVG モックアップ + この仕様書

---

## 1. 一覧と最終配置先

| ファイル | 配置先 | 用途 | モックアップ |
|---|---|---|---|
| `og-default-ja.png` | リポジトリルート `/og-default-ja.png` | 日本語ページ全般のデフォルト OG 画像 | `ogp-mocks/og-default-ja-mock.svg` |
| `og-default-en.png` | リポジトリルート `/og-default-en.png` | 英語ページ全般のデフォルト OG 画像 | `ogp-mocks/og-default-en-mock.svg` |
| `og-captio-ja.png` | リポジトリルート `/og-captio-ja.png` | `/captio-alternative/` 専用 | `ogp-mocks/og-captio-ja-mock.svg` |
| `og-captio-alternative-en.png` | リポジトリルート `/og-captio-alternative-en.png` | `/en/captio-alternative/` 専用 | `ogp-mocks/og-captio-alternative-en-mock.svg` |

すべて **1200 × 630 PNG**（OG / Twitter Card 標準）。

---

## 2. デザイン共通ルール

### 2.1 カラー

| 用途 | 値 | 備考 |
|---|---|---|
| 背景グラデーション 上 | `#06070b` | サイト主背景 |
| 背景グラデーション 下 | `#0b0f16` | サイト副背景 |
| アクセント | `#7cc4ff` | ブランド主色（既存トークン `--accent`） |
| 主見出し文字 | `#ffffff` | 100% 白 |
| 副見出し（強調） | `#7cc4ff` | アクセント色 |
| 副見出し（弱） | `#cbd2dd` | 明度高め灰 |
| 罫線 | `#1a2030` | フッター仕切り |
| フッター文字 | `#6b7280` | 控えめ灰 |

背景は **左上→右下のリニアグラデーション** + **ラジアルグロー**（左上または右上、デザインによる）。

### 2.2 フォント

| 言語 | 主フォント | フォールバック | 備考 |
|---|---|---|---|
| 日本語 | Noto Sans JP / Hiragino Sans | system | 太字: Bold (700)、本文: Regular (400) |
| 英語 | Inter / SF Pro Display | -apple-system, Segoe UI | 太字: Bold (700)、本文: Medium (500) |

ウェイト：
- 主見出し: **700 (Bold)**、letter-spacing: -2 〜 -3
- 副見出し（強調）: **600〜700**
- 副見出し（弱）: **400 (Regular)**
- ラベル系（"CAPTIO ALTERNATIVE" 等）: **500 (Medium)**, letter-spacing: 3〜4

### 2.3 レイアウト共通

```
+---- 80px margin ---------------------------------+
|  ━━━━ accent bar (120×6 rounded)                  |
|                                                   |
|  [LOGO 96×96]  ← brand wordmark/lockup            |
|                                                   |
|  Main headline (white, 78–96 pt)                  |
|  Sub headline (accent or secondary, 46–56 pt)     |
|                                                   |
|  Lead copy (cbd2dd, 26–28 pt)                     |
|                                                   |
|  ───────────────── divider ─────────────────────  |
|  simplememofast.com [...]              iOS        |
+---------------------------------------------------+
```

- 上下左右 **80 px** マージン
- ロゴ位置: 左上、本文と垂直整列
- メイン見出しは 2 行に分けて 1 行目白、2 行目アクセント色 にすることで視認性向上

### 2.4 ロゴ

`/assets/img/app-icon-256.png` を使用。SVG モックでは仮の `M` 字レターマーク（角丸 22 / 18 px、アクセント色背景）を配置しているが、最終 PNG では実ロゴを配置する。

ロゴサイズ：
- デフォルト OG: **96 × 96 px**（角丸 22 px）
- captio-alternative OG: **80 × 80 px**（角丸 18 px、上に "CAPTIO ALTERNATIVE" ラベル余白を取るため小さめ）

### 2.5 NG 表現（spec §0.2）

すべての OGP 画像で以下を禁止：

- ❌ 「公式後継」「Official Successor」
- ❌ 「本物の Captio」"True Captio" / "The Real Captio"
- ❌ Captio のロゴを直接表示
- ❌ "Better than Captio"
- ❌ App Store の評価バッジ（虚偽 AggregateRating 回避）

### 2.6 OK 表現

- ✓ "spiritual successor"
- ✓ "closest replacement"
- ✓ "Captio alternative" / "Captio代替"
- ✓ 「3 分で完了する移行手順」"3-min migration guide" 等の機能訴求

---

## 3. 各画像の詳細

### 3.1 `og-default-ja.png`

**用途**: 日本語ページ全般のデフォルト OG（ホーム、ブログ、FAQ 等で `og:image` に未指定の場合のフォールバック）

**主見出し**: 「自分にメール送信」（92 pt 白）

**副見出し**: 「書いて、送る。」（56 pt アクセント色）

**リード**: 「起動 0.3 秒・送信 150 ms」（28 pt 弱灰）

**ブランド表示**: 上部 "Captio式シンプルメモ"（28 pt 弱灰）

**フッター**: `simplememofast.com` ←→ `iOS`

### 3.2 `og-default-en.png`

**用途**: 英語ページ全般のデフォルト OG

**主見出し** (1 行目): "Email Yourself,"（92 pt 白）

**主見出し** (2 行目): "Fast."（92 pt アクセント色）

**リード**: "The Captio alternative for iOS"（28 pt 弱灰）

**ブランド表示**: 上部 "SimpleMemo"（28 pt 弱灰）

**フッター**: `simplememofast.com` ←→ `iOS`

### 3.3 `og-captio-ja.png`

**用途**: `/captio-alternative/` 専用 OG

**ラベル**: 上部 "CAPTIO ALTERNATIVE"（22 pt 弱灰、letter-spacing 3）

**ブランド表示**: ロゴ右に "Captio式シンプルメモ"（24 pt 中灰）

**主見出し**: 「Captio代替アプリ」（96 pt 白）

**副見出し**: 「3 分で完了する移行手順」（46 pt アクセント色）

**リード**: 「サービス終了後も、ワークフローはそのまま。」（26 pt 弱灰）

**フッター**: `simplememofast.com/captio-alternative` ←→ `iOS`

### 3.4 `og-captio-alternative-en.png`

**用途**: `/en/captio-alternative/` 専用 OG

**ラベル**: 上部 "CAPTIO ALTERNATIVE — iOS"（22 pt 弱灰、letter-spacing 4）

**ブランド表示**: ロゴ右に "SimpleMemo"（24 pt 中灰）

**主見出し** (1 行目): "The Best Captio"（78 pt 白）

**主見出し** (2 行目): "Alternative for iOS"（78 pt アクセント色）

**リード**: "Capture your thoughts. Email them to yourself."（28 pt 弱灰）

**フッター**: `simplememofast.com/en/captio-alternative` ←→ `iOS`

---

## 4. SVG → PNG 変換手順

### 4.1 ローカルで簡易変換（rsvg-convert / Inkscape）

```bash
# Homebrew で librsvg を入れている場合
cd docs/ogp-mocks/
for SRC in og-default-ja-mock.svg og-default-en-mock.svg og-captio-ja-mock.svg og-captio-alternative-en-mock.svg; do
  DEST=${SRC/-mock.svg/.png}
  rsvg-convert -w 1200 -h 630 "$SRC" -o "../../$DEST"
done
```

### 4.2 ヘッドレス Chrome / Puppeteer

```bash
# 既存の scripts/generate-og-images.js / generate-og-batch.js のパターンを再利用
# テンプレートとして本仕様の SVG を読み込ませ、Puppeteer の page.screenshot で PNG 化
```

### 4.3 デザイナー手作業（最終品質）

仕様の SVG は **レイアウト確認用モック**。最終納品は Figma / Photoshop で：

- 実ロゴ画像の埋め込み（PNG-24、αチャンネル付）
- フォントの正規ライセンス使用（Noto Sans JP / Inter は OFL/SIL なので問題なし）
- グラデーションの微調整、ノイズ／粒子テクスチャの付加（任意）
- PNG-24 圧縮（≤ 200 KB 推奨、Twitter Card 上限 5 MB だが軽いほど良い）

### 4.4 アクセシビリティ

- 主見出しと副見出しのコントラスト比は WCAG AAA を確保
  - 白 (`#ffffff`) on `#06070b`: コントラスト比 ≈ 19.7 (AAA)
  - アクセント (`#7cc4ff`) on `#06070b`: コントラスト比 ≈ 11.3 (AAA)
- 文字サイズ最小 22 pt なので可読性問題なし

---

## 5. 配置とコード変更

PNG 4 枚を準備したら、リポジトリで以下の変更を行う：

### 5.1 ファイル配置

```bash
git checkout -b claude/i18n-phase4b-ogp-images

cp /path/to/og-default-ja.png ./og-default-ja.png
cp /path/to/og-default-en.png ./og-default-en.png
cp /path/to/og-captio-ja.png ./og-captio-ja.png
cp /path/to/og-captio-alternative-en.png ./og-captio-alternative-en.png
```

### 5.2 og:image メタタグの差し替え

各ページの `<head>` 内の `<meta property="og:image" ...>` を該当画像に切替：

| ページ | 新しい og:image |
|---|---|
| `/` (homepage) | `https://simplememofast.com/og-default-ja.png` |
| `/en/` | `https://simplememofast.com/og-default-en.png` |
| `/captio-alternative/` | `https://simplememofast.com/og-captio-ja.png` |
| `/en/captio-alternative/` | `https://simplememofast.com/og-captio-alternative-en.png` |
| その他 JA ページ | `https://simplememofast.com/og-default-ja.png` |
| その他 EN ページ | `https://simplememofast.com/og-default-en.png` |

`og:image:width` `og:image:height` も併設：
```html
<meta property="og:image" content="https://simplememofast.com/og-default-ja.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="自分にメール送信 — Captio式シンプルメモ" />
```

`og:locale` および `og:locale:alternate` は既に Phase 1 で配置済（変更不要）。

Twitter Card も同じ画像を参照：
```html
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="https://simplememofast.com/og-default-ja.png" />
```

### 5.3 既存 OG 画像の整理

検証で観察した既存の OG 画像パス（検証レポート §9 F2 参照）：

- JA: `/assets/img/og/captio-alternative.png` （`og/` サブフォルダあり）
- EN: `/assets/img/og-captio-alternative.png` （フラット）

これらを撤去するか残すかは判断ポイント：

- **撤去推奨**：上書きで新画像 4 枚に切替えれば、サブフォルダ版のみ残し
  ても参照されないため、CDN キャッシュの肥大を避けるためにファイルを
  削除する
- **保持**：別途 OG タグで参照しているページがあれば一覧化してから判断

### 5.4 検証

```bash
# Open Graph デバッガで強制再取得（CDN キャッシュをパージ）
# https://developers.facebook.com/tools/debug/
# 入力: https://simplememofast.com/captio-alternative/

# Twitter Card Validator
# https://cards-dev.twitter.com/validator
```

---

## 6. SVG モックアップの確認方法

1. ブラウザで以下を開く（クリックすると IDE / OS の SVG プレビューが開く）：
   - `docs/ogp-mocks/og-default-ja-mock.svg`
   - `docs/ogp-mocks/og-default-en-mock.svg`
   - `docs/ogp-mocks/og-captio-ja-mock.svg`
   - `docs/ogp-mocks/og-captio-alternative-en-mock.svg`
2. レイアウト・コピー・色調を確認
3. 修正したい点があれば、本仕様書の §3 各画像詳細を更新してから
   デザイナーに発注

SVG モックは **テキストとレイアウトの確認用**。実際の PNG では：
- ロゴが本物の角丸正方形アプリアイコン
- 細かなテクスチャ／粒子表現
- グラデーションの微調整

…が加わる前提です。

---

## 7. デザイナー発注時のテンプレート（コピペ用）

> ### Brief: 4 OGP images for SimpleMemo (1200×630 PNG each)
>
> **Files needed**:
> 1. `og-default-ja.png` — Japanese default
> 2. `og-default-en.png` — English default
> 3. `og-captio-ja.png` — `/captio-alternative/` 専用
> 4. `og-captio-alternative-en.png` — `/en/captio-alternative/` 専用
>
> **Assets**:
> - Logo: `/assets/img/app-icon-256.png` (rounded-square iOS app icon)
> - Brand color: `#7cc4ff` (sky blue)
> - Background: dark gradient `#06070b` → `#0b0f16`
> - Fonts: Noto Sans JP for JA / Inter for EN (open licenses)
>
> **Layout reference**: see attached SVG mocks (`og-*-mock.svg`).
>
> **Copy**: see §3.1–3.4 of this spec for each image's headline,
> sub-headline, and lead text. **Do not** alter wording without
> consulting the spec NG/OK list.
>
> **Required deliverables**:
> - 4 PNG files at exactly 1200×630 px
> - PNG-24 with alpha (transparent corners not needed; full bleed OK)
> - File size ≤ 200 KB each
> - Pass Facebook Sharing Debugger (no warnings about missing dimensions)
>
> **Estimated time**: 4–6 hours total. **Estimated cost**: ¥30,000–
> ¥50,000 / $200–$350 USD at standard freelance rates.

---

## 8. このタスクの完了条件

- [ ] PNG 4 枚がリポジトリルートに配置済
- [ ] 各 paired ページの `og:image` メタタグが言語別画像を指す
- [ ] Facebook Sharing Debugger 検証 OK
- [ ] Twitter Card Validator 検証 OK

引き継ぎドキュメント §3.2 / §7.4 の Phase 4-b と整合。

---

**END OF SPEC**
