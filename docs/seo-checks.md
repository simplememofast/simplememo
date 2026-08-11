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

## sitemap 実配信ヘッダの確認（2026-08-11）

外部のテキスト系フェッチャーが /sitemap.xml を5回連続「binary data」扱いした事象を受け、
実配信レスポンスを確認した。結論: **配信設定に問題なし・是正不要**。

### 実測マトリクス（2026-08-11・HTTP/2・IADエッジ）

| リクエスト | Content-Type | Content-Encoding |
|---|---|---|
| HEAD・Accept-Encoding なし・通常UA / GPTBot / bingbot | application/xml; charset=utf-8 | なし（非圧縮） |
| HEAD・`--compressed`（gzip,br 受諾）・3UAとも | application/xml; charset=utf-8 | br |
| GET・Accept-Encoding なし | application/xml; charset=utf-8 | なし。本文は `<?xml` で始まる正常な sitemapindex（475B・ja/en/locales の3子sitemapを参照） |
| GET・`Accept-Encoding: gzip` のみ | application/xml; charset=utf-8 | gzip（申告どおり。br は返さない。gunzip で元XMLと一致） |

- sitemap-ja.xml / sitemap-en.xml / sitemap-locales.xml も同一の Content-Type で配信
- robots.txt に `Sitemap: https://simplememofast.com/sitemap.xml` 宣言あり
- `x-content-type-options: nosniff` 付きだが Content-Type が正しいため影響なし
- `_headers` L37-51 の定義どおりに配信されていることを確認

### 「binary data」事象の解釈

サーバは Accept-Encoding を申告したクライアントに**だけ**圧縮（br/gzip）を返しており、
HTTP の content negotiation として正しい挙動。よって観測された「binary data」は、
フェッチャー側が圧縮を受諾しながら復号せずに生バイトを判定した（または経路上の
プロキシが復号を妨げた）クライアント側の事象で、`_headers` / Cloudflare 設定の
不備ではない。Googlebot / bingbot / 主要AIクローラは圧縮を正しく復号するため、
検索・AI索引への実害はない。

### 再検証コマンド

```bash
curl -sI https://simplememofast.com/sitemap.xml                  # 非圧縮。content-type を確認
curl -sI --compressed https://simplememofast.com/sitemap.xml     # content-encoding: br が返る（正常）
curl -s  https://simplememofast.com/sitemap.xml | head -c 60     # 平文XMLが届く
curl -s -H 'Accept-Encoding: gzip' -o /tmp/sm.gz \
  https://simplememofast.com/sitemap.xml && file /tmp/sm.gz      # gzip: 申告どおりの圧縮
```

### GSC / Bing での sitemap 受理状況の確認手順

**Google Search Console**
1. https://search.google.com/search-console → プロパティ simplememofast.com
2. 「サイトマップ」→ `sitemap.xml` のステータスが「成功しました」であること、
   検出URL数が `scripts/generate_sitemap.py` の出力件数と大きく乖離していないこと
3. 乖離時は「インデックス作成 > ページ」で除外理由の内訳を確認

**Bing Webmaster Tools**（未登録 — C8 のサイト所有権確認後に実施）
1. https://www.bing.com/webmasters → サイト追加・所有権確認（BingSiteAuth.xml の配置は
   C8 作業。手順は docs/indexnow-setup.md に追記予定）
2. Sitemaps → `https://simplememofast.com/sitemap.xml` を送信
   （index 配下の sitemap-ja / sitemap-en / sitemap-locales は自動で追跡される）
3. 「送信済み / インデックス済み」比率を上記の月次チェックに組み込む
   （ChatGPT 検索の索引は Bing 系依存のため重要）
