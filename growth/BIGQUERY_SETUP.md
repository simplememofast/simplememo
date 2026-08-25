# BigQuery 一括エクスポート → 自動SEOループ（オーナー作業）

サチコのデータをBigQueryへ流す設定が済んでいれば、`growth/GSC_OWNER_ACTION.md`
の**週1回5分の手作業はなくなる**。ここに書いてあるのは、そのために
**人間にしかできない**設定だけ。全部で15分程度、一度きり。

コードは既に入っている。足りないのは鍵と権限だけ。

---

## 現況：エクスポートは**届いている**（2026-08-15 実測）

**設定は完了していて、データは毎日入っている。** 下の「まだ届いていない場合」の
節は、この状態に至るまでのトラブルシュートとして残してある。

2026-08-15 に `yurika-simplememo.searchconsole` を実地確認した結果:

| 項目 | 実測 |
|---|---|
| テーブル | `ExportLog` / `searchdata_site_impression` / `searchdata_url_impression` の3つとも存在 |
| データ期間 | 2026-08-10 〜 2026-08-12（3日・942行） |
| 初回着弾 | 2026-08-13 04:20 JST（data_date 08-10） |
| 以降 | 08-13 17:11（08-11分）→ 08-14 16:39（08-12分）と**毎日着弾** |

つまり **2026-08-13 から自動供給が始まっていた**。にもかかわらず
Obsidian autopilot は08-13〜08-15の3回とも「新規GSCスナップショットなし」と
報告していた — Runbookが `growth/data/gsc/` しか見ておらず、ここを
見に行く手順が無かったため（`docs/obsidian/AUTOPILOT_RUNBOOK.md` §1-2で修正済み）。

### まだできないこと：スクリプトからの認証

`node growth/scripts/bq-preflight.mjs` は autopilot のコンテナでは
`Cannot authenticate to BigQuery` で落ちる（サービスアカウント鍵も
ADCも無い）。**下の「鍵と権限」を入れるまで、スクリプト経由の
`ingest-bigquery.mjs` は回らない。** 当面は BigQuery MCP で直接読む
（Runbook §1-2 にクエリを常備）。

### いつ手動CSVをやめられるか

一括エクスポートは**過去に遡らない**ので、28日ぶん貯まるまでは
`GSC_OWNER_ACTION.md` の週1回5分を続ける。2026-08-10 開始なので
**28日到達はおおよそ 2026-09-06**（`bq-preflight.mjs` が残り日数を表示する）。
それまでは部分期間でスナップショットを作らないこと（期間長が揃わないと
衰退検知が壊れる）。

---

## 「一括データ エクスポートに失敗しました」メールが来たら

**まずIAMを触らない。** このメールの大半は、権限でも設定でもなく、
**すでに届いている日の再エクスポートが落ちた**だけで、その場合データは
1日も欠けていない。メール本文は「データを失わないように早急に修正して
ください」としか書かないので、区別は自分でつける。

```
node growth/scripts/bq-preflight.mjs        # §4 Integrity が判定を出す
```

判定は2種類しかない。

| 出力 | 意味 | やること |
|---|---|---|
| `! ... an export attempt failed, but the day is already in the table` | 再エクスポートの失敗。その日の数字は前のepochのまま残っている | **何もしない。** Googleが約1週間リトライし、たいてい翌日までに入る |
| `✗ ... the day is NOT in the table` / `✗ ... days missing inside the history` | その日が本当に落ちている | 約1週間でリトライが打ち切られ、**エクスポートは遡らない**。サチコ→設定→一括データエクスポートのエラーを見る |

`bq-preflight` が資格情報で落ちるコンテナでは、BigQuery MCP で同じことを見る:

```sql
-- 失敗の痕跡（temp_ が残っていれば、その (テーブル, data_date) の試行が落ちた）
SELECT table_id,
       FORMAT_TIMESTAMP('%m-%d %H:%M', TIMESTAMP_MILLIS(creation_time), 'Asia/Tokyo') AS created_jst,
       row_count
FROM `yurika-simplememo.searchconsole.__TABLES__`
WHERE STARTS_WITH(table_id, 'temp_');

-- その日が実際に入っているか（入っていれば欠損ではない）
SELECT 'site' AS ns, data_date, COUNT(*) AS rows_
FROM `yurika-simplememo.searchconsole.searchdata_site_impression` GROUP BY data_date
UNION ALL
SELECT 'url', data_date, COUNT(*)
FROM `yurika-simplememo.searchconsole.searchdata_url_impression` GROUP BY data_date
ORDER BY data_date DESC, ns;
```

