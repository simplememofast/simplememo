# SEO / AIO 実装レポート — SimpleMemoFast.com

**実施日**: 2026-03-04
**ブランチ**: `claude/seo-aio-v1`
**対象**: https://simplememofast.com

---

## 1. 実施内容サマリー

### 新規作成ページ（2ページ）

| URL | 目的 | ターゲットキーワード |
|-----|------|-------------------|
| `/captio-alternative/` | Captio代替比較・移行LP | Captio 代替, Captio alternative, Captio なくなった |
| `/note-to-email/` | メモ→メール用途LP | 自分にメール メモ, note to email, email notes to yourself |

各ページ構成:
- 結論（1段落）
- 3つの理由（カード形式）
- 比較表（captio-alternativeのみ）
- 手順（番号付きステップ）
- 仕様・一次情報
- FAQ（JP 5-6問 / EN 5問）
- CTA（App Storeリンク）
- 関連ページリンク（内部リンククラスター）

### 既存ページ更新

| ファイル | 変更内容 |
|---------|---------|
| `index.html` | フッターにCaptio代替・メモ→メールリンク追加 |
| `sitemap.xml` | captio-alternative/ と note-to-email/ を追加（priority 0.9） |

---

## 2. 構造化データ（JSON-LD）実装マップ

| ページ | WebSite | SoftwareApp | FAQPage | HowTo | BreadcrumbList | Article | Speakable |
|--------|---------|-------------|---------|-------|----------------|---------|-----------|
| `/` (index) | o | o | o | o | o | - | o |
| `/faq.html` | - | - | o | - | o | - | - |
| `/captio-alternative/` | - | - | o | - | o | o | - |
| `/note-to-email/` | - | - | o | o | o | o | - |
| `/devlog/*.html` | - | - | o* | - | o | o | - |
| `/devlog/` (index) | - | - | - | - | o | - | - |

*一部のdevlog記事のみ

---

## 3. Canonical / Hreflang 設計

### 方針
- **正規URL**: パラメータなし（例: `https://simplememofast.com/captio-alternative/`）
- **言語切替**: `?lang=ja` / `?lang=en`（クライアントサイドJS）
- **hreflang**: 全ページで `ja`, `en`, `x-default` を設定
- **canonical**: パラメータなしのベースURLを指定

### `?lang=` パラメータの重複対策
- canonical はベースURLを指す → 検索エンジンはベースURLを正規版として認識
- hreflang で `?lang=ja` / `?lang=en` を alternate として宣言
- JS側でブラウザ言語を検出し適切に切替

### 将来の `/ja/` `/en/` 移行について
現状は `?lang=` パラメータ方式を維持。理由:
1. 静的HTMLサイトでの `/ja/` `/en/` 移行はファイル倍増（現在15ページ → 30ファイル）
2. JS言語切替ロジック（lang.js）の全面書き換えが必要
3. 既存の外部リンク・App Store記載URLの301リダイレクト設定が必要

**90日以内の推奨**:
- Cloudflare Pagesのリダイレクトルール or `_redirects` ファイルで `/ja/*` → `/*?lang=ja` のパスマッピングを検討
- SSG（静的サイトジェネレータ）への移行時に `/ja/` `/en/` 構造を導入

---

## 4. Sitemap 内容

全16 URL（新規2件追加）:

| URL | Priority | hreflang |
|-----|----------|----------|
| `/` | 1.0 | ja, en, x-default |
| `/captio-alternative/` | 0.9 | ja, en, x-default |
| `/note-to-email/` | 0.9 | ja, en, x-default |
| `/faq.html` | 0.8 | ja, en, x-default |
| `/devlog/` | 0.8 | ja, en, x-default |
| `/devlog/day1.html` | 0.7 | ja, en, x-default |
| `/devlog/captio-alternative.html` | 0.7 | ja, en, x-default |
| `/devlog/uikit-vs-swiftui.html` | 0.6 | ja, en, x-default |
| `/devlog/outbox-architecture.html` | 0.6 | ja, en, x-default |
| `/devlog/relay-api-design.html` | 0.6 | ja, en, x-default |
| `/devlog/privacy-first-design.html` | 0.6 | ja, en, x-default |
| `/privacy.html` | 0.3 | ja, en, x-default |
| `/terms.html` | 0.3 | ja, en, x-default |
| `/contact.html` | 0.3 | ja, en, x-default |
| `/legal.html` | 0.3 | ja, en, x-default |

全URLに `<lastmod>` 日付設定済み。

---

## 5. robots.txt

変更なし（現状で適切）:
```
User-agent: *
Allow: /
Disallow: /admin/
Sitemap: https://simplememofast.com/sitemap.xml
```

---

## 6. 内部リンク構造（クラスター）

```
index.html (Hub)
├── /captio-alternative/  ←→  /note-to-email/
│   ├── /faq.html
│   ├── /devlog/captio-alternative.html
│   └── /privacy.html
├── /note-to-email/  ←→  /captio-alternative/
│   ├── /faq.html
│   └── /privacy.html
├── /faq.html
├── /devlog/ (Hub)
│   ├── day1.html ←→ captio-alternative.html ←→ ...
│   └── (5 articles, fully cross-linked)
├── /privacy.html
├── /terms.html
├── /legal.html
└── /contact.html
```

