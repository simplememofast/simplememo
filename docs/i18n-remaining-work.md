# i18n プロジェクト 残作業引き継ぎドキュメント

> **作成日**: 2026-05-01
> **対象読者**: cowork セッション（または別の AI / 人間オペレーター）が、このドキュメント1本を見るだけで残作業を完遂できることを目指す。
> **前提**: i18n コア実装（PR #170〜#175）は本番デプロイ済。
> **完了条件**: §8「受入基準」の全項目をチェックできる状態にする。

---

## 0. 文脈

### 0.1 サイト概要

| 項目 | 値 |
|---|---|
| 本番ドメイン | `https://simplememofast.com` |
| ホスティング | Cloudflare Pages |
| デプロイ | `main` ブランチへの push で自動 |
| 自動マージ | `claude/` プレフィックスの PR は GitHub Actions で auto-merge |
| Git リポジトリ | `simplememofast/simplememo`（GitHub） |
| 主言語 | 日本語（`/` 配下） |
| 副言語 | 英語（`/en/` 配下） |
| その他ロケール | ar, es, id, ko, pt-BR, tr, zh, zh-Hant（各 1 ページのストアスタブ） |

### 0.2 完了済みの i18n インフラ（2026-05-01 時点）

7 PR が本番にデプロイ済。各 PR の要点：

| # | ブランチ | 内容 | 主要成果物 |
|---|---|---|---|
| 169 | `claude/en-app-store-us-url`（前提） | 関連: 英語ページの App Store リンクを US ストアに統一 | （別タスク） |
| 170 | `claude/i18n-phase1-foundation` | hreflang/canonical/lang/content-language 基盤（32 ファイル） | `scripts/i18n_config.py`, `scripts/normalize_i18n_head.py` |
| 171 | `claude/i18n-phase2-sitemap-schema` | sitemap 分割 + FAQPage Schema + robots/llms 強化 | `sitemap.xml` (index), `sitemap-ja.xml`, `sitemap-en.xml`, `scripts/generate_sitemap.py`, `scripts/inject_faq_schema.py` |
| 172 | `claude/i18n-phase3-analytics-cdn` | GA4 page_language（197 ファイル）+ CDN ヘッダー | `scripts/inject_ga4_page_language.py`, `_headers` |
| 173 | `claude/i18n-phase4-switcher-fonts` | 言語別フォント最適化（Phase 4-d） | `assets/css/style.min.css` 末尾に override、4 EN ページから JP プリロード削除 |
| 174 | `claude/i18n-content-language-sweep` | 残り 163 JA-only ページに content-language meta を一斉追加 | `scripts/normalize_i18n_head.py` 拡張（`build_auto_plan`） |
| 175 | `claude/i18n-css-cache-bust` | CSS の `?v=20260501` 付与で CF エッジキャッシュ無効化 | 187 HTML の link タグ更新 |

### 0.3 残作業の全体像

| カテゴリ | 件数 | 概要 |
|---|---|---|
| 手動オペレーター作業 | 4 | ダッシュボード操作のみ。コード化不可 |
| インフラ整理 | 1 | IndexNow 鍵の重複解消（小タスク） |
| 外部リソース必要 | 3 | デザイン作業 / 翻訳 / ネイティブレビュー |
| 継続モニタリング | 4 | 24h / 7日 / 30日 / 90日 ゲート評価 |

---

## 1. 手動オペレーター作業（4 件）

すべてダッシュボード UI 操作。順番は **2.1 → 2.2 → 2.3 → 2.4** の順を推奨（依存関係順）。

### 1.1 GA4 admin: `page_language` カスタムディメンション登録

#### Why
i18n Phase 3（PR #172）で 197 HTML に `gtag('config', 'G-EPZVZKCVQG', {page_language: ...})` を注入済。`page_language` イベントパラメータは現在も silent collection されているが、Custom Dimension として登録されるまで GA4 Explore レポートで使えない。

#### 前提
- GA4 プロパティ ID: `G-EPZVZKCVQG`
- GA4 admin にアクセス可能なアカウント

#### 手順
1. https://analytics.google.com/ にサインイン
2. SimpleMemo プロパティを選択
3. 左下「⚙️ 管理」→ プロパティ列の「カスタム定義」→「カスタム ディメンション」タブ
4. 「カスタム ディメンションを作成」をクリック
5. 以下を入力：
   - **ディメンション名**: `Page Language`
   - **スコープ**: **イベント**（重要：「ユーザー」ではなく）
   - **説明**: `URL-based language detected from path. Ja = root, en = /en/, plus 8 minor locales.`
   - **イベント パラメータ**: `page_language`
6. 「保存」

#### 検証
- 24〜48 時間待つ（GA4 のデータ反映時間）
- DebugView で `page_language` がイベントに含まれることを即座に確認可能：
  - DebugView を開く（管理 → DebugView）
  - サイトを開きながら確認
  - `page_view` イベントの詳細で `page_language: 'ja'` または `'en'` が見えれば OK

#### 完了条件
- [ ] GA4 → 探索 → 自由形式で「page_language」をディメンションとして選択できる

---

### 1.2 Search Console: `/en/` URL-prefix プロパティ追加

#### Why
`/en/` 配下のパフォーマンス（クリック数、CTR、平均順位）を独立して分析するために、ドメインプロパティとは別の URL-prefix プロパティが必要。

#### 前提
- Search Console アクセス権を持つアカウント
- 既に `https://simplememofast.com/` の URL-prefix プロパティと Domain プロパティは登録済（推定）

