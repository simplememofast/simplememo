# PR TIMES の D+14 数値を、機械で取りに行く

**この文書は Routine が読む正典。**手順の本体はここにあり、Routine のプロンプトは薄く保つ
（`x-engagement-simplememofast` が `SKILL.md` を正典にしているのと同じ形）。

    https://raw.githubusercontent.com/simplememofast/simplememo/main/docs/prtimes-d14-capture.md

> ## ⛔ この URL を `WebFetch` で読まないこと
>
> **[2026-09-03 実測] `WebFetch` は権限プロンプトを出して Routine を止める。**
> 空回し2回目（`session_019a4CCzVD4bfBBsELeBiQgM`）は、まさにこの URL を
> `WebFetch` で読もうとして `SESSION_STATUS_REQUIRES_ACTION` のまま停止した
> —— `permission_mode: bypassPermissions` でも、である。
> **Chrome へ辿り着く前に、手順書を読む段階で止まった。**
>
> **Routine のプロンプトは先にリポジトリを clone している。**だから正典は
> **クローンの中のファイルとして読む**こと:
>
> ```
> cat docs/prtimes-d14-capture.md     # ← これ。WebFetch ではなく
> ```
>
> **なぜ怖いか。**止まり方が「失敗」ではなく**「人待ち」**で、
> 9/17 の 09:00 JST に人は見ていない。**赤くならずに、ただ止まる。**
> しかも空回し1回目は同じことをせずに完走したので、**毎回は起きない** ——
> **非決定的に静かに止まる**という、いちばん見つけにくい形をしている。

---

## なぜ要るか

PR リリースの乗車判定（`growth/experiments/experiments.json` の `type: pr_release`）は
**5つの数値のうち3つが PR TIMES のログイン後の分析画面にしか無い。**
2026-09-03 まで、この転記は人の作業として台帳に積まれていた。

**積んでいた理由は「機械に無理」ではなく「その環境に Chrome が無い」だった。**
主系（GitHub Actions）と代走（Claude Code Remote）は egress が絞られていて
`prtimes.jp` に届かない —— 実測で `HTTP 000`、`google.com` も同じなので
**外向きが全般に閉じている**（許可先は自社ドメインと API のみ）。

[2026-09-03 追記] CCR 側で出るエラーの**署名**はこれ。見たら即座に「経路が無い」と判断してよい:

| 経路 | 出るもの |
|---|---|
| `curl https://prtimes.jp/...` | `curl: (56) CONNECT tunnel failed, response 403`（＝`HTTP 000`） |
| `WebFetch` | `{"error_type":"EGRESS_BLOCKED","domain":"prtimes.jp"}` |
| `help.prtimes.jp` | `getaddrinfo ENOTFOUND`（名前解決すら通らない） |
| 対照: `simplememofast.com` / `raw.githubusercontent.com` | どちらも `HTTP 200` |

**`raw.githubusercontent.com` が 200 なのが重要** —— CCR でもこの手順書自体は読める。
**読めるのに実行できない**ので、「手順書が取れた＝経路がある」と早合点しないこと。

一方 `note-simplememo-3days` / `x-engagement-simplememofast` /
`indie-hackers-karma-daily` は **Claude-in-Chrome MCP** でログイン済み Chrome を
毎日動かしている。**同じ経路なら PR TIMES の分析画面も読める。**
この文書はその経路に載せるための手順。

---

## 対象

**この判定はスクリプトが持っている。散文で数え直さないこと。**

```
node scripts/pr-evaluation-due.mjs --json
```

`growth/experiments/experiments.json` の `type: "pr_release"` かつ
`status: "running"` かつ `evaluation_at` が当日以前で、**まだ転記されていない**
ものだけを返す。**空配列なら何もせずに終わる。**

