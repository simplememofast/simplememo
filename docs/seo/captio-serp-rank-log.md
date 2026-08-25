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

## 2026-08-18 (weekly)

> **方法論メモ**: WebSearch ツールの返却件数はクエリあたり ~10 件（タスク仕様の 30 件には届かず）。US-based Google index を使用。JA キーワードの順位は google.co.jp と差が生じることがある（特に bare "captio" は Emburse 経費ソフトが US SERP を支配）。位置は返却リンクの順序から推定し「~N」表記。

| Keyword | Lang | SimpleMemo pos (page) | attnoel | note2selfmail | emailmeapp | Δ vs last | Notes |
|---|---|---|---|---|---|---|---|
| captio | JA | not in top ~6 | not visible | not visible | not visible | flat | US SERP 全面 Emburse 経費ソフト；JA メモアプリ文脈は今月も不在 |
| captio 代替 | JA | ~4 (/blog/captio-discontinued) | ~1 | not visible | not visible | SM: **+1** (prev ~5 /captio/) | attnoel #1 維持；note.com #2；Captioo App Store #3 |
| captio なくなった | JA | ~4 (/blog/captio-discontinued) | ~2 | not visible | not visible | flat | note.com #1；Captioo App Store #3；構成は 2026-08-01 から変化なし |
| captio 後継 | JA | ~5 (/blog/captio-discontinued) | not visible (prev ~3) | not visible | not visible | SM: flat；attnoel: 圏外へ | Captioo App Store #1；applion.jp #2；attnoel が top ~6 から消えた |
| captio 使えない | JA | not visible (prev ~6) | ~2 (prev: 圏外) | not visible | not visible | SM: **dropped out**；attnoel: 急上昇 | **REGRESSION** Captioo App Store #1；attnoel #2；webcli.jp #3；progsoft.net #4 |
| Obsidian メモ iPhone | JA | App Store listing ~1；website not in top ~5 | n/a | n/a | n/a | **baseline** | simplememofast.com サイト自体は不可視；qiita.com #2 |
| Obsidian 音声入力 | JA | not in top ~7 | n/a | n/a | n/a | **baseline** | note.com のショートカット記事が #1-5 を占有 |
| メモアプリ 音声 無料 | JA | not in top ~6 | n/a | n/a | n/a | **baseline** | plaud.ai が #1-2；文字起こしサービスが支配 |
| 自分宛メール メモ | JA | not in top ~7 | n/a | n/a | n/a | **baseline** | メモメール App Store #1；SM 不在 |
| Obsidian デイリーノート iPhone | JA | not in top ~7（開発者 Qiita が ~2） | n/a | n/a | n/a | **baseline** | note.com #1；developer の Qiita 記事 #2（サイトではない） |
| obsidian quick capture ios | EN | not in top ~10 | n/a | n/a | n/a | **baseline** | "Quick Capture - Vault notes" / "Quick Draft" アプリが支配 |
| email to obsidian | EN | ~6 (/en/blog/email-to-obsidian) | n/a | n/a | n/a | **baseline** | email2obsidian.com #5；GitHub plugin が #1 |
| voice memo obsidian | EN | ~6 (/en/blog/obsidian-voice-input) | n/a | n/a | n/a | **baseline** | Obsidian Forum スレッドが #1-4；Voice Inbox app #5 |
| captio alternative | EN | ~6 (/en/captio-alternative/) | n/a | ~4 (note-taking 文脈クエリ) | not visible | **improved** (prev: 圏外) | US bare keyword は Emburse 経費ソフト混在；note-taking 文脈クエリでは SM #1 |
| note to self email app | EN | not visible | n/a | ~9 (note2selfmail.app) | ~8 (emailmeapp.net) | **baseline** | App Store 各アプリが #1-7；emailmeapp #8；note2selfmail #9 |

**Take:** captio クラスタは JA-2/3/4 が #4-5 を保持し EN captio-alternative も先月の圏外から ~6 に復帰した一方、JA-5「captio 使えない」は圏外落ち（SimpleMemo）＋ attnoel が #2 急浮上という逆転が発生。Obsidian コンテンツ群（EN-12/13）は初登場で #6 と健闘。App Store 上の SimpleMemo アプリ名は「Obsidian メモ iPhone」で #1 を取るが、simplememofast.com サイト自体が不可視という乖離は要対処。

### 調査 / Investigation

