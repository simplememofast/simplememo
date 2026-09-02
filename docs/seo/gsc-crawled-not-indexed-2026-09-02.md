# GSC「クロール済み - インデックス未登録」65件 の追跡調査（2026-09-02）

対象レポート: ページのインデックス登録 →「クロール済み - インデックス未登録」
最終更新日 2026/08/28 / 該当 65件 / **検証: 失敗（開始 2026/08/27、不合格 2026/08/29）**

前回調査: `gsc-crawled-not-indexed-2026-08-27.md`（64件）。その前は 08-20（63件）、08-11（68件）。

## 結論を先に

**検証を落としたのは変種URLではなく、正規URL `/glossary/e2e-encryption/` だった。**
65件のうち08/27以降にクロールされたURLはこの1件だけ（08/29）で、再評価の結果も
未登録のまま → その時点で検証が不合格になっている。変種52件の再クロールは、検証が
そこへ届く前に打ち切られた。

つまり「変種の301が効いているか」は今回の失敗と無関係で（08-27に実測済み、今回も再実測して
全件301）、**検証を通す鍵は正規URL11件の側にある。**その11件はいずれも
「同じ意図をサイト内の別ページが受けていて、薄い方として落とされている」か
「検索需要そのものが無い」かのどちらかだった。

| 区分 | 件数 | 状態 |
|---|---:|---|
| クエリ付き変種（`?lang=` 36 / `?q=` 1）と `.html` 変種（16） | 52 | 全件301（今回も本番で再実測）。最終クロールは 2026/03〜06 で、301実装（07-07）後に一度も再クロールされていない |
| 301済み統合元（`memo-app-free-guide` / `line-keep-migration`） | 2 | 08-09/08-11に301化。再クロール待ち |
| 正規URL・前回からの継続 | 8 | `/vs/todoist/` `/blog/instant-capture-workflow` `/devlog/day1` `/blog/freelance-memo-management` `/blog/business-memo-apps-2026` `/guides/draft-autosave/` `/vs/captioo/` `/glossary/timeboxing/` |
| 正規URL・**今回の新顔** | 3 | `/glossary/e2e-encryption/`（08/29）`/vs/roam-research/`（08/22）`/use-cases/meeting-notes/`（08/22） |
| 前回から消えた | 2 | `/roadmap/`（08-27のfooter追加が効いた。08/30に初表示・順位49）`/vs/upnote/`（21日で159表示・順位8.3、掲載中） |

## なぜ検証が2日で落ちたか

GSCの検証は、対象URLを順に再クロールし、**1件でも同じ状態のままなら不合格**にする。
今回のリストで「前回のクロール」が検証開始（08/27）以降なのは `/glossary/e2e-encryption/`
（08/29）だけで、不合格日と一致する。このページは

- 08-09スナップショット（07-11〜08-07）で 14表示・平均順位 8.8 ＝ **掲載されていた**
- BigQuery（08-10〜08-30）で 3表示・順位 17.3、最後の表示は 08-22
- 08/29 の再クロールで未登録に確定

という経路で落ちている。`/vs/roam-research/`（4表示→2表示）`/use-cases/meeting-notes/`
（5表示→0）も同じ形で、いずれも「低ボリュームで掲載されていたページが、再評価で
落とされた」ケース。

**検証ボタンは、正規URL11件が全部インデックスされるか消えるまで、押しても必ず落ちる。**
変種の301を確認する経路は、検証の中では正規URLの後ろに並んでいる。

## 正規URL11件の9月再判定（前回の「9月の実測で再判定」の期日）

BigQuery `yurika-simplememo.searchconsole.searchdata_url_impression`（08-10〜08-30、21日）。
前回までの表と違い、今回は全件が同じ窓。

| URL | 表示（21日） | 同じ意図を受けているページ（21日の表示） | 判定 |
|---|---:|---|---|
| `/glossary/e2e-encryption/` | 3 | `/blog/memo-app-security-comparison` 489、`/blog/memo-app-encryption-comparison` 584（「e2ee」「エンドツーエンド暗号化」系のクエリはすべてこの2記事が受けている） | **本文を厚くした**（下記） |
| `/use-cases/meeting-notes/` | 0 | `/blog/meeting-memo-template` 801（「meeting notes」「議事録」系はすべてこちら） | **役割分担を明記して住み分けた**（下記） |
| `/vs/roam-research/` | 2 | `/methods/second-brain/` 814（「roam research 使い方」が1件ここに） | **誤記を修正・被リンク追加**（下記） |
| `/glossary/timeboxing/` | 0 | 「タイムボクシング」を含むクエリはサイト全体でゼロ | **本文を厚くした**（下記） |
| `/blog/business-memo-apps-2026` | 0 | `/blog/best-memo-apps-2026` 1,579（「ビジネス」を含むクエリ13件はすべてこちら） | 統合候補（オーナー判断・後述） |
| `/vs/captioo/` | 0 | 「captioo」を含むクエリはサイト全体でゼロ。「captio」は `/blog/captio-discontinued` `/captio-alternative/` が受ける | 統合候補（オーナー判断・後述） |
| `/guides/draft-autosave/` | 0 | 「自動保存」を含むクエリは「obsidian 自動保存」1件のみ（`/obsidian/`） | 現状維持（後述） |
| `/vs/todoist/` | 0 | 「todoist」を含むクエリはサイト全体でゼロ | 経過観察 |
| `/blog/instant-capture-workflow` | 0 | 「capture」系は `/en/blog/ios-quick-capture-comparison` 5 | 経過観察 |
| `/blog/freelance-memo-management` | 0 | `/use-cases/freelancers/` 1 | 経過観察 |
| `/devlog/day1` | 0 | — | 現状維持（開発記録。検索流入を目的にしない） |

