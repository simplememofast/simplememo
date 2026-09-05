# GSC「ページにリダイレクトがあります」88件 全数検証 — 2026-08-20

> 2026-09-05補足: この記録の「200」「ホップ数」はコードとファイル構成からの
> ローカル検証であり、本番HTTP応答やGoogleの登録状況の実測ではない。
> 当初あった「必ず検証失敗」「件数が月単位で自然減」「転送先を登録済み」とする
> 断定を訂正した。現在の本番HTTP確認と追加修正は
> [2026-09-05の再確認](gsc-redirect-audit-2026-09-05.md)を参照。

データソース: GSCページインデックス登録レポート「ページにリダイレクトがあります」
（最終更新 2026-08-17、該当88件、検証 07-28開始 → 08-05不合格、前回クロール日 2026-04-01〜08-18）。

07-25（`gsc-coverage-fix-2026-07-25.md`）で実装した恒久対策（1ホップ化・パラメータ301・410）の
**その後**にあたる回。今回は88件を1件ずつ、実際の `functions/_middleware.js` と
ファイルツリーに通して着地を全数検証した。

---

## 1. 結論（3行）

1. **88件すべてが意図した恒久リダイレクトで、着地は全件200。着地404はゼロ。**
   インデックスさせたい正規URLがこのバケットに入っている事例もゼロ。
2. **「検証: 失敗」だけではサイトの不具合とは判断できない。** 意図したリダイレクトは
   維持する。失敗の詳細はGSCの検証履歴で確認する必要がある。
3. 直すべき欠陥は無かったが、**将来このバケットに新規流入を作りうる経路を2つ閉じた**（§4）。

## 2. 全数検証の方法と結果

88 URLを (a) エッジ挙動（HTTPS強制 → `functions/_middleware.js` 実物を data:URL import で実行 →
`_redirects`）、(b) Cloudflare Pages の静的解決（`X.html`→`X`、ディレクトリ→`/`付与308）、
(c) リポジトリの実ファイル、の順に通した。

| 分類 | 件数 | 挙動 |
|---|---|---|
| `.html` 変種 | 32 | Middleware 301 → 拡張子なし正規URL |
| `?lang=` 変種 | 30 | Middleware 301 → パラメータ除去 |
| リタイア済みパス | 8 | Middleware 301 → 統合先（`/vs/` `/captio-alternative/` 等） |
| リタイア済み×変種（`.html`/`?lang=`付き） | 7 | Middleware 301 → 統合先（1ホップ） |
| `.html` + `?lang=` 複合変種 | 5 | Middleware 301（1ホップに折り込み済み） |
| プロトコル/ホスト正規化（`http://`・`www.`） | 3 | エッジ301（HTTPS強制）＋ホスト正規化 |
| 外部リンク片 `/)` | 1 | Middleware 301 → `/`（featureupvote.com の括弧付きリンク） |
| 参照パラメータ `?ref=` | 1 | Middleware 301 → パラメータ除去 |
| 末尾スラッシュ `/en` | 1 | Pages 308 → `/en/` |

- **88件中87件が1ホップ**。唯一の2ホップは `http://www.simplememofast.com/` で、
  エッジの HTTPS 強制（Always Use HTTPS）が Pages Functions より前段で走るため、
  `http://`→`https://` の1段はリポジトリ側から畳めない。
- 前回クロール日とこの分類から分かるのは、Googleが転送元を非正規URLと
  扱っていることまで。転送先の登録状況は、このレポートからは分からない。
- 生成源の再確認: 内部リンク12,930 + JSON-LD/meta 5,113 + サイトマップ572 URLは
  すべて直接200（CI実測）。`js/lang.js` は `?lang=` をリンクに付与せず、
  来訪時に `history.replaceState` で吸収・除去する（`js/lang.js:55-67`）。
  検査した静的HTML・サイトマップに古いURLの発信源は見つからなかった。
  外部リンク、過去のクロール、実行時に生成されるリンクは別途確認が必要。

全88件の個別結果は付録（§6）。

## 3. 「検証: 失敗」の正しい読み方

この分類は、Googleが転送元を非正規URLとして登録しないことを示す。
意図した301が継続していれば分類が残ることはあるが、今回の検証失敗の
詳しい理由は検証履歴を読まなければ確定できない。

「ページにリダイレクトがあります」は Google の分類上 **エラーではなく情報**
（「インデックスに登録しない正当な理由があるページ」）。見るべき数字はこのバケットの
件数ではなく、**サイトマップ経由の正規URLのインデックス数**。
転送元の表示件数が減る時期や、転送先が登録される時期は保証されない。

