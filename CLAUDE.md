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

## 対外的な名乗り（外部へ何か送る前に必ず読む）

**このリポジトリは public。開発者個人の実名を、コード・文書・コミットメッセージ・
PR本文・そして外部へ送る本文のどこにも書かない。**

対外的に使ってよいのは次の3つだけ。

| 用途 | 使う表記 |
| --- | --- |
| 送信者名・署名・本文の名乗り | `SimpleMemo Developer`（日本語なら「シンプルメモ開発者」） |
| 個人名の記入が必須の欄だけ | `AI ATAKA` |
| 会社名 | 株式会社ユリカ / YURIKA, K.K. |

返信先は `support@simplememofast.com`。詳細は私有の identity policy が正本で、
ここはその要約。**迷ったら送らずに人に確認する。**

対象は、問い合わせフォーム・掲載依頼・プレスリリース・寄稿提案・レビュー依頼・
awesome系リストのPR本文・外部サービスのプロフィール欄など、**社外の人が読む全て**。

**送信直前に、送信者欄・本文・署名・引用・添付名・画像を読み戻して照合すること。**
フォームは入力と送信が一瞬なので、書いた直後の自分の文面を信用しない。

> 2026-09-22、この規則を読まずに4媒体へ実名入りで送信した。送信済みは取り消せない。
> 経緯は `docs/seo/directory-registration-2026-09.md` §5.8。
> 規則が私有 Runbook と下書き文書にしか無く、ここに無かったことが直接の原因。

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


## /autopilot/ の自律スコアは日付で動く（2026-09-19）

**公開ページを1日更新しないと、main も全PRも同じ6件で落ちる。**
PR側の変更が無関係でも落ちるので、原因がPRに出ない。

`/autopilot/` §5 のスコアは `scripts/autonomy-score.mjs` が `todayJst()` 基準で計算する。
**同じデータのまま日付だけ変えると値が動く**（実測）:

    09-16 47.65   09-17 48.23   09-18 48.48   09-19 48.09   09-20 47.60

`scripts/check-autopilot-page.mjs` は `autonomyScore(loadScoreContext())`＝**今日**の値と
ページの数字を突き合わせる。**ページの `data-decision-date` は見ていない。**
だから JST の日付が変わった瞬間にページは「古い」判定になる。

2026-09-18T15:00Z（JST 09-19 00:00）以降、main（`3bd3c5b`）と open PR 5本が全滅した。
PR #1459 のCI失敗もこれで、**中身は無関係**（main と #1459 のマージツリーで検査の出力が
バイト単位で一致することを確認した）。

### 直すはずの自動機構が、PRを1本開いたままにしていたせいで止まっていた

`scripts/decision-monitor.mjs` の `--apply` は冒頭でこれを通る:

    const pending = pendingPublication();
    if (pending.length) { …'waiting_for_publication'… ; return; }

head が `Codex/decision-observe-*` の open PR が**1本でもある**と、`publishReport()` に
到達しない。PR #1430 が 2026-09-16 から開きっぱなしで、15分毎の run が **4.7秒で return**
し続けていた（run 35406523045）。**その #1430 自身は当日の別検査（`台帳が 2 日書かれていない`）
で落ちてマージできず**、自分で自分を塞いでいた。

**open PR が全部同じ6件で落ちていたら、まず main を疑う。**
`node scripts/check-autopilot-page.mjs --check` を main で走らせれば1分で分かる。

### 直し方

**手で数字を置き換えない。**`node scripts/decision-monitor.mjs --publish-report` が正。
成分の本文（出荷◯件・故障◯件・週◯回）も同じ生成器が一緒に書き換えるので、
**点数だけ直すと本文が取り残される。**ページを変えたら
`python3 scripts/generate_sitemap.py` も同じコミットに入れる。

**`Codex/decision-observe-*` を merge で更新しない。**main を merge すると、マージコミットが
first-parent 比較で `/en/`・`/en/blog/`・`/blog/fastest-memo-app-benchmark` など
**無関係ページの `lastmod` まで動かす**（実測: `sitemap-en.xml` が3行）。
`pendingPublication()` の `reportSitemapChange` スコープを外れるので、その形でマージすると
Monitor は15分毎に `unverified scope` で**落ちる** —— 詰まりが「止まる」から「失敗する」に
変わるだけで良くならない。**rebase で載せ替える。**

