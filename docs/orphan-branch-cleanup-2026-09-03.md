# 取り残しブランチ #660 の始末 — 6日開いていた1件と、それを翌日に嘘で閉じるはずだった穴

<!-- fact-check: internal -->

> 契機: `owner_direct` の別便（2026-09-03 09:00 JST）が
> 「オーナー待ちが 1件（最古 6日）／`act-orphaned-pr-660`」を上げた。
> 判定の正は `scripts/autopilot-act.mjs`。この文書は経緯と、実際に叩いた結果。

---

## 0. 結論を先に

1. **`813b335` に再投入するものは無かった。**中身は3ファイルとも main に着地済み。
   受容（`acknowledged`）して閉じた。**ブランチは消していない**（下の §3）。
2. **放っておいても翌日には「解決」していた。ただし嘘で。**
   PR #660 は 2026-09-04 の走査窓から外れる。外れると走査に載らず、
   `branch_caught_up` は**載っていないことを「解消」と読んで閉じる。**
   取り残しは残ったままなのに `取り残しは解消（走査に出てこない）` と書いて閉じる。
   **7日以内に片付かなかった取り残しは、例外なく全部この閉じ方をしていた。**
3. **ハンドラが指す出口（`delete-branch.yml`）は、この種のブランチでは通らない。**
   照合条件が「ブランチが変えたファイルが main と**いまも**同じ内容か」なので、
   main がそのファイルを触った瞬間に偽になる。**古いブランチほど消せなくなる。**

---

## 1. 中身の照合（オーナー待ちだった判断そのもの）

`claude/obsidian-auto-20260827` は PR #660（merged 2026-08-27T00:32:47Z）の後に
`813b335` が push されて取り残された。触るのは3ファイル。

| ファイル | 型 | 照合結果 |
|---|---|---|
| `data/autopilot-runs.json` | 追記型 | ブランチ側 29行の `run_id` が**すべて main にある**。`date_jst`/`route`/`outcome`/`lane`/`action`/`pr`/`artifact` も一致。**欠落 0 件** |
| `docs/obsidian/AUTOPILOT_LOG.md` | 追記型（散文） | ブランチ側 2,034行が main 側 2,710行の**先頭と完全一致**（`diff` は `2034a2035,2710` の1件だけ＝main 側の追記のみ）。**ブランチ側にしか無い行は 0** |
| `data/autopilot-status.json` | **状態型** | ブランチ `2026-08-27` / main `2026-09-02`。**当てると巻き戻る。**当てない |

着地させたのは同日の代走で、LOG の次の節が自分でそう書いている ——
`## 2026-08-27（代走・owner-session） … 同日 ccr-0920 の取り残しも拾った`。

**したがって取るものは無い。**`data/autopilot-actions.json` の行を
`acknowledged` にし、`reviewed_orphans: ["813b335"]` と根拠を残した。

---

## 2. 走査窓から落ちた取り残しが、嘘の根拠で閉じていた（修正済み）

`fetchOrphanedCommits` は「直近 `ORPHAN_LOOKBACK_DAYS`（7日）にマージされたPR」から
走査対象のブランチを組む。`branch_caught_up` は**走査に出てこないことを解消と読む。**
この2つが噛み合うと、**窓から落ちた日に閉じる。**

    today 2026-09-02  since 08-26T00:00Z  →  #660（08-27T00:32Z）は窓の中
    today 2026-09-03  since 08-27T00:00Z  →  まだ窓の中（32分差）
    today 2026-09-04  since 08-28T00:00Z  →  **落ちる → 閉じる**

`null`（走査を取得できなかった）は既に「判定不能」として弾いてあるのに、
**「窓から落ちた」だけが素通りしていた。**どちらも「取り残しが無いことを
確かめていない」点では同じで、しかもこちらは**閉じる方向に倒れる。**

**直し方:** 窓は「拾う範囲」であって「閉じてよい範囲」ではない。
まだ片付いていない行（`open` と `acknowledged`）がある間は、その行が立った日まで
窓を広げる（`orphanWatchSince()`）。覆えなければ `null` を返す既存の規律はそのまま。