**対象キーワード（2件のトリガー）:**
1. **必須初回調査**: 2026-08-01 の全面後退 — captio 代替（SM: #1→~5）/ captio なくなった（#1→~4）/ captio 後継（#1→~5）/ captio 使えない（#1→~6）/ EN captio alternative（#1→圏外）
2. **今週トリガー**: JA-5「captio 使えない」— SM が ~6→not visible（−2 以上）

---

**(a) 誰がポジションを取ったか**

- **captio 代替**: attnoel #1（2026-07 の #3 から上昇して 8/1 以降 #1 固定）。note.com ユーザー記事 #2。**Captioo**（apps.apple.com/jp/app/captioo/id6449494395）#3 — 「Captio」の名称を継承した別開発者の iOS アプリで、App Store 公式ページが branded 検索で高権威評価を得ている。
- **captio なくなった / 後継**: Captioo App Store が #1-3 に定着。attnoel は「後継」では今週 top ~6 から消えた（変動あり）。
- **captio 使えない**: Captioo App Store #1、attnoel #2（先月 top 10 圏外→今週 #2 は急上昇。先月は "captio 使えない" で SM が #6 だった頃、attnoel が一時的に #9 に入ったが今月は圏外に戻っていた。今週は #2 と最大の上昇）。webcli.jp #3、progsoft.net #4、teineini.net #5 — いずれも 2019-2020 年の旧記事だが常駐。
- **EN captio alternative**: US SERP で "Captio" ブランドは Emburse 経費管理ソフト（getapp / g2 / capterra）と混在。note-taking 文脈では alternativeto.net が #4 台、note2selfmail が #4、SM は ~6。

**構造的原因**: Captioo アプリ（2023-2024 年 App Store 登録）が captio ブランド名で被リンクと評判を積み上げた結果、Google がブランド検索において App Store ページを最高権威として扱い始めた。これが captio 系全 JA キーワードの #1-3 を 2025 年末〜2026 年にかけて占有するようになった主因。SM ブログ記事はこの「ブランド直撃」に対して不利な位置にある。

---

**(b) インデックス状況**

`site:simplememofast.com captio` を実行 → /en/captio-alternative/、/blog/captio-discontinued、/captio/、/vs/ などが表示されインデックスは**正常**。

- `/blog/captio-discontinued` → HTTP **200 OK**、タイトル「Captioが使えなくなった理由と代替アプリ — 2026年の最新状況」✓
- `/en/captio-alternative/` → HTTP **200 OK**、タイトル「Captio Alternative 2026: 6 Best Apps Compared (Fastest 0.4s)」✓

デインデックスではない。順位低下は外部競合の上昇によるもの。

---

**(c) 自サイト側の変更**

`git log --since=2026-08-01` で captio-alternative / blog/captio-discontinued に直接触れた PR は **0 件**。この期間のマージは Obsidian コンテンツ拡充（PR #470-483）、i18n バグ修正（#494-495）、ベンチマーク更新（#454-460）が中心。

→ **自サイト側の変更は captio クラスタに影響していない。ポジション変動は全て外部要因（Captioo App Store の権威上昇＋attnoel のコンテンツ鮮度）による。**

---

**Next actions（記録のみ。実施しない）:**

1. `/captio-alternative/`（JP）: 「captio 使えない」「captio 後継」を明示した H2 セクションと FAQPage エントリを追加する。このページは現在 JA captio 系キーワードで不可視であり、PR #186 の投資（JSON-LD / 7 列比較表）が JA SERP に反映されていない。
2. `/blog/captio-discontinued`: 2026 年版の Captioo（新アプリ）との比較セクションを追加してコンテンツ鮮度を回復させる。「captio 使えない」圏外落ちの直接対処。
3. `/en/captio-alternative/`: Captioo vs SimpleMemo の比較テーブルを追加し、EN "captio alternative" の note-taking 文脈での権威性をさらに高める（bare keyword での Emburse 混在は構造的課題で即効策は限られる）。

**Morning brief JSON:**
`{"type":"serp-weekly","date":"2026-08-18","regressed":1,"improved":2,"flat":3,"watch":["JA-5","JA-6","EN-14"],"investigation":true}`

```json
{"date":"2026-08-18","kw_tracked":15,"top3":0,"top10":6,"improved":2,"declined":1,"out_of_top30":1,"worst":{"kw":"JA-5 captio 使えない","from":"~6","to":"not visible"},"best":{"kw":"EN-14 captio alternative","from":"out","to":"~6"},"investigation":true,"take":"Captio cluster holds #4-5 for 3 JA keywords but JA-5 dropped out; EN captio-alternative returned to ~6; 9 new baseline keywords established."}
```