### 2026-08-21/22 の実測（この節が書かれた理由）

5件の失敗メール（08-14/15/16 SITE・08-16/17 URL）が来た。実際に起きていたこと:

| 調べたもの | 結果 |
|---|---|
| データの欠損 | **無し。** site は 08-10〜08-19、url は 08-10〜08-20 が穴なく入っていた |
| 落ちた試行の痕跡 | 空の `temp_` テーブルが6つ（メールの5件＋UTC日付の切れ目で翌日分に回った SITE 08-17） |
| BigQuery側のエラー | **0件。** `search-console-data-export@…` が 08-12 以降に投げたジョブは `INFORMATION_SCHEMA.JOBS_BY_PROJECT` で全数成功。**落ちた試行はジョブを1本も作っていない** |
| 何が落ちていたか | `ExportLog` に epoch_version=1 の行が並んでいた＝**配信済みの日の再エクスポート**。08-13 site/url・08-14 url・08-15 url は再エクスポートに成功済み |

**IAMではありえない理由:** 08-22 04:24 に URL 08-15 の再エクスポートが成功し、
その16分後の 04:40／04:42 に SITE 08-16／URL 08-16 が落ちている。同じサービス
アカウント・同じデータセット・同じ権限で、成功と失敗が交互に出る。権限が
どの試行を落とすかを選ぶことはできない。失敗はBigQueryに届く前
（Google側のエクスポート処理内）で起きている。**こちらの設定で直せるものは無い。**

**temp_ テーブルは消さない。** 自前で約6日の有効期限を持っていて放っておけば
消えるうえ、リトライ中の試行が使っている可能性がある。

**その後（2026-08-25 確認）:** 何もしないまま自己復旧した。site / url とも
**08-10〜08-22 が穴なく揃い、2テーブルのズレも0**。落ちた6件の temp_ は
そのまま残っている（08-28 に自動失効）。**「メールが来ても、欠損を確かめて
から動く」で正しかった**ことの実測。

### 保持期限は全部外した（2026-08-25 実施）

データセットに `defaultTableExpirationMs` / `defaultPartitionExpirationMs` が
60日で入っていて、テーブル作成時にそれぞれへ焼き付いていた。放っておくと:

- **`ExportLog` が 2026-10-12 にテーブルごと消える**（非パーティションなので
  丸ごと）。着弾状況の確認は `bq-preflight` も Runbook §1-2 も全部ここを読む
- `searchdata_*` は **60日より古い日が黙って消える**。データ開始が 2026-08-10
  なので**最初の1日が落ちるのは 2026-10-09**。28日窓は無事だが、前年同期比や
  「90日前と比べて」は永久に作れなくなる

3本流して外した。**この3本目までやらないと意味がない:**

```sql
-- ① これから作られるテーブルの既定
ALTER SCHEMA `yurika-simplememo.searchconsole`
  SET OPTIONS (default_partition_expiration_days = NULL, default_table_expiration_days = NULL);

-- ② ExportLog 本体（テーブル期限）
ALTER TABLE `yurika-simplememo.searchconsole.ExportLog`
  SET OPTIONS (expiration_timestamp = NULL);

-- ③ 既存の2テーブル（パーティション期限）
ALTER TABLE `yurika-simplememo.searchconsole.searchdata_site_impression`
  SET OPTIONS (partition_expiration_days = NULL);
ALTER TABLE `yurika-simplememo.searchconsole.searchdata_url_impression`
  SET OPTIONS (partition_expiration_days = NULL);
```

> **①だけでは何も直らない。** データセット既定は**テーブル作成時にコピーされる**
> だけで、既存テーブルは自分の `timePartitioning.expirationMs` を持ち続ける。
> ①を実行した直後でも `searchdata_*` は60日で消え続ける。既存テーブルは
> ②③で個別に外す。

**temp_ テーブルは道連れにならない。** サチコ側が作成時に自前で約6日の期限を
付けている（`temp_..._2026-08-14` は 08-21 18:40 作成→08-28 失効、
`temp_..._2026-08-17` は 08-22 10:39 作成→08-28 失効）。60日の既定を外しても
落ちた試行の痕跡が永久に溜まることはない。

費用は無視できる。1日あたり約150KB・1年で約55MB で、無料枠10GBの0.5%。

---

## まだ届いていない場合の確認手順

サチコの一括エクスポートが動くと、Search Console 自身が次の3つを作る。
名前は固定で、こちらでは変えられない。

