# SEO/AIO 施策依頼文セット（2026-08-20）

`GROWTH_ROI_PLAN_2026-08-20.md`（v4）のうち、サイト/計測リポジトリで完結するSEO/AIO文脈の施策を
**1件＝1セッション＝1PRで依頼できる文面**にしたもの。上から順がROI順。
各依頼文の先頭に【共通前提】を付けて使う。

---

## 【共通前提】（全依頼文の冒頭に付ける）

```
前提: 着手前に docs/GROWTH_ROI_PLAN_2026-08-20.md（v4正本）、docs/SEO_AIO_PLAN_2026-08.md（v3）、
../simplememo-ios/docs/VISION.md を読むこと。
規律: ①コピー・見出しはVISION §0（AI語を前面に出さない）と二層言語ルール（v4追記D-3'：
Capture OS/Multi-Destination/Zero-decision等の社内語を対外テキストに出さない）に従う
②未実測の数値を書かない（VISION §10。実測値は data/site-constants.json か正史レポートの値のみ・定義併記）
③SERPに触る変更は growth/experiments に台帳登録し、ベースラインを必ず記録してから実施
④line-keep-alternativeのCTR改善・EN新規ページ・FAQPageスキーマ追加・「メモアプリ おすすめ」汎用面は
やらない（v3 §6・v4 §6の継承）
⑤作業は claude/ ブランチ→コミット→push→PR作成（自動マージ対象になる。保留したい場合はdraft）。
```

---

## 依頼1: CPP配線 — 作成済み34本のカスタムプロダクトページをサイトCTAに接続【R1・最優先】

```
タスク: サイトの全App Store CTAリンクに ppid=（カスタムプロダクトページID）を付与する。

背景: ASCにCPPが34本作成済みだが、サイトからの配線がゼロ（唯一露出したmail-to-selfは
CVR 5.42%＝デフォルト2.45%の2.2倍）。CTAは既に pt=128498560&ct=<page>__<placement> 形式で
統一されており、ppidだけが無い。

作業:
1. ページクラスタ→CPPの対応表を data/ に定義する（例: /vs/notion* → vs-notion、
   /blog/line-keep-alternative → LINE Keep Alternative、/obsidian/* → obsidian-vault、
   /siri/ /hands-free/ → Siri系、/apple-watch* → watch-capture、/note-to-email/ → mail-to-self。
   対応が無いページはデフォルト＝ppidなし）
2. scripts/tag-cta-placements.js の隣に、対応表からhrefへppidを付与する生成処理を足す
   （既存のct/pt/placement属性を壊さない）
3. check-url-normalization 等の既存CIを通す
4. growth/ の週次レポートに「CPP別 閲覧数/DL/CVR」の表雛形を1つ追加する（値はASCから手動転記の前提）

オーナー側作業（依頼文と一緒に渡す）: ASCから各CPPのppid（UUID）一覧をエクスポートして渡すこと。

受け入れ基準: 対象ページのCTA hrefに ppid・pt・ct が併存し、既存CIが緑。
対応表にないページは変更なし。TikTok用CPP（R2.5で使用）も対応表に1行予約しておく。
```

---

## 依頼2: llms.txt 鮮度運用 ＋ AIチャネル計測の定例化【R4】

```
タスク: llms.txtの事実を最新化し、鮮度が切れたら検知される仕組みとAI経由計測の定型を作る。

背景: llms.txtの「Current facts」が2026-08-09・v5.7.3のまま（実際は新規の97%がv5.7.8）。
AI経由流入は約30セッション/月・エンゲージ75.9秒＝全チャネル最長で、Copilot引用36回の
源泉Bingも95セッション/月ある。AIは古い事実を引用し続けるため、このファイルの鮮度が上限を決める。

作業:
1. llms.txt の Current facts を更新する。バージョン・評価件数・価格は
   【オーナーがApp Store画面で確認した値】のみを使う（推測・外挿禁止。llms.txt自身の規律どおり）
2. scripts/seo-check系 に「llms.txtのLast updatedが30日を超えたら警告」チェックを1本追加（report-only）
3. growth/ の週次レポートに「AI経由」1表を追加: GA4のai-assistantチャネル＋AI参照ドメイン
   （copilot/claude.ai/gemini/chatgpt/openai）のセッション数と、そこからのapp_store_click
4. docs/indexnow-setup.md の手順どおりIndexNowが実際に送信されているかログで確認し、
   止まっていれば復旧する

オーナー側作業: App Storeの現在のバージョン・評価件数・価格のスクショか値を渡す。

受け入れ基準: llms.txtのLast updated更新・鮮度チェックがCIに出る・週次レポート雛形にAI表がある。
```

---

