# Content Linking Rules — simplememofast.com

## 最重要ページ (link equity集中先)

1. `/captio-alternative/` — Captio代替比較 (ブランドキーワード)
2. `/note-to-email/` — 自分にメール送信 (機能キーワード)
3. `/vs/` — メモアプリ比較ハブ (比較キーワード)
4. `/` — ホームページ (ブランドシグナル)
5. `/blog/` — ブログハブ (コンテンツ権威)

## 自動リンクルール

`scripts/add-internal-links.js` が以下のルールで関連リンクを自動挿入:

| ソースページ | リンク先 |
|-------------|---------|
| Blog記事 | captio-alternative, note-to-email, vs/, guides/ |
| VS比較ページ | captio-alternative, note-to-email, FAQ, guides/ |
| Guides | methods/, blog/, FAQ, note-to-email |
| Methods | guides/, blog/, vs/ |
| Use Cases | captio-alternative, guides/, blog/, vs/ |
| Glossary | methods/, blog/, FAQ |
| DevLog | captio-alternative, blog/, vs/ |

## 孤立ページ対策

`scripts/add-internal-links.js` の `--orphan` レポートで孤立ページを検出。

孤立ページが見つかった場合:
1. blog/index.html の記事一覧に追加
2. 関連ページからのコンテキストリンクを追加
3. ナビゲーションのドロップダウンに含める

## 手動リンク推奨

以下のコンテキストで手動リンクを追加すると効果的:

- **ブログ記事の本文中**: 関連するVS比較ページへのアンカーリンク
- **VS比較ページ**: 「Captioからの移行ガイド」→ captio-alternative
- **FAQ回答文中**: 関連ガイドやメソッドへのリンク
- **ホームページ**: 新しい高品質コンテンツへの導線
