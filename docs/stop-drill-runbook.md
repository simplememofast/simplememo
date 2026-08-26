# 停止訓練の手順 — 本番で「止まる」ことを確かめる

> 台帳: `data/stop-drills.json` ／ 検査: `node scripts/check-stop-drills.mjs --check`
> 2026-08-26 時点 — 止める仕組み **11件**、本番で止まることを確かめたのは **1件**（local まで 5件）
>
> **[2026-08-26 訂正] §1 の訓練は実施しない。**flag-kill は 2026-08-22 に本番で実証済みだった
> （`/admin/flags` の history に `tf04_progress` の作成 → kill → 解除 →「kill の実証完了」が残っている）。
> **この手順書を書いた時点で、実物を一度も叩いていなかった。**§1 は手順の記録として残すが、
> もう一度やるのは本番設定を無意味に触るだけなので実施しない。

**「実装した」と「止まることを確かめた」は別の主張。**後者だけが停止機構の存在証明になる。
このリポジトリの停止機構はどれも単体テストを持っているが、**単体テストは「止まる」の証明ではない。**

---

## 1. `flag-kill` の本番訓練（**実施済み・再実施しない**）

**AIはこれを実行しない。**本番のフラグを引く操作は利用者の手元に影響が出るので、
権限表の「止める側だから自律でよい」の例外にあたる。以下はオーナーが実行する手順。

> **[2026-08-26 訂正] 鍵は要らない。**この節は当初 curl と `ADMIN_API_KEY` を前提に
> 書いていたが、**`simplememo-api` に `Flag Ops` ワークフローが既にあった。**
> 鍵は GitHub Secrets にあり、手元に持っている必要はない。
> **手順書を書く前に、既にある経路を探していなかった。**

### 場所

`simplememofast/simplememo-api` → **Actions** → **Flag Ops** → **Run workflow**

操作のたびに workflow run が1本残る（誰が・いつ・何を・どの値にしたか）。
手元の shell から叩くと残らないもの。

### 手順（Run workflow を5回）

| # | action | 入力 | 見るもの |
|---|---|---|---|
| 0 | `diagnose` | — | `✅ ADMIN_API_KEY は見えている` と指紋。**401 の履歴があるので最初にこれ** |
| 1 | `list` | — | 現状（baseline）。`killed` が空であること。**何かが既に kill されているなら訓練しない** |
| 2 | `set` | key=`drill_kill_probe` / rollout=`100` / max_stale_seconds=`86400`（既定のまま） / description=`停止訓練用。クライアントは一切読まない` | HTTP 200 |
| 3 | **`kill`** | key=`drill_kill_probe` | **これが訓練の本体。**HTTP 200 |
| 4 | `list` | — | `drill_kill_probe` が `killed` に入り、**`rollout` は 100 のまま**であること |
| 5 | `delete` | key=`drill_kill_probe` | 後片づけ。`list` で消えていること |

**`max_stale_seconds` は既定の 86400 から下げない。**下げると、誰も読まないフラグでも
`/v1/config` 全体の `max_stale_seconds` がその値まで落ち、全クライアントの
再取得間隔が縮む（2026-08-26 のローカル訓練で 86400 → 300 に落ちるのを観測）。
ワークフロー側の既定が 86400 なので、**触らなければ正しい。**

> **`delete` は 2026-08-26 に足したもの**（`claude/simplememo-self-improving-pr-ki8vgo`）。
> main にマージされるまでは、Run workflow の「Use workflow from」でそのブランチを選ぶ。
> マージ後は既定のままで出る。それも面倒なら手順5を `unkill` → `set rollout=0` で
> 代用できる（フラグは残るが、誰にも配られない）。

### 確かめていること

- kill が `/v1/config` の `killed` に載る（＝端末に届く形になる）
- **`rollout` が保存されたまま**残る（kill を降ろせば元の配布率に戻る）
- 端末に届くまでの時間がワークフローの要約に出る
  （CDN 最大300秒 ＋ 端末キャッシュ最大 86400 秒 ＋ 再取得は24時間スロットル）

**すぐ見たい端末はアプリを入れ直す。**スロットルは端末側にあり、サーバからは短縮できない。

### 終わったら

`data/stop-drills.json` の `flag-kill` に1件足し、`blocked_by` を `null` にする。

```json
{ "at": "YYYY-MM-DD", "level": "production", "by": "human",
  "where": "本番 relay（Flag Ops workflow run #<番号>）",
  "observed": "手順4の list で killed に drill_kill_probe が入り、rollout は 100 のまま。手順5の後は list から消えた。…" }
```

`observed` には**実際に見た値を書く。**「実行した」は観測ではない（検査が落とす）。
`production` が1件になると `production_verified` の宣言もずれるので、そこも直す
（検査が実測と突き合わせて落とす）。**run の番号を残せば、あとから誰でも中身を確かめられる。**

セッションに「Flag Ops の run #N を見て台帳に入れて」と言えば、そこは機械側でやる。

## 2. 本番で確かめられないもの、とその理由

| 仕組み | いまの段階 | 本番で確かめられない理由 |
|---|---|---|
| `rollout-guard-kill` / `rollout-guard-freeze` | unit | **[訂正] 段階公開は動いている** —— `tf04_progress` が 5%（08-23 に 1% → 08-25 に 5%）。ガードも毎時走っている（decisions 30件）。発火しない理由は**サンプル不足**で、3指標とも「サンプル不足（露出 12 / 対照 236 < 30）。判定していない（異常なしではない）」。露出を上げるのは承認要（domain 16） |
| `emergency-stop-all` / `emergency-stop-agent` | local | 立てるとその日の主系が止まる。**止まること自体は本番と同じ式で観測済み** |
| `budget-gate` | local | 当月の実費が上限に達していない。**到達を待つ性質のもので、作りに行くものではない** |
| `release-preflight` | unit | 赤いコミットで出荷しようとした機会が無い。機会を作りに行くものではない |
| `auto-merge-verified-sha` | static | 検証が落ちるPRがまだ出ていない。**直近30件のPRは全部マージされている＝止められた回が0件** |
| `marketing-stoploss` | local | 判定は実データで1回出たが（誤検知）、**revert を実行したことは無い** |
| `credential-revocation` | static | 失効操作は各社コンソールへのログインが要り、機械からは行えない |

**「まだ」は理由ではない。**上の表の右列が空になった仕組みは、検査が落とす。

---

## 3. 訓練を増やすこと自体は目的ではない

止める対象が本番に存在しないうちに訓練しても、確かめられるのは配線までで、
**止まったことにはならない。**`rollout-guard` の2件がそれで、
段階公開を1つ始めるまでは unit 以上に上がらない。

この台帳が持っているのは「確かめていない」を「確かめた」に見せない、という一点だけ。
