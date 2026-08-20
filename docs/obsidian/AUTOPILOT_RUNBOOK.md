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

## 0-2. 実行基盤（2026-08-12改訂: GitHub Actions主・CCR Routine副）

CCR Routineの初回（08-12 06:00 JST）が「発火記録あり・実行痕跡ゼロ」で落ち、
スケジュール起動セッションのログは外部から読めないことが分かった。以降:

| 経路 | 時刻 | 実体 | 状態の見える場所 |
|---|---|---|---|
| **主: GitHub Actions** | 06:00 JST | `.github/workflows/obsidian-autopilot.yml`（claude-code-action） | Actionsのrunログ（全部読める） |
| **副: CCR Routine** | 07:30 JST | Claudeの定期タスク（フォールバック） | 日報メールの結果のみ |

- **冪等性（両経路の冒頭で必須）**: origin に `claude/obsidian-auto-<当日JST>` が
  既にある、または本番 `data/autopilot-status.json` の `date_jst` が当日なら、
  本日分は実行済み。**何もせず終了する。**
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
SELECT MIN(data_date) AS first_date, MAX(data_date) AS last_date,
       COUNT(DISTINCT data_date) AS days
FROM `yurika-simplememo.searchconsole.searchdata_site_impression`;
```

> **絶対にやらない誤り:** 認証失敗やスクリプトの実行不能を
> 「新規データなし」と報告すること。**「取得できなかった」と
> 「増えていない」は別の結論**で、前者は `reason` にそう書く。
> これが08-13〜08-15の誤報の原因そのもの。

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
  （浅いままだと全ページのlastmodが壊れる）
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
  "pr": {"number": 123, "state": "merged|open"},  // 無い日は null
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

**`reason` の先頭1行は必ず状態サマリにする**（例:
`【連続無記事4日目・本番最終変更 2026-08-14・BQ 3/28日】…`）。
日報メールを出す `simplememo-api` は上の `streak` / `data_freshness` を
まだ描画しないため、**この1行がオーナーの目に入る唯一の経路**になる。
API側が対応したらこの重複は外してよい。

`owner_requests` は**前日のコピーではなく、その日の実測の結果**を書く（§1-3）。
シークレット2件は最新runのステップ結果で充足を判定でき、充足したものは外す。
実測手段が無い依頼は「実測手段が無いため未確認」と添えて繰り越す。

`bq_checked: false` は「BigQueryを見に行けなかった」であって
「新規データが無い」ではない。**この2つを混同した報告は誤報**（§1-2）。

日報の流れ: 06:00 実行 → PR → auto-merge → Pagesデプロイ →
**10:00 JST にWorkerがこのJSONを読み、Resendでオーナーへメール**
（`simplememo-api` の `autopilot_report` cronジョブ）。

## 6. 「書かない回」の保守作業メニュー

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