前回が「分母が足りないので判断しない」とした6件は、21日窓で全件ゼロになった。
ただし0/非0の事実として読めるのは「いま掲載されていない」ことまでで、統合は
ページを消す不可逆の操作なので、前例どおりオーナー判断に残す（§「オーナー判断事項」）。

## 今回サイト側で直したもの

方針: 検証を実際に落とした3件と、同じ「薄い方として落とされた」形の1件について、
**ページの側を検索意図に対して十分な厚さにする**。統合はしない（消すのはオーナー判断）。
本文は日英とも追加。FAQPage JSON-LD は `scripts/inject_faq_schema.py` で再生成。

| ページ | JA本文（字） | FAQ（日英計） | 追加したもの |
|---|---:|---:|---|
| `/glossary/e2e-encryption/` | 3,259 → 7,620 | 6 → 13 | 鍵交換の4ステップ／通信路・保存時・E2Eの比較表／主要11サービスの対応表／E2EEでも守れない4点／脅威モデル別の選び方。title・descriptionを「定義ページ」として書き直し。`/privacy-architecture/` `/glossary/smtp/` へ関連リンク |
| `/glossary/timeboxing/` | 2,148 → 5,650 | 6 → 14 | 効く理由（パーキンソンの法則）／タイムブロッキング・ポモドーロとの比較表／時間枠の目安4段階／続かない原因と対策／1日の実例。title・description書き直し |
| `/use-cases/meeting-notes/` | 4,740 → 7,588 | 10 → 16 | 「議事録とは別物、扱うのは会議中の30秒」を冒頭で明記してテンプレート記事へ送る／3行フォーマット／会議種別のコツ／会議後の流れ |
| `/vs/roam-research/` | 5,040 → 5,098 | 10 → 10 | **誤記の訂正**（下記） |

### `/vs/roam-research/` は事実が間違っていた

「Roam ResearchにはネイティブiOSアプリがなく、SafariやChromeからWebアプリにアクセスする形式」
と書いてあったが、**Roam Research, Inc. の公式アプリ「Roam Mobile」が App Store にある**
（id1609277273。本環境から App Store は取得できないため、検索結果の開発者名で確認）。
比較表の「起動 5〜10秒（Webアプリ）」「オンライン必須」も、本サイトのベンチマーク
（`data/benchmark.json`）に Roam の計測は無く、根拠の無い断定だった。

いずれも「Roamはグラフを開いて日次ノートに書く構造で、起動後にデータの読み込みが入る」
「クラウド同期が前提」という、設計として言える範囲に書き換えた。料金（月$15）は
公式サイトの公開情報に基づく旨と、変わりうる旨を添えた。

比較ページの誤りは順位の問題以前に信頼の問題なので、インデックスと無関係でも直す対象。

### 被リンク（文脈のあるものだけ）

`docs/content-linking-rules.md` の「手動リンク推奨」に沿って、本文の中で話題が実際に
隣接する箇所にだけ足した。footer や一覧への機械的な追加はしていない。

| 追加元（21日の表示） | → 追加先 | 置いた場所 |
|---|---|---|
| `/blog/memo-app-security-comparison`（489） | `/glossary/e2e-encryption/` | 「暗号化方式1：E2EE」の説明カード末尾（日英） |
| `/blog/meeting-memo-template`（801） | `/use-cases/meeting-notes/` | テンプレート1の説明文（「議事録は書かず、その場で3行だけ送る運用は…」） |
| `/methods/second-brain/`（814） | `/vs/roam-research/`（＋`/vs/notion/` `/vs/obsidian/` `/vs/logseq/` `/vs/apple-notes/`） | 「どのPKMツールでも使える」カードで並べていた5製品名を、それぞれの比較ページへ（日英） |

被リンク数: e2e-encryption 11→13、meeting-notes 8→9、roam-research 7→9、timeboxing 9→9
（timeboxingは既にglossary内で9本あり、隣接する本文が無いので足していない）。

