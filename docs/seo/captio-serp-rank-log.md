# SERP Rank Log（週次・15キーワード）

Weekly tracking of 15 target keywords (JA 10 / EN 5). 2026-08-11 に「月次・captioクラスタ5キーワード」から拡張した（依頼書C9 / Cowork側トリガーの週次化に対応）。**旧書式の既存エントリ（2026-06-01 / 07-01 / 08-01）はそのまま保持している。** captioクラスタの当初ゴール（attnoel.co.jp/blog/from-captio-to-note-to-email/ を上回る。Baseline: 2026-05-03, PR #186）は JA-1〜5 に引き継ぐ。

---

## Methodology

- Search tool: WebSearch (US-based Google index). google.co.jp rankings may differ, especially for the bare "captio" keyword which is dominated by Emburse expense software in US results.
- Positions are inferred from result order (1–10 visible per query). "—" = not in top 10.
- Cadence: 週次（Cowork トリガー）。旧エントリは月次。
- **後退時調査**: 前週比 −3 以上の下落、またはトップ10圏外への落下が1件でもあれば、同じ週のエントリに「Investigation」節を必ず付ける（書式は下記テンプレ）。
- SimpleMemo 側は最上位でランクした自社URLを記録する（想定ターゲットと違うURLが出た場合は Notes に書く）。

## Keyword set v2（2026-08-11 制定）

選定根拠: JA-1〜5 は旧ログからの継続（captioクラスタ）。JA-6〜10 / EN-1〜5 は GSC 実測
（growth/data/gsc/2026-08-11/queries.json）の表示回数・掲載順位と、戦略クラスタ
（line-keep / Obsidian差別化 / AI / note-to-emailカテゴリ）から選定。
入替は月次レビューで最大3件まで。入替時は当該週エントリに日付付きで記録する。

| # | Keyword | Lang | 主なターゲットURL | 選定理由 |
|---|---|---|---|---|
| JA-1 | captio | JA | /captio-alternative/ | 旧ログ継続 |
| JA-2 | captio 代替 | JA | /captio-alternative/ | 旧ログ継続・attnoel競合 |
| JA-3 | captio なくなった | JA | /blog/captio-discontinued | 旧ログ継続 |
| JA-4 | captio 後継 | JA | /blog/captio-discontinued | 旧ログ継続 |
| JA-5 | captio 使えない | JA | /blog/captio-discontinued | 旧ログ継続 |
| JA-6 | メモアプリ 無料 シンプル | JA | / | GSC 756 imp・pos 9.3・ブランド適合 |
| JA-7 | line keepメモ 終了 | JA | /blog/line-keep-alternative | GSC 710 imp・最大単一クラスタ |
| JA-8 | メモアプリ おすすめ | JA | /blog/best-memo-apps-2026 | GSC 574 imp・カテゴリヘッド |
| JA-9 | obsidian 音声入力 | JA | /blog/obsidian-voice-input | GSC pos 4.2・最多クリック・差別化軸 |
| JA-10 | ai メモアプリ | JA | /ai-tags/ | AIクラスタのピラー（GROWTH-AUDIT §N2） |
| EN-1 | captio alternative | EN | /en/captio-alternative/ | 8/1後退の当事者ページ・クラスタEN側 |
| EN-2 | google keep vs apple notes | EN | /vs/ 配下 | GSC 216+94 imp・/vs/資産 |
| EN-3 | fleeting notes | EN | /en/blog/fleeting-notes | GSC 79 imp・pos 7.2 |
| EN-4 | second brain | EN | /methods/second-brain/ | GSC 209 imp・pos 8.1 |
| EN-5 | note to email | EN | /note-to-email/ | カテゴリ定義語（戦略枠・GSC外） |

## Entry format（週次・この書式で追記する）

