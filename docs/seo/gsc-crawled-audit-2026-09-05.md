# GSC「クロール済み - インデックス未登録」65件の確認と修正

確認日: 2026-09-05 JST。入力はオーナー提示の65 URL（レポート最終更新2026-08-28、検証開始2026-08-27、失敗2026-08-29）。作業開始時のmainは `5d1ade21`。

## HTTP確認で分かったこと

65件をGETで取得し、各転送を個別に追跡した。結果は**直接200が11件、1回の301で正規ページへ到達するものが54件**。最終65レスポンスは200で、到達URLとHTMLのcanonicalが一致し、meta robots / X-Robots-Tagによるnoindexはなかった。URL別の入力・転送先・初回HTTPステータスは [全65件のケース](gsc-crawled-cases-2026-09-05.json) に保存している。

これはHTTPの現況であり、Googleの登録状態ではない。Search ConsoleのURL検査APIやGoogleが選択したcanonicalは取得していない。したがって、11件の除外理由を「品質が原因」と断定したり、54件の転送先がGoogleに登録済みだと断定したりはしない。

| 直接200の正規URL | 日本語本文の文字数（概数） | ホームからのリンク距離 | サイト内リンク元ページ数 |
|---|---:|---:|---:|
| /glossary/e2e-encryption/ | 5,662 | 2 | 9 |
| /vs/roam-research/ | 3,621 | 2 | 8 |
| /use-cases/meeting-notes/ | 3,869 | 2 | 6 |
| /vs/todoist/ | 3,845 | 2 | 7 |
| /blog/instant-capture-workflow | 5,469 | 2 | 10 |
| /devlog/day1 | 10,827 | 2 | 8 |
| /blog/freelance-memo-management | 4,582 | 2 | 4 |
| /blog/business-memo-apps-2026 | 6,427 | 2 | 7 |
| /guides/draft-autosave/ | 2,029 | 2 | 10 |
| /vs/captioo/ | 4,171 | 2 | 6 |
| /glossary/timeboxing/ | 3,584 | 2 | 9 |

文字数は修正前のHTMLからscript/style、ナビ、フッター、英語DOMなどを除外した参考値で、文字数を品質の合否には使っていない。リンク元はJA/ENサイトマップ掲載ページの日本語表示リンクを走査し、同一ページは1つと数えた（day1の自己リンクを含む）。本文は静的HTMLに存在し、JSで初めて取得する構成ではなかった。

初回の並列取得では11件の最終レスポンスが429になった。間隔を2秒ずつ空けた再取得ではすべて200に到達した。Cloudflareのread-only確認では全パスを対象とする100リクエスト/10秒/IPのレート制限が存在した。今回の監査リクエストによる一時的な制限と整合するが、これだけでGooglebotの失敗原因とは判定しない。設定は変更していない。

## 行った修正

URL正規化は本番で既に機能していた。重複URLを改めて200にしたり、登録数を見かけ上減らすために正規ページへnoindexを付けたりせず、確認できた本文の問題を修正した。

- **Todoist比較**: 「クイック追加はプロジェクト選択が必須」という誤りを公式ヘルプに合わせて訂正。未計測の起動時間・根拠のない引用と比較上の断定を撤去。Proの料金は確認日、課金周期、地域差と公式出典を付けて更新。送信先認証を含めて未検証の自動連携を保証せず、会議のメモからタスクを手動で抽出する具体例に変更。
- **Roam Research比較**: 公開根拠のない「4か月使った」という利用体験、固定の習熟期間やノート件数を前提にする説明を修正。運営者の利害関係と未計測の範囲を示し、メールから日次ノートへ手動転記する例と、直接Roamへ記録する場合の利点を追加。
- **E2E暗号化**: 前方秘匿性と侵害後の回復を区別。「受信者だけが共通鍵を持つ」「過去と未来の両方が無条件に安全」という説明を訂正。4段階の説明を概念の整理として位置付け、HTTPS API接続からメール配送全体の暗号化を推定しない説明に変更。
- **即キャプチャ**: 出典のない「平均23秒で忘れる」、3秒を超えると使わなくなるという断定、起動時間と入力・配送時間の混同を修正。1行メモの型と処理済みメールの扱いを追加。

変更は日本語・英語の表示に反映。可視FAQからFAQPageを再生成し、実際に本文を変更した4ページのみdateModified・可視更新日・サイトマップlastmodを更新した。

## 検証

- `node scripts/seo-check.js`: 269 HTML、0 errors / 0 warnings。
- `node scripts/check-url-normalization.mjs`: 429件成功（最新mainへのrebase後）。65件の実例を追加し、転送先HTMLの存在・自己canonical・noindexなし・JAサイトマップ掲載も検査する。
- `node scripts/check-internal-redirects.mjs`: 内部リンク・メタデータ・サイトマップの参照先は直接到達。
- `node scripts/check-script-tags.mjs`: HTML要素とscriptの開閉は整合。
- `python3 scripts/inject_faq_schema.py --check`: 生成対象146面のFAQPageと可視FAQが一致。
- 価格・定数、アセットのバージョン、content-graph、git diffの空白検査を実施。
- 変更4ページを375px / 1440px、JA / ENの計16条件でブラウザ確認。横方向のはみ出し、H1重複、言語切替の不一致がないことを確認。

## GSCで確認する対象

今回の変更後、まず4つの正規URLをURL検査で確認する。Googleが選択したcanonicalが別URLならその相手との内容の違いを評価し、まだ未登録なら変更内容を踏まえて再クロールをリクエストする。旧`.html` / `?lang=` / 統合済みURLの54件は転送元として扱う。すべてを個別にインデックス登録することは目標にしない。

この修正は掲載内容の正確性と再発防止を改善するもので、インデックス登録の完了を保証するものではない。次の評価ではHTTP検査結果とSearch Consoleの登録判定を区別する。

## 参照した一次情報

- [Google: ページ インデックス登録レポート](https://support.google.com/webmasters/answer/7440203?hl=ja)
- [Google: 重複URLの正規化](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Todoist: インボックスとプロジェクト](https://www.todoist.com/help/todoist/features/whats-the-difference-between-the-inbox-and-a-project-d6dSLqAM)
- [Todoist: Pro料金改定](https://www.todoist.com/help/todoist/billing/todoist-pro-pricing-update-in-2025-bxBvHZuJZ)
- [Signal: Double Ratchet仕様](https://signal.org/docs/specifications/doubleratchet/)
