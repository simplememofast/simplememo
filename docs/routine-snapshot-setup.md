# 副系の写しを自動で取り直す — 2つの経路を叩いて、2つとも閉じた

⑩「実行の完全記録（副系）」の最後の一歩。検査（`scripts/check-routine-runs.mjs`）も
取り直し（`--sync`）も本番に在って、**残っているのは「誰が定期的に `list_triggers` を
呼ぶか」だけ**だった。2026-08-28 に2つの経路を実際に作って走らせた。**どちらも通らない。**

## 経路1 — セッションの `create_trigger`（閉じた）

| 引き継がれるか | |
|---|---|
| `environment_id` | **引き継がれる。**明示すれば `job_config.ccr` に入り、sources も付く |
| `mcp__*`（connector） | **引き継がれない。**作成時に警告が返り、`allowed_tools` にも1つも無い |

> If the routine needs connectors, create it from a session that holds them,
> **or ask the user to create it from the claude.ai routines UI.**

実走（`cse_015iYEg3GrcfQ2A55jv9aZD1`・3分35秒・$0.83）は **SUCCEEDED** で終わり、
ブランチもPRも作られなかった。Routine は削除済み。

**`docs/reaching-85-audit-2026-08-28.md` の「sources も MCP connector も付かず」は、
sources 側が誤り。**環境IDを渡さなかった場合の話だった。

## 経路2 — claude.ai の Routines UI（閉じた）

上の警告文が案内していた道。**オーナーが実際に作って、1回走らせた。**

    Routine   trig_01TixKQ5Sovfjfn8rRVQCrYf
    実行      2026-08-28 05:42:56Z → 05:46:32Z（3分36秒・$2.46）
    結果      ブランチ 0 / PR 0

**編集画面にリポジトリを指定する欄が無い。**フィールドは4つだけ:

    名前 / 手順（＋モデル選択）/ 頻度 / 権限

そして発火したセッションはこうだった:

    environment_id  env_011111111111111111111117   ← 汎用の値。副系の env ではない
    tags            cowork-remote / cowork-scheduled
    session_context sources なし
    folders_state   FOLDERS_STATE_NONE

**UIのRoutineは Cowork のセッションを起こす。**リポジトリを持たないので、
`simplememo` に辿り着けない。3分半動いて何も書かずに終わったのはこのため。

Routine は**削除せず、名前に理由を書いて停止**した
（`【停止 2026-08-28・実測で不可】…`）。止めた判断が名前に残っているのが
`data/routine-runs.json` が求めている形なので、それに合わせてある。

## それでも `structural` へは落とさない

**叩いていない面がまだ2つある。**片方でも通れば ⑩ は動く。

1. **既存の副系Routineのセッションが `mcp__*` を持つか。**
   `Obsidianオートパイロット再試行 v3` などは `job_config.ccr.environment_id` に
   `env_01RmhZUdCQoTVYsGM6Ly45oP` を持ち、**現にリポジトリへ到達してPRを作っている。**
   UIで作った今回のものとは作られ方が違う。もし MCP も持っているなら、
   そのRoutineの手順に写しの取り直しを足すだけで済む。
   **確かめるには本番の記事パイプラインを1回走らせることになる**（前回25分）ので、
   ついでに確かめられる機会を待つほうが安い。
2. **自己バインドの Routine（`send_later` 形式）。**
   既存セッションへ配信されるので、**そのセッションが持っているMCPがそのまま使える。**
   `カナリア48時間後` や `#244 のマージ待ち確認` がこの形（`bound_session: true`）。
   セッションが生きている限り、という条件が付く。

**この2つを叩くまでは到達可能のまま置く。**
「辻褄が合うこと」を根拠に不能と書くのは、このリポジトリが 08-26 と 08-27 に
続けてやった誤りで、⑩ の行自身が「読む側を一度も試さずに不能と書いていた」と
書いてある行でもある。

## 使う手順（経路が見つかったとき用に残す）

環境は `env_01RmhZUdCQoTVYsGM6Ly45oP`（副系A/B・再試行と同じ）。
スケジュールは毎日 12:00 JST（`0 3 * * *`）。鮮度の上限は3日なので1回落ちても赤にならない。

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

## 判定の仕方（次に誰かが試すとき）

**`last_run: SUCCEEDED` を根拠にしないこと。**リポジトリもMCPも持たないセッションは
「できないので何も書かずに終わる」で SUCCEEDED になる。**2回とも、この形だった。**

見るのは3つ。どれか1つでも動いていなければ通っていない。

    ブランチ            claude/routine-snapshot-<YYYYMMDD> が push されたか
    PR                  chore(routine): 副系の写しの取り直し が来たか
    data/routine-runs.json の observed_at   新しくなったか

## いまの運用（自動化されるまで）

**写しは人（かこのセッション）が取る。**鮮度の上限が3日なので、
放置すると `check-routine-runs.mjs --check` が赤くなる。**赤が催促の役をしている。**
