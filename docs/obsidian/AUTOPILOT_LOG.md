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
  - **repo secret `CLAUDE_CODE_OAUTH_TOKEN` の登録（最優先・継続）**。run 32187173035
    （08-19 06:20 JST）も Checkout / Claude Code が `skipped`。未登録の間は主系が動かず、
    供給が副系CCR1本になる。実際に08-16・08-17・**08-19（本日07:30 JSTに発火したが
    成果物なし）** が空白日になっている
  - `GCP_SERVICE_ACCOUNT_JSON` の登録（継続）。本日はBigQuery MCPで実測できたため
    優先度は上より低いが、28日窓に届く2026-09-06前後までには必要
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
