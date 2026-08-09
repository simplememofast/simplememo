# SimpleMemo SEO Growth Audit — 2026-08-09

調査範囲: `simplememofast/simplememo` 全体（244 HTMLファイル / 5ワークフロー / 29スクリプト /
`docs/` 内のSEOレポート19本）+ `simplememo-ios` の現行バージョン照合。
**本レポート作成時点でサイトのコード・コンテンツは一切変更していない。**

数値の出典は3種類あり、本文中で区別している:

- **実測** — 本監査でリポジトリを走査して数えた値（再現コマンドを併記）
- **既存レポート由来** — `docs/seo/*.md` に記録されたGSC/Ahrefsの値。
  取得日を明記する（最新は2026-08-05スナップショット）
- **推定** — 業界標準の順位別CTRカーブ等に基づく試算。前提を明記する

> **重要な制約**: このリポジトリに **GSCの生データは1バイトも入っていない。**
> 全てのGSC数値は19本のMarkdownレポートの散文中にのみ存在する。したがって本監査の
> 「機会スコア」「衰退検知」「カニバリ検知」は、**リポジトリから機械的に再計算できない**。
> これ自体が最大の構造的問題であり、§5-1 と P0-1 で扱う。

---

## 1. Current architecture

| 項目 | 実態 |
|---|---|
| 形式 | **ビルドなしの静的HTML**。フレームワーク・CMS・テンプレートエンジンなし。ルートに`package.json`すら無い |
| ホスティング | Cloudflare Pages（`main` push で自動デプロイ = 本番反映） |
| エッジ処理 | `functions/_middleware.js`（Pages Functions）。`//`畳み込み → `.html`剥がし → `?lang=`剥がし → 退役パス解決 を **1ホップの301**にまとめている |
| 言語 | JA（ルート）/ EN（`/en/`）が実コンテンツ。他8ロケール（es/ko/zh/zh-Hant/ar/id/pt-BR/tr）は**各1ページのみ** |
| CI | `.github/workflows/seo-check.yml` に**5つのゲート**: seo-check / URL正規化(172アサーション) / 内部リンク直200(11,268リンク) / site-constants整合 / sitemap dry-run。`main` pushでIndexNow送信 |
| マージ | `auto-merge.yml` が SEO Validation の `workflow_run` 成功時のみ、**検証済みSHAを指定して**マージ。draft PRは対象外 |

**実測ページ数**（`admin/` `tools/` `docs/` 除外、noindex除外）:

```
全HTML 244 / JA インデックス対象 188 / EN 41 / 他ロケール 8 / admin 3
```

JA内訳: `blog` 59・`vs` 39・`use-cases` 22・`glossary` 21・`guides` 10・`methods` 7・
`devlog` 7 + LP/ハブ 12（`/` `/obsidian/` `/voice-input/` `/apple-watch/` `/siri/`
`/ai-tags/` `/hands-free/` `/fastest-voice-memo/` `/line-keep/` `/captio-alternative/`
`/note-to-email/` `/templates/` 等）+ 法務/FAQ等。

**所見**: 静的HTMLでこの規模を保っているのは驚異的だが、**テンプレート層が無いため
「全ページに1つの要素を足す」が常に全ファイル置換になる**。実際 §6 の対策では
90ページのdescriptionを一括書き換えしており、Pythonスクリプトによる一括置換が
事実上のテンプレート機構として機能している。これは §11（Internal Link Engine）や
§15（検索意図別CTA）をやろうとした時の主要な摩擦になる。

## 2. Current SEO implementation

**成熟度は高い。** `node scripts/seo-check.js` の実測結果:

```
0 errors / 165 warnings   ← 165件すべて [HREFLANG]（意図的な残置、07-25レポート §5）
```

実装済みのもの（実測で確認）:

- canonical 全ページ / meta robots `index,follow,max-image-preview:large,max-snippet:-1` 100%カバー
- JSON-LD: Article・FAQPage・BreadcrumbList・SoftwareApplication・Organization・WebSite。
  FAQPageは**可視HTMLとの回答パリティ**をCIで担保
- sitemap 3分割（ja/en/locales）+ index。`generate_sitemap.py` はgit履歴からlastmodを導出し、
  40ページ超の一括変更を「機械的sweep」として除外する閾値を持つ
- robots.txt: **17のAIボット/11ベンダー**を明示Allow、CCBot/Bytespider等はDisallow
- `llms.txt`（22KB）: AI引用のための一次情報宣言。誤引用パターン（E2EE誤認・Captio後継誤認）を
  名指しで禁止する記述まである
- **孤立ページ 0**（実測: 全188ページが最低1本の文脈内部リンクを持つ）

**実測で見つかった弱点**:

| # | 内容 | 実測値 |
|---|---|---|
| 2-1 | **JAタイトルが長すぎる** | 40字超 **97/188 (52%)**、45字超 **64ページ**。日本語SERPは概ね30〜32全角で切られる |
| 2-2 | **構造化データの版数が古い** | `"softwareVersion": "3.9"` が **12ブロック**。iOS実機は **5.7.3**（`simplememo-ios` の `project.pbxproj` 実測） |
| 2-3 | **llms.txt の Current facts が2026-07-25 / v3.9 のまま** | 以後 v4.x〜5.7.3 で Siri空振り検知・AirPods機種別案内・Watch上限預かり・オンボーディング刷新・ペイウォールが出荷済み |
| 2-4 | hreflang 165件欠落 | `/vs/*` を中心に。EN対応版が無いページなので意図的だが、`x-default`self参照は入れられる |

