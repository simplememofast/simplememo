# SEO Checks — simplememofast.com

## 検証スクリプト

```bash
node scripts/seo-check.js
```

### チェック項目

| チェック | エラー/警告 | 説明 |
|---------|-----------|------|
| Title タグ | ERROR: 欠落 / WARNING: 70文字超 | 全ページに必須 |
| Meta description | ERROR: 欠落 / WARNING: 160文字超 | 全ページに必須 |
| Canonical タグ | ERROR: 欠落 | 全indexページに必須 |
| Hreflang タグ | WARNING: 欠落 | 言語指定に必要 |
| 構造化データ | WARNING: JSON-LDなし | SEOシグナル |
| OG タグ | WARNING: og:titleなし | SNS共有品質 |
| Viewport | ERROR: 欠落 | モバイル対応必須 |
| ?lang= パラメータ | WARNING: HTMLソースにあり | 重複URL原因 |
| 非推奨スキーマ | ERROR: HowTo検出 | Google非対応 |
| Sitemap | ERROR: noindexページ含む | インデックス品質 |
| robots.txt | WARNING: Sitemap未宣言 | クロール最適化 |
| 孤立ページ | WARNING: 内部リンクなし | 発見性低下 |

### 終了コード

| コード | 意味 |
|--------|------|
| 0 | 全チェック合格 |
| 1 | 警告あり (デプロイ可) |
| 2 | エラーあり (修正推奨) |

## CI統合

`.github/workflows/seo-check.yml` で自動実行:
- Push時 / PR時に検証
- main push時はIndexNow通知も実行

## 定期チェック推奨

月1回、以下を手動確認:
- Google Search Console のカバレッジレポート
- Bing Webmaster Tools のインデックス状況
- `node scripts/seo-check.js` の結果レビュー
- 孤立ページの有無確認
