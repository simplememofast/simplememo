# SimpleMemoFast CMO戦略設計仕様書
## 月間100万UU達成のためのSEO/AIO完全戦略

**作成日:** 2026-03-06
**対象:** https://simplememofast.com
**目標:** 月間1,000,000 UU（現状: ほぼ0 → 12ヶ月で達成）

---

## 目次

1. [現状分析と致命的課題](#1-現状分析と致命的課題)
2. [フェーズ別ロードマップ](#2-フェーズ別ロードマップ)
3. [テクニカルSEO完全修正仕様](#3-テクニカルseo完全修正仕様)
4. [コンテンツ戦略：100万UUのためのキーワード設計](#4-コンテンツ戦略100万uuのためのキーワード設計)
5. [AIO（AI Overview）最適化戦略](#5-aioai-overview最適化戦略)
6. [国際SEO戦略（日英2言語）](#6-国際seo戦略日英2言語)
7. [リンクビルディング戦略](#7-リンクビルディング戦略)
8. [コンテンツ量産アーキテクチャ](#8-コンテンツ量産アーキテクチャ)
9. [KPI・計測・PDCAフレームワーク](#9-kpi計測pdcaフレームワーク)
10. [実装優先度マトリクス](#10-実装優先度マトリクス)

---

## 1. 現状分析と致命的課題

### 1.1 サイト概要

| 項目 | 現状 |
|---|---|
| ページ数 | 96ページ（HTML静的サイト） |
| サイトマップURL数 | 111 URL |
| ドメイン年齢 | 約3週間（2026-02-13公開） |
| 月間UU | ほぼ0（未インデックス） |
| バックリンク | ほぼ0 |
| 言語 | 日本語/英語（クライアントサイド切替） |
| ホスティング | Cloudflare Pages |

### 1.2 致命的課題（CRITICAL — 即座に修正必須）

#### 🚨 課題1: Googleにインデックスされていない

**現象:** `site:simplememofast.com` で検索結果0件
**原因推定:**
- ドメイン新規（3週間）でクロール予算が極小
- Google Search Consoleでの手動サイトマップ送信が未実施の可能性
- Cloudflare PagesのHTTPヘッダーで`X-Robots-Tag: noindex`が送信されている可能性

**修正アクション:**
```
1. Google Search Consoleでインデックス登録をリクエスト（全主要ページ）
2. Bing Webmaster Toolsにも登録
3. curl -sI https://simplememofast.com | grep -i "x-robots" でnoindexヘッダー確認
4. Cloudflare Pagesのヘッダー設定を確認
```

#### 🚨 課題2: robots.txtがAIクローラーを全面ブロック

**現在のrobots.txt:**
```
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: CCBot
Disallow: /
```

**問題:** AIO対策を目指しながら、AI検索の根幹であるGPTBot・Google-Extended・ClaudeBotを完全遮断している。これではAI Overviewsに引用されることは絶対にない。

**修正方針:**
```
# AI検索エンジンからの引用は許可、学習用データ取得は拒否
User-agent: GPTBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: ClaudeBot
Allow: /

# 学習専用クローラーのみブロック
User-agent: CCBot
Disallow: /

User-agent: Bytespider
Disallow: /
```

#### 🚨 課題3: canonicalタグ・OGPタグ・hreflangリンクタグの欠如

**ライブサイトで確認された欠如要素:**
- `<link rel="canonical">` → 重複コンテンツリスク
- `<meta property="og:*">` → SNSシェア時にプレビューが表示されない
- `<meta name="twitter:*">` → Twitter/Xでのカード表示なし
- `<link rel="alternate" hreflang="*">` → Googleの多言語認識不可

**影響度:** これらがないと、Googleはページの正規URLを判断できず、SNS流入も激減する。

#### 🚨 課題4: クライアントサイド言語切替の根本的問題

**現状:** 同一URLで`?lang=en`パラメータによりJavaScriptで言語切替
**問題:**
- Googlebotは基本的にJavaScript実行後のコンテンツをレンダリングするが、`data-lang`による表示切替はCSS `display:none` ベースであり、Googleが「隠しテキスト」と判定するリスクがある
- hreflangの正しい実装には、言語ごとに異なるURLが必要
- AIOクローラー（GPTBot等）はJSを実行しないため、英語コンテンツを一切取得できない

**修正方針（後述の国際SEO戦略で詳細）:**
```
/          → 日本語版（デフォルト）
/en/       → 英語版（別HTML）
```

---

### 1.3 構造的課題（HIGH — 早期修正推奨）

| 課題 | 影響 | 修正コスト |
|---|---|---|
| ヘッダーナビゲーションなし | クロール効率低下、UX悪化 | 中 |
| パンくずリストがUI上にない | JSON-LDにはあるがUI表示なし | 低 |
| 画像alt属性の品質 | アクセシビリティ・画像SEO | 低 |
| Core Web Vitals未最適化 | ランキングシグナル | 中 |
| 内部リンクの偏り | リンクジュースの分散不均等 | 中 |
| モバイルUXの検証不足 | モバイルファーストインデックス | 中 |

---

## 2. フェーズ別ロードマップ

### Phase 0: 緊急修正（Week 1-2）— 目標: インデックス獲得

| タスク | 優先度 | 工数 |
|---|---|---|
| robots.txt修正（AIクローラー許可） | P0 | 30分 |
| 全ページにcanonicalタグ追加 | P0 | 2時間 |
| 全ページにOGP/Twitterカードタグ追加 | P0 | 2時間 |
| Google Search Console登録・サイトマップ送信 | P0 | 1時間 |
| Bing Webmaster Tools登録 | P0 | 30分 |
| Cloudflareヘッダーでnoindex送信確認・修正 | P0 | 30分 |
| 主要20ページのインデックス登録リクエスト | P0 | 1時間 |

### Phase 1: テクニカルSEO基盤（Week 3-6）— 目標: 50ページインデックス

| タスク | 優先度 | 工数 |
|---|---|---|
| /en/ ディレクトリ作成（英語版分離） | P1 | 8時間 |
| hreflangリンクタグ全ページ実装 | P1 | 3時間 |
| グローバルヘッダーナビゲーション追加 | P1 | 4時間 |
| パンくずリストUI表示 | P1 | 2時間 |
| Core Web Vitals最適化 | P1 | 4時間 |
| 構造化データ拡充（Product, Review, Article） | P1 | 4時間 |
| 内部リンク設計の再構築 | P1 | 4時間 |

### Phase 2: コンテンツ拡張（Week 7-16）— 目標: 月間5万UU

| タスク | 優先度 | 工数 |
|---|---|---|
| ブログ記事30本追加（後述のKW戦略に基づく） | P1 | 継続 |
| 比較ページ20本追加 | P1 | 継続 |
| ユースケース15本追加 | P2 | 継続 |
| 用語集30エントリ追加 | P2 | 継続 |
| ユーザーレビュー・事例ページ | P1 | 継続 |

### Phase 3: オーソリティ構築（Week 17-30）— 目標: 月間30万UU

| タスク | 優先度 | 工数 |
|---|---|---|
| 被リンク獲得キャンペーン | P1 | 継続 |
| PR・メディア掲載 | P1 | 継続 |
| アプリレビューサイト掲載 | P1 | 月次 |
| ゲスト投稿・コラボ記事 | P2 | 月次 |
| SNS運用（X/Twitter, TikTok） | P2 | 継続 |

### Phase 4: スケール（Week 31-52）— 目標: 月間100万UU

| タスク | 優先度 | 工数 |
|---|---|---|
| プログラマティックSEO導入 | P1 | 大 |
| UGC（ユーザー生成コンテンツ）導入 | P1 | 大 |
| 多言語展開（韓国語・中国語繁体） | P2 | 大 |
| 動画コンテンツ（YouTube SEO） | P2 | 継続 |
| コミュニティ構築 | P2 | 継続 |

---

## 3. テクニカルSEO完全修正仕様

### 3.1 全ページ共通headテンプレート

```html
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#000000">

  <!-- SEO基本 -->
  <title>{ページタイトル} | Captio式シンプルメモ</title>
  <meta name="description" content="{160文字以内のユニーク説明}">
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
  <link rel="canonical" href="https://simplememofast.com/{path}/">

  <!-- hreflang -->
  <link rel="alternate" hreflang="ja" href="https://simplememofast.com/{path}/">
  <link rel="alternate" hreflang="en" href="https://simplememofast.com/en/{path}/">
  <link rel="alternate" hreflang="x-default" href="https://simplememofast.com/{path}/">

  <!-- OGP -->
  <meta property="og:type" content="{website|article}">
  <meta property="og:title" content="{ページタイトル}">
  <meta property="og:description" content="{説明文}">
  <meta property="og:url" content="https://simplememofast.com/{path}/">
  <meta property="og:image" content="https://simplememofast.com/assets/img/ogp-{page}.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="Captio式シンプルメモ">
  <meta property="og:locale" content="ja_JP">
  <meta property="og:locale:alternate" content="en_US">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@simplememofast">
  <meta name="twitter:title" content="{ページタイトル}">
  <meta name="twitter:description" content="{説明文}">
  <meta name="twitter:image" content="https://simplememofast.com/assets/img/ogp-{page}.png">

  <!-- Article特有（ブログ記事のみ） -->
  <meta property="article:published_time" content="{YYYY-MM-DD}">
  <meta property="article:modified_time" content="{YYYY-MM-DD}">
  <meta property="article:author" content="SimpleMemo Team">
  <meta property="article:section" content="{カテゴリ}">

  <!-- ファビコン -->
  <link rel="icon" href="/favicon.ico">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">

  <!-- フォント（display=swap必須） -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="/assets/css/style.min.css">
</head>
```

### 3.2 robots.txt 修正仕様

```txt
User-agent: *
Allow: /
Disallow: /admin/

# AI検索エンジン — 引用・検索を許可
User-agent: GPTBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Applebot
Allow: /

# 学習専用クローラー — ブロック
User-agent: CCBot
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: Amazonbot
Disallow: /

Sitemap: https://simplememofast.com/sitemap.xml
```

### 3.3 _headers 修正仕様（Cloudflare Pages）

```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
  Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://tools.applemediaservices.com https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.googletagmanager.com https://*.ahrefs.com; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.googletagmanager.com https://analytics.ahrefs.com; connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://analytics.google.com https://*.ahrefs.com;
```

**削除すべきヘッダー（もし存在する場合）:**
- `X-Robots-Tag: noindex` → 絶対に送信してはいけない

### 3.4 グローバルヘッダーナビゲーション仕様

```html
<header class="global-header">
  <nav aria-label="メインナビゲーション">
    <a href="/" class="logo" aria-label="SimpleMemo ホーム">
      <img src="/assets/img/icon-256.png" alt="SimpleMemo" width="32" height="32" loading="eager">
      <span>SimpleMemo</span>
    </a>
    <ul class="nav-links">
      <li><a href="/guides/">使い方</a></li>
      <li><a href="/use-cases/">活用事例</a></li>
      <li><a href="/vs/">アプリ比較</a></li>
      <li><a href="/methods/">生産性</a></li>
      <li><a href="/blog/">ブログ</a></li>
      <li><a href="/faq">FAQ</a></li>
    </ul>
    <div class="nav-actions">
      <button class="lang-switch" data-lang="en">EN</button>
      <a href="https://apps.apple.com/app/..." class="cta-button">ダウンロード</a>
    </div>
  </nav>
</header>
```

### 3.5 パンくずリストUI仕様

```html
<nav aria-label="パンくずリスト" class="breadcrumb">
  <ol itemscope itemtype="https://schema.org/BreadcrumbList">
    <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
      <a itemprop="item" href="/"><span itemprop="name">ホーム</span></a>
      <meta itemprop="position" content="1">
    </li>
    <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
      <a itemprop="item" href="/vs/"><span itemprop="name">アプリ比較</span></a>
      <meta itemprop="position" content="2">
    </li>
    <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
      <span itemprop="name">SimpleMemo vs Evernote</span>
      <meta itemprop="position" content="3">
    </li>
  </ol>
</nav>
```

### 3.6 Core Web Vitals最適化チェックリスト

| 指標 | 目標値 | 施策 |
|---|---|---|
| LCP | < 2.5s | フォントpreload、CSS最適化、画像lazy load |
| INP | < 200ms | JS最小化、イベントリスナー最適化 |
| CLS | < 0.1 | 画像にwidth/height明示、フォントdisplay:swap |

**具体的施策:**
```
1. Google Fontsの読み込みをfont-display: swapに統一
2. Above-the-fold画像はloading="eager"、それ以外はloading="lazy"
3. CSS inline化（クリティカルCSS）の検討
4. 不要なJSの遅延読み込み（defer/async）
5. 画像フォーマットをWebP/AVIFに変換
```

---

## 4. コンテンツ戦略：100万UUのためのキーワード設計

### 4.1 トラフィック構成目標（月間100万UU内訳）

| チャネル | 目標UU | 割合 | 主要施策 |
|---|---|---|---|
| 日本語オーガニック検索 | 400,000 | 40% | コンテンツSEO |
| 英語オーガニック検索 | 250,000 | 25% | 英語版サイト |
| AI検索（AIO/Perplexity等） | 150,000 | 15% | AIO最適化 |
| SNS（X, TikTok） | 100,000 | 10% | バイラルコンテンツ |
| 直接流入・リファラル | 50,000 | 5% | ブランド認知 |
| アプリストア経由 | 50,000 | 5% | ASO最適化 |

### 4.2 キーワード戦略マトリクス

#### Tier 1: ヘッドキーワード（月間検索Vol 10,000+）

| キーワード | 推定月間Vol | 難易度 | 対応ページ | 戦略 |
|---|---|---|---|---|
| メモアプリ | 40,000+ | 高 | /blog/best-memo-apps-2026 | 包括的ランキング記事 |
| メモアプリ おすすめ | 25,000+ | 高 | /blog/best-memo-apps-2026 | ↑と統合 |
| メモ帳 アプリ | 20,000+ | 高 | 新規作成 | 専用LP |
| Evernote 代替 | 15,000+ | 中 | /vs/evernote/ | 比較コンテンツ強化 |
| Notion 使い方 | 30,000+ | 高 | 新規作成 | 情報コンテンツで流入→自社誘導 |
| メモ 取り方 | 12,000+ | 中 | /blog/memo-taking-tips | 既存記事強化 |
| note taking app | 50,000+ | 高 | /en/ 新規 | 英語版包括記事 |
| best memo app | 20,000+ | 中 | /en/ 新規 | 英語版ランキング |

#### Tier 2: ミドルキーワード（月間検索Vol 1,000-10,000）

| キーワード | 推定月間Vol | 難易度 | 対応ページ | 戦略 |
|---|---|---|---|---|
| 自分にメール送る アプリ | 3,000 | 低 | /note-to-email/ | 既存LP最適化 |
| Captio 代替 | 2,000 | 低 | /captio-alternative/ | 既存LP最適化 |
| Captio 使えない | 1,500 | 低 | /captio/ | 既存ページ最適化 |
| メモ メール 送信 | 2,500 | 低 | / (トップ) | トップ最適化 |
| GTD アプリ | 5,000 | 中 | /methods/gtd/ | メソッド×アプリ記事 |
| Inbox Zero やり方 | 3,000 | 中 | /methods/inbox-zero/ | ハウツー強化 |
| iPhone メモ 使い方 | 8,000 | 中 | /blog/iphone-memo-tips | 既存記事強化 |
| メモ 習慣 | 2,000 | 低 | /blog/memo-habit | 既存記事強化 |
| email to self app | 5,000 | 低 | /en/note-to-email/ | 英語版LP |
| Captio alternative | 3,000 | 低 | /en/captio-alternative/ | 英語版LP |
| send note to email | 4,000 | 低 | /en/ 新規 | 英語版ハウツー |
| zettelkasten app | 5,000 | 中 | /en/methods/zettelkasten/ | 英語版メソッド |

#### Tier 3: ロングテール（月間検索Vol 100-1,000）— 量産戦略

| カテゴリ | キーワード例 | ページ数目標 | 月間合計Vol推定 |
|---|---|---|---|
| 「○○ vs △△」比較 | "Notion vs Obsidian", "Bear vs Apple Notes" | 50本 | 50,000 |
| 「○○ 使い方」ガイド | "Gmail ラベル 使い方", "Outlook ルール 設定" | 30本 | 30,000 |
| 「○○ メモ術」Tips | "会議メモ テンプレート", "読書メモ 書き方" | 30本 | 25,000 |
| 「○○ アプリ おすすめ」 | "学生 メモアプリ", "ビジネス メモアプリ" | 20本 | 20,000 |
| 用語解説 | "SMTP とは", "AES暗号化 わかりやすく" | 30本 | 15,000 |

### 4.3 コンテンツクラスター設計図

```
                    [トップページ]
                    simplememofast.com
                         |
        ┌────────┬───────┼───────┬────────┬────────┐
        |        |       |       |        |        |
    [比較]   [活用]  [ガイド] [メソッド] [ブログ] [用語集]
    /vs/   /use-   /guides/ /methods/ /blog/  /glossary/
           cases/
      |      |       |        |        |        |
   ┌──┴──┐   |    ┌──┴──┐  ┌──┴──┐  ┌──┴──┐  ┌──┴──┐
   16本   11本  6本    6本   12本   10本
   ↓目標  ↓目標 ↓目標  ↓目標 ↓目標  ↓目標
   50本   30本  20本   15本  60本   50本

   合計目標: 225本（現96本 → +129本）
```

### 4.4 新規コンテンツ制作仕様（優先度順）

#### 【即座に作成】比較ページ追加（+34本）

現在16本 → 目標50本。追加すべき比較対象:

**日本市場向け:**
```
/vs/google-keep-vs-apple-notes/   ← 第三者比較（自社を含まない）
/vs/notion-vs-obsidian/
/vs/notion-vs-evernote/
/vs/todoist/
/vs/ticktick/
/vs/stock/
/vs/jooto/
/vs/trello/
/vs/uplabs/
/vs/goodnotes/
/vs/upnote/
/vs/dynalist/
/vs/roam-research/
/vs/logseq/
/vs/craft/
/vs/day-one/
```

**英語市場向け:**
```
/en/vs/notion/
/en/vs/evernote/
/en/vs/apple-notes/
/en/vs/google-keep/
/en/vs/obsidian/
/en/vs/bear/
/en/vs/drafts/
/en/vs/ulysses/
/en/vs/mem/
/en/vs/capacities/
/en/vs/anytype/
/en/vs/reflect/
/en/vs/heptabase/
/en/vs/tana/
/en/vs/coda/
/en/vs/clickup/
/en/vs/todoist/
/en/vs/things/
```

**重要戦略: 第三者比較ページ**
自社を含まない「Notion vs Evernote」「Google Keep vs Apple Notes」のような比較記事は、検索ボリュームが非常に大きく、ユーザーの比較検討段階でのタッチポイントになる。記事末尾で「どちらにも満足できない方へ」としてSimpleMemoを紹介する導線を設計。

#### 【即座に作成】ブログ記事追加（+48本）

**カテゴリA: ハウツー系（検索Vol高）**
```
- メモの取り方完全ガイド【2026年版】
- 会議メモの書き方テンプレート5選
- 読書メモの効果的な残し方
- アイデアメモの整理術
- 朝活×メモ習慣で生産性3倍
- 1日5分のメモ習慣が人生を変える理由
- メモアプリの選び方チェックリスト
- オフラインで使えるメモアプリ完全ガイド
- プライバシー重視のメモアプリ比較
- 無料で使えるメモアプリランキング
```

**カテゴリB: トレンド×メモ（SNSバイラル狙い）**
```
- ChatGPT時代にメモを取る意味はあるのか？
- AI時代の情報整理術：メモ→メール→GPTワークフロー
- Z世代のメモ術：TikTokで話題のCaptio式とは
- 「自分にメール」が最強のタスク管理な理由
- ミニマリストのデジタルメモ術
- なぜ成功者は手書きメモをやめたのか
- 脳科学が証明するメモの効果
```

**カテゴリC: ターゲット別（ロングテール）**
```
- 大学生のためのメモアプリ活用法
- フリーランスの請求書メモ管理術
- 営業マンのための商談メモテクニック
- エンジニアのコードスニペットメモ管理
- 主婦・主夫のための買い物リストアプリ比較
- 就活メモの整理術
- 子育てメモ：成長記録の残し方
- 旅行計画メモの作り方
```

**カテゴリD: 英語記事（グローバル流入）**
```
- The Complete Guide to Email-Based Note Taking
- Why Sending Notes to Yourself is the Simplest Productivity Hack
- Captio is Dead: 5 Best Alternatives in 2026
- How to Build an Inbox Zero System with Email Memos
- The Privacy-First Approach to Note Taking
- GTD with Email: A Step-by-Step Guide
- Why Simple Beats Complex: The Case for Minimalist Memo Apps
- Japanese Productivity Methods You Should Try
```

---

## 5. AIO（AI Overview）最適化戦略

### 5.1 AIOとは何か

Google AI Overviews、ChatGPT Browse、Perplexity、Claude Search等のAI検索エンジンが、検索結果の上部にAI生成の回答を表示し、その中でソースとしてウェブサイトを引用する仕組み。

**月間100万UUの15%（15万UU）をAIO経由で獲得する戦略。**

### 5.2 AIO引用される条件

```
1. AIクローラーがアクセスできること（robots.txt許可） ← 現在ブロック中！
2. 明確で自己完結的な段落があること
3. 構造化データが正確に実装されていること
4. 権威性・信頼性のシグナルがあること（EEAT）
5. 具体的なデータ（数値、日付、固有名詞）が含まれていること
6. 質問→回答形式のコンテンツがあること
```

### 5.3 AIO最適化テンプレート

#### パターン1: 定義型（用語集向け）

```html
<section class="aio-definition" itemscope itemtype="https://schema.org/DefinedTerm">
  <h2 itemprop="name">Inbox Zeroとは</h2>
  <p itemprop="description">
    <strong>Inbox Zero（インボックス・ゼロ）</strong>とは、メールの受信箱を
    常に空（ゼロ）の状態に保つ生産性メソッドです。2006年にMerlin Mann氏が
    提唱し、メールを「削除・委任・返信・延期・実行」の5つのアクションに
    分類して即座に処理することで、受信箱のストレスを解消します。
  </p>
</section>
```

**ポイント:** 最初の段落で「○○とは、△△です。」と明確に定義。AIはこの形式を最も引用しやすい。

#### パターン2: 比較型（VS向け）

```html
<section class="aio-comparison">
  <h2>SimpleMemo vs Evernoteの違い</h2>
  <p>
    <strong>SimpleMemoとEvernoteの最大の違い</strong>は、SimpleMemoが
    「メモを自分のメールに即送信」する単機能アプリ（0.3秒起動、月額¥500）
    であるのに対し、Evernoteはノート管理・タグ・検索を備えた多機能アプリ
    （月額¥1,100〜）である点です。シンプルさと即時性を重視するなら
    SimpleMemo、情報の蓄積と検索を重視するならEvernoteが適しています。
  </p>

  <table>
    <thead><tr><th>項目</th><th>SimpleMemo</th><th>Evernote</th></tr></thead>
    <tbody>
      <tr><td>価格</td><td>無料〜¥500/月</td><td>¥1,100〜/月</td></tr>
      <tr><td>起動速度</td><td>0.3秒</td><td>2-3秒</td></tr>
      <tr><td>オフライン</td><td>○（自動再送）</td><td>○（有料プラン）</td></tr>
      <tr><td>暗号化</td><td>AES-GCM</td><td>TLS</td></tr>
    </tbody>
  </table>
</section>
```

**ポイント:** 冒頭に結論、その後に比較表。AIは表形式のデータを特に好む。

#### パターン3: ハウツー型（ガイド向け）

```html
<section class="aio-howto" itemscope itemtype="https://schema.org/HowTo">
  <h2 itemprop="name">SimpleMemoでGmailにメモを送る方法</h2>
  <meta itemprop="totalTime" content="PT3M">
  <p>SimpleMemoからGmailにメモを送るには、以下の3ステップで設定できます。所要時間は約3分です。</p>

  <ol>
    <li itemprop="step" itemscope itemtype="https://schema.org/HowToStep">
      <h3 itemprop="name">ステップ1: メールアドレスを入力</h3>
      <p itemprop="text">アプリを開き、設定画面でGmailアドレスを入力します。</p>
    </li>
    <li itemprop="step" itemscope itemtype="https://schema.org/HowToStep">
      <h3 itemprop="name">ステップ2: テスト送信</h3>
      <p itemprop="text">「テスト送信」ボタンをタップして、Gmailに届くか確認します。</p>
    </li>
    <li itemprop="step" itemscope itemtype="https://schema.org/HowToStep">
      <h3 itemprop="name">ステップ3: 完了</h3>
      <p itemprop="text">テストメールが届いたら設定完了です。以後、メモを書いて送信ボタンを押すだけでGmailに届きます。</p>
    </li>
  </ol>
</section>
```

#### パターン4: FAQ型（AIO直接回答狙い）

```html
<section itemscope itemtype="https://schema.org/FAQPage">
  <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
    <h3 itemprop="name">自分にメールを送るのに最適なアプリは？</h3>
    <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
      <p itemprop="text">
        自分にメールを送るのに最適なアプリは<strong>SimpleMemo（Captio式シンプルメモ）</strong>です。
        0.3秒で起動し、ワンタップでメモを自分のメールアドレスに送信できます。
        AES-GCM暗号化でプライバシーも保護され、オフラインでも動作します。
        月額無料プラン（1日3通）と、プレミアムプラン（月額¥500で無制限）があります。
      </p>
    </div>
  </div>
</section>
```

### 5.4 AIO用コンテンツ制作ルール

```
1. 各ページの最初の段落は「自己完結的な回答」にする
   → AIがその段落だけを抜き出しても意味が通じること

2. 数値・固有名詞を必ず含める
   → 「速い」ではなく「0.3秒で起動」
   → 「安い」ではなく「月額¥500（年額¥5,000）」

3. 1つの見出し（H2/H3）= 1つのトピック
   → AIは見出し単位でチャンクを抽出する

4. 比較表・リストを多用する
   → AIは構造化されたデータを好む

5. 「○○とは」で始まる定義段落を入れる
   → 「SimpleMemoとは、メモをワンタップで自分のメールに送れるiOSアプリです。」

6. 更新日を明示する
   → <meta property="article:modified_time"> + ページ内表示

7. 著者情報・運営者情報を充実させる（EEAT）
   → /about/ ページの強化
```

### 5.5 Speakable最適化（音声検索対応）

```json
{
  "@type": "WebPage",
  "speakable": {
    "@type": "SpeakableSpecification",
    "cssSelector": [
      ".aio-definition p:first-of-type",
      ".hero-subtitle",
      ".faq-answer"
    ]
  }
}
```

---

## 6. 国際SEO戦略（日英2言語）

### 6.1 URL構造の分離（必須）

**現状の問題:** クライアントサイドJS切替ではGooglebotが英語版を認識できない。

**修正後のURL構造:**
```
simplememofast.com/           → 日本語（デフォルト）
simplememofast.com/en/        → 英語版
simplememofast.com/en/vs/     → 英語版比較ハブ
simplememofast.com/en/blog/   → 英語版ブログ
...
```

### 6.2 英語版ページ作成優先度

| 優先度 | ページ | 理由 |
|---|---|---|
| P0 | /en/ (トップ) | ブランド認知 |
| P0 | /en/captio-alternative/ | 英語圏のCaptio難民が主要ターゲット |
| P0 | /en/note-to-email/ | コア機能LP |
| P1 | /en/vs/ (ハブ + 主要5本) | 比較検索の英語Vol |
| P1 | /en/blog/ (主要5本) | コンテンツSEO |
| P2 | /en/guides/ (Gmail, Outlook) | セットアップガイド |
| P2 | /en/methods/ (GTD, Inbox Zero) | 生産性メソッド |

### 6.3 hreflang実装

**全ページの`<head>`に:**
```html
<link rel="alternate" hreflang="ja" href="https://simplememofast.com/{path}/">
<link rel="alternate" hreflang="en" href="https://simplememofast.com/en/{path}/">
<link rel="alternate" hreflang="x-default" href="https://simplememofast.com/{path}/">
```

**sitemap.xmlにも:**
```xml
<url>
  <loc>https://simplememofast.com/vs/evernote/</loc>
  <xhtml:link rel="alternate" hreflang="ja" href="https://simplememofast.com/vs/evernote/"/>
  <xhtml:link rel="alternate" hreflang="en" href="https://simplememofast.com/en/vs/evernote/"/>
  <xhtml:link rel="alternate" hreflang="x-default" href="https://simplememofast.com/vs/evernote/"/>
  <lastmod>2026-03-06</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.7</priority>
</url>
```

### 6.4 将来の多言語展開

Phase 4で以下を検討:
```
/ko/  → 韓国語（App Storeで韓国市場狙い）
/zh/  → 中国語繁体字（台湾・香港市場）
```

---

## 7. リンクビルディング戦略

### 7.1 被リンクの現状と目標

| 指標 | 現状 | 6ヶ月目標 | 12ヶ月目標 |
|---|---|---|---|
| 参照ドメイン数 | ~0 | 50+ | 200+ |
| ドメインレーティング（DR） | 0 | 20+ | 40+ |
| 被リンク総数 | ~0 | 200+ | 1,000+ |

### 7.2 リンク獲得チャネル

#### チャネル1: アプリレビューサイト掲載（即効性高）

**日本:**
```
- app-liv.jp（申請フォームあり）
- applion.jp（自動収集だが手動登録も可）
- good-apps.jp（レビュー依頼可）
- m-s-y.com（メディア掲載依頼）
- aspicjapan.org（SaaS/アプリ比較）
- moovoo.com（ガジェットメディア）
- appbank.net（iOSアプリレビュー）
```

**英語:**
```
- producthunt.com（ローンチ掲載 → 高DRバックリンク）
- alternativeto.net（Captioの代替として登録）
- slant.co（比較サイト登録）
- g2.com（ソフトウェアレビュー）
- capterra.com（ビジネスツールレビュー）
- noteapps.info（メモアプリ専門比較）
- zapier.com/blog（寄稿・紹介依頼）
```

#### チャネル2: コンテンツマーケティング（中長期）

```
- Qiita/Zennに技術記事投稿（Outbox Architecture, Cloudflare Workers）
- note.comに開発ストーリー記事
- Medium（英語）に生産性系記事
- dev.to（英語）に技術記事
- Hacker Newsに技術的な差別化ポイントを投稿
```

#### チャネル3: デジタルPR（高効果）

```
- プレスリリース配信（PR TIMES, @Press）
  → 「Captio終了後の代替アプリとしてリリース」角度
  → 「0.3秒起動のプライバシー特化メモアプリ」角度
- テック系メディアへの寄稿
  → ITmedia, CNET Japan, TechCrunch Japan
- ポッドキャスト出演
  → Rebuild.fm, backspace.fm, テック系ポッドキャスト
```

#### チャネル4: リンカブルアセット制作

**リンクを自然に獲得するための「リンクされる価値のあるコンテンツ」:**

```
1. 「メモアプリ比較チャート2026」（インフォグラフィック）
   → 20+アプリの機能比較を一覧化した画像
   → ブロガーが引用してリンクしてくれる

2. 「メモアプリ利用実態調査」（オリジナルデータ）
   → アンケート調査を実施、結果を公開
   → メディアが引用してリンクしてくれる

3. 「メモ術チェックリストPDF」（無料ダウンロード）
   → メルマガ登録と引き換え（リード獲得にも）

4. 「Email-Based Productivity Toolkit」（英語版）
   → テンプレート集を無料公開

5. 「日本の生産性メソッド完全ガイド」（英語版）
   → Zettelkasten, Pomodoro等の日本的解釈
   → 海外ブロガーからのリンク獲得
```

#### チャネル5: パートナーシップ

```
- メール関連サービスとの相互リンク
  → ProtonMail Blog, Fastmail Blog等へのゲスト投稿
- 生産性系インフルエンサーとのコラボ
  → YouTuber, TikTokerへの無料プレミアム提供
- 大学・教育機関
  → 学生向けの生産性ツールとして紹介依頼
```

---

## 8. コンテンツ量産アーキテクチャ

### 8.1 プログラマティックSEO

**概念:** テンプレートベースで大量のページを自動生成し、ロングテールキーワードを網羅的にカバーする戦略。

#### 実装案1: 「○○ × メモアプリ」マトリクスページ

```
/for/students/          ← 学生向けメモアプリガイド
/for/engineers/         ← エンジニア向け
/for/designers/         ← デザイナー向け
/for/writers/           ← ライター向け
/for/researchers/       ← 研究者向け
/for/managers/          ← マネージャー向け
/for/sales/             ← 営業向け
/for/teachers/          ← 教師向け
...（20+ページ）
```

#### 実装案2: 「○○ でメモ」シチュエーションページ

```
/when/commuting/        ← 通勤中のメモ
/when/meeting/          ← 会議中のメモ
/when/reading/          ← 読書中のメモ
/when/cooking/          ← 料理中のメモ
/when/walking/          ← 散歩中のメモ
/when/showering/        ← シャワー中のアイデア
/when/sleeping/         ← 寝る前のメモ
...（15+ページ）
```

#### 実装案3: 地域別App Storeランディングページ（英語）

```
/en/best-memo-app-japan/
/en/best-memo-app-us/
/en/best-memo-app-uk/
/en/best-memo-app-australia/
/en/best-memo-app-canada/
...（10+ページ）
```

### 8.2 コンテンツ制作フロー

```
1. キーワードリサーチ（Ahrefs/SEMrush）
   ↓
2. 検索意図分析（SERP上位10件を分析）
   ↓
3. コンテンツブリーフ作成
   - ターゲットKW、検索意図、word count、見出し構成
   ↓
4. 原稿作成（AI+人間レビュー）
   - AIOテンプレートに沿って構造化
   ↓
5. HTML化・構造化データ実装
   ↓
6. 内部リンク設計
   ↓
7. 公開・インデックスリクエスト
   ↓
8. 2週間後にパフォーマンス確認
   ↓
9. リライト・最適化
```

### 8.3 内部リンク設計原則

```
原則1: ハブ→スポーク、スポーク→ハブの双方向リンク
原則2: 同一クラスター内のスポーク間相互リンク（最低2本）
原則3: クラスター間の関連リンク（methods→use-cases等）
原則4: 新規記事は公開24時間以内に既存5ページ以上からリンク
原則5: アンカーテキストにターゲットKWを含める（完全一致は30%以下）
原則6: トップページから2クリック以内で全ページ到達可能にする
```

**内部リンクマトリクス:**
```
         トップ  VS  活用  ガイド  メソッド  ブログ  用語集
トップ      -    ○    ○     ○      ○       ○      -
VS         ○    -    ○     -      ○       ○      ○
活用        ○    ○    -     ○      ○       ○      -
ガイド      ○    -    ○     -      -       ○      ○
メソッド    ○    ○    ○     -      -       ○      ○
ブログ      ○    ○    ○     ○      ○       -      ○
用語集      -    ○    -     ○      ○       ○      -
```

---

## 9. KPI・計測・PDCAフレームワーク

### 9.1 月次KPIダッシュボード

| KPI | Month 1 | Month 3 | Month 6 | Month 9 | Month 12 |
|---|---|---|---|---|---|
| 月間UU | 1,000 | 10,000 | 100,000 | 400,000 | 1,000,000 |
| インデックスページ数 | 50 | 100 | 150 | 200 | 250+ |
| 参照ドメイン数 | 5 | 20 | 50 | 120 | 200+ |
| DR (Domain Rating) | 5 | 10 | 20 | 30 | 40+ |
| オーガニックKW数 | 100 | 500 | 2,000 | 8,000 | 20,000+ |
| Top 10 KW数 | 5 | 30 | 150 | 500 | 1,500+ |
| AIO引用回数 | 0 | 5 | 30 | 100 | 300+ |
| CTR（平均） | 2% | 3% | 4% | 5% | 5%+ |
| 直帰率 | 70% | 60% | 55% | 50% | 45% |
| App DL数/月 | 50 | 300 | 2,000 | 8,000 | 20,000+ |

### 9.2 計測ツール

| ツール | 用途 | 確認頻度 |
|---|---|---|
| Google Search Console | インデックス、クエリ、CTR | 毎日 |
| Google Analytics 4 | UU、ページビュー、行動フロー | 毎日 |
| Ahrefs | DR、被リンク、競合分析、KWランキング | 週次 |
| PageSpeed Insights | Core Web Vitals | 月次 |
| Screaming Frog | テクニカルSEOクロール | 月次 |
| Bing Webmaster Tools | Bing/Edge検索パフォーマンス | 週次 |

### 9.3 週次レビューチェックリスト

```
□ GSC: 新規インデックスページ数確認
□ GSC: クロールエラー確認・修正
□ GSC: 検索パフォーマンス（クリック、表示回数、CTR、順位）
□ GA4: UU推移、新規vs再訪問
□ GA4: 離脱率の高いページ特定→改善
□ Ahrefs: 新規被リンク確認
□ Ahrefs: 順位変動の大きいKW確認
□ コンテンツ: 今週の公開記事数
□ コンテンツ: リライト対象ページの特定
□ 技術: 404エラーの確認・修正
```

### 9.4 月次戦略レビュー

```
1. KPI達成率の評価
2. トラフィック源の分析（オーガニック/ダイレクト/SNS/リファラル）
3. コンバージョンファネル分析（訪問→DL→有料化）
4. 競合サイトの動向確認
5. コンテンツROI分析（記事あたりのトラフィック）
6. 翌月の施策優先度の調整
```

---

## 10. 実装優先度マトリクス

### 緊急度×効果 マトリクス

```
              効果: 高                    効果: 低
         ┌─────────────────┬─────────────────┐
緊急度:  │ ★ DO FIRST      │ △ SCHEDULE      │
 高      │                 │                 │
         │ • robots.txt修正 │ • OGP画像作成   │
         │ • canonical追加  │ • PWA manifest  │
         │ • GSC登録        │                 │
         │ • OGP/Twitter追加│                 │
         │ • hreflang追加   │                 │
         ├─────────────────┼─────────────────┤
緊急度:  │ ○ PLAN          │ × LATER         │
 低      │                 │                 │
         │ • /en/分離       │ • 多言語展開     │
         │ • ヘッダーナビ   │ • UGC機能       │
         │ • コンテンツ量産 │ • コミュニティ   │
         │ • 被リンク獲得   │ • 動画コンテンツ │
         │ • AIOテンプレート│ • PWA化         │
         └─────────────────┴─────────────────┘
```

### 実装チェックリスト（時系列）

#### Week 1（即座に）
- [ ] robots.txt修正 → AIクローラー許可
- [ ] 全ページにcanonicalタグ追加
- [ ] 全ページにOGPメタタグ追加
- [ ] 全ページにTwitterカードメタタグ追加
- [ ] 全ページにrobots metaタグ追加（max-snippet:-1等）
- [ ] Google Search Console登録・全ページインデックスリクエスト
- [ ] Bing Webmaster Tools登録
- [ ] CloudflareのHTTPヘッダー確認（noindex除外）

#### Week 2-3
- [ ] hreflangリンクタグ全ページ実装
- [ ] グローバルヘッダーナビゲーション追加
- [ ] パンくずリストUI表示追加
- [ ] 内部リンク強化（既存ページ間）
- [ ] /about/ ページ強化（EEAT対策）

#### Week 4-6
- [ ] /en/ ディレクトリ作成・主要10ページ英語版公開
- [ ] 新規ブログ記事10本公開
- [ ] 比較ページ10本追加
- [ ] Product Hunt登録
- [ ] AlternativeTo登録（Captio代替として）

#### Month 2-3
- [ ] ブログ記事20本追加
- [ ] 比較ページ15本追加
- [ ] アプリレビューサイト10件掲載
- [ ] Qiita/Zenn技術記事5本
- [ ] プレスリリース配信

#### Month 4-6
- [ ] コンテンツ合計200ページ達成
- [ ] DR 20+達成
- [ ] 月間UU 10万達成
- [ ] プログラマティックSEO開始
- [ ] AIO引用実績確認・最適化

#### Month 7-12
- [ ] コンテンツ合計300ページ達成
- [ ] DR 40+達成
- [ ] 月間UU 100万達成
- [ ] 多言語展開検討（韓国語・中国語繁体字）
- [ ] UGC機能の検討

---

## 付録A: 競合分析サマリー

### 日本市場の主要競合

| アプリ | DR推定 | 月間トラフィック推定 | 強み | 弱み |
|---|---|---|---|---|
| Google Keep | 95 | 10M+ | Google エコシステム | 自メール送信不可 |
| Notion | 90 | 5M+ | オールインワン | 重い、複雑 |
| Evernote | 85 | 3M+ | 歴史、ブランド | 衰退傾向 |
| Apple Notes | 95 | 2M+ | OS統合 | Apple限定 |
| Stock | 60 | 500K | ビジネス特化 | 個人利用に不向き |

### 「自分にメール」ニッチの直接競合

| アプリ | 状態 | DR推定 | 差別化ポイント |
|---|---|---|---|
| Captio | 終了 | - | SimpleMemoの主要置換ターゲット |
| Email Me App | 稼働中 | 30 | 写真・ファイル対応 |
| Note to Self Mail | 稼働中 | 20 | GDPR強調 |
| Memos: Email Me | 稼働中 | 15 | Siri対応 |
| Take A Note | 稼働中 | 25 | クロスプラットフォーム |

**SimpleMemoの差別化:**
- 0.3秒起動（業界最速）
- AES-GCM暗号化（セキュリティ最強）
- Captio公式代替ポジショニング（ブランドストーリー）
- 日本発（日本市場で唯一の本格的自メール送信アプリ）

---

## 付録B: AIO対応チェックリスト（全ページ共通）

```
□ 冒頭段落で「○○とは△△です」形式の定義文がある
□ 具体的な数値（価格、速度、日付）が含まれている
□ H2/H3見出しが質問形式（「○○とは？」「○○の方法」）
□ 比較表（<table>）が少なくとも1つある
□ FAQセクション（JSON-LD付き）がある
□ 更新日が明示されている
□ パンくずリストがある
□ 著者・運営者情報へのリンクがある
□ 関連ページへの内部リンクが3本以上ある
□ Speakable指定がされている
□ meta robotsでmax-snippet:-1が設定されている
□ 画像にalt属性が設定されている
□ 構造化データのエラーがない（Rich Results Testで確認）
```

---

## 付録C: 月間100万UUの数学的根拠

```
目標: 1,000,000 UU/月

前提:
- 平均CTR: 5%（Top 3で10%、Top 10で3%、11-20で1%）
- 平均検索表示回数/ページ: 推定値

計算:
必要な月間検索表示回数 = 1,000,000 / 0.05 = 20,000,000回

これを達成するには:
- 250ページ × 平均80,000表示/月/ページ（ヘッドKW中心）
  → 非現実的

より現実的な構成:
- Tier 1（10ページ）: 平均100,000表示 × CTR 8% = 80,000 UU
- Tier 2（40ページ）: 平均20,000表示 × CTR 5% = 40,000 UU
- Tier 3（200ページ）: 平均5,000表示 × CTR 4% = 40,000 UU
- ブランド検索: 50,000 UU
- AIO/AI検索: 150,000 UU
- SNS: 100,000 UU
- ダイレクト: 50,000 UU
- 英語版（Tier 1-3合計）: 250,000 UU
- リファラル: 50,000 UU
- 英語AIO/AI: 100,000 UU
- アプリストア流入: 40,000 UU
---
合計: 約1,000,000 UU

必要条件:
1. 250+ページの高品質コンテンツ
2. DR 40+（被リンク200+ドメイン）
3. 日本語Tier1で10ページがTop5入り
4. 英語版で50+ページがインデックス
5. AIO引用300+回/月
6. SNSフォロワー10,000+
```

---

**本仕様書は継続的に更新し、月次レビューで施策の効果を検証・調整すること。**

**Next Action: Phase 0（緊急修正）の即座実行を推奨。**
