# Obsidian Autopilot Runbook — 定期自動生成セッションの手順書

**対象:** スケジュール起動される新規Claude Codeセッション（**毎日 06:00 JST**・Simple Memo環境）
**目的:** Obsidian情報ハブをSEO/AIOの勝ち筋（CTR 6.5〜7.4%クラスタ）に沿って、
**データが正当化する分だけ**自律的に育てる。量産はしない。

**初回設定:** 2026-08-11（PR #470 と同時に導入）。
初回の手動イテレーション（N1 = `/obsidian/compare/logseq/`）が本手順の実証例。
**2026-08-11 改訂:** オーナー指示により3日ごと→毎日へ。**目標は毎日1記事**だが、
§0の各ゲートが常に優先する。ゲートを通らない日のスキップは正常系であり、
その理由は §5-2 のステータスJSON経由で日報メール（10:00 JST・Resend）に載る。
「毎日出すために基準を下げる」は、この運用の失敗定義そのもの。

---

## 0. 大原則（これだけは読んでから動く）

1. **1回のセッションで実装するのは1アクションだけ。**
2. **ノイズフロアを守る。** 期待クリック数（imp × 期待CTR(pos)）が**3未満**の行を
   根拠に記事を書かない。`growth/scripts/analyze.mjs --only unanswered` が足切り済みの
   出力を出す。0クリックは多くの場合「正常」である（`OBSIDIAN_CONTENT_QUEUE.md` の
   2026-08-09訂正を必読）。
   **適用範囲はレーンA/Bだけ**（既存の露出を回収する施策）。**新規カバレッジ
   （レーンE）には適用しない** — GSCは既に露出している需要しか観測できないため、
   ページが無い領域に足切りを当てると「impが無いから書けない／書かないからimpが
   出ない」の循環になる（`OBSIDIAN_COVERAGE_PLAN.md` §1）。レーンEは別のゲート
   （キュー掲載＋品質80点＋§28＋固有価値）で守る。
3. **書く理由がなければ書かない。** その回は保守作業（§6）とログ記録だけで終えてよい。
   「定期実行だから何か出す」はこのサイトの敵。
4. **検証できない主張は書かない**（§28 3状態表記）。SimpleMemoの機能主張は
   Simulator/実機の証跡なしに新規追加しない。サードパーティアプリは
   このLinux環境で実際に動かせるなら動かして検証する（例: PR #470 の
   Obsidian/Logseqデスクトップ検証）。検証環境は記事末に正直に書く。
5. **実験に触らない。** `growth/experiments/experiments.json` で running の実験対象
   ページのタイトル・ディスクリプション・主要コンテンツは変更しない。
   特に `/obsidian/` ハブ本体は `monitor-2026-08-09-obsidian-ctr`（評価日 2026-09-13）
   が終わるまで作り替え禁止（関連リンクの追記のみ可）。


## §0-0 緊急停止（**他のどの手順よりも先に見る**）

`data/emergency-stop.json` の `stopped` が `true` なら、**何もせずに終了する。**
理由は `reason` に書いてある。冪等チェックも予算ゲートも見る前に、ここで止まること。

**全体停止だけでなく、自分の経路も見る。**`agents.<経路>.stopped` が `true` なら、
その経路だけが終了する（副系セッションは `ccr-0730` / `ccr-0830` / `ccr-0920`、
オーナーの代走は `owner-session`）。経路ごとに止められないと、1つが暴れている
だけのときに全部を止めることになり、**止めること自体をためらうようになる。**
ためらわれる停止は、無い停止と同じ。

この判定は主系（GitHub Actions のワークフロー）と副系（このセッション）の**両方に効く**。
リポジトリのファイルなので、どちらの経路も作業前に必ず読む位置にある。

- **`force` で飛び越えない。**force は冪等チェックを飛ばすためのもので、停止の解除ではない
- **AIは止めてよいが、解除してはいけない。**（`policy.ai_may_resume: false`）
  止める側の誤りは1日の出荷が止まるだけだが、解除する側の誤りは
  止めたかった事象を素通りさせる
- 自己修復が同じ故障で3回失敗したときは、**自分でここを立てて人間に上げる**。
  手で書かずに `node scripts/autopilot-selfheal.mjs --contain` を使う
  （理由は `escalation-rules.json` の `trigger` に限定される。自由文の停止は
  解除してよいかの判断ができない）。主系は着手前に `--contain --dry-run` を
  通っているので、**上限に達した経路はそもそも走らない**

この仕組みの外にある最後の手段は**資格情報の失効**。リポジトリが読めない・
この判定が壊れている場合でも止まる。


## 0-2. 実行基盤（2026-08-20改訂: GitHub Actions主・CCR Routine 副＋再試行）

CCR Routineの初回（08-12 06:00 JST）が「発火記録あり・実行痕跡ゼロ」で落ち、
スケジュール起動セッションのログは外部から読めないことが分かった。以降:

| 経路 | 時刻 | 実体 | 状態の見える場所 |
|---|---|---|---|
| **主: GitHub Actions** | 06:00 JST | `.github/workflows/obsidian-autopilot.yml`（claude-code-action） | Actionsのrunログ（全部読める） |
| **副系A: CCR Routine** | 07:30 JST | `trig_01TRBdBgSA9646FS4LDQgJdt` | 日報メールの結果のみ |
| **副系B: CCR Routine** | 08:30 JST | `trig_01RC44fYy1D5TGryJ36ixCU1` | 同上 |
| **再試行: CCR Routine** | 09:20 JST | `trig_01ESF9AHax6buS9X1pdFv657` | 同上 |

**2026-08-20訂正:** 旧版のこの表は副系の実体を「Claudeの定期タスク」としか
書いておらず、trigger IDを持っていなかった。そのため副系Routineが**消えていても
誰も気づけず**、08-16・08-17・08-19・08-20 の記録は「起動はしているが痕跡ゼロ」
という誤った診断のまま4日続いた。実際にはRoutineが存在しなかった
（同日、全triggerを走査して不在を確認し、上のIDで作り直した）。
**経路を足したり作り直したときは、必ずこの表にIDを書くこと。**

- **冪等性（全経路の冒頭で必須）**: origin に `claude/obsidian-auto-<当日JST>` が
  既にある、本番 `data/autopilot-status.json` の `date_jst` が当日、または
  **head ブランチが `claude/obsidian-auto-<当日JST>` である PR**（`state: all` で見る）
  があるなら、本日分は実行済み。**何もせず終了する。**
  **2026-08-26訂正:** 旧版は「当日作成のPRがあるなら」とだけ書いており、
  09:00 JST の日次アクチュエータ（`claude/autopilot-act-<日付>`）や月曜のSEO週次
  ジョブが毎日/毎週別ブランチのPRを作るため、「当日のPRがある」が常に真になって
  この判定が機能しなくなっていた（この判定に従っていた09:20経路が、毎朝09:00の
  アクチュエータPRを見て永久にスキップしていた実例）。head ブランチで絞ることで
  日次アクチュエータ等の無関係なPRを数えないようにする。
- **主系がまだ走っているかも見る（2026-08-20追加）**: 主系は
  `timeout-minutes: 90` で06:00に始まるため、**最悪ケースで07:30ちょうどまで
  走っている**。副系の起動時刻と重なる。`obsidian-autopilot.yml` の最新runの
  `status` が `queued` / `in_progress` なら主系は作業中なので、副系・再試行は
  終了する。**ブランチが無いことは「主系が失敗した」ではなく「主系がまだ
  書いていない」かもしれない。** 判定コマンドが失敗した場合も
  「実行済み/実行中かもしれない」側に倒す。
- **占有（2026-08-21追加・冪等性チェックを通った直後に必須）**: 上の冪等性
  チェックは**着手時点のスナップショットでしかない**。2026-08-21、副系(07:30)と
  再試行(09:20)が両方とも「当日分なし」と判定して**二重に着手した**
  （PR #521 と #522。副系v2は作業中に再試行のpushとぶつかって初めて気づいた）。
  一つ上の「主系がまだ走っているか」は**Actionsにしか効かない** — 副系・再試行は
  どちらもCCR Routineで、この節の冒頭に書いたとおり**スケジュール起動セッションの
  ログは外部から読めない**ため、CCR同士は相互観測では避けられない。唯一機能する
  排他は「両方が書ける共有物を先に取ること」なので、**実装に入る前に当日ブランチを
  取る**:

  ```bash
  DAY="claude/obsidian-auto-$(TZ=Asia/Tokyo date +%Y%m%d)"
  git checkout -B "$DAY"
  # 経路名を入れるのは、同時起動した2経路が必ず別SHAになるようにするため。
  # これが無い（＝mainと同じSHAをpushする）と後発のpushが「差分なし成功」に
  # なって排他にならない。CIを蹴る目的の空コミットではない。
  git commit --allow-empty -m "chore(autopilot): claim $DAY (lane: 主系06:00)"
  git push -u origin "$DAY"
  ```

  **pushが非fast-forwardで弾かれたら、他の経路が先に取っている。何もせず終了する。**
  `--force` / `--force-with-lease` は絶対に使わない — **弾かれること自体がこの
  仕組みの出力**であって、障害ではない。これで既存の `git ls-remote` チェックが
  初めて実際のロックとして機能する。claim コミットはそのまま残してよい
  （その経路がいつ着手したかの記録になる）。

- **死んだ占有の引き継ぎ（2026-09-02追加）**: 上の占有には裏がある。
  **claim を取った側が死ぬと、その日は誰も走らないまま緑になる。**
  2026-08-29、ccr-0920 が `claude/obsidian-auto-20260829` を claim だけ取って
  記事もPRも作らずに終わり（`ap-20260829-ccr0920`）、同日12:03 JSTに動いた主系は
  ブランチの存在だけを見て3秒で success を返した（run 33230445898・Checkout以降が
  全て skipped）。**その日の出荷はゼロ**で、主系側の行だけを見ると
  「重複でスキップした正常な日」に見える。

  **占有は守る。守らないのは死んだ占有だけ。**次の3つが全部そろったときに限り、
  引き継いで着手してよい:

  ① `main` との差分ファイルが **0**（＝claim コミットしか無い）
  ② そのブランチを head とする PR が **1件も無い**（`state: all` で見る）
  ③ 最新コミットから **90分以上**経っている

  **90分の根拠**は主系のジョブ上限そのもの（`timeout-minutes: 90`）。これを越えて
  生きている主系の run は存在しえない。出荷まで走り切った回の実測は18〜28分
  （run 33454414490 / 32900786201 / 32816234185）なので、**観測された最長の3倍以上**を
  取ってある。**1つでも読めなかったら引き継がない** — 「差分が無い」と
  「差分を読めなかった」は別物で、混ぜるとGitHub APIが読めない日に全部の占有が
  死んで見え、2026-08-21の二重着手を別の入口から再現する。

  引き継ぐときは**既存のブランチの上に積む**（fast-forward になるので、
  排他は今までどおり機能する）:

  ```bash
  DAY="claude/obsidian-auto-$(TZ=Asia/Tokyo date +%Y%m%d)"
  git fetch origin "$DAY"
  git checkout -B "$DAY" "origin/$DAY"
  git commit --allow-empty -m "chore(autopilot): take over stale claim $DAY (lane: 主系06:00)"
  git push origin "$DAY"     # --force も --force-with-lease も使わない
  ```

  **ブランチを消さない・force push しない。**弾かれたら他経路が復帰したという
  ことなので、何もせず終了する。判定の論理は `scripts/autopilot-gate.mjs` の
  `isAbandonedClaim()` が正で、ドリル（4シナリオ）と性質テスト（2不変条件＋
  変異2件）が固定している。

  **[2026-09-03] 主系も同じ関数を通るようになった。**それまでは同じ条件を
  `.yml` の bash で二重に実装する形にしていたが、**その push は GitHub に
  拒否される**（GH_PAT に `workflow` scope が無い。意図的に足していない）。
  実際 09-02 の修正は Runbook を読む経路にしか届かず、**主系だけ旧判定のまま
  残った。**そこで判定を `.yml` から出し、主系は checkout の後に
  `node scripts/autopilot-gate.mjs --preflight` を呼ぶ。引き継ぎの可否は
  今までどおり `steps.gate.outputs.takeover` としてプロンプトへ渡る。
  **以後この判定の修理は `scripts/` への普通のPRで主系にも届く。**