[2026-09-03] 最初この判定は散文だけで書かれていて、**リリースごとに人が
Routine を1本置く形**になっていた。台帳に行を足したら勝手に拾われる形でなければ
自律ではないので、導出をスクリプトへ移した（自己テスト20件・変異6種で検出を確認）。
実データの「9/16 は0件・9/17 は1件」も自己テストが固定しているので、
台帳側で日付か status が動けば `seo-check` で落ちる。

リリース URL は `annotations.json` の同日の `note` にある
（PR⑥ なら `https://prtimes.jp/main/html/rd/p/000000009.000182412.html`）。

---

## 手順

### 0. 先に台帳を読む。**空なら何もしない。**

```
node scripts/pr-evaluation-due.mjs --json
```

**空配列ならここで終わる。**Chrome も開かない。期限が来ていない日のほうが多いので、
**何もしない日が既定**である。

返ってきた各行の `id` が対象で、`missing` が未転記のキー。
`discover_boarding_post` が既に埋まっているものはこの時点で除かれている
（二重転記は「あとから入った値がどちらか分からない」状態を作る）。

### 1. Chrome ツールをロードする

```
ToolSearch query:
select:mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__find,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp,mcp__claude-in-chrome__switch_browser
```

見つからなければ `Claude_in_Chrome`（大文字・アンダースコア）でも引く。
実行系によって名前が変わる（`note-simplememo-3days` SKILL.md の注記どおり）。

> **⛔ どちらでも見つからなければ、そこで終了する。**
> 「たぶんこのくらい」と数値を作らない。**取れなかったことを報告して終わる。**
> このリポジトリの規律は一貫して「読めなかった」と「無かった」を混ぜない
> （`bq_checked: false` を 0件 と書かない、と同じ）。

`Multiple Chrome extensions connected` が出たら `switch_browser` を1回試す。
駄目なら**未接続として報告して終了**（`indie-hackers-karma-daily` と同じ扱い）。

### 2. 分析画面へ行って、本文テキストを取る

> **⚠ この節は 2026-09-03 時点でまだ実物に当たっていない。**
> 空回しを2回試したが、どちらも画面まで届かなかった（下の「空回しを2回やった結果」）。
> **導線は推定である。**初回に開いた人は、**実際にどう辿ったかをここへ書き直すこと。**

1. `navigate` で PR TIMES の管理画面へ入り、対象リリースの**分析／アナリティクス**を開く
2. `get_page_text`（必要なら `read_page`）でページ本文を取る

> **DOM セレクタを書かない。**画面が変われば静かに壊れ、壊れたことに気づけない。
> **本文テキストからモデルが読む。**他の3スキルと同じ方式。

> **`WebFetch` で開かない。**ログイン後の画面なので届かないうえ、
> **権限プロンプトで Routine ごと止まる**（冒頭 ⛔）。**Chrome の `navigate` を使う。**

### 3. 5つの数値を読む

> **⚠ 左の「何を読むか」は推定であり、2026-09-03 時点で実物と照合できていない。**
> **画面の語がここと違っても、それは画面が正しい。**推定に合わせて数字を探さないこと。
> 初回に開いた人は、**実物の語**（「PV」なのか「閲覧数」なのか等）へ直し、
> 末尾の表の該当行を **✅ 実物を確認（日付）** に差し替えること。
>
> **特に確かめること:** 比率が **% 表示か小数か**（判定式は 0〜1 前提なので、
> ここを取り違えると `mobile_ratio: 62` が `0.62` のつもりで入る）、
> Google 系が**どう括られているか**（`google.com` と `news.google.com` が別行か）、
> 転載が「転載」なのか「掲載メディア」なのか、**件数が直接読めるか**。

| フィールド | 何を読むか（**推定・未照合**） |
|---|---|
| `pv` | 総PV |
| `google_referral_ratio` | 参照元のうち Google 系の比率（**0〜1 の小数**。画面が % なら 100 で割る） |
| `mobile_ratio` | スマートフォン比率（同上） |
| `syndication_count` | 転載本数 |
| `day1_senders_vs_prev3avg` | **PR TIMES には無い。**アプリ側の実測（下記） |