#### 手順
1. https://search.google.com/search-console を開く
2. 左上ドロップダウン → 「プロパティを追加」
3. 「URL プレフィックス」を選択
4. URL: `https://simplememofast.com/en/`（**末尾スラッシュ必須**）
5. 認証方法：**HTML タグ**を選択
6. 提示された `<meta name="google-site-verification" content="...">` タグをコピー
7. リポジトリで以下のファイルに verification meta を挿入：
   - `en/index.html` の `<head>` 内（理想は `<title>` の直後）
8. 変更を `claude/sc-en-verification` ブランチで PR → 自動マージ → デプロイ
9. デプロイ完了後、Search Console に戻り「認証」をクリック
10. 認証成功を確認
11. 認証成功後、サイトマップ提出：
    - 左メニュー「サイトマップ」→ `https://simplememofast.com/sitemap-en.xml` を入力 → 送信

#### 検証
- 認証ステータス：所有者として確認済
- サイトマップステータス：成功（24〜48 時間後）
- 「インデックス カバレッジ」レポートで `/en/*` ページがインデックスされていることを確認

#### 完了条件
- [ ] Search Console プロパティリストに `https://simplememofast.com/en/` が「確認済み」状態で表示
- [ ] `/sitemap-en.xml` が「成功」ステータス
- [ ] パフォーマンスレポートで `/en/` 配下のクリック数を独立確認可能

---

### 1.3 Bing Webmaster Tools: サイト登録 + sitemap 提出

#### Why
Bing は ChatGPT Search のインデックスソース。Bing にインデックスされていないと、ChatGPT 経由のオーガニック流入を取り逃す。

#### 前提
- Microsoft アカウント（Outlook / Hotmail / Live.com 何でも可）

#### 手順
1. https://www.bing.com/webmasters/ を開く
2. Microsoft アカウントでサインイン
3. **推奨**: 「Google Search Console からインポート」を選択（Search Console の権限を持っていれば数クリックで完了）
4. インポート不可なら「サイトを追加」→ `https://simplememofast.com` を入力
5. 認証方法：
   - DNS（Cloudflare に TXT レコード追加）または
   - HTML メタタグ（`<head>` に挿入、PR デプロイ）
6. 認証成功後、左メニュー「サイトマップ」→「サイトマップを送信」
7. 以下を提出：
   - `https://simplememofast.com/sitemap.xml`
8. 自動的に `sitemap-ja.xml` と `sitemap-en.xml` も処理される（index 構造）

#### 検証
- サイトマップステータス：成功
- Bing で `site:simplememofast.com` を検索して結果数を記録（ベースライン）
- Bing で `site:simplememofast.com/en/` を検索（英語ページのインデックス進捗）

#### 完了条件
- [ ] Bing Webmaster Tools にサイト登録済
- [ ] `sitemap.xml` 提出済、ステータス「成功」
- [ ] 数日後、Bing インデックスに少なくとも 50 ページ以上含まれることを確認

---

### 1.4 Bing IndexNow API キー登録

#### Why
IndexNow は更新通知プロトコル。登録しておけば、デプロイ直後に Bing に再クロール要請を送信できる（通常は数日かかるクロールが数時間〜数分に短縮）。

#### 前提
- §1.3 完了（Bing Webmaster Tools サイト登録済）
- IndexNow キーが本番に配信済：`https://simplememofast.com/dda35fda390ffabbcce681394b3a57cc.txt`

#### 鍵情報

| 項目 | 値 |
|---|---|
| キー文字列 | `dda35fda390ffabbcce681394b3a57cc` |
| キー検証 URL | `https://simplememofast.com/dda35fda390ffabbcce681394b3a57cc.txt` |
| 通知スクリプト | `scripts/indexnow-notify.js`（Node、CI 連携済） |
| CI 連携 | `.github/workflows/seo-check.yml` で `--since 1` 自動実行 |
| 鍵記録 | `.indexnow-key` ファイル |
| 既存ドキュメント | `docs/indexnow-setup.md` |

#### 手順
1. Bing Webmaster Tools にサインイン
2. 左メニュー「設定」→「API アクセス」（または「IndexNow」）
3. 「API キーを生成または登録」
4. キー文字列を入力: `dda35fda390ffabbcce681394b3a57cc`
5. キー検証 URL: `https://simplememofast.com/dda35fda390ffabbcce681394b3a57cc.txt` を確認
6. 登録完了

#### 動作確認
キー登録後、ローカルから手動で IndexNow API を叩いて確認：

```bash
node scripts/indexnow-notify.js --all       # 全 URL 通知
node scripts/indexnow-notify.js             # 過去 1 日の更新のみ
# 期待: HTTP 200 もしくは 202 が返る
```

#### 完了条件
- [ ] Bing Webmaster Tools にキーが登録済
- [ ] `indexnow-notify.js` を実行して 200/202 レスポンスが取得できる
- [ ] 5 分後 Bing Webmaster の URL Inspection で「最終クロール日時」が更新されている

---

## 2. インフラ整理（完了済）

### 2.1 IndexNow 鍵の二重化解消 — 完了

#### 状況（解消済）
i18n Phase 3 PR #172 で IndexNow 鍵 `3b4a3c278a4cc17ab7e03d6e7739bd21` を追加した時、既存の `dda35fda390ffabbcce681394b3a57cc` インフラに気付かず重複させてしまった。