2-2 と 2-3 は **AI引用（§26）に直接効く事故**である。`llms.txt` は「この値を超えて
推測するな」と明示的に指示しているため、**誤った版数を権威づけて配っている**状態になる。

## 3. Current analytics implementation

| 層 | 実装 | 状態 |
|---|---|---|
| GA4 | `G-EPZVZKCVQG`、遅延ローダ経由 | ✅ 稼働 |
| App Store遷移 | `js/app-store-tracking.js` → GA4 `app_store_click`（`ct` / `page_path` / `link_url`） | ✅ 稼働 |
| App Store Connect帰属 | `?ct=` トークン **875リンクに付与**（`ct=vs-obsidian-jp` 等ページ単位） | ✅ 稼働 |
| Cloudflare Web Analytics | CSPが `static.cloudflareinsights.com` をブロック | ❌ **死んでいる**（07-07監査 item 9、未決着） |
| Search Console | リポジトリ連携なし。API・CSV・BigQueryいずれも無し | ❌ **手動のみ** |

**GA4イベントは実測で3種類しかない**:

```
app_store_click / ai_tags_cta_click / template_copy
```

**致命的な計測ギャップ**:

1. **CTA配置の次元が無い。** JAページは平均4本のApp Storeリンクを持つ
   （実測分布: 2本=14 / 3本=15 / **4本=123** / 5本=6 / 6本=18 / 7本=9 / 8本=1 / 9本=1 / 16本=1）が、
   `ct=` も `link_url` も**ページ単位で同一**。したがって
   「ヒーローのCTAとページ末のCTAのどちらが効いているか」は**原理的に判別できない**。
   ブリーフ §16 の CTAテストは現状の計装では実施不可能。
2. **CTAインプレッションを取っていない。** クリックしか見ていないため、
   CTR分母（何人がCTAを見たか）が無く、CTAの改善は常に「クリック数の増減」でしか語れない。
3. **`ct=` 未付与のApp Storeリンクが137本**あるが、うち大半は競合アプリへの参照リンク
   （Evernote/Todoist/Joplin等）で正常。自社リンクの未付与は8本程度。

## 4. Current content structure

**JA 188ページの実質クラスタ**（URL・タイトル・内部リンクから実測）:

| クラスタ | ページ数 | ピラー | 状態 |
|---|---|---|---|
| 比較（`/vs/*`） | 39 | `/vs/` | 最大。1対1比較が中心 |
| ブログ | 59 | `/blog/` | テーマ横断。クラスタ帰属が曖昧なものが多い |
| ユースケース | 22 | `/use-cases/` | 職業・場面別 |
| 用語集 | 21 | `/glossary/` | AIO向け定義ページ |
| Obsidian | 7 | `/obsidian/` | ✅ ピラーあり |
| Captio移行 | 7 | `/captio-alternative/` | ✅ 最強被リンク先（papapapa.hatenablog DR90 dofollow） |
| 音声入力 | 4 | `/voice-input/` | ⚠️ `/hands-free/` `/fastest-voice-memo/` `/siri/` と**役割が重複** |
| LINE Keep | 4 | `/line-keep/` | ⚠️ **インテント不一致**（§5-3） |
| Apple Watch | 2 | `/apple-watch/` | 面が薄い（勝ち筋なのに） |
| AIメモ | 1 | `/ai-tags/` | ⚠️ **クラスタ未形成**（ブリーフ §8 Cluster C が事実上空） |

**ハブ/ピラーページは12個すべて存在する**（実測: `/obsidian/` `/voice-input/`
`/apple-watch/` `/siri/` `/ai-tags/` `/blog/` `/vs/` `/use-cases/` `/glossary/`
`/methods/` `/guides/` `/templates/`）。ブリーフ §12 の要求は構造としては満たされている。

**インタラクティブな無料ツールは 0 個。** `/templates/` にコピーボタンがあるだけで、
計算機・ジェネレータ・診断の類は存在しない（実測: 全HTMLで
`addEventListener`/`querySelector` が8回を超えるページは0件）。ブリーフ §10.3 は完全に未着手。

## 5. Biggest problems

### 5-1. 【最大】測定ループが一度も閉じていない

これが本監査の最重要発見である。

2026-07-01/02 に **11ページのタイトルを変更**し、「CTR評価まで凍結、**評価日 7/29-30**」
というプロトコルを敷いた（`cowork-W-implementation-report-2026-07-02.md` 末尾に明記）。
以後のレポートは繰り返し「7/29に判断」「凍結中のため触らない」と書いている。

**その評価レポートは存在しない。** `docs/seo/` の全19本を確認した結果:

```
07-25  gsc-coverage-fix
07-26  gsc-robots-alternate
（7/29-30 の評価レポートなし）
08-08  gsc-ahrefs-fix  ← 「07-29」の言及はAhrefsクロール日の比較のみ
```

