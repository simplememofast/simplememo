# トップページのキャッシュ契約：本番の前と後の確かめ方（2026-11-12）

## 何が変わったか

- **本番の前**：SEO Validation の seo-core で、`node --test scripts/cache-contract.test.mjs` を流す。
  - 外部への通信はせず、毎回同じ結果になる。約 2 秒で終わる。
  - auto-merge は SEO Validation の成功を待つので、ここで落ちれば出荷されない。
- **本番の後**：`Homepage Asset Cache Verification`（`.github/workflows/home-perf-cache.yml`）は、本番だけを測る。
  - 毎日・手動・main への push で動く。PR では動かない。
- PR のときにプレビュー（`*.simplememo-596.pages.dev`）を取りに行く手順は、やめた。

## なぜ

- プレビューは、2026-10-20 から Cloudflare Access の内側にある。CI は資格情報を持たない（2026-11-12 に決めた）。そのため、プレビューを取りに行く手順は、Access のログイン画面で必ず落ちていた。
- しかも、その赤はマージを止めていなかった。auto-merge が見るのは SEO Validation だけで、#2313 は赤のまま出荷された。
- 危ない設定の元（`_headers`・`functions/`・`_redirects`）は、旧ワークフローが動く条件のファイルに入っていなかった。
- キャッシュの設定は、取り返しがつかない。次のような文書は、読者のブラウザに何か月も残りうる。
  - 長い・immutable の方針が付いた文書
  - 遠い Expires が付いた文書
  - 鮮度の指定が無い文書（経験的な再利用）

## 本番の前に確かめること（`scripts/cache-contract.test.mjs`）

リポジトリにある全部の HTML の文書（約 2,500）について、Pages が実際に送る応答を手元で組み立てて確かめる。

1. **`_headers`** は、Pages 自身の解析と照合を写した `scripts/lib/pages-headers.mjs` で読む。
   - 写した元は、Cloudflare workers-sdk（wrangler 3.114.17 に同梱、MIT OR Apache-2.0）。
   - 2026-11-12 に元のコードと突き合わせ、食い違いは 0 件だった。
     - 解析・組み立て・照合：3,002 通りの入力、照合 1,458,972 回
     - ヘッダの付け方：45,000 回
   - Pages が無視・置き換え・破棄する形は、落とす。
     - 無効な行
     - パスの重複（2 つ目が 1 つ目を丸ごと置き換える）
     - コンパイルできない規則
     - 鮮度のヘッダの値の中の URL プレースホルダー（`max-age=:ttl` など）
2. **Functions** は、Pages の振り分けを写した `scripts/lib/pages-functions.mjs` で組み立てる。そのうえで、実際の middleware とルートを動かす。
   - 写した元は、wrangler の generateConfigFromFileTree と、テンプレートの router。
   - 照合には、wrangler が固定している path-to-regexp 6.3.0（MIT）を、そのまま取り込んで使う（`scripts/lib/path-to-regexp.mjs`）。
   - そのため、次の Pages の動きも再現する。
     - `[x]`・`[[x]]`（0 個以上）
     - 大文字小文字を区別しない照合
     - `_middleware_`
     - `onRequest` と `onRequestGet` などを、すべてつなぐこと
   - 次の形は落とす。
     - `context.env` を読む Function（本番の値が分からない）
     - 同じルートを 2 つのファイルが受け持つ形（読み込み順で結果が変わる）
     - 文書を受け持つのに Node で動かせない Function（`.ts`・`.tsx`・`.jsx`）
     - `_worker.js`（advanced mode）
   - GET を受けるルートの Function は、代表のパスで 1 回ずつ動かす。HTML を返したら、同じ契約を当てる。
3. **要求の形**は、各文書に次の 5 通りを流す。どれか 1 つでも契約を破れば落とす。
   - 素の GET
   - ブラウザの遷移（Accept・Sec-Fetch-*）
   - HEAD
   - クエリ付き
   - 条件付き（ETag が一致して 304）
