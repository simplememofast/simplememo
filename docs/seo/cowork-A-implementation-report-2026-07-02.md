# simplememofast.com 実装完了報告（Cowork Phase 0–1 実装依頼書 A系統）

### 実施日
2026-07-02

### 実施者
simplememofast.com担当者（Claude Code セッション）

### 対応した項目
- [x] A1 構造化データ差分（**方針転換1件を含む** — 下記）
- [x] A2 /voice-input/ hreflang
- [x] A3 llms.txt（**新規設置ではなく既設ファイルへの差分追記** — 下記）
- [x] A4 ブランド主称統一（JSON-LD name統一 + App Storeスラッグ842箇所短縮）
- [x] A5 title/meta改善（second-brain×2 実施 / capacities・notion-vs-evernote は理由付き保留）
- [x] A6 robots.txt追記（Claude-SearchBot / Claude-User）
- [x] A8 captioo確認（**是正不要と判定** — 下記）
- [x] C2 404補助（**本日別途トリアージ済み** — 判断表下記）

---

## 依頼書の前提訂正（4点）

実装前検証で、依頼書の前提のうち以下が現状と異なった。

1. **A3「llms.txtの設置」→ 既設。** `/llms.txt` は配信済み（200, text/plain）で、CORRECT/WRONG引用ルール・30トピックのソースマップ・出典付きquick answersを含む依頼書案より詳細な内容。置き換えず、依頼書要求の不足分のみ追記した（Current facts行: version 3.8 / rating 4.4(10) / 価格 / iOS 16.0+、および「公開値以外を推測しない」指示）。
2. **A8 `captioo` → 誤字ではない。** Captioo は 808 inc. が現在も配信する実在の別アプリ（本家Captioとは無関係）。`/vs/captioo/` と `/blog/captioo-alternative` は「オー2つの別アプリ」であることを本文で明示する比較ページであり、canonical・内部リンクとも整合。**301是正は不要**（依頼書A8-2の「意図的に維持してよい場合」に全件合致）。
3. **C2 404×5 → 本日トリアージ済み**（docs/seo/gsc-index-triage-2026-07-02.md, PR #370）。判断表は下記。
4. **A5 capacities → 前日リタイトル済み。** `/vs/capacities/` は 2026-07-01 マージのCTRスプリント（PR #367）で「Capacitiesとは？特徴・料金・Obsidianとの違いまで徹底比較【2026】」へ変更済み。依頼書のGSC値（CTR 0.9%）は**変更前の計測**。再変更は7/29予定の効果測定を汚染するため**保留**（測定後に判断）。

---

## A1 構造化データ — 実施詳細

**実測裏取り:** iTunes Lookup API 直取得で依頼書の値を全て確認（`Obsidian連携シンプルメモ - 最速の音声入力` / v3.8 / 2026-06-25 / 4.4 / 10件 / iOS 16.0）。

**対象:** `#app` エンティティを定義する12ブロック（JA/ENホーム、JA/EN captio-alternative、8ロケールホーム）。うち `en/index.html` は別エンティティ `en/#app` になっていたため `#app` へ統合（他ページからの参照なしを確認済み）。

| 項目 | 変更前 | 変更後 |
|---|---|---|
| @type | MobileApplication×10 / SoftwareApplication×2 | **SoftwareApplication ×12** |
| name | JA/EN混在 | **Obsidian連携シンプルメモ**（EN名はalternateName先頭） |
| alternateName | 5件 | 6件（App Store現行タイトル追加） |
| softwareVersion | 3.4 | **3.8** |
| datePublished | 2026-02-13 or なし | **2026-02-12**（ストア実値） |
| dateModified | 2026-06-10 or なし | **2026-06-25** |
| operatingSystem | iOS / iOS 16.0+ 混在 | **iOS 16.0+** |
| aggregateRating | なし | **4.4 / 10件**（best 5 / worst 1） |
| sameAs | なし〜不揃い | **8 URL統一**（下記） |

**⚠️ 方針転換の明示:** aggregateRating は 2026-06 監査で「サイト全体0件」を方針として意図的に削除していた。本依頼書の明示指定（実測値のみ・4.4/10）に基づき**方針を転換して再実装**。可視パリティはホームページの「★4.4、10件の評価」表示で成立。**ストア値変動時はサイト表示・JSON-LD・llms.txt の3点同時更新が必須**（§5.2連携事項）。

**依頼書からの逸脱（3点、いずれも実測ルール由来）:**
- sameAs から `qiita.com/organizations/simplememo` を除外（**live 404**）。残8件は200確認済み（AlternativeToの403はbot遮断で既知の生存URL）。
- EN名は既存カノン `Simple Memo - for Obsidian`（ハイフン）を維持。依頼書のemダッシュ表記は採用せず（サイト内全表記と不一致になるため）。
- downloadUrl はページ地域別（JA=jp / EN=us）を維持。description・featureList・offers等のローカライズ済みフィールドも保全（受入基準の対象外項目）。

