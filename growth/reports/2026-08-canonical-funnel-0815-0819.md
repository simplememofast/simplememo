# 正史ファネル 2026-08-15..19（内部除外あり）— 雛形・未実行

**状態: 🔲 未実行（TODO）** — 本レポートは2026-08-20に雛形として作成した。
実行条件は【実行日が2026-08-27以降】であること（D7が censored でなくなる最短日）。
実行できるのは ADMIN_API_KEY 保持者＝オーナーのみ。

## なぜこの再取得が要るか（v4 R12-1）

v4計画（docs/GROWTH_ROI_PLAN_2026-08-20.md）のファネル数値は
`--include-internal` の**生値**（新規100・活性58/58%・first send音声77%など）で、
①内部端末の混入があり得る ②全日D7がcensoredで未確定、の2点で正史にできない。
本書の値が確定するまで、生値を確定値として引用してはならない（v4 冒頭注意）。

この正史値が確定すると解禁されるもの:
- /data/voice-shift/ の初回集計（growth/queries/voice-shift-90d.md）
- /blog/obsidian-voice-fastest-route の利用実態TODOブロック
- 「新規の6割が当日中に最初のメモを送る」型の対外コピー（v4 §5-5 🟡→⭕、期間と定義併記）

## 実行手順（オーナー・所要10分）

```sh
cd simplememo-api

# 1) 正史ファネル（内部除外は既定ON — --include-internal を付けないこと）
ADMIN_API_KEY=... npm run analytics:funnel -- --from=2026-08-15 --to=2026-08-19 \
  > /tmp/funnel-0815-0819-canonical.json

# 2) 8/18流入コホートのD7（PR経由ユーザーの質の初観測・v4 R12-4）
ADMIN_API_KEY=... npm run analytics:cohort -- --from=2026-08-18 --to=2026-08-18 \
  > /tmp/cohort-0818.json
```

出力から下の表へ転記し、**状態行を「✅ 実行済み（実行日）」に書き換える**。
JSONそのものは growth/data/research/ に `funnel-0815-0819-canonical.json` として保存する。

## 結果（転記欄 — 実行までTODO）

| 指標 | 生値（--include-internal・v4 §1） | 正史（内部除外あり） |
|---|---:|---:|
| 新規install | 100 | TODO |
| memo_editor_viewed | 96 | TODO |
| memo_text_started | 68 | TODO |
| send_button_tapped | 63 | TODO |
| 宛先確定 | 56 | TODO |
| 活性（24h内 resolved） | 58/93 = 62.4%（生） | TODO |
| first send 入力方法: 音声比率 | 77%（48/62） | TODO |
| **sender_retention_d7（resolved初値）** | 未確定（全日censored） | TODO |
| 内部除外の内訳（configured / resolved） | — | TODO |

| 8/18流入コホート | 値 |
|---|---:|
| 8/18 新規install数 | TODO |
| D7（9月頭に確定） | TODO |

## 転記後にやること

1. 生値と正史の乖離を1行で判定（既知内部端末は窓内0解決の見込み＝乖離小の予想。
   予想と違ったら理由を書く）
2. /data/voice-shift/ と /blog/obsidian-voice-fastest-route のTODOブロックを
   正史値で更新（窓・n・定義併記。growth/queries/voice-shift-90d.md §5の手順）
3. growth/data/annotations.json への追記は不要（8/15-19窓の配信・リリースは登録済み）
4. v4本文 §9-1 の「再取得までは約を付けて扱う」注意を、この正史レポートへの参照に
   差し替える（v4正本のあるブランチで）
