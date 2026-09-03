# PR TIMES の D+14 数値を、機械で取りに行く

**この文書は Routine から `raw.githubusercontent.com` 経由で読まれる正典。**
手順の本体はここにあり、Routine のプロンプトは薄く保つ
（`x-engagement-simplememofast` が `SKILL.md` を正典にしているのと同じ形）。

    https://raw.githubusercontent.com/simplememofast/simplememo/main/docs/prtimes-d14-capture.md

---

## なぜ要るか

PR リリースの乗車判定（`growth/experiments/experiments.json` の `type: pr_release`）は
**5つの数値のうち3つが PR TIMES のログイン後の分析画面にしか無い。**
2026-09-03 まで、この転記は人の作業として台帳に積まれていた。

**積んでいた理由は「機械に無理」ではなく「その環境に Chrome が無い」だった。**
主系（GitHub Actions）と代走（Claude Code Remote）は egress が絞られていて
`prtimes.jp` に届かない —— 実測で `HTTP 000`、`google.com` も同じなので
**外向きが全般に閉じている**（許可先は自社ドメインと API のみ）。

一方 `note-simplememo-3days` / `x-engagement-simplememofast` /
`indie-hackers-karma-daily` は **Claude-in-Chrome MCP** でログイン済み Chrome を
毎日動かしている。**同じ経路なら PR TIMES の分析画面も読める。**
この文書はその経路に載せるための手順。

---

## 対象

`growth/experiments/experiments.json` の `type: "pr_release"` かつ
`status: "running"` かつ `evaluation_at` が当日以前のレコード。

2026-09-17 時点の対象は `pr-2026-rsi-autopilot`（PR⑥・2026-09-03 配信）。
リリース URL は `annotations.json` の同日の `note` にある
（`https://prtimes.jp/main/html/rd/p/000000009.000182412.html`）。

---

## 手順

### 0. 先に台帳を読む。**埋まっていたら何もしない。**

`discover_boarding_post` が既に `null` でない（＝誰かが転記済み）なら、
**上書きしない**で終了する。二重転記は「あとから入った値がどちらか分からない」状態を作る。

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

1. `navigate` で PR TIMES の管理画面へ入り、対象リリースの**分析／アナリティクス**を開く
2. `get_page_text`（必要なら `read_page`）でページ本文を取る

> **DOM セレクタを書かない。**画面が変われば静かに壊れ、壊れたことに気づけない。
> **本文テキストからモデルが読む。**他の3スキルと同じ方式。

### 3. 5つの数値を読む

| フィールド | 何を読むか |
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
プロンプトはこの文書を指すだけでよい:

```
PR⑥（実験 id pr-2026-rsi-autopilot）の D+14 乗車判定を行う。
手順の正典はここ。まず読むこと:
https://raw.githubusercontent.com/simplememofast/simplememo/main/docs/prtimes-d14-capture.md
Chrome が繋がっていなければ数値を作らず、取れなかったと報告して終わること。
```

CCR 側に作ってある `trig_01UyxxNpMNp7ecsBycR2xYqz`（9/17）は**取得できない見込みの控え**で、
Chrome が無ければ手順と転記先をオーナーへ push/email して終わる。
Cowork 側で作り直したら、そちらは削除してよい。

---

## この手順が黙って壊れる形（先に書いておく）

- **Chrome が繋がっていないのに「0件だった」と書く** —— 最悪。§1 の ⛔ がこれを止める
- **画面の % をそのまま入れる**（`mobile_ratio: 62` と `0.62`）—— 判定式は 0〜1 前提
- **`annotations.json` の書式を守らず backtest が拾わない** —— §5(c) の検算で分かる
- **二重転記** —— §0 のガードで止める

## 検証していないこと

**2026-09-03 時点で、この手順は一度も実行されていない。**
書いた代走セッション（CCR）は Chrome ツールを持たず、`prtimes.jp` にも届かないため、
**分析画面の実物を一度も見ていない。**画面の項目名・単位・分析画面への導線は
**実物に当たっていない推定**であり、初回はそこで調整が要る見込み。

だからこそ §1 の ⛔ と §3 の「読めなかったものを埋めない」を先に置いてある ——
**この手順が外したときに、静かに嘘の数値が台帳へ入る形にはしていない。**