`acknowledged` も窓に入れるのは、**受容が消音にならないようにするため。**
受容は「このSHAは照合した」であってブランチへの白紙委任ではないので、
別のコミットが積まれたかを見るには、受容した後も走査に載り続ける必要がある。
`merge()` は `reviewed_orphans` と現在の取り残しSHAを比べ、**違えば開け直す。**

---

## 3. `delete-branch.yml` はこのブランチを消せない（未修正・要判断）

`apply-orphan-ledger` は1行も欠けていない日にこう書く ——
「消せるのは `delete-branch.yml`（変更したファイルが main と同一のときだけ消す）だが、
この経路に `actions:write` は無い。セッションが回すか、オーナーが UI から回す」。

**回しても通らない。**ワークフローと同じ手順をローカルで再現した:

    base=$(git merge-base origin/main origin/claude/obsidian-auto-20260827)
    files=$(git diff --name-only "$base" origin/claude/obsidian-auto-20260827)
      → data/autopilot-runs.json / data/autopilot-status.json
        docs/obsidian/AUTOPILOT_LOG.md / obsidian/plugins/index.html
        sitemap-ja.xml / sitemap.xml
    git diff --stat origin/claude/obsidian-auto-20260827 origin/main -- $files
      → 6 files changed, 1049 insertions(+), 129 deletions(-)   ← 非空なので exit 1

条件は「ブランチが変えたファイルが main と**いまも**同じ内容か」を訊いている。
これが真なのは**マージ後に誰もそのファイルを触っていない間だけ**で、
台帳（毎日追記）やサイトマップ（毎回再生成）を触ったブランチは**翌日には偽**になる。
**古いブランチほど消せない** —— 掃除したいものほど掃除できない向きの条件。

`git merge-tree --write-tree origin/main origin/claude/obsidian-auto-20260827` も
`data/autopilot-runs.json` と `data/autopilot-status.json` で衝突する。
**どんな構文的な検査でもこのブランチは通らない** —— status JSON は
「ブランチが古い」のであって「main に無い仕事がある」わけではないが、
git から見れば両側が base から変えた1ファイルでしかない。

**だから設計どおり、ここは人／セッションの判断が要る場所。**足りていないのは
その判断を**実行に移す口**で、`delete-branch.yml` には
「照合したのでこのSHAは捨ててよい」と言う入力が無い。

**この文書では直していない。**破壊的なワークフローを、実際に回して確かめられない
まま書き換えたくない（回すと本当にブランチが消える）。案だけ置く:

- 判定を「マージ済みPRの head から先に、main に無いコミットがあるか」に変える
  （＝取り残し検知と同じ定義。squash マージでも正しく、**main が進んでも壊れない**）
- 取り残しがある場合だけ、**照合済みSHAを明示する入力**を要求して消す。
  入力が現在の取り残し集合と一致しないときは消さない（古い承認で新しいコミットを
  捨てないため）。消したコミットはジョブ要約に残す

---

## 4. 残っている同種の2件 — **ここに書いた見立ては誤りだった（訂正）**

初版はこう書いていた:

> `ef8b3a7`（`data/autopilot-status.json` の1行・ドリル 15→39）／
> **状態型1ファイルだけ。**当てずに現在値と突き合わせて確かめる

**誤り。**`git show --stat` の出力を `head` で切ったまま読んで、1ファイルだと書いた。
実際は4ファイルで、しかも**中身は取り残しではなく「main に届かなかった訂正」**だった。

    data/autopilot-status.json           drill の記録        （15→19 → 35→39）
    data/kpi-definitions.json            noise_floor v24→25
    docs/obsidian/AUTOPILOT_LOG.md       09-01 の自分の記録を自分で訂正
    docs/obsidian/AUTOPILOT_RUNBOOK.md   §4 の手順            （15シナリオ → 39）

`node scripts/autopilot-drill.mjs --check` の実測は **39 / 39 シナリオ**。
**main のほうが間違っていた** —— Runbook の現行手順が「切替演習（15シナリオ）」と
書いたままで、status JSON も「15→19シナリオ」のままだった。

### 直した。ただし写しは当てていない

