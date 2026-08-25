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
その経路だけが終了する（副系セッションは `ccr-0730` / `ccr-0920`、
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
| **副: CCR Routine** | 07:30 JST | `trig_01TRBdBgSA9646FS4LDQgJdt` | 日報メールの結果のみ |
| **再試行: CCR Routine** | 09:20 JST | `trig_01ESF9AHax6buS9X1pdFv657` | 同上 |

**2026-08-20訂正:** 旧版のこの表は副系の実体を「Claudeの定期タスク」としか
書いておらず、trigger IDを持っていなかった。そのため副系Routineが**消えていても
誰も気づけず**、08-16・08-17・08-19・08-20 の記録は「起動はしているが痕跡ゼロ」
という誤った診断のまま4日続いた。実際にはRoutineが存在しなかった
（同日、全triggerを走査して不在を確認し、上のIDで作り直した）。
**経路を足したり作り直したときは、必ずこの表にIDを書くこと。**

- **冪等性（全経路の冒頭で必須）**: origin に `claude/obsidian-auto-<当日JST>` が
  既にある、本番 `data/autopilot-status.json` の `date_jst` が当日、または
  当日作成のPRがあるなら、本日分は実行済み。**何もせず終了する。**
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

- Actions側の有効化にはオーナー作業が1つ要る: ローカルで `claude setup-token` を
  実行して出るトークンを repo secret **`CLAUDE_CODE_OAUTH_TOKEN`** に登録
  （サブスク課金でActions内のClaudeが動く。API課金でよければ `ANTHROPIC_API_KEY` でも可）。
  未設定の間はActionsは緑のままスキップし、CCR副系だけが動く。
- どちらも動かなかった日は、日報メール（10:00 JST）が「当日記録なし＝上流停止」を
  報せる。これが最後の網。

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

読むもの（この順）:
1. `docs/obsidian/AUTOPILOT_LOG.md` — 前回までに何をしたか・保留事項
2. `docs/obsidian/OBSIDIAN_CONTENT_QUEUE.md` + `growth/content/new-queue.json` /
   `refresh-queue.json` — データ駆動キュー（レーンA/B）の現在地
3. `growth/content/coverage-queue.json` + `docs/obsidian/OBSIDIAN_COVERAGE_PLAN.md`
   — **カバレッジキュー（レーンE）**。`status: pending` の先頭がその日の既定アクション。
   ここが空でない限り「書く候補が無い日」は存在しない
4. `docs/obsidian/OBSIDIAN_90DAY_ROADMAP.md` — 今がMonth何で、何が解禁されているか
5. `growth/reports/` の最新レポート — 新しいデータ・訂正
6. `docs/SEO_AIO_PLAN_2026-08.md` §6「やらないこと」

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
node scripts/autopilot-drill.mjs --check     # 切替演習（15シナリオ）
node scripts/automation-rate.mjs --check     # 全領域の自動化率台帳
node scripts/check-pr-facts.mjs --check      # PR原稿の事実と禁止表現
node growth/scripts/d-score.mjs --check      # pr_releaseの算数とゲートの矛盾
python3 scripts/generate_sitemap.py --dry-run
```

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
  --date $(TZ=Asia/Tokyo date +%Y-%m-%d) --route <actions|ccr-0730|ccr-0920|owner-session> \
  --attempted true --outcome <shipped|no_artifact|failed> \
  --lane <A|B|C|D|E> --action <new|refresh|wiring|maintenance|skip> \
  --pr <番号> --artifact </path/> --source session
```

- **`--pr` は shipped のとき必須**（出荷はPRのマージでしか成立しない）。
  PR番号は `gh pr create` の直後に分かるので、その時点で追記する
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

セッション側でやることは変わらない。**レーンFは引き続きセッションの仕事**で、
アクチュエータは原因特定も実装もしない。台帳の同期と閉じ条件の判定だけを持つ。