**生成器のテンプレートに無い文言を、ページへ手で足さない。**2026-09-19、PR #1461 が ep の本文に
分母を足した（「エスカレーション**26件のうち**必要性を判定済みなのは23件」）。
`renderReport()` の `notes.ep` にその分母は無いので、**Monitor が復帰した最初の run で消える。**
残したいなら `scripts/decision-monitor.mjs` 側に入れること（`c.ep.precision.n` に 26 が入っている）。

### 2026-09-24 — 反証条件が満たされた。赤窓は残っていない

**上の節が置いた「窓（15:00Z〜日次同期）は毎晩赤」という読みは外れ。**
5晩ぶんの SEO Validation を数えたら、窓の中で緑に終わった run が並んでいる:

    09-20 15:10Z success   09-21 15:15Z success   09-22 15:07Z success
    （いずれも Codex/decision-observe-* ＝ Monitor 自身のPR）

**Monitor は JST 0時の7〜15分後に走って `publishReport()` を通している。**
PR #1430 を閉じた時点で窓は9時間から十数分に縮んでいて、**構造は残っていなかった。**
9時間という形が成り立っていたのは、Monitor が詰まっていた 09-16〜09-19 の4日間だけ。

**「構造は残っている」と書いたのは、詰まりが解ける前の状態を一般化したから。**
1晩の観測から毎晩の形を推定し、反証条件だけ書いて放置した。
**反証条件を書くのは確かめるまでの仮置きであって、確かめたことにはならない。**

### 境界で落ちるのは、スコアより先に sitemap の lastmod

窓の中の失敗を1件ずつ開いたら、**中身が違った。**09-22 15:22Z（run 35746908253）は
自律スコアではない:

    WRONG LASTMOD sitemap-ja.xml: https://simplememofast.com/: 2026-09-22 -> 2026-09-23
    （/contact・/legal・/en/ 系も同じ。計7件）

`lastmod` は**コミット日時の JST 日付**から引く。JST 0時をまたいでコミットを足すと、
手元で生成済みの sitemap の日付だけが古くなる。同じブランチが29分後（15:51Z）に
緑で通っているので、**直し方は push の直前に `python3 scripts/generate_sitemap.py` を
もう一度回すだけ。**

**時刻だけで「窓の赤」とまとめない。**同じ時間帯の 09-23 15:14Z（run 35880089345）は、
日付と無関係なベンダー規約の未確認8社で落ちている。この時間帯は他の鮮度ゲート
（言及ウォッチの10日上限など）も一緒に鳴るので、**落ちた時刻ではなく落ちたステップで
切り分けること。**

### main への push で run が起きないのは、故障ではない

2026-09-19T02:35Z 以降、**全ワークフローを通して main の push run が1本も無い。**
その間に #1478〜#1555 がマージされている。これを「CIが止まった」と読みかけたが、
`auto-merge.yml` の105行目に理由が書いてある —— `GITHUB_TOKEN` によるマージ push は
GitHub の再帰防止でワークフローを発火させない。だから **auto-merge 自身が
IndexNow 通知まで責任を持つ。**設計どおりである。

**ただし補われているのは IndexNow だけ。**PageSpeed Audit / GSC Crawled URL Checks /
Autopilot Health の main push 分は走らない。**意図的かどうかは未確認。**

**run が無いことを故障の証拠にしない。**このファイルが 08-26 / 08-27 / 09-19 と
繰り返している誤りと同じ形で、あと一歩で4回目だった。

## Site Structure

- 静的HTMLサイト（日本語/英語の2言語対応）
- ルートにindex.html（日本語）、en/index.html（英語）
- robots.txt, sitemap.xml あり
- JSON-LD構造化データ、FAQ、hreflangタグ実装済み

## Homepage performance assets

The Japanese and English homepages inline the shared styles at their original
cascade positions and use page-specific Noto subsets and responsive AVIF sources.
Shared source CSS and all original image fallbacks remain authoritative.
After editing either homepage, its source CSS, fonts or banner images, run:

```sh
python3 -m pip install fonttools==4.63.0 brotli==1.2.0 Pillow==12.3.0
python3 scripts/perf/build_home.py --write
python3 scripts/perf/build_home.py --check
node scripts/check-css-version.mjs
```

Commit the changed HTML, content-addressed `assets/home-perf/` files and manifest
together. The existing SEO CSS check rejects stale inline CSS, missing/corrupt
assets and an outdated glyph inventory. Do not remove analytics or gate content
on user-agent strings to improve scores. PageSpeed Audit measures without such
bypasses; lab scores are not CrUX field data.