同期間のコミットは `/siri/` LP関連が7本、カバレッジ/メタ整備が3本。
**サイト最大のCTRレバーは、判断期限を11日超過したまま、5週間以上放置されている。**

具体的に凍結されたまま動いていない資産（既存レポート由来、28日値・2026-07-04時点）:

| ページ | imp | CTR | pos |
|---|---|---|---|
| `/blog/line-keep-alternative` | **4,045** | **0.9%** | 7.2 |
| `/blog/best-memo-apps-2026` | 2,035 | 2.2% | 6.7 |
| `/glossary/aes-gcm/` | 703 | 1.1% | 13.1 |
| `/obsidian/` | 682 | 7.3% | 7.9 |
| `/vs/capacities/` | 485 | 1.4% | 8.4 |
| `/vs/notion-vs-evernote/` | 433 | 3.7% | 11.6 |

さらに 07-16 レポート §5 が「7/29実行」として用意したFAQ草案の実装状況を**実測**した:

| 予定 | 現状 |
|---|---|
| line-keep 「どこ」FAQ 4問 | ❌ **未実装**。`blog/line-keep-alternative.html` に文字列「どこ」は **0回**出現 |
| `/apple-watch/` 音声入力NL FAQ | ❌ 未実装（FAQ 3問、該当なし） |
| best-memo-apps AI クエリ FAQ 4問 | ⚠️ **1/4のみ実装**（「チームで共同編集」は有り。「払う価値」「社会人評価」「手書き変換」は無し） |

**構造的原因**: 運用が「監査 → 修正 → レポート」の一方向で、
**測定結果が次の意思決定に戻る経路が人間の記憶にしか存在しない。**
凍結解除を促す仕組み（カレンダー・CI・ファイル）が一切ない。

### 5-2. GSCデータが「データ」として存在しない

19本のレポートは高品質だが、数値はすべて**散文中の表**である。結果として:

- 機会スコア（ブリーフ §6）を計算できない
- コンテンツ衰退検知（§23）— 28日 vs 前28日の比較が機械的にできない
- カニバリ検知（§22）— Query×Page の突合ができない
- 週次アクションキュー（§30）— 毎回ゼロから人間が読み直す必要がある

**AIによる継続運用（§36）の前提が欠けている。** 現状のAI運用は「その場でレポートを書く」
までで、**状態を持たない**。

### 5-3. LINE Keep クラスタ: 最大imp × 最低CTR × インテント不一致

サイト単一で最大のimp源（月間1万imp級）が、CTR 0.9%で沈んでいる。原因は順位ではなく
**検索意図とページの答えがずれている**ことにある。

07-16時点のサブインテント分布（7日、既存レポート由来）:

```
「line keepメモ どこ」   122 imp / 0 クリック / pos 9.7  ← 単一最大
「line keep 終了」        93 imp
保存期間 8 / 引き継ぎ 1 / 復活 1 / 怖い 1
```

**「どこ」は「LINEのKeepメモはどこにあるの？」という現在地の質問**である。
これに対しサイトが並べているのは4本の「代替アプリ / 移行」ページ:

```
/blog/line-keep-alternative   LINE Keepは終了・Keepメモは継続中｜代わりのメモアプリと保存先【2026】
/line-keep/                   LINE Keep終了後の代替アプリ — …で即メモ再開 | 移行ガイド付き
/vs/line-keep-memo/           LINE Keepメモとシンプルメモの違い — 比較と移行ガイド
/blog/line-keep-migration     LINE Keepからの移行手順【保存版】｜データ退避と次のメモ先
```

同一クエリ群に4URLが並ぶ**カニバリ状態**であり、かつ**どれも「どこ」に答えていない**
（実測: 該当ページに「どこ」0回）。クリックされないのは当然である。

### 5-4. プロダクト事実の陳腐化（AI引用の毒）

`llms.txt` と12本のJSON-LDが **v3.9（2026-07-25時点）** を宣言しているが、
iOSアプリは **v5.7.3**。間に入った出荷（`simplememo-ios` のgit log実測）:

```
v5.0.3 → 5.2.x オンボーディング/音声FAB修正 → 5.3.0 行き先図解
→ 5.4.x ペイウォール/オンボーディング → 5.5.0 Watch上限預かり
→ 5.6.0 AirPods機種別のSiri呼称案内 → 5.7.0 Siri空振り検知 → 5.7.3
```

`llms.txt` は「Last-updated を鮮度シグナルとして扱え / 公開値以外を推測するな」と
明示している。**古い値を権威づけて配布している**状態で、AI検索経由の訴求力を
自ら削いでいる。しかも `/siri/` LPで大々的に打ち出している AirPods/Siri 機能は、
一次情報宣言ファイルには**存在しないことになっている**。

### 5-5. 施策の期待値配分が崩れている

直近12コミットのうち **7本が `/siri/` LP 1ページ**に投下されている。
`/siri/` は 2026-08-05 公開で、GSCの実績はまだ無い（当然）。一方で
4,045 imp を持つクラスタは触られていない。

**「需要が実証済みの面」より「新しく作った面」に手が向く**という、
コンテンツ運用でもっとも頻出するバイアスがそのまま出ている。