`data/kpi-definitions.json` の `noise_floor` は、**取り残しの写しが v25 なのに対して
main は既に v29** だった。**写しを当てていたら4版ぶん巻き戻していた。**

やったのはこう ——

1. Runbook §4 の手順と status JSON の記録を、**実測（39/39）から**書き直す
2. 09-01 の LOG が自分で直そうとして届かなかった1行（`15→19` → `35→39`）を当てる
3. Runbook が変わったので `check-definitions.mjs --bump noise_floor` で
   **checksum だけ**更新（v29 → v30・「定義は変えていない」を why に明記）

**歴史側は触っていない。**LOG の 1598 / 1780 / 1902 / 2346 行にも「15シナリオ」が
あるが、**あれは当時それが本当だった**記録なので、書き換えたら嘘になる。

### もう1件（`claude/simplememofast-indexing-93xm3y`）

`9c834e0` は **main → ブランチの merge commit**。`git show --name-only` は
マージコミットに対して何も出さないので、走査から見ると**触ったパスが取れない**。
`ledger_only` は `null` になり、下の自動受容は**発火しない**（人へ回る）。
これは正しい —— 内訳が無いことを「台帳だけ」と読まない。

---

## 5. 委譲（2026-09-03）

オーナーから **「今後同じケースはあなたが自己判断で意思決定」**。
`data/authority-matrix.json` に領域を1つ足して記録した（**散文だけの委譲は起きない**）。

**狭いほうへ倒した。**同じ表の「段階公開の撤回」が 2026-08-26 に同型の判断をしている ——
「オーナーから《おまかせ》と委ねられたが、**越えた当人が自分の権限を広げる形にはしない**」。

    ai_may      … 照合する／欠けが無いと示せたときに acknowledged にする
                  （reviewed_orphans に照合SHAを必ず書く）／
                  そのための修正を PR で出す
    human_only  … **ブランチの削除**（不可逆側に置く。消したあと戻せるかは
                  GitHub の回収任せで、こちらから保証できない）／
                  状態型台帳を古い写しで上書きする再投入／
                  照合が判定不能だった取り残しの処分

---

## 6. 機械に渡した — 「1行も欠けていない」を捨てないようにした

§0 の3番目に書いた「計算した答えを捨てている」を直した。

`apply-orphan-ledger` は追記型の欠落を計算したあと、**欠落ゼロの日は何も書かずに
行を open のまま残していた。**今回の6日はそれで開いていた。いまは触った**全パス**に
ついて包含を示せたときだけ `acknowledged` にし、`reviewed_orphans` を機械が書く。

| 型 | 対象 | 「欠けが無い」の示し方 |
|---|---|---|
| 追記型（JSON） | `autopilot-runs.json` / `autopilot-cost.json` | 行キーの包含（`missingLedgerRows`） |
| 状態型 | `autopilot-status.json` | main 側の `date_jst` がブランチ側以上＝上書き済み |
| 追記型（散文） | `AUTOPILOT_LOG.md` | **前方一致**（追記しかしないファイルなら包含の十分条件） |
| それ以外 | `autopilot-actions.json` ほか | **示さない。**人が読む |

**`data/autopilot-actions.json` を「示せない」側に置いたのは意図的。**
あれはこのエンジン自身の出力で、「何が欠けているか」を記録するファイル。
その file について「欠けが無い」を自分で判定するのは循環になる。

**判定不能は示せていない側に入れてある。**読めなかった・JSONが壊れていた・
`date_jst` が読めなかった —— どれも `landed: false` で、`why` に理由が残る。
**判定不能を「着地済み」に倒さない。**

### 実物3件で当てた

    #660  claude/obsidian-auto-20260827          ✅ 受容できる（人の照合と一致）
    #774  claude/obsidian-auto-20260902          ❌ 人へ（§4 のとおり実際に欠けていた）
    #781  claude/simplememofast-indexing-93xm3y  ❌ 人へ（内訳が取れない）

**発火してほしい1件で発火し、発火してほしくない2件で発火しなかった。**
とくに #774 は、**機械が「示せない」と言った側が正しかった** —— あれは
取り残しではなく、main に届かなかった訂正だった。
