# トップページのキャッシュ契約：本番の前と後の確かめ方（2026-11-12）

## 何が変わったか

- **本番の前**：SEO Validation の seo-core で、`node --test scripts/cache-contract.test.mjs` を流す。外部への通信はせず、毎回同じ結果になる。auto-merge は SEO Validation の成功を待つので、ここで落ちれば出荷されない。
- **本番の後**：`Homepage Asset Cache Verification`（`.github/workflows/home-perf-cache.yml`）は、本番だけを測る。
  - 毎日 06:41 JST、手動、main への push の後に動く。
  - PR では動かない。
- PR のときにプレビュー（`*.simplememo-596.pages.dev`）を取りに行く手順は、やめた。

## なぜ

- プレビューは、2026-10-20 から Cloudflare Access の内側にある。CI は資格情報を持たない（2026-11-12 に決めた）。そのため、プレビューを取りに行く手順は、Access のログイン画面で必ず落ちていた。
- しかも、その赤はマージを止めていなかった。auto-merge が見るのは SEO Validation だけで、#2313 は赤のまま出荷された。
- 危ない設定の元（`_headers`・`functions/_middleware.js`・`_redirects`）は、旧ワークフローが動く条件のファイルに入っていなかった。10-20 以降に 10 回変わったが、一度も確かめられていない。
- キャッシュの設定は、取り返しがつかない。HTML やエラーのページに長い、または immutable の方針が付くと、読者のブラウザに最大 1 年残る。後から出す修正は、そのブラウザには届かない。

## 本番の前に確かめること（`scripts/cache-contract.test.mjs`）

1. `_headers` を、Pages の規則（`*` は `/` を含めて何にでも当たる、`! 名前` で前の値を外す）で評価する。
   - 文書とエラーのページ（`/`、`/en/`、`/index.html`、存在しないパス、`/404.html` など）に効く Cache-Control が、`public, no-cache` の 1 つだけであることを確かめる。
   - 2 つ以上の規則が当たる場合も落とす。Pages が値を結合するか上書きするかに頼らない。
2. 長い（1 日を超える）、または immutable の方針は、静的な資産の規則（`/assets/*`、`/*.css`、`/*.js` など）にだけ置ける。
3. Functions の中で長い、または immutable の方針を書いてよいのは、`functions/assets/home-perf/_middleware.js` だけ。
4. home-perf の middleware と、本番のワークフローの形を確かめる。`scripts/perf/` の既存の単体テストを取り込んで流す。
   - 1 年の immutable、manifest の no-cache、304 の扱い
   - マニフェストの sha256 と大きさ
   - 本番のワークフローの形

モデル化していない形の規則（ホスト名付き、プレースホルダー付き）が出てきたら、黙って通さずに落とす。そのときは、先にこのテストを広げる。

2026-11-12 に、わざと壊した 3 通りで落ちることを確かめた。

| 壊し方 | 結果 |
|---|---|
| `/en/*` に 1 年の immutable を足す | 2 件失敗 |
| ルートの middleware に長い方針を書く | 1 件失敗 |
| home-perf の middleware が manifest に immutable を付ける | 5 件失敗 |

## 本番の後に確かめること（`home-perf-cache.yml`）

- `https://simplememofast.com` に対して `scripts/perf/cache_headers.cjs` を流す。確かめる中身は次のとおり。
  - 33 資産のバイト・ハッシュ・方針・MIME
  - `/` と `/en/`
  - manifest
  - 404
  - If-None-Match に対する 304
- push で動いたときは、そのコミットの「Cloudflare Pages」が success になるまで待つ。古い版は測らない。
- デプロイの直後は、エッジが数分古い方針を返すことがある（#1434）。そのため、失敗したら 5 分おいて 1 回だけやり直す。本当の退行なら、2 回とも落ちる。
- 定期実行が失敗すると、Cron Health が Issue にする。

## 確かめていないこと・残したもの

- Pages の本番の基盤に固有の挙動（MIME の割り当て、ヘッダの合成、圧縮と ETag）は、本番の後の確かめでしか見ていない。本番の前に再現したいなら、`wrangler pages dev` で手元に配信する方法が候補になる（調べ役が手元で再現を確かめた。Linux の CI ではまだ確かめていない）。
- 承認付きの経路（`home-perf-cache-approved.yml`、`scripts/perf/cache_access_*`、Environment `preview-cache-ci`）は、休眠のまま残した。PR #2175 に固定されていて、期限も切れている。
- 期限切れの資格情報
  - GitHub の Environment の secret 2 つは、2026-11-12 に削除した。
  - Cloudflare の service token は、オーナーがダッシュボードで削除する（台帳 `data/credential-expiry.json` の手順）。
- Cron Health の「定期実行が止まった」の見張り（`scripts/lib/cron-silence.mjs`）には登録していない。登録するなら、その一覧の並びの決まりに従う。
