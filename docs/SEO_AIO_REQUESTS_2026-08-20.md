# SEO/AIO 一括施策依頼文（2026-08-20・統合版）

旧: 8本の個別依頼文セット → **1本に統合**（オーナー指示・2026-08-20）。
下の枠内をそのまま新しいセッションに貼れば、v4計画のサイト/計測側SEO/AIO施策が一気通貫で実行される。

---

```
# 依頼: SEO/AIO一括施策 — v4成長計画のサイト側 全8フェーズを順に実行

## 前提（着手前に必読）
docs/GROWTH_ROI_PLAN_2026-08-20.md（v4正本・追記A〜Eまで）、docs/SEO_AIO_PLAN_2026-08.md（v3）、
../simplememo-ios/docs/VISION.md を読んでから始めること。

## 規律（全フェーズ共通）
1. コピー・見出しはVISION §0（AI語を前面に出さない）と二層言語ルール（v4追記D-3'：
   Capture OS / Multi-Destination / Zero-decision 等の社内語を対外テキストに出さない）に従う
2. 未実測の数値を書かない（VISION §10）。実測値は data/site-constants.json か正史レポートの値のみ・
   期間と定義を併記。Appleベンチマーク数値（上位25%等）は対外に出さない
3. SERPに触る変更は growth/experiments に台帳登録し、ベースラインを記録してから実施
4. やらないこと（v3 §6・v4 §6の継承）: line-keep-alternativeのCTR改善／EN新規ページ／
   FAQPageスキーマ追加／「メモアプリ おすすめ」汎用面／ハードペイウォール前提のコピー
5. 進め方: claude/ ブランチ1本で作業し、**1フェーズ＝1コミット**（メッセージ冒頭に [P1]〜[P8]）。
   全フェーズ完了後にPRを1本作成し、**draftで出す**（自動マージ対象のため。Readyにするかはオーナー判断）。
   各フェーズで既存CI（seo-check系・check-url-normalization等）をローカル実行して緑を確認してから次へ

## 不足入力の扱い（重要）
オーナー入力が無い項目は**止まらずにTODOとしてスキップして先へ進み**、最後に「不足入力リスト」を出す。
必要な入力: (a) ASCの各CPPのppid（UUID）一覧【P1】 (b) App Storeの現バージョン・評価件数・価格【P2】
(c) Ahrefs参照ドメインの最新エクスポート【P5】

---

## P1. CPP配線【最優先】
ASCに作成済みのカスタムプロダクトページ34本がサイトから配線ゼロ（唯一露出のmail-to-selfは
CVR 5.42%＝デフォルト2.45%の2.2倍）。CTAは既に pt=128498560&ct=<page>__<placement> 形式で、ppidだけが無い。
- ページクラスタ→CPPの対応表を data/ に定義（/vs/notion*→vs-notion、
  /blog/line-keep-alternative→LINE Keep Alternative、/obsidian/*→obsidian-vault、/siri/ /hands-free/→Siri系、
  /apple-watch*→watch-capture、/note-to-email/→mail-to-self。対応なし＝ppidなし。
  TikTok用CPPも1行予約【R2.5用】）
- scripts/tag-cta-placements.js の隣に、対応表からhrefへppid付与する生成処理（既存ct/pt/placement属性を壊さない）
- growth/ の週次レポートに「CPP別 閲覧数/DL/CVR」表雛形を追加（値はASCから手動転記の前提）
- 受け入れ基準: 対象CTAに ppid・pt・ct 併存・対応表外は変更なし・CI緑

## P2. llms.txt鮮度 ＋ AIチャネル計測
Current factsが2026-08-09・v5.7.3のまま（実際は新規の97%がv5.7.8）。AI経由は約30セッション/月・
エンゲージ75.9秒＝全チャネル最長、Copilot引用36回の源泉Bingは95セッション/月。
- Current facts更新（バージョン・評価件数・価格は【オーナー確認値】のみ。無ければTODO）
- seo-check系に「llms.txtのLast updatedが30日超で警告」を追加（report-only）
- growth週次に「AI経由」1表: ai-assistantチャネル＋AI参照ドメイン
  （copilot/claude.ai/gemini/chatgpt/openai）のセッション数と、そこからのapp_store_click
- docs/indexnow-setup.md どおりIndexNowの送信をログで確認、止まっていれば復旧
- 受け入れ基準: 鮮度チェックがCIに出る・週次雛形にAI表・IndexNow稼働確認の記録

## P3. トップページtitleの文法是正（実験）
現行title「Obsidian連携シンプルメモ｜AIタグ自動追加・話すだけでメールとObsidianへ」は先頭がAI語で、
VISION §0とPR実測（AI前面回のPV 1/26）に逆行。
- growth/experiments に title-2026-08-20-home-grammar を登録。ベースライン: 直近3ヶ月
  187クリック/1,720表示/CTR 10.9%/順位7.6。主指標=ブランド検索表示数とAIO表示数
  （CTRは指名検索が主imp源のため動かない見込み、と台帳に明記）。評価日3ヶ月後
- title案: 「Obsidian連携シンプルメモ｜話すだけで、メールとObsidianへ残る」
  （AI言及はdescription後半へ降格。削除はしない）。H1・OGP・Twitterカード同型化
- lang.jsのmeta-template経路とキャッシュバスタ ?v= を更新（v3 §9-5の再発防止:
  /*.js はimmutableキャッシュ）
- 受け入れ基準: 台帳登録済み・title/H1/OGP一致・バスタ更新・CI緑

## P4. Obsidian×音声ハブ増築
Obsidian設定済み新規の活性97.6%・first sendの77%が音声（8/15-19生値）。8/18リリース転載28本の
検索受け皿が /siri/ と /obsidian/ の間に無い。
- 新ページ:「AirPods→Obsidianハンズフリー」実践ページ（AirPodsのまま「シンプルメモで残す」→
  Obsidian日次ノート追記までの手順・実機スクショ・制約明記）。「次に読む」カードは /obsidian/ へ
- 一次情報記事「Obsidianに音声で挿す最速の経路」— 実測値はP8の正史再取得後の値のみ使用・
  期間定義併記（正史未取得なら数値はTODOで置いて公開可能な構成にする）
- 内部リンク: /obsidian/・/hands-free/・/apple-watch/ から各1本
- VideoObjectを足すならuploadDateはタイムゾーン付きISO 8601（CI check 10）
- 受け入れ基準: 新ページ公開・内部リンク・sitemap反映・CI緑

## P5. 衛生 — disavow追補＋内部リンク補強
disavowは7/7版286ドメイン。8月に .store/.shop PBN群が新着。GSC未登録63件の大半は残骸だが実ページが数件混在。
- Ahrefsエクスポート（無ければTODO）から冒頭Rationale基準の新着SPAMを追補（全量置換方式の注意書き維持）
- /blog/instant-capture-workflow・/blog/freelance-memo-management・/blog/line-keep-migration・
  /vs/todoist/ 等へ文脈の合う内部リンク各1本（専用プロジェクト化しない）
- GSCへのアップロードと再検証リクエストは【オーナー作業】とPR本文に明記
- 受け入れ基準: Last updated更新・追補理由1行ずつ・CI緑

## P6. 計測 — フルファネル1枚＋アノテーション＋D-SCORE台帳
- growth/reports/ に YYYY-MM-full-funnel.md 雛形＋GA4/GSC由来を既存ingest/analyzeから自動で埋める
  スクリプト（ASC由来は手動転記欄と明示）。1枚の並び: GSC表示→クリック→セッション→app_store_click→
  ASC閲覧→install→活性→D1→サブスク開始→MRR
- 系列にアノテーション機構（date, type: pr|app_release|feature, label）を追加し、既知のPR5本
  （4/24・6/1・7/6・8/3・8/18）と主要アプリリリース日を登録
- 実験台帳にPRリリース型レコードを追加: 配信前D-SCORE採点（S1〜S7・G1〜G4、v4追記D）と
  配信後のDiscover乗車判定（Google系参照比率・スマホ比率・転載数・PV）の欄
- 受け入れ基準: 雛形が生成可能・アノテーション5本・台帳にD-SCORE欄

## P7. 調査データページ —「音声シフト」一次データ（弾薬庫案4の土台）
- 90日窓のメタデータ集計をgrowthのクエリで用意: first send入力方法比率・初日メモ文字数分布・
  時間帯分布・Obsidian併用率（内部除外・n・期間・定義を必ず併記）
- サイトに調査ページ新設（/data/ or /blog/ 配下）: 表とグラフ・計測方法（本文非閲覧設計を明記）・
  引用ルール（llms.txtのAuthoritative Source Mapに追記）
- PRリリース原稿はこのフェーズに含めない（ページ公開後に別途、D-SCORE採点シート添付で起案）
- 受け入れ基準: 集計が再実行可能・ページ公開・llms.txt反映・CI緑

## P8. 正史再取得＋トレンドレーダー文面
- 【本日が2026-08-27以降の場合のみ】simplememo-api で analytics:funnel 2026-08-15..19 を
  内部除外ありで再取得し、growth/reports/ に正史として記録（sender_retention_d7のresolved初値・
  8/18流入コホートのD7含む）。8/27より前なら実行手順だけをレポート雛形に書き、TODOで残す
- 朝ルーチン/autopilot用「トレンドレーダー」プロンプト文面を docs/ に作成（v4追記E準拠）:
  (a) Googleトレンド急上昇（日本）×関連語（メモ/ノート/Obsidian/Notion/Evernote/LINE/リマインダー/
  カレンダー/音声/AIレコーダー/iPhone） (b) はてブテクノロジーの隣接サービス終了・値上げ・障害
  (c) App Store仕事効率化ランキング急変 → ヒット時は「何の波か／自社との交点／推奨アクション」を
  1〜3行、なしの日は1行。検知→対応→結果はP6のアノテーションに記録する仕様
  （ルーチンへの実組み込みはオーナー環境の作業のため文面まで）
- 受け入れ基準: （8/27以降なら）正史レポート・トレンドレーダー文面ファイル

## 完了報告のフォーマット
1) フェーズ別の完了/スキップ一覧（スキップは理由つき） 2) 不足入力リスト（a〜c＋新たに判明したもの）
3) 作成したPRのURL（draft） 4) 台帳に登録した実験IDと評価日 5) オーナーの次アクション3行以内
```

---

## 補足（この統合版の使い方）

- 対象はサイト/計測リポジトリ（simplememo）で完結する施策のみ。**iOS側**（レビュープロンプト移設・
  年額ファースト・Day0ソフトPW A/B・「どこで知った？」サーベイ・en OAuth no_response修正）は
  simplememo-ios への別依頼として起案する。
- **PR配信そのもの（R3）とASA設定（R9a）・GSC操作はオーナー作業**。配信前はD-SCORE採点（v4追記D）を必ず通す。
- 1セッションで終わらなかった場合は、完了報告の「フェーズ別一覧」を次セッションの冒頭に貼って続きから。
