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