#### 解消方法
PR の `claude/i18n-cleanup-indexnow-dup` で新規 Python 側を撤去、既存 Node 版に統一：
- 削除済: `/3b4a3c278a4cc17ab7e03d6e7739bd21.txt`
- 削除済: `/scripts/notify_indexnow.py`

#### 残存している唯一のインフラ
- `/dda35fda390ffabbcce681394b3a57cc.txt`（鍵ファイル）
- `/.indexnow-key`（鍵記録ファイル）
- `/scripts/indexnow-notify.js`（Node 版通知スクリプト、機能リッチ）
- `.github/workflows/seo-check.yml`（CI 自動通知に組み込まれている）
- `/docs/indexnow-setup.md`（既存ドキュメント）

#### 完了条件
- [x] 本番に IndexNow 鍵ファイルが 1 つだけ存在（`dda35fda...`）
- [x] CI 動作（`seo-check.yml`）に影響なし
- [ ] §1.4 で Bing IndexNow に登録（→ §1.4 のチェックを参照）

---

## 3. 外部リソース必要作業（3 件）

### 3.1 言語スイッチャー UI 統一（Phase 4-a）

#### Why（スペック §7.2）
Google 公式は自動言語リダイレクト禁止。代わりに能動的選択 UI として言語スイッチャーを paired ページのヘッダーに常設すべき。
現状：
- ホームページ `/` は 10 ロケール dropdown を実装済
- `/captio-alternative/` は ja↔en インラインリンクを実装済
- **その他 10 paired ページにスイッチャーが無い**

#### 必要な作業
以下 10 ページに統一されたスイッチャー UI を追加：

| ページ | ペア URL |
|---|---|
| `/note-to-email/` | ↔ `/en/note-to-email/` |
| `/en/note-to-email/` | ↔ `/note-to-email/` |
| `/privacy.html` | ↔ `/en/privacy.html` |
| `/en/privacy.html` | ↔ `/privacy.html` |
| `/terms.html` | ↔ `/en/terms.html` |
| `/en/terms.html` | ↔ `/terms.html` |
| `/blog/ios-quick-capture-comparison.html` | ↔ `/en/blog/ios-quick-capture-comparison.html` |
| `/en/blog/ios-quick-capture-comparison.html` | ↔ `/blog/ios-quick-capture-comparison.html` |
| `/en/captio-alternative/` | ↔ `/captio-alternative/` |
| （`/captio-alternative/` は既存スイッチャーあり、移行時は形式統一） |

#### 設計仕様（スペック §7.2.1〜§7.2.4 準拠）
1. **配置**: ヘッダー右上に小さく常設
2. **表示**: ペアが存在するページでのみ表示。ペアが無いページでは非表示（または disabled）
3. **クリック動作**:
   - 対応言語ページへ遷移（href の絶対 URL）
   - Cookie `preferred_locale=<locale>` を 1 年間セット（`SameSite=Lax`、`max-age=31536000`）
   - **自動リダイレクトは禁止**。Cookie はあくまで「次回訪問時のヒント」として後日活用するのみ
4. **アクセシビリティ**:
   - `aria-label="Switch to <Other Language>"` 必須
   - キーボード フォーカス可能
5. **属性**:
   - `rel="alternate"` `hreflang="..."` を `<a>` タグに付与
6. **デザイン**:
   - 既存の `/captio-alternative/` スイッチャー or トップの `lang-dropdown` のスタイルを再利用
   - 色・サイズはサイト既存トークン（`var(--accent)` 等）を使う
   - SVG アイコンや絵文字なしのシンプルなテキストリンク

#### 推奨実装パス
`scripts/i18n_config.py` の `JA_EN_PAIRS` を読んで、各 paired ページの `<header>` 内に標準化スニペットを挿入する Python 一括スクリプトを作成：

```python
# scripts/inject_lang_switcher.py（新規）
# 各 paired ページの <header> または特定 anchor に
# 既存スタイルの switcher snippet を挿入。
# 既に挿入済みなら no-op（マーカーコメントで idempotent 化）。
```

スニペット例：
```html
<!-- lang-switcher: managed by scripts/inject_lang_switcher.py -->
<a href="<other_url>"
   rel="alternate"
   hreflang="<other_locale>"
   class="lang-switcher-link"
   aria-label="Switch to <Other Language>"
   onclick="document.cookie='preferred_locale=<other_locale>;path=/;max-age=31536000;SameSite=Lax'">
  <Other Language Label>
</a>
```

#### 検証
- 各ページでブラウザを開き、スイッチャーが見える
- クリックで対応言語ページへ遷移
- DevTools の Application → Cookies で `preferred_locale` がセットされる
- リーダー モード or VoiceOver で `aria-label` が読まれる
- Lighthouse Accessibility スコア低下なし

#### 工数目安
3〜4 時間

#### 完了条件
- [ ] 10 paired ページすべてにスイッチャー追加
- [ ] Cookie セット動作確認
- [ ] 既存 `/captio-alternative/` のスタイルとの整合性
- [ ] アクセシビリティ チェック通過

---

### 3.2 OGP 画像 4 枚の制作（Phase 4-b）

#### Why（スペック §7.3）
言語別 OGP 画像でソーシャル共有時の現地化を実現。

#### 必要な画像

| ファイル | 用途 | サイズ | 言語 |
|---|---|---|---|
| `/og-default-ja.png` | 日本語ページ全般デフォルト | 1200×630 | 日本語 |
| `/og-default-en.png` | 英語ページ全般デフォルト | 1200×630 | 英語 |
| `/og-captio-ja.png` | `/captio-alternative/` 専用 | 1200×630 | 日本語 |
| `/og-captio-alternative-en.png` | `/en/captio-alternative/` 専用 | 1200×630 | 英語 |

