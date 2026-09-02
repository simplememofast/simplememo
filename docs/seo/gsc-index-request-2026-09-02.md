# GSC インデックス登録リクエスト 実行依頼書 — 2026-09-02

**目的:** 本日マージ・本番反映済みの PR #781（GSC「クロール済み - インデックス未登録」65件対策）で
本文を厚くした4ページの再クロール・再評価を前倒しする。4件はいずれも 08/22〜08/29 の再評価で
未登録に落ちた正規URLで、今回の検証失敗（08/27開始→08/29不合格）を直接起こしたのは
1件目の `/glossary/e2e-encryption/`。サイトマップ（lastmod 2026-09-02）・内部リンク・FAQPage
JSON-LD は本番で反映確認済み ＝ **リクエストだけが残りの打ち手**。

**実行者:** Cowork（hajimeataka@gmail.com で GSC ドメインプロパティ `simplememofast.com` に
ログイン済みのブラウザ環境）
**所要:** 約5分・1日で完了（必須4件 + 任意3件 = 計7件、クォータ ~10件/日 の範囲内）
**前提知識不要。** 手順どおりでOK。

---

## 手順

### Step 0（1分）: サイトマップ再送信

1. https://search.google.com/search-console?resource_id=sc-domain:simplememofast.com を開く
2. 左メニュー「サイトマップ」
3. `https://simplememofast.com/sitemap.xml` の行 → 「再送信」
   - 本日 7ページが `lastmod=2026-09-02` に更新済み。URL個別申請の下地です。

### Step 1（3分）: Tier 1 = 必須4件

GSC上部の検索窓（URL検査）に1件ずつ貼り付け → Enter → 検査完了を待つ（15〜30秒）→
**「インデックス登録をリクエスト」** をクリック → 「リクエストを送信しました」のダイアログを閉じる。

```
https://simplememofast.com/glossary/e2e-encryption/
https://simplememofast.com/glossary/timeboxing/
https://simplememofast.com/use-cases/meeting-notes/
https://simplememofast.com/vs/roam-research/
```

- 検査結果は「URLがGoogleに登録されていません」＋「クロール済み - インデックス未登録」と出るはずです。
  **それが正常**（この4件はその状態を直すための申請）。そのまま「インデックス登録をリクエスト」を押してください。
- 「URLはGoogleに登録されています」と出た場合も、それは**旧バージョン**の話です。そのまま押してください。
- **各URLの「前回のクロール」日付を控えてください**（報告用。1件目は 2026/08/29 のはず）。
- 途中で「**クォータを超過しています**」が出たら、その日はそこで終了（正常。翌日に続きから）。

### Step 2（2分・任意）: Tier 2 = 枠が余れば3件（新しい被リンクの発信元）

本日、この3ページの本文に上記4ページへのリンクを足しました。先に再クロールされると、
リンク先の発見が速くなります。

```
https://simplememofast.com/blog/memo-app-security-comparison
https://simplememofast.com/blog/meeting-memo-template
https://simplememofast.com/methods/second-brain/
```

- 3件とも「URLはGoogleに登録されています」と出ます（掲載中のページ）。そのまま「インデックス登録をリクエスト」でOK。

---

## やらないこと（重要）

- **「ページのインデックス登録」レポートの「検証を再開」ボタンは押さない。**
  正規URL11件のうち1件でも未登録のままなら数日でまた不合格になります（08/27→08/29 と同じ）。
  押すのは、上記4件が掲載に戻ったことを BigQuery で確認したあと（2〜4週間後）。
- 同じURLを複数回リクエストしない（速くならない。1回で十分）。
- 「公開URLをテスト」（ライブテスト）は不要。リクエストだけでOK。
- 「リンクの否認」ツールには触れない（2026-07-07 オーナー決定）。
- 検査結果に「ページにリダイレクトがあります」「代替ページ（適切な canonical タグあり）」など
  別バケットのURLが見えても、何もしない（仕様上の表示でエラーではない）。

## 注意事項

- 「インデックス登録をリクエスト」は**再クロールの保証ではなく優先度ヒント**です。
- Bing 系は auto-merge 時の IndexNow で通知済み（seo-check.yml の main push ステップ）。この依頼書は **Google専用**です。

## 受入基準

- [ ] Tier 1 の4件がリクエスト済み（当日）
- [ ] 9/16 頃、URL検査で4件の「前回のクロール」が 9月の日付になっている
- [ ] 9/23〜9/30 に BigQuery（`searchdata_url_impression`）で4件に表示が戻っている
      （戻っていない件は `docs/seo/gsc-crawled-not-indexed-2026-09-02.md` §オーナー判断事項の統合案へ）

## 報告書（1〜2行でOK）

実施日、各URLの「前回のクロール」日付、クォータ超過で翌日回しになった件数を、
本ファイルの末尾に追記するか、チャットで返してください。9月中旬の再判定に織り込みます。

---
実施背景の詳細: `docs/seo/gsc-crawled-not-indexed-2026-09-02.md`（実施PR: #781）
