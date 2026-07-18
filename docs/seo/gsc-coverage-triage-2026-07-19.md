# GSCインデックス登録カバレッジ 3バケット対応レポート — 2026-07-19

データソース: GSCページインデックス登録レポート3バケット（最終更新 2026-07-10、検証不合格 07-11）= 07-16分析（gsc-analysis-2026-07-16.md）と同一データセット。本レポートはその**修正実行編**。07-16時点で「対応不要」と判定した残像分は再検証し、コードで直せる残件をすべて本PRで実施した。

## 1. 結論サマリ

| バケット | 件数 | 診断 | 本PRの対応 |
|---|---|---|---|
| ページにリダイレクトがあります | 79 | **全件が設計どおりの301/308**。内訳: `http→https` / `www→apex` / `.html→拡張子なし` / `?lang=`剥がし / `/en→/en/` / 旧slug統合（captio-alternatives-comparison→/captio-alternative/ 等、全て_redirects記載の意図的統合）。カテゴリ代表12URLをライブ実測で確認 | **修正対象なし**（リダイレクトが正しい以上「検証不合格」が続くのはGSCの仕様表示） |
| 見つかりませんでした（404） | 7 | 捏造スラッグ6件（07-02/07-16検証済み、ネガティブSEO攻撃）+ `/cdn-cgi/l/email-protection`（robots.txt Disallow済み） | **対応なし**（404維持・リダイレクト不可・リンク元調査/disavow追跡スキップ = 07-02オーナー決定どおり） |
| クロール済み - インデックス未登録 | 86 | 変種URL約60件（`?lang=`/`.html`/`?ref=`/`?q=`等 → canonical+301で統合進行中、クロール日付は大半が対策前の残像）+ 実在ページ約26件（技術欠陥ゼロを実査） | **弱被リンク6ページへ内部リンク12本配線** + `/en/vs/notion//` 301追加 |

## 2. 実測検証（今回新規実施分）

- **内部リンク全数監査**: 全HTML 10,465本を走査 → 非正規リンク **0件**（内部`.html`リンク0 / `?lang=`リンク0 / `http://`0 / `www.`0 / 二重スラッシュ0 / 存在しないルートへのリンク0）。リダイレクトバケットのURLをサイト内部から再発見させる経路は存在しない
- **sitemap 3ファイル（ja 185 / en 39 / locales 8 = 232URL）**: 301/404化したURLの掲載 **0件**（memo-shuukan-tips等の統合済み旧slugはすべて除去済みを確認）。ライブ照合は約115URLで200確認、残りはCloudflareレート制限（429）のためリポジトリのファイル実在検証で代替
- **実在未登録ページの抜き取り実査9ページ**（obsidian-iphone-memo, voices, second-brain, commute, draft-autosave, icloud, e2e-encryption, line-keep-migration, en/vs/notion）: canonical・noindex・sitemap掲載すべて正常
- **`/en/vs/notion//`**（二重スラッシュ）: ページ側スキーマURLは#369で修正済みだが、URL自体はまだ200で重複配信 → `_redirects`に301を追加（本PR）
- `?q={search_term_string}`: SearchActionスキーマは撤去済み（3/21クロールの残像）。`?ref=`/`?from=`はrobots.txtでDisallow済み

## 3. 実施内容（本PR）

**内部リンク配線 12本/12ファイル**（ターゲット=クロール済み未登録の実在ページで被リンク≤3のもの全部）:

| ターゲット（被リンク 前→後） | ソース（すべて凍結対象外） |
|---|---|
| /blog/memo-app-free-guide（1→3） | blog/how-to-choose-memo-app, use-cases/students |
| /vs/captioo/（1→3） | blog/captioo-alternative, blog/captio-discontinued |
| /blog/second-brain-capture-first（2→4） | glossary/pkm, use-cases/ideas |
| /vs/google-keep-vs-apple-notes/（2→4） | vs/google-keep, vs/apple-notes |
| /use-cases/commute/（3→5） | blog/morning-memo-routine, use-cases/work-tasks |
| /voices/（3→5） | about, faq |

凍結順守: リタイトル11ページ（#367 + /obsidian/ + /vs/notion-vs-evernote/）に加え、A系統CTRモニタ対象の可能性がある methods/second-brain・glossary/second-brain もソースから除外した（代替として pkm と ideas を使用。ideasは#395編集実績=非凍結確定）。

- `_redirects`: `/en/vs/notion//  /en/vs/notion/  301` を追加
- 既存書式に整合（pill型related-links / internal-links、dual-DOMページは`data-lang`スパン2言語、プレーンJAページは単一スパン）
- 検証: `node scripts/seo-check.js` → **0 errors**（176警告=#395時点の既存ベースラインと同数、新規増加なし）

## 4. マージ後（自動実行）

- **IndexNow送信**: 編集12ページ + ターゲット6ページ + /en/vs/notion/ の計19URL
- デプロイ後ライブ確認: 挿入リンクの配信・`/en/vs/notion//`の301化（Pagesの`_redirects`が二重スラッシュにマッチしない場合は canonicalによる統合継続 = 実害なし、を記録）

## 5. オーナーアクション（最小）

1. **GSC再検証は「クロール済み - インデックス未登録」バケットのみ**押す価値あり（実在ページの再クロール誘発）。「リダイレクトあり」「404」は仕様どおりのため再検証しても不合格継続が正常 — **押さなくてよい**
2. URL検査リクエスト: #397依頼書（Tier1×3+Tier2×4）の運用継続。本件での追加なし
3. 捏造404のリンク元調査・disavow追跡: **実施しない**（07-02決定の再確認。GSCに手動対策が表示された場合のみ再浮上）

## 6. 評価タイミング

7/29-30の凍結明け評価と合流。被リンク補強6ページのインデックス登録状況は8月第1週のGSCカバレッジで確認する。

## 7. 事後検証（マージ後 同日実施）

- PR #400 は作成後約20秒で自動マージ、デプロイは約15秒で反映を確認
- 挿入リンクのライブ配信を確認: `/about/` → /voices/、`/vs/google-keep/` → /vs/google-keep-vs-apple-notes/（キャッシュバスター付きで実測）
- **IndexNow 19URL送信 → HTTP 200**
- **`/en/vs/notion//` の301は不成立（200のまま）**: Cloudflareゾーンの URL正規化が `//` をルーティング前に `/` へ潰すため、Pages `_redirects` では二重スラッシュのソースパスにマッチできない。よって発火しない死にルールを撤去（本コミット）。ページ側 canonical（`/en/vs/notion/`）は正しく、このURLの「クロール済み - インデックス未登録」は**重複＋正規URL指定の正しい終着状態** — 追加対応不要。ゾーンのSingle Redirects（残り2枠）を消費する価値もなし