### 5-6. その他（実測）

- タイトル40字超 97ページ（52%）。SERPで切られている
- 文脈内部リンクが1〜2本のページが19本（`/use-cases/*` に集中）
- Cloudflare Web Analytics がCSPで死んだまま（07-07から未決着）
- 他8ロケールが各1ページのまま。hreflangクラスタとしては成立しているが、成長には寄与していない

## 6. Biggest opportunities

**推定の前提**: 順位別期待CTRは業界標準カーブ（日本語・情報系）を使用。
pos6≈4.3% / pos7≈3.4% / pos8≈2.8% / pos9≈2.3% / pos10≈2.0% / pos11-15≈1.3%。
これは**実測ではなく参照値**であり、実データで置き換えるべきもの（P0-1）。

| # | 機会 | 現状 | 妥当な到達点 | 増分クリック/月（推定） |
|---|---|---|---|---|
| 1 | **line-keep クラスタのインテント適合** | 4,045 imp / 0.9% / pos7.2 | CTR 2.2%（期待値の2/3） | **+53** |
| 2 | 同上・「どこ」クエリへの直接回答 | ~490 imp/月 / 0% / pos9.7 | CTR 4%（回答が一致すれば順位も上がる） | **+20** |
| 3 | best-memo-apps-2026 | 2,035 imp / 2.2% / pos6.7 | CTR 3.6% | **+28** |
| 4 | vs/capacities | 423 imp / 0.9% / pos8.1 | CTR 2.4% | **+6** |
| 5 | glossary/aes-gcm | 703 imp / 1.1% / pos13.1 | 本文拡充で pos10 → CTR 2.0% | **+6** |
| 6 | **音声×Obsidian の面展開** | `/blog/obsidian-voice-input` が **CTR 10.5% / pos6.2** を実証 | 同型3〜5本 | **+40〜80** |
| 7 | サイト全体のタイトル短縮（64ページ） | 45字超 | 段階的に測定しながら | 未推定（実験扱い） |

**1〜5の合計で +113 クリック/月**。現在のオーガニックは約 **467 クリック/月**
（1,400/3ヶ月）なので、**+24%**に相当する。6を含めれば +30〜40% が射程に入る。

**最大の機会は「新記事を書くこと」ではなく、既に7万impを集めている面のCTRを
期待値まで戻すこと**である。これはブリーフ §3.1 の優先順位そのものと一致する。

### 6-1. ただし Tier 1（事業成果）への効き方は一様でない

正直に書く。line-keep クラスタの検索者は **Business Relevance が低い**。
「Keepメモどこ？」はLINEの機能の現在地を知りたい人で、メモアプリを乗り換える気は薄い。
ブリーフ §6 の分類では **情報収集だけ = 0.3**。

したがって:

- **Tier 2（クリック・CTR）には最大のレバー** — ここは疑いない
- **Tier 1（インストール）への転換率は低い** — 汎用CTAを置いても意味がない。
  「Keepメモの中身を外に逃がす」という**この読者固有の動機に接続するCTA**が要る（§12）
- 対して **6（音声×Obsidian）は Business Relevance 1.0 に近い。**
  `obsidian-voice-input` の CTR 10.5% は、意図とページが噛み合った時の到達点を実証している

**期待値順に並べるなら、Tier 1 を重く見れば 6 が最上位、Tier 2 を重く見れば 1 が最上位。**
両方やるべきで、順序は「1（安いので先に刈る）→ 6（本命の面展開）」が妥当。

## 7. Quick wins

即日〜数日で実行でき、期待値がプラスであることが既存データから言えるもの:

| # | 施策 | 根拠 | 工数 |
|---|---|---|---|
| Q1 | `llms.txt` + JSON-LD 12ブロックの版数を 5.7.3 系へ是正、Siri/AirPods/Watch の現行機能を追記 | 実測で不一致確認済み。AI引用の一次情報が誤っている | **XS**（半日） |
| Q2 | line-keep クラスタへ「どこ」FAQ 4問（07-16 §5 に草案が完成済み） | 122 imp/週・0クリックの単一最大クエリに**答えが存在しない** | **S** |
| Q3 | 07-01/02 リタイトル11ページの**評価を実施**し、凍結を解除 | 判断期限を11日超過。実験が腐る前に確定させる | **S**（GSC参照が必要=オーナー） |
| Q4 | best-memo-apps-2026 に未実装のAIクエリFAQ 3問 | pos6.2〜7.1でAI検索に読まれている実績あり | **S** |
| Q5 | `/apple-watch/` に「apple watchでメモを音声入力するには？」FAQ | NLクエリ 7 imp/週 pos9.4、クラスタ合計95 imp/週 | **XS** |
| Q6 | 文脈内部リンク1〜2本の19ページを3本以上へ | 実測。`/use-cases/*` に集中 | **S** |

**Q3 だけはリポジトリから実行できない**（GSCの実データ参照が必要）。
残り5つはすべてリポジトリ内で完結する。

## 8. Content clusters

現状を踏まえた再設計案。**新設よりも「既存の再配置」を優先**する。

### Cluster A: Obsidian（ピラー `/obsidian/`）— 最重要・Business Relevance 1.0

