# Obsidian Autopilot Log

定期自動生成セッションの実行記録。**1回=1エントリ**。書かなかった回も記録する
（「書く理由がなかった」は正常な結果）。書式:

```
## YYYY-MM-DD — <アクション種別: New / Refresh / 配線 / 保守のみ>
- 判断根拠: <データと出典>
- やったこと: <1行>
- PR: #NNN → <merged / pending / closed>
- 検証: <何を実測/検証したか・できなかったか>
- 保留・オーナー依頼: <あれば>
```

---

## 2026-08-11 — New（初回・手動運転で実証）

- 判断根拠: `new-queue.json` N1。2026-08-11スナップショットで
  `logseq obsidian` 25imp / `logseqとobsidian どちらが 良い` 23imp（0クリック・pos9.2）/
  `logseq obsidian 比較` 14imp / `logseq 料金` 15imp / `logseqとは` 16imp。
  Obsidian軸の比較ページがサイトに0本という構造的空白。
  R1〜R3は棄却済み・R4/R5はブロック中のため、実行可能な最上位がN1だった。
- やったこと: `/obsidian/compare/logseq/` 新設＋`/vs/logseq/`に意図分岐バナー配線
  ＋llms.txt・sitemap・OG画像。
- PR: #470 → **merged**（SEO Validation通過→auto-merge→本番デプロイ）
- 検証: このLinux環境にObsidian 1.13.6 / Logseq 0.10.15 / Logseq 2.0.1を
  実際にインストールし、同一フォルダ共存・往復書き込み・DB版の非Markdown保存を
  スクリーンショット付きで確認（記事に7枚掲載）。プラグイン数は公式レジストリを
  当日実カウント（Obsidian 6,571+680 / Logseq 546+66）。
  **iOSアプリは未検証**（記事内に明示済み）。
  iPhoneビューポート(390×844 DPR3)の実描画QAで水平スクロールなしを確認。
- 保留・オーナー依頼:
  - なし（Simulator撮影が必要な主張はこの記事に含めていない）
  - 次回スナップショット（2026-09-06以降推奨）で本記事の表示/順位を確認し、
    `/vs/logseq/` からの意図分岐が効いたかを見る

## 2026-08-11 — 運用開始メモ

- `AUTOPILOT_RUNBOOK.md` を導入し、3日ごと 06:00 JST の定期セッション
  （Simple Memo環境・新規セッション起動）を設定した。
- 定期セッションはこのログの末尾にエントリを追記していくこと。

## 2026-08-11 — 運用変更: 毎日運転＋日報メール開始

- オーナー指示により 3日ごと → **毎日 06:00 JST** へ変更（Routine更新済み）。
  目標は毎日1記事、ただしノイズフロア・品質ゲートが常に優先（Runbook改訂参照）。
- 実行結果は `data/autopilot-status.json` → `simplememo-api` の
  `autopilot_report` cron（10:00 JST）→ Resend でオーナーへ日報メール。
  スキップ日もJSONを更新すること（更新なし＝上流停止として報告される）。

## 2026-08-11 — 拡張: content-graph導入とレーン制（オーナーの#471レビュー反映）

- 実装: `data/content-graph.json`（Obsidianクラスタ16ページ・
  INTERNAL_LINK_PLANのC案）＋ `scripts/check-content-graph.mjs`（CI組込。
  URL/parent/sibling/nextStep実在・語彙・BUSINESS_RELEVANCE整合・
  /obsidian/配下の登録必須）
- Runbook改訂: アクションをレーン制へ（A: SEO / B: AIO回答ブロック /
  C: Evidence Asset一次情報 / D: Paid relevance例外・四半期1本上限）。
  llms.txtは「引用可能な一次情報・訂正があるときのみ」に基準変更
- 積み残し（優先順・今後の回で消化）:
  1. weekly-report.mjs へのObsidianクラスタ節＋AIO節（AUTOMATION_PLAN A1）
  2. build-topic-map（同A2）
  3. ai-citation-strategy.md の4状態監査（VERIFIED/OBSERVED/HYPOTHESIS/DEPRECATED）
- オーナー判断待ち（セッションからは実装不可）:
  - App Store Connect の ct= 別インストール/課金CSVの定期エクスポート
    （growth/data/appstore/ は受け皿だけ存在・SEO→Paidの接続に必須）
  - AI Visibility Probe（外部AI各社への定点質問）: 外部APIキーと予算が必要。
    導入するなら growth/data/ai-probes/ に機械可読で貯める設計から

## 2026-08-11 — キー不要の外部観測レーンを実装（オーナー質問への回答）

- App Store Connect「キャンペーン」が90日間で空だった件: **計測の故障ではない**。
  ct=/pt= の形式は正しく、原因は流量（App Storeクリック2.1件/日）×インストール率
  ×App Analytics共有オプトイン率が、Appleの表示閾値（少数は秘匿）未満のため。
  流量が育つまでキャンペーン別は出ない。代替の閉ループ:
  **獲得→ソース（Webリファラー）と収益化のCSVを月1でDL** → growth/input/ へ
  （GSC週次5分の儀式に統合）。自動化したくなったら、iOSリポジトリが既に持つ
  App Store Connect APIキー（fastlane/nominations用）でAnalytics Reports APIを
  叩く道がある＝**新種のキーは不要**（オーナー判断待ち）
- 追加した観測レーン（すべてAPIキー・課金なし）:
  1. `growth/input/AI_PROBE_PROTOCOL.md` — 月1・10分の手動AIプローブ
     （質問はGSC実測の会話型クエリ由来で固定・回答貼り付け→自動集計）
  2. `growth/data/mentions/` — 毎日セッションのWebSearchによる週次言及ウォッチ
  3. AI経由の実流入: ChatGPT(utm_source=chatgpt.com)・Perplexity等のリファラーは
     **GA4に既に記録されている**。月1のGA4エクスポート（獲得→セッションの参照元）
     を growth/input/ に置けば取り込む。GA4のBigQueryリンク（無料・一度きり）を
     設定すれば全自動化可能（GSCのBQ設定と同じ流儀）
- 提案のみ（本番の全リクエスト経路に触るため勝手にやらない）:
  functions/_middleware.js でAIクローラーUA（GPTBot/OAI-SearchBot/PerplexityBot/
  ClaudeBot/Google-Extended）のヒットをsimplememo-apiへwaitUntilビーコン→D1集計
  →「AIに読まれたページ」を日報へ。実装は小さいが1ホップ設計への追加なので要承認

## 2026-08-12 — インシデント: 定期実行の初回不発 → 実行基盤をGHA主・CCR副へ

- 事実: Routine trig_016ALpozNRuf2j7BYJo5cCqy は 2026-08-11T21:01:48Z に
  発火した記録がある。しかしブランチ・PR・status JSON・セッション一覧の
  いずれにも実行痕跡がない（スケジュール起動セッションは一覧非表示で
  ログを外部から確認できない）。原因は特定不能（アカウントの7日レート制限が
  警告域だったことは状況証拠として記録しておく）。
- 対応: `.github/workflows/obsidian-autopilot.yml` を追加（06:00 JST・
  claude-code-action・ログ全可視・秘密鍵未設定なら緑スキップ・GH_PAT優先で
  SEO Validation起動を保証）。CCR Routineは 07:30 JST のフォールバックに変更し、
  両経路に同一の冪等ガード（当日ブランチ existence / status date_jst）を入れた。
- 本日: 記事はスキップ（maintenance）。status JSONに当日分を記録済み。
- オーナー依頼: repo secret `CLAUDE_CODE_OAUTH_TOKEN` の登録（`claude setup-token`）。
  未設定の間はGHAは寝たままCCR副系のみで運転される。

## 2026-08-12 — Refresh（レーンB回答ブロック・代走実行）

- 経緯: 早朝の定期実行は基盤切替のmaintenanceのみ（上のインシデント記録参照）。
  オーナー指示により当日分を代走で実行（status JSONのmaintenance記録を
  本エントリの実行記録で上書き）。
- 判断根拠: 会話型検出器で「logseqとobsidian どちらが 良い」23imp・pos9.2・
  0クリック（growth/data/gsc/2026-08-11）。公開翌日の /obsidian/compare/logseq/ に
  質問文h2の回答ブロックが無く、レーンBの条件（順位を持つ会話型クエリ×
  質問文h2の不在）に合致。
- **レーンA（memos比較の新記事）は棄却し、Runbookの誤記を訂正**:
  §6の「『memos vs obsidian』32imp・pos4.1は足切りを超える」は、実カーブ
  （expectedCtr: ENセグメント1.76%）では期待0.56クリックで足切り3を大きく
  下回る誤判定だった。業界一般のCTR表（pos4≈10%）による暗算が原因とみられる。
  §6の重複段落2組も整理。今後の需要判定は必ず実カーブで計算すること。
- やったこと: 先頭tip-box「ひとことで言うと」を data-answer-block=
  "logseq-or-obsidian"（質問文h2＋2文断定・JA/EN）へ格上げ（新規主張なし・
  タイトル/description/FAQ JSON-LD不変更）＋実験台帳登録
  （aio-2026-08-12-logseq-answer-block・評価2026-11-12）＋Mention &
  Competitor Watch初回スナップショット（growth/data/mentions/2026-08-12.json）
  ＋sitemap再生成（unshallow後）。
- PR: #480 → **merged**（SEO Validation通過→auto-merge。status JSONとログ追記は
  auto-merge発火後のpushとなったため、本追記PRで別送）
- 検証: 回答ブロックは実機検証済み事実の言い直しのみ。Runbook §4の
  9チェック全通過（seo-check 0/0）＋iPhoneビューポート実描画QA
  （水平スクロールなし・回答ブロックはファーストビュー内 top=667px）。
  Mention Watchは米国ロケールのWebSearchによる取得で、attnoel記事の本文は
  egress制限で未確認（verified: false と明記）。
- 保留・オーナー依頼:
  - repo secret `CLAUDE_CODE_OAUTH_TOKEN` の登録（前日からの継続）
  - 次回レーンB候補: 「チームでノートを共同作業」(7imp・pos7.6)等の小粒が残存
  - memos比較は2026-09-06以降の新スナップショットで需要再判定

## 2026-08-12 — レーンE追加実行: C02（New・カバレッジ）

- 判断根拠: オーナー明示指示（2026-08-12「まとめサイト化の加速」）による
  レーンE（Coverage）実行。`growth/content/coverage-queue.json` C02
  `/obsidian/getting-started/`（P1・入門系統・ノイズフロア非適用。ゲート＝
  品質80点＋§28＋固有価値）。本日の定期実行（Refresh・PR #480）とは別枠。
- やったこと: `/obsidian/getting-started/` 新設（実画面スクショ6枚）＋
  被リンク3本配線（/obsidian/・/obsidian/daily-note/・/obsidian/compare/logseq/）＋
  content-graph.json登録（obsidian-beginnerクラスタ新設）＋OG画像＋sitemap。
  PR #482が未マージ（コンフリクト）のため、coverage-queue.json と
  OBSIDIAN_COVERAGE_PLAN.md は本PRに同梱してC02をdone化。
- PR: #483 → **merged**（SEO Validation通過→auto-merge→本番200確認済み）
- 検証: このLinux環境（Ubuntu 24.04・Xvfb）にObsidian 1.13.6公式AppImageを
  実際にインストール・日本語UIで起動し、保管庫作成→最初のノート→[[リンク]]→
  グラフビューまでを実操作で撮影（6枚掲載）。作成直後の保管庫の中身
  （.obsidian＋ようこそ.mdのみ）とノートの.md実体もファイルシステムで実確認。
  登録不要（メール入力ゼロ）で完結することを確認。配布形式（.exe/.dmg/
  AppImage/deb/tar.gz）はv1.13.6公式リリースへのHEADリクエストで当日実測。
  Windows/macOS/iOS版の実行は未検証（記事に明示）。llms.txtは見送り
  （数値系一次情報が薄く、N1の前例でも追加していない基準に合わせた）。
- 保留・オーナー依頼: PR #482（カバレッジ計画本体）がコンフリクトで
  auto-merge不可のまま。本PRとの重複2ファイルはこちらが新しい
  （C02 done反映済み）。#482側はrebaseまたはクローズの判断を推奨。

## 2026-08-13 — 保守のみ（副系CCR代走・新規スナップショットなし）

- 判断根拠: 冪等性チェックで主系(GitHub Actions)の当日分実行痕跡なし
  （`claude/obsidian-auto-20260813` ブランチ不在・status JSONのdate_jstが
  2026-08-12のまま）を確認し副系で実行。GSCスナップショットは2026-08-11から
  増えておらず、`analyze.mjs --only conversational/unanswered` の出力は
  前回と同一。会話型クエリでObsidian関連のものは「logseqとobsidian どちらが
  良い」(23imp・pos9.2)のみで、これは既にPR #480で回答ブロック対応済み
  （pos変化なし=再クロール未反映の可能性、需要側の新規性なし）。他の会話型
  クエリ（チーム共同作業アプリ等）はObsidianブランドと無関係のため本ハブの
  スコープ外。レーンC（Evidence Asset）は直近2回（PR #470・#483）とも実機
  検証込みで直近48時間以内のため見送り。Mention Watchは前回2026-08-12取得で
  7日未満のため対象外。Lane E(Coverage)はオーナー明示指示がある回限定のため
  今回は対象外と判断。新規記事を正当化する根拠が無いため保守レーン(§6)へ。
- やったこと: `docs/ai-citation-strategy.md` の主張監査（§6メニュー・
  未着手だった4状態表記を導入）。Google AI Overviews節の✅4項目
  （Google-Extended許可／FAQPage JSON-LD実装数／`/about/`のPerson+
  Organization構造化データ／全ブログ記事のdateModified）を実地検証し
  VERIFIED注記と根拠を付与。残りの節（Perplexity以降）は次回以降に持ち越し
  （全量一括はしない、が方針）。
