# SEO Audit Report — simplememofast.com

**Audit Date**: 2026-03-08
**Auditor**: Technical SEO Engineer (automated)
**Site Type**: Static HTML, bilingual (JA/EN), Cloudflare Pages

---

## 現状サマリー

| 項目 | 状態 | 詳細 |
|------|------|------|
| フレームワーク | なし | 純粋な静的HTML (158ファイル) |
| ビルドシステム | なし | 手動HTML、Cloudflare Pages直デプロイ |
| i18n方式 | JS DOM切替 | `lang.js` + `data-lang` 属性 + `?lang=` パラメータ |
| canonical | 145/158 | 概ね正しいが13ページ未確認 |
| hreflang | 2/158 | **致命的欠落** — ホームページのみ |
| sitemap | 155 URL | 有効だがlastmod一括更新 |
| robots.txt | 良好 | AI crawler制御適切 |
| 構造化データ | 良好 | WebSite, Person, SoftwareApp, Article, BreadcrumbList |
| IndexNow | 未実装 | キーなし |
| 内部リンク | 基本的 | ナビ+フッターのみ、関連記事なし |
| 監視 | なし | CI/検証スクリプトなし |

---

## 問題一覧（優先度順）

### Critical (即修正)

1. **`?lang=` パラメータによる重複URL生成**
   - `lang.js` が全内部リンクに `?lang=ja` or `?lang=en` を付与
   - Googlebot JS実行時に全リンクがパラメータ付きURLに変換される
   - 同一コンテンツが `/?lang=ja` と `/` で重複
   - **修正**: `?lang=` をリンクに付与する処理を削除、localStorageのみで言語永続化

2. **hreflang が156ページで欠落**
   - ホームページ2ページのみ実装
   - JA専用ページにも自己参照 `hreflang="ja"` がない
   - **修正**: 全JA専用ページに `hreflang="ja"` 自己参照を追加

### High (1週間以内)

3. **canonical 未設定ページ (13ページ)**
   - 一部ページにcanonicalタグがない
   - **修正**: 全ページに self-canonical を追加

4. **sitemap の trailing slash 不統一**
   - blog/devlog: スラッシュなし、vs/guides/methods: スラッシュあり
   - **修正**: ファイル構造に合わせた正規URLで統一

5. **IndexNow 未実装**
   - 更新通知が検索エンジンに自動送信されない
   - **修正**: キー生成 + デプロイ時送信スクリプト

### Medium (1ヶ月以内)

6. **内部リンク不足**
   - ブログ記事に関連記事セクションなし
   - VS/guides/methodsの相互リンク弱い
   - **修正**: 関連コンテンツ自動検出・リンク挿入スクリプト

7. **lastmod 一括日付**
   - 58ページが同じ日付 → シグナル価値低下
   - **修正**: ファイル更新日時ベースのsitemap生成

8. **監視なし**
   - canonical/hreflang不整合を検知できない
   - **修正**: CI/検証スクリプト作成

---

## 推奨方針

### URL設計: 現行維持 + ?lang= 廃止

| 案 | メリット | デメリット | 推奨 |
|----|---------|-----------|------|
| 現行維持 (`/` = JA, `/en/` = EN) | 破壊的変更なし | EN版は2ページのみ | **○ 採用** |
| `/ja/` `/en/` 移行 | SEO理想形 | 158ファイル移動、全リダイレクト必要 | × 過剰 |
| `?lang=` 継続 | 変更不要 | 重複URL、クロールバジェット浪費 | × 不採用 |

**決定**: 現行のルートJA + `/en/` EN構造を維持。`?lang=` パラメータは廃止し、localStorageのみで言語切替を永続化。

### 破壊的変更

- `?lang=` パラメータの廃止: **低リスク** — `?lang=` 付きURLにブックマーク/外部リンクがある場合も、lang.jsがlocalStorageから読むため機能は維持される。Googleはパラメータなしの正規URLをインデックスする。

### ロールバック方針

全変更はgitで管理。各Phase完了時にコミット。問題発生時は `git revert` で即座にロールバック可能。

---

## 実装順

1. **Phase 2A**: lang.js修正 (`?lang=` 廃止)
2. **Phase 2B**: hreflang一括追加 (全ページ)
3. **Phase 2C**: canonical確認・修正
4. **Phase 2D**: sitemap自動生成スクリプト
5. **Phase 3A**: IndexNow実装
6. **Phase 3B**: 内部リンク自動化
7. **Phase 3C**: 構造化データ確認・補完
8. **Phase 4**: 検証スクリプト + CI