#### 制作ガイドライン

**共通**:
- ブランド名: 「Captio式シンプルメモ」（JA） / 「SimpleMemo」（EN）
- 主色: `#7cc4ff`（accent）、背景は `#06070b` または `#0b0f16`
- ロゴ: `/assets/img/app-icon-256.png` を使用

**JA 版**:
- メインコピー: 「自分にメール送信」または「書いて、送る」
- 副コピー: 「Captio式シンプルメモ — 起動0.3秒・送信150ms」
- フォント: Noto Sans JP

**EN 版**:
- メインコピー: "Email Yourself, Fast." または "Write. Send. Done."
- 副コピー: "SimpleMemo — The Captio alternative for iOS"
- フォント: SF Pro Display / Inter / Segoe UI（システム）

**`/captio-alternative/` 専用 (JA)**:
- メインコピー: 「Captio代替アプリ」
- 副コピー: 「3分で完了する移行手順」

**`/en/captio-alternative/` 専用 (EN)**:
- メインコピー: "The Best Captio Alternative for iOS"
- 副コピー: "Capture your thoughts. Email them to yourself."

#### NG 表現（スペック §0.2）
- ❌ 「公式後継」「Official Successor」
- ❌ 「本物の Captio」
- ❌ Captio のロゴを直接表示

#### 既存制作インフラ
リポジトリには `scripts/generate-og-images.js` と `scripts/generate-og-batch.js` が存在。OG 自動生成のテンプレートとして再利用可能。

#### 適用方法（画像入手後）
1. 4 枚を `/` 直下に配置
2. 各 paired ページの metadata で `og:image` を該当画像に切替：
   - `/index.html`、各 JA paired ページ → `/og-default-ja.png` または `/og-captio-ja.png`
   - `/en/index.html`、各 EN paired ページ → `/og-default-en.png` または `/og-captio-alternative-en.png`
3. `og:locale` と `og:locale:alternate` を Phase 1 のスタイルで配置（既存の通り）

#### 検証
- Facebook Sharing Debugger: https://developers.facebook.com/tools/debug/
- Twitter Card Validator: https://cards-dev.twitter.com/validator
- 各 paired ページ URL を入力 → 正しい画像が表示

#### 工数目安
- 制作: 4〜6 時間（デザイナー）
- 配置とコード修正: 1 時間

#### 完了条件
- [ ] 4 枚すべてが 1200×630 PNG で配置済
- [ ] 各 paired ページの `og:image` メタタグが言語別画像を指す
- [ ] Facebook Debugger 検証 OK
- [ ] Twitter Card Validator 検証 OK

---

### 3.3 `/en/captio-alternative/` MTPE 拡張（Phase 4-c）— ドラフト完成、MTPE 待ち

#### 現在の状態（2026-05-01 更新）

| 工程 | 状態 |
|---|---|
| AI 下書き作成 | **完了** — `docs/en-captio-alternative-draft.md`（2,499 words、12 セクション、全キーワード範囲内、NG 表現ゼロ） |
| 自動検証レポート | **完了** — `docs/en-captio-alternative-mtpe-review.md` |
| ネイティブ MTPE | **未実施**（spec §0.2 により公開前必須） |
| HTML 統合 | **未実施**（MTPE 完了後） |
| デプロイ後検証 | **未実施** |

#### 次にやること（cowork or オペレーター）
1. `docs/en-captio-alternative-mtpe-review.md` §7 の外注ブリーフをコピーしてレビュアーに依頼（予算 $150–200、所要 2–3h）
2. レビュー結果を反映し `docs/en-captio-alternative-draft.md` を更新
3. レビューレポート §3.4 の内部リンク（`/en/note-to-email/` など）と §3.5 の外部リンクを挿入
4. レビューレポート §3.3 のフィーチャー比較表を実測値ベースに修正（不確実な数値は削除推奨）
5. レビューレポート §5 のチェックリストに従い `/en/captio-alternative/index.html` の `<main>` 内本文を置換
6. `python3 scripts/inject_faq_schema.py` を再実行（FAQ が 9 → 12 問になるため JSON-LD を再生成）
7. CSS バージョン bump（`?v=YYYYMMDD`）
8. PR → 自動マージ → デプロイ
9. レビューレポート §6 の検証チェックリストに従い 24h / 7日 / 30日後の各検証を実施

#### Why（スペック §7.5）
英語 SEO のロングテール対策の主力ページを 1,800〜2,500 語に拡張する。現状（推定 800〜1,200 語）では英語圏の検索意図に対する深さが不足。

#### スペックが指定する構成

```markdown
# The Best Captio Alternative for iOS — SimpleMemo

[Hero: 1-paragraph elevator pitch]

## What was Captio?
[200 words: history, Ben Lenarts, 14 years, 2.3M emails/year, October 1 2024 shutdown]

## Why did Captio shut down?
[200 words: Gmail API dependency, single dev burden, Ben's public statement]

## What ex-Captio users miss most
[150 words: One-tap launch, send-and-clear, no UI clutter]

## How SimpleMemo preserves the Captio philosophy
[300 words: Same UX patterns on sustainable infrastructure]

## Feature comparison: SimpleMemo vs Captio (RIP) vs alternatives
[Table + 200 words: SimpleMemo, Captio (historical), Note to Self Mail, Email Me App, Pigeon, Drafts]

## Migration guide for ex-Captio users
[300 words: setup, email config, importing old emails as labels]

## Why a paid subscription? (transparency)
[300 words: Honesty about why Captio failed: free + Gmail = unsustainable]

## What's different about SimpleMemo's stack
[200 words: Cloudflare Workers, Resend API, AES-GCM, no Gmail dependency]

## Try SimpleMemo free for 7 days
[150 words: Free trial details, no credit card, 3/day after trial]

## FAQ
[10-15 questions, ~600 words total — match FAQPage JSON-LD already in head]

## Disclaimer
[100 words: Not affiliated with original Captio (Ben Lenarts) or Emburse Captio]
```