- PR: （本エントリ作成時点で未作成・`docs/`+`data/`のみのdocs-onlyで
  SEO Validationは素通り見込み）
- 検証: `grep -rl "FAQPage" --include="*.html" .` で62ページ実測（旧記載の
  下限見積り「7+」を大幅に上回ることを確認）。`about/index.html` のJSON-LD内
  `Person`/`worksFor: Organization` を実読。`blog/*.html` 57本全件で
  `dateModified` の存在をgrep実測（欠落0件）。`robots.txt:71` に
  `User-agent: Google-Extended` を確認。本番稼働中ページの生存確認
  （`/obsidian/`・`/obsidian/compare/logseq/`・`/obsidian/getting-started/`
  いずれもHTTP 200）。`node scripts/seo-check.js` 0 errors 0 warnings。
- 保留・オーナー依頼:
  - GitHub Actions repo secret `CLAUDE_CODE_OAUTH_TOKEN` 登録（継続・
    2026-08-11から）
  - 次回、新しいGSCスナップショットが増えていればレーンA/Bを再判定
  - レーンC候補: プラグイン数の再計測（前回実測2026-08-11・鮮度維持目的）
  - `ai-citation-strategy.md` の残り監査（Perplexity〜Tier-2節）を数項目ずつ継続

## 2026-08-14 — レーンC（Evidence Asset・定点データの鮮度維持・副系CCR代走）

- 判断根拠: 冪等性チェックで主系(GitHub Actions)の当日分実行痕跡なし
  （`claude/obsidian-auto-20260814` ブランチ不在・status JSONのdate_jstが
  2026-08-13のまま）を確認し副系で実行。GSCスナップショットは2026-08-11から
  増えておらず、`analyze.mjs --only unanswered/conversational` の出力は前回
  （2026-08-13）と同一。Obsidian関連の会話型クエリは「logseqとobsidian
  どちらが良い」(23imp・pos9.2)のみでPR #480対応済み・新規性なし。よって
  レーンA/Bは今回も正当化できず、前回ログの申し送り「レーンC候補: プラグイン
  数の再計測（前回実測2026-08-11・鮮度維持目的）」を実行。
- やったこと: `/obsidian/compare/logseq/` のプラグイン・テーマ実カウントを
  再計測（obsidianmd/obsidian-releases・logseq/marketplace の両公式
  レジストリを2026-08-14に直接カウント）。数値が変動していたため記事本文・
  比較表・FAQ（JSON-LD＋可視HTML）・出典欄・meta description・byline・
  dateModifiedを更新。文中の他の日付（公開日2026-08-11・同一フォルダでの
  実機検証日2026-08-11・実験時のファイル名 `2026-08-11.md`
  `journals/2026_08_11.md`）はその日に実際に行った検証・撮影の記録であり
  未変更（数値のみの部分更新であることをbyline・table caption・footer
  verification欄に明記）。sitemap再生成（`git fetch --unshallow`後）。
- PR: （本エントリ作成時点で未作成）
- 検証: Obsidian community-plugins.json 6,571→**6,638個**（+67）・
  community-css-themes.json 680→**691種**（+11）を
  `raw.githubusercontent.com/obsidianmd/obsidian-releases/master/` から
  直接取得しNode.jsで配列長カウント。Logseq marketplace は
  `packages/*/manifest.json` 612件中 `"theme": true` が66件・残り
  **546個**でプラグイン数・テーマ数とも**前回から変動なし**（`git clone
  --sparse` で packages/ のみ取得）。倍率「約12倍」は変わらず（6,638/546≈
  12.2）。`node scripts/seo-check.js` 0 errors 0 warnings、
  `check-css-version.mjs`/`check-benchmark.mjs`（本ページ無関係の既存
  レポートのみ）/`check-url-normalization.mjs`/`check-internal-redirects.mjs`
  /`sync_constants.js --check`/`tag-cta-placements.js --check`/
  `growth/scripts/check-experiments.mjs`/`check-content-graph.mjs`
  全て通過。iPhoneビューポート実描画QA（390×844 DPR3・Playwright、
  実行後 `npm uninstall playwright` で後片付け）: 水平スクロールなし
  （scrollWidth=clientWidth=390）、比較表はカード化されモバイルで縦積み
  表示、更新後の数値（6,638個／691種）が正しく表示されることを確認。
  回答ブロック（レーンB既存分）は不変であることも併せて確認。
- 保留・オーナー依頼:
  - GitHub Actions repo secret `CLAUDE_CODE_OAUTH_TOKEN` 登録（継続・
    2026-08-11から）
  - 次回、新しいGSCスナップショットが増えていればレーンA/Bを再判定
  - `ai-citation-strategy.md` の残り監査（Perplexity〜Tier-2節）を数項目ずつ継続
  - Mention Watchは前回2026-08-12取得のため2026-08-19以降に次回

## 2026-08-15 — 保守のみ（副系CCR代走・新規スナップショットなし）

- 判断根拠: 冪等性チェックで主系(GitHub Actions)の当日分実行痕跡なし
  （`claude/obsidian-auto-20260815` ブランチ不在・status JSONのdate_jstが
  2026-08-14のまま）を確認し副系で実行。GSCスナップショットは2026-08-11から
  増えておらず、`analyze.mjs --only unanswered/conversational` の出力は前回
  （2026-08-14）と同一。Obsidian関連の会話型クエリは「logseqとobsidian
  どちらが良い」(23imp・pos9.2)のみでPR #480対応済み・新規性なし。他の
  会話型クエリ（apple watchでメモを音声入力・議事録テンプレート等）は
  Obsidianブランドと無関係のため本ハブのスコープ外。よってレーンA/Bは
  今回も正当化できず、レーンC（Evidence Asset）は前々回（2026-08-14の
  プラグイン数再計測）から24時間以内のため見送り。Mention Watchは前回
  2026-08-12取得で7日未満のため対象外。GSC新規owner入力（AIプローブ・
  App Store CSV）もgrowth/input/に無し。前回ログの申し送り「ai-citation-
  strategy.mdの残り監査（Perplexity以降）を数項目ずつ継続」を実行。