```markdown
## YYYY-MM-DD

| # | Keyword | Our pos (URL) | Top competitor (pos) | Δ vs last | Notes |
|---|---|---|---|---|---|
| JA-1 | captio |  |  |  |  |
| …(15行、Keyword set v2 の順) |  |  |  |  |  |

**Take:** （2〜5文。動いたもの・動かなかったもの・次に見るもの）

**Investigation:**（後退時のみ必須。無ければ節ごと省略）
- 対象キーワード:
- 事象（何がどこからどこへ動いたか）:
- 仮説（アルゴリズム更新 / 競合の新規参入 / 自サイト変更 / インデックス問題）:
- 確認したこと（GSC・キャッシュ・robots・直近デプロイ等）:
- 対応 / 経過観察の判断:

**Morning brief JSON:**（morning brief が読む1行。エントリ末尾に必ず置く）
`{"type":"serp-weekly","date":"YYYY-MM-DD","regressed":0,"improved":0,"flat":0,"watch":[],"investigation":false}`
```

JSON フィールド: `regressed`/`improved` は前回比 ±1 以上の件数、`flat` は残り、
`watch` は次週注視するキーワード（Keyword set の # 表記）、`investigation` は
Investigation 節の有無。

---

## 2026-06-01

| Keyword | SimpleMemo pos | attnoel pos | Δ vs last | Notes |
|---|---|---|---|---|
| captio | not in top 10 | not in top 10 | N/A (baseline) | US query dominated by Emburse expense software; JP memo-app context not represented |
| captio 代替 | ~4 (`/en/captio-alternative/`) | ~3 | N/A (baseline) | JP `/captio-alternative/` absent; `/blog/captio-discontinued` also at ~7 |
| captio なくなった | ~1 (`/blog/captio-discontinued`) | ~4 | N/A (baseline) | JP `/captio-alternative/` absent from top 10; blog post leads |
| captio 後継 | ~1 (`/blog/captio-discontinued`) | not in top 10 | N/A (baseline) | JP `/captio-alternative/` absent from top 10; blog post leads |
| captio 使えない | ~1 (`/blog/captio-discontinued`) | not in top 10 | N/A (baseline) | JP `/captio-alternative/` absent from top 10; blog post leads |

**Take:** `/blog/captio-discontinued` is the workhorse — ranking #1 for three high-intent keywords (なくなった, 後継, 使えない) and outranking attnoel on two of them. The PR #186 target page `/captio-alternative/` (JP) has not yet broken into visible rankings for any keyword; for "captio 代替" only the EN variant `/en/captio-alternative/` appears (~4), trailing attnoel (~3) by one position. Next month will show whether JP page authority accumulates post-indexing.

---

## 2026-07-01

| Keyword | SimpleMemo pos | attnoel pos | Δ vs last | Notes |
|---|---|---|---|---|
| captio | not in top 10 | not in top 10 | 0 / 0 | US index dominated by Emburse expense software; JP memo-app context not represented |
| captio 代替 | **1** (`/en/captio-alternative/`) | 3 | SimpleMemo **+3** / attnoel 0 | EN page jumped to #1, now outranking attnoel; JP `/captio-alternative/` still absent; SimpleMemo also appears at ~5, ~7, ~8 (home, /captio/, /blog/) |
| captio なくなった | 1 (`/blog/captio-discontinued`) | 4 | 0 / 0 | Held positions |
| captio 後継 | 1 (`/blog/captio-discontinued`) | not in top 10 | 0 / 0 | EN `/en/captio-alternative/` also appears at ~7 |
| captio 使えない | 1 (`/blog/captio-discontinued`) | **9** | 0 / attnoel **-9 (new entry)** | attnoel entered top 10 for first time at ~9; SimpleMemo holds #1 |

**Take:** SimpleMemo continued to dominate the three high-intent keywords (なくなった, 後継, 使えない) at #1, and the "captio 代替" EN page surged from ~4 to #1 — now clearly outranking attnoel (held at ~3). The JP `/captio-alternative/` page still has no visible top-10 ranking, so the PR #186 structured-data investment has yet to show directly; it may be the EN page benefiting instead. One watch item: attnoel entered the top 10 for "captio 使えない" at ~9 this month (was absent), suggesting it is slowly broadening its footprint across the keyword cluster.

---

## 2026-08-01