**GSC側で推奨するアクション**: 意図した転送元を登録させるための再検証は不要。
正規URLをURL検査で確認し、意図しない転送や転送先の問題を修正した場合に
該当する問題の再検証を行う。
根拠: [Google公式のページインデックス登録レポートの説明](https://support.google.com/webmasters/answer/7440203?hl=ja)。

## 4. 今回閉じた2経路（本PRの変更）

直すべき欠陥はゼロだったが、調査中に「将来このバケットに新規流入を作りうる未閉鎖経路」を
2つ見つけたので閉じた。

### 4-1. `www` ホスト正規化を Middleware に折り込み（2ホップ → 1ホップ）

`_redirects` の `www→apex` ルールは Pages Functions の**後**に走る。そのため
`https://www.simplememofast.com/x.html?lang=ja` のような「ホストもパスも直したいURL」は

```
→ 301 (Middleware: .html+lang剥がし、wwwのまま)  https://www.…/x   ← 中間URLがGSCに1行増える
→ 301 (_redirects: www→apex)                     https://simplememofast.com/x
```

の2ホップになり、**中間の `https://www.…/x` という新しいURLをGSCに供給していた**。
Middleware 冒頭でホストを apex に正規化し（完全一致判定なので `*.pages.dev` の
プレビューには影響しない）、全部を1つの301に折り込んだ。`_redirects` のルールは
Functionsデプロイ失敗時のフォールバックとして残置（RETIREDパスと同じ扱い）。

`scripts/check-url-normalization.mjs` に www ケース7件を追加（189→196チェック）。

### 4-2. サイトマップ `<loc>` を CI の直接200保証に追加

`check-internal-redirects.mjs` は href/src（2026-07）と JSON-LD/meta（2026-08-11）を
監査してきたが、**サイトマップだけが未監査だった**。サイトマップはGoogleが最も信頼する
クロール源なので、リダイレクトする `<loc>` を1行でも出荷すると、このバケットへ
最高権威の経路から直行する。全 `sitemap*.xml` の `<loc>` と hreflang alternate
（計572 URL）に対し、(1) 正規オリジン `https://simplememofast.com` であること、
(2) エッジ＋静的解決で直接200に落ちること、を既存の内部リンクと同一ルールで検査する。

ネガティブテスト実測: `.html`変種・リタイア済みパス・wwwホスト・存在しないページの
4種を混ぜたサイトマップを置くと4件とも検出して exit 1、除去後は exit 0。

## 5. 触らなかったもの（理由つき）

- **`http://` → `https://`**: エッジの Always Use HTTPS。リポジトリから制御不可、かつ正しい。
- **`/en` → `/en/`（Pages 308）**: 永続リダイレクトであり1ホップ。301化してもGSCの分類は
  変わらず（どちらも「ページにリダイレクトがあります」）、ディレクトリ判定をMiddlewareに
  持ち込むコストに見合わない。内部リンクに `/en`（スラッシュなし）は0件（CI実測）。
- **`?utm_*` / `gclid` / `fbclid`**: 301で剥がすとGA4・広告計測が壊れる（07-25決定を維持）。
  自己参照canonicalで重複解決。
- **リダイレクトの削除・410化**: 88件には被リンク・ブックマークが実在する
  （`?ref=launches.uicomet.com`、featureupvote.com の `/)` 等）。301は評価を
  正規URLへ渡すための正解であり、外すものではない。

## 6. 付録: 88件の個別着地（ローカル検証）

ホップ数はリダイレクト応答の回数（エッジ含む）。着地は最終200のパス。

| URL | 分類 | ホップ | 着地 |
|---|---|---|---|
| `/guides/?lang=ja` | ?lang= 変種 | 1 | `200 /guides/` |
| `/blog/second-brain-capture-first.html` | .html 変種 | 1 | `200 /blog/second-brain-capture-first` |
| `/blog/iphone-memo-katsuyou.html` | .html 変種 | 1 | `200 /blog/iphone-memo-katsuyou` |
| `/blog/captio-discontinued.html?lang=ja` | .html + ?lang= 変種 | 1 | `200 /blog/captio-discontinued` |
| `/blog/captio-discontinued.html` | .html 変種 | 1 | `200 /blog/captio-discontinued` |
| `/blog/captio-discontinued?lang=ja` | ?lang= 変種 | 1 | `200 /blog/captio-discontinued` |
| `/blog/offline-memo-apps.html` | .html 変種 | 1 | `200 /blog/offline-memo-apps` |
| `http://www.simplememofast.com/` | プロトコル/ホスト正規化 | 2 | `200 /` |
| `/vs/?lang=en` | ?lang= 変種 | 1 | `200 /vs/` |
| `/vs/trello/` | リタイア済みパス | 1 | `200 /vs/` |
| `/blog/memo-app-privacy.html` | .html 変種 | 1 | `200 /blog/memo-app-privacy` |
| `/blog/fastest-memo-app-benchmark?lang=en` | ?lang= 変種 | 1 | `200 /blog/fastest-memo-app-benchmark` |
| `/blog/line-keep-alternative.html?lang=ja` | .html + ?lang= 変種 | 1 | `200 /blog/line-keep-alternative` |
| `/blog/line-keep-alternative?lang=ja` | ?lang= 変種 | 1 | `200 /blog/line-keep-alternative` |
| `/vs/mem/` | リタイア済みパス | 1 | `200 /vs/` |
| `/en/blog/why-captio-died` | リタイア済みパス | 1 | `200 /en/captio-alternative/` |
| `/blog/email-yourself-memo.html` | .html 変種 | 1 | `200 /blog/email-yourself-memo` |
| `/blog/captio-alternatives-comparison` | リタイア済みパス | 1 | `200 /captio-alternative/` |
| `/blog/captio-alternatives-comparison.html` | リタイア済み×変種 | 1 | `200 /captio-alternative/` |
| `/devlog/captio-alternative` | リタイア済みパス | 1 | `200 /captio-alternative/` |
| `/vs/logseq/?lang=ja` | ?lang= 変種 | 1 | `200 /vs/logseq/` |
| `http://simplememofast.com/` | プロトコル/ホスト正規化 | 1 | `200 /` |
| `/)` | 外部リンク片（括弧） | 1 | `200 /` |
| `/?lang=en` | ?lang= 変種 | 1 | `200 /` |
| `/?lang=ja` | ?lang= 変種 | 1 | `200 /` |
| `/blog/fastest-memo-app-benchmark.html` | .html 変種 | 1 | `200 /blog/fastest-memo-app-benchmark` |
| `/blog/captio-alternatives-comparison?lang=ja` | リタイア済み×変種 | 1 | `200 /captio-alternative/` |
| `/en` | 末尾スラッシュ（Pages 308） | 1 | `200 /en/` |
| `/glossary/?lang=ja` | ?lang= 変種 | 1 | `200 /glossary/` |
| `/blog/meeting-memo-template.html` | .html 変種 | 1 | `200 /blog/meeting-memo-template` |
| `http://simplememofast.com/en/` | プロトコル/ホスト正規化 | 1 | `200 /en/` |
| `/vs/ios-reminders/?lang=ja` | ?lang= 変種 | 1 | `200 /vs/ios-reminders/` |
| `/vs/ticktick/?lang=en` | ?lang= 変種 | 1 | `200 /vs/ticktick/` |
| `/blog/memo-app-speed-test-2026?lang=ja` | ?lang= 変種 | 1 | `200 /blog/memo-app-speed-test-2026` |
| `/blog/work-efficiency-memo.html` | .html 変種 | 1 | `200 /blog/work-efficiency-memo` |
| `/?ref=launches.uicomet.com` | 参照パラメータ ?ref= | 1 | `200 /` |
| `/vs/slack-self-dm/` | リタイア済みパス | 1 | `200 /vs/` |
| `/vs/telegram/` | リタイア済みパス | 1 | `200 /vs/` |
| `/about/?lang=ja` | ?lang= 変種 | 1 | `200 /about/` |
| `/blog/memo-app-hikaku-matome.html` | .html 変種 | 1 | `200 /blog/memo-app-hikaku-matome` |
| `/blog/minimalist-digital-memo.html` | .html 変種 | 1 | `200 /blog/minimalist-digital-memo` |
| `/contact?lang=ja` | ?lang= 変種 | 1 | `200 /contact` |
| `/vs/onenote/?lang=ja` | ?lang= 変種 | 1 | `200 /vs/onenote/` |
| `/blog/memo-app-speed-test-2026.html` | .html 変種 | 1 | `200 /blog/memo-app-speed-test-2026` |
| `/blog/how-to-choose-memo-app?lang=ja` | ?lang= 変種 | 1 | `200 /blog/how-to-choose-memo-app` |
| `/blog/how-to-choose-memo-app.html` | .html 変種 | 1 | `200 /blog/how-to-choose-memo-app` |
| `/use-cases/freelancers/?lang=ja` | ?lang= 変種 | 1 | `200 /use-cases/freelancers/` |
| `/blog/business-memo-apps-2026.html` | .html 変種 | 1 | `200 /blog/business-memo-apps-2026` |
| `/blog/journaling-for-beginners.html` | .html 変種 | 1 | `200 /blog/journaling-for-beginners` |
| `/blog/benchmark-methodology.html` | .html 変種 | 1 | `200 /blog/benchmark-methodology` |
| `/blog/memo-shuukan-tips` | リタイア済みパス | 1 | `200 /blog/memo-habit` |
| `/blog/memo-shuukan-tips.html` | リタイア済み×変種 | 1 | `200 /blog/memo-habit` |
| `/vs/drafts/?lang=en` | ?lang= 変種 | 1 | `200 /vs/drafts/` |
| `/vs/todoist/?lang=en` | ?lang= 変種 | 1 | `200 /vs/todoist/` |
| `/vs/mem/?lang=en` | リタイア済み×変種 | 1 | `200 /vs/` |
| `/vs/notion-vs-obsidian/?lang=en` | ?lang= 変種 | 1 | `200 /vs/notion-vs-obsidian/` |
| `/blog/memo-habit.html` | .html 変種 | 1 | `200 /blog/memo-habit` |
| `/blog/memo-app-free-guide.html` | リタイア済み×変種 | 1 | `200 /blog/free-memo-apps-ranking` |
| `/blog/student-memo-app.html` | .html 変種 | 1 | `200 /blog/student-memo-app` |
| `/blog/remote-work-memo.html` | .html 変種 | 1 | `200 /blog/remote-work-memo` |
| `/blog/business-memo-kakikata.html` | .html 変種 | 1 | `200 /blog/business-memo-kakikata` |
| `/blog/memo-app-security-comparison.html` | .html 変種 | 1 | `200 /blog/memo-app-security-comparison` |
| `/blog/captioo-alternative.html` | .html 変種 | 1 | `200 /blog/captioo-alternative` |
| `/vs/obsidian/?lang=ja` | ?lang= 変種 | 1 | `200 /vs/obsidian/` |
| `/guides/yahoo-mail/?lang=ja` | ?lang= 変種 | 1 | `200 /guides/yahoo-mail/` |
| `/vs/standard-notes/?lang=ja` | ?lang= 変種 | 1 | `200 /vs/standard-notes/` |
| `/blog/best-memo-apps-2026.html` | .html 変種 | 1 | `200 /blog/best-memo-apps-2026` |
| `/methods/gtd/?lang=ja` | ?lang= 変種 | 1 | `200 /methods/gtd/` |
| `/blog/iphone-memo-tips.html?lang=ja` | .html + ?lang= 変種 | 1 | `200 /blog/iphone-memo-tips` |
| `/blog/iphone-memo-tips?lang=ja` | ?lang= 変種 | 1 | `200 /blog/iphone-memo-tips` |
| `/blog/digital-vs-handwritten-notes.html` | .html 変種 | 1 | `200 /blog/digital-vs-handwritten-notes` |
| `/blog/chatgpt-memo-workflow.html` | .html 変種 | 1 | `200 /blog/chatgpt-memo-workflow` |
| `/blog/engineer-code-snippets.html` | .html 変種 | 1 | `200 /blog/engineer-code-snippets` |
| `/blog/iphone-memo-app-fast.html` | .html 変種 | 1 | `200 /blog/iphone-memo-app-fast` |
| `/blog/email-management-tips.html` | .html 変種 | 1 | `200 /blog/email-management-tips` |
| `/blog/travel-planning-memo.html` | .html 変種 | 1 | `200 /blog/travel-planning-memo` |
| `/blog/ai-vs-simple-memo.html` | .html 変種 | 1 | `200 /blog/ai-vs-simple-memo` |
| `/blog/ios-quick-capture-comparison.html` | .html 変種 | 1 | `200 /blog/ios-quick-capture-comparison` |
| `/blog/gen-z-memo.html` | .html 変種 | 1 | `200 /blog/gen-z-memo` |
| `/blog/morning-memo-routine.html?lang=ja` | .html + ?lang= 変種 | 1 | `200 /blog/morning-memo-routine` |
| `/blog/morning-memo-routine?lang=ja` | ?lang= 変種 | 1 | `200 /blog/morning-memo-routine` |
| `/blog/travel-planning-memo.html?lang=ja` | .html + ?lang= 変種 | 1 | `200 /blog/travel-planning-memo` |
| `/blog/travel-planning-memo?lang=ja` | ?lang= 変種 | 1 | `200 /blog/travel-planning-memo` |
| `/vs/simplenote/?lang=ja` | ?lang= 変種 | 1 | `200 /vs/simplenote/` |
| `/blog/student-memo-app?lang=ja` | ?lang= 変種 | 1 | `200 /blog/student-memo-app` |
| `/vs/todoist/?lang=ja` | ?lang= 変種 | 1 | `200 /vs/todoist/` |
| `/vs/trello/?lang=en` | リタイア済み×変種 | 1 | `200 /vs/` |
| `/vs/whatsapp/?lang=en` | リタイア済み×変種 | 1 | `200 /vs/` |

（URLは `https://simplememofast.com` からの相対表記。`http://` 表記の3件のみ絶対URL）