- Actions側の有効化にはオーナー作業が1つ要る: ローカルで `claude setup-token` を
  実行して出るトークンを repo secret **`CLAUDE_CODE_OAUTH_TOKEN`** に登録
  （サブスク課金でActions内のClaudeが動く。API課金でよければ `ANTHROPIC_API_KEY` でも可）。
  未設定の間はActionsは緑のままスキップし、CCR副系だけが動く。
- どちらも動かなかった日は、日報メール（10:00 JST）が「当日記録なし＝上流停止」を
  報せる。これが最後の網。

## §0-3 一時的な確認 — `list_triggers` を1回だけ叩く（2026-09-05 まで）

> **⚠ この節を実行するのは CCR 経路（ccr-0920 / 副系A / 副系B）だけ。**
> **主系（GitHub Actions）は実行しない。**
>
> **[2026-09-01 訂正] 経路を限っていなかったので、主系が答えてしまった。**
> 本日の主系（レーンF）が報告と `AUTOPILOT_LOG.md` にこう残している:
>
>     ROUTINE_MCP_PROBE: unavailable 主系Actions環境にCCRのMCPが無い
>
> **これは正しい観測だが、この節が答えようとしている問いではない。**
> 聞きたいのは「**スケジュール起動された CCR セッション**が
> `claude-code-remote` の MCP を持つか」で、Actions のランナーに無いのは自明。
> **答えの形をした無関係な行**が1本、記録に残ってしまった。
> 主系がこの行を出しても、⑩ の判断材料にしないこと。

**記事の作業には一切影響させない。**§0 のゲート・§1〜§6 の手順・中断条件は何も変えない。
**スキップした回でも、中断した回でも行う**（1〜2行で終える回でも、この1行だけは足す）。

### なぜ

`data/automation-coverage.json` の ⑩「実行の完全記録（副系）」は、
**写しを取り直す主体が居ない**ことだけで止まっている。
2026-08-28 に2つの経路が実測で閉じ、残った未検証は
**「現に動いている副系のセッションが `claude-code-remote` の MCP を持つか」**の1つ。

同日、対照は取れている:

- **持たない例** … CCRセッションが `create_trigger` で作った routine。実際に発火させて
  ブランチ0・23秒で終了（`trig_0186bhmVoit7q4dEqB9SB2HS`）。作成時に
  「this trigger stores no MCP connectors」の警告が返っていた
- **持つ例** … この経路（ccr-0920）。**PR #696 を実際に作っている**（フッタが
  `session_01UuFE2rHRSKuqKLeoAuGFQg`）。この環境で PR を作るには GitHub MCP が要る

**GitHub MCP を持つことは分かっている。**分かっていないのは `claude-code-remote` のほうで、
これは別のサーバなので、片方から他方を推定しない。

### やること

1. `mcp__Claude_Code_Remote__list_triggers` を `limit=50` で1回だけ呼ぶ。
   ツールが見当たらなければ ToolSearch で
   `select:mcp__Claude_Code_Remote__list_triggers` を1回試してから、もう一度呼ぶ。
2. 結果にかかわらず、報告（プロンプト §3 の2行目以降）に**次の1行だけ**を足す:

       ROUTINE_MCP_PROBE: ok routine=<件数>
       ROUTINE_MCP_PROBE: unavailable <理由を40字以内で>

3. **`AUTOPILOT_LOG.md` を書く回なら、その回の `### 台帳` にも同じ1行を足す。**
   （書かない回＝報告だけの回は、報告に出ていればよい。）
   **結果がセッションの中に閉じ込められないようにするため** —— `get_session` は
   成功したセッションの要約を返すとは限らず、**読めなければ観測が無かったのと同じ**になる。
   リポジトリに1行残っていれば、あとから誰でも `ROUTINE_MCP_PROBE` で grep できる。
4. **写しは更新しない**（`data/routine-runs.json` に触らない）。
   ここで確かめるのは可否だけで、取り直しはこの節の仕事ではない。

### やらないこと

- **この確認が失敗しても run を失敗にしない。**呼べなかったこと自体が観測結果。
- 呼べたからといって、この回で写しの取り直しやPRを増やさない。
  **手順を増やすのは、可否が分かってから別の変更で行う。**

### 期限

**2026-09-05 までの一時的な節。**1回でも `ROUTINE_MCP_PROBE:` の行が出たら、
この節ごと削除する（`ROUTINE_MCP_PROBE` で検索）。
結果は `data/automation-coverage.json` の ⑩ の行へ書く。

> **[2026-09-01] まだ CCR 経路からの答えは出ていない。**09-01 の ccr-0920 は
> 主系が当日ロックを先に取っていたためスキップし（70秒で終了）、
> **スキップ回は `AUTOPILOT_LOG.md` を書かないので、リポジトリには何も残らない。**
> 報告そのものはセッションの中にあるが、成功したセッションの要約は
> `get_session` から返らない。**つまり答えが届くのは、
> ccr-0920 が実際にその日の仕事をした回**（＝主系が取らなかった日）。
> それまでこの節は残す。

> **[2026-08-31] 期限を 08-29 から延ばした。理由は「まだ一度も届いていない」から。**
> この節は 08-28 に `claude/score-improvement-nug323` へ置いたきり **main に入っていない。**
> 上のプロンプトは「Runbook（**mainの最新版**）が優先します」と書いているので、
> **ブランチに置いてある間、日次セッションはこの節を読まない。**
> （そのうえ 08-31 の回は週次利用枠の枯渇で FAILED しており、
> 仮に main に入っていてもその回は走らなかった。）
> **マージされるまで、この節は存在しないのと同じ。**

---

## 1. セッション開始時の把握

```
cd /home/user/simplememo
git fetch origin main && git checkout -B claude/obsidian-auto-$(date +%Y%m%d) origin/main
```
（GitHub Actions環境ではチェックアウト済みのリポジトリルートで同名ブランチを切る。
日付は必ず **JST** で取ること: `TZ=Asia/Tokyo date +%Y%m%d`）

**最初に走らせるもの（読む前に）:**
```
node scripts/autopilot-selfheal.mjs   # 未修理の故障があればレーンFが最優先
```

読むもの（この順）。**全文を読むものと一部だけ読むものを分けてある。**

2026-08-25 に実測したところ、この一覧を素直に全文読むと **約 205,000 文字**
あり、そのうち実際に要るのは **約 72,000 文字**だった。**入力はターンごとに
付いて回るので、ここが1回あたりの実費のいちばん大きな部分。**
しかも `AUTOPILOT_LOG.md` は毎日 +5,000 文字ずつ増えるので、
**放っておくと1回あたりのコストが日々上がっていく。**

1. `tail -n 200 docs/obsidian/AUTOPILOT_LOG.md` — 前回までに何をしたか。
   **全文は読まない**（77,004文字・毎日+5,000）。
   **保留事項はここから取らない** — `data/autopilot-actions-report.json` が
   型付きで持っており、閉じ条件が通れば消える（§7-3）。散文の履歴から
   拾うと、解消済みのものが混ざる。
   **台帳そのもの `data/autopilot-actions.json` は読まない** ——
   閉じた行が消えずに貯まるので、LOG と同じく増え続ける
   （2026-08-25 時点で14行中9行が done・22,533文字）。レポート側は
   open と当日クローズだけなので、**未処理の件数でしか増えない。**
   `as_of_jst` が当日でないときだけ（09:00 JST のアクチュエータが
   まだ走っていない）、台帳側を見てよい
2. `docs/obsidian/OBSIDIAN_CONTENT_QUEUE.md` + `growth/content/new-queue.json` /
   `refresh-queue.json` — データ駆動キュー（レーンA/B）の現在地
3. **カバレッジキュー（レーンE）** — 先頭の pending 1件だけを出す:
   ```
   node -e 'const q=require("./growth/content/coverage-queue.json");
   const p=(q.items||q.queue||[]).filter(x=>x.status==="pending");
   console.log(p.length, JSON.stringify(p[0]))'
   ```
   `status: pending` の先頭がその日の既定アクション。ここが空でない限り
   「書く候補が無い日」は存在しない。**19,474文字の全文は要らない。**
   キューの設計そのものを見直すときだけ
   `docs/obsidian/OBSIDIAN_COVERAGE_PLAN.md` を読む
4. `docs/obsidian/OBSIDIAN_90DAY_ROADMAP.md` — 今がMonth何で、何が解禁されているか
5. `growth/reports/` の最新レポート — 新しいデータ・訂正
6. `sed -n '/^## 6\. やらないこと/,/^## 7\./p' docs/SEO_AIO_PLAN_2026-08.md`
   — §6「やらないこと」は **715文字**。この1節のために 45,841文字の全文を
   読まない（§1〜5・§9以降は実装記録で、日々の判断には要らない）

### 1-2. データ鮮度の確認（毎回・`growth/data/gsc/` を見るだけでは足りない）

**2026-08-15訂正:** 旧版のこの欄は「新しいGSCスナップショットが
`growth/data/gsc/` に増えていれば」としか書いておらず、BigQuery一括
エクスポートに一切触れていなかった。その結果、**エクスポートが
2026-08-13に稼働を始めてから3日連続（08-13/14/15）で「新規データなし」と
誤報した**。データ源は2つあり、**毎回この順で見る**。

**① BigQuery一括エクスポート（一次・自動）**

```
node growth/scripts/bq-preflight.mjs   # 稼働状況と28日到達までの残り日数
```

このスクリプトは**このコンテナでは資格情報が無く落ちることがある**
（`Cannot authenticate to BigQuery` / ADCも鍵も無い）。その場合は
**BigQuery MCP で直接読む**（セッションのMCPは認証済み・プロジェクトは
`yurika-simplememo`・データセットは `searchconsole`）:

```sql
-- 着弾状況（毎回これを見る）
SELECT namespace, data_date,
       FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', publish_time, 'Asia/Tokyo') AS published_jst
FROM `yurika-simplememo.searchconsole.ExportLog`
ORDER BY publish_time DESC LIMIT 6;

-- 蓄積日数（28日窓に必要な残りを数える）
-- 2026-08-22追加: days は「最古〜最新の日数」ではなく COUNT(DISTINCT) なので、
-- 途中が抜けていれば first/last の差より小さくなる。ここが食い違ったら穴がある。
SELECT MIN(data_date) AS first_date, MAX(data_date) AS last_date,
       COUNT(DISTINCT data_date) AS days,
       DATE_DIFF(MAX(data_date), MIN(data_date), DAY) + 1 AS span
FROM `yurika-simplememo.searchconsole.searchdata_site_impression`;

-- 落ちた試行の痕跡（2026-08-22追加）。行が返れば、その (テーブル, data_date) の
-- エクスポートが落ちている。空の temp_ は残骸ではなく**唯一の失敗の証拠**で、
-- 最新 data_date は動かないため上の2本だけでは絶対に見えない。
-- 判定（配信済みの日の再エクスポート失敗か、本当の欠損か）は
-- growth/BIGQUERY_SETUP.md「一括データ エクスポートに失敗しました」の表。
SELECT table_id, row_count,
       FORMAT_TIMESTAMP('%m-%d %H:%M', TIMESTAMP_MILLIS(creation_time), 'Asia/Tokyo') AS created_jst
FROM `yurika-simplememo.searchconsole.__TABLES__`
WHERE STARTS_WITH(table_id, 'temp_');
```