| Keyword | SimpleMemo pos | attnoel pos | Δ vs last | Notes |
|---|---|---|---|---|
| captio | not in top 10 | not in top 10 | 0 / 0 | US index dominated by Emburse/captio.co; JP memo-app context absent |
| captio 代替 | ~5 (`/captio/`) | **~1** | SimpleMemo **−4** / attnoel **+2** | EN `/en/captio-alternative/` disappeared from results; `/captio/` now best SimpleMemo entry; attnoel jumped to #1 from #3 |
| captio なくなった | ~4 (`/blog/captio-discontinued`) | **~2** | SimpleMemo **−3** / attnoel **+2** | Captioo App Store page (apps.apple.com) newly entered at #1, displacing SimpleMemo; attnoel rose from #4 to #2 |
| captio 後継 | ~5 (`/blog/captio-discontinued`) | **~3** | SimpleMemo **−4** / attnoel **new (+top 5)** | note.com and Captioo App Store push SimpleMemo to #5; attnoel entered top 5 (was absent) |
| captio 使えない | ~6 (`/blog/captio-discontinued`) | not in top 10 | SimpleMemo **−5** / attnoel **+9 (dropped out)** | Captioo App Store, older review blogs dominate top 5; attnoel dropped out after entering at ~9 last month |

**Take:** Significant SERP shift this month — SimpleMemo's /blog/captio-discontinued dropped from #1 to #4–6 across the three high-intent keywords it previously led, and the EN /en/captio-alternative/ page that held "captio 代替" #1 last month has vanished from visible results entirely. The primary displacer is the Captioo App Store page (apps.apple.com/jp/app/captioo), which newly appeared in top-2 positions across three keywords. attnoel gained meaningfully: now #1 for "captio 代替", #2 for "captio なくなった", and #3 for "captio 後継". The /captio-alternative/ JP page (PR #186 target) remains absent from all keywords. This pattern across all five queries in the same month is unlikely to be noise — a ranking reset or algorithm update affecting our blog cluster is the most probable cause and warrants investigation.

**Investigation:**（2026-08-01 の全面後退。次回の週次実行時に記入する — 空欄テンプレ）
- 対象キーワード: captio 代替 / captio なくなった / captio 後継 / captio 使えない（＋EN-1 captio alternative の圏外化）
- 事象（何がどこからどこへ動いたか）: ＿＿
- 仮説（アルゴリズム更新 / 競合の新規参入（Captioo App Store）/ 自サイト変更 / インデックス問題）: ＿＿
- 確認したこと（GSC・キャッシュ・robots・直近デプロイ等）: ＿＿
- 対応 / 経過観察の判断: ＿＿

---

## YYYY-MM-DD（見本エントリ — 週次実行時にこのブロックを複製して日付を入れ、この行の括弧書きは消す）

| # | Keyword | Our pos (URL) | Top competitor (pos) | Δ vs last | Notes |
|---|---|---|---|---|---|
| JA-1 | captio |  |  |  |  |
| JA-2 | captio 代替 |  |  |  |  |
| JA-3 | captio なくなった |  |  |  |  |
| JA-4 | captio 後継 |  |  |  |  |
| JA-5 | captio 使えない |  |  |  |  |
| JA-6 | メモアプリ 無料 シンプル |  |  |  |  |
| JA-7 | line keepメモ 終了 |  |  |  |  |
| JA-8 | メモアプリ おすすめ |  |  |  |  |
| JA-9 | obsidian 音声入力 |  |  |  |  |
| JA-10 | ai メモアプリ |  |  |  |  |
| EN-1 | captio alternative |  |  |  |  |
| EN-2 | google keep vs apple notes |  |  |  |  |
| EN-3 | fleeting notes |  |  |  |  |
| EN-4 | second brain |  |  |  |  |
| EN-5 | note to email |  |  |  |  |

**Take:** ＿＿

**Investigation:**（後退が無ければこの節ごと削除）
- 対象キーワード: ＿＿
- 事象（何がどこからどこへ動いたか）: ＿＿
- 仮説: ＿＿
- 確認したこと: ＿＿
- 対応 / 経過観察の判断: ＿＿

**Morning brief JSON:**
`{"type":"serp-weekly","date":"YYYY-MM-DD","regressed":0,"improved":0,"flat":15,"watch":[],"investigation":false}`
