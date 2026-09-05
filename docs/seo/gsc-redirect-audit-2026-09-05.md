# GSC「ページにリダイレクトがあります」再確認 — 2026-09-05

対象: ユーザー添付の最終更新2026-08-28のレポート、88 URL。
検証履歴の表示は2026-07-28開始・2026-08-05不合格。実施日は2026-09-05。

## 現在の本番HTTP結果

- **88件すべてが1回の恒久転送で200に到達した。** 転送元の応答内訳: {301: 87, 308: 1}。
- 最終URLは58種類。全件でHTMLのcanonicalが最終URLと一致し、robotsメタ・X-Robots-Tagにnoindexは見つからなかった。
- `http://www.simplememofast.com/` も現在は直接 `https://simplememofast.com/` に301で到達する。過去のローカルモデルが想定した2段転送と、本番の現在の応答は異なる。
- これら88件の転送は意図した正規化・記事統合であり、削除する必要はない。
- **HTTP 200やcanonicalの一致は、Googleへのインデックス登録を証明しない。** 今回はGSCのURL検査・検証履歴の詳細を取得していない。

確認方法: GETリクエストで自動転送を無効にし、各応答のstatus・Locationを記録して転送先を追跡。最終HTMLからcanonicalとrobots指定を取得。同じ最終URLの取得結果は再利用した。初回の一括取得では429が発生したため頻度を下げ、Retry-Afterに従って再確認し、最終的に全88件の200到達を確認した。これはこの監査への制限であり、Googlebotも制限されたという証拠ではない。

## 今回の修正

88件の関連URLを点検した際、`_redirects` にある `/vs/mem` が `functions/_middleware.js` のRETIRED表に無いことを発見。本番で次の2段転送を確認した。

```text
/vs/mem?lang=en → 301 /vs/mem → 301 /vs/ → 200
```

RETIRED表へ同じ行を追加し、次の1段に変更する。

```text
/vs/mem?lang=en → 301 /vs/ → 200
```

`.html`、www、言語パラメータを組み合わせた場合も同じ統合先へ直行し、utm_sourceなどの計測用パラメータは保持する。このスラッシュなしのURLは添付88件の外側にある関連変種であり、88件そのものに不具合があったという意味ではない。

既存テストは転送先がMiddlewareを通過すれば成功としていたため、Pagesが404を返すURLや末尾スラッシュの追加転送を検出できなかった。公開HTMLの実在確認を追加し、存在しないページと `/en` の再転送を故意に与える自己テストも追加した。管理APIのテストは認証用Functionへの引き渡しを確認し、静的HTML検査の対象にしない。

[前回の監査記録](gsc-redirect-audit-2026-08-20.md)とMiddlewareの説明にあった、転送先の登録状況・再検証の必然的失敗・レポートが消える期限についての断定も訂正した。

## 検証

- URL正規化: 265件成功。追加した4件は `/vs/mem` のスラッシュなし・クエリ・拡張子・www複合変種。
- 正規化テストの自己テスト: 9件成功（誤った転送先、欠落HTML、Pagesでの再転送などを検出）。
- 内部参照: href/src 13,919件、JSON-LD/meta 5,320件、サイトマップ参照590件が直接到達することをローカル確認。
- 基本SEO検査: 269 HTML、エラー0・警告0。
- サイトマップ: 日本語206・英語47・その他言語8、計261ページのURL集合が現在の構成と一致。
- 公開範囲、検査台帳、ガード、モジュール入口の関連検査も成功。

## GSCでの扱い

Googleの説明では、この分類のURLは転送する非正規URLであり、転送先は登録される場合とされない場合がある。正常な転送元を登録させるための再検証や、転送を外す対応は不要。重要な**転送先の正規URL**をURL検査で確認する。今回の「不合格」の詳細理由は検証履歴で確認する必要がある。