- やったこと: `docs/ai-citation-strategy.md` §2 Perplexityの✅3項目
  （PerplexityBot/Perplexity-User許可・ベンチマーク記事2本・全vs/*ページの
  比較表）を実地検証しVERIFIED注記を付与。
- PR: （本エントリ作成時点で未作成・`docs/`+`data/`のみのdocs-onlyで
  SEO Validationは素通り見込み）
- 検証: `grep -n -i "perplexity" robots.txt` で `PerplexityBot`（57行目）・
  `Perplexity-User`（64行目）を実測。`blog/fastest-memo-app-benchmark.html`・
  `blog/benchmark-methodology.html` の実在とOG画像・QR資産の生成済みを
  ファイルシステムで確認。`vs/*/index.html` 全38ページを走査し `<table` の
  存在を実測（欠落0件）。`node scripts/seo-check.js` 0 errors 0 warnings
  （本変更はdocs/のみでHTML非変更のためcontent-graph/mobile QA/experiments
  チェックは対象外）。
- 保留・オーナー依頼:
  - GitHub Actions repo secret `CLAUDE_CODE_OAUTH_TOKEN` 登録（継続・
    2026-08-11から）
  - 次回、新しいGSCスナップショットが増えていればレーンA/Bを再判定
  - `ai-citation-strategy.md` の残り監査（§3 Microsoft Copilot以降の節）を
    数項目ずつ継続
  - Mention Watchは前回2026-08-12取得のため2026-08-19以降に次回

## 2026-08-15（追記2） — オーナー依頼の追調査: 日報の評価と、BQエクスポート稼働の検出

**これは定期セッションの回ではない。** 同日の日報メールに対するオーナーからの
「どう評価するか」に答える中で、報告内容の追試と、その結果見つかった
誤報の原因修正までを行った回。

- 追試（今日の報告は正しかったか）: `ai-citation-strategy.md` §2 に付けた
  VERIFIED 3項目を独立に全件追試し、**全て一致**（`robots.txt:57,64` の
  PerplexityBot/Perplexity-User・ベンチマーク記事2本の実在・`vs/*/index.html`
  38ページの `<table>` 欠落0件）。**「検証した」と書いた内容が実際に検証されている**
  ことを確認した。スキップ判断そのものも妥当だった。
- **見つかった誤報**: 「新規GSCスナップショットは2026-08-11から増えておらず」は
  `growth/data/gsc/` だけを見た結論で、不正確だった。**BigQuery一括エクスポートは
  2026-08-13から稼働している。** BigQuery MCP で `yurika-simplememo.searchconsole`
  を実測:
  - 3テーブル（`ExportLog` / `searchdata_site_impression` /
    `searchdata_url_impression`）が実在
  - `data_date` 2026-08-10〜08-12（3日・942行）
  - 着弾（JST）: 08-13 04:20（08-10分）→ 08-13 17:11（08-11分）→
    **08-14 16:39（08-12分）** と毎日
  - 本日のセッション（07:35 JST）の**15時間前**に新データが入っていた。
    08-13・08-14の回も同様で、**3日連続で同じ誤報**をしている
- **原因はRunbookの欠陥**（autopilotの判断ミスではない）: §1は
  「新しいGSCスナップショットが `growth/data/gsc/` に増えていれば」としか
  書いておらず、BigQuery・`bq-preflight.mjs`・`ingest-bigquery.mjs` への言及が
  grep実測で**ゼロ**だった。autopilotは古い手順書を忠実に実行していた。
- 併せて実測した、新データにしか無い情報:
  - ドイツ語クラスタ: `logseq obsidian vergleich` 6imp/pos26.5・
    `logseq obsidian unterschiede` 2imp・`logseq vorteile` 2imp
  - `email to obsidian` 8imp/pos10.1 ＋ `send email to obsidian` 3imp
  - `/obsidian/compare/logseq/`（08-11公開）の**初実測** 4imp・1click。
    08-11のログが「次回スナップショット（2026-09-06以降推奨）で確認」と
    申し送っていた項目が、もう見られる状態になっていた
  - いずれも3日分では足切り未満。**「記事を書くべきだった」ではない**。
    正しかったのは「稼働を検知して報告し、28日到達までのカウントダウンを
    開始する」で、スキップという結論自体は変わらない
  - 手動CSVスナップショットは `row_counts.queries` が上限ちょうどの**1000行**で
    切断されていることも確認（BQ移行でこの上限が外れる）
- やったこと（本コミット）:
  1. Runbook **§1-2「データ鮮度の確認」を新設** — BQを一次・手動CSVを二次とし、
     `bq-preflight.mjs` が認証失敗する場合の BigQuery MCP 直読クエリを常備。
     **「取得できなかった」を「増えていない」と報告するのは誤報**と明記
  2. Runbook §2 レーンC — 「週に1回以上」は**下限でありクールダウンではない**と
     明記。08-13「48時間以内だから見送り」・08-15「24時間以内だから見送り」は
     根拠の向きが逆だった（結果として08-14に実行しており下限は割っていない）
  3. Runbook §5-2 — status JSON に `streak` / `data_freshness` を追加。
     日報API側が未対応のため、`reason` 先頭を状態サマリ1行にする規約も追加
  4. `growth/BIGQUERY_SETUP.md` — 「届いていない」という記述が実態と逆に
     なっていたため現況（実測値つき）に差し替え。旧記述はトラブルシュートとして温存
  5. `data/autopilot-status.json` — 新フィールドを投入し、本日分の `reason` /
     `verified` を追記形式で訂正（元の記録は消していない）
- 検証: `node scripts/seo-check.js` 0 errors 0 warnings。本変更は
  `docs/` + `growth/` + `data/` のみでHTML非変更のため content-graph /
  モバイルQA / experiments チェックは対象外。status JSON のスキーマ妥当性を
  `json.load` で確認
- 保留・オーナー依頼:
  - **【最優先・新規】BigQueryのサービスアカウント鍵**を Secret
    `GCP_SERVICE_ACCOUNT_JSON` に登録（`growth/BIGQUERY_SETUP.md` §3-B）。
    現状 `bq-preflight.mjs` / `ingest-bigquery.mjs` はコンテナに資格情報が無く
    `Cannot authenticate` で落ちるため、autopilotが自力でデータを取れない
  - GitHub Actions repo secret `CLAUDE_CODE_OAUTH_TOKEN` 登録（継続・2026-08-11から）
  - `simplememo-api/src/autopilot-report.ts` が `streak` / `data_freshness` を
    描画するまで、日報での可視化は `reason` 先頭の【】1行に依存する（別リポジトリ）
  - 28日到達は **2026-09-06前後**。それまでは部分期間のスナップショットを作らない

## 2026-08-17 — オーナー依頼の評価: 2日連続の実行記録ゼロ＝上流停止の切り分け

**これは定期セッションの回ではない。** 日報（2026-08-17）の「当日記録なし
（最新: 2026-08-15）」に対するオーナーからの「どう評価するか」に答え、
その過程で見つかった**検知の穴**を塞いだ回。

- 実測した事実:
  - `origin/main` = `178d420`、`data/autopilot-status.json` の `date_jst` は
    **2026-08-15 のまま**。`claude/obsidian-auto-20260816` / `-20260817` は
    origin に**存在しない**。simplememo の open PR は **0件**。
    → 08-16・08-17 は**記録ごと無い＝上流停止**で、品質ゲートによるスキップではない
  - **主系（GitHub Actions）は一度も本稼働していない。** 今朝の run
    （`2026-08-16T21:16:17Z` = 08-17 06:16 JST）は conclusion **success** だが
    所要 **5秒**で、Checkout以降は全て `skipped`。ログの env が
    `HAS_CLAUDE_TOKEN: false` / `HAS_ANTHROPIC_KEY: false`。08-13以降の5回すべて同じ
  - **副系（CCR Routine）が消えている。** `list_triggers` を作成日
    2026-08-11→07-25 まで確認したが日次cronのRoutineが1件も無く、
    上の 2026-08-12 エントリに記録した `trig_016ALpozNRuf2j7BYJo5cCqy` も無い。
    一方 08-13/14/15 の autopilot コミットは **07:35 / 07:49 / 07:35 JST** 着弾で、
    副系の07:30スロットそのもの。→ Routineは **08-15 07:30 と 08-16 07:30 の間に停止**。
    消えた理由は特定できない（削除/環境消滅/レート制限のいずれか）
  - BigQuery はこのコンテナで依然 `Cannot authenticate`。加えて
    **このセッションに BigQuery MCP は無い**（MCPは github と Claude_Code_Remote のみ）。
    Runbook §1-2 が定めた「認証が落ちたら BigQuery MCP で直読」は
    **セッションによっては存在しない**回避策である点を記録しておく
- **見つかった検知の穴**: `cron-health.yml` は
  `event=schedule && conclusion=failure` しか集計しない。ところが
  obsidian-autopilot.yml は秘密鍵未設定時に **Gateで success** するよう
  意図的に設計されている。よって主系が一度も動いていなくても cron-health は
  永久に沈黙する。08-16の停止に気づけた経路は **10:00 JSTの日報メールだけ**
  だった（人がメールを読むことが唯一の網）
- やったこと（本コミット）: `.github/workflows/autopilot-health.yml` を新設。
  設定ではなく**成果物**（status JSON が当日分に更新されたか）を12:00 JSTに見る。
  ① デフォルトブランチの `data/autopilot-status.json` → 上流が動いたか
  ② 本番（Pages）の同ファイル → 出荷されたか
  ①が古ければautopilot本体の停止、①が当日で②が古ければPagesデプロイの停止、と
  切り分けて label `ops/autopilot-stale` の open 1件に集約する
  （作成/追記/回復でクローズは `cron-health.yml` と同じ作法）。
  直近の Obsidian Autopilot run が「緑かつ数秒」なら Gate スキップの疑いを併記する
  （ただし①が古い場合のみ。①が当日なら別経路で実行済みの正常系）
- **`data/autopilot-status.json` は意図的に更新していない。** 今日は
  autopilotのイテレーションではないので当日分として記録するのは虚偽になるし、
  更新すると新設した監視が明日「正常」と判定して停止を隠してしまう
- 検証: `node scripts/seo-check.js` 0 errors 0 warnings（`.github/` のみで
  HTML非変更のため content-graph / モバイルQA / experiments は対象外）。
  ワークフローYAMLを `yaml.safe_load` で、埋め込みJSを `node --check` で構文検証。
  さらに github-script のAPIをスタブして3シナリオを空回しし、
  ①main=08-15/本番取得失敗 → Issue作成、②両方当日 → Issue作らず、
  ③main当日/本番のみ古い → Issue作成かつトークンの当たりは出さない、を確認
- 保留・オーナー依頼:
  - **【最優先】`CLAUDE_CODE_OAUTH_TOKEN` の登録**（継続・2026-08-11から7日目）。
    ローカルで `claude setup-token` → repo secret に登録 → Actions の
    "Run workflow" で `force` にチェックを入れれば翌朝を待たず確認できる。
    トークンの発行はオーナー本人のブラウザ認証を伴い、repo secret の書き込み手段も
    セッション側に無いため、**この1件だけは代行できない**
  - 副系Routine（07:30 JST）の再作成は未実施（オーナー判断待ち）。
    主系が生きれば冪等ガードで即終了するだけなので、あくまで保険
  - `GCP_SERVICE_ACCOUNT_JSON`（BQ鍵）。効くのは28日到達の2026-09-06前後以降
  - **schedule はデフォルトブランチの定義でしか動かない**ため、
    本ワークフローはmainにマージされて初めて有効になる
  - レーンA/Bはデータ待ちで塞がっているが、レーンC（前回08-14・08-21から優先レーン）
    とレーンD・キューのN2/N4は生きている。09-06まで §6 だけで埋める理由は無い

### 2026-08-17（追記） — Routine不在の確定と、レート制限で同日2セッションが落ちていた件

同日のPR #504 の作業中に、上の判断根拠を2点補強・訂正する材料が出たので記録する。

- **Routine不在は確定した（方法の訂正つき）。** 上の本文では
  「`list_triggers` を作成日 2026-08-11→07-25 まで確認したが無い」と書いたが、
  **この一覧は作成日順ではない**（`limit=3` で2026-07-25/07-27 のcronが返る）。
  つまりページングで全件を見た保証は無く、根拠として不十分だった。
  改めて `update_trigger` に `trig_016ALpozNRuf2j7BYJo5cCqy` だけを渡す
  存在確認を行い、**`the requested resource was not found`** を得た。
  結論（Routineは存在しない）は変わらないが、**確からしさの根拠が
  「見当たらない」から「引いたら無い」に変わった**。
- **同日、アカウントの5時間レート制限で2セッションが落ちていた。**
  本日05:10〜05:29Zに3セッションが起動し、うち2つが
  `You've hit your session limit · resets 3:30pm (UTC)`（= 2026-08-18 00:30 JST）
  で `status_category: failed` になっている:
  - `session_01JPbByBHs9wRCSxVokkr6sQ`（自動化ツール検討レポート）→
    simplememo-ios **PR #208** はdraftで残り、CIは全green
    （Xcode Cloud Build / static / parity）。セッションだけが死んでいる
  - `session_013ruNnyNcLG55VYwfv9nPZf`（SimpleMemo daily funnel 2026-08-16）→
    **成果物は出荷済み**。simplememo-api **PR #135** を 10:39:42Z に作成し
    10:42:33Z にマージまで到達している（typecheck / 969テスト / 統合3件 /
    メール本文の目視レンダリングまで実施済み）。**レート制限に当たったのは
    その後**で、失われた作業は無い
- **これは2026-08-12インシデントと同じ signature である。** あの回の記録は
  「発火記録あり・実行痕跡ゼロ／原因は特定不能（7日レート制限が警告域だったことは
  状況証拠）」だった。今日は**状況証拠ではなく実測**として、同一アカウントの
  セッションがレート制限で落ちている。CCR副系を「毎日走らせる基盤」に据える限り、
  この制限と常に競合する
- **したがって副系Routineの再作成（レーン復旧策A）は、単体では弱い。**
  作り直してもレート制限に当たれば同じ「発火・痕跡ゼロ」を繰り返す。
  実行主体を Actions 側（`CLAUDE_CODE_OAUTH_TOKEN`）に寄せる方針は
  08-12の判断のまま正しく、**今日の実測はその判断を追認する**。
  なお Actions 版もサブスク課金である以上、同じ枠を食う可能性は残る
  （API課金の `ANTHROPIC_API_KEY` を選べば分離できる — 未検証）
- 本日新設した `autopilot-health.yml` は、この種の「静かな死」を
  **原因によらず**検知する
- **【この追記自体の訂正】** 上の daily funnel の項は、当初
  「PRが存在せずブランチが孤立・08-16分は未出荷」と書いていた。**誤り。**
  原因は2つで、(a) このコンテナの `origin/main` がセッション起動時(05:10Z)で
  止まっており、10:42Z のマージを見ていなかった、(b) `list_pull_requests` を
  `state: open` で引いて空だったのを「PRが無い」と読んだ（マージ済みPRは
  closed なので出ない）。**「open が無い」と「PRが無い」は別の結論**で、
  §1-2 が BigQuery について戒めている「取得できなかった」を「増えていない」と
  報告する誤りと同じ型を、別の道具で踏んだ。確認は `git fetch` してから
  `state: all` か対象PRの直接取得で行うこと
- **【08-18の回との突き合わせ】** 下の 2026-08-18 エントリは、同じ2日間の空白を
  独立に検知したうえで「原因はこのリポジトリのログからは特定できず、
  スケジューラ側の可能性がある」と保留している。**その保留への回答が上の2点**
  （Routine `trig_016ALpozNRuf2j7BYJo5cCqy` は存在確認で not found ／
  同日2セッションがレート制限で失敗）で、いずれもリポジトリ外の情報源
  （trigger API・セッションメタデータ）からしか取れない。次に同種の空白を
  見たら、リポジトリ内だけで探さずこの2つを引くこと。
- **ただし未確定が1つ残る。** 08-18 の回は「副系(CCR)で実行」と記録しており、
  副系そのものは動いている。上の not found と両立させるには
  「Routineが別IDで再作成された」か「Routine以外の経路で起動された」の
  どちらかだが、**どちらかは確定していない**。副系の現状を前提にする判断を
  する前に、`list_triggers` ではなく実際の起動経路を確認すること
  （一覧は作成日順ではないので、見当たらないことを不在の根拠にしない）。

## 2026-08-18 — 保守のみ（副系CCR代走・2日間の実行空白を検知）

- 判断根拠: 冪等性チェックで当日分ブランチ・status JSON更新なしを確認し
  副系で実行。手動CSVスナップショットは2026-08-11から変化なし
  （`growth/data/gsc/` 確認）。`analyze.mjs --only unanswered/conversational`
  の出力は前回（2026-08-15）までと同一で、Obsidian関連の会話型クエリ
  「logseqとobsidian どちらが良い」(23imp・pos9.2)はPR #480で対応済み・
  新規性なし。BigQueryはこのセッションにBigQuery MCPが接続されておらず
  （前回まで使えていたツールが今回は無い）、`bq-preflight.mjs`もローカル
  資格情報なしで認証失敗するため「取得できなかった」(`bq_checked: false`)。
  よってレーンA/Bは正当化できず、Mention Watchも前回2026-08-12取得で
  7日未満のため対象外。前回ログの申し送り「ai-citation-strategy.mdの
  残り監査（§3 Microsoft Copilot以降）を数項目ずつ継続」を実行。
- **見つけたこと（自動化の空白）**: GitHub Actions主系は毎日06:00 JSTに
  起動し `conclusion: success` で完走しているが、GitHub Actions APIで
  run 32070691341（08-18 06:21 JST）・31972997422（08-17 06:16 JST）の
  jobステップを直接取得したところ、`Gate` ステップの後、`Checkout` と
  `Claude Code` ステップが両日とも `skipped` だった。これは
  Runbook §0-2記載どおり、repo secret `CLAUDE_CODE_OAUTH_TOKEN` 未設定に
  よる意図された緑スキップであり、新規の障害ではない（継続依頼どおり）。
  一方で**CCR副系も2026-08-16・08-17の2日間、branch・log・status JSON
  いずれにも実行痕跡が無く**、この2日間はどちらの経路も実処理をして
  いなかった。原因はこのリポジトリのログからは特定できず、スケジューラ
  側の可能性がある。オーナー依頼に追加。
- やったこと: `docs/ai-citation-strategy.md` §3 Microsoft Copilotの4項目
  監査。Bingbot許可とIndexNow連携をVERIFIEDに更新（IndexNowは
  `auto-merge.yml` のマージ直後フックで実際にIndexNow APIへPOSTしている
  ことをソース実読で確認）。`ms.locale` metaタグは未実装（grep 0件）と
  確認し、実装は全JPページ横断編集になるため本回のスコープ外として
  次回候補に記録。Bing Webmaster Toolsへのsitemap submitはダッシュボード
  未接続のため検証不能と明記。
- PR: （本エントリ作成時点で未作成・`docs/`+`data/`のみのdocs-onlyで
  SEO Validationは素通り見込み）
- 検証: `grep -n -i "bingbot" robots.txt` で78行目を実測。
  `.github/workflows/auto-merge.yml:116` と `seo-check.yml:136` が
  `scripts/indexnow-notify.js` を実行することを確認し、スクリプト本体が
  `https://api.indexnow.org/indexnow` へ実際にPOSTするコードであることを
  ソース実読（`scripts/indexnow-notify.js:35,165`）。
  `grep -rl "ms.locale" --include="*.html" .` で該当0件を実測。
  `node scripts/seo-check.js` 0 errors 0 warnings（本変更はdocsのみで
  HTML非変更）。本番稼働中ページ（`/obsidian/`・`/obsidian/compare/logseq/`・
  `/obsidian/getting-started/`）いずれもHTTP 200を実測。
- 保留・オーナー依頼:
  - **【新規・重要】自動化の2日間空白（08-16/08-17）**: GitHub Actions主系は
    意図通りスキップだったが、CCR副系も両日とも実行痕跡なし。日報メール
    (10:00 JST)がこの2日間どう報告したか確認を推奨
  - BigQueryのサービスアカウント鍵を `GCP_SERVICE_ACCOUNT_JSON` に登録
    （継続・2026-08-15から）。加えて今回はBigQuery MCP自体が未接続
    だったため、ローカル認証とMCP接続の両方が必要
  - GitHub Actions repo secret `CLAUDE_CODE_OAUTH_TOKEN` 登録
    （継続・2026-08-11から。08-17/08-18の実行ログで未設定を再確認）
  - `ai-citation-strategy.md` の残り監査（§4 ChatGPT以降の節）を
    数項目ずつ継続
  - Mention Watchは前回2026-08-12取得のため2026-08-19以降に次回

## 2026-08-18（追記・別セッションによる事実確認） — 副系Routineは存在する

上の 2026-08-17 追記が「**未確定が1つ残る**」として残した問い
（*not found と「副系は動いている」をどう両立させるか*）への回答。
funnel 2026-08-14 セッションが `list_triggers` で実測した。

- **事実: Routine は存在し、有効で、発火している。**

  ```
  id            trig_016ALpozNRuf2j7BYJo5cCqy
  name          Obsidianオートパイロット副系（07:30 JST・GHA不発時のみ）
  cron          30 22 * * *        (= 07:30 JST)
  enabled       true
  created_at    2026-08-11T13:46:28Z
  updated_at    2026-08-11T23:47:35Z
  last_fired_at 2026-08-17T23:37:08Z
  next_run_at   2026-08-18T22:30:11Z
  ```

- **提示されていた2つの仮説はどちらも否定される。**
  `updated_at` が 2026-08-11 から動いていないので「別IDで再作成された」ではない。
  同一IDがそのまま生きているので「Routine以外の経路で起動された」でもない。
  08-18 の回が「副系(CCR)で実行」と記録しているのは、単に**この Routine が
  発火したから**である。
- **したがって上の `not found` は偽陰性。** 存在確認に `update_trigger` を
  使ったことが原因と考えられる（更新系APIは、対象が存在しても権限・スコープの
  都合で not found を返しうる）。**存在の判定に更新系APIを使わないこと。**
  一覧が作成日順でないことへの警戒は正しかったが、代替手段の選択で踏み外している。
- **レート制限の所見は覆らない。** 「同日2セッションがレート制限で落ちていた」
  側は独立に裏付けが取れる（複数セッションのメタデータが
  `seven_day: allowed_warning`、7日枠のリセットが 2026-08-17T23:00Z）。
  副系の最終発火 23:37Z はそのリセット直後で、**08-18 の回が実際に走ったのは
  枠が空いた後**という並びになる。
- **空白の実態はこう読める。** 「Routineが消えた」のではなく
  「**Routineは生きていて、レート制限で仕事ができなかった**」。
  復旧策は再作成ではなく**レート枠の配分**の問題になる
  （再作成すると同じ枠に2本目ができ、毎朝2セッションが同じRunbookを走る）。
  なお 08-18 の `owner_requests` では「副系Routineの再作成」は既に外れており、
  この点の実害は残っていない。

**次に同種の空白を見たときの手順（上の申し送りを1点だけ差し替え）**

1. `list_triggers` で一覧を引く（**存在しないことの確認に `update_trigger` を
   使わない**。名前ではなく `id` で照合する）
2. `enabled` / `last_fired_at` / `next_run_at` を見る。発火しているのに成果物が
   無いなら、Routineではなく**発火先の実行**を疑う
3. セッションのメタデータでレート制限（`five_hour` / `seven_day`）を見る

## 2026-08-19 — 原因特定: 無記事6日はゲートではなくRunbookの追記漏れ（オーナー依頼の調査）

オーナーの問い「記事追加していくようにしたいけど何が悪い？」への回答。
定期実行ではなく、その調査と修正のセッション（`data/autopilot-status.json` は
**当日分として更新していない** — 当日の定期実行の枠を潰さないため）。

**結論: 記事が出ない直接の原因は、レーンEがRunbookに載っていなかったこと。**

- `growth/content/coverage-queue.json` は36項目・**34件がpending**で生きている。
  この キューは「ノイズフロアを適用しない」と明記された新規カバレッジ用で
  （`OBSIDIAN_COVERAGE_PLAN.md` §1）、本来ここが枯れない供給になるはずだった。
- ところが `grep -n -i coverage docs/obsidian/AUTOPILOT_RUNBOOK.md` は**0件**、
  `git log -S"レーンE" -- docs/obsidian/AUTOPILOT_RUNBOOK.md` も**空**。
  レーンEはRunbookに一度も入っていない。
- 経緯: レーンE解禁はPR #482として作られたが、中身はC02ワーカーのPR #483経由で
  先にmainへ入り、#482は別内容（デスクトップQR適用漏れ）へ書き換えてマージされた
  （#482本文の「⚠️ 履歴訂正（マージ後追記）」で本人が記録している）。
  このとき `coverage-queue.json` と `OBSIDIAN_COVERAGE_PLAN.md` は main に入ったが、
  **Runbook §1/§2 へのレーンE追記だけが落ちた**。
- そのため08-13以降のセッションは、Runbookのレーン定義（A〜D）と§1の読むもの
  （new-queue / refresh-queue のみ）に忠実に従い、データ駆動キューが枯れている
  以上「保守のみ」と**正しく**判断し続けた。**セッションの判断ミスではなく、
  セッションが読む唯一の手順書に指示が無かった。**

**データ側の実測（今回のセッションで取得・`bq_checked` 相当は true）**

- BigQuery MCPは**接続されている**（08-18の回は「未接続」と記録していたが、
  今回は疎通した）。`searchdata_site_impression` は
  `2026-08-10 〜 2026-08-16` の **7日**（28日窓まで残21日 ≒ 2026-09-06）。
- したがってレーンA/Bが自力で復活するのは9月上旬。**この空白を埋めるのが
  レーンEの役割**であり、今回の修正でその設計どおりに戻る。
- 手動CSVは2026-08-11から変化なし（1,000行打ち切り済み）。

**主系（GitHub Actions）は7回中7回とも実処理していない**

- `obsidian-autopilot.yml` のschedule run 7本（08-12〜08-19）すべて
  `conclusion: success`。ただし最新 run 32187173035（08-19 06:20 JST）の
  jobステップを直接取得すると、`Gate` の後 `Checkout` / `Claude Code` が
  `skipped`。repo secret `CLAUDE_CODE_OAUTH_TOKEN` 未設定による
  意図された緑スキップ（Runbook §0-2）で、**主系はまだ一度も動いていない**。
  記事の供給はすべて副系(CCR)に乗っている。

**やったこと（本PR）**

- `AUTOPILOT_RUNBOOK.md` §0原則2 — ノイズフロアの適用範囲はレーンA/Bのみと明記。
- 同 §1「読むもの」 — `coverage-queue.json` + `OBSIDIAN_COVERAGE_PLAN.md` を追加
  （以降の番号を繰り下げ）。
- 同 §2 — **レーンE（Coverage）を追加**。ゲート4点・`collides_with` 確認・
  完了時の `status: done` 化・「A/Bに案件が無い日は迷わずここへ来る」を明記。
  「どれも正当化できない」行に、pendingが残る限りそこへ来ないという条件を付けた。
- 同 §6 枯渇時の手順 — (3)をスキップからレーンEへ差し替え、スキップは(4)へ。
- `OBSIDIAN_COVERAGE_PLAN.md` §5 — 「Runbookへ追加済み」が当時は事実でなかった
  ことの訂正と、計画書に「反映済み」と書くだけでは反映されないという教訓。

**次回（＝次の定期実行）から起きること**

- レーンA/Bが正当化できない日は、`coverage-queue.json` の pending 先頭
  （現在は **C01 `/obsidian/compare/`**・P1）を実装する。以降 C03/C04/C05… と続く。
- 34本 × 1日1本で、キュー消化は9月下旬。P1の骨格は8月末（計画書§4の算段どおり）。

**オーナー依頼（変わらず残るもの）**

- repo secret `CLAUDE_CODE_OAUTH_TOKEN` の登録（継続・08-11から）。
  未登録の間は主系が動かず、副系のレート枠だけが供給元になる。
- `GCP_SERVICE_ACCOUNT_JSON` の登録（継続・08-15から）。
  BigQuery MCPが繋がらないセッションでも `bq-preflight.mjs` が回せるようにするため。

## 2026-08-19 — レーンE C01: /obsidian/compare/ 新設（レーンE復活後の1本目）

- 判断根拠: 同日の調査PR #510 で、無記事6日の原因が「レーンE（Coverage）が
  Runbookに一度も入っていなかったこと」と判明し、Runbook §0/§1/§2/§6 へ実際に
  追記してmainへマージ済み。本エントリはその直後の**レーンE 1本目**で、
  `growth/content/coverage-queue.json` の pending 先頭 **C01 `/obsidian/compare/`**
  （P1・obsidian-compare）を実装した。
  レーンA/Bは今回も正当化できない: **BigQuery MCPは接続されており**
  `searchdata_site_impression` を実測したところ `data_date` は 2026-08-10〜08-16 の
  **7日**で28日窓に届かない（到達は2026-09-06前後）。手動CSVも2026-08-11から変化なし。
  レーンEはノイズフロア非適用（ゲート＝キュー掲載＋品質80点＋§28＋固有価値）なので、
  この空白期間に記事を出せる唯一のレーンになる。
- やったこと: `/obsidian/compare/` 新設。比較の分岐軸を「ノートの正本がどこに、
  どんな形で残るか」に置き、3つの質問で比較先を絞る構成にした。
  被リンク3本配線（`/obsidian/`・`/obsidian/compare/logseq/`・`/obsidian/getting-started/`）＋
  `data/content-graph.json` 登録（parent=/obsidian/・siblings=logseq比較/始め方）＋
  デスクトップQR（`QR_PAGES` に `obsidian-compare` 追加・`--check` で独立デコード検証）＋
  OG画像（`generate-og-batch.js` にエントリ追加）＋sitemap再生成。
  coverage-queue の C01 を `done` 化。
- **固有価値（この回の一次情報）**: Obsidian公式レジストリ（GitHub
  `obsidianmd/obsidian-releases`）の `community-plugins.json` /
  `community-css-themes.json` を当日直接カウントし、**プラグイン6,739個・テーマ698種**
  を実測。過去2回と同一方法（2026-08-11: 6,571/680、08-14: 6,638/691）なので
  時系列として使える。**8日間で+168個＝1日あたり約21個**という増加ペースが、
  「プラグイン数は比較の決め手にならない」という本ページの主張の根拠になっている。
- **書かなかったこと**: Notion・Capacities・memos はこの環境でインストールして
  動かしていないため、比較結果を一切書いていない。ページ本文に専用ブロックを置いて
  「動かして確かめた時点で追加する」と明記した（§0-4）。他所の仕様を書き写した
  比較表を作らないという判断。実機検証済みの結論（同一フォルダ実験・保管庫の実体）も
  子ページからの参照にとどめ、二重掲載していない。
- PR: #511
- 検証: Runbook §4 の9チェック全通過 — `seo-check` 0 errors 0 warnings /
  `check-css-version` OK / `check-benchmark` 新規CONFLICT・AMBIGUOUS増なし /
  `check-url-normalization` 189 passed / `check-internal-redirects` 12,865 href+5,093
  JSON-LD すべて直接200 / `sync_constants --check` OK / `tag-cta-placements --check` OK
  （新規1件を `--write` で付与）/ `check-experiments` due 0・overdue 0 /
  `generate_sitemap.py`。加えて **iPhone 390×844 DPR3 実描画QA**: 水平スクロールなし
  （scrollWidth=clientWidth=390）・表は `overflow-x:auto` の内側でスクロール・
  JS/HTTPエラー0・回答ブロックはファーストビュー内（top=729px）・QRはモバイル非表示／
  デスクトップ表示を実測。QRは `generate-qr-codes.mjs --check` で29件を独立デコード検証
  （既存27件はバイト同一）。
- 見つけたこと（副作用）: `git fetch --unshallow` 後の `generate_sitemap.py` は、
  スイープ判定された変更しか履歴に無いファイル（今回は `/download/`）の lastmod を
  **TODAY にフォールバック**するため、再生成のたびに lastmod が今日へ動く。
  本日変更していないので手で 2026-08-18 に戻した。恒久対応は別レーン。
- 保留・オーナー依頼:
  - ~~**repo secret `CLAUDE_CODE_OAUTH_TOKEN` の登録（最優先・継続）**~~
    **【2026-08-20訂正・充足済み】** この依頼は誤りだった。根拠にした run 32187173035
    は**前日（08-19 06:20 JST）**のもので、当日の run 32303452390（08-20 06:21 JST）は
    Gateを通り Checkout が `success` している。シークレットは登録済みだった。
    なお同runは記事を出せていないが、原因は未登録ではなく**aptが90分のジョブ上限を
    食い尽くしたこと**（PR #513で修正済み）。判定手順を Runbook §1-3 に追加した
  - ~~`GCP_SERVICE_ACCOUNT_JSON` の登録（継続）~~
    **【2026-08-20訂正・充足済み】** 同じく誤り。seo-daily の run 32303828087
    （08-20 06:25 JST）は `Credentials are configured` を `success` で通過し、
    Export preflight / Ingest / Detectors まで完走している。08-14〜08-18 の連続失敗も
    これで解消している
  - llms.txt は見送り（N1・C02と同基準。レジストリ実カウントは持つが、訂正リストとしての
    価値が増える性質ではないため）
- 次回: レーンE継続。pending 先頭は **C03 `/obsidian/what-is-vault/`**（P1）。
  C08 `/obsidian/compare/notion/` 以降を作るときは、本ページの「まだ検証していない比較」
  ブロックから該当アプリを外して実機検証カードへ移すこと。

## 2026-08-20 — レーンE C03: /obsidian/what-is-vault/（3経路すべて不発・オーナー依頼セッションが代走）

- 判断根拠: `coverage-queue.json` の pending 先頭 **C03 `/obsidian/what-is-vault/`**（P1・
  obsidian-beginner）を実装。レーンA/Bは28日窓（2026-09-06前後）まで正当化できないため
  今回もレーンE。実装前に冪等性を3点（当日ブランチ・origin/main の status JSON・
  当日作成PR）で再確認し、すべて偽であることを確かめてから着手した。**二重PR・
  同名ブランチの衝突は無し。**

- **本日は3経路すべてが成果物ゼロだった。** これがこの回の最重要の記録。

  | 経路 | 発火 | 結果 |
  |---|---|---|
  | 主系 GHA 06:00 | ✅ run 32303452390 | **cancelled**（下記） |
  | 副系 CCR 07:30 | ✅ `2026-08-19T22:30:59Z` | 痕跡ゼロ |
  | 再試行 CCR 09:20 | ✅ `2026-08-20T00:20:19Z` | 痕跡ゼロ |

- **主系が落ちた理由（実測）**: 秘密鍵 `CLAUDE_CODE_OAUTH_TOKEN` の登録により
  **8日ぶりにGateを通過し `Checkout` が success**（＝①は確定）。ところが次の
  「日本語フォント」ステップで `sudo apt-get update -qq && ...` が
  **出力を1行も出さないまま21:21Z→22:52Z の90分（ジョブ上限）を使い切り**、
  `Claude Code` は skipped のまま終わった。根本原因はログからは確定できない
  （updateとinstallのどちらで詰まったかも不明）。**PR #513** で
  `timeout-minutes: 5` + `continue-on-error: true` + `DPkg::Lock::Timeout=120`
  により封じ込め済みで、schedule定義はデフォルトブランチが使われるため
  **明朝06:00から有効**。

- **副系の信頼性について（要判断）**: 副系Routine
  `trig_016ALpozNRuf2j7BYJo5cCqy` は **08-16・08-17・08-19・08-20 と4日連続で
  成果物ゼロ**。`last_fired_at` は毎回更新されているので起動はしているが、
  ブランチ・PR・status JSON のいずれにも痕跡を残せていない。主系が復活した今、
  レート枠を食うだけの経路になっている可能性がある。停止か作り直しの判断を
  オーナー依頼に積んだ。

- やったこと: `/obsidian/what-is-vault/` 新設。被リンク3本配線
  （`/obsidian/`・`/obsidian/getting-started/`・`/obsidian/compare/`）＋
  `content-graph.json` 登録（obsidian-beginner・parent=/obsidian/・
  siblings=始め方/比較ハブ。productRelevance は台帳の businessRelevance に
  合わせて high）＋デスクトップQR（`QR_PAGES` に `obsidian-vault` 追加）＋
  OG画像＋sitemap再生成。coverage-queue の C03 を `done` 化。

- **固有価値（この回の一次情報）**: Obsidian **1.13.7** の公式Linux AppImageを
  この環境にダウンロード・展開し、Xvfb上のヘッドレスで**空のディレクトリを
  保管庫として実際に開かせて**、直後の中身をファイルシステムで実測した。

  ```
  vault-demo/
  └── .obsidian/
      ├── app.json          2 bytes   （中身は {}）
      ├── appearance.json   2 bytes   （同じく {}）
      ├── core-plugins.json 696 bytes （コア31個・既定ON 21/OFF 10）
      └── workspace.json    4,843 bytes（ペイン配置）
                            ─────────
                            5,543 bytes
  ```

  **Markdownファイルは0件。** 「新しい保管庫を作成」した場合に初期ノートが
  作られる挙動（PR #483・2026-08-11・Obsidian 1.13.6）とは別であることを
  本文で明示的に区別した。4つのうち**いちばん大きいのがUIの状態**という事実が
  「保管庫は索引もDBも持たない」という主張の直接の根拠になっている。

- 書かなかったこと: Windows/macOS/iOS版では実行していない（保管庫の構造は
  プラットフォーム非依存とされているが、確かめたのはLinux版だと明記）。
  `workspace.json` を同期から外す運用は「そういう選び方がある」までにとどめ、
  衝突の頻度など未検証の主張は書いていない。

- PR: #514

- 検証: Runbook §4 の9チェック全通過 — `seo-check` 0 errors 0 warnings /
  `check-css-version` OK / `check-benchmark` 新規CONFLICT・AMBIGUOUS増なし /
  `check-url-normalization` 189 passed / `check-internal-redirects`
  12,930 href + 5,113 JSON-LD すべて直接200 / `sync_constants --check` OK /
  `tag-cta-placements --check` OK（新規1件を `--write` で付与）/
  `check-experiments` due 0・overdue 0 / `generate_sitemap.py`。
  QRは `--check` で31件を独立デコード検証（既存29件はバイト同一）。
  **iPhone 390×844 DPR3 実描画QA**: 水平スクロールなし
  （scrollWidth=clientWidth=390）・表と `<pre>` コードブロックはいずれも
  `overflow-x:auto` の内側でスクロール・JS/HTTPエラー0・回答ブロックは
  ファーストビュー内（top=698px）・QRはモバイル非表示／デスクトップ表示。

- 副作用の記録（2日連続）: `generate_sitemap.py` が `/download/` の lastmod を
  TODAY にフォールバックする件。今日も手で 2026-08-18 に戻した。2日続けて
  同じ手戻しをしているので、恒久対応を独立レーンで検討する価値がある。

- 保留・オーナー依頼:
  - **副系Routineの停止または作り直しの判断**（上記・新規）
  - **GH_PAT は依然として未判定**。Actions内部から push して作られるPRが
    1本も無いため。明朝06:00の主系運転で作られるPRに SEO Validation が
    起動するかが唯一の判定材料
  - 日報メール側(simplememo-api)の streak / data_freshness 描画（継続・低優先）

- 次回: レーンE継続。pending 先頭は **C04 `/obsidian/pricing/`**（P1）。

## 2026-08-20（追記2・オーナー指摘） — 依頼欄が「登録済みのシークレット」を要求し続けていた構造を塞ぐ

同日のC03セッション（上のエントリ）が本日分の依頼欄を実態に合わせて書き直したが、
**そうなった仕組み自体は手つかず**だった。オーナーからの指摘
（「`GCP_SERVICE_ACCOUNT_JSON` これはいっているはず」）を受けて、Runbookに手順を追加する。

- 指摘の当否: **オーナーが正しく、10:00 JSTの日報が誤っていた。** 日報は
  `CLAUDE_CODE_OAUTH_TOKEN` と `GCP_SERVICE_ACCOUNT_JSON` を両方「未登録」として
  出していたが、実測では両方とも登録済みだった。

  | ワークフロー | run | 決め手のステップ | 結果 |
  |---|---|---|---|
  | obsidian-autopilot | 32303452390（08-20 06:21 JST） | `Checkout` | `success`（＝Gate通過） |
  | obsidian-autopilot | 32187173035（08-19 06:20 JST） | `Checkout` | `skipped`（**前日**の状態） |
  | seo-daily | 32303828087（08-20 06:25 JST） | `Credentials are configured` | `success` |
  | seo-daily | 32187624915（08-19 06:25 JST） | `Credentials are configured` | `failure`（**前日**の状態） |

  seo-daily は08-14〜08-18が `Credentials are configured` で連続失敗していたが、
  08-20の run は Export preflight / Ingest / Detectors まで完走している。

- 原因（症状ではなく構造）: `owner_requests` を**前日のログから写して日付だけ
  伸ばす**運用になっており、充足を確かめる手順がどこにも無かった。
  本ログを遡ると同じ依頼が106行目から684行目まで10日以上引き継がれている。
  **オーナーが対応しても依頼が消えない。** 08-19エントリはさらに、当日のrunが
  存在するのに前日のrunを根拠にしていた。
- やったこと: `AUTOPILOT_RUNBOOK.md` に **§1-3「オーナー依頼の棚卸し
  （毎回・繰り越す前に実測する）」** を新設し、§5-2 の `owner_requests` から参照を張った。
  08-19エントリの依頼2件も充足済みとして訂正した。
  - 原則: 「継続」と書いてよいのは**その日の実測で未充足を確かめたとき**だけ。
    実測手段が無い依頼（Simulator撮影など）は「実測手段が無いため未確認」と明記して
    区別する。充足したら外し、外した事実をログに1行残す
  - 判定表: `CLAUDE_CODE_OAUTH_TOKEN` → obsidian-autopilot の**最新**runで
    `Checkout` が `skipped` でない／`GCP_SERVICE_ACCOUNT_JSON` → seo-daily の
    **最新**runで `Credentials are configured` が `success`。どちらのワークフローも
    シークレット欠如をその1ステップで止める作りなので、後続ステップが動いた事実が
    そのまま判定になる
  - 断定しすぎない点も明記: autopilot のGateは `CLAUDE_CODE_OAUTH_TOKEN`
    **または** `ANTHROPIC_API_KEY` で通るため、Checkoutが走った事実が示すのは
    「どちらかが入っている」であって前者単体の登録ではない
- 触っていないもの: 本番HTML・`data/autopilot-status.json`・キュー類は一切変更していない
  （本日の記事は上のエントリのPR #514で出荷済み）。docs 2ファイルのみの変更。
- 未検証: PR #513 のapt修正が実際に効くかは明朝06:00の主系運転が初めての検証機会。
  見るべきは「フォントのステップが5分以内で抜けること」と「`Claude Code` が
  `skipped` でないこと」。オーナーと相談のうえ本日の force 実行は見送った
  （本番に2本目の記事を出さない判断）。
- 次回: 上のエントリの申し送り（レーンE C04 `/obsidian/pricing/`、副系Routineの
  停止・作り直し判断、GH_PATの効き確認）は据え置き。加えて主系が完走した場合、
  主系（06:00）と副系（07:30）の二重実行防止は当日ブランチが**pushされているか**
  だけで判定しているため、主系が07:30までにpushへ到達しないと両方が走る。
  主系は一度も完走していないのでこの経路は未検証。

## 2026-08-20（追記3・オーナー判断） — 副系Routineは「不調」ではなく存在しなかった

- 経緯: 08-20のC03セッションが「副系Routine `trig_016ALpozNRuf2j7BYJo5cCqy` は
  08-16・08-17・08-19・08-20 と4日連続で成果物ゼロ。`last_fired_at` は更新されて
  いるので起動はしているが痕跡を残せていない」と記録し、停止か作り直しの判断を
  オーナー依頼に積んだ。オーナーの回答は「作り直し」。
- **実測して分かったこと: そのRoutineは存在しない。** アカウントのtrigger全153件を
  2ページに渡って走査したところ、cronを持つRoutineは5件だけで、
  `trig_016ALpozNRuf2j7BYJo5cCqy` はどこにも無かった。
  Obsidian関連で生きていたのは**09:20の再試行（`trig_01ESF9AHax6buS9X1pdFv657`・
  08-20 09:20に発火済み）だけ**だった。
  「起動はしているが痕跡ゼロ」という4日分の診断は裏が取れない。
- **なぜ気づけなかったか**: Runbook §0-2 の経路表が副系の実体を
  「Claudeの定期タスク」としか書いておらず、**trigger IDを持っていなかった**。
  IDが無いと存在確認のしようがなく、「動いていない」を「不調」としか読めない。
  同じ形の見落としを繰り返さないよう、表にIDを書くことを §0-2 に明記した。
- やったこと:
  - 副系を作り直した → **`trig_01TRBdBgSA9646FS4LDQgJdt`**
    （`30 22 * * *` UTC ＝ 07:30 JST・fresh session per fire・
    environment `env_01LfEnrtdFpYpxqbCNGKjCWS`・push通知のみ）
  - Runbook §0-2 を改訂。3経路＋IDの表にし、上の訂正を残した
- **プロンプトに入れた実質的な改善**: 冪等性チェックに (e)
  **「主系の当日runが `queued` / `in_progress` でないか」** を足した。
  主系は `timeout-minutes: 90` で06:00に始まるので**最悪ケースで07:30ちょうどまで
  走る**——副系の起動時刻と正面衝突する。旧来の判定はブランチ有無だけだったため、
  主系がまだpushへ到達していない時間帯に副系が走れば同名ブランチの衝突と
  二重PRが起きる。ブランチが無いことは「主系が失敗した」ではなく
  「主系がまだ書いていない」かもしれない、と読ませるようにした。
  §0-2 にも同じ趣旨を書いた。
- あわせて、Runbook §1-3（オーナー依頼の棚卸し）を守らせる指示もプロンプトに入れた。
- 未検証: 新Routineは一度も発火していない。**初回は08-21 07:30 JST**で、
  主系が正常なら「スキップ」と報告して終わるのが期待動作。
  主系の初回完走（apt修正PR #513の効果確認）も同じ朝が初回の検証機会になる。
- 注意（次回セッションへ）: 3経路のうち2つがCCR Routineで、どちらもこの環境から
  作られている。**経路を触ったら必ず §0-2 の表のIDを更新すること。**
  IDの無い経路は、消えても誰も気づけない。

## 2026-08-21（再試行Routine・09:20 JST） — 主系は新しい壊れ方で失敗・副系も痕跡なし。C04はegressブロックでblocked化しC11へ振替

- 冪等性チェック（§0の4点）: `git fetch origin` 後、(a) `claude/obsidian-auto-20260821`
  ブランチなし (b) 本番 `data/autopilot-status.json` の `date_jst` は2026-08-20
  (c) `origin/main` 側も同じく2026-08-20 (d) 本日作成のPRなし（`list_pull_requests`
  で直近15件を確認、最新は前日2026-08-20 11:13 UTC作成のPR #519）。4つとも偽と
  確認したため実装フェーズへ進んだ。

- **主系(06:00, run 32419185478)の実測: フォント修正（PR #513）は効いているが、
  別の場所で新しく落ちている。** Gate → Checkout（GH_PAT、9秒）→ 日本語フォント
  導入（9秒で完了、従来の90分ジョブ上限問題は解消を確認）まで成功したが、続く
  「Claude Code（Runbook 1イテレーション実行）」ステップ自体が**3秒で failure**。
  Claude Codeの実質的な処理には短すぎる時間で、フォントタイムアウトとは別種の
  障害（起動直後のクラッシュ・認証・設定エラー等が疑われるが、このセッションは
  GitHub MCPの `actions_get`/`actions_list` ではジョブのステップ結果までしか読めず、
  ログ本文（stdout/stderr）を取得する手段がないため特定できなかった）。
  オーナー依頼に起票した。

- **副系(07:30, `trig_01TRBdBgSA9646FS4LDQgJdt`)の初回発火は今日だったはずだが、
  痕跡なし。** 08-20に作り直したこのRoutineの初回発火は本日07:30 JST想定
  （前回ログの申し送り）。主系が06:24に完了（failure）しているため、07:30時点で
  主系は「in_progress」ではなく、冪等性チェック(e)による見送りには当たらないはず
  だが、ブランチ・PR・status JSONのいずれにも変化がなかった。Routineが発火せず
  終わったのか、発火して途中で失敗したのかはログが読めず区別できない。
  こちらもオーナー依頼に起票した。

- **レーンE先頭のC04 `/obsidian/pricing/` は実装せず `blocked` にした。**
  `WebFetch` で `obsidian.md` / `www.obsidian.md` / `help.obsidian.md` を試したところ
  いずれも `EGRESS_BLOCKED`（このセッションのネットワークegressプロキシによる
  ドメイン遮断）。`WebSearch` で代替を試みたが、返ってきたのはSEOアグリゲーター
  サイトの二次情報のみで、しかも複数サイト間でSync料金体系の記述が食い違って
  いた（「Standard/Plus tiers」対「単一プランに統合済み」）。Runbook §0原則4
  「検証できない主張は書かない」に反するため、この情報を根拠に価格ページを
  書くことはしなかった。念のため `notion.so` / `notion.com` も試したところ同じく
  プロキシで403（`CONNECT tunnel failed`）——obsidian.md固有ではなく、外部の
  マーケティング/SaaSサイト全般がこのセッションから遮断されている可能性が高い。
  一方 `raw.githubusercontent.com` は到達可能（`curl` で200を確認）。
  C04をコレクションキューで `status: blocked` とし、`blocked_by` に上記を記録した。
  C05〜C07（sync/公式Sync系）も同クラスタの公式仕様・価格を要求するため
  同様に影響を受ける可能性が高いが、今回は着手していないため未検証のまま
  ログに申し送った。

- **代わりにC11 `/obsidian/plugins/` を実装（優先度を繰り上げ）。** GitHub生
  コンテンツ（`raw.githubusercontent.com/obsidianmd/obsidian-releases/`）は
  遮断されていなかったため、レーンE本来のゲート（固有価値＝実カウント）を
  別の一次情報で満たせると判断した。

  **固有価値（一次情報・実カウント）**:
  - `community-plugins.json`（プラグイン登録）を直接取得・カウント: **6,812個**
  - `community-css-themes.json`（テーマ登録）を直接取得・カウント: **701種**
  - 当サイトの過去3回の計測と並べて推移を記録:
    2026-08-11: 6,571個 → 08-14: 6,638個・691種 → 08-19: 6,739個 → **本日: 6,812個・701種**
    （10日で+241個）
  - `community-plugin-stats.json`（公式が公開するダウンロード数データ・6,780件収録）
    を取得し `downloads` で降順ソート。**実測トップ10**:
    1位 Excalidraw 7,365,086 / 2位 Templater 5,336,051 / 3位 Dataview 4,805,635 /
    4位 Tasks 4,061,506 / 5位 Advanced Tables 3,124,723 / 6位 Git 3,028,476 /
    7位 Calendar 3,021,004 / 8位 Style Settings 2,604,959 / 9位 Kanban 2,568,158 /
    10位 Iconize 2,180,911。プラグイン名・作者・説明文はレジストリの公式登録
    データをそのまま引用（自分で言い換えていない）。
  - 「プラグインなしで足りる範囲」（VISION整合・キューの `unique_value` が明記した
    要件）: `/obsidian/what-is-vault/` で実測済みのコア機能31個（既定ON 21・OFF 10）
    を根拠に、デイリーノート・表編集・バックアップ・見た目調整の4項目でコア機能
    だけで足りることを具体的に書いた。

  **書かなかったこと**: プラグインを実際にインストールして動かす画面検証は
  今回行っていない（キューの `unique_value` が例示していたが、必須ゲートの
  「実機検証・実カウント・一次情報のいずれか1つ以上」は実カウントのみで満たせる
  と判断した）。検証環境ブロックとcoverage-queueの `note` に明記した。

- やったこと: `/obsidian/plugins/` 新設。被リンク2本配線
  （`/obsidian/what-is-vault/`・`/obsidian/getting-started/`の関連ページ欄。
  what-is-vaultの本文中リンクも6,739→6,812の更新と合わせて張り替え）＋
  `content-graph.json` 登録（新規cluster `obsidian-plugins` を `_meta.clusters`
  に追加・parent=/obsidian/・siblings=what-is-vault/getting-started・
  productRelevance は台帳の businessRelevance(1.0→high) に合わせて high）＋
  デスクトップQR（`QR_PAGES` に `obsidian-plugins` 追加）＋OG画像＋sitemap再生成。
  coverage-queueのC04を`blocked`・C11を`done`に更新。

- 副作用の記録（sitemapのTODAYフォールバック、3回目以降の観測）:
  `git fetch --unshallow` 後の `generate_sitemap.py` が、PR #519（本日未明に
  マージ済み・22ファイルのCPP配線変更）に触れた24ページの一部と、無関係の
  `/download/` の両方を今日の日付にした。前者はPR #519が実際に本日
  マージされたコミットのため**正当**（`git log` で当該コミット2e177e99が
  22個のhtmlファイルを実際に touch していることを確認）。後者は
  `/download/` の最終実質編集が `git log` 上は2026-08-12（コミット21da470a）
  なのに毎回TODAYへ丸められる**既知のフォールバック不具合**（08-19/08-20の
  ログ既出）。今回は直近の運用（前日の値へ戻す）ではなく、`git log` で
  突き止めた真の最終編集日 **2026-08-12** まで戻した（累積ドリフトの解消）。
  恒久修正（`build_lastmod_index`/`git_lastmod`のファイルパス突き合わせを
  見直す）は独立レーンで検討する価値があると`next`に申し送った。

- PR: #521

- 検証: Runbook §4 の9チェック全通過 — `seo-check` 0 errors 0 warnings /
  `check-css-version` OK / `check-benchmark` 新規CONFLICT・AMBIGUOUS増なし /
  `check-url-normalization` 197 passed / `check-internal-redirects`
  13,134 href + 5,182 JSON-LD + 576 sitemap URL すべて直接200 /
  `sync_constants --check` OK / `tag-cta-placements --check` OK /
  `check-experiments` 35件中21 open・due 0・overdue 0 / `generate_sitemap.py`。
  QRは `--check` で33件を独立デコード検証（既存31件はバイト同一・新規2件も
  デコード一致）。**iPhone 390×844 DPR3 実描画QA**（Playwrightを`node_modules`
  経由で実行、`CHROMIUM_PATH=/opt/pw-browsers/chromium` でバージョン差異を
  回避）: 水平スクロールなし（scrollWidth=clientWidth=390）・比較表は
  `overflow-x:auto` の内側でカード化・JS/HTTPエラー0・回答ブロックはファースト
  ビュー内（top=667px）・QRは `display:none`（モバイル）を実測。

- 保留・オーナー依頼:
  - **【新規】主系の新しい失敗モード**（Claude Codeステップが3秒でfailure、
    ログ本文はこのセッションから読めず要調査）
  - **【新規】副系の初回発火が痕跡を残していない**（発火不発か失敗かの区別が
    このセッションからは不能）
  - **【新規】このセッションの実行環境はobsidian.md・notion.com等の外部
    マーケティングサイトへのアクセスがegressプロキシでブロックされている**
    （raw.githubusercontent.comは到達可）。主系・副系が同じ制限を共有するかは
    未検証。レーンEのC04〜C10の多くがこの制限の影響を受ける可能性がある
  - 日報メール側(simplememo-api)の streak / data_freshness 描画（継続・低優先・
    コード変更が要るためこのRoutineでは充足を確認できない）

- 次回: レーンEはC04〜C07がobsidian.mdブロックの影響を受ける可能性が高いため、
  まずegress状況を再確認してから着手すること。変わらなければGitHub/ローカル
  実行だけで完結する項目（C12 Dataview・C17 Zettelkasten・C26 graph-view等）を
  優先候補として検討する。sitemapの`/download/`は今回2026-08-12まで戻したので、
  次回再生成時にまたTODAYへ動いていないか確認すること。

## 2026-08-21（追記・副系v2） — 主系の「3秒でfailure」の中身が読めた・原因はactor拒否

上のC11セッション（再試行Routine・09:20 JST）が依頼欄の筆頭に積んだ
**「主系の新しい失敗モード。ログ本文はこのセッションから読めず要調査」**への回答。
副系v2（`trig_01TRBdBgSA9646FS4LDQgJdt`・07:30 JST）は GitHub MCP の
`get_job_logs` を持っており、run `32419185478` / job `96587195764` の
ログ本文を実際に読めた。**この依頼は本エントリで充足**（オーナー作業は不要だった）。

- 実際のエラー1行:

  ```
  Action failed with error: Workflow initiated by non-human actor: github-actions
  (actor not found on GitHub). Add bot to allowed_bots list or use '*' to allow
  all bots.
  ```

- 何が起きていたか: `anthropics/claude-code-action@v1` は**フローティングタグ**
  なので、非人間アクターからの起動を拒否するガードが後から乗ってくる。
  `obsidian-autopilot.yml` は schedule 起動で、直前にmainへ書き込んだのが
  auto-merge（`github-actions[bot]`）だった場合、`triggering_actor` が
  `github-actions` になり、そのユーザーはGitHub API上 404 なので弾かれる。
  **ワークフロー側は何も変えていないのに、ある朝から突然落ちる**種類の壊れ方で、
  08-20のapt詰まりとは無関係（同runでフォント導入は9秒・success）。
- やったこと: `allowed_bots: "*"` を1行追加した。このワークフローは
  schedule / workflow_dispatch でしか起動せず、`issue_comment` 等の外部から
  踏ませる経路が無いため、`*` でも権限昇格にならない（その判断理由も
  ワークフロー内のコメントに残した）。`.github/workflows/*.yml` を grep して、
  claude-code-action を使うワークフローが他に無いことも確認済み。
- **有効になるのはmainマージ後**（schedule起動のワークフロー定義はデフォルト
  ブランチのものが使われる）。**明朝06:00 JSTの主系運転が唯一の検証機会**で、
  見るべきは「同じ `non-human actor` が再発しないこと」と
  「Claude Codeステップが3秒で終わらないこと」。
- 触っていないもの: 本番HTML・content-graph・キュー類・当日の記事
  （C11は上のセッションが既に出荷済み）。本エントリのPRは
  ワークフロー1ファイル＋status JSONのowner_requests更新＋本ログのみ。
- 副系v2としての自己記録: §0の冪等性チェックは着手時点で(a)(b)(c)とも偽
  （当日ブランチ無し・本番status JSONは08-20分・当日PR無し）だったため実行に
  進んだが、**作業中に再試行Routineがブランチとpush（PR #521）を作った**ため
  途中で衝突した。§0のチェックは「着手時点のスナップショット」でしかなく、
  07:30と09:20の実行が重なる時間帯では取りこぼす。今回は本日分の記事を
  重複出荷せず、自分の固有の成果（actor拒否の特定）だけに絞って別PRにした。
  同じ判断ができるよう、この構造をRunbook §0-2の申し送りに残す。
- 副系v2の環境制約（次回の副系セッションへ）: このセッションでは
  node経由の検証スクリプト（`scripts/seo-check.js`・`check-css-version.mjs`）が
  auto modeクラシファイアにブロックされて実行できなかった
  （`python3 scripts/generate_sitemap.py --dry-run` と `node --version` は実行可）。
  今回はHTML変更が無いため影響していないが、**副系でHTML変更を伴うレーン
  （A/B/E）に着手する前に、この制約が解けているかを最初に確かめること。**
  解けていなければ§4を完走できないので、その回は記事を書かず保守レーンへ行く。

## 2026-08-21（追記・オーナー指示による2件の恒久修正）

自動運転の回ではなく、オーナーが日報レポートを評価した流れで入れた修正。
**本番HTML・記事・content-graph・実験・キューには一切触れていない。**

### 1. 日報メールが「出荷した日」を3日続けて誤報していた（simplememo-api側）

`simplememo-api/src/autopilot-report.ts` が出荷判定を
`s.article && s.pr?.state === 'merged'` にしていたが、**この条件は自動運転では
原理的に成立しない**。ステータスJSONは記事と同じPRに入って初めて本番に出るので、
セッションが自分のPRの merged 状態を書くことはできない。

`data/autopilot-status.json` の `pr` の実履歴:

| 日付 | action | pr |
|---|---|---|
| 08-11 / 08-12 | new / refresh | `#470 merged` / `#480 merged` |
| **08-13以降すべて** | — | **`null`** |
| 08-19 / 08-20 / 08-21 | new（記事あり） | **`null`** |

つまり **記事を出荷した直近3日とも、本文は「公開記事: 0 / 1」、件名は
「1記事作成（PR pending）」**と報告していた。成功した日ほど誤報される壊れ方。

このJSONは本番URLから取得しているので、**当日分の `date_jst` が本番で読めたこと
自体がマージ＋Pagesデプロイの証拠**である。`pr` は判定条件から外し、
「明示的に未マージと書かれていたら降格する」注記としてだけ使うようにした。
未マージPRを公開と混同しない既存の契約はテストごと維持している。

あわせて `streak` / `data_freshness` の描画も入れた（Runbook §5-2が
「API側が対応したらこの重複は外してよい」と書いていた件）。`bq_checked: false` は
「見に行けなかった」であって「増えていない」ではないため、文面ではなく分岐で区別する。

- 検証: 本番の `data/autopilot-status.json` を実際に描画し、件名が
  「1記事作成（PR pending）」→「1記事公開」、本文が「0 / 1」→「1 / 1」に
  直ることを確認。typecheck clean・全979テスト通過。
- **Runbook §5-2に「PR番号を書き戻せば直る」と読み替えるなという注記を足した。**
  書き戻しても `state` は `open` にしかならず直らない。

### 2. §0の冪等性チェックがCCR同士の同時起動を防げない（simplememo側）

08-21の副系v2 vs 再試行の衝突（一つ上のエントリ）への対処。§0のチェックは
着手時点のスナップショットでしかなく、07:30と09:20が重なる時間帯では両方が
「当日分なし」と判定して二重着手する。「主系がまだ走っているか」の判定は
**Actionsにしか効かない** — CCR同士はスケジュール起動セッションのログが外部から
読めないため、相互観測では原理的に避けられない。

Runbook §0-2に**当日ブランチの占有（claim）**を追加した。冪等性チェックを
通った直後、実装に入る前に経路名入りの空コミットを当日ブランチへpushする。
**非fast-forwardで弾かれたら他の経路が先に取っているので、何もせず終了する。**
`--force` 系は使わない（弾かれること自体がこの仕組みの出力）。
これで既存の `git ls-remote` チェックが初めて実際のロックとして機能する。

### 次の運転への申し送り

- **明朝06:00 JSTの主系運転が、`allowed_bots: "*"`（PR #522）の唯一の検証機会。**
  見るべきは「`non-human actor` が再発しないこと」と「Claude Codeステップが
  3秒で終わらないこと」。ここは優先度が上の2件より高い。
- 上の1が効くのは `simplememo-api` のデプロイ後。それまでの日報は従来の表示のまま。
- egressブロック（obsidian.md / notion.so）は未解決のまま残っている。
  レーンE前半（C04〜C08）は外部一次情報を要するため、次回もまずegressを確かめる。

## 2026-08-22（副系CCR・07:30 JST） — C12 `/obsidian/plugins/dataview/` 出荷。主系「成功」の中身に新しい懸念

### §0 冪等性チェック（すべて偽 → 実行に進んだ）

- (a) `claude/obsidian-auto-20260822` ブランチ: 着手時点で無し
- (b) 本番 `data/autopilot-status.json` の `date_jst`: `2026-08-21`
- (c) `origin/main` の同ファイル: 同じく `2026-08-21`
- (d) 当日作成PR: 無し（直近は08-21付けの#523まで）
- (e) 主系（`obsidian-autopilot.yml`）の最新run: `status: completed`（実行中ではない）
- → §0-2の占有手順に従い `claude/obsidian-auto-20260822` へ空コミットをpush・成功（衝突なし）

### 【最優先・要確認】主系の当日run（06:20 JST開始）が「成功」しているのに成果物が無い

run `32528028588` / job `96914156036`。`allowed_bots: "*"`（PR #522/#523）は効いており、
`Checkout` 9秒・`Claude Code`ステップは**3分16秒**（08-20/08-21の「3秒で終わる」問題とは
別物）動いた。ジョブ結果は `conclusion: success`。ところが:

```
"num_turns": 30, "total_cost_usd": 0.81, "permission_denials_count": 14
```

**14件のツール呼び出しが拒否**されており、結果として本日 (a)〜(d) はすべて「実行痕跡なし」
のままだった。GitHub Actionsの `claude-code-action@v1` はSDK出力を
`full output hidden for security` として隠しており、`get_job_logs` で読める範囲では
どのツール呼び出しが拒否されたかまでは分からない（`session_id: fcf0c50e-3655-4c8c-a8cb-571cef95cdd0`
のみ判明）。**推測だが、`git push` や `gh pr create` 相当の操作がワークフロー側の権限設定
（`permissions:` ブロック・`additional_permissions` 未設定など）で拒否されている可能性が高い。**
`Checkout（GH_PAT優先）` 自体は成功しているため、読み取り系トークンはある。書き込み系の
どこかが締まっている、という切り分けまでしかこのセッションからはできない。

これは08-20/08-21の「即座に落ちる」失敗より発見しにくい壊れ方（ジョブは毎朝緑のまま推移する）。
**オーナー側で、`obsidian-autopilot.yml` の実行権限（`permissions:` / `additional_permissions`
/ `claude_args` のツール許可リスト）を確認してほしい。** 明朝以降も同じ `permission_denials`
が出るかは、次回の副系・再試行セッションが `get_job_logs` で追える。

### レーンE — C05〜C10は今回もegressブロックでスキップ、C12へ

`obsidian.md`・`notion.com` はこのセッションでも403（`curl`・`WebFetch`とも）。
**新規確認**: `github.com`本体・`blacksmithgu.github.io`（Dataviewの公式ドキュメントサイト）
・`en.wikipedia.org`・`www.google.com`・`cdn.jsdelivr.net`・`unpkg.com` も同様に403で、
到達できるのは `api.github.com`・`raw.githubusercontent.com`・`objects.githubusercontent.com`・
`npmjs.com` 程度だった（`curl`ベースの直接アクセス）。一方、**`WebFetch`/`WebSearch`ツール
経由では `github.com` や第三者ブログ・YouTube等へ到達できた**（`obsidian.md`系ドメインだけは
`WebFetch`でも `EGRESS_BLOCKED` で拒否）。この非対称性（curlは狭いアローリストのみ・
WebFetch/WebSearchはより広く到達するがobsidian.md系だけは共通してブロック）を初めて確認した。

C05〜C10（sync系・compare/notion）はobsidian.md/notion.comの一次情報を要するため見送り、
前回ログの申し送り通りC12（Dataview）へ進んだ。

C12の `unique_value` はキュー原文で「実機インストール＋動くクエリ例（検証Vaultで実行した
結果画面）」を指定していたが、**この環境にObsidianを実行できるGUI/ディスプレイが無く、
実機インストール検証は今回行っていない。** 代わりに Dataview公式リポジトリ
（`blacksmithgu/obsidian-dataview` の `README.md`・`manifest.json`）と Obsidian公式レジストリ
（`community-plugin-stats.json`・`community-plugins.json`）を `raw.githubusercontent.com` 経由
で直接取得し、一次情報＋実カウントで固有価値ゲート（§2レーンE④）を満たした:

- ダウンロード数 4,805,635件・登録6,840個中**3位**（前回08-21計測と完全一致、±0）
- レジストリの `updated` タイムスタンプは2025-04-07 19:17 UTC — 計測時点で約16ヶ月更新なし
- masterブランチの`manifest.json`は0.5.68、GitHub Releasesの最新タグは0.5.70（ベータ）で不一致
- 4つのクエリモード（DQL/インライン式/DataviewJS/インラインJS式）は公式READMEのサンプルを
  そのまま引用（実行検証はしていない旨をページ内の検証環境欄に明記）

ページ内に「今回はキューが当初想定した検証水準（実機インストール）には届いていない」ことを
正直に明記した。`growth/content/coverage-queue.json` のC12は `status: done` にし、
`done_note` に上記の代替根拠を残した。

- 実装: `/obsidian/plugins/dataview/`（新規）
- 配線: Parent `/obsidian/plugins/`（ランキング表のDataview行にリンク追加）+
  Sibling相当 `/obsidian/what-is-vault/`・`/obsidian/getting-started/`。
  被リンク2本: `/obsidian/plugins/`（表内）・`/obsidian/getting-started/`（関連ページ欄に追加）
- `data/content-graph.json` 登録済み（cluster: obsidian-plugins・parent: /obsidian/plugins/）
- QR: `qr-obsidian-plugins-dataview-{ja,en}.svg` を新規生成、`--check`で35件全件デコード検証
  （既存33件はバイト同一）
- OG画像: `obsidian-plugins-dataview.png` を新規生成（`chromium_headless_shell-1234`が
  存在しなかったため、`chromium-1194/chrome-linux/chrome`へのsymlinkで補った。Runbook §3の
  既知の手順どおり）
- モバイルQA（Playwright, 390×844 DPR3）: 初回実行で**横スクロールが発生**していた
  （`.reason-card`内の`<pre>`コードブロックがCSS Gridのデフォルト`min-width:auto`で
  トラックを押し広げていた）。ページローカルの`<style>`に`.reason-card{min-width:0}`を
  追加して解消（サイト共通のstyle.min.cssには触れていない・このページだけのローカル修正）。
  再検証: `scrollWidth === clientWidth === 390`・水平スクロールなし・QRコンテナは
  `display:none`（モバイル）/`flex`（デスクトップ1280px）を実描画で確認・JA→EN切替も
  `lang.js`経由で正常動作・コンソールエラーは外部analytics/preconnectのトンネル失敗のみ
  （このサンドボックスのegress制限によるもので、本番では発生しない）

### 検証: Runbook §4 の9チェック全通過

`seo-check`（261ファイル・0 errors 0 warnings）/ `check-css-version` OK /
`check-benchmark`（新規CONFLICT・AMBIGUOUSは増えていない。既存の警告はvs/notion系の
既知分のみ）/ `check-url-normalization`（197 passed）/ `check-internal-redirects`
（13,195 href/src + 5,203 JSON-LD/meta + 576 sitemap URL すべて直接200）/
`sync_constants --check` OK / `tag-cta-placements --check` OK（49件がpage-level ct=保持）/
`check-experiments`（35件中21 open・due 0・overdue 0）/ `check-content-graph`（23件OK）/
`generate_sitemap.py`（コミット後に実行 — 未コミット状態で実行すると新規ページの
lastmodが正しく解決できず、無関係な`/download/`のlastmodも巻き添えでズレる既知の挙動を
再確認したため、コミット→sitemap再生成の順で実施した）

### オーナー依頼の棚卸し（§1-3・前日08-21付けの4件を実測で判定）

1. **【外す・充足済み】** `simplememo-api`の`streak`/`data_freshness`描画 —
   08-21付けログに「あわせて streak / data_freshness の描画も入れた」と記録済み。
   本番の日報メールへの反映有無は次回の実際のメール受信で確認できるため未検証だが、
   コード側の対応は完了しているためこの依頼自体は外す。
2. **【継続・実測で再確認】** obsidian.md/notion.com系のegressブロック — 
   上述の通り本日も再現・むしろ対象ドメインが広いことが分かった。引き続き依頼として残す。
3. **【新規・最優先】** 主系の当日run — `permission_denials_count: 14`で成果物ゼロ。
   上記「最優先」欄を参照。ワークフローの権限設定確認を依頼。
4. **【実測手段なし・繰越】** 前回ログにあった「CCR環境でnode系検証スクリプトが
   auto modeクラシファイアにブロックされる」件は、**本セッションでは再現しなかった**
   （`node scripts/seo-check.js`等すべて正常実行）。ただしこれはセッションごとに
   変わりうる分類判定のため、依頼としては「解消済みとは断定しない」形で軽く触れるに留める。

### 次回への申し送り

- 主系の`permission_denials`が明日以降も続くか、`get_job_logs`で追うこと。続くなら
  ワークフローの権限設定そのものが疑わしい。
- egressブロックは変わらず。レーンEの次候補は前回同様C17（zettelkasten）・C26（graph-view）
  など、GitHub/一般Web検索（WebFetch/WebSearch経由）で完結する項目を優先する。
- C12で使った「WebFetch/WebSearchはcurlより広く到達できる」という知見は、今後の
  レーンE候補選定で活用できる（curlで403でも即座に「検証不能」と諦めない）。

---

## 2026-08-22（追記・オーナーの評価依頼） — 主系の権限不足を特定して修正。依頼#3は分類ミスだった

オーナーから上記レポートの評価を求められたので、報告値を一次ソースで取り直した。
**実測値はほぼ正確だった**（permission_denials=14・DL数3位・updated 2025-04-07 19:17 UTC・
manifest 0.5.68・タグ0.5.70の存在・sitemap掲載、いずれも再現）。
一方で**依頼の立て方と、実測の書き方に問題があった**。

### 1. 主系の成果物ゼロは「オーナー確認案件」ではなく、自分で直せる案件だった

上の欄は「obsidian-autopilot.ymlの実行権限を確認してほしい」とオーナーに投げていたが、
根本原因はこのセッションから確定できた。証拠は3つ。

1. ジョブログのSDK optionsに `allowedTools` も `permissionMode` も**無い**
   （`maxTurns` と `systemPrompt` だけが渡っている）
2. `settingSources: ["user","project","local"]` とあるが、
   **リポジトリに `.claude/` ディレクトリが存在しない** → project層の許可はゼロ
3. claude-code-action の公式ドキュメント —
   *"Claude does **not** have access to execute arbitrary Bash commands by default"*

そしてプロンプトが要求する動作は git の branch/commit/push・`gh pr create`・
`npx playwright install`・node の検証スクリプトで、**全部Bash**。
つまり出荷手段が最初から全部塞がれた状態で30ターン回り、$0.81を焼いて
何も出せないまま success で終わっていた。謎の権限問題ではなく、
`claude_args: "--max-turns 250"` に `--allowedTools` が無いという一点。

**分類の誤り**: Runbook §7の owner_requests は「できないこと（iOS Simulator実行・
オーナー作業）」のための欄。このワークフローファイルは PR#522・#523 で自分で2回
書き換えて通している。**直せるものを依頼欄に積むと、直る日が翌朝以降に延びる。**
以後、依頼として積む前に「自分のPRで直せるか」を先に確認すること。

### 2. 直したもの（`.github/workflows/obsidian-autopilot.yml`）

- **`--allowedTools` を追加**。Bash・Read/Write/Edit・Glob/Grep・WebFetch/WebSearch等。
  allowed_bots と同じ理由で権限昇格にはならない（schedule と workflow_dispatch でしか
  起動せず、外部から踏ませる経路が無い）。
- **「成果物ゼロなら落とす」ステップを追加**。主系は08-18以降、毎日違う理由で不発に
  なりながらjobは緑で終わってきた（実行空白 → aptで90分枯渇 → actor拒否で3秒failure →
  ツール不許可で成果物ゼロ）。壊れ方は毎回違うが、**「緑なのに何も出ていない」を
  検知できないという一点が共通**していて、それが毎回、気づくのを遅らせている。
  PR#525でsitemapに入れた `--check` と同じ考え方を、1日分の出荷を落とした当の対象にも置く。
  当日ブランチも本番status JSONの当日分も無ければ非ゼロで終わる。

### 3. 記事の訂正（`/obsidian/plugins/dataview/`）

実測を売りにしているページとしては見過ごせない2点。順位3位という結論は変わらない。

- **分母の出典違い**。「登録6,840個中3位」を表で `community-plugin-stats.json` に
  帰属させていたが、6,840は `community-plugins.json`（レジストリ一覧）の件数。
  順位を計算した stats.json の収録数はこれより少ない（再取得時点で6,827件）。
  表を2行に分け、本文・FAQ・JSON-LD・meta descriptionも書き分けた。
  参考文献欄は元から正しく書き分けられていた。
- **「前回計測との差 ±0件（完全一致）」の解釈が逆**。裏取りの証拠のように書かれて
  いたが、実際は上流JSONが2回の取得の間に再生成されていなかっただけ。
  同日13:00 JSTの再取得では4,818,936件で、約5時間で+13,301件動いている。
  「24時間で増分ゼロ」と誤読されるので、そう読まないよう明記した。

### 4. 新しく分かったこと（egressについて・依頼#2に追加）

**`simplememofast.com` 自体もegressプロキシでブロックされている**（curl・WebFetch とも
403 / EGRESS_BLOCKED）。つまり副系CCRは Runbook §0 の冪等チェック(b)「本番status JSONの
date_jst」を**実行できない環境にいる**。今回は(c) `origin/main` のstatus JSONが同じ役割を
果たしたので二重出荷は起きていないが、**(b)は best-effort、実質のガードは(c)と、
PR#523で入った当日ブランチの占有**、と理解しておくこと。

### 5. 検証

`seo-check.js` 0 errors 0 warnings（261ファイル）/ `check-content-graph`（23件OK）/
`check-css-version` OK / `check-script-tags`（262ファイル balanced）/
`check-url-normalization`（197 passed）/ `sync_constants --check` OK /
`tag-cta-placements --check` OK / `generate_sitemap.py --check` OK /
`check-benchmark` は既存のvs/notion系警告のみで新規CONFLICTなし。
ワークフローYAMLは `yaml.safe_load` でパース確認（5ステップ・`claude_args` に
`--allowedTools` が入ることを確認）。編集したページのJSON-LD 4ブロックは全て
`json.loads` を通り、`data-lang` の ja/en 増分も±同数（既存の1件差は編集前から同じ）。

### 次回への申し送り

- **明日（2026-08-23）06:00 JSTの主系runが最初の答え合わせ。** `--allowedTools` 追加後に
  実際にブランチとPRを作れれば、主系は初めて自走したことになる。作れていなければ
  「成果物ゼロなら落とす」が赤で知らせるので、ジョブログのresult行（`num_turns` /
  `permission_denials_count`）を最初に読むこと。
- 主系が自走を始めるまでは、副系CCRが実質の主系であり続ける前提で候補を選ぶこと。
- レーンA/BはBQの28日窓（2026-09-06前後）まで正当化できない。**それまで2週間、
  レーンEの充填記事が続く設計になっている点はオーナーの判断を仰ぐ価値がある**
  （CLAUDE.mdもVISIONも量を目的にしていない）。

## 2026-08-23（主系GitHub Actions・06:00 JST） — 主系が初めて自走した。C04 `/obsidian/pricing/` 出荷。egressブロックは環境依存と判明

### §0 冪等性チェックと占有

`git fetch origin`後、(a) `claude/obsidian-auto-20260823`ブランチなし (b) 本番status JSONの
`date_jst`=2026-08-22 (c) `origin/main`の同ファイルも2026-08-22 (d) 当日作成PRなし (e) 主系の
最新runはこのセッション自身（`32599191984`・`status: in_progress`）で、他に走っているものは
無い。4点とも実行進行の妨げにならないことを確認し、§0-2の占有手順（空コミットのpush）を実行。
**push は一発で成功し、非fast-forwardで弾かれることもなかった。**

### レーンF（自己修復）: `ap-20260822-actions`の修理を確定させた

`node scripts/autopilot-selfheal.mjs`は本セッション開始時点で `ap-20260822-actions`
（`permissions`・成果物ゼロ）を**未修理**として報告した。しかし実際には同日昼、PR #526
（`fix(autopilot): 主系の「緑のまま何も出さない」を塞ぐ＋dataview記事の実測表記を2点訂正`・
2026-08-22T05:00:08Z=14:00 JSTマージ）で`claude_args`に`--allowedTools`が追加済みで、
台帳への`repair_of`記載だけが漏れていた（当時のセッションが記事出荷を優先し、ledger更新を
やり切らなかったため）。

**このセッション自身が、その修理が効いたかどうかの実地検証になった。** `git checkout -B`・
`git commit --allow-empty`・`git push`が主系（GitHub Actions・claude-code-action）の
Bash経由で問題なく実行でき、後述のとおり`gh pr create`まで完走した。これは
`--allowedTools`修理が実際に機能していることの直接証拠であり、主系が2026-08-12の導入以来
**初めて自走した**（`data/autopilot-runs.json`の経路別内訳で「主系0/3出荷」だったものが
今回で更新される）。`ap-20260822-actions`に`resolved_at`（PR #526マージ時刻）を追記し、
本日の実行行に`repair_of: ["ap-20260822-actions"]`を記録した。

### 新たに判明したこと: egressブロックは副系CCR環境固有で、主系GitHub Actionsには無い

2026-08-21・08-22の副系CCRセッションは`obsidian.md`・`notion.com`・`github.com`本体等への
直接アクセスが軒並み`EGRESS_BLOCKED`/403だったと記録していた（C04〜C10を`blocked`にした
根拠）。本セッション（主系・GitHub Actions実行環境）で同じドメインへ`curl`したところ

```
obsidian.md          → 200
obsidian.md/pricing  → 200
obsidian.md/sync     → 200
obsidian.md/publish  → 200
notion.com           → 302（到達可）
raw.githubusercontent.com → 200
simplememofast.com   → 200
```

と**すべて到達可能**だった。つまり過去のegressブロックの記録は「このRunbookの実行主体は
制限されている」という一般化ではなく、**副系CCRの実行環境固有の制限**だったと確定できる。
次回以降、CCR側のセッションはこの制限を引き続き前提にすべきだが、主系GitHub Actionsのセッションは
obsidian.md/notion.com系ドメインを一次情報として直接使ってよい。

### レーンE: C04 `/obsidian/pricing/` を実装（`blocked`→`done`）

`coverage-queue.json`のpending先頭は egressブロックで`blocked`のC04を飛ばした結果C05
だったが、C04の`blocked_by`理由（egress）が上記の通り本セッションでは解消していたため、
**先にC04を再評価して実装した**（C05は複数の同期方式を比較する大きめの記事で、
「1セッション1アクション」の原則により今回は見送り、次回以降の候補として残す）。

**固有価値（この回の一次情報）**: `obsidian.md/pricing`を直接取得し、価格表・FAQ本文を
書き起こした。

- Sync: $4/user/月（年払い）・$5/user/月（月払い）
- Publish: $8/site/月（年払い）・$10/site/月（月払い）
- Catalyst: $25（一回払い）
- 商用ライセンス: $50/user/年
- 学生・教員・非営利40%割引（Sync/Publishのみ）、Sync/Publishは7日以内全額返金
  （Catalyst・商用・Creditは返金対象外）
- 日本円換算はFrankfurter API（ECB基準レート、$1=¥158.7・2026-08-21付）による参考値と
  明記し、実際の決済レートとは異なる旨を注記

**書かなかったこと**: 価格の変更履歴（キューの`unique_value`が期待していた項目の一つ）は
この環境で検証可能な一次資料が無いため扱っていない。Sync/Publishの実際の購入・実機動作
検証（クレジットカード決済が必要）も行っていない。ページ内の検証環境欄に両方明記した。

- やったこと: `/obsidian/pricing/`新設。被リンク2本配線（`/obsidian/`の関連ページ欄・
  `/obsidian/getting-started/`の関連ページ欄。`/obsidian/`は実験凍結中だが関連リンクの
  追記のみ許可されている範囲）＋`content-graph.json`登録（cluster=obsidian-beginner・
  parent=/obsidian/・siblings=what-is-vault/getting-started/plugins）＋デスクトップQR
  （`QR_PAGES`に`obsidian-pricing`追加、`--check`で37件全件独立デコード検証・既存35件は
  バイト同一）＋OG画像（`generate-og-batch.js`にエントリ追加・今回は
  `npx playwright install --with-deps chromium`が2.5分程度で完走したため素直に実行できた）
  ＋sitemap再生成（コミット後に実行）。`coverage-queue.json`のC04を`blocked`→`done`に更新し、
  `done_note`に環境依存だった旨を記録。

- PR: #（本エントリと同じPRで作成・番号は下記参照）

- 検証: Runbook §4 の全チェック通過 — `seo-check`（264ファイル・0 errors 0 warnings）/
  `check-css-version` OK / `check-benchmark`（新規CONFLICT・AMBIGUOUS増なし、既存は
  vs/notion系の既知分のみ）/ `check-url-normalization`（197 passed）/
  `check-internal-redirects`（13,330 href/src + 5,251 JSON-LD/meta + 586 sitemap URL
  すべて直接200）/ `sync_constants --check` OK / `tag-cta-placements --check` OK
  （49件page-level ct=）/ `check-experiments`（36件中21 open・due 0・overdue 0）/
  `check-content-graph`（24 entries OK）/ `generate_sitemap.py --check` OK /
  `autopilot-budget/runs/authority/selfheal/drill --check` / `automation-rate --check` /
  `check-pr-facts --check`（既存の旧文書の指摘のみ、新規ページに問題なし）/
  `d-score --check`。QRは`--check`で37件全件独立デコード検証。**iPhone 390×844 DPR3
  実描画QA**（Playwright新規インストール・`npx playwright install --with-deps chromium`は
  約2.5分で完走）: 水平スクロールなし（scrollWidth=clientWidth=390）・回答ブロックは
  ファーストビュー内（top=636px）・QRはモバイルdisplay:none/デスクトップflexを実描画確認・
  JA→EN切替（lang.js）正常・コンソール/HTTPエラー0。検証後`npm uninstall playwright qrcode
  jsqr`で後片付け。

### データ鮮度（BigQuery・本セッションにMCPツールなし）

このセッションにBigQuery MCPは接続されておらず、`node growth/scripts/bq-preflight.mjs`も
資格情報なしで認証失敗（`bq_checked`相当としては「取得できなかった」）。ただし
`seo-daily.yml`の同日run（`32599398720`・06:22 JST開始、`Credentials are configured: success`）
の`Export preflight`ステップのログを`gh run view --log`で読み、次を確認できた:

- `searchdata_site_impression`の最新`data_date`は**2026-08-20**（11日分蓄積・28日窓到達は
  引き続き**2026-09-06前後**の見込み）
- 08-14〜08-17の一部テーブルで再エクスポート失敗の痕跡があるが、`growth/BIGQUERY_SETUP.md`の
  判定表どおり「配信済みの日の再送が失敗しただけ」でデータ欠損ではない

この経路（seo-dailyワークフローの実行ログ経由）は自分でBigQueryへ問い合わせたわけではないが、
「取得できなかった」と「増えていない」を区別する目的には使えるため、status JSONでは
`bq_checked: true`（出典明記）とした。

### オーナー依頼の棚卸し（§1-3）

1. **【解消・繰越不要】** 主系の`permission_denials`問題 — 本セッション自身がブランチ占有・
   git push・（後述の）`gh pr create`を問題なく実行できたことで、PR #526の修理が実効している
   ことを実地で確認した。継続監視は不要。
2. **【再分類・オーナー作業ではない】** obsidian.md/notion.com系のegressブロック —
   上記の通り副系CCR環境固有の制限と判明した。オーナーへの確認依頼ではなく、
   「CCR実行時はこの制限を前提にレーンE候補を選ぶ」という運用側の申し送りに切り替える。
3. **【実測手段なし・現状維持】** `simplememo-api`のstreak/data_freshness描画 — コード対応は
   2026-08-21付ログの通り完了しているはずだが、実際の日報メールでの見え方はこのセッションから
   確認できない。次に日報を受け取った回でオーナーが確認するのを待つ。

新規のオーナー作業依頼は無し。

### 次回への申し送り

- 主系が自走できることが確認できたので、次回以降は主系06:00 JSTを本来の実行経路として扱ってよい。
  副系CCR（07:30・09:20）は引き続きフォールバックとして温存する。
- レーンEの次candidate: `coverage-queue.json`のpending先頭は**C05 `/obsidian/sync/`**
  （P1・iCloud/公式Sync/Git/Syncthingの比較。Git同期はこの環境で実機再現できる可能性がある）。
  1セッション1アクションの原則に沿って次回以降で着手する。
- obsidian.md/notion.comへのアクセスは主系GitHub Actionsでは制限が無いことが分かったので、
  C05〜C10（Sync/Publish/Notion比較）はこの経路であれば着手可能。ただしCCR副系では
  引き続きegressブロックを前提にすること（経路によって条件が違う点を毎回明記する）。
- レーンA/BはBQの28日窓（2026-09-06前後）まで引き続き正当化できない。