> **1つでも読めなかったら、その1つを `null` のままにして先へ進む。**
> 読めた数値まで捨てる必要はない。**読めなかったものを埋めない**だけ。

`day1_senders_vs_prev3avg` は出どころが違う —— 配信当日の送信者数 ÷ 前3日平均で、
アプリの日次ファネル（`simplememo-api` の `POST /admin/analytics/funnel`・管理鍵が要る）から出す。
**急がなくてよい**: 元データ（D1 の `app_analytics_events`）の保持は
**90日**（`src/analytics/jobs.ts` の `ANALYTICS_RETENTION_DAYS`）なので、D+14 でも十分残っている。
鍵が無い実行系では `null` のままにして、その旨を報告に書く。

### 4. 判定する

```
boarded = (google_referral_ratio > 0.9) && (mobile_ratio > 0.5)
```

**どちらかが `null` なら `boarded` も `null`。**片方だけで判定しない。

外した（D-SCORE の予測と実際がずれた）場合は、**どの S を読み違えたか**を
レコードの `notes` に書く。PR⑥ で最初に疑う候補は2つ（レコードの 2026-09-03 の注記）:

1. **時刻** —— 08:03 JST 配信。n=5 で 08:32 に出した 8/18（PR⑤）は非乗車で同じ帯
2. **S2（見出しの固有名詞）** —— 配信見出しは iPhone を含むが、**アプリ名も Obsidian も App Store も無い**。
   乗車した2本（65/71）を牽引したのはそのエンティティだった

### 5. 台帳へ書く

**(a) `growth/experiments/experiments.json`** —— 対象レコードの
`discover_boarding_post` の5フィールドと `boarded` を埋め、
`decision` と `evaluated_at`（YYYY-MM-DD）を書く。

**(b) `growth/data/annotations.json`** —— 同日の `type: "pr"` の行の `label` を、
**`d-score --backtest` が読む書式**へ直す:

```
PR⑥ <見出し>（AI実行率76.4%） — n,nnnPV・転載nn・D-SCORE 85・乗車
                                                              ^^^^ 乗車 / 非乗車
```

**この書式でしか拾われない。**直すまで n=5 のままになる。
実際のパーサはこれ（`growth/scripts/d-score.mjs` 113〜116 行・2026-09-03 に実物と照合済み）:

```js
/D-SCORE\s*(\d+)/          // 85
/([\d,]+)PV/                // 12,188PV
/転載(\d+)/                 // 転載34
/(?:^|[^非])乗車/ → true     // 「・乗車」は true、「非乗車」は false
```

現在 PR⑥ の行は `PV未集計・転載未集計・D-SCORE 85・判定待ち` で、
backtest は **「1 件は書式が違い拾えなかった」** と報告している。それがこの行。

**(c) 検算** —— `node growth/scripts/d-score.mjs --backtest` を回し、n が 1 増えることを確認する。
増えなければ書式が合っていない。

**(d) 閉じる** —— `data/autopilot-actions.json` の該当行（PR⑥ は `act-pr6-d14-evaluate`）を
`state: "done"` にし、`closed_jst` と `evidence`（読んだ5数値と判定）を書く。

### 6. 出荷と報告

- リポジトリへ push できる実行系なら、`claude/` ブランチで PR を出す
  （SEO Validation → auto-merge。CLAUDE.md の手順どおり）
- **push できない実行系でも、5つの数値と判定は必ず報告に出す。**
  取れた数値を、書けなかったという理由で捨てない。あとから人が転記できる形にする

---

## どの実行系で回すか —— **ここを間違えると Chrome が付かない**

**2026-09-03 に実測して分かった、決定的な差。**Routine は `environment_id` で行き先が決まる:

| Routine | environment_id | Chrome |
|---|---|---|
| `x-engagement-simplememofast` 昼/夜 | **（なし）** | **付く**（毎日稼働中） |
| `obsidian-community v3`（Reddit実投稿） | **（なし）** | **付く** |
| `Obsidianオートパイロット再試行 v3` | `env_01RmhZUdCQoTVYsGM6Ly45oP` | 付かない |
| `SEO Weekly` | `env_01RmhZUdCQoTVYsGM6Ly45oP` | 付かない |

