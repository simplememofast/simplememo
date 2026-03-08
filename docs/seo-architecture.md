# SEO Architecture — simplememofast.com

## URL設計

```
/                          → JA ホームページ (primary)
/en/                       → EN ホームページ
/blog/[slug]               → ブログ記事 (JA, data-lang切替)
/vs/[app-name]/            → 比較ページ (JA)
/guides/[provider]/        → メール設定ガイド (JA)
/methods/[method]/         → メソッド解説 (JA)
/use-cases/[persona]/      → 活用事例 (JA)
/glossary/[term]/          → 用語集 (JA)
/devlog/[slug]             → 開発ログ (JA)
/captio-alternative/       → Captio代替 (JA)
/note-to-email/            → メール送信方法 (JA)
```

### 言語切替方式

**Before (問題あり):**
- `lang.js` が全内部リンクに `?lang=ja` / `?lang=en` を付与
- 同一URLが `?lang=` 違いで複数バージョン生成
- 検索エンジンに重複URLを配信

**After (修正済み):**
- `lang.js` は `localStorage` のみで言語永続化
- `?lang=` パラメータはURL表示・リンクに付与しない
- 既存の `?lang=` 付きURLでアクセスした場合、吸収してクリーンURLに書き換え
- 検索エンジンはパラメータなしの正規URLのみインデックス

## hreflang設計

- JA専用ページ: `<link rel="alternate" hreflang="ja" href="...">` (自己参照)
- ホームページ: JA/EN相互参照 + `x-default`
- 今後ENページ追加時: 対応するJAページに相互hreflangを追加

## canonical設計

- 全ページに self-canonical
- パラメータ付きURLは正規URLのみ指定
- ブログ: trailing slashなし (`/blog/slug`)
- ディレクトリ: trailing slashあり (`/vs/notion/`)

## 構造化データ

| ページ種別 | スキーマ |
|-----------|---------|
| ホーム | WebSite, Organization, Person, SoftwareApplication, BreadcrumbList, Speakable |
| ブログ | Article, BreadcrumbList, Speakable |
| VS比較 | Article, BreadcrumbList, Speakable |
| ガイド | Article, BreadcrumbList, Speakable |
| 用語集 | DefinedTerm, BreadcrumbList |
| FAQ | WebPage, BreadcrumbList |
| About | AboutPage |

## 内部リンク

自動挿入される関連コンテンツブロック:

| ページ種別 | リンク先 |
|-----------|---------|
| Blog | captio-alternative, note-to-email, vs/, guides/ |
| VS | captio-alternative, note-to-email, FAQ, guides/ |
| Guides | methods/, blog/, FAQ, note-to-email |
| Methods | guides/, blog/, vs/ |
| Use Cases | captio-alternative, guides/, blog/, vs/ |
| Glossary | methods/, blog/, FAQ |
| DevLog | captio-alternative, blog/, vs/ |

## 自動化スクリプト

| スクリプト | 用途 | タイミング |
|-----------|------|-----------|
| `scripts/generate-sitemap.js` | sitemap.xml生成 | デプロイ前 |
| `scripts/add-hreflang.js` | hreflangタグ一括追加 | 新ページ追加時 |
| `scripts/add-internal-links.js` | 関連リンク一括追加 | 新ページ追加時 |
| `scripts/seo-check.js` | SEO検証 | CI (push時自動) |
| `scripts/indexnow-notify.js` | IndexNow通知 | デプロイ後 (CI自動) |

## 新規ページ追加フロー

1. HTMLファイルを作成 (canonical, meta, OG, JSON-LD含む)
2. `node scripts/add-hreflang.js` → hreflangタグ追加
3. `node scripts/add-internal-links.js` → 関連リンク追加
4. `node scripts/generate-sitemap.js` → sitemap更新
5. `node scripts/seo-check.js` → 検証
6. git commit & push → CI自動実行 → Cloudflare Pagesデプロイ
7. CI: IndexNow自動通知