4. **Functions を通らない場合**（`_routes.json` の除外、Functions の fail-open）に備えて、`_headers` だけの応答も確かめる。
5. **契約**
   - 2xx の文書は、鮮度をはっきり書くこと（`no-cache`・`no-store`・`max-age` のどれか）。
   - immutable と、3600 秒を超える max-age・s-maxage は不可（`no-cache` が無いときの stale-* も同じ）。
   - Expires は不可。304 にも同じ制限を当てる。
   - `/` と `/en/` は、`public, no-cache` ちょうど。
6. 最上位に `404.html` が必ずあること。無いと、Pages は存在しないパスすべてに `/index.html` を返す（SPA）。
   - `_redirects` の 200 の書き換えは、元のパスと、それに重なる `_headers` の規則のパスも、文書として確かめる。
7. home-perf の middleware と、本番のワークフローの形も確かめる。`scripts/perf/` の既存の単体テストと形のテストを取り込んで、一緒に流す。

自己テストでは、点検（2 回・のべ 3 人）と、その後の見直しで見つかった抜け道 20 通りが止まることを、毎回確かめる。止まった理由は、CI のログに 1 行ずつ出る。正当な変更 8 通りが通ることも、毎回確かめる。

## 本番の後に確かめること（`home-perf-cache.yml`）

- `https://simplememofast.com` に対して、`scripts/perf/cache_headers.cjs` を流す。
  - 確かめるのは、33 資産のバイト・ハッシュ・方針・MIME と、`/`・`/en/`・manifest・404・If-None-Match への 304。
- push のときは、このコミットの本番デプロイが成功するまで待つ（最大 30 分。一時的な API の失敗は待ち続ける）。
  - 本番デプロイは、アプリ 85455 が出す「Cloudflare Pages」のチェックのうち、要約に「Branch Preview URL」が無いもの。
  - 成功した後も 8 分待ってから測る。#1434 では、成功の 7 秒後に古い方針が返り、7.5 分後に新しい方針になった。
- 失敗したら、5 分おいて 1 回だけやり直す。本当の退行なら、2 回とも落ちる。
- 各手順に時間切れがある（待ち 35 分、測定 25 分、全体 80 分）。手順の時間切れは失敗として記録されるので、定期実行の失敗として Cron Health が Issue にする。
- 同時実行の組は、起動のしかたごとに分けた。push や手動の実行が、待っている定期実行を置き換えないようにするため。
- auto-merge のマージでは push の実行が起きない。マージ直後に本番を確かめたいときは、手動で 1 回起動する。

## 分かっている限界

- 時刻・Cookie・乱数・`request.cf` で振る舞いを変える Function は、手元の 1 回の実行では見えない。
- Node で動かせない（`.ts`・`.tsx`・`.jsx`）ルートの Function が、文書以外の新しい URL で HTML を返す場合は、確かめられない。文書を受け持つ場合は落とす。
- リポジトリの外の設定は、本番の後の確かめでしか見えない（Cloudflare の Cache Rules・Browser Cache TTL・Transform Rules など）。
- エッジのキャッシュに固有の挙動も、本番の後の確かめでしか見えない。点検役の観測では、CDN がキャッシュする種類のファイルで、最後の規則の値だけが返る例があった。

## 残したもの

- 承認付きの経路（`home-perf-cache-approved.yml`、`scripts/perf/cache_access_*`、Environment `preview-cache-ci`）は、休眠のまま残した。
  - その回帰テストは、home-perf の middleware や資産が変わったときにも流れるようにした（`preview-cache-security-tests.yml` の paths）。
- 期限切れの資格情報
  - GitHub の Environment の secret 2 つは、2026-11-12 に削除した。
  - Cloudflare の service token は、オーナーがダッシュボードで削除する（台帳 `data/credential-expiry.json` の手順）。
- Cron Health の「定期実行が止まった」の見張り（`scripts/lib/cron-silence.mjs`）には、登録していない。