## 依頼3: トップページtitleの文法是正（実験として）【v4 §5-2】

```
タスク: トップページのtitle/H1/OGPを「AI前面」から「話すだけ→宛先」文法へ変更する実験を、
台帳登録の上で実施する。

背景: 現行title「Obsidian連携シンプルメモ｜AIタグ自動追加・話すだけでメールとObsidianへ」は
先頭がAI語で、VISION §0とPR実測（AI前面タイトルの回だけPV 1/26）の両方に逆行している。

作業:
1. growth/experiments に title-2026-08-20-home-grammar を登録。ベースライン:
   直近3ヶ月 187クリック/1,720表示/CTR 10.9%/平均順位7.6（GSC）。
   主指標はブランド検索の表示数とAIO表示数（CTRはブランド指名が主imp源のため動かない見込み、と台帳に明記）
2. title案: 「Obsidian連携シンプルメモ｜話すだけで、メールとObsidianへ残る」
   （AI言及はdescriptionの後半へ降格。削除はしない——AIタグは事実として残す）
3. H1・OGP・Twitterカードを同型に揃える。lang.js の meta-template 経路とキャッシュバスタ更新を忘れない
   （v3 §9-5の再発防止: /*.js はimmutableキャッシュのため ?v= 更新必須）
4. 評価日を3ヶ月後に設定

受け入れ基準: 台帳にベースラインつきで登録済み・title/H1/OGP一致・キャッシュバスタ更新・CI緑。
```

---

## 依頼4: Obsidian×音声ハブの増築 — AirPodsページ＋一次情報1本【R7】

```
タスク: ①「AirPods→Obsidianハンズフリー」実践ページ新設 ②一次情報記事1本の執筆。

背景: Obsidian設定済みコホートの活性97.6%・first sendの77%が音声（8/15-19窓・内部除外前の生値）。
8/18のPRリリース（AirPods×Siri）の転載28本から来る検索の受け皿が /siri/ と /obsidian/ の間に無い。

作業:
1. 新ページ: /siri/ と /obsidian/ を橋渡しする実践ページ（AirPodsをつけたまま
   「シンプルメモで残す」→ Obsidianの日次ノートに追記されるまでの手順・実機スクショ・制約の明記）。
   既存の「次に読む」カード設計（v3 P1-1）に従い、次の1歩は /obsidian/ へ
2. 一次情報記事: 「Obsidianに音声で挿す最速の経路」— 自社実測（77%音声）を引用する場合は
   R12-1の正史再取得後の値を使い、期間と定義を併記する。正史が未取得なら数値なしで構成し、
   数値はTODOコメントで置く
3. 内部リンク: /obsidian/ ハブ・/hands-free/・/apple-watch/ から各1本
4. VideoObjectを足す場合は uploadDate をタイムゾーン付きISO 8601で（v3 §9の再発防止・CI check 10）

受け入れ基準: 新ページ公開・内部リンク配線・sitemap反映・CI緑。
```

---

## 依頼5: インデックス衛生と disavow 更新【R11・四半期30-60分】

```
タスク: ①disavow.txtの8月新着SPAM追補 ②crawled-not-indexedの実ページへの内部リンク補強。

背景: docs/disavow.txt は2026-07-07版（286ドメイン）。Ahrefsでは8月に新着SPAM
（review-link-system等の .store/.shop PBN群）が増えている。GSCの「クロール済み未登録」63件の
大半は ?lang=/.html 残骸で実害小だが、実ページが数件混ざっている。

作業:
1. Ahrefsの参照ドメインエクスポート（オーナーから受領）から、既存disavowの選定基準
   （ファイル冒頭のRationale）に合致する新着SPAMドメインを追補。ファイルは全量置換方式である
   注意書きを維持
2. 実ページ（/blog/instant-capture-workflow・/blog/freelance-memo-management・
   /blog/line-keep-migration・/vs/todoist/ 等）に、文脈の合う既存ページから内部リンクを各1本足す。
   専用プロジェクト化はしない（v3 §6の精神）
3. 変更をPRに。GSCへのdisavowアップロードとインデックス再検証リクエストは【オーナー作業】と
   PR本文に明記する

受け入れ基準: disavow.txtのLast updated更新・追補ドメインの選定理由1行ずつ・内部リンクがCI緑で反映。
```

---

## 依頼6: 計測の宿題 — 月次フルファネル1枚とDiscover/D-SCORE台帳【R12】