根拠: [Google公式: ページインデックス登録レポート](https://support.google.com/webmasters/answer/7440203?hl=ja)、[Google公式: リダイレクトとGoogle検索](https://developers.google.com/search/docs/crawling-indexing/301-redirects?hl=ja)。

## 88件のHTTP結果

`https://simplememofast.com` は省略。全行の最終HTMLで自己参照canonicalを確認。

| 転送元 | 応答 | 転送回数 | 最終URL | 最終応答 |
|---|---:|---:|---|---:|
| `/blog/memo-app-privacy.html` | 301 | 1 | `/blog/memo-app-privacy` | 200 |
| `/blog/offline-memo-apps.html` | 301 | 1 | `/blog/offline-memo-apps` | 200 |
| `/blog/fastest-memo-app-benchmark?lang=en` | 301 | 1 | `/blog/fastest-memo-app-benchmark` | 200 |
| `/vs/logseq/?lang=ja` | 301 | 1 | `/vs/logseq/` | 200 |
| `/blog/fastest-memo-app-benchmark.html` | 301 | 1 | `/blog/fastest-memo-app-benchmark` | 200 |
| `/glossary/?lang=ja` | 301 | 1 | `/glossary/` | 200 |
| `/blog/captio-alternatives-comparison` | 301 | 1 | `/captio-alternative/` | 200 |
| `/blog/captio-alternatives-comparison.html` | 301 | 1 | `/captio-alternative/` | 200 |
| `/devlog/captio-alternative` | 301 | 1 | `/captio-alternative/` | 200 |
| `/blog/iphone-memo-app-fast.html` | 301 | 1 | `/blog/iphone-memo-app-fast` | 200 |
| `/vs/ios-reminders/?lang=ja` | 301 | 1 | `/vs/ios-reminders/` | 200 |
| `http://simplememofast.com/` | 301 | 1 | `/` | 200 |
| `http://www.simplememofast.com/` | 301 | 1 | `/` | 200 |
| `/contact?lang=ja` | 301 | 1 | `/contact` | 200 |
| `/about/?lang=ja` | 301 | 1 | `/about/` | 200 |
| `/vs/?lang=en` | 301 | 1 | `/vs/` | 200 |
| `/vs/mem/` | 301 | 1 | `/vs/` | 200 |
| `/vs/trello/` | 301 | 1 | `/vs/` | 200 |
| `/)` | 301 | 1 | `/` | 200 |
| `/?lang=en` | 301 | 1 | `/` | 200 |
| `/?lang=ja` | 301 | 1 | `/` | 200 |
| `/blog/meeting-memo-template.html` | 301 | 1 | `/blog/meeting-memo-template` | 200 |
| `/en` | 308 | 1 | `/en/` | 200 |
| `/guides/?lang=ja` | 301 | 1 | `/guides/` | 200 |
| `/blog/second-brain-capture-first.html` | 301 | 1 | `/blog/second-brain-capture-first` | 200 |
| `/blog/iphone-memo-katsuyou.html` | 301 | 1 | `/blog/iphone-memo-katsuyou` | 200 |
| `/blog/captio-discontinued.html?lang=ja` | 301 | 1 | `/blog/captio-discontinued` | 200 |
| `/blog/captio-discontinued.html` | 301 | 1 | `/blog/captio-discontinued` | 200 |
| `/blog/captio-discontinued?lang=ja` | 301 | 1 | `/blog/captio-discontinued` | 200 |
| `/blog/line-keep-alternative.html?lang=ja` | 301 | 1 | `/blog/line-keep-alternative` | 200 |
| `/blog/line-keep-alternative?lang=ja` | 301 | 1 | `/blog/line-keep-alternative` | 200 |
| `/en/blog/why-captio-died` | 301 | 1 | `/en/captio-alternative/` | 200 |
| `/blog/email-yourself-memo.html` | 301 | 1 | `/blog/email-yourself-memo` | 200 |
| `/blog/captio-alternatives-comparison?lang=ja` | 301 | 1 | `/captio-alternative/` | 200 |
| `http://simplememofast.com/en/` | 301 | 1 | `/en/` | 200 |
| `/vs/ticktick/?lang=en` | 301 | 1 | `/vs/ticktick/` | 200 |
| `/blog/memo-app-speed-test-2026?lang=ja` | 301 | 1 | `/blog/memo-app-speed-test-2026` | 200 |
| `/blog/work-efficiency-memo.html` | 301 | 1 | `/blog/work-efficiency-memo` | 200 |
| `/?ref=launches.uicomet.com` | 301 | 1 | `/` | 200 |
| `/vs/slack-self-dm/` | 301 | 1 | `/vs/` | 200 |
| `/vs/telegram/` | 301 | 1 | `/vs/` | 200 |
| `/blog/memo-app-hikaku-matome.html` | 301 | 1 | `/blog/memo-app-hikaku-matome` | 200 |
| `/blog/minimalist-digital-memo.html` | 301 | 1 | `/blog/minimalist-digital-memo` | 200 |
| `/vs/onenote/?lang=ja` | 301 | 1 | `/vs/onenote/` | 200 |
| `/blog/memo-app-speed-test-2026.html` | 301 | 1 | `/blog/memo-app-speed-test-2026` | 200 |
| `/blog/how-to-choose-memo-app?lang=ja` | 301 | 1 | `/blog/how-to-choose-memo-app` | 200 |
| `/blog/how-to-choose-memo-app.html` | 301 | 1 | `/blog/how-to-choose-memo-app` | 200 |
| `/use-cases/freelancers/?lang=ja` | 301 | 1 | `/use-cases/freelancers/` | 200 |
| `/blog/business-memo-apps-2026.html` | 301 | 1 | `/blog/business-memo-apps-2026` | 200 |
| `/blog/journaling-for-beginners.html` | 301 | 1 | `/blog/journaling-for-beginners` | 200 |
| `/blog/benchmark-methodology.html` | 301 | 1 | `/blog/benchmark-methodology` | 200 |
| `/blog/memo-shuukan-tips` | 301 | 1 | `/blog/memo-habit` | 200 |
| `/blog/memo-shuukan-tips.html` | 301 | 1 | `/blog/memo-habit` | 200 |
| `/vs/drafts/?lang=en` | 301 | 1 | `/vs/drafts/` | 200 |
| `/vs/todoist/?lang=en` | 301 | 1 | `/vs/todoist/` | 200 |
| `/vs/mem/?lang=en` | 301 | 1 | `/vs/` | 200 |
| `/vs/notion-vs-obsidian/?lang=en` | 301 | 1 | `/vs/notion-vs-obsidian/` | 200 |
| `/blog/memo-habit.html` | 301 | 1 | `/blog/memo-habit` | 200 |
| `/blog/memo-app-free-guide.html` | 301 | 1 | `/blog/free-memo-apps-ranking` | 200 |
| `/blog/student-memo-app.html` | 301 | 1 | `/blog/student-memo-app` | 200 |
| `/blog/remote-work-memo.html` | 301 | 1 | `/blog/remote-work-memo` | 200 |
| `/blog/business-memo-kakikata.html` | 301 | 1 | `/blog/business-memo-kakikata` | 200 |
| `/blog/memo-app-security-comparison.html` | 301 | 1 | `/blog/memo-app-security-comparison` | 200 |
| `/blog/captioo-alternative.html` | 301 | 1 | `/blog/captioo-alternative` | 200 |
| `/vs/obsidian/?lang=ja` | 301 | 1 | `/vs/obsidian/` | 200 |
| `/guides/yahoo-mail/?lang=ja` | 301 | 1 | `/guides/yahoo-mail/` | 200 |
| `/vs/standard-notes/?lang=ja` | 301 | 1 | `/vs/standard-notes/` | 200 |
| `/blog/best-memo-apps-2026.html` | 301 | 1 | `/blog/best-memo-apps-2026` | 200 |
| `/methods/gtd/?lang=ja` | 301 | 1 | `/methods/gtd/` | 200 |
| `/blog/iphone-memo-tips.html?lang=ja` | 301 | 1 | `/blog/iphone-memo-tips` | 200 |
| `/blog/iphone-memo-tips?lang=ja` | 301 | 1 | `/blog/iphone-memo-tips` | 200 |
| `/blog/digital-vs-handwritten-notes.html` | 301 | 1 | `/blog/digital-vs-handwritten-notes` | 200 |
| `/blog/chatgpt-memo-workflow.html` | 301 | 1 | `/blog/chatgpt-memo-workflow` | 200 |
| `/blog/engineer-code-snippets.html` | 301 | 1 | `/blog/engineer-code-snippets` | 200 |
| `/blog/email-management-tips.html` | 301 | 1 | `/blog/email-management-tips` | 200 |
| `/blog/travel-planning-memo.html` | 301 | 1 | `/blog/travel-planning-memo` | 200 |
| `/blog/ai-vs-simple-memo.html` | 301 | 1 | `/blog/ai-vs-simple-memo` | 200 |
| `/blog/ios-quick-capture-comparison.html` | 301 | 1 | `/blog/ios-quick-capture-comparison` | 200 |
| `/blog/gen-z-memo.html` | 301 | 1 | `/blog/gen-z-memo` | 200 |
| `/blog/morning-memo-routine.html?lang=ja` | 301 | 1 | `/blog/morning-memo-routine` | 200 |
| `/blog/morning-memo-routine?lang=ja` | 301 | 1 | `/blog/morning-memo-routine` | 200 |
| `/blog/travel-planning-memo.html?lang=ja` | 301 | 1 | `/blog/travel-planning-memo` | 200 |
| `/blog/travel-planning-memo?lang=ja` | 301 | 1 | `/blog/travel-planning-memo` | 200 |
| `/vs/simplenote/?lang=ja` | 301 | 1 | `/vs/simplenote/` | 200 |
| `/blog/student-memo-app?lang=ja` | 301 | 1 | `/blog/student-memo-app` | 200 |
| `/vs/todoist/?lang=ja` | 301 | 1 | `/vs/todoist/` | 200 |
| `/vs/trello/?lang=en` | 301 | 1 | `/vs/` | 200 |
| `/vs/whatsapp/?lang=en` | 301 | 1 | `/vs/` | 200 |