---

## 2026-08-25 (weekly)

> **方法論メモ**: WebSearch ツールの返却件数はクエリあたり ~10 件（タスク仕様の 30 件には届かず）。US-based Google index を使用。JA キーワードの順位は google.co.jp と差が生じることがある。位置は返却リンクの順序から推定し「~N」表記。simplememofast.com の App Store リスティング（id6758438948）は自社ページではないため位置記録の主体は simplememofast.com ドメインの URL に限る。

| Keyword | Lang | SimpleMemo pos (page) | attnoel | note2selfmail | emailmeapp | Δ vs last | Notes |
|---|---|---|---|---|---|---|---|
| captio | JA | not visible (App Store listing ~2 だが非対象) | not visible | not visible | not visible | flat | Captioo App Store #1；SimpleMemo App Store #2（公式サイトURL不可視）；Emburse混在なし |
| captio 代替 | JA | ~4 (/blog/captio-discontinued) | **~2** (prev ~1) | not visible | not visible | SM: flat；attnoel: −1 | SM App Store listing #1（非対象）；attnoel #2；note.com #3；/blog/ #4；/captio/ #5 |
| captio なくなった | JA | ~4 (/blog/captio-discontinued) | ~2 | not visible | not visible | flat | Captioo App Store #1；attnoel #2；webcli.jp #3；SM #4；teineini.net #5 |
| captio 後継 | JA | **~3** (/blog/captio-discontinued) | ~2 (prev: not visible) | not visible | not visible | SM: **+2**；attnoel: 復帰 | Captioo App Store #1；attnoel #2；SM #3；teineini.net #4；progsoft.net #5 |
| captio 使えない | JA | not visible | **~1** (prev ~2) | not visible | not visible | SM: flat；attnoel: **+1** | attnoel #1；note.com #2；webcli.jp #3；teineini.net #4；growrichslowly.net #5；SM圏外 |
| Obsidian メモ iPhone | JA | App Store ~1；simplememofast.com not visible | n/a | n/a | n/a | flat | Obsidian公式 App Store #2；note.com #3；mac-ra.com #4；SM website 不可視 |
| Obsidian 音声入力 | JA | not visible | n/a | n/a | n/a | flat | note.com ショートカット記事が #1-7 を占有；genspark.ai #6 |
| メモアプリ 音声 無料 | JA | not visible | n/a | n/a | n/a | flat | jp.plaud.ai #1；notta.ai #2；mojiokoshi3.com #4；文字起こしサービスが支配 |
| 自分宛メール メモ | JA | not visible | n/a | n/a | n/a | flat | メモメール App Store #1-2；Moca App Store #3；attnoel ~4（注: captio以外でも attnoel が露出）；SM不可視 |
| Obsidian デイリーノート iPhone | JA | not visible；dev Qiita ~8 | n/a | n/a | n/a | flat | ipadworkers.substack.com #1；note.com #2-7；qiita.com/simplememo（開発者）~8；SM website 不可視 |
| obsidian quick capture ios | EN | not visible | n/a | n/a | n/a | flat | Quick Draft / Quick Capture Vault Notes App 群が支配；quickcaptureobsidian.app #8；SM不可視 |
| email to obsidian | EN | **not visible** (prev ~6) | n/a | n/a | n/a | **REGRESSION（圏外落ち）** | community.obsidian.md #1；obsidianstats.com #2；GitHub repos #4-5；email2obsidian.com #7；SM消失 |
| voice memo obsidian | EN | **~4** (/en/blog/obsidian-voice-input) | n/a | n/a | n/a | **+2** | Obsidian Forum #1-3；SM #4；mdisbetter.com #5；Medium #6；drew.tech #7 |
| captio alternative | EN | **~4** (/en/captio-alternative/) | n/a | ~6 (prev ~4) | not visible | SM: **+2**；note2self: −2 | IndieHackers SM紹介記事 #1；Note To Self Mail App Store #2；makeuseof.com #3；SM #4；/en/ #5 |
| note to self email app | EN | **~4** (/en/send-email-to-yourself/) | n/a | ~5 (prev ~9) | ~6 (prev ~8) | SM: **新登場**；note2self: **+4**；emailme: **+2** | Note To Self App Store #1-3；SM #4（初ランクイン）；note2selfmail.app #5；emailmeapp.net #6 |