> **絶対にやらない誤り:** 認証失敗やスクリプトの実行不能を
> 「新規データなし」と報告すること。**「取得できなかった」と
> 「増えていない」は別の結論**で、前者は `reason` にそう書く。
> これが08-13〜08-15の誤報の原因そのもの。

> **2026-08-22追加の誤り:** サチコからの失敗メールを受けてIAMや
> エクスポート設定を触ること。**大半は配信済みの日の再エクスポートが
> 落ちただけ**で、データは1日も欠けていない。上のクエリで欠損の有無を
> 確かめてから動く（実測の根拠は `growth/BIGQUERY_SETUP.md` §失敗メール）。

`data_date` が28日ぶん貯まったら（`bq-preflight` が残り日数を表示する）:

```
node growth/scripts/ingest-bigquery.mjs --site sc-domain:simplememofast.com --days 28
```

で `growth/data/gsc/<label>/` に手動CSVと同形のスナップショットが入る。
**28日未満のうちに部分期間でスナップショットを作らない** — 期間長が
毎回違うと衰退検知が「実際の変化」と「期間差」を区別できなくなる
（`GSC_OWNER_ACTION.md` の28日固定の理由と同じ）。それまでは
「あと何日か」をログと status JSON の `next` に書くだけでよい。

**② 手動CSVスナップショット（二次・移行が済むまで）**

`growth/data/gsc/` に新しいラベルのディレクトリが増えていれば取り込み済み。
なお手動CSVは**クエリ1,000行で打ち切られる**（2026-08-11分の
`row_counts.queries` はちょうど1000＝切断済み）ため、①へ移行すると
見えるクエリが増える。①と②で結論が食い違ったら①を採る。

どちらかに新しいデータがあれば:
```
node growth/scripts/analyze.mjs --only unanswered
node growth/scripts/analyze.mjs --only clusters
node growth/scripts/analyze.mjs --only conversational  # AIO: fan-outクエリの数と平均順位
node growth/scripts/analyze.mjs --only decay          # 2026-09-06以降のみ有効
```

**AIOはSEOと別の面として毎回見る。** 会話型（fan-out）クエリと生成AI機能表示
（`pages-aio` 取り込み分）はクリックが構造的に出ない面であり、KPIは
表示数と平均順位（`SEO_AIO_PLAN_2026-08.md` §3 指標の再定義）。
順位を持つ会話型クエリに対応ページが「名指しで答えて」いなければ、
それがその日の最有力アクションになる（下の§2レーンB）。

### 1-3. オーナー依頼の棚卸し（毎回・繰り越す前に実測する）

**2026-08-20訂正:** 旧版はこの手順を持たず、`owner_requests` は前日のログを
そのまま写して「継続・XX-XXから」と日付だけ伸ばす運用になっていた。その結果
**オーナーが登録を済ませた後も依頼を出し続けた**。08-20の日報は
`CLAUDE_CODE_OAUTH_TOKEN` と `GCP_SERVICE_ACCOUNT_JSON` を両方「未登録」と
報告したが、同日06:21 JSTの run 32303452390 はGateを通っており、06:25 JSTの
run 32303828087 は `Credentials are configured` を通っていた。**根拠にしたのが
前日のrunだったことが原因**（08-19の run 32187173035 を引いていた）。

**原則: 依頼を「継続」で繰り越してよいのは、その日の実測で未充足を確かめたときだけ。**
実測手段が無い依頼（Simulator撮影など）は繰り越してよいが、
**「実測手段が無いため未確認」と明記する**。「継続」と「未確認」を混ぜない。

充足したものは `owner_requests` から**外す**。外した事実は `AUTOPILOT_LOG.md` に
1行残す（いつ充足したかを後から辿れるように）。

#### シークレット2件の判定（各1コールで確定する）

**必ず「最新のrun」を見る。** 前日のrunは前日の状態しか示さない。

| 依頼 | 見るもの | 充足の判定 |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | `obsidian-autopilot.yml` の最新run | `Checkout` が `skipped` **でない** |
| `GCP_SERVICE_ACCOUNT_JSON` | `seo-daily.yml` の最新run | `Credentials are configured` が `success` |

```
gh run list --workflow=obsidian-autopilot.yml -L 1 --json databaseId -q '.[0].databaseId'
gh run view <ID> --json jobs -q '.jobs[0].steps[] | "\(.conclusion)\t\(.name)"'
```

（CCR側にこの `gh` は無い。GitHub MCP の `actions_list`
method=`list_workflow_runs` / `list_workflow_jobs` で同じものが読める）

どちらのワークフローも、シークレットが無ければ**その1ステップで止めて以降を
全部 `skipped` にする**作りなので、後続ステップが動いた事実がそのまま判定になる。

**断定しすぎない:** `obsidian-autopilot.yml` のGateは
`CLAUDE_CODE_OAUTH_TOKEN` **または** `ANTHROPIC_API_KEY` のどちらかで通る。
Checkoutが走った事実が示すのは「どちらかが入っている」であって
`CLAUDE_CODE_OAUTH_TOKEN` 単体の登録ではない。依頼の目的は主系を動かすことなので
実務上はそれで足りるが、報告でそこを断定しない。

**Gateを通ったのに記事が出ない日は、依頼ではなくワークフロー側の障害。**
`owner_requests` ではなく `reason` で報告する（例: 08-20の run 32303452390 は
Gate通過後にaptが90分のジョブ上限を食い尽くし、`Claude Code` が `skipped` の
まま終わった → PR #513で修正）。


## 2. アクションの選び方（優先順）

### レーンF（自己修復）— **A〜Eより先に、毎回これを見る**

**まず監視Issueを台帳へ取り込む（2026-08-26追加・毎回必須）。**

```
node scripts/health-intake.mjs      # ops/autopilot-stale と ops/cron-failure を台帳へ
```

`autopilot-health.yml` と `cron-health.yml` は故障を検知すると Issue を立てるが、
**レーンFが読むのはアクション台帳なので、Issue は誰にも読まれていなかった。**
運転台帳の実測で人間介入の最大要因が「基盤の修理 22.2%」だったのは、
修理そのものではなく**「壊れていることに気づいて、直せと言う」役が人に残っていた**ため。
ここがその橋渡しで、取り込まれた行は `act-health-<issue番号>` として台帳に並ぶ。

- **閉じるのはこちらではない。**回復判定は `issue_closed`（監視ワークフローが
  回復時に自分でIssueを閉じる）。ここで閉じると故障を消す判断が2箇所に散る
- **読めなかった回は台帳を触らない。**「Issueが無い」と「Issueを読めなかった」を
  混ぜると、読めない日に全部の故障が回復したことになる

**取り込み経路の故障も、ここで拾う（2026-08-26追加）。**
`data/ingest-recovery.json` に `human_action_required: true` の行が残っていたら、
**その日の最優先は再同意・鍵の再発行の依頼**（アクション台帳へ上げる）。
`degraded: true` の行が残っている間は、**新規記事を書かない** —
退避データが7日より古い状態で書いた記事は、間違っていても出た瞬間には分からず、
順位が付いてから分かる。**気づくのが遅い失敗のほうが高い。**

```
node scripts/recover-ingest.mjs            # 退避先の鮮度と、壊れ方ごとに取る手
node scripts/recover-ingest.mjs --check    # CI（seo-check.yml に入っている）
```

**この経路はまだ本番で発火していない。**台帳が空なのは「安定している」ではなく
「まだ確かめていない」。確かめてあるのは判断の論理だけ（`--selftest`）。

```
node scripts/autopilot-selfheal.mjs
```

**未修理の故障が残っていれば、その日の最優先アクションは基盤の修理。**記事は書かない。

**なぜ最優先か。** 2026-08-11〜08-22の実測で、人間の介入7件のうち**4件が基盤の修理**
だった。しかもその修理を書いたのは**すべてAIセッション**で、人間がやったのは
「壊れていることに気づいて、直せと言うこと」だけ。**足りなかったのは能力ではなく
起動条件**なので、レーンFは「検知したら人の指示を待たずに直す」ことにする。

手順:

1. `autopilot-selfheal.mjs` が出す対象の `run_id` と `failure_class` を確認する
2. GitHub MCP の `get_job_logs`（または Actions のrunログ）で**根本原因まで**特定する。
   「flakeだと思う」で終わらせない
3. `self_repair.may_modify` のファイルだけを直す。**`must_not` は絶対に越えない**
   - **検証を弱めない**（CIチェックの削除・スキップ・閾値の緩和）
   - **自分の権限を広げない**（`permissions:` の拡大・`actions: write` の追加）
   - `auto-merge.yml` の「検証済みSHAだけをマージ」条件を緩めない
   - `data/authority-matrix.json` 自身を書き換えない
   この2つは文章ではなく**CIが実際に検出する**（`check-authority.mjs` が
   `required_ci_checks` の実在と `forbidden_permissions` の不在を見ている）
4. 通常どおり §4 の全チェックを通してPRを出す
5. **`data/autopilot-runs.json` の自分の行に `repair_of: ["<直した run_id>"]` を書く。**
   書かない限り、その故障は翌日も「未修理」として上がってくる

**⛔ が出ている対象は直さない。** 同じ `failure_class` を3回修理しても再発している
ということなので、**修理をやめて `owner_requests` に上げる**。直せないものを毎日
直そうとするのが、この仕組みで一番たちの悪い無限ループになる。

**🤝 が出ている対象も直さない（2026-09-02追加）。** こちらは「3回試して駄目だった」
ではなく、**最初からセッション側に打つ手が1つも無い**種別。判定は
`data/escalation-rules.json` の `who` で、`self_then_owner` は自分で直す、
**`owner` は人へ渡す**。現時点で該当するのは `usage_limit`（週次の使用量上限）だけで、
規則自身が理由を書いている —— 「待つか、枠を上げるか、1回あたりの入力量を減らすかで、
後ろ2つは人の判断」。

- **`repair_of` を書かない。**書くと `repair_limit` の数が進み、3回目で `--contain` が
  経路を止める。**解除は人だけ**なので、時間で自然に戻る停止を人待ちの停止に
  変えてしまう。usage_limit の規則自身が「連続するなら repair_limit ではなく
  こちらで拾う」と明記している
- **消えるわけではない。**未修理の件数にも一覧にも残り、その日の `owner_requests` に
  載せる。レーンFの対象から外れるだけ
- **この仕組みが「直さない口実」にならない歯止め:** `data/escalation-rules.json` は
  `self_repair.may_modify` に**入っていない**。レーンFは規則を書き換えられないので、
  `who` を `owner` にして修理から逃げる経路が無い（自己テストがこれを固定している）。
  規則が読めなかった回は全件が修理対象に戻る

**レーンFで1日使い切ってよい。** その日の記事はゼロでよく、
`action: "maintenance"`・`reason` に修理内容を書く。**壊れた基盤の上で記事を出しても、
翌日また止まる。**

---

- **レーンA（SEO）**: 1. Refresh（足切りを超える未回答意図が既存ページに残っている）
  → 2. New（キュー未実装・解禁済み。URL既存でないか必ず確認）
  → 3. 配線（`OBSIDIAN_INTERNAL_LINK_PLAN.md` の未実施分でデータ根拠あり）
- **レーンB（AIO・回答ブロック）**: 順位を持つ会話型クエリに、質問文とほぼ同一の
  `<h2>`＋2文以内の断定的な答えが対応ページに無い → 置く（P0-1の実証済み手法。
  FAQPageスキーマは足さない・プレーンな見出しと段落でよい）