**`environment_id` を持たない Routine が Cowork 側で発火し、アカウントのコネクタ
（Claude-in-Chrome を含む）がサーバ側で組み立てられる。**
`env_01RmhZ…`（Simple Memo）は CCR で、**Chrome は付かない。**

**そして CCR セッションからは Cowork 環境を指定できない。**
`list_environments` が返すのは CCR 環境3つだけで、Cowork 環境は出てこない。
`create_trigger` は呼び出し元の環境を既定にするので、**CCR から作った Routine は必ず CCR 側へ行く**
（実際に警告が出る: `this trigger stores no MCP connectors ...
create it from a session that holds them, or ask the user to create it from the claude.ai routines UI`）。

### したがって、本当の自動化にするには

**claude.ai の Routines UI か、Cowork セッションから作ること。**

**そして「1回きり」で作らないこと。**[2026-09-03] 最初は PR⑥ の評価日だけに発火する
one-shot を置いた。動きはするが、**7本目の配信でまた人が置くことになる。**
それは自動化ではなく代行で、置き忘れた回は静かに評価されない。

| 項目 | 値 |
|---|---|
| 種別 | **定期（毎日）** —— 一度きりにしない |
| 時刻 | 09:00 JST |
| environment_id | **指定しない**（指定すると CCR 側へ行き Chrome が付かない） |

```
https://raw.githubusercontent.com/simplememofast/simplememo/main/docs/prtimes-d14-capture.md
の手順に従って、評価期限の来た PR 実験の数値を PR TIMES から取得し、台帳へ記入する。

まず `node scripts/pr-evaluation-due.mjs --json` を実行し、**空配列なら何もせずに終わる。**
Chrome が繋がっていなければ数値を作らず、取れなかったと報告して終わること。
```

**毎日走ってほとんどの日は何もしない**のが正しい形。判定はスクリプトが持っているので、
プロンプトはリリース名を含まない —— **次の配信は台帳に行を足すだけで拾われる。**

CCR 側に作ってある `trig_01UyxxNpMNp7ecsBycR2xYqz`（9/17 one-shot）は
**取得できない見込みの控え**で、Chrome が無ければ手順と転記先をオーナーへ
push/email して終わる。**定期版を作るまでは残しておくこと**（唯一の網なので）。
作ったら削除してよい。

---

## この手順が黙って壊れる形（先に書いておく）

- **Chrome が繋がっていないのに「0件だった」と書く** —— 最悪。§1 の ⛔ がこれを止める
- **画面の % をそのまま入れる**（`mobile_ratio: 62` と `0.62`）—— 判定式は 0〜1 前提
- **`annotations.json` の書式を守らず backtest が拾わない** —— §5(c) の検算で分かる
- **二重転記** —— §0 のガードで止める
- **数値は取れたのに、報告が誰にも届かない**（[2026-09-03] 実測で判明）——
  §6 は「push できない実行系でも報告に必ず出す」と書いているが、
  **その「報告」は発火元からは読めない。**
  2026-09-03 に CCR から `fire_trigger` で Cowork 側を起こしたところ、
  そのセッションは7分・25,395トークン働いて正常終了したが、
  **発火元に残ったのはセッションIDだけだった** —— ブランチも PR も無く、
  `get_session` が返すレコードに要約フィールドも無く、`list_events` も
  `ListAgents` 越しの送信もこの実行系には無い。
  **報告本文はそのセッションのトランスクリプトの中にしか存在しない。**

  > ⚠ **ただし今回は、こちらが「push できなければ報告テキストだけで構わない」と
  > 逃げ道を与えていた。**だから「Cowork 側は push できない」とは言えない
  > （**やらなかった**のか**できなかった**のかは、今回の実測では区別がついていない）。

  **日次 Routine の本番経路は無事**である —— プロンプトが
  「`experiments.json` へ記入して **PR を出してください**」と PR を必須にしている。
  穴があるのは §6 の**代替手段のほう**で、「push できない実行系でも報告に出せばよい」は
  **発火元が人でないときには成立しない。**

  したがって §6 はこう読むこと: **報告は PR の代わりにならない。**
  push できないなら「できなかった」こと自体を残す（ブランチ1本でもよい）。
  そうしないと、数値は取れているのに台帳は未転記のまま `days_overdue` を数え続け、
  **「取れなかった」と「取れたが届かなかった」が見分けられなくなる。**