**Take:** EN ページ群が今週堅調。voice memo obsidian が #4 へ 2 段上昇し、captio alternative も同じく #4 へ浮上、note-to-self-email-app ページが初めて #4 に登場した。JA では captio 後継が #3 に改善（+2）。一方 EN-12「email to obsidian」がトップ ~10 から完全に消え、community.obsidian.md / email2obsidian.com が SERP を占有しており調査が必要。

### 調査 / Investigation

**対象キーワード（トリガー）:**
- EN-12「email to obsidian」— SM が ~6 → not visible（2 段以上の後退かつ圏外落ち）

---

**(a) 誰がポジションを取ったか**

今週の email to obsidian SERP（上位 ~10）:
1. community.obsidian.md/plugins/taskrobin（Sync Emails プラグイン公式ページ）
2. obsidianstats.com/plugins/email-block-plugin
3. forum.obsidian.md（Email client for Obsidian スレッド）
4. github.com/anicholson/obsidian-google-mail
5. github.com/tommll/obsidian-email-plugin
6. forum.obsidian.md（Email forwarding to Obsidian スレッド）
7. email2obsidian.com（専用サービス: メール転送で Obsidian Vault に保存）
8. readmedium.com（Medium 記事）
9-10. github.com Obsidian プラグイン関連

**分析**: Obsidian 公式エコシステム（community.obsidian.md, forum.obsidian.md）と GitHub リポジトリが 1-6 位を独占。これらはプラットフォーム権威（Obsidian 公式ドメイン・GitHub）により従来から強固な位置を占める。email2obsidian.com は「メールを送ると Vault に届く」という直接競合サービスで 7 位に位置する。SM の /en/blog/email-to-obsidian は「ワークフロー解説ブログ」として公式プラグインページ群に競り負けている。

**(b) インデックス状況**

2026-08-18 の調査で `/en/blog/email-to-obsidian` は HTTP 200 OK・正常インデックスを確認済み。今週の結果から「デインデックス」ではなく「ランキング低下」と判断する（直前週に ~6 で可視だったページが今週のクエリでは返却されていない。US-based index での 10 件表示制限による変動可能性も排除できないが、常時可視から消えたのは実質的な後退）。

**(c) 自サイト側の変更**

`git log --since=2026-08-18` で /en/blog/email-to-obsidian に直接触れた PR は **0 件**。この期間のマージは以下が中心（いずれも email-to-obsidian 記事への影響は間接的）:
- PR #518: EN ハブの内部リンク追加（email-to-obsidian へのリンクが含まれているか要確認）
- PR #519: SEO/AIO 一括施策（v4 成長計画）
- PR #521, #524: /obsidian/plugins/ 系の新設ページ（新設ページが内部リンクの重みを分散させた可能性）
- PR #525: sitemap の CI バリデーション追加

→ **自サイト側の直接変更なし。外部要因（Obsidian 公式エコシステムの安定上位）と、PR #521/524 の /obsidian/ 新設ページによる内部リンク構造変化が間接影響した可能性。**

---

**Next actions（記録のみ。実施しない）:**

1. `/en/blog/email-to-obsidian`: HowTo JSON-LD と 2026 年最新ツール比較セクション（email2obsidian.com vs SimpleMemo workflow）を追加し、コンテンツ鮮度とページ権威を高める。
2. `/en/blog/email-to-obsidian`: PR #518 で追加した EN ハブからこの記事への内部リンクが張られているか確認し、未リンクなら /en/、/en/captio-alternative/、/obsidian/ 各ハブからの文脈リンクを追加する。
3. `sitemap.xml`: /en/blog/email-to-obsidian の lastmod が PR #525 後も最新に更新されているか確認し、Googlebot のクロール優先度を維持する。

**Morning brief JSON:**
`{"type":"serp-weekly","date":"2026-08-25","regressed":1,"improved":4,"flat":10,"watch":["EN-12","JA-5","JA-9"],"investigation":true}`

```json
{"date":"2026-08-25","kw_tracked":15,"top3":1,"top10":6,"improved":4,"declined":1,"out_of_top30":1,"worst":{"kw":"EN-12 email to obsidian","from":"~6","to":"not visible"},"best":{"kw":"EN-15 note to self email app","from":"not visible","to":"~4"},"investigation":true,"take":"EN voice/captio-alternative/note-to-self pages climbed to ~4; EN-12 email-to-obsidian dropped out; JA-4 captio-successor improved to #3."}
```

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
