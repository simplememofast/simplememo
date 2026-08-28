# 副系の写しを自動で取り直す — claude.ai の Routines UI から作る

⑩「実行の完全記録（副系）」の最後の一歩。**残っているのはこの画面操作1回だけ**で、
実装側（`scripts/check-routine-runs.mjs` の検査と `--sync`）は既に本番に在る。

## なぜ UI から作る必要があるのか（2026-08-28 に実測）

セッションの `create_trigger` で作った Routine では**動かない。**
実際に作って1回走らせて確かめた:

| 引き継がれるか | |
|---|---|
| `environment_id` | **引き継がれる。**明示すれば `job_config.ccr` に入る（sources も付く） |
| `mcp__*`（connector） | **引き継がれない。**作成時に警告が返り、`allowed_tools` にも1つも無い |

写しの取得に要る `list_triggers` は `mcp__Claude_Code_Remote__*` なので、
**Routine 側からは呼べない。**実走（`cse_015iYEg3GrcfQ2A55jv9aZD1`）は SUCCEEDED で
終わったが、ブランチもPRも作られなかった。作った Routine は削除してある
（日次で失敗し続け、`data/routine-runs.json` の `open_budget` を食うため）。

作成時の警告が案内する道は1つ:

> If the routine needs connectors, create it from a session that holds them,
> **or ask the user to create it from the claude.ai routines UI.**

**この面はまだ叩いていない。**だからこの行は `never` ではなく `owner_input`。

## 手順

1. claude.ai → Routines → 新規作成
2. 環境: **`env_01RmhZUdCQoTVYsGM6Ly45oP`**（副系A/B・再試行と同じ。3リポジトリの sources が付く）
3. スケジュール: **毎日 12:00 JST（`0 3 * * *` UTC）**
   朝の群（06:00 主系 → 07:30 副系A → 08:30 副系B → 09:00 act → 09:20 再試行）が
   終わったあとなので、その日の発火まで写しに入る。
   鮮度の上限は3日（`max_snapshot_age_days`）なので、**1回落ちても赤くならない。**
4. 下のプロンプトをそのまま貼る

## プロンプト（そのまま貼る）

```
副系（スケジュール起動セッション）の実行記録の写しを取り直す。これだけをやって終わる。記事は書かない。

手順:

1. `simplememo` リポジトリで作業する。ブランチ名は `claude/routine-snapshot-<YYYYMMDD>`。
   **`claude/obsidian-auto-<date>` は絶対に使わない**（Runbook §0-2 の当日占有ロックで、
   これを取ると主系・副系が「今日は実行済み」と誤判定してその日の記事が丸ごと落ちる）。

2. MCP の `list_triggers`（claude-code-remote）を limit=50 で呼ぶ。
   **出力は大きくツール結果がファイルパスを返すことがある。その場合は中身を読まず、
   返ってきたパスをそのまま次の手順に渡す**（生JSONのまま渡すのが正しい入力）。
   ファイルに落ちなかった場合だけ、出力を一時ファイルに書いてそのパスを使う。

3. `node scripts/check-routine-runs.mjs --sync <生JSONのパス>` を実行する。
   これは写しだけを取り直し、判断（open_findings / intentional_stops / open_budget）には触らない。

4. `node scripts/check-routine-runs.mjs --check` を実行する。

   - 緑なら 5 へ。
   - **赤なら、勝手に open_findings や open_budget を書き換えて緑にしない。**
     赤の原因は「前回から新しく止まった／失敗した副系がある」か「直った行が
     open_findings に残っている」のどちらか。前者なら open_findings に
     id / what / found_at / why を足す（why には last_run.session_id を
     `get_session` に渡して分かった理由まで書く。分からなければ「未確定」と書く）。
     後者なら直った行を落とす。**open_budget は上げない。**上限に当たったら
     上げずにPR本文へ「上限に当たった」と書いて人に渡す。

5. `git status --porcelain` が空なら、PRは作らず「変更なし」とだけ報告して終わる。
   写しの observed_at だけが動いた回も、鮮度検査の対象なのでコミットする。

6. 変更があれば commit して `git push -u origin <ブランチ>`、そのあとPRを作る。
   タイトル: `chore(routine): 副系の写しの取り直し（<YYYY-MM-DD>）`
   本文には --check の出力をそのまま貼る。SEO Validation が通れば auto-merge が入れる。

やらないこと: 記事の執筆、他の台帳の編集、Routine の作成・削除・停止、
`qa-ios.yml` の dispatch（macOSランナーは禁止）。
```

## 通ったかどうかの見分け方

**作った翌日以降に見る。**

| 見るもの | 通った | 通らない |
|---|---|---|
| `data/routine-runs.json` の `observed_at` | 前日より新しい | 手で取った日のまま動かない |
| PR一覧 | `chore(routine): 副系の写しの取り直し` が来る | 来ない |
| Routine の `last_run` | SUCCEEDED **かつ**上の2つが動く | SUCCEEDED だが何も出ない（＝MCPが無い側） |

**`last_run: SUCCEEDED` だけを根拠にしないこと。**MCPを持たないセッションも
「呼べないので何も書かずに終わる」と SUCCEEDED で終わる —— 2026-08-28 の実走が
まさにその形だった。

## 通らなかったときにやること

`data/automation-coverage.json` の ⑩ の行を `structural`（構造的に観測できない）へ落とし、
`impl_routine_snapshot` を `UNLOCKS` から外す。**そのときは根拠が揃っている** ——
セッションの `create_trigger` と UI の両方を叩いて、どちらも connector を持てなかった、
という形になる。

**逆に通ったら、この行は `ai_executes_gated` へ動く。**そのとき初めて、
副系の記録は主系（GitHub Actions の run 列挙）と同じ意味で完結する。