#### 必須キーワード（スペック §7.5.2）

| キーワード | 頻度目安（2,500 語中） |
|---|---|
| "Captio alternative" / "Captio replacement" | 5-8 回 |
| "Captio shut down" / "Captio gone" | 3-5 回 |
| "ex-Captio users" / "Captio refugees" | 2-4 回 |
| "email yourself" / "note to email" | 3-5 回 |
| "iOS productivity" | 2-3 回 |
| "spiritual successor" / "true successor" | 2-3 回 |
| "Ben Lenarts" | 2-3 回 |
| "Emburse Captio" | 1-2 回（混同回避） |

#### NG 表現
- ❌ 「公式後継」「official successor」（既存記述で `not the official successor` の否定形のみ可）
- ❌ "Better than Captio"（直接優劣比較）
- ❌ Captio ロゴ直接表示

#### OK 表現
- ✓ "spiritual successor"
- ✓ "closest replacement"
- ✓ "inspired by"
- ✓ "Captio philosophy"

#### 既存 FAQ JSON-LD との整合
i18n Phase 2 PR #171 で `/en/captio-alternative/` の既存 9 FAQ を抽出して `FAQPage` JSON-LD を埋め込み済み。コンテンツ拡張時に FAQ セクションを書き換える場合、`scripts/inject_faq_schema.py` を再実行すれば JSON-LD が自動更新される（idempotent）。

```bash
python3 scripts/inject_faq_schema.py
```

#### 翻訳プロセス（スペック §7.4）
1. 日本語下書き or 英語直接ライティング
2. 機械翻訳（DeepL Pro / Claude / GPT-4）
3. **ネイティブ後編集（MTPE） — 必須**
4. SEO キーワード密度チェック
5. NG 表現チェック

#### NG: スペック §0.2「機械翻訳のみで新規ページ公開禁止」
2025 年 Google 更新で、後編集なしの機械翻訳は「Scaled content abuse」スパム判定のリスクあり。**ネイティブ レビューを必ず通す**。

#### 推奨外注先
- **Upwork "MTPE Japanese to English"**: $0.04-0.08/word
- **Gengo / Translated.com**: $0.06-0.12/word
- **自前ネイティブ友人**: $30-50/hour 相当を PayPal 送金

#### 予算目安
2,500 語 × $0.06 = **$150〜$200**

#### 内部リンク戦略（スペック §7.5.3）
- `/en/note-to-email/` （詳細ガイド）
- `/en/about/`（**注：現在未作成**。先に作成 or リンク省略）
- `/captio-alternative/`（hreflang 経由で日本語版へ — 既に hreflang あり）
- App Store ダウンロードリンク（複数 CTA）

#### 外部リンク（dofollow OK、信頼性向上）
- `https://captio.co/`（Captio 公式残骸、引用ソース）
- Ben Lenarts の Twitter/Mastodon（敬意セクション）
- Note to Self Mail 公式（比較表）

#### フッター免責事項（スペック §7.6.2、必須）
```html
<footer>
  <div class="disclaimer">
    <small>
      SimpleMemo is an independent iOS app developed by Yurika Inc. (Japan).
      Not affiliated with the original Captio app by Ben Lenarts (which shut down October 1, 2024)
      nor with Emburse Captio (the expense management SaaS by Captio Tech SL).
    </small>
  </div>
</footer>
```

#### 検証
- 単語数: 1,800〜2,500（Word カウント）
- 必須キーワード頻度チェック（手動 grep）
- NG 表現ゼロチェック（grep）
- ネイティブ レビュー OK サイン
- Search Console での「Scaled content abuse」警告なし（公開後 7 日以内に確認）

#### 工数目安
- 翻訳: 5〜10 時間
- ネイティブ レビュー: 2〜3 時間
- HTML 統合: 1 時間

#### 完了条件
- [ ] `/en/captio-alternative/` の本文（hero 〜 FAQ 末尾）が 1,800 語以上
- [ ] 必須キーワード頻度を満たす
- [ ] NG 表現ゼロ
- [ ] ネイティブ レビュー済
- [ ] FAQPage JSON-LD が現在の Q/A と一致（`scripts/inject_faq_schema.py` 再実行）

---

## 4. 検証・モニタリング（継続作業）

### 4.1 デプロイ直後（24h 以内）

各 PR デプロイ後すぐ実施：