既存7ページ。`obsidian-voice-input` が CTR 10.5% を出しており、**この軸が本命**。
不足している面（GSCで需要が観測済み、または隣接需要）:

```
Obsidian × 音声入力（既存・勝ち）
Obsidian × iPhone クイックキャプチャ（既存）
Obsidian × Apple Watch（/apple-watch-obsidian/ 既存）
Obsidian × Siri / AirPods         ← /siri/ があるが Obsidian 軸で書かれていない
Obsidian × Inbox / Daily Note 運用 ← 未
Obsidian × 外出先キャプチャ         ← 未
Obsidian × 同期の実務              ← 未
```

### Cluster B: 音声メモ（ピラー `/voice-input/`）— **役割の交通整理が先**

現在 `/voice-input/` `/hands-free/` `/fastest-voice-memo/` `/siri/` の4LPが
似た主題を別々に主張している。**面展開の前に、各LPの担当インテントを1文で確定**すべき。
これをやらずに記事を足すとカニバリを増やすだけになる。

### Cluster C: AIメモ — **事実上の空白。最大の未開拓地**

`/ai-tags/` 1ページのみ。ブリーフ §8 が挙げるクエリ群（AIメモアプリ / AIノート /
AI第二の脳 / AI PKM）に対して面が無い。**かつプロダクトはAI自動タグ付けを実装済み**
（オンデバイス、Apple Foundation Models）。**言えることがあるのに言っていない。**

### Cluster D: 比較（`/vs/` 39ページ）— 飽和。**新規追加を止める**

すでに39本ある。ここに40本目を足す限界効用は低い。むしろ既存の
CTR/順位を測って**下位を統廃合**するフェーズ。

### Cluster E: LINE Keep — インテント再定義（§5-3）

## 9. Existing pages to refresh

期待値順。**すべて既にimpを持っているページ**で、新規作成より確実性が高い。

| 優先 | ページ | 現状 | 打ち手 |
|---|---|---|---|
| 1 | `/blog/line-keep-alternative` | 4,045 imp / 0.9% / 7.2 | 「どこ」FAQ 4問 + intro再構成（冒頭100字で「Keepメモは継続中・場所はここ」と即答）+ 意図別CTA |
| 2 | `/line-keep/` | クラスタ内 | 役割を「移行の実務」に限定し、`/blog/line-keep-alternative` へ集約。FAQ 0本なので追加 |
| 3 | `/blog/best-memo-apps-2026` | 2,035 / 2.2% / 6.7 | AIクエリFAQ 3問追加、dateModified更新 |
| 4 | `/glossary/aes-gcm/` | 703 / 1.1% / 13.1 | pos13は**タイトルでは動かない**。本文拡充（図解 or 実例）が必要 |
| 5 | `/vs/capacities/` | 423 / 0.9% / 8.1 | リタイトル評価後に再判断（Q3待ち） |
| 6 | `/apple-watch/` | 95 imp/週クラスタ / 2.8% / 6.9 | NL FAQ追加、`/siri/` との相互リンク |
| 7 | `/glossary/deep-work/` `/glossary/eisenhower-matrix/` | 70 / 65 imp・pos11-44 | 本文拡充（バックログから昇格） |
| 8 | `/blog/email-self-task-management` | 32+16 imp / pos15前後・クロール済み未登録 | 拡充 + 内部リンク |

## 10. New pages to create

**3〜5本に絞る。** ブリーフ §33「薄いAI記事の大量生成」を避ける。

| # | ページ | 根拠 | 固有価値（必須） |
|---|---|---|---|
| N1 | Obsidian × Siri/AirPods の実務ガイド | `/siri/` はLPであってHow-toではない。Obsidian軸の需要は実証済み | 機種別のSiri呼称差の実測表（アプリに実装済みの知見がある） |
| N2 | AIメモアプリ比較（Cluster C のピラー） | クラスタが空白。プロダクトにAI機能あり | オンデバイスAIタグ付けの**実測サンプル**（入力→生成タグ） |
| N3 | Obsidian クイックキャプチャ運用（Inbox/Daily Note） | Obsidian軸の中核未対応面 | 実際のフォルダ構成 + Shortcut |
| N4 | 音声入力の精度・速度**実測比較**（→ §13 の linkable asset を兼ねる） | 一次情報。被リンク狙い | 実測データ |
| N5 | （保留）EN `/en/voice-input/` | W5で「次スプリント候補」のまま | — |

**N4 は記事とリンク資産を兼ねる**ので優先度が高い。

## 11. Internal linking improvements

現状は**悪くない**（孤立0、文脈リンクの中央値は5〜6本）。改善余地は3点:

1. **1〜2本しかない19ページの底上げ**（実測リスト）:
   `/ai-tags/` `/blog/email-yourself-app-comparison/` `/use-cases/entrepreneurs/`
   `/use-cases/job-hunting/` `/use-cases/moving/` `/use-cases/parents/`
   `/use-cases/pet-care/` `/vs/dynalist/` `/vs/ios-reminders/` `/vs/ios-shortcuts/`
   `/vs/stock/` ほか8本
   — 特に **`/ai-tags/` が1本**なのは問題。Cluster C のピラー候補なのに孤立寸前。
