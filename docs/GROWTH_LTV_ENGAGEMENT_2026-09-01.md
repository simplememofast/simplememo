# SimpleMemo LTV・エンゲージメント最大化グロース分析

**作成日:** 2026-09-01 JST
**改訂:** 2026-09-01 JST（LTVは計測済みであることを明確化）
**実装記録:** 2026-09-02（§16。**本文の数値は BigQuery で再照会し、一致を確認した**）
**分析対象:** GSC BigQuery、2026-08-10〜08-29 PT
**主要比較:** 2026-08-16〜08-22 vs 2026-08-23〜08-29（同じ曜日構成の7日間）
**対象サイト:** `simplememofast.com`

> このファイルは、オーナーから 2026-09-02 に渡された分析レポートを §1〜§15 に**そのまま**収め、
> §16 に「何を実装し、何を実装せず、なぜか」を記録したもの。§1〜§15 の提案のうち、
> このリポジトリの既存の証拠（実験台帳・08-28 のトークン粒度の判断・過去の打ち切り）と
> 衝突するものは §16-3 に理由つきで置き、黙って片方に寄せていない。

---

## 1. 経営判断向け結論

最大の課題は流入量ではなく、**流入の質を高め、すでに計測・推定できているLTVを検索意図・ページ別の投資判断に反映すること**です。

直近週は表示回数が **14,268 → 14,538（+1.9%）** と伸びた一方、クリックは **272 → 239（−12.1%）**、CTRは **1.906% → 1.644%（相対−13.8%）**、平均順位は **8.60 → 9.08** に悪化しました。前週CTRを維持していれば約277クリックだったため、CTR低下による機会損失は **約38クリック／週**です。

ただし、これは「サイト全体が壊れた」というより、次の2つが同時に起きた結果です。

1. 前週のトップページ指名流入バーストが剥落した。
2. `メモアプリ 無料` 系の大量・低CTRクエリが増え、1ページ目下部〜2ページ目に集中した。

トップページを除くとCTR低下は相対 **−6.4%**まで縮小します。一方、順位11〜20位の表示は **1,045 → 1,541（+47.5%）**、同帯域のCTRは **1.72% → 0.84%**に低下しました。したがって、最優先は「全ページのCTRを一律に上げること」ではなく、**計測済みのLTVを検索意図・ページ別に分解し、LTVが高い流入へリソースを寄せること**です。

### 推奨する成長の主軸

**音声入力 × Obsidian × Apple Watch／AirPods／Siri** を高LTVウェッジにします。

- 汎用メモアプリ系クエリ: **2,757表示 / 15クリック / CTR 0.54%**
- 音声・Watch系クエリ: **196表示 / 9クリック / CTR 4.59%**
- Obsidian系クエリ: **698表示 / 17クリック / CTR 2.44%**

音声・Watch系のCTRは汎用系の **約8.4倍**、Obsidian系は **約4.5倍**です。検索CTRはLTVそのものではありませんが、具体的な利用文脈を持つユーザーほどクリック意欲が高いことを示す強い先行シグナルです。

### 90日で狙う状態

- 計測済みのLTVを検索意図・ページ・獲得コホート別に分解し、**16か月予測ネットLTV**をコンテンツ評価へ反映。180日累積収益は早期実績として併記
- 既存データで、インストール後10分以内の初回送信率、D7/D30継続率、複数入力面の利用率を流入別に比較
- 高表示・低CTRの上位ページで、機械的改善シナリオ **+51クリック／週（日本語ページのみ、CTR 1.5%到達時）**
- Obsidian／音声／Watch流入の比率を高め、D30継続・年間課金・紹介率まで比較
- 汎用記事は「大量集客ページ」ではなく、適合ユーザーを高LTV導線へ選別するハブに変更

---

## 2. 今回パッケージの分析範囲

このZIPに収録されているのはSearch Consoleデータです。以下は今回のZIPには同梱されていませんが、これは各指標が未計測という意味ではありません。

- App Store商品ページ閲覧・初回ダウンロード
- Web→App Store遷移
- インストール、メール認証、初回送信
- D1/D7/D30継続、送信日数、利用面（iPhone／Watch／Siri等）
- 無料枠到達、Paywall表示、月額／年額購入、更新、返金、解約
- 課金純収益、CAC、コホート別LTV

**事業全体のLTVはApp Store Connectのリテンション・契約データから計測・推定できています。** 本レポートでは、提供された所見を採用し、LTV継続月数を後述の16か月とします。今回の分析上の制約は、GSCのクエリ・ページデータと、App Store／アプリ側のLTVデータが同じパッケージに入っていないため、検索意図別・ページ別LTVまで本レポート内で直接突合できないことです。既存環境ですでに紐付けられている場合は、その実測値を以下の優先順位へそのまま反映できます。

### LTV継続月数の事業計画前提

| シナリオ | 継続月数 | 用途 |
|---|---:|---|
| 保守 | 12か月 | キャッシュ計画・下限評価 |
| 基準 | **16か月** | 事業計画・施策優先順位 |
| 上振れ | 20か月 | M6以降も高残存が続く場合 |

初期観測はM1約80%、M3約73%。M1からM3の減衰を単純延長すると、月次残存率は約95.5%、期待継続は約19か月になります。ただし観測期間が約3か月で、年額契約が混在するため、そのまま19か月を採用せず **16か月**へ割り引きます。暫定的には、月額単体を10〜14か月、月額・年額を合わせた顧客全体を15〜17か月とみなします。