- **`autopilot-actions.json` の取り合い**（[2026-09-03] 発見・**未解決**）——
  §5(d) はこの手順に `data/autopilot-actions.json` を書かせるが、
  **同じ日の 20 分後に別の Routine が同じファイルを書く。**

  | Routine | 時刻 | 同ファイルへの操作 |
  |---|---|---|
  | `PR実験の D+14 取得（台帳駆動）` | 09:00 JST | §5(d) で `act-pr6-d14-evaluate` を `done` にする |
  | `Obsidianオートパイロット再試行 v3` | **09:20 JST** | 手順8で新しい行を**追記**する |

  どちらも別々に PR を出す。ファイルは整形済みの複数行（1,184行）なので、
  **既存行の書き換え（D+14）と末尾への追記（再試行）は通常 git が併合できる。**
  危ないのは両方が同じ位置へ追記したときと、**片方の PR が古い main から
  枝を切ったまま後からマージされたとき**（auto-merge は検証済み SHA を入れるので、
  静かに相手の編集を巻き戻しうる）。
  **9/17 は両方が動く最初の日。**§5(d) を書くときは、直前に `git pull` して
  **その行だけを触る**こと（ファイル全体を書き直さない）。

## 検証したこと / していないこと（2026-09-03 実測）

**Chrome が要らない範囲は、実際に動かして確かめた。**

| | 結果 |
|---|---|
| 日次 Routine が Cowork 側に在るか | ✅ `trig_01GphcHzTuH1A1JUGq8dYkWa`「PR実験の D+14 取得（台帳駆動）」<br>`cron: 0 0 * * *`（09:00 JST）。**2026-09-03 に実際に発火させて確認**（下記「確かめ方」） |
| 二重転記の恐れ | ✅ 無し（`experiments.json` / `annotations.json` について）。<br>18本の Routine のプロンプトを突合し、この2つを書くのは D+14 の1本だけと確認。<br>⚠ ただし `data/autopilot-actions.json` は**別の1本と競合する**（下記） |
| **PR TIMES の分析画面** | ❌ **見ていない。**2026-09-03 に Cowork 側で空回しを2回起こしたが、<br>1回目は成果物を残さず、2回目は `WebFetch` の権限プロンプトで停止した（冒頭 ⛔）。<br>**項目名・単位・導線は依然として推定のまま。** |
| Routine が人待ちで止まらないか | ❌ **止まりうる。**`WebFetch` が `bypassPermissions` でもプロンプトを出す。<br>非決定的（1回目は起きず、2回目に起きた）。冒頭 ⛔ の回避策が要る |
| 門（`pr-evaluation-due.mjs`） | ✅ 9/16→0件 / **9/17→`pr-2026-rsi-autopilot` 1件** / 9/18→1件（超過1日）<br>今日は `[]` を返し「何もしないのが正しい」と言う |
| 手順書が raw で取れるか | ✅ HTTP 200・ローカルの `main` と `diff` で一致<br>（**バイト数は書かない** —— 数を書くと、その数を書いた時点で古くなる。<br>2026-09-03 に一度 `12,623 bytes` と書いて、その追記自体で 14,202 になった） |
| `annotations.json` の書式 | ✅ 仮の数値で書式どおりに書いたら **backtest が n=5 → n=6** になり、<br>戻すと n=5 に戻ることを確認。**§5(c) の書式は正しい** |

