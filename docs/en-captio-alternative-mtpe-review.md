# /en/captio-alternative/ MTPE ドラフト レビューレポート

**生成日**: 2026-05-01
**ドラフトファイル**: `en-captio-alternative-draft.md`
**スペック準拠**: 引き継ぎドキュメント §3.3（spec §7.5 系）

---

## 1. 自動検証結果サマリー

すべての必須スペック項目をクリア。

| 検証項目 | 結果 | 目標 |
|---|---|---|
| Body 語数 | **2,499** | 1,800–2,500 |
| Captio alternative + Captio replacement | **7** | 5–8 |
| Captio shut down + Captio gone | **4** | 3–5 |
| ex-Captio users + Captio refugees | **4** | 2–4 |
| email yourself + note to email | **4** | 3–5 |
| iOS productivity | **2** | 2–3 |
| spiritual successor + true successor | **2** | 2–3 |
| Ben Lenarts | **3** | 2–3 |
| Emburse Captio | **2** | 1–2 |

NG 表現チェック：

| NG パターン | カウント | 状態 |
|---|---|---|
| "Better than Captio" | 0 | OK |
| "Captio 2.0" / "New Captio" | 0 | OK |
| "公式後継" / "本物の Captio" | 0 | OK |
| "official successor"（肯定形） | **0** | OK — 出現する 2 箇所はいずれも明確な否定形 ("We are not the official successor" / "We make no claim to be the official successor") |

---

## 2. 構成（spec §7.5.1 準拠）

スペックが指定する 12 セクションをすべて含む：

1. Hero — 1 段落のエレベーターピッチ
2. What was Captio? — Ben Lenarts、14 年運営、2.3M emails/year、2024-10-01 終了
3. Why did Captio shut down? — Gmail API 依存、単独開発者の負荷、終了の公式声明
4. What ex-Captio users miss most — one-tap 起動、send-and-clear、honest minimalism
5. How SimpleMemo preserves the Captio philosophy — 起動速度、送信遅延、ソーシャル不在、cloud account 不要、no telemetry
6. Feature comparison — SimpleMemo / Captio (RIP) / Note to Self Mail / Email Me App / Pigeon / Drafts の 6 列比較表 + 補足段落
7. Migration guide for ex-Captio users — 5 ステップ
8. Why a paid subscription? (transparency) — 料金、トライアル、Free 階層、サブスク選択の理由
9. What's different about SimpleMemo's stack — Cloudflare Workers、Resend、AES-GCM
10. Try SimpleMemo free for 7 days — CTA
11. FAQ — 12 問
12. Disclaimer — Yurika Inc.、Ben Lenarts、Emburse Captio に関する非提携明示

---

## 3. ネイティブ レビュー（MTPE）で必ず確認してほしい点

このドラフトは AI による下書きです。**公開前にネイティブ英語話者によるレビュー（MTPE）が必須**です（spec §0.2: 後編集なしの機械翻訳は Scaled content abuse スパム判定リスクあり）。

### 3.1 トーン / 語感
- 全体的にカンファレンシャル（"we", "you" を多用）。SimpleMemo のブランド ボイスとして適切か確認。
- "honest minimalism", "send-and-clear loop" などの造語が読者に通じるか確認。
- 軽妙さ（"five taps where there used to be one" のような言い回し）の頻度・濃度がブランドに合うか。

### 3.2 事実関係のチェック（公開前に Ben Lenarts への敬意を保つため）
以下は本文中の主張。事実確認を推奨：