新規LPのフッターにも全ページリンクを配置。

---

## 7. E-E-A-T 対策状況

| 要素 | 状況 | 備考 |
|------|------|------|
| 運営者情報 | o | legal.html（特定商取引法） |
| 連絡先 | o | contact.html |
| プライバシーポリシー | o | privacy.html |
| 利用規約 | o | terms.html |
| 更新日 | o | privacy.html に最終更新日、sitemap に lastmod |
| 著者/Publisher | o | JSON-LD Organization schema |
| 専門性の証明 | o | devlog 技術記事6本 |
| ロゴ | o | Organization schema に logo ImageObject |

---

## 8. 前回PR (#41) で実施済みの技術SEO修正

| 施策 | 対象ファイル数 |
|------|--------------|
| `<div class="meta-templates">` を `<head>` から `<body>` へ移動（無効HTML修正） | 13 |
| OG/Twitter image を絶対URLに修正 | 15 |
| HowTo JSON-LD（3ステップ手順） | index.html |
| BreadcrumbList JSON-LD | index.html, faq.html |
| Speakable JSON-LD（AIO/音声検索） | index.html |
| FAQPage JSON-LD（55問全問） | faq.html |
| Organization schema 強化（logo, sameAs） | index.html |
| SoftwareApplication に downloadUrl 追加 | index.html |
| faq.html に canonical + hreflang 追加 | faq.html |
| faq.html を sitemap に追加 | sitemap.xml |
| 全URL に lastmod 追加 | sitemap.xml |
| article:published_time を5記事に追加 | devlog 5記事 |
| hero画像に fetchpriority="high" | index.html |

---

## 9. 次の30日施策（推奨）

1. **Google Search Console 登録・確認**
   - サイトマップ送信
   - インデックス状況の確認
   - 構造化データの検証（Rich Results Test）

2. **外部リンク獲得**
   - Product Hunt 掲載
   - iOS App レビューサイトへの掲載依頼
   - 「Captio alternative」で言及しているブログ/フォーラムへの情報提供

3. **OGP画像の改善**
   - 現在 `ogp.png` は全ページ共通 → ページごとのOG画像を検討
   - captio-alternative/ 用に比較表を含むOG画像

4. **Google Analytics イベント設定**
   - CTA クリック率の計測
   - LP間の遷移計測

---

## 10. Google Search Console 登録手順

**現状**: 未登録（google-site-verification なし）

### 手順

1. https://search.google.com/search-console にアクセス
2. 「プロパティを追加」→「URL プレフィックス」→ `https://simplememofast.com/` を入力
3. 検証方法を選択（推奨順）:

   **方法A: DNS TXT レコード（推奨）**
   - Cloudflare DNS に TXT レコードを追加
   - `google-site-verification=XXXXX` を DNS に設定
   - Cloudflare Dashboard → DNS → レコード追加

   **方法B: HTML ファイル**
   - Google が提供する `googleXXXX.html` ファイルをリポジトリルートに配置
   - `git add googleXXXX.html && git commit && git push`

   **方法C: meta タグ**
   - `<meta name="google-site-verification" content="XXXXX">` を `index.html` の `<head>` に追加

4. 検証完了後:
   - サイトマップ送信: 「サイトマップ」→ `sitemap.xml` を入力 → 送信
   - インデックス登録リクエスト: 主要ページのURLを個別にリクエスト
   - 構造化データレポートで JSON-LD エラーを確認

### 優先確認ページ
- `/` (WebSite, SoftwareApp, FAQPage, HowTo, BreadcrumbList, Speakable)
- `/captio-alternative/` (Article, FAQPage, BreadcrumbList, Speakable)
- `/note-to-email/` (Article, HowTo, FAQPage, BreadcrumbList, Speakable)
- `/faq.html` (FAQPage, BreadcrumbList)

---

## 11. 次の90日施策（推奨）

1. **言語URL移行 (`/ja/` `/en/`)**
   - SSG（Astro, 11ty等）への移行と同時に実施
   - 301リダイレクト設定
   - 既存の外部リンクの維持

2. **コンテンツ拡充**
   - 「メモアプリ 比較」LP追加（Bear, Apple Notes, Google Keep等との比較）
   - 「iPhoneメモアプリ おすすめ」LP追加
   - ユーザーレビュー/テスティモニアル

3. **App Store SEO (ASO)**
   - アプリ説明文のキーワード最適化
   - スクリーンショットの改善

4. **構造化データ拡充**
   - `AggregateRating` (レビュー集約)
   - `VideoObject` (使い方動画を作成した場合)

---

## 11. 技術メモ

### ビルドシステム
純粋な静的HTML。ビルドツールなし。Cloudflare Pages で直接ホスティング。

### 言語切替
- `/js/lang.js` がクライアントサイドで言語切替
- `?lang=ja` / `?lang=en` クエリパラメータ + localStorage 永続化
- `data-lang` 属性で表示/非表示を切替
- meta-templates div でタイトル/description を動的更新

### デプロイ
- `claude/` プレフィックスブランチ → GitHub Actions で自動マージ
- `main` ブランチ push → Cloudflare Pages 自動デプロイ
