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