```bash
# 1. hreflang 双方向性チェック
# 以下 4 URL を https://technicalseo.com/tools/hreflang/ に入力
# エラー 0 件、警告 0 件であることを確認
- https://simplememofast.com/
- https://simplememofast.com/en/
- https://simplememofast.com/captio-alternative/
- https://simplememofast.com/en/captio-alternative/

# 2. JSON-LD 検証
# https://search.google.com/test/rich-results に以下を入力
- https://simplememofast.com/captio-alternative/
- https://simplememofast.com/en/captio-alternative/
# 期待: Article / BreadcrumbList / WebPage / FAQPage の 4 種すべて検出

# 3. sitemap 検証
curl https://simplememofast.com/sitemap.xml         # sitemap index
curl https://simplememofast.com/sitemap-ja.xml      # 180 URL
curl https://simplememofast.com/sitemap-en.xml      # 17 URL

# 4. robots.txt syntax
# https://technicalseo.com/tools/robots-txt/ で文法エラーなし

# 5. llms.txt 配信確認
curl https://simplememofast.com/llms.txt | grep -E "Disclaimer|License"
```

### 4.2 7 日後（インデックス進捗）

```bash
# Search Console での確認
- カバレッジ レポートで /en/* ページが「インデックス済み」状態
- 過去 28 日のクリック数・CTR・平均順位 を初期記録（ベースライン）

# Google で site: 検索
site:simplememofast.com         # 全体インデックス数
site:simplememofast.com/en/     # 英語インデックス数

# Bing で site: 検索
site:simplememofast.com
site:simplememofast.com/en/
```

### 4.3 30 日後（ベースライン記録）

スペック §12.3 が要求する数値ベースライン：

| 指標 | 値 |
|---|---|
| App Store 月インストール数 | __件 |
| Search Console 過去 28 日のクリック数 | __ |
| Search Console CTR | __% |
| Search Console 平均順位 | __ |
| GA4 過去 28 日のセッション数 | __ |
| GA4 言語別比率（page_language） | ja __% / en __% |
| ChatGPT 流入数 | 月 __件 |
| Perplexity 流入数 | 月 __件 |
| Bing Webmaster の表示回数 | __ |
| Bing クリック数 | __ |

`/docs/i18n-30day-baseline.md` を新規作成して記録。

### 4.4 90 日後 / 180 日後（数値ゲート評価）

スペック §13.3 が指定する 6 ヶ月後判定：

| 判定項目 | 条件 | アクション |
|---|---|---|
| 中国語追加 | `/en/` オーガニック検索月 500 訪問超 + 中国大陸 ICP 備案取得可能性 | 追加 / 保留判断 |
| en-US/en-GB 分割 | 英国・豪州・カナダ流入が米国の 30% 超 | 分割実装 |
| 英語版主力切替 | 米国 MAU が日本 MAU の 50% 超 + CVR 同等 | x-default を `/en/` に切替 |

判定後、**親プロジェクトの集客戦略レビュー**と連動して実施。

---

## 5. 参照データ

### 5.1 サイト固有値

```
SITE_URL              = https://simplememofast.com
GA4 PROPERTY ID       = G-EPZVZKCVQG
DOMAIN                = simplememofast.com
APP STORE JP          = https://apps.apple.com/jp/app/captio-style-simple-memo/id6758438948
APP STORE US          = https://apps.apple.com/us/app/captio-style-simple-memo/id6758438948
```

### 5.2 IndexNow 鍵

```
INDEXNOW_KEY  = dda35fda390ffabbcce681394b3a57cc
KEY_FILE_URL  = https://simplememofast.com/dda35fda390ffabbcce681394b3a57cc.txt
SCRIPT        = scripts/indexnow-notify.js (Node)
CI_WORKFLOW   = .github/workflows/seo-check.yml で `--since 1` 自動呼び出し
KEY_RECORD    = .indexnow-key
DOC           = docs/indexnow-setup.md
```

### 5.3 アクティブ ロケール（10）と URL マップ

```
ja      → /                     (root)
en      → /en/                  (主要副言語)
zh-Hans → /zh/                  (簡体中文 — ストアスタブのみ)
zh-Hant → /zh-Hant/             (繁體中文 — ストアスタブのみ)
ko      → /ko/                  (韓国語 — ストアスタブのみ)
es      → /es/                  (スペイン語 — ストアスタブのみ)
pt-BR   → /pt-BR/               (ブラジルポルトガル語 — ストアスタブのみ)
id      → /id/                  (インドネシア語 — ストアスタブのみ)
ar      → /ar/                  (アラビア語、RTL — ストアスタブのみ)
tr      → /tr/                  (トルコ語 — ストアスタブのみ)
```

### 5.4 JA↔EN ペア（5 組、双方向 hreflang あり）

```python
# scripts/i18n_config.py の JA_EN_PAIRS
("/captio-alternative/",                "/en/captio-alternative/")
("/note-to-email/",                     "/en/note-to-email/")
("/privacy",                            "/en/privacy")
("/terms",                              "/en/terms")
("/blog/ios-quick-capture-comparison",  "/en/blog/ios-quick-capture-comparison")
```

### 5.5 価格

| 地域 | 月額 | 年額 |
|---|---|---|
| 日本 | ¥500 | ¥5,000 |
| 米国 | $2.99 | $29.99 |

トライアル: 7 日間（送信無制限）→ Free プラン 1 日 3 通

### 5.6 ロケール → HTML lang / content-language マップ

```python
# scripts/i18n_config.py の LOCALE_LANG / LOCALE_CONTENT_LANG
"ja"      -> "ja"      / "ja"
"en"      -> "en"      / "en"
"zh-Hans" -> "zh-Hans" / "zh"      (note: content-language 短縮形)
"zh-Hant" -> "zh-Hant" / "zh-Hant"
"ko"      -> "ko"      / "ko"
"es"      -> "es"      / "es"
"pt-BR"   -> "pt-BR"   / "pt-BR"
"id"      -> "id"      / "id"
"ar"      -> "ar"      / "ar"      (RTL: <html dir="rtl">)
"tr"      -> "tr"      / "tr"
```