```
searchdata_site_impression    サイト単位（クエリ・国・デバイス別）
searchdata_url_impression     URL単位（クエリ×ページの結合はここ）
ExportLog                     いつ何を書き出したかの記録
```

**この3つが見えるまで、自動化は何も動かない。**

### 見えていない理由は3つのどれか

**① まだ48時間経っていない**
初回のダンプは設定から最大48時間かかる。ここまでの手順が正しければ待つだけ。

**② IAMの権限付与を飛ばしている（いちばん多い）**
サチコ側の設定画面は、権限が無くても**エラーを出さずに成功したように見える**。
そして何も書き込まない。Google Cloud コンソール → IAM で、次のアカウントを探す:

```
search-console-data-export@system.gserviceaccount.com
```

これに、プロジェクト `yurika-simplememo` に対して**2つとも**必要:

| ロール | 日本語表示 |
| --- | --- |
| `roles/bigquery.dataEditor` | BigQuery データ編集者 |
| `roles/bigquery.jobUser` | BigQuery ジョブユーザー |

見当たらなければ「アクセスを許可」から上のメールアドレスで追加する。
（IAM一覧に出てこない場合は「Google 提供のロール付与を含める」にチェック）

**③ プロジェクトかデータセットが違う**
Search Console → 設定 → 一括データエクスポート に表示されている
プロジェクトIDが `yurika-simplememo` であることを確認する。

> 設定をやり直した場合、エクスポートは**過去に遡らない**。
> 履歴は「有効にした日」から始まる。

---

## 1. サービスアカウントを作る（5分）

GitHub Actions からBigQueryを読むための鍵。サチコ側のアカウントとは別物。

1. Google Cloud コンソール → **IAMと管理** → **サービス アカウント** → **作成**
2. 名前: `simplememo-seo-reader`（何でもよい）
3. **ロールは付けずに**「完了」— 次の手順で最小権限だけ付ける

## 2. 権限を2つだけ付ける（3分）

作ったアカウントに、**必要な分だけ**。読み取り専用にしておく。

| どこに | ロール | なぜ |
| --- | --- | --- |
| データセット `searchconsole` | `roles/bigquery.dataViewer`（BigQuery データ閲覧者） | 中身を読む |
| プロジェクト全体 | `roles/bigquery.jobUser`（BigQuery ジョブユーザー） | クエリの実行にはジョブ作成が要る |

> `jobUser` が無いと `Access Denied: Project` という、課金設定の問題に見える
> エラーが出る。クエリは「読む」操作に見えて、内部ではジョブを作るため。

データセットへの付与は BigQuery コンソール → `searchconsole` → **共有** →
**権限を追加** から。

## 3. 資格情報をGitHubに登録する（3分）

シークレット名は `GCP_SERVICE_ACCOUNT_JSON` の1つだけで、
**中身は次の2種類のどちらでも動く。** 名前に "SERVICE_ACCOUNT" と入っているのは
歴史的な経緯で、OAuthユーザー資格情報も同じ場所に入れる。

### A. すでに `gcloud auth application-default login` を済ませている場合（最短）

鍵を発行しなくてよい。手元のADCファイルをそのまま貼る。

```sh
# プロジェクトを紐づけてから（未設定だとBigQueryが403を返す）
gcloud auth application-default set-quota-project yurika-simplememo

# 中身を確認して、そのままコピーする
cat ~/.config/gcloud/application_default_credentials.json
```

`{"client_id":…,"client_secret":…,"refresh_token":…,"type":"authorized_user",
"quota_project_id":…}` という形をしている。これを丸ごと
`GCP_SERVICE_ACCOUNT_JSON` に貼る。

> **有効期限に注意。** リフレッシュトークンは失効する（Google Cloud プロジェクトが
> テスト公開ステータスのままだと7日で切れる）。切れると
> `OAuth token refresh failed … invalid_grant` で落ちるので、
> 長く放置する運用にするなら B のサービスアカウント鍵にしておく方が堅い。

### B. サービスアカウント鍵（長期運用向き）

1. サービスアカウント → **キー** → **鍵を追加** → **新しい鍵を作成** → **JSON**
2. JSONファイルがダウンロードされる
3. GitHub → リポジトリ → Settings → Secrets and variables → Actions → **New repository secret**
   - Name: `GCP_SERVICE_ACCOUNT_JSON`
   - Secret: **ダウンロードしたJSONの中身を丸ごと貼る**
4. ローカルのJSONファイルは消す