Apple公式では、Subscription SummaryのRetention Rateは期間中に更新対象だった契約のうち更新した割合で、特定サブスクリプションで絞らない限り1か月・1年など全オファリングを含みます。一方、CohortのM1/M2/M3は、その時点で有料状態を維持している開始コホートの割合です。提供されたM1・M3の読みは後者として扱うため、年額契約が最初の12か月の残存率を押し上げる点を補正します。参照: [View subscription data](https://developer.apple.com/help/app-store-connect/measure-app-performance/view-subscription-data)、[Cohorts](https://developer.apple.com/help/app-store-connect-analytics/monetization/cohorts)

現在の有効契約52件の内訳は月額35・年額17で、年額比率は32.7%です。ただし、これは新規契約時の構成比ではありません。年額は残存期間が長いため、現在残高では比率が高く見える「ストック偏り」があります。LTV計算には次を使います。

- 新規契約時の月額／年額構成比
- 月額契約の月次コホート残存曲線
- 年額契約の12か月目更新率
- プラン別の返金・猶予・再開・App Store純収益

まだ十分な対象コホートが存在しないM6・M12欄の0%近辺は、長期解約率として使いません。M6実績が揃う見込みの2026年11月末ごろに12・16・20か月の前提を再推定し、M12が出た時点で年額更新を含む本LTVへ切り替えます。

### データ品質

- site raw: 7,818行、url raw: 13,467行
- 20日分が連続し、日付欠損なし
- 匿名化フラグとクエリ欠損の不整合: 0件
- site合計: 39,243表示 / 700クリック
- url合計: 40,025表示 / 706クリック
- site/url差はGSC仕様による既知差で、補正していない
- 添付のMD5・行数・BigQuery集計突合はすべて合格

直近7日同士のCTR差について二標本比率検定を行うと、両側p値は **0.092**です。悪化方向は明確ですが、通常の5%基準では確定的とは言えません。1週間の変化を恒久トレンドと断定せず、同じ定義で最低4週間追跡すべきです。

---

## 3. KPIダッシュボード

### サイト全体

| 指標 | 08-16〜08-22 | 08-23〜08-29 | 変化 | 判断 |
|---|---:|---:|---:|---|
| 表示回数 | 14,268 | 14,538 | +1.9% | 量は維持 |
| クリック | 272 | 239 | −12.1% | 要改善 |
| CTR | 1.906% | 1.644% | −0.262pt | 流入構成＋順位悪化 |
| 平均順位 | 8.60 | 9.08 | +0.47位悪化 | 11〜20位への移動 |
| 前週CTR維持時の期待クリック | — | 277.1 | 実績との差−38.1 | 週次機会損失 |

### 端末

| 端末 | 表示 | クリック | CTR | 前週CTR | 順位変化 | 解釈 |
|---|---:|---:|---:|---:|---:|---|
| Mobile | 7,814 | 119 | 1.523% | 1.764% | 7.64→8.40 | iOS獲得に最重要。順位悪化が大きい |
| Desktop | 6,420 | 115 | 1.791% | 2.032% | 9.62→9.95 | 後でiPhone導入する導線が必要 |
| Tablet | 304 | 5 | 1.645% | 2.465% | 8.22→8.10 | 母数小、判断保留 |

Mobileは表示が **+9.4%**増えたのにクリックが **−5.6%**です。iOSアプリの獲得価値を考えると、全体CTR以上に重大です。

### 国

日本は直近週の表示の **80.9%**、クリックの **92.1%**を占めます。日本CTRは **2.275% → 1.870%**、米国は **0.586% → 0.158%**でした。現時点では、日本で獲得・活性化・課金の型を完成させる方が確度が高いです。英語圏は、インストールとD30 LTVが確認できるまで大規模追加投資を保留します。

### 掲載順位帯

| 順位帯 | 前週表示 | 直近表示 | 前週CTR | 直近CTR | 判断 |
|---|---:|---:|---:|---:|---|
| 1〜3 | 669 | 552 | 5.53% | 5.43% | 露出減 |
| 4〜5 | 648 | 547 | 2.78% | 3.47% | CTR健全、露出減 |
| 6〜10 | 11,280 | 11,179 | 1.73% | 1.55% | 最大ボリューム、CTR低下 |
| 11〜20 | 1,045 | 1,541 | 1.72% | 0.84% | 最大の順位問題 |
| 21〜50 | 499 | 583 | 0.60% | 0.69% | 長期改善候補 |

最大のSEOレバーは、11〜20位に増えた表示を4〜10位へ戻すことです。ただし、汎用クエリだけを上げても低LTV流入が増える可能性があるため、後述の「LTV／1,000表示」で評価します。

---

## 4. 流入の質：検索意図別の診断

以下は開示クエリを意味別に分類し、匿名化クエリは独立集計したものです。

| 検索意図 | 前週 表示/クリック/CTR | 直近 表示/クリック/CTR | 直近順位 | 変化と意味 |
|---|---|---|---:|---|
| 匿名化 | 8,778 / 181 / 2.06% | 8,420 / 154 / 1.83% | 8.15 | 指名・具体意図を含む可能性。クリック減の中心 |
| 汎用メモアプリ | 1,622 / 13 / 0.80% | 2,757 / 15 / 0.54% | 9.43 | 表示+70%、クリック+2件。量の割に効率が低い |
| Obsidian | 613 / 22 / 3.59% | 698 / 17 / 2.44% | 15.64 | 需要は増加、順位とCTRに改善余地 |
| 音声・Watch | 190 / 5 / 2.63% | 196 / 9 / 4.59% | 7.78 | 最も有望な高意図ウェッジ |
| 移行（LINE/Keep/Captio） | 1,201 / 5 / 0.42% | 564 / 7 / 1.24% | 7.05 | ニュース性表示は減ったが効率改善 |
| 競合比較 | 610 / 17 / 2.79% | 433 / 13 / 3.00% | 12.87 | 具体的選定層。適合判定に向く |
| 生産性・PKM | 476 / 3 / 0.63% | 451 / 8 / 1.77% | 10.48 | Second Brainなどが改善 |
| セキュリティ | 267 / 1 / 0.37% | 277 / 3 / 1.08% | 11.89 | 信頼形成には有効、直接獲得は未検証 |

### LTV仮説

1. **音声・Watch／Obsidian流入**
   具体的な利用場面があり、iPhone以外の入力面やObsidian連携まで使う可能性が高い。利用頻度・切替コスト・年間課金との相性がよいと推定。

2. **Captio／LINE Keep移行流入**
   既存習慣からの乗り換えなので活性化しやすい可能性。ただし「終了したか知りたいだけ」の情報意図も多く、ページ内で適合判定が必要。

3. **汎用無料メモアプリ流入**
   検索量は大きいが、万能ノート・Android・完全無料を期待する層も多い。SimpleMemoの「iPhoneで瞬間キャプチャ」に合う人を早期に選別しないと、低継続・低評価・サポート負荷につながる。

したがって、汎用流入を止める必要はありません。役割を「直接売るページ」から、**適合ユーザーを音声／Watch／Obsidian導線へ分岐させるハブ**へ変更します。

---

## 5. ページポートフォリオ分析

直近週のURLベースは **14,760表示 / 240クリック**です。

- 表示上位3ページで表示の **37.0%**を占める
- 同じ3ページのクリック占有率は **13.8%**にすぎない
- 表示上位10ページで表示の **56.0%**、クリックの **32.5%**

つまり、現在は「大きく表示されるページ」と「実際にクリックを生むページ」が分離しています。

### 主要ページ

| ページ | 直近 表示 | クリック | CTR | 順位 | 役割・判断 |
|---|---:|---:|---:|---:|---|
| `/blog/free-memo-apps-ranking` | 3,048 | 19 | 0.62% | 9.53 | 最大リーチ。適合判定とCTR改善の最優先 |
| `/blog/line-keep-alternative` | 1,706 | 13 | 0.76% | 6.63 | 順位の割に低CTR。情報意図を即回答してから移行提案 |
| `/en/iphone-shortcuts-email-guide/` | 705 | 1 | 0.14% | 7.64 | 国際流入の低効率代表。LTV確認まで投資抑制 |
| `/blog/best-memo-apps-2026` | 549 | 6 | 1.09% | 7.19 | `おすすめ`意図を集約すべきページ |
| `/blog/offline-memo-apps` | 429 | 12 | 2.80% | 6.29 | 機能適合が高い。獲得導線を強化 |
| `/apple-watch/` | 362 | 5 | 1.38% | 7.14 | 高LTV仮説の主要入口。CTR改善余地 |
| `/obsidian/` | 359 | 9 | 2.51% | 11.81 | 2ページ目から上げれば大きい |
| `/blog/obsidian-voice-input` | 170 | 15 | 8.82% | 5.36 | 明確な勝ち筋。大幅変更せず拡張 |
| `/vs/upnote/` | 118 | 5 | 4.24% | 9.18 | 具体比較の有望ページ |
| `/obsidian/plugins/` | 64 | 7 | 10.94% | 13.73 | 小規模だが非常に高反応。クラスタ育成候補 |
| `/obsidian/sync/` | 49 | 4 | 8.16% | 11.02 | 高反応。関連導線を集中 |

### ページ群別

| ページ群 | 表示 | クリック | CTR | 意味 |
|---|---:|---:|---:|---|
| Blog | 7,787 | 114 | 1.46% | 最大集客群 |
| English | 2,391 | 12 | 0.50% | 表示の割にクリック・LTV不明 |
| Obsidian | 1,253 | 32 | 2.55% | 表示+61%、クリック+3%。新規露出の希釈あり |
| Comparison | 1,252 | 40 | 3.19% | 選定意図が強く高効率 |
| Product other | 992 | 20 | 2.02% | 機能ページ・導線改善対象 |
| Glossary | 596 | 8 | 1.34% | 信頼形成・内部導線向け |
| Methods | 298 | 9 | 3.02% | 習慣文脈と相性がよい |
| Home | 191 | 5 | 2.62% | 前週バースト剥落後の平常値 |

### CTR改善のシナリオ

表示100以上・平均順位15位以内の低CTRページを対象に、ページCTRが1.5%まで上がると仮定した機械的シナリオです。予測ではありません。

- 全対象ページ: **+68.6クリック／週**
- 日本語ページのみ: **+51.1クリック／週**
- `free-memo-apps-ranking` と `line-keep-alternative` の2ページのみ: **+39.3クリック／週**

上位2ページの内訳:

| ページ | 1.5%到達時の追加クリック／週 | 3.0%到達時の追加クリック／週 |
|---|---:|---:|
| `free-memo-apps-ranking` | +26.7 | +72.4 |
| `line-keep-alternative` | +12.6 | +38.2 |

実務上の初期目標は控えめに設定します。

- `free-memo-apps-ranking`: **0.62% → 0.90%以上**
- `line-keep-alternative`: **0.76% → 1.10%以上**
- Mobile全体: **1.52% → 1.70%以上**

---

## 6. ページ別の具体改修

### P0-A. `/blog/free-memo-apps-ranking`

現状は最大の表示獲得ページですが、直近の主要クエリは次の通りです。

- `メモアプリ 無料 シンプル`: 852表示 / 5クリック / CTR 0.59% / 8.17位
- `メモアプリ 無料`: 726表示 / 3クリック / CTR 0.41% / 9.07位
- `メモアプリ 無料 おすすめ`: 280表示 / 1クリック / CTR 0.36% / 9.49位
- `メモ帳アプリ 無料 シンプル`: 130表示 / 0クリック / 10.74位

#### 改修案

1. **検索結果の約束を明確化**
   タイトル案: `無料メモアプリおすすめ10選【2026年9月】広告なし・用途別に比較`
   更新月は自動更新ではなく、内容を再検証した時だけ変更する。

2. **ファーストビューに3問のクイック選定**
   - iPhoneのみでよいか
   - 最速入力か多機能整理か
   - メール／Obsidianへ残したいか

   ここでSimpleMemo適合層を音声、Watch、Obsidianページへ分岐させる。

3. **ランキングの信頼性を上げる**
   自社アプリを1位に置く場合は、開発者であること、評価基準、計測方法、弱点を同じ視認性で明示する。特にAndroid非対応、画像非対応、テキスト特化を早めに出す。低適合インストールを減らす方がレビューとLTVに有利。

4. **CTAを文脈別に分ける**
   現在の中間App StoreリンクはFAQ後まで遅い。ランキング1位直後に、次の2つを配置する。
   - iPhoneで最速メモを試す
   - 音声をObsidianへ送る仕組みを見る

5. **App Store Custom Product Pageを専用化**
   汎用記事流入には「無料・広告なし・0.4秒・1日3通」、Obsidian流入には「音声→自動追記」を見せる。全流入を同じ商品ページへ送らない。

### P0-B. `/blog/line-keep-alternative`

平均6.63位なのにCTR 0.76%です。開示クエリより匿名化クエリが大半で、検索者の多くは「終了事実」「Keepメモとの違い」「データの場所」を知りたいだけと考えられます。

#### 改修案

1. 冒頭3行で `LINE Keepは終了、Keepメモは継続` を即答
2. その直下に「保存したいもの別」の分岐を置く
   - 写真・ファイル → 別解
   - テキストを一瞬で残す → SimpleMemo
   - LINE内だけでよい → Keepメモ
3. 比較表直後に文脈CTAを追加。現状はナビとページ末尾が中心で、長文の中間転換点を逃している
4. 乗り換え者向けApp Store商品ページを維持し、campaign tokenをページ・配置単位にする
5. 「終了ニュース」流入と「代替アプリ」流入をGA4上でページ内クリック行動により分ける

### P0-C. `/blog/obsidian-voice-input`

170表示 / 15クリック / CTR 8.82% / 5.36位で、現状の勝ちページです。大幅なタイトル変更は避けます。

#### 改修案

- 4方式比較の直後に30秒の操作デモ、または3ステップ図を追加
- `Obsidian 音声入力`向け専用App Store商品ページへ送る
- `/apple-watch/`、`/siri/`、`/fastest-voice-memo/`、`/obsidian/`へ明確に分岐
- 送信先CTAのcampaign tokenを固有化
- 検索CTRではなく、インストール→Obsidian接続→D30を勝敗指標にする

### P1. Obsidianクラスタ

`/obsidian/pricing/`、`/obsidian/plugins/`、`/obsidian/sync/`が新規露出し、少量ながら高CTRです。一方、`/obsidian/`は11.81位、`getting-started`は10.51位です。

- 新規記事を量産するより、既存ページ間の役割を明確化
- 各子ページ上部に「iPhoneから音声で送る最短方法」への導線
- ハブから pricing / plugins / sync / vault / getting-started へ内部リンク
- 重複する「Obsidian iPhoneメモ」ページは検索意図を整理し、必要なら統合
- 勝ちページからハブへリンクし、ハブを10位以内に押し上げる

### P1. カニバリゼーション

直近週に明確な分散が見えるもの:

- `メモアプリ おすすめ`: `free-memo-apps-ranking` 57% vs `best-memo-apps-2026` 43%
- `notion vs evernote`: 日本語・英語URLが分散
- `暗号化 比較`: security comparisonとencryption comparisonが分散

いきなり削除・リダイレクトせず、まず検索意図を分けます。

- `無料`を含むクエリ → free ranking
- `おすすめ`一般 → best apps 2026
- 英語クエリ → `/en/`
- 暗号技術解説 → encryption、アプリ選び → security comparison

タイトル、H1、導入文、内部リンクのアンカーテキストをこの分担に合わせ、4週間後に再判定します。

---

## 7. 現行サイト・App Store導線の追加監査

ライブページ確認時点で、次の計測・信頼上の問題があります。

### 7-1. App Store attributionが粗い

公開ページで確認できるApp Storeリンクは `ct=jp__nav`、`jp__mid`、`jp__bottom` のように配置単位で、記事スラッグが含まれないものがあります。Web側の `data-cta-cluster` は分析できますが、このcampaign token単体ではApp Store側の記事別獲得・売上を分けにくい設計です。すでにAppsFlyer／GA4等で記事別LTVまで接続できている場合、この改修の優先度は下げて構いません。

推奨形式:

`ct=jp__free_memo_rank__hero`
`ct=jp__line_keep__comparison`
`ct=jp__obsidian_voice__mid`

Custom Product Pageの`ppid`も検索意図別に割り当てます。

### 7-2. 公式情報の鮮度がずれている

公式App Storeでは確認時点で **v5.8.2、評価4.24・25件**ですが、サイトの構造化データ／表示には **v5.8.1、4.4・22件**が残っています。また、最大表示ページの最終更新日は2026-03-22です。

対策:

- バージョン、評価件数、平均評価を自動同期、または頻繁に変わる値を静的構造化データから外す
- 比較記事は四半期更新。更新時に競合価格・対応OS・無料範囲を再確認
- 「2026年最新」は検証日を明記し、更新実体のない日付更新はしない

参照: [公式サイト](https://simplememofast.com/)、[無料メモアプリ比較ページ](https://simplememofast.com/blog/free-memo-apps-ranking)、[App Store](https://apps.apple.com/jp/app/id6758438948)

---

## 8. 計測済みLTVをSEO投資へ接続する設計

### 最終目的指標

コンテンツ別に次を計算します。

**ネットLTV／1,000 GSC表示**

`1,000 × GSC CTR × Web→Store率 × Store→Install率 × Install→Activation率 × 16か月予測ネットLTV`

16か月予測値だけで判断せず、D30・D90・D180の累積純収益を早期実績として並べ、予測と実績の乖離を毎月更新します。

この指標なら、表示量が小さくても高継続・高課金のObsidian流入を正しく評価できます。

### プロダクトNorth Star

**W4継続アクティブキャプチャユーザー数**
定義: インストール4週目に、2日以上で成功送信したユーザー。

補助指標:

- 成功キャプチャ日数 / WAU
- 1アクティブ日あたり成功送信数
- 2つ以上の入力面を使うWAU比率
- Obsidian接続後の初回追記成功率
- D1 / D7 / D30継続率
- 新規年額比率、月額M1/M3/M6残存、年額M12更新率、16か月予測誤差

### Activationの暫定定義

**インストール後10分以内に初回送信成功**、かつ **7日以内に3日以上で送信成功**。

これは分析上の暫定定義です。既存のコホートデータでD30継続との関係を次の候補ごとに比較し、最も予測力の高い閾値に更新します。

- 24時間以内に1回成功
- 72時間以内に3回成功
- 7日以内に3日利用
- Watch／Siri／Action Buttonのいずれかを追加
- Obsidian接続と初回追記成功

### ページ別LTV分解に使うイベント

以下は推奨項目です。既に取得できているイベントを再実装する必要はありません。メモ本文・音声内容は収集しません。

| 段階 | イベント | 主な属性 |
|---|---|---|
| Web | `organic_landing_view` | page_cluster, locale, device |
| Web | `app_store_cta_click` | page_slug, placement, cta_variant, ppid, ct |
| Store | 商品ページ閲覧・DL | campaign token, custom product page |
| Setup | `email_verification_started/completed` | elapsed_ms, failure_reason |
| Core | `memo_send_started/succeeded/failed` | surface, elapsed_ms, network_state |
| Activation | `activation_completed` | days_to_activation, surfaces_used |
| Feature | `obsidian_connected` | setup_elapsed_ms |
| Feature | `obsidian_first_append_succeeded` | days_from_install |
| Feature | `watch_first_send`, `siri_first_send`, `ai_tag_first_use` | days_from_install |
| Monetization | `free_quota_reached`, `paywall_viewed` | trigger, active_days, sends_7d |
| Monetization | `trial_started`, `purchase_completed` | plan, offer, source_cluster |
| Retention | cohort activity | D1/D7/D30, active_days, surfaces |
| Churn | cancel/refund/renewal | plan, tenure, voluntary/involuntary |

### コホート軸

- landing page / query cluster
- campaign token / custom product page
- locale / country
- device
- initial use case: generic, migration, Obsidian, voice/watch, productivity
- first feature adopted
- plan: free, monthly, yearly

---

## 9. Activation・エンゲージメント改善

### 9-1. 最初の価値到達を最短化

オンボーディングで機能を説明しすぎず、最初の成功送信までを最短にします。

推奨フロー:

1. メール認証
2. サンプル文が入った状態で1タップ送信
3. 受信確認
4. 成功直後に、利用文脈に合う次の入力面を1つだけ提案

流入別の次アクション:

- Obsidian流入 → Obsidian接続
- Watch流入 → Watchアプリ設定
- 音声流入 → 起動時音声／Siri
- 汎用流入 → Action Buttonまたはホーム画面ウィジェット

### 9-2. 複数入力面を定着レバーにする

継続利用の仮説は「送信回数が多い」より「生活の複数場面に入り込む」ことです。

- iPhoneのみ
- iPhone + Watch
- iPhone + Siri/AirPods
- iPhone + Obsidian
- 3面以上

これらのD30、課金率、解約率を比較し、最もLTVが高い組み合わせへプロダクト内誘導を集中します。

### 9-3. 失敗体験をゼロにする

LTVに直結するガードレール:

- 送信成功率
- 初回送信失敗率
- 認証失敗率
- Outbox滞留時間
- Obsidian初回追記失敗率
- Watch/Siri実行失敗率

送信失敗者には課金提案を出さず、復旧導線を優先します。

### 9-4. 評価依頼の最適化

評価依頼は初回起動ではなく、価値実感後に出します。

候補:

- 5回目の送信成功後
- 3日目の利用後
- Obsidian初回追記成功後
- Watch/Siri送信成功後

失敗直後、Quota到達直後、Paywall拒否直後には出さない。評価数の増加だけでなく、評価平均・D30・返金率をガードレールにします。

---

## 10. 課金・LTV改善

### 10-1. Paywallは価値実感後に出す

Freeの1日3通制限は、習慣形成のきっかけにも離脱要因にもなります。以下をA/Bテストします。

| テスト | 仮説 | 主指標 | ガードレール |
|---|---|---|---|
| 3通目直後 vs 次回起動時 | 価値実感の余韻で出す方が転換する | Paywall→購入 | D7、アンインストール |
| 月額先頭 vs 年額先頭 | 年額先頭で実現LTVが上がる | 16か月予測ネットLTV/Paywall | D180実収益、返金、M12更新 |
| 機能訴求 vs 成果訴求 | 「無制限」より「思考を逃さない」が効く | 購入率 | 低評価、解約 |
| Quota固定 vs 週次柔軟枠 | 日次制限より習慣を阻害しない | Activation、D30、購入 | サーバーコスト |

現在の月額500円・年額5,000円では、年額は月額12か月の6,000円に対して約16.7%割引です。年額優先は有望ですが、D7が低い段階で強く売ると返金・低評価を増やすため、まずActivationを改善します。

### 10-2. 解約を「無料への段階移行」にする

- 解約後もFreeでデータ／ワークフローを維持
- キャンセル理由別に、利用頻度低下、価格、失敗、機能不足を分ける
- 支払い失敗は即失効ではなく猶予＋復旧
- 30日非利用者には通知乱発ではなく、1回だけ「最速入力面」を再提案

### 10-3. LTV式

事業計画では **12・16・20か月**のシナリオを使い、実績評価では月額と年額を分離します。単純な `ARPU ÷ churn` や、月額・年額を混ぜた1本の解約率は使いません。

**月額契約の期待継続月数**

`Σ 月額コホート残存率 S(m)`

**年額契約の期待売上**

`初年度純収益 + M12更新率 × 2年目純収益 + M24更新率 × 3年目純収益 …`

**16か月予測ネットLTV／インストール**

`Install→Paid率 × {月額構成比 × 月額16か月期待純収益 + 年額構成比 × 年額16か月期待純収益}`

実測の早期指標:

`D180ネットLTV = App Store手数料・税・返金控除後のD180累積収益 ÷ コホート初期インストール数`

月額500円、年額5,000円を月額換算し、新規契約の年額比率を25%と置く粗い計画値では、ブレンド月額単価は約479円です。したがって手数料・税・返金前の理論値は、12か月約5,750円、16か月約7,667円、20か月約9,583円です。これはキャッシュ受取時期と年額更新を単純化した参考値で、正式なLTVにはApp Storeの実際のProceedsを使います。

Free利用者にも紹介価値があるため、別途以下を出します。

`紹介価値 = 1ユーザーあたり招待・共有由来インストール × そのコホートの16か月予測ネットLTV`

---

## 11. 優先順位

| 優先 | 施策 | 期待効果 | 工数 | 判断 |
|---|---|---|---|---|
| P0 | 既存計測でquery/page→LTVの紐付けを確認し、欠損箇所だけcampaign token・ppidを補完 | ページ別LTV配分の精度 | 低〜中 | 最初に確認 |
| P0 | free rankingの選定UI＋文脈CTA＋専用商品ページ | 週次クリック・適合率 | 中 | 最大母数 |
| P0 | line keepの即答構造＋比較表直後CTA | CTR・移行CVR | 低〜中 | 順位6.6位を活かす |
| P0 | 初回送信成功までのオンボーディング短縮 | Activation・D7 | 中 | LTVの最重要先行指標 |
| P0 | Obsidian voice勝ちページの流入別LTVを検証 | 高LTV獲得の証明 | 低 | 既存勝ち筋 |
| P1 | Obsidianクラスタの内部リンク・役割整理 | 順位・高意図流入 | 中 | 新規量産より優先 |
| P1 | 流入別の次機能提案 | 複数面利用・D30 | 中 | エンゲージメント |
| P1 | 評価依頼タイミング最適化 | Store CVR・信頼 | 低 | メタデータ同期と同時 |
| P1 | Paywallタイミング・年額訴求テスト | 課金率・実現LTV | 中 | Activation改善後 |
| P2 | 英語圏の追加コンテンツ拡張 | 将来成長 | 高 | LTV確認まで保留 |
| P2 | Discover/画像検索施策 | 新規露出 | 中〜高 | 現時点では直接LTV優先度低 |

### 今やめること

- 全体表示回数だけを成長KPIにする
- 低母数ページの1週間の増減で大量改修する
- 類似テーマの記事を増やし続ける
- 全記事を同じApp Store商品ページ・同じcampaign tokenへ送る
- 初回価値前にPaywallやレビュー依頼を出す
- 英語表示回数だけを根拠に国際投資を増やす
- 勝っている`obsidian-voice-input`のタイトルを大きく変える

---

## 12. 30・60・90日ロードマップ

### 0〜30日

1. 既存のGA4／AppsFlyer／App Store Connectで、ページ→インストール→LTVの紐付け粒度を確認し、欠損するcampaign tokenだけページ×配置で固有化
2. App Store Custom Product Pageを最低3種に分ける
   - 汎用無料
   - Obsidian音声
   - LINE/Captio移行
3. Web→Store→Install→初回送信→D7→購入の既存接続を検証し、欠損区間だけ補完
4. `free-memo-apps-ranking`のクイック選定・中間CTAを実装
5. `line-keep-alternative`の即答ブロック・比較表直後CTAを実装
6. 公式サイトのバージョン・評価値をApp Storeと同期
7. 既存データで初回送信成功までの離脱ファネルをコホート比較

### 31〜60日

1. 流入別オンボーディングをテスト
2. Obsidian接続、Watch、Siriの2つ目の入力面採用テスト
3. `メモアプリ おすすめ`の2ページ競合を意図分離
4. Obsidianハブと既存子ページの内部リンク再設計
5. レビュー依頼タイミングをテスト
6. D7予測力の高いActivation定義を確定

### 61〜90日

1. Paywallタイミングと月額／年額表示をテスト
2. acquisition cluster別のD30・課金率・返金率を比較
3. `ネットLTV／1,000 GSC表示`でコンテンツ投資を再配分
4. 英語圏は日本コホート比でLTVが成立した国だけ拡張
5. 勝ちコホート向けの紹介・共有ループを実装

---

## 13. 実験バックログ

| # | 実験 | 仮説 | 主指標 | ガードレール | 期間目安 |
|---:|---|---|---|---|---|
| 1 | free rankingのタイトル・description更新 | 月次鮮度と用途別訴求でCTRが上がる | GSC CTR | 順位、クリック質 | 再クロール後28日 |
| 2 | 3問クイック選定 | 低適合を除き高意図ページ遷移が増える | 分岐CTR | 直帰、Storeクリック | 2〜4週 |
| 3 | ランキング1位直後CTA | FAQ後よりStore遷移が増える | Store outbound CTR | D7、低評価 | 必要標本まで |
| 4 | line keep比較表直後CTA | 移行検討のピークでCVRが上がる | Store outbound CTR | スクロール、D7 | 必要標本まで |
| 5 | Obsidian専用商品ページ | メッセージ一致でinstall→activationが上がる | Activation/Store view | D30、返金 | 4週以上 |
| 6 | 成功送信直後の次入力面提案 | 文脈直後なら2面目採用が増える | 2面利用率 | 初回完了率 | 2週以上 |
| 7 | 5回目成功後レビュー依頼 | 価値実感後なら評価数と平均が改善 | レビュー率・平均 | D7、拒否 | 4週以上 |
| 8 | Paywall表示タイミング | 3通目直後が転換と継続の最適点 | 16か月予測LTV/ユーザー | D180実収益、D7、返金 | 十分な購入数まで |
| 9 | 年額先頭表示 | 月額先頭より実現LTVが高い | 16か月予測ネットLTV | M12更新、D180実収益、返金 | 十分な購入数まで |
| 10 | 日次3通 vs 週次柔軟枠 | 柔軟枠で習慣形成と課金を両立 | D30・購入率 | コスト | 4〜8週 |

SEOテストは検索結果反映に時間がかかるため、1週間で勝敗を決めません。プロダクト実験も必要標本数を事前計算し、最低1つの完全な利用周期を含めます。

---

## 14. 週次グロース会議の見る順番

### 1. 事業成果

- 16か月予測ネットLTV（12・20か月レンジ併記）
- D30・D90・D180実測ネットLTV
- 新規年額比率と現在残高の年額比率
- 更新率、返金率、任意解約率

### 2. 継続

- D1 / D7 / D30
- W4継続アクティブキャプチャユーザー
- 成功キャプチャ日数 / WAU
- 2面以上利用率

### 3. Activation

- Install→メール認証
- 認証→初回送信成功
- 初回送信までの中央値
- 7日以内3日利用率
- Obsidian初回追記成功率

### 4. Acquisition

- query/page cluster別GSC CTR
- Web→Store率
- Store→Install率
- cluster別Activation・D30・LTV

### 5. ガードレール

- 送信失敗率
- 1〜2星レビュー率
- 返金率
- 通知拒否・解除率
- 問い合わせ率

---

## 15. 次回パッケージに同梱すると分析精度が上がるデータ

優先順:

1. App Store Connectのproduct page view、DL、proceeds、subscription、cancel、refund
2. AppsFlyerのcampaign token / custom product page別install・reinstall
3. アプリ内イベントの匿名コホートデータ
4. GA4のページ別App Store outbound click
5. 可能なら、D1/D7/D30と課金を結んだユーザー単位の匿名ID

次の列をGSCと同じ分析パッケージに含めれば、既に計測できているLTVを検索意図・ページ別に本レポート内で突合できます。

`install_date, source_cluster, campaign_token, locale, first_send_at, active_days_d7, active_days_d30, surfaces_used, obsidian_connected, plan, subscription_duration, subscription_start_month, purchase_at, renewal_at, renewal_count, net_proceeds, cancel_at, refund`

---

## 最終提言

SimpleMemoは「無料メモアプリ」という大市場で表示を増やせていますが、LTV最大化の鍵はその市場の全員を取ることではありません。

**一瞬で残したい人を獲得し、最初の成功送信を最短化し、音声・Watch・Siri・Obsidianの複数場面に入り込み、価値実感後に年間課金へ移す。**

この一連の体験を既存のLTVデータと検索意図別コホートで結べば、表示回数が少なくても高LTVの流入へ投資できます。直近のGSCでは、すでに音声・Watch・Obsidian系がその勝ち筋を示しています。最初の30日は記事追加よりも、**既存LTVとの接続確認、上位2ページの選別導線、初回送信成功、Obsidian音声流入の専用商品ページ**に集中するのが最も合理的です。

---

## 16. 実装記録（2026-09-02）

**一行で:** §6 の P0-A / P0-B / P0-C / P1（Obsidian）と §7-2（鮮度）を実装し、
§7-1（campaign token のページ別化）・P0-B のタイトル・P0-A の改題・§9-4（評価依頼）・
§10-1（Paywall）は**このリポジトリと隣のリポジトリに既にある証拠と衝突するため採らなかった**。
理由は §16-3。実装の効果測定は `growth/experiments/experiments.json` の3件で追う。

### 16-1. 数値の再検証 — BigQuery を直接照会した

レポートは ZIP の GSC データから作られている。同じ元（`yurika-simplememo.searchconsole`）を
2026-09-02 に MCP 経由で直接照会し、本文の値と突き合わせた。**すべて一致。**

| 対象 | レポート | BigQuery（2026-09-02 照会） |
|---|---|---|
| サイト 08-16〜22 | 14,268 / 272 / 1.906% / 8.60 | 14,268 / 272 / 1.906% / 8.60 |
| サイト 08-23〜29 | 14,538 / 239 / 1.644% / 9.08 | 14,538 / 239 / 1.644% / 9.08 |
| `/blog/free-memo-apps-ranking` | 3,048 / 19 / 0.62% / 9.53 | 3,048 / 19 / 0.62% / 9.53 |
| `/blog/line-keep-alternative` | 1,706 / 13 / 0.76% / 6.63 | 1,706 / 13 / 0.76% / 6.63 |
| `/blog/best-memo-apps-2026` | 549 / 6 / 1.09% / 7.19 | 549 / 6 / 1.09% / 7.19 |
| `/apple-watch/` | 362 / 5 / 1.38% / 7.14 | 362 / 5 / 1.38% / 7.14 |
| `/obsidian/` | 359 / 9 / 2.51% / 11.81 | 359 / 9 / 2.51% / 11.81 |
| `/blog/obsidian-voice-input` | 170 / 15 / 8.82% / 5.36 | 170 / 15 / 8.82% / 5.36 |
| `/obsidian/plugins/` | 64 / 7 / 10.94% / 13.73 | 64 / 7 / 10.94% / 13.73 |
| `/obsidian/sync/` | 49 / 4 / 8.16% / 11.02 | 49 / 4 / 8.16% / 11.02 |

（表示 / クリック / CTR / 平均順位。順位は `sum_position ÷ impressions + 1`）

**検証できなかったもの:** §7-2 の「App Store は v5.8.2・評価 4.24・25件」。
サンドボックスから `itunes.apple.com` への CONNECT は egress proxy に拒まれる（2026-09-02 に再確認）。
§16-2 の鮮度同期はレポートの値を**オーナー報告値として**台帳に入れたもので、機械照合は
`seo-daily.yml` の `check-store-facts.mjs --net`（日次・ジョブサマリ）に委ねる。

### 16-2. 実装したもの（すべて `simplememo` リポジトリ）

| § | 対象 | 入れたもの |
|---|---|---|
| P0-A | `blog/free-memo-apps-ranking.html` | TL;DR 直下に**情報開示**（開発者である旨＋iPhone専用・テキスト専用・無料1日3通の弱点）、**「30秒で決める：3つの質問」**（Android/PC→Keep・Simplenote、多機能→Apple純正、最速→1位、Obsidian→`/blog/obsidian-voice-input`、画面を見ない→`/apple-watch/`・`/siri/`）、**1位カード直後の文脈CTA**（App Store `ct=jp__hero`＋Obsidian音声導線）、`#ranking` / `#rank-1..5` のアンカー、最終更新と `dateModified` を 2026-09-02 へ。日英両方 |
| P0-B | `blog/line-keep-alternative.html` | 情報開示の直下に**「まず答え」**（終了/継続の即答＋写真・ファイル→Apple純正/Keep、テキスト即時→シンプルメモ、LINE内→Keepメモ）、`#comparison` アンカー、**比較表の脚注直後に CTA**（`ct=jp__mid` / `en__mid`・CPP `line-keep-alternative` の ppid 付き）、最終更新を追記。日英両方 |
| P0-C | `blog/obsidian-voice-input.html` | 「使い分けの目安」に**入口別の分岐**（Watch→`/apple-watch-obsidian/`、AirPods→`/siri/`、アクションボタン→`/fastest-voice-memo/`、移動中→`/hands-free/`）。title・冒頭・next-step は不変 |
| P1 | `obsidian/{pricing,plugins,sync,what-is-vault}/` | 回答ブロック（AIO）の**直下**に「声で話してObsidianに残す最短の方法」→ `/blog/obsidian-voice-input` を1本。回答より上には置いていない |
| P1 | `obsidian/index.html` | 関連ページに未リンクだった `/obsidian/plugins/` を追加 |
| P0-A / P0-C | `data/cpp-map.json` | 保留行を2つ追加（`free-memo-generic` → `^/blog/free-memo-apps-ranking$`、`obsidian-voice` → `^/blog/obsidian-voice-input$`）。**ppid は null**＝オーナー入力待ち。CI（`apply-cpp-ppid.js --check`）は notice を出すだけで落ちない |
| §7-2 | `data/site-constants.json` → 25ファイル＋`llms.txt` | `appVersion` 5.8.1→**5.8.4**（レポートは 5.8.2 と読んでいたが、オーナーの 09-02 実機確認で 5.8.4）、`ratingValue` 4.4→**4.2**（JSON-LD は1桁小数。元値 4.24）、`ratingCount` 22→**25**。`sync_constants.js --write` で JSON-LD の `#app` 12ノードと表示テキストへ伝播。`voices/index.html` の meta-title / og-title / 本文の「★4.4・21件」は同期の規則外だったので手で 4.2・25 に揃えた |
| 計測 | `growth/experiments/experiments.json` | `selector-hub-2026-09-02-001`（評価 10-03）、`cta-placement-2026-09-02-002`（10-03）、`internal-link-2026-09-02-003`（10-12）。基準値は §16-1 の BigQuery 値。control / min_sample / stop_conditions つき |

描画は headless Chromium（幅 390 / 1200）で確認した。ダークテーマでの情報開示ブロック・分岐・回答ブロック・導線行の表示に崩れなし。

### 16-3. 採らなかった提案と、その理由

| 提案 | 採らない理由 | 根拠の場所 |
|---|---|---|
| **§7-1** `ct=jp__free_memo_rank__hero` のようなページ×配置トークン | **2026-08-28 に 670 種のページ別トークンを 8 種（`{言語}__{配置}`）へ畳んだ直後。**Apple は1キャンペーンに初回DL 5件が集まるまで集計に出さない。実測の初回DLは 4.5〜5.0/日（月 ≈150）で、理想条件でも月に閾値を越えられるのは 30 トークンまで。実際 ASC の Campaign 列は 5,018 Counts が全部空欄だった。ページ粒度は GA4（`page_path × data-cta-placement`）と CPP（`ppid`）で持つ設計に既になっている。提案どおりに戻すと**同じ空欄を作り直す** | `scripts/tag-cta-placements.js` の `langOf` 上のコメント、`growth/reports/2026-08-28-campaign-token-cardinality.md` |
| **P0-B** line-keep の CTR 目標（0.76→1.10%）とタイトル | `title-2026-07-01-002` は abandoned。SEO_AIO_PLAN v3 §6 と GROWTH_ROI_PLAN v4 §6 が「**4度目の CTR 改善はやらない**（確認型クエリ・タイトルが答えを完結させている）」と明記。**即答ブロックと表直後 CTA は入れた**が、読むのは Store 転換であって検索 CTR ではない | `docs/SEO_AIO_PLAN_2026-08.md` §2-1 / §6、`docs/GROWTH_ROI_PLAN_2026-08-20.md` §6 |
| **P0-A** 改題『…10選【2026年9月】…用途別に比較』 | (1) `snippet-2026-08-09-free-memo-ranking` が同ページの title を 09-13 評価で走らせている最中。(2) **本文が並べているのは TOP5 で、「10選」の実体が無い**（用途別の5件も同じ5本）。改題は 09-13 の評価で、10本に増やすか「5選」へ正すかと一緒に決める | `growth/experiments/experiments.json`、ページ本文 |
| **§9-4** 評価依頼を「5回目の送信成功後」へ | iOS の `ReviewPromptManager` は既に **3通目・10・30通目**、**インストール3日未満は出さない**、**送信失敗から24時間は出さない**、**一度完走した人には再依頼しない**。3通目は実測（shown 10 → rating 1）で「4通目の Paywall で体験が濁る前」に置いた設計判断で、同ターンでは Review が Paywall より優先し排他（`ComposeViewController`）。「Paywall 拒否直後」の抑止だけは無いが、拒否は送信ブロック時（4通目）に起きるので同ターンで Review が出る経路は無い。数字を動かす根拠が無いので変えない | `simplememo-ios/SimpleMemo/ReviewPromptManager.swift` |
| **§10-1** Paywall のテスト #8 / #9 | A 側は本番に出ている: 3通目直後のハーフモーダル＋4通目ブロック（WP-02、`DailyLimitPaywallCoordinator`）、年額ファースト（R6・08-05 出荷）。B 側（次回起動時 / 月額先頭）を作るのは iOS の A/B 基盤の話でこの変更の範囲外 | `simplememo-ios/SimpleMemo/DailyLimitPaywallCoordinator.swift`、`simplememo-api/docs/reports/SUBSCRIPTION_RETENTION_RECHECK_2026-08-28.md` §8 |
| **§2** 16か月 LTV を投資判断の基準に | `SUBSCRIPTION_RETENTION_RECHECK_2026-08-28` は「M1 ~80% / M3 ~70% も 88%→50% も**分母の無い目視値**」「**年額の更新実績はゼロ**」と結論。計画値として持つのは構わないが、api の運転規則（分母 20 未満で決めない）に従い、**実測への切替はレポート自身が言う M6 が揃う 11 月末**。それまでコンテンツ評価に「16か月ネット LTV」を掛けない | `simplememo-api/CLAUDE.md`、同 `docs/reports/SUBSCRIPTION_RETENTION_RECHECK_2026-08-28.md` |
| **§8** イベント追加 | 提案名のほとんどは**別名で既に取れている**（§16-4）。新規に足す価値があるのは `activation_completed`（派生で出せる）と Watch/Siri の「初回」フラグだけで、どちらも iOS↔api の契約変更（allowlist）を伴うので、ここでは触らない | `simplememo-ios/SimpleMemo/AnalyticsClient.swift`（133イベント）、`simplememo-api/src/analytics.ts` |

### 16-4. §8 のイベント提案と既存実装の対応

| 提案 | 既存（iOS `AnalyticsClient` / サイト） | 状態 |
|---|---|---|
| `organic_landing_view` | GA4 の page_view（サイト） | ある |
| `app_store_cta_click` | `js/app-store-tracking.js`（`data-cta-placement/cluster/variant` × `page_path`） | ある |
| `email_verification_started/completed` | `verify_start_requested` → `verify_confirm_success` / `verify_confirm_failed` | ある（別名） |
| `memo_send_started/succeeded/failed` | `send_button_tapped` / `memo_send_success` / `memo_send_failed`、初回は `first_memo_send_*` | ある（別名） |
| `activation_completed` | 無い。api 側の日次ファネル（`src/analytics/funnel-core.ts`、activation 3/6）が派生で出している | 派生 |
| `obsidian_connected` | `obsidian_configured` / `obsidian_setup` | ある（別名） |
| `obsidian_first_append_succeeded` | `obsidian_append_success`（初回フラグは無い。install 日からの差で派生可） | 派生可 |
| `watch_first_send` / `siri_first_send` | `apple_watch` / `siri` / `airpods` 系イベントはあるが「初回送信」の単一イベントは無い（`ObsidianManager.sendIfEnabled(source:)` の source が keyboard/siri/watch を持つ） | **要確認**（source 別の送信成功で派生できるか） |
| `ai_tag_first_use` | `ai_format_succeeded` | ある（別名） |
| `free_quota_reached` / `paywall_viewed` | `daily_limit_reached` / `paywall_viewed`（source / ui 付き） | ある |
| `trial_started` | 無料トライアルは廃止済み（`check-public-facts.mjs` が「7日間無料トライアル」を古い事実として落とす） | 該当なし |
| `purchase_completed` | `paywall_purchase_success` / `paywall_plan_selected` | ある（別名） |
| Retention / Churn | ASC の Subscription State / Event Report（`simplememo-ios/data/asc/`）、`cancel_flow_*` | ある |

### 16-5. 未確定・オーナー判断待ち

1. **CPP。**（2026-09-02 追記）オーナーの委任で自律判断した。`obsidian-voice` は既存の `obsidian-vault`（1408d7a4…）を流用して配線済み（同じ CPP が音声ページ /obsidian/airpods/ を既に受けている）。`free-memo-generic` は意図の合う CPP が ASC に無く、CPP の作成はサンドボックスから行えないので**既定商品ページ（対照）のまま**。汎用無料用の CPP を ASC で作ったら ppid を記入して `node scripts/apply-cpp-ppid.js --write`。
2. **店頭事実。**（2026-09-02 追記）オーナーが実機で確認した値は **v5.8.4** / 4.2 / 25 件で、レポートの 5.8.2 は古かった。台帳と 22 ファイルを 5.8.4 に揃えた。機械照合は引き続き `seo-daily.yml` のジョブサマリで見る。
3. **`free-memo-apps-ranking` の「10選」。**title と TL;DR は 10 本、本文は TOP5。09-13 の snippet 評価時に決める（§16-3）。
4. **`seo-daily.yml` の push 失敗。**（2026-09-02 追記）09-01 23:05Z の失敗は `--force-with-lease` の照合先が無いこと（fetch-depth 2 で main しか持たない）が原因で、リモートに `claude/seo-weekly-snapshot` が残っている限り毎回落ちる。09-02 00:39Z の回は通って #780 が作られ 00:57Z にマージ済みだが、ブランチはまた残っている。**この環境からはブランチを消せない**（git の delete push は途中で切断、REST の DELETE はプロキシが 403）。恒久策としてワークフロー側で push 前に同名ブランチを取り寄せて照合先を作るよう直した（`--force` にはしていない。#780 には別セッションの未マージ作業が積まれていた実例がある）。オーナーへ: リポジトリ設定の「Automatically delete head branches」を有効にすると、この種の残骸自体が出なくなる。
5. **`tag-cta-placements.js` の既知 notice**（トークンの言語とページのロケールが食い違う CTA 212 件）は以前からのもので、本変更で増減していない。
