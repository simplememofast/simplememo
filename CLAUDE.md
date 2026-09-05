# SimpleMemo - Development Guide

## プロダクトビジョン（訴求を変える前に必ず読む）

**`../simplememo-ios/docs/VISION.md` — Capture OS。**
（GitHub: https://github.com/simplememofast/simplememo-ios/blob/main/docs/VISION.md）

このサイトは市場での名乗り方そのものなので、ページを足す・キャッチコピーを変える・
比較表を書くときは設計に入る前に読むこと。特に効くのは次の3点。

- **市場定義**（VISION §1）。狙うのは `Quick Capture App`（Captio / Drafts /
  Apple Notes と並べられる枠）ではなく **Universal Personal Capture Layer**。
  Obsidian も Notion も Reminders も競合ではなく Destination として書く。
- **AIを前面に出さない**（VISION §0）。売り文句は「AIが賢い」ではなく
  **「何も整理しなくても、思いついたことが正しい場所に残っている」**。
- **競争軸の移り先**（VISION §10）。起動0.4秒などの速度は引き続き資産だが、
  その先の軸は「何秒で保存できるか」ではなく
  **「保存について何回考えなければならないか」**（Zero-decision Capture Rate）。
  ただし **Zero-decision の数値はまだ実測が無い**。実測が出るまでサイトに数値を書かない
  （速度の実測値と同じ基準で扱う）。

## Deployment

- Cloudflare Pagesでホスティング (https://simplememofast.com)
- **mainブランチへのpushで自動デプロイ**される
- `claude/`ブランチのPRは、**SEO Validation が成功したときだけ**自動マージされる

## Workflow

1. `claude/`プレフィックスのブランチで作業する
2. 変更をコミットしてpushする
3. PRを作成する
4. SEO Validation が通ると auto-merge がマージする
5. Cloudflare Pagesが自動でデプロイする

### 自動マージの挙動（.github/workflows/auto-merge.yml）

mainへのマージ＝本番デプロイなので、検証を通ったコミットだけが出荷される
ように組んである。以下は意図的な設計。

- **CI完了を待つ** — SEO Validation の `workflow_run` で発火し、
  `conclusion == 'success'` のときだけマージする。
  （旧実装は `pull_request` で発火して即マージしており、検証結果を
  一切待たずに本番へ出ていた）
- **検証済みSHAだけをマージ** — `pulls.merge` に `sha` を渡している。
  検証後にpushした場合はマージされず、そのpushが起こす次の検証が拾う。
  **ただし「次の検証が拾う」は、そのPRがまだ開いているときだけ成り立つ。**
  2026-09-04、PR #851 で実際に外れた —— 検証が緑になった瞬間に auto-merge が
  検証済みSHAをマージしてPRを閉じ、**その後にpushした1コミットが拾われないまま
  ブランチに取り残された。**マージ済みPRは再利用できないので、
  取り残しは新しいPR（#852）を立て直すしかない。
  **短い間隔で2回pushすると、この競合に当たる。**同じPRへ追加pushしたときは、
  **マージされたかを内容で確かめること** —— auto-merge は squash なので、
  コミットIDの祖先判定（`git merge-base --is-ancestor`）では確かめられない。
- **draft PR は対象外** — 出荷を保留したいときは draft にしておけばよい。
  Ready にすると、次の検証成功時にマージされる。
- **ワークフローファイルを触る PR は、ブランチを切った後に main で同じファイルが動くと
  マージできない（読み。裏は取れていない）** —— 2026-09-05、PR #938（`seo-check.yml` に
  1行追加）で auto-merge が2回 `403 refusing to allow a GitHub App to create or update
  workflow .github/workflows/seo-check.yml without workflows permission` を返した。
  同じ日に同じトークンで押した #933（`obsidian-autopilot.yml` を変更）や、
  #851 / #859 / #877 / #935（いずれも `seo-check.yml` を変更）は github-actions[bot] が
  そのまま squash できている。**6件で違うのは1つ**で、#938 だけは PR を開いた（10:39Z）
  後に #935（10:41Z）が main 側で同じ `seo-check.yml` を変えていた。GITHUB_TOKEN には
  `workflows` 権限が無いので、squash が作る3-way マージ後の内容（どのコミットにも無い
  新しい内容）を書こうとして拒まれる、と読んでいる。**6件と矛盾しないだけで、
  GitHub の仕様として確かめたわけではない**（辻褄が合うことは原因の証明ではない）。
  直し方は main を取り込んで押し直すこと —— head のワークフローの内容がマージ結果と
  一致すれば、次の検証成功で auto-merge が拾う。**反証条件:** 取り込んで一致させても
  なお 403 なら、この読みは外れている。auto-merge の失敗 run は PR 側には何も出ない
  （PR は `mergeable_state: clean` のまま open で残る）ので、**開いたままの PR を見たら
  auto-merge.yml の run 一覧で `failure` を探す。**

`workflow_run` で起動するワークフローは常にデフォルトブランチの定義が
使われるため、auto-merge.yml 自体を変更した場合、その変更はmainに
マージされて初めて有効になる。

## Site Structure

- 静的HTMLサイト（日本語/英語の2言語対応）
- ルートにindex.html（日本語）、en/index.html（英語）
- robots.txt, sitemap.xml あり
- JSON-LD構造化データ、FAQ、hreflangタグ実装済み
