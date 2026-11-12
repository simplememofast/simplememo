# トップページのキャッシュ契約：本番の前と後の確かめ方（2026-11-12）

## 何が変わったか

- **本番の前**：SEO Validation の seo-core で、`node --test scripts/cache-contract.test.mjs` を流す。
  - 外部への通信はせず、毎回同じ結果になる。
  - auto-merge は SEO Validation の成功を待つので、ここで落ちれば出荷されない。
- **本番の後**：`Homepage Asset Cache Verification`（`.github/workflows/home-perf-cache.yml`）は、本番だけを測る。
  - 毎日・手動・main への push で動く。PR では動かない。
- PR のときにプレビュー（`*.simplememo-596.pages.dev`）を取りに行く手順は、やめた。

## なぜ

- プレビューは、2026-10-20 から Cloudflare Access の内側にある。CI は資格情報を持たない（2026-11-12 に決めた）。そのため、プレビューを取りに行く手順は、Access のログイン画面で必ず落ちていた。
- しかも、その赤はマージを止めていなかった。auto-merge が見るのは SEO Validation だけで、#2313 は赤のまま出荷された。
- 危ない設定の元（`_headers`・`functions/_middleware.js`・`_redirects`）は、旧ワークフローが動く条件のファイルに入っていなかった。
- キャッシュの設定は、取り返しがつかない。文書に長い・immutable の方針や遠い Expires が付くと、読者のブラウザに最大 1 年残る。

## 本番の前に確かめること（`scripts/cache-contract.test.mjs`）

Pages が実際に送る応答を、手元で組み立てて確かめる。

1. `_headers` は、Pages 自身の解析と照合の処理を写した `scripts/lib/pages-headers.mjs` で読む。写した元は、Cloudflare workers-sdk（wrangler 3.114.17 に同梱、MIT OR Apache-2.0）。
   - 次の驚きも、そのまま再現する。
     - 同じパスの 2 つ目の規則は、1 つ目を丸ごと置き換える。
     - 字下げした `https://` の行は、新しい規則になる。
     - `!Header`（空白なし）は無効。
     - `*` が 2 つの規則は捨てられる。
     - 2,000 字を超える行は無視される。
     - 最初の規則が値を置き換え、後の規則は値を足す。
     - 404 は `no-store` に置き換わる。
   - 2026-11-12 に、元のコードを取り出して突き合わせた。食い違いは 0 件だった。
     - 規則の解析・組み立て・照合：3,002 通りの入力、URL ごとの照合で 1,458,972 回。
     - ヘッダの付け方：45,000 回。
   - Pages が無視・置き換え・破棄する形は、黙って通さずに落とす。無効な行、パスの重複、捨てられる規則、ホスト名付きの規則が、それにあたる。
2. Functions は、文字で探さずに実際に動かす。
   - `functions/` の middleware を読み込み、Pages と同じ順につなぐ（ルートから深い順、最後に静的な応答）。
   - 計算した値、別のモジュールの定数、`Expires` も、そのまま結果に出る。
   - Node で動かせない形（`.ts`・`.tsx`・`.jsx`、`_worker.js`）や、文書のパスに当たる Function のルートは、落とす。
3. 確かめる文書は、リポジトリにある全部の `*.html` から作る（約 2,500）。`_redirects` の 200 の書き換えの元のパスも足す。
   - 各文書の最終的な応答について、次を確かめる。
     - Cache-Control に immutable が無く、max-age などが 3600 秒以下であること（今の `/verify`・`/compose` の 1 時間は通る）。
     - Expires が無いこと。
   - `/` と `/en/` は、`public, no-cache` ちょうどであること。
4. home-perf の middleware と本番のワークフローの形も確かめる。`scripts/perf/` の既存の単体テストと、形のテストを取り込んで流す。
   - home-perf の middleware：1 年の immutable、manifest の no-cache、304、マニフェストの sha256。

2026-11-12 の手元の確かめ（Node 24.22.3）。

| 試した変更 | 結果 |
|---|---|
| 最初の点検で通ってしまった抜け道 10 通り | すべて止まる |
| 正当な変更 4 通り | すべて通る |

- 抜け道 10 通りの内訳
  - Function が計算した値で長い方針を付ける
  - Function が Expires を付ける
  - Function が別のモジュールの定数を使う
  - `.jsx` の middleware
  - 2 つ目の `/*`
  - 字下げした `https://` の規則
  - `/assets/../en/*`
  - `/assets/` の下の HTML
  - 2,000 字を超える行
  - `*` が 2 つの規則
- 正当な変更 4 通りの内訳
  - Function の HSTS と Cookie の寿命
  - コメントの単語
  - `/*.mp4` の 1 年
  - 小文字の `cache-control`

## 本番の後に確かめること（`home-perf-cache.yml`）

- `https://simplememofast.com` に対して、`scripts/perf/cache_headers.cjs` を流す。
  - 確かめるのは、33 資産のバイト・ハッシュ・方針・MIME と、`/`・`/en/`・manifest・404・If-None-Match への 304。
- push のときは、このコミットの本番デプロイが成功するまで待つ（最大 30 分。一時的な API の失敗は待ち続ける）。
  - 本番デプロイは、Cloudflare Workers and Pages のアプリ（id 85455）が出す「Cloudflare Pages」のチェックで、要約に「Branch Preview URL」が無いもの。
  - 成功した後も、エッジが落ち着くまで 8 分待ってから測る。#1434 では、成功の 7 秒後に古い方針が返り、7.5 分後に新しい方針になった。
- 失敗したら、5 分おいて 1 回だけやり直す。本当の退行なら、2 回とも落ちる。
- 各手順に時間切れがある（待ち 35 分、測定 25 分、全体 80 分）。手順の時間切れは失敗として記録されるので、定期実行の失敗として Cron Health が Issue にする。
- 同時実行の組は、起動のしかたごとに分けた。push や手動の実行が、待っている定期実行を置き換えないようにするため。
- auto-merge のマージでは push の実行が起きない。マージ直後に本番を確かめたいときは、手動で 1 回起動する。

## 確かめていないこと・残したもの

- Pages の本番の基盤に固有の挙動（MIME の割り当て、圧縮と ETag、エッジのキャッシュ）は、本番の後の確かめでしか見ていない。
- 本番の観測では、CDN にキャッシュされる種類のファイル（.js・.css・.woff2・.txt）で、最後の規則の値だけが返る例があった（点検役の観測。理由は分からない）。文書（HTML）の値は、模型どおり結合されていた。
- 承認付きの経路（`home-perf-cache-approved.yml`、`scripts/perf/cache_access_*`、Environment `preview-cache-ci`）は、休眠のまま残した。
  - その回帰テストは、home-perf の middleware や資産が変わったときにも流れるようにした（`preview-cache-security-tests.yml` の paths）。
- 期限切れの資格情報
  - GitHub の Environment の secret 2 つは、2026-11-12 に削除した。
  - Cloudflare の service token は、オーナーがダッシュボードで削除する（台帳 `data/credential-expiry.json` の手順）。
- Cron Health の「定期実行が止まった」の見張り（`scripts/lib/cron-silence.mjs`）には、登録していない。登録するなら、その一覧の並びの決まりに従う。