### 5.7 関連 PR（マージ済）

| PR | URL |
|---|---|
| #170 | https://github.com/simplememofast/simplememo/pull/170 |
| #171 | https://github.com/simplememofast/simplememo/pull/171 |
| #172 | https://github.com/simplememofast/simplememo/pull/172 |
| #173 | https://github.com/simplememofast/simplememo/pull/173 |
| #174 | https://github.com/simplememofast/simplememo/pull/174 |
| #175 | https://github.com/simplememofast/simplememo/pull/175 |

---

## 6. リスクウォッチ

### 6.1 PR Times 27 媒体の被リンク維持

PR Times 配信から 27 媒体に転載済み。被リンク先 URL は以下：

```
https://simplememofast.com/
https://simplememofast.com/captio/
https://simplememofast.com/captio-alternative/
```

**禁止**: これらの URL を変更・リダイレクト変更しない。リンクエクイティ毀損のリスク。

### 6.2 Captio 商標（Emburse Captio）

- 本サイトの Captio は Ben Lenarts の旧 iOS アプリ（2010〜2024）
- Emburse Captio は経費精算 SaaS、現役運営中（Captio Tech SL）
- **混同回避のため、すべての関連ページに非提携の明示が必要**

#### 既存の非提携ステートメント
- `llms.txt` の Disclaimer / Non-affiliation セクション（PR #171 で追加）
- `/blog/captioo-alternative` の Disclaimer 段落
- `/captio-alternative/` 本文中の言及

#### 新規ページ追加時のチェック
新規ページを追加する場合、必ず以下を確認：
- [ ] Captio 言及あれば、Ben Lenarts への帰属を明記
- [ ] Emburse Captio との非提携を明記
- [ ] 「公式後継」「official successor」を否定形のみで使用

### 6.3 禁止表現の再監査

スペック §0.2 の禁止表現を定期的に grep でチェック：

```bash
# プロジェクトルートで実行
grep -rEn "詐欺|パクリ|偽物|悪質|広告がうざい|広告がひどい|本物の後継|Captio 2\.0|New Captio|Captio is back" \
  --include="*.html" --include="*.md"
# 期待: 0 件
```

### 6.4 hreflang クラスタの非対称化

i18n 実装の脆弱な部分：双方向性が崩れると Google は hreflang を無視する。

#### 自動チェック
`scripts/normalize_i18n_head.py` を月 1 回実行：

```bash
python3 scripts/normalize_i18n_head.py
# 期待: "0 changed, 195 unchanged" — 何か追加/変更があれば PR 化
```

#### 注意ポイント
- 新規 paired ページを追加する場合 → `scripts/i18n_config.py` の `JA_EN_PAIRS` または `EN_ONLY_PAGES` に登録
- ペアの片方を消す場合 → `JA_EN_PAIRS` から削除し、もう片方を `EN_ONLY_PAGES` または `JA_ONLY_CLEANUP` に移動
- 再実行で hreflang が自動修正される

### 6.5 CSS キャッシュ問題の再発リスク

`assets/css/style.min.css` を更新する際、Cloudflare の `immutable` キャッシュで反映が遅れる可能性。

#### 対処
CSS を更新する PR では、必ず HTML 側の `?v=YYYYMMDD` を bump する：

```bash
# 全 HTML の ?v= を一括更新する quick command
NEW=$(date +%Y%m%d)
find . -name "*.html" -not -path "*/node_modules/*" -not -path "*/admin/*" \
  -not -path "*/scripts/*" -not -path "*/templates/*" -not -path "*/drafts/*" \
  -not -path "*/docs/*" -not -path "*/screenshots/*" -not -path "*/tools/*" \
  -not -path "*/tiktok/*" -exec sed -i '' -E "s|style\.min\.css\?v=[0-9]+|style.min.css?v=${NEW}|g" {} \;
```

---

## 7. 受入基準（プロジェクト全体）

i18n プロジェクト「完璧に完了」の最終チェックリスト。スペック §8 / §12 から抜粋。

### 7.1 Phase 1〜4 受入基準

- [x] **Phase 1**: hreflang/canonical/lang/content-language 基盤（PR #170）✓
- [x] **Phase 2**: sitemap 分割 + Schema + robots/llms（PR #171）✓
- [x] **Phase 3**: GA4 + IndexNow + CDN（PR #172）✓
- [x] **Phase 4-d**: フォント最適化（PR #173）✓
- [ ] **Phase 4-a**: 言語スイッチャー UI（§3.1 残作業）
- [ ] **Phase 4-b**: OGP 画像 4 枚（§3.2 残作業）
- [ ] **Phase 4-c**: `/en/captio-alternative/` MTPE 拡張（§3.3 — AI ドラフト完成、ネイティブ レビューと HTML 統合が残作業）

### 7.2 手動オペレーター完了

- [ ] §1.1 GA4 admin: `page_language` Custom Dimension 登録
- [ ] §1.2 Search Console: `/en/` URL-prefix プロパティ追加
- [ ] §1.3 Bing Webmaster Tools: サイト登録 + sitemap 提出
- [ ] §1.4 Bing IndexNow: API キー登録

### 7.3 インフラ整理

- [x] §2.1 IndexNow 鍵の二重化解消（`claude/i18n-cleanup-indexnow-dup` で対応済）

### 7.4 戦略整合性チェック（スペック §12.2）