2. **クラスタ内の相互リンクが弱い。** 音声4LP（`/voice-input/` `/hands-free/`
   `/fastest-voice-memo/` `/siri/`）は互いの役割を説明し合っていない。
3. **メタデータ層が無い。** ブリーフ §11 の `seo.primaryTopic` / `intent` / `funnel` /
   `productRelevance` を持つ機構が存在しないため、関連記事は手作業か
   `add-internal-links.js` のハードコードルール頼み。
   **静的HTMLのままメタデータを持たせるなら、HTMLコメント or `data-` 属性 or
   別JSONの3択**。既存の `scripts/` 文化からすると **別JSON（`data/seo-graph.json`）が最も摩擦が少ない。**

## 12. Conversion improvements

**現状のCTAは「全ページほぼ同一」である。** JAページの123本（65%）がApp Storeリンク
ちょうど4本を持ち、`ct=` はページ名のみ。つまり**検索意図に関係なく同じ誘導文**が並んでいる。

ブリーフ §15 が求める意図別CTAは未実装。優先度順:

| # | 施策 | 内容 |
|---|---|---|
| C1 | **CTA配置の計測を可能にする** | `data-cta-placement="hero\|mid\|footer"` を付与し、GA4 `app_store_click` に `placement` を追加。`ct=` にもサフィックス（`ct=obsidian-jp-hero`）。**これが無い限りCTA改善は評価不能** |
| C2 | **意図別CTAコピー** | line-keep読者→「Keepメモの中身を外に逃がす」／Obsidian読者→「Obsidianへ1秒で追記」／音声読者→「キーボードを開かずに」。**汎用CTAを意図別に置換するだけで、新規ページは不要** |
| C3 | CTAインプレッション計測 | IntersectionObserver で `seo_cta_impression`。CTR分母が得られる |
| C4 | Cloudflare Web Analytics の決着 | CSP許可 or 注入OFF。半端に死んでいる状態を解消（07-07から未決着） |

**C1 は他のすべてのCV施策の前提**である。今の計装のままCTA文言を変えても、
効果を「サイト全体のインストール数の揺らぎ」でしか観測できない。

## 13. Linkable asset ideas

**現状ゼロ。被リンク獲得がPR TIMESの単発配信に全面依存している**
（直近は約300impに沈んだ回もある、とオーナー報告）。

期待値順:

| # | 資産 | 被リンク期待 | 根拠 |
|---|---|---|---|
| L1 | **音声入力の精度・速度 実測比較**（Siri / iOS標準 / 各アプリ、日本語） | 高 | 日本語での実測データがほぼ存在しない。表形式で引用されやすい。**既に `/blog/benchmark-methodology` という計測文化がある**ので信頼性を担保できる |
| L2 | **Obsidian URI / frontmatter ジェネレータ**（無料ツール） | 高 | Obsidianコミュニティは開発者比率が高くリンクしやすい。実装コストも低い（静的+JSのみ） |
| L3 | **メモアプリ比較データベース**（39本の `/vs/` を1枚の絞り込み表に集約） | 中〜高 | **既存資産の再利用**で作れる。`/vs/` の内部リンクハブにもなる |
| L4 | Apple Watch からメモ完了までの秒数比較 | 中 | 一次情報。PR素材にもなる |
| L5 | 日本のAI音声メモ利用実態調査（n明記） | 中 | §19 の「独自調査+PR」セット。ただしサンプル収集コストが高い |

**L2 が最も費用対効果が高い**（実装0.5〜1日、静的サイトのまま動く、Obsidian軸の
Business Relevance が高い読者を集める）。

**§19 について**: 「毎月1本PR」は目的化しない方がよい。
**L1 または L4 の実測データが揃った時にPRを打つ**のが、被リンク期待値が最も高い。

## 14. Automation opportunities

ブリーフ §28/§37 の中核。現状 `scripts/` にあるのは**検証**（seo-check, URL正規化,
内部リンク, constants）と**配信**（IndexNow, sitemap, OG生成）であり、
**分析と意思決定の自動化は1本も無い。**

構築すべきもの（`scripts/seo/`）:

| スクリプト | 役割 | 前提 |
|---|---|---|
| `ingest-gsc.mjs` | GSC CSVエクスポート（Query / Page / Query×Page）を `data/gsc/YYYY-MM-DD/*.json` へ正規化して**リポジトリに保存**。以後すべての分析の入力 | オーナーがCSVを置く（またはAPI鍵） |
| `opportunity-score.mjs` | §6 の式を実装。`Impressions × PositionOpportunity × CTRGap × BusinessRelevance` | ingest |
| `find-quick-wins.mjs` | pos 4-15 × 高imp を抽出 | ingest |
| `detect-low-ctr.mjs` | `CTR < expectedCTR(pos) * 0.7 && imp >= 100` | ingest |
| `detect-decay.mjs` | 28d vs 前28d の clicks/imp/pos 比較、理由分類 | 2スナップショット以上 |
| `detect-cannibalization.mjs` | 同一Queryに複数URLが出ているものを検出 | Query×Page |
| `seo-report.mjs` | 週次ダッシュボード（§29）をMarkdownで生成 | 上記 |
| `weekly-actions.mjs` | §30 の P0/P1/P2 アクションキューを生成 | 上記 |
| `title-length-audit.mjs` | 全角換算でSERP切れを検出（実測52%が該当） | なし（即実装可） |