> **鍵をリポジトリにコミットしない。** `growth/input/.gitignore` は
> CSVしか見ていないので、鍵は自動では守られない。

### ローカルで動かすだけなら、登録は要らない

`gcloud auth application-default login` が済んでいれば、
`growth/scripts/*` は `~/.config/gcloud/application_default_credentials.json` を
自動で見つける。環境変数を設定する必要もない。

```sh
node growth/scripts/bq-preflight.mjs      # 認証と鮮度の確認
node growth/scripts/ingest-bigquery.mjs --days 28 --label "$(date -u +%Y-%m-%d)"
```

## 4. プロパティの文字列を確認する（1分）

ワークフローは既定で `sc-domain:simplememofast.com` を使う。
サチコのプロパティが「URLプレフィックス」型ならこれは一致せず、
**0行が返ってきて「今週は流入が無かった」ように見える**。

確認は次で済む（ローカル、鍵をダウンロードした状態で）:

```sh
export GOOGLE_APPLICATION_CREDENTIALS=~/Downloads/鍵.json
node growth/scripts/bq-preflight.mjs
```

エクスポートに入っている `site_url` を全部出すので、そのまま合っているか見る。
違っていたら GitHub の Settings → Secrets and variables → **Variables** に
`GSC_PROPERTY` を作って正しい値を入れる（`https://simplememofast.com/` のように
末尾スラッシュまで含めて一致させる）。

## 5. 一度手で動かす（1分）

GitHub → Actions → **SEO Daily (BigQuery)** → **Run workflow**。

ジョブサマリに、エクスポートの状態と検出結果が出れば完了。
以降は毎日06:00 JSTに自動で走る。

---

## これで自動になること・ならないこと

### 自動になること（毎日）

| | |
| --- | --- |
| エクスポートの死活監視 | 止まったら**ワークフローが失敗する**。小さい数字として紛れ込まない |
| 28日窓の取り込み | 手作業のCSVダウンロードが不要 |
| 検出器5種 | 機会スコア / CTRギャップ / 未応答インテント / 衰退 / カニバリ |
| 記録用スナップショット | 毎週月曜にコミット、PRとして出る |

### 手作業のまま残ること

**ページの編集そのもの。** これは意図的にそうしてある。

タイトルやディスクリプションを毎日ボットに書き換えさせると、
`growth/experiments/experiments.json` の実験台帳が成立しなくなる。
「7/1にタイトルを変えて7/29に評価する」という設計は、その間タイトルが
固定されていることが前提で、間に自動書き換えが入ると**何を測ったのか
分からなくなる**。measurement loop を壊してまで得る自動化ではない。

自動化されるのは「何を直すべきか」の特定まで。直す判断と実装はPRを通る。

---

## 6. 週次PRのマージまで自動にする（任意・5分）

毎週月曜のスナップショットPRは、既定では**SEO Validation が自動で走りません**。
GitHub には再帰防止の仕様があり、`GITHUB_TOKEN` による push や PR 作成は
他のワークフローを起動しないためです。結果、`auto-merge.yml` も発火せず、
マージに手動の再実行が1クリック要ります。

週1回のクリックが気にならなければ、この手順は不要です。

自動にするには PAT（Personal Access Token）を1つ登録します。

### 作る

GitHub → Settings（アカウント）→ Developer settings →
**Personal access tokens** → **Fine-grained tokens** → **Generate new token**

Fine-grained を使ってください。classic は組織内の全リポジトリに効いてしまいます。

| 項目 | 値 |
| --- | --- |
| Token name | `simplememo-seo-daily` |
| Expiration | 90日〜1年（無期限にしない） |
| Repository access | **Only select repositories** → `simplememofast/simplememo` **だけ** |

Permissions は**2つだけ**:

| 権限 | レベル |
| --- | --- |
| Contents | Read and write |
| Pull requests | Read and write |

> **Workflows 権限は付けないでください。** 週次コミットが触るのは
> `growth/data/` と `growth/reports/` だけで、`.github/workflows/` は
> 変更しません。付けると、このトークンでCI定義自体を書き換えられる状態に
> なります。付けない理由があるので付けない、というだけです。

### 登録する

GitHub → リポジトリ → Settings → Secrets and variables → Actions →
**New repository secret**

- Name: **`GH_PAT`**（この名前でないとワークフローが拾いません）
- Secret: 生成されたトークンを貼る

**トークンは生成直後の1回しか表示されません。** 貼り終えたら、
メモやチャットに残った控えは消してください。

### 確認する

