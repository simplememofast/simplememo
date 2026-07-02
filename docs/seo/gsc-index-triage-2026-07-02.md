# GSC「ページのインデックス登録」トリアージ — 2026-07-02

対象: GSCインデックス未登録レポート(最終更新 2026-06-12、初検出 2026-05-23)。個別URLのクロール日は大半が2026年3〜5月で、**レポートは修正前の状態を映した残像**。バケットごとに実地検証した結論を記録する(次回のGSC確認時に再調査しないこと)。

## 結論サマリ

| バケット | 件数 | 判定 | 対応 |
|---|---|---|---|
| ページにリダイレクトあり | 74 | ✅ 設計どおり | 不要(情報表示) |
| クロール済み・未登録 | 60 | ✅ 大半は残像/正常 | 不要(下記注記) |
| robots.txtによりブロック | 77 | ✅ 修正済み(PR #270) | GSCで検証開始のみ |
| 代替ページ(canonicalあり) | 12 | ✅ 正常動作 | 不要 |
| 404 | 5 | ⚠️ 4件は捏造URL | 404のまま正しい+リンク元調査 |
| noindex除外 | 1 | ✅ 意図どおり | 不要 |

**リポジトリ側で新たに直すものはゼロ。** 検証済みの現況: `?lang=` は全パターン301(/, ディレクトリ, blog記事で実測)、robots.txtに`?lang=`ブロックなし(PR #270で解除済み)、`search_term_string`(偽SearchAction)はソース・live共に0件、`/cdn-cgi/`はrobotsでDisallow済み、`.html`→クリーンURLは308、`/en/vs/evernote//`の発生源(スキーマ内の`//`URL)は本日PR #369で修正済み。

## バケット別詳細

### 1. リダイレクトあり(74) — 対応不要
`.html`変種・`?lang=`変種・`/en`(スラなし)・統合済み旧URL(captio-alternatives-comparison, memo-shuukan-tips, vs/trello, vs/slack-self-dm, vs/whatsapp等)。全て意図した301/308で、канонical先がインデックスされている。このバケットは「エラー」ではなくGoogleの仕様上の情報表示。

### 2. クロール済み・未登録(60) — 対応不要(残像+品質判断)
- パラメータ/`.html`変種(クロール3〜4月) = リダイレクト実装前の残像。再クロールで#1へ移動して消える。
- `/blog/?q={search_term_string}` (3/21クロール) = 過去に存在した偽SearchActionの残骸。現在スキーマから削除済み・当該URLは200+self-canonical(/blog/)で無害。
- `/?ref=…` `/?from=…` = 外部サイト由来のパラメータURL。現robots.txtは `?ref=`/`?from=`/`?utm_` をDisallow(意図的なクロール衛生)。self-canonicalもあり問題なし。
- 実在ページ(en/blog/captio-shutdown-alternatives, methods/second-brain 等)= Googleの品質/需要判断。エラーではない。EN側は「長期戦・抑制」方針(GSC戦略メモ)どおり内部リンク強化で漸進。

### 3. robots.txtブロック(77) — 修正済み、GSCの検証開始のみ
全件が`?lang=`URL(クロール5/9〜5/22)。当時robots.txtにあった`?lang=`ブロックは **PR #270「un-block ?lang= so the middleware 301 can reach Googlebot」で解除済み**。現在は全`?lang=`が301を返す(実測)。Googleが再クロールすれば自然解消。**オーナー対応: GSCの当該レポートで「修正を検証」を開始**(任意だが解消を早める)。

### 4. 代替ページ・canonicalあり(12) — 対応不要
canonicalが正しく機能している証跡。`/en/vs/evernote//`(6/5クロール)は en/vs 全11ページのスキーマ内`//`URLが発生源で、**本日PR #369で69箇所修正済み** — 再発しない。

### 5. 404(5) — 4件は捏造URL(ネガティブSEO新パターン)、404のままが正解
```
/blog/energy-budget-field-notes          (6/12クロール)
/blog/i-was-wrong-about-todo-debt        (6/11)
/blog/ios-cold-start-1-4s-to-287ms      (6/6)
/blog/no-third-party-deps-ios-18-months (5/31)
```
検証結果: **4スラッグともgit全履歴に存在せず**(ファイル・コミット・文字列とも0件)、サイト内リンク0、sitemap非掲載、自社の外部発信ドラフト(docs/, admin/, research)にも0件。= **外部で捏造されたURL**。HN風の英語スラッグ+旧速度クレーム風の数字(287ms)を含み、進行中のバックリンク・インジェクション(docs/disavow.txt, 264ドメイン)と同一攻撃者の可能性が高い。

対応: リダイレクトも410も**不要**(存在しないURLへの404はGoogleにとって正しい応答であり、ペナルティなし。リダイレクトすると逆にスパムリンクの受け皿になる)。
**オーナー対応: GSCの「リンク」レポートでこの4URLへのリンク元ドメインを確認し、新規ドメインなら docs/disavow.txt に追加**して再アップロード。

残る1件 `/cdn-cgi/l/email-protection` はCloudflareのメール難読化機能の副産物。robots.txtで`/cdn-cgi/`をDisallow済みで、以後クロールされない。対応不要。

### 6. noindex除外(1) — 意図どおり
`/en/blog/revenue-report-2025` = 意図的なドラフト(PR #116)。数値プレースホルダ問題は監査Medium #10としてバックログ管理中。

## オーナー対応まとめ(GSC UI、リポジトリ外)
1. robots.txtブロックのバケットで「修正を検証」を開始(#3)
2. リンクレポートで捏造4URLのリンク元→必要なら disavow 追加+再アップロード(#5)
3. (既存の開放項目) PR #369 修正ページのURL検査リクエスト、disavow 264版のアップロード確認
