# GSC 再クロール申請 実行依頼書 — 2026-07-07

**目的:** 本日マージ・本番反映済みの監査修正3本（PR #384 Critical+High / #385 Medium+Low / #386 OG整合性）のGoogle側再クロールを前倒しする。特に **en/send-email-to-yourself のCRITICAL修正**（構造化データが競合8アプリ全部を自社名で表示していた問題 = スパム的マークアップ級）は、修正版が再クロールされるまでリスク表面が残るため最優先。

**実行者:** GSCダッシュボードにアクセスできる方（hajimeataka@gmail.com のドメインプロパティ `simplememofast.com`）
**所要:** 約5分/日 × 2〜3日（URL検査のリクエスト枠が実質 ~10件/日 のため分割）
**前提知識不要。** 手順どおりでOK。

---

## 手順

### Day 0（今日・1分）: サイトマップ再送信

1. GSC → 左メニュー「サイトマップ」
2. `https://simplememofast.com/sitemap.xml` の行 → 再送信
   - 75ページ分の `lastmod=2026-07-07` シグナルが一括で伝わります。URL個別申請の下地です。

### Day 1（今日・5分）: Tier 1 = リスク・収益直結の10件

GSC上部の検索窓（URL検査）に1件ずつ貼り付け → 検査完了を待つ → **「インデックス登録をリクエスト」** をクリック。1件あたり15〜30秒。

```
https://simplememofast.com/en/send-email-to-yourself/
https://simplememofast.com/blog/meeting-memo-template
https://simplememofast.com/blog/memo-app-encryption-comparison
https://simplememofast.com/blog/memo-app-privacy
https://simplememofast.com/en/apple-watch-obsidian/
https://simplememofast.com/voices/
https://simplememofast.com/
https://simplememofast.com/en/
https://simplememofast.com/en/captio-alternative/
https://simplememofast.com/en/iphone-shortcuts-email-guide/
```

- 1件目（send-email-to-yourself）だけは飛ばさず必ず当日実施してください。CRITICAL修正の反映がこの依頼書の主目的です。
- 途中で「**クォータを超過しています**」が出たら、その日はそこで終了（正常。翌日に続きから）。

### Day 2（5分）: Tier 2 = FAQ回答同期・タイトル同期の10件

```
https://simplememofast.com/en/blog/best-note-to-self-apps-2026
https://simplememofast.com/en/blog/ios26-speechanalyzer-live-mic
https://simplememofast.com/hands-free/
https://simplememofast.com/faq
https://simplememofast.com/en/faq
https://simplememofast.com/blog/line-keep-alternative
https://simplememofast.com/en/obsidian/
https://simplememofast.com/vs/google-keep/
https://simplememofast.com/en/vs/google-keep-vs-apple-notes
https://simplememofast.com/vs/captioo/
```

### Day 3（任意・5分）: Tier 3 = 仕上げ8件

```
https://simplememofast.com/blog/memo-app-hikaku-matome
https://simplememofast.com/en/apple-watch/
https://simplememofast.com/apple-watch-obsidian/
https://simplememofast.com/blog/iphone-memo-app-fast
https://simplememofast.com/blog/open-source-memo-apps
https://simplememofast.com/captio-alternative/
https://simplememofast.com/use-cases/
https://simplememofast.com/glossary/digital-detox/
```

- 残りの変更ページ（meta description刈込36件など）は**申請不要**。Day 0のサイトマップ再送信＋通常クロールで十分（低緊急度・大量のため枠を消費しない判断です）。

---

## 注意事項

- 「インデックス登録をリクエスト」は**再クロールの保証ではなく優先度ヒント**です。同じURLを複数回リクエストしても速くなりません（1回で十分）。
- 検査結果画面に「URLはGoogleに登録されています」と出ても、それは**旧バージョン**の話。そのまま「インデックス登録をリクエスト」を押してください。
- ライブテスト（「公開URLをテスト」）は不要です。リクエストだけでOK。
- Bing系は本日IndexNowで75 URL送信済み（HTTP 200受理）のため、この依頼書はGoogle専用です。

## 受入基準（1週間後にスポット確認）

- [ ] Day 0〜2 の20件がリクエスト済み（Day 3は任意）
- [ ] 7/14頃、URL検査で以下3件の「前回のクロール」日付が **2026-07-07以降** になっている:
      `en/send-email-to-yourself/`・`blog/meeting-memo-template`・`en/apple-watch-obsidian/`
- [ ] ページ → インデックス作成レポートで「クロール済み - インデックス未登録」への新規流入が増えていない

## 報告書（任意・1行でOK）

実施日と、クォータ超過で翌日回しになった件数だけ本ファイルの末尾かPRコメントに追記いただければ、次回監査（予測93–94）の測定に織り込みます。

---
実施背景の詳細: `docs/seo/FULL-AUDIT-REPORT-2026-07-07.md` / `ACTION-PLAN-2026-07-07.md`（修正PR: #384, #385, #386）