**受入検証:** 12/12ブロックで全基準パス（機械検証）。サイト全体 JSON-LD 729/729 パース成功。FAQ/Article/BreadcrumbList無破壊。ホーム/ENホームの `#organization` sameAs も同一8件に統一。

## A2 /voice-input/ hreflang

`<link rel="alternate" hreflang="ja">` + `x-default`（自己参照）をcanonical直後に追加。EN版新設は行わず（依頼書A2-2の最低限構成）。canonical・sitemapと矛盾なし。同クラスの既知残余（/en/blog/ios26-speechanalyzer-live-mic, /guides/gmail/）は監査バックログ管理。

## A4 ブランド主称

- 本文主称は 2026-06-04 リブランド+PR #321 の全文スイープで統一済み（H1/CTA/ヘッダー/FAQ初出は監査で確認済み）。今回の追加実施は **JSON-LDのname統一**（A1に含む）と **App Storeリンクの旧スラッグ掃除**。
- **旧スラッグ842箇所（227ファイル）を短縮形 `apps.apple.com/{jp,us}/app/id6758438948` へ更新**。短縮形はAppleが現行タイトルのスラッグへ単一ホップ301するため、今後ストアタイトルが変わってもリンクが陳腐化しない。`ct=` トークンは全て保全。

## A5 title/meta

| ページ | 判断 | 内容 |
|---|---|---|
| /vs/capacities/ | **保留** | 前日リタイトル済み。7/29のCTR測定後に再評価 |
| /vs/notion-vs-evernote/ | **変更不要** | 現行「Notion vs Evernote どっちがいい？【2026年版】料金・速度・実比較」+ meta が依頼書方針を既に充足 |
| /glossary/second-brain/ | **変更** | 「セカンドブレイン（Second Brain）とは — 意味と作り方」— ラテン表記クエリ対応 + 接尾辞削除 |
| /methods/second-brain/ | **変更** | 「セカンドブレイン（Second Brain）の作り方 — メールメモ×Obsidianで構築」 |

second-brain両ページは title / og:title / twitter:title / meta-template / JSON-LD headline / WebPage.name / H1 を全て同期（本日のHigh修正で確立した非同期防止手順）。**反映日: 2026-07-02。CTR再確認: 2026-07-30。**

## A6 robots.txt

`Claude-SearchBot` / `Claude-User` の明示スタンザを既存Claude-Web直後に追加（既存UAブロック・Disallow群は無変更）。

## C2 404判断表（gsc-index-triage-2026-07-02 より）

| URL | 種別 | 原因 | 対応 | 301先 | 内部リンク修正 | 備考 |
|---|---|---|---|---|---|---|
| /blog/energy-budget-field-notes | 外部捏造 | ネガティブSEOリンク | **404維持** | なし | 不要（内部リンク0） | git全履歴に不存在 |
| /blog/i-was-wrong-about-todo-debt | 外部捏造 | 同上 | **404維持** | なし | 不要 | 同上 |
| /blog/ios-cold-start-1-4s-to-287ms | 外部捏造 | 同上（旧速度クレーム模倣） | **404維持** | なし | 不要 | 同上 |
| /blog/no-third-party-deps-ios-18-months | 外部捏造 | 同上 | **404維持** | なし | 不要 | 同上 |
| /cdn-cgi/l/email-protection | CF機能残滓 | メール難読化 | **robots Disallow済み** | なし | 不要 | 対応完了 |

301を張らない理由: 捏造URLへのリダイレクトはスパムリンクの着地点を作る（オーナーは7/2に「Google公式ガイダンスに従いスルー」を決定済み）。

### 検証結果
- リッチリザルト相当（構文+必須プロパティ機械検証）: SoftwareApplication 12/12 エラー0（aggregateRating/offers/rating値一致含む）
- JSON-LD全体: 729/729 パース、FAQパリティ390/390
- robots.txt / llms.txt: 変更後もローカル整合（デプロイ後に live 200 を確認すること）
- hreflang: /voice-input/ 自己参照+x-default、canonicalと矛盾なし
- GSC確認: マージ後に URL検査（/, /en/, /captio-alternative/, second-brain×2）を推奨

### 未対応・保留
- **A5 capacities**: 7/29 CTR測定後に再評価（測定汚染防止）
- **A2 EN版 /en/voice-input/**: 新設せず（EN長期戦方針と整合、需要データ待ち）
- **§5連携**: Bing登録・paji.me 301平坦化・robots経路はapi担当者側タスク

### ロールバック方法
- 対象: 本PR（2コミット: A系統 + スラッグ掃除）を `git revert`
- aggregateRating のみ戻す場合: `#app` ブロック12件から `aggregateRating` キーを削除（変更前の全フィールド値は scratchpad/a1-before.json 相当を本報告の変更前表に記録済み）

### 運用メモ（§5.2 iOS連携）
App Storeの **バージョン / 評価 / 価格** が変わったら、次の3点を同時更新: ① `#app` JSON-LD（12ファイル）② llms.txt「Current facts」行 ③ ページ可視表示。次回チェック推奨: 2026-08-01（月次SERPチェックと同時）。
