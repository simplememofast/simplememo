# Codex への依頼：`data/routine-runs.json` の写し更新と整合（2026-09-22）

依頼元: SimpleMemo Developer（Cowork セッション側）。
照合基準: main `4f7b814e`。この依頼は **CI が赤いまま止まっているため**のものであり、
自律運転の成果点や実験成功には加算しない。

---

## 1. いま何が起きているか

**2026-09-22 05:14 UTC 頃から、`SEO Validation` が全PRで落ちている。**
落ちているステップは `Routine runs (副系が止まっていないか)`＝`scripts/check-routine-runs.mjs --check`。

```
副系の実行記録: 不整合
  - 写しが 3.2 日前で古い（上限 3 日） — **セッションが list_triggers を取り直すこと。**CIからは叩けない
```

`data/routine-runs.json` の `observed_at` は `2026-09-19T05:14:50.520Z`、
`max_snapshot_age_days` は 3。**3日を過ぎた瞬間に赤くなった。**

実害：`claude/` ブランチの auto-merge が止まる。
現在 [PR #1526](https://github.com/simplememofast/simplememo/pull/1526) がこれで待機している。

なお `seo-check.js` 自体は `0 errors / 1 warning`（llms.txt の stamp 期限切れ）で、
ワークフローは `exit 1` を warnings-only として許容しているので**そちらは原因ではない**。

---

## 2. こちらで試したこと（結果は戻してある）

`list_triggers` を取り直し、`--sync` を通した。

```
node scripts/check-routine-runs.mjs --sync <list_triggers の生JSON>
→ 写しを取り直した: routine 13 本 / observed_at 2026-09-22T10:28:07Z
```

**鮮度は直る。しかし直した瞬間に別の不整合が 10 件出る。**
そのため `git checkout -- data/routine-runs.json` で**元に戻してある。**
main は触っていない。

### なぜ戻したか

`open_budget` は `1`。`check-routine-runs.mjs` の設計意図は
「**open_findings の件数は open_budget を超えられない（新しい停止で赤くなる）**」であり、
budget を勝手に広げるのはこの見張りを無効化することになる。
また `intentional_stops` への追加は「止めた判断」を書く行為で、
**こちらは当時の意図を知らないため、推測で書けない。**

---

## 3. 取り直すと出てくる差分（実測）

`list_triggers`（`limit=100`, `include_completed=false`, `has_more=false`）は **13 本**を返す。
現在の写しは **17 本**。差は次のとおり。

### 3-1. 写しから消える 7 本（いずれも `enabled: false`）

| trigger id | 名前（先頭） | 現在の分類 |
| --- | --- | --- |
| `trig_018EyeYcJiVLFQeAHArMpGtM` | 【停止:クラウドでは動作不可→PCで再作成を】Reddit承認待ち監視 | intentional_stops |
| `trig_01GphcHzTuH1A1JUGq8dYkWa` | 【停止・ローカル版へ移行 09-05】PR実験の D+14 取得 v2 | intentional_stops |
| `trig_01RcUDUaFDf86KffssLRsQdw` | PR実験 D+14 転記の取りこぼし監視（網・通知のみ） | intentional_stops |
| `trig_01TixKQ5Sovfjfn8rRVQCrYf` | 【停止 2026-08-28・実測で不可】副系の写しの取り直し | intentional_stops |
| `trig_01VuJravpvATQPBuAigHCZJi` | 【停止 09-05 15:30 JST・v4.1-device に置換】x-engagement 夜19:30 v3.1 | intentional_stops |
| `trig_01XUeM9mCTkoqdWhUMac6jD1` | 【停止 09-05 15:30 JST・v4.1-device に置換】x-engagement 昼12:30 v3.1 | intentional_stops |
| `trig_01N1SWZdPwKTot2SbT71UV2U` | 伏字が実際の日次取り込みで効いたか確認（run_once_fired） | **open_findings（唯一の1件）** |

`--sync` 後、`--check` はこれらについて
「intentional_stops の trig_… は動いている」「open_findings の trig_… は健全になっている」
と報告する。**実体は「動いている」のではなく「一覧から消えた」**なので、
`diagnose()` が不在を健全と読んでいる可能性が高い。ここは Codex 側で確認してほしい。

**決めてほしいこと**：一覧から消えた routine を
(a) 台帳からも落とす／(b) `closed_findings` へ移す／(c) 不在として別扱いにする、のどれにするか。
`include_completed=true` で取り直せば戻るのかも、こちらでは未検証。

### 3-2. 新しく写しに入る 3 本

| trigger id | 名前 | 実測状態 | 備考 |
| --- | --- | --- | --- |
| `trig_01Fseho31MSgzsxuWZJqxvAm` | 被リンク掲載確認（申請中ディレクトリ・awesome系PR） | 2026-09-21 の定期実行が **FAILED**（fired 00:09:44Z → finished 00:09:48Z の **4秒**、`failure_reason: UNSPECIFIED`） | **2026-09-22 10:29 に手動発火したら PENDING で正常に走り出した。**一過性の可能性が高い。次の走行が SUCCEEDED なら健全に戻るので、findings に積む前にそれを待つのが安い |
| `trig_014e8va7SYk1UEfPuaqfHHrV` | 【空回し報告 2026-09-05】clone=OK｜push=NG(403)… | enabled=true・cron 無し・run_once_at 無し・`next_run_at` が `0001-01-01T00:00:00Z` | **poke-only（自分では発火しない）トリガー。**`next_run_at` が年 0001 なので overdue と判定されている。**これは検査側の取りこぼしではないか** |
| `trig_01Genu5KTKbe7fjvNXxVkC8r` | PR⑥ D+14 取得（2026-09-17・device版・Chrome必須） | enabled=false・run_once_at=2026-09-17T00:30:00Z・`last_fired_at: null`・`last_run: null` | 一度も発火しないまま対象日を過ぎて無効化されている。意図的だったかは不明 |

---

## 4. Codex にお願いしたいこと

### 4-1.（必須）写しを取り直して CI を緑に戻す

1. `list_triggers` を取り直し、`node scripts/check-routine-runs.mjs --sync <生JSON>` を通す。
2. `--check` が出す不整合を、**3-1 と 3-2 の分類方針を決めたうえで**解消する。
   - `intentional_stops` に足すなら、既存の書き方に倣って**「いつ・誰が・なぜ止めたか」を推測せずに書く**。
     分からないなら「分からない」と書いて今あらためて判断した旨を残す（`trig_01TRBdBgSA9646FS4LDQgJdt` の記述が手本）。
   - `open_budget` を上げるなら、**上げた理由を `$open_budget` に残す**。理由なしに広げない。
3. `node scripts/check-routine-runs.mjs --check` と `node scripts/seo-check.js` が通ることを確認して PR。

### 4-2.（要判断）poke-only トリガーの扱い

`trig_014e8va7SYk1UEfPuaqfHHrV` のように **cron も run_once_at も持たない**
（`fire_trigger` でしか動かない）トリガーは、`next_run_at` が `0001-01-01T00:00:00Z` になる。
現状の `diagnose()` はこれを overdue と読む。

- これが仕様なら、そのトリガーを `intentional_stops` 相当として恒久的に置く。
- 検査の取りこぼしなら、`diagnose()` に
  「cron も run_once_at も無いものは自発的には発火しない」判定を足す。
  **その場合は必ず `--selftest` にケースを追加すること**（この検査は
  「緩めない仕掛け」が売りなので、静かに緩めると意味が無くなる）。

### 4-3.（低優先）`trig_01Fseho31MSgzsxuWZJqxvAm` は先に1回様子を見る

2026-09-22 10:29 の手動発火が SUCCEEDED で終わっていれば、findings に積む必要はない。
`last_run.status` を見てから判断してほしい。

---

## 5. Codex には頼まないこと（人にしかできない）

- **`llms.txt` の「Current facts (as of 2026-08-22)」の期限切れ。**
  `stampDate()` が `appVersionNote` / `ratingNote` / `priceNote` の**最も古い検証日**を採るため、
  価格の所有者確認（2026-08-22）が全体を引っ張っている。
  バージョンと評価は 2026-09-20 に機械検証済み。
  **アプリ内課金の価格は iTunes Lookup で取得できず、所有者しか確認できない。**
  日付だけ進めるのは検証の捏造になるのでやらない。
  → 人が ¥500 / ¥5,000 が現行だと確認し、`priceNote` の日付を更新してから
  `node scripts/sync_constants.js --write`。
- **2026-09-22 に送信済みの4媒体への訂正連絡の要否**（→ `docs/seo/directory-registration-2026-09.md` §5.8）。
- **Mac Fan のプレスリリースフォームに入れる電話番号**を公開するか、メール送付に切り替えるか。

---

## 6. 補足：こちらの制約

このセッションは git proxy に `simplememofast/simplememo` が入っておらず **`git push` が 403**。
コミットは GitHub の web UI 経由で入れている（`/upload/<branch>/<dir>` に
`/mnt/user-data/outputs/` のファイルをアップロードする方法が確実）。
Codex 側で push できるなら、そちらで進めてもらったほうが速い。
