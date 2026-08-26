# 停止訓練の手順 — 本番で「止まる」ことを確かめる

> 台帳: `data/stop-drills.json` ／ 検査: `node scripts/check-stop-drills.mjs --check`
> 2026-08-26 時点 — 止める仕組み **11件**、本番で止まることを確かめたのは **0件**（local まで 6件）

**「実装した」と「止まることを確かめた」は別の主張。**後者だけが停止機構の存在証明になる。
このリポジトリの停止機構はどれも単体テストを持っているが、**単体テストは「止まる」の証明ではない。**

---

## 1. いま一手で 0/11 → 1/11 にできるもの: `flag-kill`

**AIはこれを実行しない。**本番のフラグを引く操作は利用者の手元に影響が出るので、
権限表の「止める側だから自律でよい」の例外にあたる。以下はオーナーが実行する手順。

### 前提

- `ADMIN_API_KEY`（本番 relay の管理トークン）
- 本番 relay の URL

### 手順

```bash
API=https://<本番relayのホスト>
KEY=<ADMIN_API_KEY>

# [0] 現在の max_stale_seconds を確認する（次の手順で使う）
curl -s "$API/v1/config" | jq '{killed, max_stale_seconds}'
#   → 例: {"killed": [], "max_stale_seconds": 86400}

# [1] 訓練用フラグを作る。**max_stale_seconds は [0] の値と同じにする。**
#     短い値を付けると、誰も読まないフラグでも全クライアントの再取得間隔が縮む
#     （2026-08-26 のローカル訓練で観測 — 86400 が 300 に落ちた）。
curl -s -X POST "$API/admin/flags/set" \
  -H "authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"key":"drill_kill_probe","definition":{"rollout":100,
       "description":"停止訓練用。クライアントは一切読まない。kill が届くことの確認だけに使う",
       "max_stale_seconds":86400}}' | jq '{ok, key}'

# [2] /v1/config に載ったことを見る（killed は空のはず）
curl -s "$API/v1/config" | jq '{rollouts, killed, max_stale_seconds}'

# [3] kill を引く ← **これが訓練の本体**
curl -s -X POST "$API/admin/flags/kill" \
  -H "authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"key":"drill_kill_probe"}' | jq '{ok, key, killed}'

# [4] killed に入り、rollout が保存されたままであることを見る
curl -s "$API/v1/config" | jq '{rollouts, killed, max_stale_seconds}'
#   期待: killed に "drill_kill_probe"、rollouts の値は 100 のまま

# [5] 後片づけ — フラグごと消す
curl -s -X POST "$API/admin/flags/set" \
  -H "authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"key":"drill_kill_probe","definition":null}' | jq '{ok, key}'
curl -s "$API/v1/config" | jq '{rollouts, killed, max_stale_seconds}'
#   期待: [0] と同じ状態に戻る
```

### 記録のしかた

`data/stop-drills.json` の `flag-kill` の `drills` に1件足し、`blocked_by` を `null` にする。

```json
{ "at": "YYYY-MM-DD", "level": "production", "by": "human",
  "where": "本番 relay",
  "observed": "[4] で killed に drill_kill_probe が入り、rollouts は 100 のまま。[5] で元に戻った。…" }
```

`observed` に**実際に見た値を書く。**「実行した」は観測ではない（検査が落とす）。
`production` が1件になると `production_verified` の宣言もずれるので、そこも直す
（検査が実測と突き合わせて落とす）。

---

## 2. 本番で確かめられないもの、とその理由

| 仕組み | いまの段階 | 本番で確かめられない理由 |
|---|---|---|
| `rollout-guard-kill` / `rollout-guard-freeze` | unit | **段階公開中のフラグがゼロなので、発火する対象そのものが無い。**フラグを1つ段階公開に載せた時点で初めて発火しうる |
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