**設計上の要点**:

- **状態をリポジトリに置く**こと。GSCスナップショットをコミットすれば、
  差分がgitで追え、AIが毎回ゼロから読み直す必要がなくなる（§5-2 の解決）
- **変更履歴**（§13 CTR最適化ループ）も同様に `data/seo/experiments.json` として持ち、
  「いつ何を変えて、いつ評価するか」を**ファイルに書く**。
  §5-1 の再発防止はこれ以外にない
- 評価日が来た実験を**CIで警告**すれば、凍結の放置は構造的に起きなくなる

## 15. Prioritized execution plan

---

# P0 — 今すぐ着手

### P0-1. SEO Growth Loop の状態をリポジトリに持たせる（GSC ingest + 実験台帳）

| | |
|---|---|
| **Impact** | **高**（間接だが、他の全施策の精度と再現性を決める） |
| **Confidence** | **高** — 現状「データが無いから毎回人間が読み直す」ことは実測で確定 |
| **Effort** | **M**（2〜3日。スクリプト7本 + データ形式定義） |
| **Reason** | §5-1・§5-2。19本の高品質レポートがあるのに、**次の意思決定に機械的に繋がらない**。11ページの実験が期限を11日超過して放置されたのは根性の問題ではなく**仕組みの欠落**である。実験台帳と評価日CIゲートを置けば構造的に再発しない |
| **Expected KPI** | 直接のクリック増は0。ただし P0-2 以降の施策選定が「推測」から「期待値」に変わる。**週次アクションキューの人間工数を実質ゼロにする**（§36の目標） |

**オーナー依頼**: GSCから Query / Page / Query×Page の28日CSVをエクスポートして
`data/gsc/2026-08-09/` に置く（またはSearch Console API のサービスアカウント鍵を提供）。
これが無いと以降の分析は既存レポートの散文値に依存し続ける。

---

### P0-2. 凍結中11ページの評価を実施し、凍結を解除する

| | |
|---|---|
| **Impact** | **高** — 対象は合計 8,400 imp/28d |
| **Confidence** | **高** — 実験は既に完了しており、あとは読むだけ |
| **Effort** | **S**（GSC参照 + 判断。半日） |
| **Reason** | §5-1。評価日 7/29-30 を11日超過。**放置するほど、リタイトル以外の変数（季節性・競合更新・アルゴリズム更新）が混入して実験が読めなくなる**。今読むのが最後のチャンス |
| **Expected KPI** | 勝ちパターンの確定 → 残り3ページ（line-keep / capacities / aes-gcm）のリタイトル判断が解禁。**P0-3 の前提** |

**これはリポジトリからは実行できない。** オーナーのGSC操作が必要（P0-1が入れば次回から自動化される）。

---

### P0-3. LINE Keep クラスタのインテント適合（「どこ」への直接回答 + 意図別CTA）

| | |
|---|---|
| **Impact** | **高**（Tier 2） / **中**（Tier 1） |
| **Confidence** | **高** — 「該当ページに『どこ』が0回」は実測。答えが無いのだからクリックされないのは論理的に確実 |
| **Effort** | **S**（草案は 07-16 §5 に完成済み。実装はFAQ 4問 + intro + CTA） |
| **Reason** | §5-3。サイト最大のimp源（月間1万imp級）が CTR 0.9%。単一最大クエリ「line keepメモ どこ」122 imp/週に**答えが存在しない**。4URLのカニバリも同時に整理する |
| **Expected KPI** | **+70クリック/月**（4,045 imp を CTR 0.9%→2.2%、加えて「どこ」490 imp/月を 0%→4%）。オーガニック総クリックの **+15%**。ただしBusiness Relevanceは0.3なのでインストール寄与は限定的 — **意図別CTA（「Keepメモの中身を外に逃がす」）を必ずセットで入れる** |

**注**: `/blog/line-keep-alternative` のタイトル変更は P0-2 の評価完了まで行わない
（実験汚染防止）。FAQ・本文・CTAの追加は**タイトル実験と直交する**ので先行可。

---

### P0-4. プロダクト事実の是正（llms.txt + JSON-LD 12ブロック）

| | |
|---|---|
| **Impact** | **中〜高**（AI引用の正確性。§26に直結） |
| **Confidence** | **最高** — v3.9 vs v5.7.3 は両リポジトリの実測 |
| **Effort** | **XS**（半日） |
| **Reason** | §5-4。**誤情報防止のために置いたファイルが、誤情報を配っている。** `/siri/` LPで打ち出しているAirPods/Siri機能が一次情報宣言に存在しない。AI検索経由の流入（既にpos1〜7で読まれている実績あり）を自ら毀損している |
| **Expected KPI** | AI引用の事実精度。副次的に `/siri/` `/apple-watch/` クラスタのAIO引用可能性。**工数が極小なので期待値/工数は最良** |

---

### P0-5. CTA配置の計測次元を追加する

