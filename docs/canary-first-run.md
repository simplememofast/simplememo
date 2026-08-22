<!-- fact-check: internal -->
# カナリアガードを本番で1周させる — 実行手順

**目的は機能を出すことではない。「機能側の本番改善サイクル完走 0件」を 1件にすること。**
主張検査で「循環」が 67% のまま埋まらないのは、コードの不足ではなく実績の不足による。

対象フラグ: **`tf04_progress`**（「今日 1/3」進捗表示）

選んだ理由:
- 既定 OFF。配布は**足す**方向で、外す方向ではない
- 元から A/B 用に作られたフラグで、出しても外しても壊れるものが無い
- UI の 1 要素だけ。ガードレール指標（起動完走率・送信成功率・到達率）への
  影響が観測できる程度には効き、事故になるほどではない

---

## 0. 先に直したもの（2026-08-22）

**この手順を組んでいて、段階公開が構造的に効かない欠陥が見つかった。**
既定 OFF のフラグは `/v1/config` が `flags` に `false` を載せて配るため、
クライアントが rollout を見る前に false で確定していた。
`FeatureFlagRollout.swift` の解決順序で rollout を繰り上げて修正済み。

**修正が入ったビルドが配信されていないと、この手順は何も起こさない。**
実行前に、対象ビルドが 2026-08-22 以降のものであることを確認すること。

