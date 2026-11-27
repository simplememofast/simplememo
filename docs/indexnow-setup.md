# IndexNow Setup — simplememofast.com

## 概要

IndexNow は、ページの新規公開・更新・削除を検索エンジン（Bing, Yandex, Naver, Seznam）に即座通知するプロトコルです。

## セットアップ状況

- 使用中の鍵: `dda35fda390ffabbcce681394b3a57cc`（検証ファイル `dda35fda390ffabbcce681394b3a57cc.txt` をサイトルートにコミット済み・本番配信済み）
- 鍵の解決順（2026-08-11〜）: `.indexnow-key`（gitignore 済みのローカル上書き）→ ルートの `<32hex>.txt`（中身=ファイル名のもの）。
  ルートに鍵検証ファイルが**複数あるとスクリプトはエラーで停止**する（過去に鍵重複で通知が分裂した再発防止。2026-08-11 に未使用の2世代 `6515127e…` / `8a3fb375…` を削除し1つに統一）
- 通知スクリプト: `scripts/indexnow-notify.js`
- CI自動通知: `.github/workflows/seo-check.yml` に組込み

## 使い方

```bash
# 直近1コミットで内容が変わった .html を通知（既定）
node scripts/indexnow-notify.js

# 直近Nコミット（first-parent）で内容が変わった .html を通知
node scripts/indexnow-notify.js --since 3

# 選択結果だけ表示して送信しない（他モードと併用可）
node scripts/indexnow-notify.js --since 3 --dry-run

# 特定のURLを通知
node scripts/indexnow-notify.js /blog/new-post

# 全ページを通知
node scripts/indexnow-notify.js --all

# キー再生成（.indexnow-key が無い場合のみ。<key>.txt の配備・コミットが別途必要）
node scripts/indexnow-notify.js --generate-key
```

`--since N` は 2026-08-11 に**日数（mtime）判定→gitコミット差分判定**へ変更した。
CI の新規 checkout では全ファイルの mtime が checkout 時刻になり、main push の
たびに実質全ページを通知していたため。マージコミットは首親差分（そのマージが
実際に変えたページ）になる。2026-11-28 からは、その差分のうち内容が変わったページだけを
通知する（次の節）。

## 何を通知するか（2026-11-28〜）

`--since N`（引数なしの既定 `--since 1` も同じ）は、差分のある `.html` のうち
**内容が変わったページだけ**を通知する。内容の定義は sitemap の lastmod と同じ
`content_signature`（`scripts/sitemap_lastmod.py`）で、何を数えるかは
[SITEMAP-LASTMOD.md](seo/SITEMAP-LASTMOD.md) の「何を更新として数えるか」のとおり。
本文・見出し・リンク先・画像や動画の参照・検索用のメタデータ・JSON-LD の内容は数え、
CSS/JS の参照・class/style・著作権の年・計測用のパラメータ・JSON-LD の日付は数えない。
変更前後の blob の署名を比べるのは `scripts/indexnow_content_changes.py` で、
通知スクリプトがこのパスで呼ぶ（名前を変えない）。

- **スクリプト・CSS・class を全ページで差し替えるマージは、ほとんど通知しなくなる。**
  #2381・#2385・#2396 は当時 2,288・2,301・2,106 URL を送っていた（auto-merge の
  `indexnow-after-merge` のログ。run 44092310654・44203358729・44453197529、3回とも HTTP 200）。
  同じマージを今のスクリプトで再生すると 11・0・4 URL になる。残るのは本文かリンク先が
  実際に変わったページで、#2381 は /obsidian/（生成翻訳8ページを含む）冒頭のボタンのリンク先と
  /privacy・/en/privacy の本文、#2396 は /legal・/privacy（日英）の本文
- **ナビ・フッターの文言やリンクを変えるマージは、今も変えたページをほぼ全部通知する。**
  本文とリンク先は内容に数えるので、これは意図どおり（同じマージで sitemap の lastmod も動く）。
  言語切替を書き換えた #2028 は、再生しても 452 URL のまま
- 消えたページ・noindex・`SKIP_DIRS`・`404.html` を通知しないのは従来どおり。ただし
  ジョブサマリの「noindex 除外」は、内容が変わったページのうちの件数になった
  （#2381 の再生では 159 件 → 8 件）
- **比較に失敗したら、従来どおり変更 `.html` の全件を通知する**（python3 が無い・5分で
  終わらない・blob を読めない・比較の出力が入力と合わない、など）。ジョブサマリには
  「内容の比較に失敗（理由）: 従来どおり変更 .html の全件を通知」と出る。精度は落ちても、
  通知は落とさない
- `--all` と URL の指定は、従来どおり内容を比べない
- 自己テストは `node scripts/indexnow-notify.js --selftest`（比較器の `--selftest` も中から回す）。
  SEO Validation の条件の付かないステップで毎回走る

### 送る前に、本番の公開を待つ（最大5分）

通知が本番の配信より先に出ることがあった（#2381 は送信が Cloudflare Pages の配備チェックの
完了より約4秒、#2385 は約19秒早かった。配備チェックの時刻は growth/data/annotations.json の記録、
送信の時刻は上の run のログ）。そこで送信の前に、本番がマージ後の内容を配信しているかを確かめる。
**どの結果でも送信は止めない** —— 送信ステップは `continue-on-error: true` なので、
ここで止めても誰にも見えず、通知だけが消える。

- 確かめるのは通知する URL のうち**最大3件**（更新したページを先に、次に新しいページ）。
  **10秒おき**に、**最大5分**（次の確認が5分を過ぎるなら、そこでやめる）。1回の取得は15秒で打ち切る