| 主張 | 出典 / 確認方法 |
|---|---|
| Captio は 2010 年リリース | App Store 公開記録 |
| Captio 開発者 Ben Lenarts はオランダ人 indie dev | 公開プロフィール |
| 14 年運営 | 2010–2024 の差し引き |
| ピーク 2.3M emails/year | 公式声明 or Ben の Twitter / Mastodon |
| 2024-10-01 シャットダウン | 公式 farewell post |
| Gmail API 依存が原因 | Ben の公式説明 |
| Emburse Captio = Captio Tech SL の経費精算 SaaS | [emburse.com](https://www.emburse.com/) で確認 |

特に "2.3 million emails per year" は具体的数値なので、**ソースが確認できなければ "millions of emails per year" のような曖昧表現に置換すべき**。

### 3.3 Feature comparison 表のクロスチェック
他社プロダクトの仕様（Note to Self Mail / Email Me App / Pigeon / Drafts）について、表中の値が現状と一致するか確認：

- Note to Self Mail の "median send latency ~600 ms" は推測値。実測 or 公式ベンチがなければ削除推奨
- Email Me App の "~800 ms" も同上
- Pigeon の "~400 ms" も同上
- ad の有無 ("Free w/ ads") は現状の最新版で確認

→ **不確実な数値は "approximate" 表記にするか、純粋に Yes/No 列のみに簡素化することを推奨**。誤情報による苦情リスク回避。

### 3.4 内部リンクのプレースホルダー
spec §7.5.3 が要求する以下の内部リンクは、現ドラフトには未挿入：

- [ ] `/en/note-to-email/` （詳細ガイド）
- [ ] `/en/about/` （**注：未作成**。先に作成 or リンク省略）
- [ ] App Store ダウンロードリンク（複数 CTA）→ Hero と Trial セクションに 2 件配置済 ✓

HTML 統合時に追加すること。

### 3.5 外部リンク
spec §7.5.3 が許容する外部リンク（dofollow OK、信頼性向上）も未挿入：
- [ ] `https://captio.co/` （Captio 公式残骸、引用ソース）
- [ ] Ben Lenarts の Twitter / Mastodon（敬意セクション）
- [ ] Note to Self Mail 公式（比較表）

挿入位置の候補：
- "in his public farewell" 付近に Ben の farewell post or プロフィールへのリンク
- 比較表セクション末尾に Note to Self Mail リンク

### 3.6 表現の細かいレビュー
ネイティブが特に違和感を感じる可能性が高い箇所：

1. **"five taps where there used to be one"** — 慣用的表現として自然か
2. **"the lights stay on"** — ビジネス慣用句として米国読者に通じるか
3. **"one-person operation that is a brutal recurring tax"** — "tax" の比喩的用法が適切か
4. **"second brain"** — Tiago Forte の方法論を連想させるが OK
5. **"indie developer"** — 業界外読者にも通じる表現か（必要なら "independent developer" に）
6. **"Captio refugees"** — やや感情的すぎる可能性。残すか検討

---

## 4. 既存 FAQ JSON-LD との整合

i18n Phase 2 PR #171 で `/en/captio-alternative/` の既存 FAQ（9 問）から `FAQPage` JSON-LD を生成済み。
**現ドラフトでは FAQ を 12 問に増やしたため、HTML 統合後に再注入が必要**：

```bash
python3 scripts/inject_faq_schema.py
```

このスクリプトは idempotent。HTML の `<details>` / `<dt>` / `<dd>` / 見出し構造を読み取って JSON-LD を再生成する。

---

## 5. HTML 統合時のチェックリスト

ドラフトを `/en/captio-alternative/index.html` に統合する際の手順：

1. 既存 `<head>` の hreflang / canonical / OGP / Schema 構造はそのまま温存
2. `<main>` 内の本文を新ドラフトで置換
3. 価格・フィーチャー比較表は `<table>` でマークアップ
4. FAQ は `<details>` / `<summary>` パターンで実装（既存ページと整合）
5. CTA ボタンは既存サイトのスタイルクラスを再利用（`.btn-primary`, `.cta-large` 等）
6. 内部リンク（§3.4）と外部リンク（§3.5）を挿入
7. デプロイ前に：
   - `python3 scripts/normalize_i18n_head.py` 実行（hreflang 自動再計算）
   - `python3 scripts/inject_faq_schema.py` 実行（JSON-LD 再生成）
   - `python3 scripts/inject_ga4_page_language.py` 実行（GA4 page_language 確認）
   - CSS バージョン bump（`?v=YYYYMMDD` の date を新しい日付に）

---

## 6. 公開後の検証（spec §7.5 検証セクション）

公開から 24 時間以内：
- [ ] hreflang 双方向性チェック: https://technicalseo.com/tools/hreflang/
- [ ] Rich Results Test: https://search.google.com/test/rich-results — Article / BreadcrumbList / WebPage / FAQPage の 4 種検出
- [ ] Open Graph / Twitter Card プレビュー（Facebook Debugger / Twitter Card Validator）

公開から 7 日以内：
- [ ] Search Console で「Scaled content abuse」警告ゼロ確認
- [ ] サイトマップにこの URL が含まれていることを確認

公開から 30 日以内：
- [ ] オーガニック検索「Captio alternative」「Captio replacement」「ex-Captio users」での順位ベースライン記録
- [ ] CTR、平均順位、クリック数を `/docs/i18n-30day-baseline.md` に追記

---

## 7. 翻訳・レビュー外注の指示書（コピペ用）

外注ライターやレビュアーに渡す場合の指示テンプレート：

> ### Brief: Native English review of `/en/captio-alternative/`
>
> **Goal**: Polish a pre-MTPE draft for a SaaS product page targeting ex-users of an iOS app called "Captio" (which shut down in October 2024). The page sits on simplememofast.com.
>
> **Tone**: Conversational, honest, slightly self-deprecating. Not corporate. Not hype-y. Think Stripe's docs voice mixed with a small indie hardware company's product page.
>
> **Constraints**:
> - Must keep the keyword targets listed in the review report (do not strip mentions of "Captio alternative", "Ben Lenarts", "Emburse Captio", etc.)
> - Must not introduce any of the NG expressions listed in the review report
> - Must not increase total word count above 2,500
> - Must not weaken the disclaimer (legal-sensitive section)
>
> **What we want from you**:
> - Fluency and idiom corrections
> - Sentence rhythm / flow
> - Flag any factual claim you cannot verify
> - Flag any phrase that could read as disparaging Ben Lenarts or Emburse Captio
> - Flag any phrase that could read as claiming SimpleMemo is the "official successor"
>
> **What we do not need from you**:
> - SEO keyword tuning (already done)
> - Length adjustment beyond minor edits
> - Structural reorganization
>
> Estimated time: 2–3 hours. Estimated cost: $150–$200 at $0.06/word equivalent.

---

## 8. 完了条件（引き継ぎドキュメント §3.3 より）

- [x] `/en/captio-alternative/` の本文（hero 〜 FAQ 末尾）が 1,800 語以上 — **2,499 ✓**
- [x] 必須キーワード頻度を満たす — **全 8 系統 OK ✓**
- [x] NG 表現ゼロ — **OK ✓**
- [ ] ネイティブ レビュー済 — **§9 の判定基準による**
- [ ] FAQPage JSON-LD が現在の Q/A と一致 — **HTML 統合後に `inject_faq_schema.py` 再実行**

---

## 9. 「MTPE 完了」判定基準（4 階層）

> "MTPE 完了" は曖昧な状態。reviewer が「終わった」と言うだけでは
> Google の Scaled Content Abuse 判定リスクを排除できない。
> 以下 4 階層すべてを通過したときに公開可とする。

### 9.1 Layer 1 — Reviewer の sign-off（必須）

reviewer が以下を提出：

```
Name:           [ネイティブ英語話者の氏名 or ハンドル]
Native English: [Yes / No、Yes でなければこのレビューは不可]
Date reviewed:  [YYYY-MM-DD]
Time spent:     [hours]
Sign-off:       I have read the entire draft as a native English
                speaker and edited it for fluency, idiom, and
                rhythm. The result reads as if originally written
                in English.
```

### 9.2 Layer 2 — 提出物（必須、3 ファイル）

| ファイル | 内容 |
|---|---|
| `docs/en-captio-alternative-final.md` | 修正後の本文（公開予定の最終版） |
| `docs/en-captio-alternative-mtpe-changelog.md` | 「どこを、なぜ変えたか」の変更ログ。最低 1 件の修正があること（reviewer がまったく修正点を出さなかったらレビューしてない疑惑） |
| `docs/en-captio-alternative-mtpe-signoff.md` | 上記 9.1 の sign-off ステートメント |

提出時の自動チェック：

```bash
# 1. 全 3 ファイルが存在
for F in docs/en-captio-alternative-final.md \
         docs/en-captio-alternative-mtpe-changelog.md \
         docs/en-captio-alternative-mtpe-signoff.md; do
  test -f "$F" || echo "MISSING: $F"
done

# 2. final.md と draft.md に diff がある（reviewer が実際に編集した証拠）
diff docs/en-captio-alternative-draft.md docs/en-captio-alternative-final.md > /tmp/mtpe.diff
test -s /tmp/mtpe.diff && echo "✓ edits exist" || echo "✗ ZERO edits — reviewer didn't actually edit"

# 3. signoff にネイティブ宣言が含まれる
grep -E "(native|Native).*English" docs/en-captio-alternative-mtpe-signoff.md \
  || echo "✗ no native-English claim"

# 4. final.md の語数が 1,800-2,500 範囲を維持
wc -w docs/en-captio-alternative-final.md
# (markdown noise も含むので ±200 程度の余裕で見る)
```

### 9.3 Layer 3 — チェックリストへの個別回答（必須）

§3.2〜§3.6 の各項目について、reviewer が **OK / 修正済 / 削除推奨 / 不明** のいずれかを明示的に回答：

#### §3.2 事実確認 7 項目

```
[ ] Captio は 2010 年リリース       → OK / 修正 → ____ / 削除推奨 / 不明
[ ] Ben Lenarts はオランダ人 indie  → OK / 修正 → ____ / 削除推奨 / 不明
[ ] 14 年運営                       → OK / 修正 → ____ / 削除推奨 / 不明
[ ] ピーク 2.3M emails/year         → OK / 修正 → ____ / 削除推奨 / 不明
[ ] 2024-10-01 シャットダウン       → OK / 修正 → ____ / 削除推奨 / 不明
[ ] Gmail API 依存が原因            → OK / 修正 → ____ / 削除推奨 / 不明
[ ] Emburse Captio = Captio Tech SL → OK / 修正 → ____ / 削除推奨 / 不明
```

「不明」の項目は本文から削除 or 曖昧化（"approximately"、"reportedly"）。

#### §3.3 比較表の他社数値 4 項目

```
[ ] Note to Self Mail latency ~600 ms → OK（実測ソース付） / 削除推奨
[ ] Email Me App ~800 ms              → OK（実測ソース付） / 削除推奨
[ ] Pigeon ~400 ms                    → OK（実測ソース付） / 削除推奨
[ ] Email Me "Free w/ ads"            → OK / 修正 → ____
```

実測ソースを提示できないものは数値削除（Yes/No 列のみ残す）。

#### §3.6 違和感ありそうな表現 6 個

```
[ ] "five taps where there used to be one"     → OK / 修正 → ____
[ ] "the lights stay on"                       → OK / 修正 → ____
[ ] "brutal recurring tax"                     → OK / 修正 → ____
[ ] "second brain"                             → OK / 修正 → ____
[ ] "indie developer"                          → OK / 修正 → ____
[ ] "Captio refugees"                          → OK / 修正 → ____
```

#### §3.4 / §3.5 リンク挿入

```
[ ] /en/note-to-email/ を本文 N 箇所に挿入  → 挿入済 / スキップ理由 → ____
[ ] App Store CTA リンク 2 箇所             → 挿入済 ✓（ドラフトに既に有）
[ ] Captio 公式残骸 / Ben Lenarts 公開ポスト → 挿入済 / スキップ
[ ] Note to Self Mail 公式                  → 挿入済 / スキップ
```

### 9.4 Layer 4 — 公開後の Google ground truth（最終判定）

公開直後 7 日以内に Search Console を観察：

| 指標 | 合格 | 不合格 |
|---|---|---|
| 「Scaled content abuse」警告 | ゼロ | 1 件以上 → **即 noindex 化、再編集** |
| 手動による対策 | ゼロ | 何かあれば → 同上 |
| クリックされたページ レポート | このページが正常表示 | スパム判定で除外 → 同上 |

不合格時の手順：

```html
<!-- /en/captio-alternative/index.html の <head> に追加 -->
<meta name="robots" content="noindex,nofollow">
```

そして §9.1〜§9.3 を再実行（別 reviewer 推奨）。

---

## 10. MTPE 公開可否 ワンクリック判定スクリプト

cowork や operator が手動で確認するのは漏れが起きるので、Layer 1〜3 を 1 コマンドで verify するスクリプト案：

```bash
# scripts/verify_mtpe_complete.sh （提案、Phase 4-c 統合時に追加）
#!/usr/bin/env bash
set -e
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

echo "=== Layer 2: 必須 3 ファイル ==="
for F in docs/en-captio-alternative-final.md \
         docs/en-captio-alternative-mtpe-changelog.md \
         docs/en-captio-alternative-mtpe-signoff.md; do
  [ -f "$F" ] || { echo "✗ MISSING: $F"; exit 1; }
  echo "✓ $F"
done

echo ""
echo "=== Layer 2: edits exist (final != draft) ==="
if diff -q docs/en-captio-alternative-draft.md \
          docs/en-captio-alternative-final.md > /dev/null; then
  echo "✗ FATAL: final.md is byte-identical to draft.md"
  exit 1
fi
echo "✓ edits present"

echo ""
echo "=== Layer 1+2: signoff has native-English claim ==="
grep -qiE "native.*english" docs/en-captio-alternative-mtpe-signoff.md \
  || { echo "✗ no native-English statement"; exit 1; }
echo "✓ native-English signoff present"

echo ""
echo "=== Layer 3: changelog has at least 5 entries ==="
COUNT=$(grep -cE "^- |^\* |^[0-9]+\." docs/en-captio-alternative-mtpe-changelog.md)
[ "$COUNT" -ge 5 ] || { echo "✗ changelog has only $COUNT entries (expected ≥5)"; exit 1; }
echo "✓ changelog has $COUNT entries"

echo ""
echo "=== Word count check ==="
WORDS=$(wc -w < docs/en-captio-alternative-final.md)
echo "Body words (incl. markdown): $WORDS"
[ "$WORDS" -ge 1700 ] && [ "$WORDS" -le 2700 ] \
  || { echo "✗ word count out of range"; exit 1; }
echo "✓ word count OK"

echo ""
echo "=== ALL LAYER 1-3 CHECKS PASSED ==="
echo "Layer 4 (Google Search Console) is verified post-publish."
```

完了条件チェックボックス（このセクションを満たしたら true）：

- [ ] §9.1 reviewer sign-off が `docs/en-captio-alternative-mtpe-signoff.md` に存在
- [ ] §9.2 必須 3 ファイルが存在し、`final.md` と `draft.md` に diff あり
- [ ] §9.3 §3.2〜§3.6 のチェックリスト全項目に reviewer 回答記入済
- [ ] §9.4 公開 7 日後 Search Console 警告ゼロ確認

このうち 1〜3 は HTML 統合 / デプロイ前にゲート、4 は公開後ゲート。

---

## 9. 「MTPE 完了」判定基準（4 階層）

> "MTPE 完了" は曖昧な状態。reviewer が「終わった」と言うだけでは
> Google の Scaled Content Abuse 判定リスクを排除できない。
> 以下 4 階層すべてを通過したときに公開可とする。

### 9.1 Layer 1 — Reviewer の sign-off（必須）

reviewer が以下を提出：

```
Name:           [ネイティブ英語話者の氏名 or ハンドル]
Native English: [Yes / No、Yes でなければこのレビューは不可]
Date reviewed:  [YYYY-MM-DD]
Time spent:     [hours]
Sign-off:       I have read the entire draft as a native English
                speaker and edited it for fluency, idiom, and
                rhythm. The result reads as if originally written
                in English.
```

### 9.2 Layer 2 — 提出物（必須、3 ファイル）

| ファイル | 内容 |
|---|---|
| `docs/en-captio-alternative-final.md` | 修正後の本文（公開予定の最終版） |
| `docs/en-captio-alternative-mtpe-changelog.md` | 「どこを、なぜ変えたか」の変更ログ。最低 1 件の修正があること |
| `docs/en-captio-alternative-mtpe-signoff.md` | 上記 9.1 の sign-off ステートメント |

提出時の自動チェック：

```bash
# 1. 全 3 ファイルが存在
for F in docs/en-captio-alternative-final.md \
         docs/en-captio-alternative-mtpe-changelog.md \
         docs/en-captio-alternative-mtpe-signoff.md; do
  test -f "$F" || echo "MISSING: $F"
done

# 2. final.md と draft.md に diff がある（reviewer が実際に編集した証拠）
diff docs/en-captio-alternative-draft.md docs/en-captio-alternative-final.md > /tmp/mtpe.diff
test -s /tmp/mtpe.diff && echo "✓ edits exist" || echo "✗ ZERO edits — reviewer didn't actually edit"

# 3. signoff にネイティブ宣言が含まれる
grep -E "(native|Native).*English" docs/en-captio-alternative-mtpe-signoff.md \
  || echo "✗ no native-English claim"

# 4. final.md の語数が 1,800-2,500 範囲を維持
wc -w docs/en-captio-alternative-final.md
```

### 9.3 Layer 3 — チェックリストへの個別回答（必須）

§3.2〜§3.6 の各項目について、reviewer が **OK / 修正済 / 削除推奨 / 不明** のいずれかを明示的に回答：

#### §3.2 事実確認 7 項目

```
[ ] Captio は 2010 年リリース       → OK / 修正 → ____ / 削除推奨 / 不明
[ ] Ben Lenarts はオランダ人 indie  → OK / 修正 → ____ / 削除推奨 / 不明
[ ] 14 年運営                       → OK / 修正 → ____ / 削除推奨 / 不明
[ ] ピーク 2.3M emails/year         → OK / 修正 → ____ / 削除推奨 / 不明
[ ] 2024-10-01 シャットダウン       → OK / 修正 → ____ / 削除推奨 / 不明
[ ] Gmail API 依存が原因            → OK / 修正 → ____ / 削除推奨 / 不明
[ ] Emburse Captio = Captio Tech SL → OK / 修正 → ____ / 削除推奨 / 不明
```

「不明」の項目は本文から削除 or 曖昧化（"approximately"、"reportedly"）。

#### §3.3 比較表の他社数値 4 項目

```
[ ] Note to Self Mail latency ~600 ms → OK（実測ソース付） / 削除推奨
[ ] Email Me App ~800 ms              → OK（実測ソース付） / 削除推奨
[ ] Pigeon ~400 ms                    → OK（実測ソース付） / 削除推奨
[ ] Email Me "Free w/ ads"            → OK / 修正 → ____
```

実測ソースを提示できないものは数値削除（Yes/No 列のみ残す）。

#### §3.6 違和感ありそうな表現 6 個

```
[ ] "five taps where there used to be one"     → OK / 修正 → ____
[ ] "the lights stay on"                       → OK / 修正 → ____
[ ] "brutal recurring tax"                     → OK / 修正 → ____
[ ] "second brain"                             → OK / 修正 → ____
[ ] "indie developer"                          → OK / 修正 → ____
[ ] "Captio refugees"                          → OK / 修正 → ____
```

#### §3.4 / §3.5 リンク挿入

```
[ ] /en/note-to-email/ を本文 N 箇所に挿入  → 挿入済 / スキップ理由 → ____
[ ] App Store CTA リンク 2 箇所             → 挿入済 ✓（ドラフトに既に有）
[ ] Captio 公式残骸 / Ben Lenarts 公開ポスト → 挿入済 / スキップ
[ ] Note to Self Mail 公式                  → 挿入済 / スキップ
```

### 9.4 Layer 4 — 公開後の Google ground truth（最終判定）

公開直後 7 日以内に Search Console を観察：

| 指標 | 合格 | 不合格 |
|---|---|---|
| 「Scaled content abuse」警告 | ゼロ | 1 件以上 → **即 noindex 化、再編集** |
| 手動による対策 | ゼロ | 何かあれば → 同上 |
| クリックされたページ レポート | このページが正常表示 | スパム判定で除外 → 同上 |

不合格時の手順：

```html
<!-- /en/captio-alternative/index.html の <head> に追加 -->
<meta name="robots" content="noindex,nofollow">
```

そして §9.1〜§9.3 を再実行（別 reviewer 推奨）。

---

## 10. MTPE 公開可否 ワンクリック判定スクリプト

cowork や operator が手動で確認するのは漏れが起きるので、Layer 1〜3 を 1 コマンドで verify するスクリプト案：

```bash
# scripts/verify_mtpe_complete.sh （提案、Phase 4-c 統合時に追加）
#!/usr/bin/env bash
set -e
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

echo "=== Layer 2: 必須 3 ファイル ==="
for F in docs/en-captio-alternative-final.md \
         docs/en-captio-alternative-mtpe-changelog.md \
         docs/en-captio-alternative-mtpe-signoff.md; do
  [ -f "$F" ] || { echo "✗ MISSING: $F"; exit 1; }
  echo "✓ $F"
done

echo ""
echo "=== Layer 2: edits exist (final != draft) ==="
if diff -q docs/en-captio-alternative-draft.md \
          docs/en-captio-alternative-final.md > /dev/null; then
  echo "✗ FATAL: final.md is byte-identical to draft.md"
  exit 1
fi
echo "✓ edits present"

echo ""
echo "=== Layer 1+2: signoff has native-English claim ==="
grep -qiE "native.*english" docs/en-captio-alternative-mtpe-signoff.md \
  || { echo "✗ no native-English statement"; exit 1; }
echo "✓ native-English signoff present"

echo ""
echo "=== Layer 3: changelog has at least 5 entries ==="
COUNT=$(grep -cE "^- |^\* |^[0-9]+\." docs/en-captio-alternative-mtpe-changelog.md)
[ "$COUNT" -ge 5 ] || { echo "✗ changelog has only $COUNT entries (expected ≥5)"; exit 1; }
echo "✓ changelog has $COUNT entries"

echo ""
echo "=== Word count check ==="
WORDS=$(wc -w < docs/en-captio-alternative-final.md)
echo "Body words (incl. markdown): $WORDS"
[ "$WORDS" -ge 1700 ] && [ "$WORDS" -le 2700 ] \
  || { echo "✗ word count out of range"; exit 1; }
echo "✓ word count OK"

echo ""
echo "=== ALL LAYER 1-3 CHECKS PASSED ==="
echo "Layer 4 (Google Search Console) is verified post-publish."
```

完了条件チェックボックス：

- [ ] §9.1 reviewer sign-off が `docs/en-captio-alternative-mtpe-signoff.md` に存在
- [ ] §9.2 必須 3 ファイルが存在し、`final.md` と `draft.md` に diff あり
- [ ] §9.3 §3.2〜§3.6 のチェックリスト全項目に reviewer 回答記入済
- [ ] §9.4 公開 7 日後 Search Console 警告ゼロ確認

このうち 1〜3 は HTML 統合 / デプロイ前にゲート、4 は公開後ゲート。