- **レーンC（Evidence Asset・一次情報）**: 記事ではなく**引用可能な証拠**を1つ作る回。
  例: サードパーティアプリの実挙動検証（PR #470のObsidian/Logseq検証が型）、
  公式レジストリ・公式リリースの実カウント/実測データ更新、`data/benchmark.json`
  系の定点データの鮮度維持、既存記事への実測表の注入。
  AIOで強いのは「測った・断定できる・数値と固有名詞を持つ」主張（§2-2実測）で、
  このレーンはSEO需要ゼロでも成立する。
  **「週に1回以上」は下限であって、クールダウンではない。**
  2026-08-15訂正: 08-13は「直近48時間以内だから見送り」、08-15は「24時間以内
  だから見送り」と、頻度の下限を上限として読む誤りが2回起きた（結果として
  08-14に実行しているので下限は割っていないが、根拠の向きが逆）。正しい判定は:
  - 前回レーンCから**7日以上**経っている → その日の**優先レーン**にする
  - 7日未満 → 実施しても構わないが、同じ資産の再計測を短期間で繰り返さない
    （例: プラグイン数を毎日数え直しても新しい主張は増えない。別の資産へ回す）
  「最近やったから今日はやらない」は根拠として書かない。
- **レーンD（Paid relevance例外）**: 検索需要は足切り未満だが productRelevance が
  highで製品の主訴求に直結する企画（例: N2 quick-capture）は、
  **四半期1本まで**・実験台帳に登録して評価日を切る条件で作ってよい。
  「GSCに出ていない＝需要がない」ではなく「まだ露出していない」の可能性を
  この上限付きレーンだけで扱う（無制限にすると量産圧に変わるため）。
- **レーンE（Coverage・まとめサイト化）**: `growth/content/coverage-queue.json` の
  `status: pending` 先頭を実装する。**ノイズフロアは適用しない**（§0 原則2）。
  ゲートは ①キューに載っている ②品質80点 ③検証規約（§28） ④固有価値
  （実機検証・実カウント・一次情報のいずれかを1つ以上持つ）の4点
  （`OBSIDIAN_COVERAGE_PLAN.md` §1）。実装前に `collides_with` を確認し、
  既存ページが同じ主題を持つならレーンA-1（Refresh）へ切り替える。
  完了したらキューの `status` を `done` にして同じPRに含める。
  **レーンA/Bに足切りを超える案件が無い日は、迷わずここへ来る**
  （= 事実上毎日1本が出る。これがこのレーンの存在理由）。
  型は PR #483（C02 `/obsidian/getting-started/`）。
- **どれも正当化できない** → §6の保守作業＋ログのみ（これは失敗ではない）。
  ただし**レーンEのキューに `pending` が残っている限り、この行には来ない**。
  ここへ来てよいのは、キューが枯れたか、当日のキュー先頭が
  検証不能（例: macOS/iOS実機が要る）でスキップ理由をログに書ける場合だけ。

レーンの選択理由は必ずログとステータスJSONの `reason` に書く。

### §2-1 着手前の価値契約

`node scripts/value-contracts.mjs --readiness` で承認済み指標を確認する。承認が0件なら既存の選定を継続し、承認欄は代筆しない。1件以上なら、変更を始める前に以下を実行する。

1. `node scripts/value-contracts.mjs --feedback` で過去の生Brier scoreを読む。確率の較正に使い、別の正規化報酬へ変換しない。
2. 候補2件以上を `/tmp/decision-candidates.json` にJSON配列で書く。各候補には `id`（英小文字・数字・ハイフン）、`run_id`、`rank`、`metric`、`predicted_delta`、`p`、`horizon_days`（1〜28）、`counterfactual: {id, reason}`、`rank_gap`、`touches`、`max_changed_lines`（最大1500）、`predicted_usd`、`lane`、`action`、`evidence_date` を含める。`touches` はワイルドカードを使わない実パス。予算上限は既存の設定を使う。
   `predicted_delta` は凍結する比較基準（null model）からの変化量。率は0〜1、件数・時間・費用は0以上に収まる予測だけを使う。比較基準が既に上限の出荷日率や、0件の未解消故障には、改善を予測する余地がない。そうした候補は選定から除外され、候補IDごとの理由が返る。
3. `node scripts/value-contracts.mjs --select /tmp/decision-candidates.json` を実行する。境界・可逆性・証拠・予算・反復の5基準と、承認済み指標・実測baseline・比較基準が通った候補だけが選択対象になる。探索が指示された回も同じ条件を通す。0件なら施策を実装せず、理由を記録する。
4. 出力された `data/decision-intents/<id>.json` だけを**別コミットにして先にpush**する。この時点では記事やコードを編集しない。CIがコミットの順序を検査し、事前データから予測・適格性を再計算する。
5. 選ばれた候補だけを実装する。契約は変更しない。範囲や予測を変えたければ、この候補を中止して新しいIDで最初から判定する。実装をpushし、`gh pr create` でPR番号を確定する。**マージを待たずに**、§5-4の記帳コマンドで宣言した `run_id`・`lane`・`action` とそのPR番号を持つ行を同じブランチへ追加する。1つの契約に複数の新しい出荷を混ぜない。
6. 記帳後に `node scripts/decision-monitor.mjs --publish-report` で公開運転表を同期し、運転台帳・status JSON・`autopilot/index.html` を同じPRへcommit・pushする。**この最終HEADに対するpull_request起因のSEO Validationが成功してから自動マージされる。**宣言だけのpushや、PR番号と出荷記録が未確定の途中HEADの検査はマージの根拠にならない。`outcome: shipped` の行はこのPRがマージされてmainへ入った時点で出荷実績になる。未マージのプレビューを実績として報告しない。このコマンドの出力は同期完了だけで、選定には使わない。候補の理由や証拠には、公開してよい運用情報だけを書く。個人データや秘密情報は含めない。
7. 事後決済と限定的な静的ページの復旧は Decision Monitor が行う。未来の結果、観測できない費用、欠測日を補完しない。契約なしの過去の出荷を契約に紐づけない。

成熟の基準は決済20件。方向の改善が20件の窓で乏しい場合、次の10回のうち2回を適格候補の下位から選ぶ。成熟前には選択の枠組みを変更しない。R1以上の権限や日次実行回数を自動で拡大する処理は持たない。


キュー状態の参考（2026-08-11時点）:
- N1 `/obsidian/compare/logseq/` ✅ 実装済み（PR #470）
- N2 `/obsidian/quick-capture/` — 需要未検証（実測0imp）。P2扱い。慌てない
- N3 `/obsidian/voice-input/` ピラー — カニバリ条件を満たす設計ができる場合のみ
- N4 `/tools/obsidian-uri-generator/` — Month 2（P1-6）。インタラクティブ資産は
  既に1つある（体感テスト）ので、追加の意義をログに書いてから
- R4/R5 — クエリ×ページの追加エクスポート待ち（オーナー作業）
- 比較の横展開（`/obsidian/compare/<x>/`）: 「capacities vs obsidian」9imp等は
  ノイズフロア未満。**新しいスナップショットで需要が立ってから**

## 3. 実装規約（新規/更新ページ共通）

- 雛形: `/obsidian/compare/logseq/index.html` か `/obsidian/daily-note/index.html` を
  コピーして書き換える（head構成・二言語span・CTA metadata・next-step込み）
- URL: `OBSIDIAN_URL_PLAN.md` の命名規則（小文字・ハイフン・末尾スラッシュ）。
  既存URLは動かさない
- タイトル≤70字 / description 110〜160字（seo-check.jsの閾値）
- CTA: Relevanceに応じて（`OBSIDIAN_CONVERSION_PLAN.md`）。
  `ct=<page-id>__<placement>` + `data-cta-placement/cluster/variant` を必ず付与
- **デスクトップQR（cta-boxを置くページは必須）**: App Storeクリックの約35%は
  PCで行き止まりになるため（2026-08-10実測）、cta-box内にQRを添える。
  手順: ① `scripts/generate-qr-codes.mjs` の `QR_PAGES` にslug（=ct接頭辞から
  `-jp`を除いたもの・二言語1文書なら `en: true`）を追加 →
  ② `npm i --no-save qrcode jsqr && node scripts/generate-qr-codes.mjs && 同 --check`
  （既存SVGはバイト同一で再生成される・新規分だけがuntrackedになる）→
  ③ バッジ直後に `.cta-qr` div（`/vs/logseq/` のマークアップが原本。CSSは
  共有style.min.cssに定義済み・モバイル非表示/デスクトップ表示）
- 「次に読む」は1枚だけ。原則 `/obsidian/` へ（P1-1の集約原則）
- 内部リンク: Parent 1本 + Sibling 1本以上。新ページへの被リンクを既存ページに
  最低2本配線（`/vs/logseq/` の意図分岐バナーが実例）
- **`data/content-graph.json` に必ず登録**（cluster/intent/funnel/relevance/
  parent/siblings/nextStep）。`/obsidian/` 配下は登録漏れがCIで落ちる
  （`scripts/check-content-graph.mjs`）。Parent/Siblingの判断はこの台帳が正
- `llms.txt`: **引用可能な一次情報・訂正情報を持つページのみ**エントリ追加する
  （毎ページ機械的には足さない）。GoogleはAI検索でllms.txtを使わないと公言して
  おり、この形式が効きうるのは他のAIクローラー向け。このサイトでの価値の実体は
  「誤り訂正リスト」と出典マップにある — その価値が増えるときだけ更新する
- sitemap: **`git fetch --unshallow` してから** `python3 scripts/generate_sitemap.py`
  （浅いままだと全ページのlastmodが壊れる）。
  **2026-08-22からCIが強制する** — `generate_sitemap.py --check` が SEO Validation に
  入っており、新しいページがコミット済みsitemapに載っていなければ `NOT LISTED` で
  落ちる（＝auto-mergeも来ない）。それまでは回し忘れても緑で通っていた
- OG画像: `scripts/generate-og-batch.js` にエントリ追加して実行。
  この環境ではPlaywrightのパス差異があるため、実行前に:
  `npm i --no-save playwright` と
  `/opt/pw-browsers/chromium_headless_shell-*` が無ければ
  `chromium-*/chrome-linux/chrome` へのsymlinkで補う（PR #470 のセッションで実証）

## 4. 検証・QA（全部通ってからコミット）

```
node scripts/seo-check.js                     # 0 errors必須（warningsも極力0）
node scripts/check-css-version.mjs
node scripts/check-benchmark.mjs              # 新規CONFLICT/AMBIGUOUSを増やさない
node scripts/check-url-normalization.mjs
node scripts/check-internal-redirects.mjs
node scripts/sync_constants.js --check
node scripts/tag-cta-placements.js --check
node growth/scripts/check-experiments.mjs
node scripts/autopilot-budget.mjs --check     # 予算台帳の整合＋当月の上限判定
node scripts/autopilot-runs.mjs --check      # 運転台帳の形と整合＋status JSONとの突き合わせ
node scripts/check-authority.mjs --check     # 権限表＋自己修復の歯止め
node scripts/autopilot-selfheal.mjs --check  # 自己修復の境界
node scripts/autopilot-drill.mjs --check     # 切替演習（39シナリオ・gateの16コードを全被覆）
node scripts/automation-rate.mjs --check     # 全領域の自動化率台帳
node scripts/check-pr-facts.mjs --check      # PR原稿の事実と禁止表現
node scripts/check-landing-freshness.mjs --check  # 着地面（トップ日英）が現実より古くないか
node scripts/check-viewport-overflow.mjs --static # 隣り合う nowrap に改行機会があるか（ブラウザ不要・CIも落とす）
node scripts/check-viewport-overflow.mjs --check  # 着地面に横スクロールが出ていないか（320px を含む）
node growth/scripts/d-score.mjs --check      # pr_releaseの算数とゲートの矛盾
python3 scripts/generate_sitemap.py --dry-run
```