→ **2026-08-22 23:35 UTC、v5.8.1 が `READY_FOR_DISTRIBUTION` になった**
（[run 32605632454](https://github.com/simplememofast/simplememo-ios/actions/runs/32605632454)）。
前提は満たされている。

---

## 0-2. 先に直したもの（2026-08-23）— **`max_stale_seconds: 3600` は誤り**

初版のこの手順書は §1 で `max_stale_seconds: 3600` を指定し、理由を
「kill は最長1時間で全端末に効く」と書いていた。**これは二重に誤っている。**

クライアントの実装（`../simplememo-ios/SimpleMemo/`）はこうなっている。

| | 値 | 出典 |
|---|---|---|
| 再取得のスロットル | **24時間** | `FeatureFlags.swift:394` `now - last > 24 * 60 * 60` |
| キャッシュ期限切れ | rollout の付与だけ失効 | `FeatureFlagRollout.swift` 解決規則 3 → 4 |

**1. kill は速くならない。** `killed` は取得して初めて端末に届く（規則2）。
`max_stale` を縮めても取得の間隔は変わらないので、**kill の到達は速くならない。**

**2. 露出群が露出しなくなる。** 規則3（rollout）は「キャッシュが新しい」ときだけ
効く。`max_stale 3600` だと1時間後に規則3を抜け、`/v1/config` が既定OFFとして
載せている `false` を規則4が拾って**フラグがオフに戻る**。次の取得は24時間後。

> つまり露出群は **24時間のうち1時間しか露出しない（約4%）。**
> その状態で貯めた install を「露出群」として対照群と比べても、
> **測っているものが露出ではない。**

`../simplememo/docs/canary-testflight.md` に同じ罠を書いていたが、
あちらは kill 実証の文脈だけで、**本番カナリアの手順は直っていなかった。**

**正しい値は `max_stale_seconds: 86400`**（再取得の間隔と揃える）。
その代わり kill の自然な到達は最長24時間かかる。これは縮められない事実であって、
数字を小さくして隠すものではない。

---

## 1. 定義する（0%）

```
Actions → Flag Ops → Run workflow
  action: set
  key: tf04_progress
  rollout: 0
  max_stale_seconds: 86400        ← 3600 にしない（§0-2）
  description: 今日 1/3 進捗表示のカナリア初回
```

0% で先に置くのは、**クライアント側が定義を受け取ってから配布を始める**ため。

## 2. 1% に上げる — **ここは人が押す**

```
Actions → Flag Ops → Run workflow
  action: set
  key: tf04_progress
  rollout: 1
  max_stale_seconds: 86400
  description: 今日 1/3 進捗表示のカナリア初回（1%）
```

**ここから待つ。** クライアントの取得は24時間スロットルなので、
配布が行き渡るまで丸1日はかかる。

`data/authority-matrix.json` の「段階公開の拡大」は
`requires_approval: true` / `human_only: ["rollout を引き上げる操作そのもの"]`。
**0 → 1 は引き上げなので、ここだけは AI が叩かない。**

## 3. 判定を見る

```
Actions → Flag Ops → Run workflow
  action: guard
```

`GET /admin/rollout-guard` と、**ガードの cron 実行ログ**
（`/admin/cron/recent?job_name=rollout_guard`）を並べて出す。

毎時 cron で回っている。最初は必ず `hold` になる。

> **`last_run_at: null` を「cron が動いていない」と読まないこと。**
> 段階公開中のフラグが無い間、ガードは KV を1回読んで
> `reason: no_staged_flags` で終わり、**判定履歴を残さない**。
> そのため `/admin/rollout-guard` だけを見ると「一度も走っていない」に見える。
> 実際に走っているかは cron 実行ログでしか区別できない。
> `action: guard` が両方出すのはこのため。
>
> 2026-08-22 23:38 UTC の実測: `rollout_guard_runs=8`・
> 直近は 23:00:09 UTC・すべて `errors: 0` / `reason: no_staged_flags`。
> **cron は生きている。**

| 見えるもの | 意味 |
|---|---|
| `hold` ＋「サンプル不足」 | **正常。**各群30 install 必要。1%では届かない |
| `hold` が5回 | `escalate`。露出が小さすぎるので 5% へ上げる判断 |
| `kill` | ガードが自分で止めた。**これが観測できたら目的達成** |
| `promote` | 悪化なし。承認待ちとして積まれる（**自動では上がらない**） |

## 4. サンプルが貯まるまで上げる

`escalate` が出たら 5% → 10% と上げる。**1段ずつ。**
`ROLLOUT_STEPS` は 1 / 5 / 10 / 25 / 50 / 100。

各群30 install に届くまでは何も判定できない。**「判定していない」を
「異常なし」と読まないこと** — ガードはそう表示しないので、
その通りに読めばよい。

## 5. 完走の条件

次のどちらかが観測できたら 1周とする。

- **`kill` が自動で実行された**（`executed: true`・履歴の `actor` が `rollout-guard`）
- **`promote` の提案が出て、人がそれを承認して rollout を上げた**

どちらも「検知 → 判断 → 実行 → 検証 → 継続/撤回」を一度通ったことになる。

## 6. 記録する

完走したら:

1. `data/autopilot-runs.json` に run を追加（`run_id` = `ap-<YYYYMMDD>-<route>`）
2. `data/automation-coverage.json` の
   「本番改善サイクルの完走（機能側）」を `nobody` から動かす
3. `node scripts/check-pr-claims.mjs` で「循環」が 100% になることを確認

---

## 実測（2026-08-23）— どこまで進んだか

| 手順 | 状態 | 証跡 |
|---|---|---|
| 0. v5.8.1 が本番公開 | ✅ | `READY_FOR_DISTRIBUTION`・[run 32605632454](https://github.com/simplememofast/simplememo-ios/actions/runs/32605632454) · 23:35 UTC |
| ガードの cron が生きている | ✅ | `rollout_guard_runs=8`・直近 23:00:09 UTC・`errors: 0`／[run 32605768031](https://github.com/simplememofast/simplememo-api/actions/runs/32605768031) |
| 1. 定義（rollout 0 / max_stale 86400） | ✅ | [run 32605886195](https://github.com/simplememofast/simplememo-api/actions/runs/32605886195) · 23:41 UTC |
| **2. 1% に上げる** | ⏸ **人待ち** | 承認境界（`data/authority-matrix.json`） |
| 3. 判定を見る | — | 配布後 |
| 4. 段階的に上げる | — | 人 |
| 5. 完走の記録 | — | |

**1 の時点では誰にも配っていない**（rollout 0）。定義を置いただけ。

### 2 を実行するときのコマンド

```
Actions → Flag Ops → Run workflow
  action: set
  key: tf04_progress
  rollout: 1
  max_stale_seconds: 86400
  description: 今日 1/3 進捗表示のカナリア初回（1%）
```

押したあと、丸1日は `hold`（サンプル不足）が続く。**それは正常。**

---

## やってはいけないこと

| | 理由 |
|---|---|
| **いきなり 100% にする** | それは段階公開ではない。対照群が消えるのでガードが何も判定できなくなる |
| **サンプル不足を「異常なし」と読む** | ガードは `hold` としか言っていない。判定していないだけ |
| **`promote` を自動で上げるように変える** | 露出を広げる方向は不可逆（見た人は見なかったことにならない）。承認境界は `data/authority-matrix.json` にある |
| **急いで `rollout` を 0 に戻す** | 緊急停止は `kill`。0 に書き換えると元の配布率が消える |

---

## この手順を AI だけで完了できない理由

`data/authority-matrix.json` の「段階公開の拡大」は
**不可逆・承認制・人間のみ**に分類してある。

| 手順 | 誰が | なぜ |
|---|---|---|
| 1. 定義（rollout 0） | **AI可** | 0% は誰にも配らない。引き上げではない |
| **2. 1% に上げる** | **人のみ** | **0 → 1 は引き上げ。不可逆（見た人は見なかったことにならない）** |
| 3. 判定を見る | AI可 | 読み取りのみ（`action: guard`） |
| **4. 5% / 10% と上げる** | **人のみ** | 同上 |
| kill | AI可 | 止める方向は可逆。`requires_approval: false` |
| 5. 記録 | AI可 | |

**この非対称は意図的。** 逆にすると、誤検知が「勝手に全員へ配る」形で出る。