## 変種52件について（前回と同じ結論、根拠は再実測）

    /blog/instant-capture-workflow.html            301 → /blog/instant-capture-workflow
    /vs/craft/?lang=en                             301 → /vs/craft/
    /vs/ticktick/?lang=ja                          301 → /vs/ticktick/
    /blog/?q=%7Bsearch_term_string%7D              301 → /blog/
    /blog/which-memo-app-flowchart.html?lang=ja    301 → /blog/which-memo-app-flowchart
    /terms?lang=ja                                 301 → /terms
    /faq?lang=en                                   301 → /faq
    /captio/?lang=en                               301 → /captio/
    /blog/digital-vs-handwritten-notes.html?lang=en 301 → /blog/digital-vs-handwritten-notes
    /blog/line-keep-migration                      301 → /blog/line-keep-alternative
    /blog/memo-app-free-guide                      301 → /blog/free-memo-apps-ranking

BigQuery の21日窓に `?` や `.html` を含むURLは **0件**（表示のあるURL 235件すべてが正規形）。
変種はどれも掲載されておらず、実害はレポートの行数だけ。

### 「旧URLを一時的にサイトマップに載せて再クロールを促す」は採用しない

52件の最終クロールが3〜6月のまま動かないのは、Googleが未登録URLの再クロール優先度を
下げているため。これを促す手段として、リダイレクト済みの旧URLだけを載せた一時的な
サイトマップを出す方法があり、John Mueller は「1〜3か月、最長6か月の一時的な措置として
なら可」「効果は今では最小限だと思う」と述べている
（[Search Engine Roundtable](https://www.seroundtable.com/google-old-redirected-urls-sitemaps-files-temporarily-33172.html)、
[thewebmaster.com](https://www.thewebmaster.com/google-redirecting-urls-keep-old-sitemaps-6-months/)）。

採用しない理由:

1. 効いたとしても行き先は「ページにリダイレクトがあります」バケット（既に88件・検証は構造的に不合格）
   で、**レポートの行が別の失敗バケットへ移るだけ**。今回の検証失敗の原因（正規URL）には触れない
2. `seo-check.js checkEdgeRules` と `check-internal-redirects.mjs` は「サイトマップにリダイレクトURLを
   載せない」を不変条件としてCIで守っている。例外を切るなら生成器・検査・期限切れ削除の3か所を
   触ることになり、効果「最小限」の措置に見合わない

オーナーがレポートの行数そのものを減らしたい場合の選択肢として残す。実装するなら
`sitemap-legacy.xml` を index に載せ、`check-expiry.mjs` の台帳に撤去期限（3か月）を登録する。

## 触らなかったもの・見つけたもの

- **`inject_faq_schema.py` を回すと EN 15ページも「更新」対象に出る**が、抽出した質問・回答は
  既存の FAQPage と完全一致（`en/vs/notion/` `en/captio-alternative/` `en/privacy-architecture/`
  で確認）。バイト配置の違いだけで意味の差は無いので、今回は3ページ分だけ適用し、EN側は
  戻した。次に誰かが全体を回したときに15ファイルの差分が出るのは、この理由による
- 変種52件・統合済み2件は上記のとおり打つ手が無い
- 経過観察5件（todoist / instant-capture / freelance / day1 / draft-autosave）は今回触っていない

## オーナー判断事項

前例（08-11の2件統合）の基準は「統合先が実績を持ち、統合元がゼロで、意図が同じ」。
今回それを満たすのは次の2件で、どちらもページを消す操作なので実行していない。

1. **`/blog/business-memo-apps-2026` → `/blog/best-memo-apps-2026`**
   「ビジネス」を含むクエリは21日で13件、すべて best-memo-apps が受けている（順位3.3）。
   統合元は21日でゼロ。08-27に「7表示・順位7.4があった」として止めた判断は、その後の
   21日で崩れた。統合先が1,579表示を持つので、前例の基準を満たす
2. **`/vs/captioo/`（＋`/blog/captioo-alternative`）→ `/captio-alternative/`**
   「captioo」を含むクエリはサイト全体で0。「captio」は `/captio-alternative/`（42表示）
   `/blog/captio-discontinued`（10表示・3クリック）が受けている。同名混同の注意書き
   （Captio / Captioo / 本アプリは別物）は `/captio-alternative/` に1節として移せる

`/guides/draft-autosave/` は検索需要が無く、FAQ・アプリからの導線で読まれる製品ドキュメント。
未登録のままでも実害は無いので、消すより「登録されないことを受け入れる」を推奨。

## オーナー操作（GSC側）

1. **「検証を再開」はまだ押さない。**正規URL11件のうち掲載に戻っていないものが1件でも
   あれば、また数日で不合格になる
2. デプロイ後、URL検査ツールで次の4件を「インデックス登録をリクエスト」する
   （1日の上限は十数件なので1回で済む）:
   `/glossary/e2e-encryption/` `/glossary/timeboxing/` `/use-cases/meeting-notes/` `/vs/roam-research/`
   → **2026-09-02 実施済み**（Cowork、被リンク元3件を含む計7件。検査時の前回クロール日は
   `gsc-index-request-2026-09-02.md` §実施報告。`/glossary/timeboxing/` は 05/28 から未クロールだった）
3. 2〜4週間後に `growth/data/gsc` の日次（BigQuery）で4件の表示を確認する。
   4件が戻り、上記の統合2件を決めた後であれば、検証を押す意味が出る
4. 統合2件の判断（§オーナー判断事項）