**⚠ `check-viewport-overflow` はブラウザが要る。**`npm i --no-save playwright-core` を先に。
CI では**報告のみ**なので、**落とす側はここ。**通らないままコミットしない。
**320px を必ず含めてある** —— 2026-09-03、配信当日に足した PRESS 帯が実機で横スクロールを
起こしたが、その日の検証は 390 / 900 / 1280px を見て「異常なし」と報告していた。
**幅を1つ足りなく選んだだけで、この種の不具合は本番へ出る。**
原因は `.nb`（nowrap）を隙間なく並べたこと。**隣接するインライン要素のあいだに空白も
`<wbr>` も無いと、連続した nowrap はまとめて1つの折り返せない塊になる。**
`.nb` を細かく割っても塊の合計は変わらない（実際、割っても直らなかった）。
効いたのは `<wbr>` と、flex アイテムの `min-width: 0`。

**そして `<wbr>` だけでは直らなかった。**同じ日、**入口がもう1つ**あった ——
`word-break: keep-all` は**日本語をまったく折り返せなくする**指定で、WebKit では
それが厳密に効き、380px の箱が 350px の親を超えていた（実機 `over=41px`）。
**Blink は同じ指定でも折り返す**ので、14幅・フォント太らせ・iPhoneプリセット・
fixed/absolute の全走査のどれでも出なかった。`--static` はこの2つを見る。

### **見ていた面は3つだけだった**（2026-09-03・全面へ広げた）

上の PRESS 帯の一件を直したあと、同じ日に全269面を初めて描画した。**45面が横漏れしていた**
（最大 469px ＝ 画面の1.5倍）。見ていたのは配信本文が送る `/` ・`/en/` ・`/autopilot/` の
3面だけで、**残り266面は一度も測っていない。**

**320px を見落とした回とまったく同じ形。**一覧に無いものは、壊れていても誰も気づかない。
幅の一覧だけでなく**面の一覧**も同じだった。

いま `check-viewport-overflow.mjs` は2つを同時に回す:

- **深い3面 × 14幅** … 共有部品の壊れはここに出る
- **全269面 × 4幅**（320 / 360 / 900 / 1100）… 面ごとの壊れはここに出る

**4幅は実測で決めた。**269面×11幅を1回通し、漏れた45面を覆う最小集合を貪欲法で解いた。
**150面まで見た時点では「320+360 の2幅で足りる」に見えていた**が、
最後まで回すと 1100px と 900px でしか出ない面が9つあった。**途中経過で決めない。**

静的規則（`--static`）も3面から**全269面**へ広げてある。正規表現なので実質ただで、
広げた瞬間に `/ai-tags/` で同じ形の欠陥が2件出た。

45面の内訳と直し方（**同じ形が繰り返し出る**）:

| 原因 | 面数 | 直し方 |
|---|--:|---|
| 表を `overflow-x:auto` で包み忘れ | 47 | `<div style="overflow-x:auto">`（サイトの既存の書き方） |
| flex / grid の子が `min-width: auto` で縮まない | 12 | `min-width: 0`（PRESS帯と同じ形） |
| 共有ナビの規則が面ごとの `<style>` 任せで抜けている | 10 | 既定を共有CSSへ移す |
| 折り返せないラテン語の連なり | 1 | `overflow-wrap: break-word` |

**「面ごとの `<style>` 任せ」が繰り返し効く。**`.nav-cta-mobile` を隠す規則が9面で抜けており、
モバイル専用リンクがデスクトップに出てナビが 106px 伸びていた。
`.global-nav__cta` を 768px 以下で隠す規則も1面で抜けていた。
**同じ契約が236面のインラインCSSに散らばっている限り、また抜ける。**
新しくナビの規則を書くときは**共有CSSに置く。**

### マークアップの崩れは、画面でもSEOゲートでも見えない

同じ日、`check-script-tags.mjs` を `<script>` の開閉だけから**コメントの入れ子と要素の開閉**へ
広げたら、全269面のうち5面で崩れていた。**そのうち1つは本番に文字として出ていた:**

`/captio-alternative/` の本文1行目が `by scripts/inject_faq_schema.py -->` だった。
`inject_faq_schema.py` が「最初の `</head>` の直前へ入れる」実装で、その `</head>` が
**注釈の文言の中**にあった。**HTMLのコメントは入れ子にできない**ので、
コメントは差し込みの最初の `-->` で終わり、残りが生のマークアップになった。
`</head>` が 790 行手前へ移り、以降の JSON-LD と計測タグが `<body>` へ落ちていた。

**SEOの12ゲートは全部緑だった。**正規表現はコメントの内と外を区別しない ——
2026-08-13 に `<script>` の閉じ忘れで同じことが起きたときと、まったく同じ理屈である。

### **WebKit は入る**（2026-09-03 に訂正）

上の節が「この環境に WebKit は入らない」と書いていたのは、**経路を1つしか試していなかった。**

    npx playwright install webkit          … 403（配布CDNがプロキシで塞がれている）
    apt-get install webkit2gtk-driver      … **通る**（WebKitGTK 2.52 + W3C WebDriver）

WebKitGTK は Safari と同じ WebKit コア（`AppleWebKit/605.1.15`）。**効き目は実測で確かめた** ——
実機が `over=41px` を出した修理前の `index.html` を両エンジンにかけると:

    Blink      … 320/360/390/393/430px すべて **over=0**（＝当時の誤報告を再現）
    WebKitGTK  … 390px で **over=31px**（実機と同じ向き・同じ桁）

導入直後、**Blink では出ない漏れが2面**見つかった（`/data/voice-shift/` +14px、
`/blog/email-management-tips.html` +1px）。どちらも `from:noreply@simplememofast.com` のような
語が切れずに漏れており、**Blink は同じ語を切る。**

**扱いの癖が2つある。**どちらも `scripts/lib/webkit-driver.mjs` に書いてある:

- **ドライバ1本にセッションは1つ。**並列化はドライバを複数プロセス立てる（4コアで3本が頭打ち）
- **`window/rect` が効かない**（幅を指定しても 447px のまま）。
  **幅ぴったりの iframe を土台ページに立てて測る** —— iframe の中は独立したビューポートになる

### フォントの留保は、書き方が誤っていた（2026-09-03 に訂正）

「サンドボックスのフォント（IPAGothic）で測っている」と書いていたが、**誤り。**
サイトは Noto Sans JP を**自前配信**していて（`/assets/fonts/NotoSansJP-*.woff2`）、
実機も同じ woff2 を読む。実測すると Blink と WebKit で
**CJK 192px / ラテン 178px / 数字 80px が完全に一致**する（16px時）。

残っているのは**ラテン文字と絵文字のフォールバック**だけ ——
`Noto Sans JP` のあとは `-apple-system` で、実機は SF Pro、ここは DejaVu 系。
実機の1点で校正すると **実機 41px に対し WebKitGTK 31px** と**過小に出る。**

したがって留保は「フォントが違うから当てにならない」ではなく、
**「ラテン文字ぶん、実機より小さめに出る。余裕は多めに見る」**が正しい。

### 実機でしか出ない不具合を追うとき（2026-09-03 に確立）

**この環境に WebKit は入らない**（`npx playwright install webkit` は egress で塞がれる）。
Blink で3回「再現しない」を繰り返したあと、**実機に吐かせて1回で決着した。**手順:

1. `index.html` の `</body>` 直前へ、`?diag=1` のときだけ動くオーバーレイを入れる。
   出すのは `layout / visualViewport / html.scrollWidth / over / UA` と、
   **画面外へ出ている要素の上位8件**（右端・幅・position・**止めている親の名前**・クラス・本文）
2. オーナーに `https://simplememofast.com/?diag=1` を開いてもらう。
   **クエリ付きは別URLなのでHTMLキャッシュを迂回する**
3. `over` と、右端が `html.scrollWidth` と一致する行が原因
4. **直ったら消す。**残すと診断が仕様になる

**「止める親」に body を数えないこと。**`body { overflow-x: clip }` を入れた時点で
全要素に付き、情報が消える（実際にそうなった）。

### 本番に出た ≠ 読者に届いた

同じ日、HTML が `max-age=3600, must-revalidate` で、**修理が最大1時間届かなかった。**
`must-revalidate` が効くのは max-age を過ぎたあとで、その間は問い合わせずに
キャッシュから出る。**「デプロイ成功」を確認して直ったと報告したが、
オーナーが見ていたのは古いページだった。**現在は `public, no-cache`。

+ **iPhoneビューポートQA**（Playwright: 390×844 DPR3で対象ページを実描画し、
  水平スクロールなし・画像表示・表のカード化を確認。手本:
  このRunbook導入セッションの `qa-mobile.mjs` 相当を書いて回す）

## 5. 出荷

1. コミット（日本語・データ根拠を本文に。何を検証し何を検証していないか明記）
2. `git push -u origin claude/obsidian-auto-<date>`
3. PRを作成（本文の型はPR #470を踏襲: 概要/一次情報/規約準拠/配線/検証結果）
4. `subscribe_pr_activity` で監視。SEO Validation成功→auto-mergeが本番へ出す
5. `send_later` で60分後の自己チェックを仕込む（マージ確認まで面倒を見る）
6. `docs/obsidian/AUTOPILOT_LOG.md` に1エントリ追記（同じPRに含める）

### 5-1b. マージ**後**に書く台帳は、別のブランチへ（2026-09-03）

**価値契約のある自律施策は、§2-1・§5-4に従ってマージ前に同じPRへ運転台帳を含める。**
PR番号は作成直後に確定する。CIが契約と出荷記録を照合するので、
台帳の記入をマージ後まで待つと、そのPRは検証を通れない。
出荷実績の成立はマージ時であり、記録を書き始める時刻とは分ける。

この節は、過去の記録の補完やマージ後に判明した事実を**追加で書く場合**に適用する。
間違えやすいのは書く先で、
**マージ済みの当日ブランチに積むと、そのまま取り残しになる。**
PRは閉じているので次の検証が拾う先が無い（auto-merge が検証済みSHAだけを
マージする設計の帰結であって、事故ではない）。

**アクション台帳41件のうち17件（41%）が、この1つの形だった。**

```bash
git fetch origin main
git checkout -B "claude/autopilot-ledger-$(TZ=Asia/Tokyo date +%Y%m%d)" origin/main
# ここで台帳を書き、PRを出す
```

散文だけにしていない。`scripts/autopilot-runs.mjs --append` が、
**マージ済みの当日ブランチ上では書く前に落ちる**（`refusesMergedDayBranch()`）。
squash マージは main の祖先にならないので、祖先判定だけでなく
「そのブランチが変えたファイルが main と同内容か」も見る（`delete-branch.yml` と同じ二段）。
**判定できない日は止めない** —— git が読めない環境で台帳が書けなくなるほうが害が大きい。
どうしてもそこへ書く理由があるときだけ `--allow-merged-branch`（理由をPR本文に書く）。

### 5-2. ステータスJSON（日報メールのデータ源・毎回必須）

`data/autopilot-status.json` を**毎回**その日の内容で上書きし、同じPRに含める。
書いたか否かに関わらず必須 — **スキップした日もJSONは更新する**。
これが更新されない日は、日報メールが「当日記録なし＝上流停止」と報告する
仕組みになっており、静かなスキップと故障を区別する唯一の信号になる。

スキーマ（`simplememo-api/src/autopilot-report.ts` の `AutopilotStatus` と対）:

```json
{
  "date_jst": "YYYY-MM-DD",
  "generated_at": "ISO8601",
  "action": "new | refresh | wiring | maintenance | skip",
  "article": {"url": "...", "title": "..."},      // 無い日は null
  "pr": null,                                     // 自動運転では常にnull（下の注記）
  "streak": {                                     // 2026-08-15追加・毎回必須
    "consecutive_no_article_days": 4,             // 記事(new/refresh)が出ていない連続日数
    "last_article_date_jst": "2026-08-11",        // 最後に記事が出た日
    "last_production_change_date_jst": "2026-08-14", // 最後に本番HTMLが変わった日
    "days_since_production_change": 1             // 上との差。docs/dataのみの日は増える
  },
  "data_freshness": {                             // 2026-08-15追加・毎回必須
    "bq_export_last_data_date": "2026-08-12",     // ExportLogの最新data_date
    "bq_export_days_accumulated": 3,              // 28に届いたらingest-bigqueryが回せる
    "bq_checked": true,                           // false = 見に行けなかった（≠増えていない）
    "manual_snapshot_label": "2026-08-11"         // growth/data/gsc/ の最新ラベル
  },
  "reason": "実施/スキップの判断根拠（データ出典つき・1〜2文）",
  "verified": "その回で実際に検証したこと（§28の範囲明示）",
  "checks": {"seo_check": "...", "mobile_qa": "..."},
  "owner_requests": ["Simulator撮影: ..."],
  "next": "次回への申し送り"
}
```

**`pr` は自動運転では null のままでよい。** このJSONは記事と同じPRに入って
初めて本番に出るため、セッションが自分のPRの merged 状態を書くことは原理的に
できない（書ける時点ではPR番号すら決まっていない）。日報メール側は
**「本番URLで当日分の `date_jst` が読めたこと」自体をマージ＋デプロイの証拠**
として扱う（2026-08-21修正）。それ以前は `pr` の不在を未出荷と誤読し、
記事を出荷した 08-19 / 08-20 / 08-21 を3日続けて「公開記事: 0 / 1」
「1記事作成（PR pending）」と誤報していた。**ここを「PR番号を書き戻せば直る」と
読み替えないこと** — 書き戻しても `state` は `open` にしかならない。

**`reason` の先頭1行は必ず状態サマリにする**（例:
`【連続無記事4日目・本番最終変更 2026-08-14・BQ 3/28日】…`）。
`simplememo-api` は2026-08-21に `streak` / `data_freshness` の描画へ対応した
（`src/autopilot-report.ts` の `freshnessLines()`）ので、この1行はもう唯一の
経路ではない。ただしキーを書き忘れた回・古い記録の回はメール側に何も出ないため、
サマリ1行は保険として残す。

`owner_requests` は**前日のコピーではなく、その日の実測の結果**を書く（§1-3）。
シークレット2件は最新runのステップ結果で充足を判定でき、充足したものは外す。
実測手段が無い依頼は「実測手段が無いため未確認」と添えて繰り越す。

`bq_checked: false` は「BigQueryを見に行けなかった」であって
「新規データが無い」ではない。**この2つを混同した報告は誤報**（§1-2）。

日報の流れ: 06:00 実行 → PR → auto-merge → Pagesデプロイ →
**10:00 JST にWorkerがこのJSONを読み、Resendでオーナーへメール**
（`simplememo-api` の `autopilot_report` cronジョブ）。

### 5-3. AI実費の記録（2026-08-22追加・毎回必須）

**この運用のトークン実費について、2026-08-22時点で言えたのは「一度だけ観測された
0.8149 USD」だけだった**（主系 run 32528028588）。予算の話は全部その1点の周りの
推測で、外に「予算に応じて配分している」と言える状態ではなかった。まず測る。

台帳は `data/autopilot-cost.json`、集計と上限判定は `scripts/autopilot-budget.mjs`。

```
node scripts/autopilot-budget.mjs            # 当月の集計を見る
node scripts/autopilot-budget.mjs --json     # status JSON の cost に入れる形
node scripts/autopilot-budget.mjs --check    # 上限超過なら exit 1
```

**毎回の手順（status JSONを書くのと同じPRで）:**

1. **前回runの実費を台帳へ入れる。** 主系ワークフローは実行後に
   `total_cost_usd` をジョブサマリと `::notice::` に出しており、そこに
   そのまま貼れる `--append` コマンドが1行で書かれている。GitHub MCP の
   `get_job_logs` でも読める（2026-08-22のセッションが実際にそうやって
   0.8149 を読んでいる）。
   ```
   node scripts/autopilot-budget.mjs --append --date <当日JST> --route actions \
     --run-id <runId> --cost <total_cost_usd> --turns <num_turns> \
     --outcome <shipped|no_artifact|failed>
   ```
   `--append` は `run_id` で冪等なので、遅れて追記しても二重計上にならない。
   **実費が取得できなかった回は追記しない。0 を書くと「無料で動いた」になる**
   （§1-2 の「取得できなかった」と「増えていない」の取り違えと同じ誤り）。
2. **`node scripts/autopilot-budget.mjs --json` の出力を、status JSON の
   `cost` セクションにそのまま入れる。** 日報メール側（`autopilot-report.ts` の
   `costLines()`）がこれを描画する。

**副系CCRの実費は台帳に入らない。** スケジュール起動セッションのログは外部から
読めない（§0-2）ため、観測手段が無い。2026-08-22時点で実出荷はすべて副系が
行っているので、**この台帳がカバーしているのは主系の消費だけ**であり、運用全体の
実費ではない。`ccr_measured: false` は「副系がゼロ」ではなく「測れていない」で、
日報はこの2つを分岐で区別する。**混同した報告は誤報。**

**上限は表示用ではない。** 当月の実費が `budget.monthly_usd_cap` に達すると、
主系ワークフローの予算ゲート（Checkout直後）が `--check` の非ゼロ終了を見て
**その日の主系runを止める**。フォント導入は記事より優先されてはいけないが、
上限は記事より優先される（そこだけ `continue-on-error` にしていない）。
止められるのは主系だけで、副系は止まらない — これも正直に書いてある。

**上限値そのものはまだ暫定** （`cap_set_by: "placeholder"`）。実測が2週間
貯まったら実測から決め直す。**決まるまで「予算に応じて配分している」と
対外的に言わない**（速度・Zero-decision率と同じ基準）。

### 5-4. 運転台帳（共通実行ID・2026-08-22追加・毎回必須）

**この運用は長らく「1つの改善サイクルが完走したか」を機械的に言えなかった。**
AI完走率・人間介入率・変更失敗率・改善サイクル時間は、どれも実行を一意に指す
識別子が無ければ数えられず、「手で数えた値」にしかならない。

台帳は `data/autopilot-runs.json`、集計は `scripts/autopilot-runs.mjs`。

```
node scripts/autopilot-runs.mjs           # 指標サマリ
node scripts/autopilot-runs.mjs --json     # status JSON の runs に入れる形
node scripts/autopilot-runs.mjs --check    # CI: 形と整合＋status JSONとの突き合わせ（seo-check.ymlに入っている）
                                           # 台帳の最終記入と data/autopilot-status.json の date_jst が
                                           # 食い違うと落ちる。§5-2を書き忘れた回を出荷させないため
```

**毎回の手順（status JSONを書くのと同じPRで）:**

自分の回を1行追記する。`run_id` は `ap-<YYYYMMDD>-<route>`。

```
node scripts/autopilot-runs.mjs --append \
  --run-id ap-$(TZ=Asia/Tokyo date +%Y%m%d)-<route> \
  --date $(TZ=Asia/Tokyo date +%Y-%m-%d) --route <actions|ccr-0730|ccr-0830|ccr-0920|owner-session> \
  --attempted true --outcome <shipped|no_artifact|failed> \
  --lane <A|B|C|D|E> --action <new|refresh|wiring|maintenance|skip> \
  --pr <番号> --artifact </path/> --source session
```

- **`--pr` は shipped のとき必須**（出荷はPRのマージでしか成立しない）。
  PR番号は `gh pr create` の直後に分かるので、その時点で同じPRに追記・pushする。
  価値契約がある回は、その契約の `run_id`・`lane`・`action` と一致させる。
  記帳後に公開運転表を再生成して同梱し、最終HEADの検証開始を確認する。
  マージを待ってから記帳する手順にはしない
- **実行IDも必ず残す。**主系Actionsの中で `--route actions` を指定すると、記帳コマンドが `GITHUB_RUN_ID` を `external_ref` に引き継ぐ。副系は `--external-ref <CCRのsession id>` を明示する。別ワークフローやローカル実行では推測せず、対象の実行IDを明示する。
- **失敗の回にも必ず1行残す。** `--outcome` と `--failure-reason` を書く。
  「なぜ落ちたか」の無い失敗は再発防止に使えない
- **`interventions` は手で追記する**（オーナーへの依頼・オーナーによる修正・代走）。
  ここが人間介入率の分子になる
- **他経路が先行して何もせず終えた回も1行残す**（`--outcome skipped_duplicate
  --attempted false`）。排他が機能した記録であって、失敗ではない

**`attempted` の意味は「着手したか」。** 秘密鍵未設定のGateスキップと冪等スキップは
`false`。**完走率の分母は attempted** で、着手していない回を失敗に数えると
「静かに寝る」という正しい設計が失敗率として現れてしまう。

**逆に、どの経路も動かなかった日（`no_run`）は正常系ではない。**
完走率の分母には入れないが、サマリに別枠で必ず出す。隠すと稼働率100%に見える。

**費用はここに書かない。** 実費は `data/autopilot-cost.json` が正で、
`external_ref`（GitHub の run id）で結合する。同じ数字の出所を2つ作らない。

### 5-5. 配信の種（distribution seed・2026-08-26追加・記事/一次データを出荷した回は必須）

**なぜ要るか。** 2026-08-11 以降に新設した `/obsidian/` 配下 9 ページ（自動運転のレーンE 6本を含む）について、X・note・Reddit・PR TIMES への展開記録はゼロだった（AUTOPILOT_LOG 全文に配信の記録が無い）。第三者言及は AlternativeTo の1件のみ。記事は「書いたら終わり」になっており、勝ち筋クラスタの露出を作る作業が他チャネルに接続されていない。Ahrefs の75,000ブランド調査（2025-12）では AI 可視性との相関は第三者ウェブ言及 0.66／被リンク 0.2 で、言及を生む配信は記事と同じ資産である。

**何をするか。** 記事（new/refresh）またはレーンCの一次データを出荷した回は、同じPRで `data/distribution-queue.json` の `items` 先頭に1件追記する。配信そのものはこのセッションの仕事ではない — Cowork 側の X／note／Reddit／Indie Hackers の定期タスクが `https://simplememofast.com/data/distribution-queue.json` を読んで消費し、各自の state で重複を避ける。**このファイルは本番に公開される。** 社内語（Capture OS / Multi-Destination 等）・未公開情報・オーナー依頼は書かない。

スキーマ（1件）: `id`（`YYYYMMDD-<slug>`）／`date_jst`／`url`／`title`／`lang`／`cluster`（content-graph の cluster 名）／`kind`（`article` | `evidence` | `refresh`）／`answer_1line`（検索者の質問への1文の断定回答。60〜120字・数字か固有名詞を1つ以上）／`quotable_facts`（実測・実カウント・一次確認の事実を3つまで。各60字以内・日付つき）／`x_post_ja`（そのまま投稿できる日本語原稿。**全角120字以内**（X は日本語を2字換算で140字が上限。URL 23字分を消費側が足す）。勝ち文法「場面が主語→話すだけ/書くだけ→正しい場所に残る」。AI語を先頭に置かない。ハッシュタグ0〜1。URLは含めない）／`note_angle`（note向けの別角度を1行。本文転載は禁止）／`reddit_queries`（`site:reddit.com …` 形式を2〜3本）／`en_answer_1line`（任意）／`verified_scope`（§28 の3状態表記で検証範囲を1行）。