- [ ] PR Times 27 媒体転載のリンク先 URL（`/captio/`、`/`）が変更されていない
- [ ] Cookie ベースの自動言語リダイレクトが実装されていない
  - 検証: `grep -rE "window.location.replace|navigator.language.*location" .`
- [ ] hreflang に地域コード（`en-US`、`ja-JP` 等）が混入していない
  - 検証: `grep -rE 'hreflang="[a-z]{2}-[A-Z]{2}"' --include="*.html"`（`pt-BR`, `zh-Hans`, `zh-Hant` のみ OK）
- [ ] AggregateRating schema が SimpleMemo について偽の評価値を持っていない
  - 検証: `/en/send-email-to-yourself/` の AggregateRating はリスト内アイテムの評価のみ（既確認）

### 7.5 監視ベースライン

- [ ] §4.3 30 日後の数値ベースラインを `/docs/i18n-30day-baseline.md` に記録

---

## 8. クイックコマンド集

### 8.1 i18n 関連スクリプトの実行

```bash
# 1. ヘッド要素の正規化（hreflang/canonical/lang/content-language）
python3 scripts/normalize_i18n_head.py
# オプション:
python3 scripts/normalize_i18n_head.py --dry-run     # 変更プレビュー
python3 scripts/normalize_i18n_head.py --no-auto     # 明示リストのみ

# 2. sitemap 再生成
python3 scripts/generate_sitemap.py
python3 scripts/generate_sitemap.py --dry-run

# 3. FAQPage JSON-LD 再注入
python3 scripts/inject_faq_schema.py

# 4. GA4 page_language 注入（既に注入済の場合は no-op）
python3 scripts/inject_ga4_page_language.py

# 5. IndexNow 通知
node scripts/indexnow-notify.js          # 過去 1 日の更新を通知（CI でも実行中）
node scripts/indexnow-notify.js --all    # 全 URL を通知
node scripts/indexnow-notify.js /path    # 特定 URL のみ
```

### 8.2 i18n 静的検証

```bash
# 全 HTML のロケール / canonical / hreflang クロスチェック
python3 -c "
import re, sys
sys.path.insert(0, 'scripts')
from i18n_config import LOCALE_LANG, JA_EN_PAIRS, TOP_CLUSTER, absolute_url
from pathlib import Path
ROOT = Path('.')
errors = []
for f in ROOT.rglob('*.html'):
    if any(p in {'node_modules','admin','drafts','docs','scripts','tools','templates','screenshots','tiktok'} for p in f.parts):
        continue
    text = f.read_text()
    has_cl = 'http-equiv=\"content-language\"' in text
    has_canon = 'rel=\"canonical\"' in text
    if not has_cl and 'lang=' in text:
        errors.append(f'{f}: missing content-language')
    if not has_canon and 'lang=' in text:
        errors.append(f'{f}: missing canonical')
print(f'errors: {len(errors)}')
for e in errors[:20]: print(e)
"
```

### 8.3 本番検証

```bash
# 1. sitemap 配信確認
curl -sI https://simplememofast.com/sitemap.xml | grep -iE "(http/|content-type)"
curl -sI https://simplememofast.com/sitemap-ja.xml
curl -sI https://simplememofast.com/sitemap-en.xml

# 2. CSS バージョン確認
curl -sI 'https://simplememofast.com/assets/css/style.min.css?v=20260501' | grep -iE "(http/|cf-cache)"
# cf-cache-status: HIT が出るのが正常（初回は MISS）

# 3. GA4 page_language 注入確認
curl -s https://simplememofast.com/captio-alternative/ | grep -c "page_language"
# 期待: 1

# 4. content-language meta カバレッジ
for U in / /en/ /captio-alternative/ /blog/best-memo-apps-2026 /vs/notion/ /devlog/ /faq /legal; do
  CL=$(curl -s "https://simplememofast.com$U" | grep -o 'http-equiv="content-language"[^>]*' | head -1)
  echo "$U: ${CL:-MISSING}"
done

# 5. FAQPage JSON-LD
for U in /captio-alternative/ /en/captio-alternative/; do
  curl -s "https://simplememofast.com$U" | grep -o '"@type":"FAQPage"[^,]*' | head -1
done

# 6. robots.txt の AI クローラー allowlist
curl -s https://simplememofast.com/robots.txt | grep -E "(GPTBot|ClaudeBot|PerplexityBot|Bingbot|Applebot)"
```

### 8.4 各種ツールリンク（クリップボード用）

```
- Merkle hreflang Tester:    https://technicalseo.com/tools/hreflang/
- Google Rich Results Test:  https://search.google.com/test/rich-results
- Schema.org Validator:      https://validator.schema.org/
- Robots.txt Validator:      https://technicalseo.com/tools/robots-txt/
- W3C XML Sitemap Validator: https://www.xml-sitemaps.com/validate-xml-sitemap.html
- Facebook Sharing Debugger: https://developers.facebook.com/tools/debug/
- Twitter Card Validator:    https://cards-dev.twitter.com/validator
- PageSpeed Insights:        https://pagespeed.web.dev/
- Lighthouse:                https://developer.chrome.com/docs/lighthouse
```

---

## 9. このドキュメントの保守

- 残作業を 1 つ完了したら、対応するチェックボックスを `[x]` にし、§7 受入基準も更新
- 大きな変更（新ロケール追加など）があれば §0.1 のサイト概要から更新
- §4 のモニタリング数値は時系列で蓄積（別ドキュメント `/docs/i18n-30day-baseline.md` 推奨）

---

**END OF DOCUMENT**