- 名乗りは `User-Agent: SimpleMemo-IndexNow/1.0`。名乗りを変えるときは、本番が 403 を
  返さないことを確かめる（Python-urllib の既定の名乗りは 403 になる。2026-11-28 に確認）
- 公開とみなすのは、どれか1件が HTTP 200 で、内容の署名がマージ後と一致したとき。
  更新したページなら、マージ前と違うときも公開とみなす（後のデプロイに追い越されても
  待ち続けない）。404・リダイレクト・取得の失敗は「まだ」
- **403・429・Cloudflare の確認画面（`cf-mitigated` ヘッダ）は待っても変わらない**ので、
  確かめた URL がすべてそうなった回で待ちをやめて送る。5分で確認できなかったときも、そのまま送る
- **待たない**とき: `--dry-run`、内容の比較に失敗した回（比べる署名が無い）、通知が0件、
  `--all`、URL の指定
- 結果はジョブサマリに1行で残る:「本番の公開: 確認済み（N 秒待機）」
  「本番の公開を5分以内に確認できず、そのまま送信（最後の観測: …）」
  「本番の公開を確認できず（HTTP 403 など）、そのまま送信」
  「本番の公開を確かめる途中で失敗（…）、そのまま送信」

### 過去のマージで再生して確かめる（`--dry-run` だけ）

使い捨ての `git clone --shared` で過去のマージを再生する（作業中のリポジトリでは checkout しない）。
**必ず `--dry-run` を付ける** —— 付けないと、過去のマージの URL を本当に送る。
dry-run は本番の確認も送信もしない。

```bash
tmp=$(mktemp -d)
git clone -q --shared --no-checkout . "$tmp/r"
git -C "$tmp/r" checkout -q --detach <マージのコミット>
cp scripts/indexnow-notify.js scripts/indexnow_content_changes.py scripts/sitemap_lastmod.py "$tmp/r/scripts/"
(cd "$tmp/r" && node scripts/indexnow-notify.js --since 1 --dry-run)
rm -rf "$tmp"
```

`cp` を飛ばすと、そのコミットにあったスクリプトの選び方になる。上の 2,288・2,301・2,106 は、
この形で当時のログと一致した。`sitemap_lastmod.py` も写すのは、内容の定義を今のものに
そろえるため。

**#469（2026-08-11）より前のマージでは `cp` を飛ばさない**。そのころのスクリプトは `--dry-run` を
知らず、付けても本当に送る（`--since` が mtime の日数判定なので、clone した直後はほぼ全ページ）。

## CI自動通知

経路は3つある（GITHUB_TOKEN によるマージ push はワークフローを発火させないという
GitHub の再帰防止仕様のため、1つでは覆えない）:

1. **auto-merge 経由のデプロイ（通常経路）**: `auto-merge.yml` がマージ成功後に
   マージコミットを checkout し、`--since <マージ数>` で通知する。マージしなかった
   run では動かない。通知失敗はマージ結果に影響しない (`continue-on-error: true`)
2. **main への直接 push**: `seo-check.yml` の最後のステップで `--since 1` で通知。
   checkout は `fetch-depth: 2` が前提。複数コミットを一度に push した場合は
   最後の1コミット分のみになるため、必要なら手動で `--since N` を実行
3. **オーナー承認を待ってマージした自律運転の PR**: `auto-merge.yml` の `indexnow-after-approval` が、
   `merge-after-approval` がマージしたときだけ `--since 1` で通知する（`continue-on-error: true`）

どの経路も変更ファイル数（うち内容の変更なし・noindex除外の件数）・通知URL一覧・本番の公開の確認結果・
送信結果を**ジョブサマリに出力**する。内容の比較に失敗した回は、その理由も出る。

## 注意事項

- Google は IndexNow 非対応（Googlebot は独自クロール）
- Bing, Yandex, Naver, Seznam が対応
- API制限: 1回のリクエストで最大10,000 URL
- 失敗ログ: `scripts/indexnow-failed.log` に記録

## 稼働確認の記録

### 2026-08-20（P2定期確認）— 稼働中・復旧不要

auto-merge 経由（上記経路1）の実ログで確認した。

- 対象run: `Auto-merge Claude PRs` run 32342962897（job 96345595824）・2026-08-20 07:12 UTC・PR #518 のマージ
- `IndexNow notify (merged diff)` ステップが実行され、通知URL一覧（/en/ 配下含む数十件）を出力し、
  **「結果: 送信済み（HTTP 200）」** で完了
- 直近30 runのうちマージを実行しなかった run では同ステップは skipped になるが、これは
  `merged_count == 0` の設計どおり（通知対象が無いだけで停止ではない）
- 補足: GitHub API 上、workflow_run 起動の run は `head_branch` が常に `main` と表示される。
  claude/ ブランチ判定はスクリプト内の `payload.workflow_run.head_branch` で行われており、
  API表示だけを見て「claude/ ブランチのマージが起きていない」と誤読しないこと

次回確認時もこの節に追記する（runリンクとステップ結果の2点だけでよい）。

## TODO (人間の作業)

- [x] `.indexnow-key` を `.gitignore` に追加するかどうか判断 → 追加済み（ローカル上書き用。CI は コミット済みの鍵検証ファイルから解決する）
- [ ] Bing Webmaster Tools でサイト所有権を確認
- [ ] デプロイ後にキー検証ファイル (`dda35fda390ffabbcce681394b3a57cc.txt`) がアクセス可能か確認