規律: 数字は記事本文にあるものだけ／`quotable_facts` は記事の「検証環境」ブロックと矛盾させない／`x_post_ja` は `scripts/check-pr-facts.mjs` が検出する表現（旧アプリ名・起動0.3秒・無料トライアル・世界初・完全自動化 等）とブランドブックの禁句（爆速・神・革命・圧倒的）を含めない／出荷しなかった回は触らない／100件を超えたら古い順に削る（消費側は id で重複判定する）。

### 5-6. 記事ネタの種（story seeds・2026-09-03追加・**運転で何かが起きた回**は追記）

**なぜ要るか。** `story-seeds` スキルと X の定期タスクは
`https://raw.githubusercontent.com/simplememofast/simplememo/main/docs/story-seeds.md`
を毎回読みに行く設計で、スキル本文は「台帳への追記は毎日のオートパイロット（§5-6）が行う」と
書いていた。**ところが §5-6 は存在せず、ファイルも無かった。**
消費側だけが作られ、**生産側が一度も書かれていなかった**ので、あの経路は
2026-09-03 の実測で **HTTP 404** を返し続けていた（404 を許容する設計なので壊れては
いないが、**その機能は一度も発火していない**）。ここがその生産側。

**§5-5 との違い。**あちらは**出荷した成果物**を配信に接続する種で、記事を出した回だけ書く。
こちらは**運転で起きたこと**の種で、**記事が出なかった回にも書けるものがある**
（むしろ壊れた回・直した回のほうが強い素材になる）。混ぜないこと。

**何をするか。** 次のどれかに当たる回は、同じPRで `docs/story-seeds.md` の**末尾に**1件追記する。

- 基盤の故障を直した（レーンF）／設計の判断を変えた
- 台帳・検査・監視が**自分の誤りを検出した**（この台帳がいちばん強い素材を持つ形）
- 検索・反応データから施策を決めた（`分類: readers`）
- 外の動向と自分の実測を突き合わせた（`分類: outside`）

**書かない回**: 台帳の同期だけ・取り残しの始末だけ・数字の引き直しだけ。
**種が無いのは正常な結果**で、無理に作らない（薄い種は消費側の投稿を薄くする）。

スキーマ（1件・`docs/story-seeds.md` §0 が正）: `seed_id`（`S-YYYYMMDD-slug`・重複判定の鍵）／
`媒体`（note / X / reddit / ih のどれ向けか・複数可）／`分類`（autopilot / outside / readers / product）／
`一行の主張`／`引用できる数字`（**各行に日付と出典ファイルを付ける**）／
`note向け`／`X向け`（**全角120字以内**でそのまま出せる原稿）／`英語圏向け`／`使わない表現`。

規律:

- **数字には日付と出典ファイルを必ず付ける。**消費側は §0 で「台帳の値をそのまま引く・
  再計算しない」と縛られているので、**ここが間違っていると公開投稿が間違う。**
- **このファイルは公開リポジトリにある。**個人の利用額・比率・オーナー個人の作業内容は書かない。
  **公開済みの値と組み合わせて総額が復元できる比率も書かない**（2026-09-03 の週次上限の種がこの形）。
- **`使わない表現` 欄を必ず埋める。**その種に固有の地雷（例:「監視が壊れていた」と要約すると
  嘘になる、など）を書く。空欄にするなら、その種は素材として弱い。
- **消費側は「使った」印をここに書けない**（リポジトリにコミットできない）。
  状態は各タスクが自分の `used_story_seeds` で持つ。**こちらで使用済みを消さない。**
- 検査は `node scripts/check-pr-facts.mjs --file docs/story-seeds.md`。
  冒頭に `<!-- fact-check: draft -->` を宣言してあるので、**配信原稿と同じ規則が全部かかる。**
- 100件を超えたら**古い順に削る**（消費側は `seed_id` で重複判定する）。

## 6. 「書かない回」の保守作業メニュー

- **交差検査の写しを更新（3リポジトリが揃った回だけ・所要10秒）**:
  ```sh
  cd ../simplememo-ios
  python3 scripts/qa/check_analytics_crossrepo.py --sync   # イベント名の allowlist
  python3 scripts/qa/check_rollout_vectors.py --sync       # 段階公開のバケット契約
  cd ../simplememo
  node scripts/check-degradation.mjs --sync                # 縮退の受け皿（遮断器・死信・Outbox）
  ```
  差分があればコミットする。
  **なぜセッションでやるか**: どの写しも、各リポジトリのCIが単独で回るために置いてある。
  隣のリポジトリを見に行く形にすると、CIのチェックアウトには隣が無い。
  そこで起きることは2通りあり、**どちらも起きた**:

  - **黙ってスキップ** → ずれは起きたまま緑になる（イベント名・バケット契約で想定した形）
  - **必ず落ちる** → 2026-08-22、`check-degradation.mjs` が
    `../simplememo-api/src/dlq.ts` などを直接 existsSync で見ており、
    セッションでは通りCIでは必ず落ちた。**CIが赤で固定され、auto-merge が
    動かず、サイトのデプロイが3日止まった。**

  写しが60日を超えて古いと検査が落ちる（古い写しは無い検査と同じ）。

- **着地面（トップ日英）のブラッシュアップ（毎回・所要1分・キー不要）**:
  ```sh
  node scripts/check-landing-freshness.mjs      # --check なしで期限が近いバッジも出る
  ```
  **機械が落とすのは版番号・NEWの期限・公表した着地面へのリンクだけ。**
  そこはCIが止めるので、この保守枠でやるのは**機械が決められない側**:

  - **NEWバッジの残り日数が21日を切っていたら、いま決める。**出力に
    「NEWバッジ 残り N 日」と出る。**期限が来てから慌てて剥がすと、
    その日は全PRが止まる**（この検査は落ちる設計）。剥がすか、
    「なぜまだ新しいのか」を言えるなら `data-new-until` を延ばす
  - **直近に出荷した機能・公開したページが、トップから辿れるか。**
    `data/app-releases.json` と直近のPRを見て、トップが一言も触れていない
    ものがあれば候補に積む。**リンクの有無は機械が見るが、
    「触れるべきか」は見られない**
  - **配信・公表した主張と、トップの言い方が食い違っていないか。**
    `data/pr-claims.json` の `published` が正。率の**値**は
    check-autopilot-page が見るので、ここで見るのは言い回しのほう

  **なぜこの枠が要るか（2026-09-03）**: 配信当日にトップを見に行ったら、
  「最新バージョン3.9」（公開中は5.8.4・**2か月と5版ぶん古い**）、
  「NEW · v3.0」のバッジ2つ、配信本文が `/` へ送っているのに `/` から
  `/autopilot/` へ行けない、配信で名乗った率がトップに1つも無い、が同時に出た。
  **どれも壊れていないので誰も直さない種類のずれで、しかも一番読まれる面に在った。**
  機械で決まる4種はCIへ移したが、**「もう新しくない」の判断だけは人と当日の
  セッションに残る。**残したぶんをここに置く

- 本番URLのライブ確認（新規ページ公開後の200/OG/構造化データ確認）
- `analyze.mjs` 各検出器の実行と、キューJSON/ログへの反映
- 前回記事の実測フォロー（GSC新スナップショットがあれば表示/CTRをログへ）
- 依頼キューの整理: Simulator撮影が必要な案件を
  `AUTOPILOT_LOG.md` の「オーナー依頼」欄に一言で積む
  （実行は オーナーのMacで `simplememo-ios/scripts/qa/capture-article-screenshots.sh <slug>`）
- `docs/ai-citation-strategy.md` の主張監査: 1回につき数項目を
  VERIFIED（公式一次ソースあり）/ OBSERVED（自サイト実測）/ HYPOTHESIS（推定）/
  DEPRECATED（古い）の4状態に振り分けて根拠リンクを付す（全量一括でやらない）
- `build-topic-map`（`OBSIDIAN_AUTOMATION_PLAN.md` A2・未実装）: スナップショットの
  クエリからObsidian関連の新出クエリ（imp≥5）を抽出して new-queue 候補に足す
  仕組み。実装できる回があれば1回で作りきる（作りかけを残さない）
- **トレンドレーダー（毎回・所要3分・キー不要）**: `docs/trend-radar-prompt.md` の
  プロンプト本文をそのまま実行する。3面（Googleトレンド急上昇・はてブ テクノロジー・
  App Store 仕事効率化ランキング上位50）を見て、**指定の形式だけで報告する**。
  - ヒットなしの日 → status JSON の `reason` に「トレンドレーダー: 本日ヒットなし」の
    1行を足すだけ。**それ以上書かない**
  - ヒットあり → 交点（勝ち筋クラスタ／LINE Keep資産／調査データ）を1行で書き、
    対応SLAから選ぶ。**交点の無い波に記事を書かない**（混雑窓を避ける）
  - 対応した場合は `growth/data/annotations.json` に `{date, type, label}` を追記し、
    結果（PV/転載/順位）が出たら同じ行の note に足す。**検知だけで対応しなかった日は残さない**
  - PR起案は「データか機能で語れる角度」があるときだけ。**60未満は撃たない**
    （`node growth/scripts/d-score.mjs` で採点してから）
  2026-08-22まで、この文書は「文面まで・実組み込みは未了」の状態で置かれていた。
  ここに載せたことが組み込みそのものである

- **Mention & Competitor Watch（週1回・キー不要）**: セッションのWebSearchで
  `growth/data/mentions/README.md` の固定クエリ群を検索し、スナップショットJSONを
  保存・前回差分を日報に載せる。前回ファイルの日付が7日以上前なら実行する
- **AIプローブ集計**: `growth/input/ai-probe/YYYY-MM.md`（オーナーが月1で貼る）に
  未集計の新規ファイルがあれば `growth/data/ai-probes/YYYY-MM.json` へ機械可読化し、
  `wrong_claims` があれば llms.txt 訂正リストと該当ページ回答ブロックの更新を
  次回アクション候補に積む（`growth/input/AI_PROBE_PROTOCOL.md` 参照）
- **App Store CSV取り込み**: `growth/input/` にオーナーがDLした
  App Store Connect のCSV（獲得ソース・サブスクリプション）が新規にあれば、
  初回はその列構成を見てから `growth/data/appstore/` への取り込みスクリプトを
  書き起こす（列を見ずにパーサを先に書かない）

**書かない回でも出荷はある**: `data/autopilot-status.json`（action: "skip" か
"maintenance"・reasonにスキップ根拠）と `AUTOPILOT_LOG.md` の追記だけのPRを
必ず出す。docs+dataのみの変更はSEO Validationを素通りするので、
auto-mergeまで数分で終わる。これを省くと日報が「上流停止」と誤報する。

**毎日運転での枯渇時の手順**: キューに実行可能項目が無い日は、順に
(1) `new-queue.json` の解禁条件（需要の再確認・ブロック解除）を最新データで見直す、
(2) 比較横展開（`/obsidian/compare/<x>/`）の需要をクエリ実測で確認する
（必ず `growth/lib/gsc.mjs` の実カーブ `expectedCtr(curveFor(meta, segment), pos)` で
期待クリックを計算すること。**2026-08-12訂正:** 旧版のこの欄にあった
「『memos vs obsidian』32imp・pos4.1 は足切りを超える」は誤り。実カーブでは
ENセグメント1.76%で期待0.56クリック、最も甘いサイト全体カーブでも1.65で、
足切り3を大きく下回る。一般的な業界CTR表（pos4≈10%）で暗算すると
この種の誤判定が起きる）、
(3) **レーンE（coverage-queue.json の `pending` 先頭）へ行く。** データ駆動キューの
枯渇はレーンEへ落ちる合図であって、スキップの理由にはならない、
(4) レーンEも枯れていて初めて、堂々とスキップする。
需要の無い記事を出すより、スキップの理由を日報に書く方がこのサイトの価値になる。

## 7. できないこと（正直に）

