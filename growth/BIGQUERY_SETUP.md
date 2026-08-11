# BigQuery 一括エクスポート → 自動SEOループ（オーナー作業）

サチコのデータをBigQueryへ流す設定が済んでいれば、`growth/GSC_OWNER_ACTION.md`
の**週1回5分の手作業はなくなる**。ここに書いてあるのは、そのために
**人間にしかできない**設定だけ。全部で15分程度、一度きり。

コードは既に入っている。足りないのは鍵と権限だけ。

---

## まず確認：エクスポートは本当に届いているか

**送っていただいたスクリーンショットの時点では、届いていない。**

`searchconsole` データセットに見えているのは以下の3つだけ:

```
temp_77caa6bc   有効期限 2026/08/11 13:18
temp_7a1c5646   有効期限 2026/08/11 13:17
temp_b739b90d   有効期限 2026/08/11 13:23
```

これは**コンソールでクエリを実行したときの一時テーブル**で、1時間で消える。
エクスポートとは無関係。

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

## 3. 鍵をGitHubに登録する（3分）

1. サービスアカウント → **キー** → **鍵を追加** → **新しい鍵を作成** → **JSON**
2. JSONファイルがダウンロードされる
3. GitHub → リポジトリ → Settings → Secrets and variables → Actions → **New repository secret**
   - Name: `GCP_SERVICE_ACCOUNT_JSON`
   - Secret: **ダウンロードしたJSONの中身を丸ごと貼る**
4. ローカルのJSONファイルは消す

> **鍵をリポジトリにコミットしない。** `growth/input/.gitignore` は
> CSVしか見ていないので、鍵は自動では守られない。

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