```
タスク: ①月次「フルファネル1枚」レポートの雛形化 ②PR配信日アノテーション
③D-SCORE採点・Discover乗車判定の台帳欄 ④ファネル正史の再取得（8/27以降）。

背景: v4 §1のマップ（GSC表示→クリック→セッション→app_store_click→ASC閲覧→install→活性→D1→
サブスク開始→MRR）を毎月1枚で更新できる形が無い。PR配信日とスパイクの突合も手作業。

作業:
1. growth/reports/ に YYYY-MM-full-funnel.md の雛形と、埋められる箇所（GA4/GSC由来）を
   既存 ingest/analyze から自動で埋めるスクリプトを追加。ASC由来の数字は手動転記欄として明示
2. growth/ の系列データにアノテーション機構（date, type: pr|app_release|feature, label）を追加し、
   既知の5本のPR配信日と主要アプリリリース日を登録
3. 実験台帳にPRリリース用のレコード型を追加: D-SCORE採点（S1〜S7・G1〜G4）を配信前に記録し、
   配信後にDiscover乗車判定（参照元Google系比率・スマホ比率・転載数・PV）を追記する欄
4. 【8/27以降に実行】analytics:funnel 2026-08-15..19 を内部除外ありで再取得し正史として
   growth/reports/ に記録。sender_retention_d7 の resolved 初値と、8/18流入コホートのD7も記録

受け入れ基準: 雛形1枚が生成できる・アノテーション5本入り・台帳にD-SCORE欄・（8/27以降）正史レポート。
```

---

## 依頼7: 調査リリースのデータ準備 — 「音声シフト」一次データページ【弾薬庫案4のSEO/AIO側】

```
タスク: 調査型PRリリース（D-SCORE 75点）の土台になる一次データページをサイトに作る。

背景: 弾薬庫案4（v4追記B）。「運営者も本文を読めない設計のまま、メタデータだけで見た音声シフト」。
機能出荷が無い月のPR弾であると同時に、AIが引用する一次データ＝AIO資産になる。

作業:
1. 90日窓のメタデータ集計をgrowthのクエリで用意: first send入力方法の比率（音声/キーボード/Watch/Siri）、
   初日メモの文字数分布、送信の時間帯分布、Obsidian併用率。内部アカウント除外・n・期間・定義を必ず併記
2. サイトに調査ページを新設（/data/ or /blog/ 配下）: 表とグラフ、計測方法（何を取り、
   何を取れない設計か——本文非閲覧を明記）、引用ルール（llms.txtのAuthoritative Source Mapに追記）
3. Zero-decision系の未実測数値・Appleベンチマーク数値は使わない（VISION §10・v4 §5-5）
4. PRリリース原稿はこのページ公開後に別依頼（D-SCORE採点シートを添付して起案）

受け入れ基準: 集計スクリプトが再実行可能・調査ページ公開・llms.txt反映・CI緑。
```

---

## 運用注意

- 1件＝1セッション＝1PR。順番は依頼1→2→3→4→5→6→7（ROI順・依存順）。
- 依頼1と6は他の全施策の計測解像度を決める土台なので先行させる。
- iOS側の施策（レビュープロンプト移設・年額ファースト・Day0ソフトPW・サーベイ・en OAuth修正）は
  本セットの対象外——simplememo-iosリポジトリへの別依頼として起案する。
- PR配信そのもの（R3）はオーナー作業。配信前にD-SCORE採点（追記D）を必ず通す。

---

## 依頼8: トレンドレーダーの自動化 —「掴む」を毎朝の定型にする【追記E】

```
タスク: 既存の朝ルーチン/autopilotに「トレンドレーダー」1項目を追加する。

背景: v4追記E。トレンドは配信日の設計でD-SCOREのS5を買う材料であり、突発波（サービス終了・
値上げ・障害）はLINE Keepパターン（当日サイト記事→数日内に角度があればPR）の起点になる。
人力の見回りでは漏れるので毎朝の定型にする。

作業:
1. 毎朝の定型チェックを1ブロック追加: (a) Googleトレンド急上昇（日本）から自社関連語
   （メモ/ノート/Obsidian/Notion/Evernote/LINE/リマインダー/カレンダー/音声/AIレコーダー/iPhone）に
   マッチする急上昇の有無 (b) はてブ テクノロジー上位に隣接サービスの終了・値上げ・障害の話題が
   無いか (c) App Store仕事効率化ランキングの急変
2. ヒット時の出力: 「何の波か／自社との交点（ある/なし）／推奨アクション
   （当日サイト記事・X即応・PR候補としてD-SCORE採点・静観）」を1〜3行で
3. ヒットなしの日は1行（ノイズにしない）
4. 検知→対応の実績（波・対応・結果）を growth/ の系列アノテーション（依頼6）に記録する

受け入れ基準: 朝の定型に組み込まれ、初回の出力サンプルが確認できる。
既存ルーチンの他項目を壊さない。
```