- **iOS Simulator / 実機iPhoneの操作・撮影・計測**（macOS必須。
  `IOS_SIMULATOR_AUTOMATION_PLAN.md` 参照）。アプリ画面が必要な記事は
  撮影依頼を積み、画像が `assets/img/<slug>/` に入ってから公開する
- App Store Connect / GSCエクスポート等のオーナー作業
- 判断に迷う場合（ブランド判断・大きな構造変更）は実装せずログに起票する

### 7-1. 依頼はアクション台帳に積む（`owner_requests` は使わない）

**2026-08-25 改訂。**それまで依頼は status JSON の `owner_requests`、つまり
**ただの `string[]`** に積んでいた。id も state も閉じ条件も無いので、
**解決しても消える理由が無い。** 実際、08-25 の日報は12件のうち6件が
【解消済み】【完了】のまま再送されており、その日いちばん重要な1件
（主系が2日連続で認証系の即時失敗を起こしていた）はその中に埋もれていた。
**件数が増えるほど読まれる確率が下がるリスト**は、報告ではなく堆積である。

積む先は `data/autopilot-actions.json`。書き方は
`node scripts/autopilot-act.mjs --check` が検証する。

- **閉じ条件（`close_check`）の無い行は書けない。** 検査で落ちる。
  「いつ消えるか」を決められない依頼は、消えない依頼になる
- 閉じ条件は `scripts/autopilot-act.mjs` の `CLOSE_CHECKS` にあるものだけ。
  **台帳に任意のコマンドは書けない**（依頼リストを実行経路にしない）
- リポジトリの外が対象のものは `outside_repo: true` + `close_check: manual`。
  自動では絶対に閉じないが、`age_days` が出るので放置は放置として見える
- **`owner` は書かない。** `data/authority-matrix.json` から毎回導出される

### 7-1-1. 閉じ条件は「実在するもの」を指す（2026-08-25 追記）

**導入当日に2回踏んだ。** どちらも「閉じ条件が、閉じたい当のものを指していない」形。

| 事例 | 何が起きたか |
|---|---|
| 実費台帳 | 閉じ条件を `autopilot-budget.mjs --check` にしていた。あれは**上限超過**を見る検査で、台帳が空でも通る。閉じたいのは「載っているか」だった |
| status JSON 鮮度 | 閉じ条件を `seo-check.yml` の `--shipping-pr-has-status` にしていた。**そんな名前は誰も実装しない。** 実装は PR #544 が `autopilot-runs.mjs` の `statusAgreement()` として既に書いていた |

規則:

1. **閉じ条件は、閉じたい当のものを検査する。** 近くにある通りやすい検査で
   代用しない。代用した瞬間、その依頼は「閉じたことになる」か
   「永久に閉じない」かのどちらかになる
2. **`file_contains` の needle は、実在するか着手済みのものだけを書く。**
   思いつきの名前を書くと、**誰も実装しないので永久に開く。**
   既存PRがあるならその実装の名前を使い、`detail` にPR番号を書く
3. **原理的に埋まらないものは、実測してから除外する。** 最初から諦めない。
   除外したことは `evidence` に必ず出す（黙って消さない）

**永久に開く依頼は、永久に消えない依頼と同じ害を持つ。** どちらもリストを
読まれなくする方向に働く。この台帳が置き換えた `owner_requests` の失敗そのもの。

### 7-2. 「オーナー依頼」にする前に、まずこれを見る

**この判定を散文でやっていたことが、実際に分類ミスを生んでいる。**
2026-08-22、`claude_args` に `--allowedTools` が無くて成果物ゼロになった件は
オーナー依頼として積まれたが、同じファイルはセッション自身が PR #522/523 で
2回書き換えて通しており、**最初から自分で直せる案件だった**（PR #526 の記述）。

順に見る。上で決まったらそこで止める。

1. **`data/emergency-stop.json`** — 停止中なら何もしない
2. **リポジトリの外か。** App Store Connect・オーナーのローカル環境・
   課金コンソール・GitHub Secrets の値。**検査できないものは実行もできない**
   → `outside_repo: true` で人へ
3. **`data/authority-matrix.json` の `domains`。** 該当領域の
   `requires_approval` が true → 人へ。理由も台帳に写す
4. **無人で走らせるのか（`auto` を付けるのか）。** 付けるなら
   `self_repair.may_modify` の内側だけ。外を触るなら `auto` を付けない
5. **ここまでで止まらなければ、それはAIがやる。**
   `may_modify` は**レーンF（無人の自己修復）の境界であって、
   セッションの境界ではない。** ここを取り違えると、
   セッションが普通にできることまで人の依頼として積み上がる

#### オーナーが権限を委譲したとき（2026-08-25 に実際に起きた）

「権限を与えるのでやって」と言われても、**この手続きを飛ばさない。**
委譲で変わるのは 2〜3 の答えであって、1（緊急停止）と
「記録を偽らない」は変わらない。実際に起きた4件の扱いを残す。

- **権限表そのものの変更**（`must_not`）… 委譲があれば行える。ただし
  **`must_not` に対する明示の例外であることを台帳と表の `$note` に書く。**
  書かないと、次のセッションが「前もやっていた」を根拠に自己承認する
- **`check-*` の規則を緩める変更** … **委譲があっても行わない。**
  削除領域の分割では `requires_approval: false` にすれば検査を通せたが、
  それは「不可逆な領域は必ず承認制」を壊す。**承認は在って主語が違うだけ**
  だったので、規則ではなく記述のほうを直した
- **自分の実費超過の解除** … 委譲があれば行える。`--why` に
  **「オーナーが委譲した」と明記する。**`cap_review.by` は `owner` 固定なので、
  経緯を書かないと表に残る記録が実際より強くなる
- **能力が無いもの** … PATの再発行・secretの書き込み・ASCの入力は、
  権限ではなく**能力**の問題。委譲では解けないので、そう書いて人に残す

**上限そのものを引き上げて自分の超過を消さない。** 解除は記録が残るが、
上限の引き上げは記録を消す。較正が必要なら、解除と別に起票して人へ渡す。

### 7-3. 日次アクチュエータ（`.github/workflows/autopilot-act.yml`）

09:00 JST に走り、その日の結果から依頼を導出し、**自分でやってよいものは
実際にやる**。モデルを呼ばないので、**主系が認証で落ちている日も動く。**

自動で実行するのは、判断を要さないぶん毎日確実に漏れる種類の作業だけ:

| handler | 何をするか | なぜ機械にやらせるか |
|---|---|---|
| `reconcile-runs` | Actions API の run を運転台帳へ落とす | **落ちた回は台帳を書く主体がいない。**08-24 の即死が台帳に載るまで50.7時間かかった |
| `append-cost` | ジョブログの実費を台帳へ | §5-3 は「翌日のセッションが入れる」としているが、手順は忙しい日から落ちる |
| `contain` | 上限に達した経路を止める | 「⛔ 人に上げる」の表示は翌朝の実行を止めない |

**外した handler:** `probe-secret`（secret の存在確認）。初回の実走で GitHub API が
**HTTP 403** を返した——secret 一覧の読み取りは admin 権限が要り、GITHUB_TOKEN にも
GH_PAT にも無い。**毎日「実行できず」を出すだけの handler は、この台帳が潰したかった
ノイズそのもの**なので外した。存在確認を自動化したいなら、先に権限のあるPATが要る。

**ただし、オーナーからは1タップで見える。**この403は権限の壁であって、手間の壁ではない:

    https://github.com/simplememofast/simplememo/settings/secrets/actions

リポジトリの Settings → Secrets and variables → Actions。**アカウントの Settings
ではない**（2026-08-26、この取り違えで1往復した。AIが「GitHub → Settings →」とだけ
書いたのが原因なので、依頼文には必ずリポジトリのURLを貼ること）。

`Repository secrets` の表の **Last updated 列が回転日**。値そのものは誰にも読めない
（GitHubの仕様）。**回転日は期限ではない** —— OAuthトークンの期限は
`claude auth status` にも `claude setup-token --help` にも出ず、どこにも露出していない
ことを 2026-08-26 に実測済み（data/credential-expiry.json の note）。

だから資格情報の依頼を人へ上げるときは、**「secretを更新してください」で止めない。**
更新後に読める値（Last updated）と、それを書き戻す先
（`data/credential-expiry.json` の `last_rotated_at`）まで書く。回転日が積めば
観測寿命が出て、**期限を読まずに寿命を判定できる**ようになる。

**実費が存在しない run について。** Claude Code ステップに到達せず落ちた回
（apt詰まり・actor拒否など）は実行ログ自体が無く、実費は**0ではなく発生していない**。
`append-cost` は取得を実際に試みてから、埋まらないものを `close_check.params.exclude`
に積む。積まないと「実費台帳に載っていない run がある」が**永久に閉じない依頼**になり、
この台帳が潰したかった堆積に戻る。**最初から諦めず、実測してから除外する。**

**実費ゲートは2段あり、片方しか見ないと「予算は大丈夫」に見える。**
`autopilot-budget.mjs --check`（月次上限）と `--check-run-cap --task <種別>`
（1回あたりの上限）は別物で、**主系を止めるのは後者のことがある**。
2026-08-25 に実際にこの形になった: レーンFの修理 run が `repair` の1回上限
$3.00 に対し $11.93 で終わり、月次上限（$40）には遠いので `--check` は exit 0、
つまり日報にも予算表示にも異常が出ないまま、**主系が `repair` を選んだ瞬間だけ
止まる**状態になっていた。失敗した翌日の主系はレーンFを選ぶので、
**いちばん走ってほしい種別が黙って止まる。**

アクチュエータはこれを毎日起票する（`act-budget-overrun-<run_id>`）。
解除は `--ack-overrun` で**人間のみ**——AIが自分の超過を自分で通せると、
上限が「お願い」になる。閉じ条件は `budget_overrun_reviewed` で、
`data/autopilot-cost.json` の `cap_review` を読む機械判定であって `manual` ではない
（承認が入れば翌日消える）。**求めているのは承認そのものではなく、
上限を見直すか支出を認めるかの判断**で、上限側が過小なら
`data/model-routing.json` の `max_usd_per_run` を直すのが筋。超過の判定は
保存されず毎回導出し直されるので、上限を直せば過去の判定も一緒に変わる。

なお `data/authority-matrix.json` の「AI実費」は `human_only` に
`monthly_usd_cap の決定` しか挙げておらず、**この1回上限の承認が人間のみで
あることは権限表に書かれていない**（強制しているのはスクリプト側）。
権限表の変更は `self_repair.must_not` なのでAIからは直せない。

**止まった日の理由を「いずれか」で書かない。** 運転台帳の `interpretRun` は、
Claude Code ステップに到達しなかった日を長らく「秘密鍵未設定・当日重複・予算・
緊急停止のいずれか」という4択のまま記録していた。推測を事実として台帳へ書くと
**どれで止まったのかを後から復元できない**うえ、1回上限という5つ目の停止経路が
増えたときに**古い4択に化けて記録される**。理由はワークフローのステップの
実行結果から一意に決まるので、決めて書く。

| 止まり方 | 緊急停止 | 予算ゲート | 振り分け |
|---|---|---|---|
| Gate（秘密鍵未設定・当日重複） | skipped | skipped | skipped |
| 緊急停止 | **failure** | skipped | skipped |
| 月次上限 | success | success | skipped |
| **1回あたりの上限** | success | success | **success** |

振り分けと Claude の間には `run_cap_ok` しか条件が無いので、最終行は消去法では
なく**一意**に決まる。ステップ情報が取れなかった run は「判定できない」と書く
——ここでも決まらないなら決めない。

セッション側でやることは変わらない。**レーンFは引き続きセッションの仕事**で、
アクチュエータは原因特定も実装もしない。台帳の同期と閉じ条件の判定だけを持つ。
