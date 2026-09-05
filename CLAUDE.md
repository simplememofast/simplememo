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
- **ワークフローファイルを触る PR は、head の blob がマージ結果の blob と一致しないと
  マージできない（読み。GitHubの仕様としては未確認）** —— 2026-09-05、PR #938
  （`seo-check.yml` に2行追加）で auto-merge が2回 `403 refusing to allow a GitHub App
  to create or update workflow .github/workflows/seo-check.yml without workflows
  permission` を返した。main へ rebase して押し直したら**同じ内容がそのまま通った**。
  `seo-check.yml` の blob を測ると、効いている変数が1つに絞れる:

        403時   head 80c1eb8 = 563edd3   main 067ddcd = 19350bc   squashの結果 = 9e14cea
        成功時  head dab0e07 = 9e14cea   main 562e52d = 19350bc   squashの結果 = 9e14cea

  **書かれる内容は両方とも 9e14cea で、1バイトも違わない。**違うのは
  **head のコミットがその blob を既に持っているかどうか**だけ。403 の側では head が
  563edd3 で、GITHUB_TOKEN（`workflows` 権限なし）が3-wayマージで**新しく作った内容を
  書く**形になる。rebase 後は head の blob がそのまま採用されるので、App は何も
  authoring していない。**これが discriminator だと読んでいる。**

  **最初はここに「squash が作る 3-way マージ後の内容（どのコミットにも無い新しい内容）を
  書こうとして拒まれる」と書いた。測ったら誤り。**内容は新しくない —— 20分後に
  同じ 9e14cea が問題なく書かれている。**「新しい内容だから」で説明していたら、
  次に同じ形が来たとき『内容は同じだから通るはず』と読み違える。**
  このファイルは 08-26 と 08-27 にも同じ種類の誤り（辻褄が合うことを原因の証明に使う）を
  している。**推測を書く前に blob を測る。**

  交絡は潰してある: 403 とマージの間に #939 / #940 が main に入ったが、どちらも
  ワークフローを触っていない（`seo-check.yml` の blob は 067ddcd → 562e52d で 19350bc の
  まま）。それでも**各条件1データ点ずつ**で、GitHub の仕様を読んで確かめたわけではない。

  **直し方:** main を取り込んで押し直す（rebase でも merge でもよい）。head の
  ワークフローファイルがマージ結果と同一になれば、次の検証成功で auto-merge が拾う。
  **反証条件:** 同一にしてもなお 403 なら、この読みは外れている。
  **失敗は PR 側に何も出ない**（PR は `mergeable_state: clean` のまま open で残り、
  チェックは全部緑に見える）ので、**開いたままの PR を見たら auto-merge.yml の
  run 一覧で `failure` を探す。**

`workflow_run` で起動するワークフローは常にデフォルトブランチの定義が
使われるため、auto-merge.yml 自体を変更した場合、その変更はmainに
マージされて初めて有効になる。

## Site Structure

- 静的HTMLサイト（日本語/英語の2言語対応）
- ルートにindex.html（日本語）、en/index.html（英語）
- robots.txt, sitemap.xml あり
- JSON-LD構造化データ、FAQ、hreflangタグ実装済み