### Routine が Cowork 側か CCR 側かの確かめ方（**`list_triggers` では分からない**）

**`list_triggers` は `environment_id` を返さない。**2026-09-03 に18本すべてのキーを
突き合わせて確認した —— 返るのは `id` / `name` / `cron_expression` / `enabled` /
`created_via` / `creator` / `session_request` などで、**`environment_id` というキーは
そもそも存在しない。**したがって「一覧に env が出ていないから Cowork 側だ」とは言えない
（**出ていないのではなく、最初から返っていない**）。ここを混同すると、
CCR 側の Routine を「Chrome が付く」と誤読する。

**確実なのは、発火させて生まれたセッションを見ること:**

```
fire_trigger(trigger_id) → 返ってきた session_id を get_session
```

Cowork 側なら、こう出る（2026-09-03 の実測値）:

| 見るところ | Cowork 側（Chrome が付く） | CCR 側（付かない） |
|---|---|---|
| `environment_id` | `env_011111111111111111111117` | `env_01RmhZUdCQoTVYsGM6Ly45oP` |
| `tags` | `cowork-remote` / `cowork-scheduled` / `product:cowork-remote` | （無し） |
| `origin` | `force_run_trigger`（手動発火時） | `desktop_app` など |

**まだ実物に当たっていないのは1点だけ** —— **PR TIMES の分析画面そのもの。**
画面の項目名・単位・導線は推定のままで、初回はそこで調整が要る見込み。

### 空回しを2回やった結果（2026-09-03）—— **画面には届かなかった**

CCR から `fire_trigger` で日次 Routine を2回起こし、評価期限に関係なく
分析画面だけを見に行かせた。**どちらも画面まで届かなかったが、届かなかった理由が違う。**

| | 結果 | 分かったこと |
|---|---|---|
| 1回目<br>`session_0121RzvF1Lj26FGf2PuwVYW6` | 7分・25,395トークンで**正常終了** | だが**発火元に成果物が残らなかった** —— ブランチも PR も無く、<br>報告はトランスクリプトの中だけ。**CCR からは読めない**（→「黙って壊れる形」） |
| 2回目<br>`session_019a4CCzVD4bfBBsELeBiQgM` | **`REQUIRES_ACTION` で停止** | 手順書を `WebFetch` で読もうとして**権限プロンプト待ち**になった。<br>**Chrome より手前で止まった**（→ 冒頭 ⛔） |

**副産物として、routing は実証できた。**どちらのセッションも
`environment_id: env_011111111111111111111117` ＋ タグ `cowork-remote` で生まれた（n=2）。
**日次 Routine が Cowork 側へ行くことは、もう推定ではない。**

### ⚠ 初回が「本番の日」になる —— **まだ解消していない**

日次 Routine は 9/4 から回るが、**9/16 までは毎日 `[]` を返して何もしない。**
つまり **Chrome の経路が初めて試されるのは 9/17 ——「取れなければ困る日」その日**である。
上の空回しでも**分析画面までは届かなかった**ので、**この穴は開いたままである。**

**9/17 までに、もう一度空回しをすること。**次にやる人が同じところで詰まらないよう、
**今回詰まった2点は先に潰してある**:

1. **手順書は `WebFetch` で読まない**（冒頭 ⛔）—— クローンの中の `cat` で読む
2. **成果物は必ずブランチへ push させる** —— 「報告に書く」は発火元から読めない

この2つを指示に含めれば、次は画面まで届く見込み。届いたら §2・§3 を実物で書き直し、
この節と上の表を**「✅ 実物を確認（日付）」**へ差し替えること。

だからこそ §1 の ⛔ と §3 の「読めなかったものを埋めない」を先に置いてある ——
**この手順が外したときに、静かに嘘の数値が台帳へ入る形にはしていない。**
外した場合は「取れなかった」と報告して終わり、台帳は 9/18 以降も `days_overdue` を
数え続けるので、**黙って未評価のまま流れることはない。**