| | |
|---|---|
| **Impact** | **中**（直接効果は0だが、CV改善のすべての前提） |
| **Confidence** | **高** — 「4本のCTAが同一 `ct=`」は実測 |
| **Effort** | **S**（`data-cta-placement` 付与 + tracking.js 拡張 + `ct=` サフィックス） |
| **Reason** | §3・§12。JAページの65%がApp Storeリンク4本を持つのに**どれが効いたか判別不能**。ブリーフ §16 のCTAテストは現状の計装では実施不可能 |
| **Expected KPI** | `app_store_click` を placement 別に分解可能に。**P1のCTAコピー改善が測定可能になる** |

---

# P1 — 2〜4週間

### P1-1. 音声 × Obsidian クラスタの面展開（3〜4本）

| | |
|---|---|
| **Impact** | **高**（Tier 1 に最も近い） |
| **Confidence** | **中〜高** — `obsidian-voice-input` の **CTR 10.5% / pos6.2** が同型テーマの到達点を実証 |
| **Effort** | **M**（記事3〜4本 + 固有価値の実測） |
| **Reason** | §6-1。Business Relevance が最も高い軸で、勝ちパターンが1本実証されている。**「勝っているテーマの面展開」（ブリーフ §1-1）そのもの** |
| **Expected KPI** | **+40〜80クリック/月**、かつインストール転換率は line-keep より数倍高いと見込む |

**前提**: 着手前に音声4LP（`/voice-input/` `/hands-free/` `/fastest-voice-memo/` `/siri/`）の
担当インテントを1文ずつ確定する（§8 Cluster B）。これを飛ばすとカニバリを増やす。

### P1-2. 意図別CTAコピーへの置換

Impact 中〜高 / Confidence 中 / Effort S〜M。
P0-5 完了後。新規ページ不要、既存の汎用CTAを意図別に差し替えるだけ。
Expected KPI: SEO→App Store 遷移率。**Tier 1 に直接効く数少ない施策**。

### P1-3. 無料ツール1本（Obsidian URI / frontmatter ジェネレータ）

Impact 中〜高 / Confidence 中 / Effort S（0.5〜1日）。
§13 L2。被リンク獲得の依存をPR TIMES単発から外す第一歩。
Expected KPI: Referring Domains、Obsidian軸の高関連読者。

### P1-4. best-memo-apps AIクエリFAQ 3問 + `/apple-watch/` NL FAQ

Impact 中 / Confidence 高 / Effort XS。既に草案あり・実装漏れの回収。

### P1-5. 文脈内部リンク1〜2本の19ページ底上げ（特に `/ai-tags/`）

Impact 中 / Confidence 中 / Effort S。実測リストあり。
`/ai-tags/` は Cluster C のピラー候補なので優先。

### P1-6. タイトル長の是正を「実験として」開始（45字超64ページ）

Impact 中 / Confidence **低〜中** / Effort M。
**P0-2の評価結果を待ってから**。一括変更は禁止（ブリーフ §33「titleを頻繁に変更し続ける」）。
10ページ単位で、評価日を実験台帳に記録して段階実施。

---

# P2 — バックログ

| # | 施策 | 理由 |
|---|---|---|
| P2-1 | AIメモクラスタ（Cluster C）の構築 | 空白地だが、P1-1（実証済みの勝ち筋）を優先 |
| P2-2 | 音声入力の実測比較（linkable asset L1）+ PR | 一次情報として最高だが、実測環境の準備コストが大きい |
| P2-3 | `/vs/` 39本の統廃合判断 | P0-1のデータが入ってから。推測でマージしない |
| P2-4 | glossary 本文拡充（deep-work / eisenhower-matrix） | pos11-44。タイトルでは動かない面 |
| P2-5 | Programmatic SEO（〇〇×Obsidian） | **ループが回り始めるまで着手しない。** 現状で始めると薄いページを量産する |
| P2-6 | EN `/en/voice-input/` ほかEN展開 | JAの期待値が高い間はJA優先 |
| P2-7 | Cloudflare Web Analytics 決着 / 他8ロケール判断 | 衛生。急がない |
| P2-8 | 独自調査 + PR TIMES | P2-2 のデータが揃ってから |

---

## 実行順序の要約

```
P0-1 (ループのコード化) ──┬─→ P0-2 (凍結解除・評価) ──→ P1-6 (タイトル実験)
                          │
P0-4 (版数是正・XS) ──────┘
                          
P0-3 (line-keep) ─────────→ P1-2 (意図別CTA) ←── P0-5 (CTA計測)
                          
P1-1 (音声×Obsidian 面展開) ← 本命。Tier 1 への最短路
```

**最初の2週間で P0 の5本を終える**のが妥当なペース。
うち P0-2 のみオーナー作業（GSC参照）、残り4本はリポジトリ内で完結する。

---

## 判断基準の確認（ブリーフ §39）

> 「これは検索トラフィックを増やすだけでなく、SimpleMemoの利用者増加につながるか？」

この基準で本監査の結論を1行にすると:

**「7万impを既に集めている面のCTRを期待値まで戻し（P0-3）、
最も利用者に近い軸（音声×Obsidian）に面を広げ（P1-1）、
それを再現可能にするループをコードに落とす（P0-1）。」**

記事数を増やすことは、この3つのどれにも入っていない。
