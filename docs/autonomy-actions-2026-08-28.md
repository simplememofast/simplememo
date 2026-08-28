# 自律度を上げに行って、上がらなかった記録（2026-08-28 夕）

「バナーは目標として据え置き、施策で実測を上げる」という指示で着手した。
**総合自動化率は 65.8% のまま動いていない。**動かせなかったのはなぜかと、
代わりに何が確定したかを残す。

## 何をやったか

`node scripts/autonomy-gap.mjs --plan` が出す「安い順」の先頭から、
**この環境（iOS実機なし・Mac なし・外部鍵なし・外向き取得はポリシーで遮断）で
完遂できるもの**を探し、候補を1件ずつ実際に叩いた。

| 群 | 件数 | 叩いた結果 |
|---|---:|---|
| `vendor_terms` | 2 | **実装では動かない。**取り込みと改定検知は 2026-08-26 に機械へ移済み。2行の note が「本文を読んで ok / risk を決めるのは法的判断で、そこは人のまま」と明記していた |
| `impl_machine_gate` | 9 | 門は書けるが**実行側が別リポジトリ**。#708 が App Review / App Store 公開の門を出荷したが、**台帳の行は1つも動いていない**（設計どおり） |
| `impl_routine_snapshot` | 1 | **作って回した。**下記 |
| `refund_observe` | 1 | **実装は既に完了していた。**下記 |
| `impl_qa` / `impl_backlog` | 2 | テストを減らす方向は破壊的で、権限表の非対称では提案止まり。バックログ側は利用データ待ち |

## 確定したこと1 — 副系の写しの取り直しは、Routine 側の壁で止まる

⑩「実行の完全記録（副系）」の残件は「写しを取り直す経路」だけだった。
`docs/reaching-85-audit-2026-08-28.md` は 8/28 朝に
「この環境から `create_trigger` で作った Routine には `sources` も MCP connector も
付かず」と書いていた。**作って、1回走らせて確かめた。**

- **`sources` 側は誤りだった。**`environment_id` を明示すれば
  `env_01RmhZUdCQoTVYsGM6Ly45oP` が `job_config.ccr` に入る。
  朝の結論は**環境IDを渡さなかった場合**の話。
- **MCP connector 側は正しかった。**作成時に警告が返る
  （"this trigger stores no MCP connectors … will run without connector tools"）。
  `session_context.allowed_tools` にも `mcp__*` は1つも無い。
- 実走（`cse_015iYEg3GrcfQ2A55jv9aZD1`・3分35秒・$0.83）は **SUCCEEDED** で終わり、
  **ブランチもPRも作られなかった** —— 「`list_triggers` が呼べなければ何も書かずに
  報告して終われ」と渡した経路と一致する。

**Routine は削除した。**日次で失敗し続け、`routine-runs.json` の未対応枠
（`open_budget` 2）を食うため。

残る未検証の面は1つ、**claude.ai の Routines UI から作れば connector を持てるか**。
警告文が案内している唯一の道で、そこはオーナーの画面操作。
**叩いていないので `never` へは落としていない。**

## 確定したこと2 — 台帳が自分の出荷に追いついていなかった（2行）

`measured_at` は 08-26 だが、**08-28 だけで 22 本が main に入っている。**

**⑨ 返金の検出** … `blocker: not_started` だったが、残件として書いてあった2つは
どちらも済んでいた。受け口→検証器の配線は `src/apple-asn.ts`（api#193・main）、
保持は `apple_refund_events` が `data-retention.json` に載り migration 0028 ／
`refund_retention` cron ／ `REFUND_RETENTION_DAYS=180` ／ `/admin/refunds` まで入っている。
通知URLも設定済み（`notification_url_configured: true`・Apple のテスト配信が SUCCESS）。
→ `verification_pending`。**残るのは実際の返金が1件届くことだけ。**

**④ 段階公開への自動昇格** … 同じく残件2つとも済み。実行側は api#190、
`auto_promote.enabled` は 08-28 にオーナーが委譲してAIが立てた
（読み取り専用の実機確認で門は `hold / 自動昇格が有効になっていない` を返しており、
**止めていたのはこのフラグだけだった**）。
→ `verification_pending`。**残るのは門が実際に1件通ること。**

**どちらも executor は動かしていないので、率は 1pt も動かない。**
直したのは「着手していない」という事実誤認のほう。

## 確定したこと3 — `--plan` が「作れば進む」と嘘をついていた（2群）

上の調査で、`UNLOCKS` の種別が実態とずれている群が2つ見つかった。
**害は件数ではなく向きに出る** —— 既に在るものを作る計画が、毎回上位に並ぶ。

| unlock | 旧 | 新 | 理由 |
|---|---|---|---|
| `refund_observe` | `implement` | **`wait`** | 作るものが無い。返金が1件届けば済む |
| `vendor_terms` | `implement` | **`owner_input`** | 取り込みは機械済み。読んで判断するのは人 |
| `impl_routine_snapshot` | `implement` | **`owner_input`** | Routine は MCP を持てない（上記実測） |

結果、**0円で待てば来る枠が 4件 → 5件（68.3%）**になり、
実装で動く群だけが `[実装]` に残った。

## いま効く一手（安い順）

1. **待つ** — BQ 28日窓（~9/6）／収入28日窓（~9/19）／返金1件。
   **131 → 136 / 199 = 68.3%。実装ゼロ。**
2. **claude.ai の Routines UI で「副系の写しの取り直し」を作る**（オーナー・数分）。
   通れば ⑩ が動き、通らなければ `structural` へ落とす根拠が揃う。
   プロンプトはこの調査で書いたものがそのまま使える（削除した Routine の本文）。
3. **10社の規約を読んで40マスを埋める**（オーナー）。埋めたら
   `policy.enforce_unreviewed` を true にすると CI が守る。⑦の2行が動く。

## 反省

**`--plan` の並びを能力の見積もりに使うと、また同じところに着く。**
`docs/implementable-27-audit-2026-08-28.md` が「分類名を能力の見積もりに使うと
2回同じ結論に着く」と書いた翌日に、**3回目をやりかけた。**
今回違ったのは、候補を読むのをやめて**実際に作って走らせた**ところだけで、
それで初めて `environment_id` が引き継がれることと `mcp__*` が引き継がれないことが分かれた。