Actions → **SEO Daily (BigQuery)** → **Run workflow** で
`snapshot` を **true** にして実行。作られたPRに **SEO Validation** が
走っていればPATが効いています。走っていなければ Secret 名か
Repository access を見直してください。

### 期限が切れたら

PATが失効すると、週次のコミット手順が push で失敗し、
**ワークフローが赤くなります**（黙って止まりはしません）。
新しいトークンを同じ `GH_PAT` に上書きすれば復旧します。

---

## 手作業のCSVはいつやめられるか

**あと28日ぶん履歴が溜まるまでは続ける。**

一括エクスポートは遡らない。有効化した日から溜まりはじめるので、
それまでのBigQueryスナップショットは28日窓に満たない。
12日窓の数字を28日窓のスナップショットと並べると、**パイプラインの都合が
流入の急減として読まれる**。

`bq-preflight.mjs` が「28日窓が最初に可能になる日」を毎回表示するので、
その日を過ぎたら `growth/GSC_OWNER_ACTION.md` の手順はやめてよい。

---

## 費用

この規模ならほぼ無料の範囲に収まる。

- BigQuery の無料枠: ストレージ10GB/月、クエリ1TB/月
- このサイトの28日ぶんのデータ: 数MB
- 毎日のワークフロー: 1回あたり8クエリ、課金は1クエリ・1テーブルあたり
  最低10MB換算 → **月あたり3GB程度**

無料枠の0.3%ほど。心配なら Google Cloud → お支払い → **予算とアラート** で
上限アラートを設定しておく。

---

## AIO（AI検索最適化）について正直に書いておく

**サチコのエクスポートに AI Overview の項目は無い。** BigQuery側にも無い。
AI Overview 経由の表示・クリックは通常のウェブ検索の数字に混ざっており、
分離する公式な手段は現時点で提供されていない。「AIOのクリック数」を出す
ダッシュボードは、どれも推定か別ソースの話をしている。

そのうえで、このエクスポートから**実際に読めるAIO関連の信号**は2つある。

**① サーフェス別の内訳** — `meta.bigquery.surfaces` に
`WEB` / `DISCOVER` / `NEWS` / `IMAGE` / `VIDEO` の表示回数を記録している。
Discover の比率が動いたとき、ウェブ検索の数字だけ見ていると原因を取り違える。

**② ゼロクリック圧の変化** — 上位に居るのにクリックされない状態。
既存の検出器がそのまま使える:
- `ctr-gap` … 順位相応にクリックされていないページ
- `unanswered` … 偶然では説明できない「0クリック」
- `decay` の原因分類 `CTR loss (SERP change / snippet)` … 順位も表示回数も
  保ったままクリックだけ落ちた＝SERP上で何かに answers を取られた状態

AI Overview が答えを吸っている場合、これが出方になる。**断定はできない**が、
「順位は無事なのにクリックが消えた」は他の原因（強調スニペット、
競合のリッチリザルト）と合わせて実際に見るべき現象で、毎日測る価値がある。

**③ 生成AI機能のエクスポートだけは手作業が残る**

Search Console の「Search Generative AI 機能のパフォーマンス」エクスポートは
UI からのCSVダウンロードのみで、**BigQuery一括エクスポートに対応する列が無い**。
`ingest-gsc.mjs` はこれを `pages-aio` として取り込む（表示回数のみ・
クリックもCTRも順位もGoogleが返さないため、`pages` とは別バケットにしてある）。

つまり手作業のCSVを完全にやめると、**この次元だけ静かに集まらなくなる**。
「AI面からの表示がゼロだった」ではなく「誰も取っていない」なのに、
見え方は同じになる。`ingest-bigquery.mjs` は `pages-aio` が空のとき毎回
その旨を出力する。

AI面のシェアを追いたいなら、このCSVだけは月1回でも落とし続けること。
`meta.bigquery.surfaces` は `search_type`（WEB / DISCOVER / NEWS …）の内訳で、
これとは別の切り口。

サイト側のAIO施策（`llms.txt`、JSON-LD、FAQスキーマ、AIクローラの許可）は
既に入っている。`robots.txt` は GPTBot / ClaudeBot / PerplexityBot /
OAI-SearchBot ほかを明示的に許可済み。

---

## 困ったときに最初に打つコマンド

```sh
node growth/scripts/bq-preflight.mjs
```

これは失敗の種類を分けて表示する。「クエリが0行返す」という同じ症状に対して、
原因（鍵・権限・データセット名・プロパティ文字列・エクスポート停止）ごとに
違う直し方を出す。
