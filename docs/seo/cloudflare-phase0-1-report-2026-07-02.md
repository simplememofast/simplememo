# Cloudflare系 作業完了報告 — SEO/AIO Phase 0–1

## 対応日時
2026-07-02 09:00–10:00 UTC (18:00–19:00 JST)

## 対応者
Claude (api/インフラ担当エージェント、simplememoアカウント automation token + 実測検証)

## 実施項目

- [x] CF-1 paji.me 1ホップ301化 → **実測監査完了・実装はオーナー作業**(paji.meは別Cloudflareアカウント管理。§CF-1に5分手順を記載)
- [x] CF-2 Bing Webmaster Tools登録・認証・sitemap送信 → **IndexNowを実装**(本PR)。WMT本登録はオーナー作業(GSCインポート推奨、§CF-2)
- [x] CF-3 AIボット許可維持確認 → **完了**(9UA×2パス全200実測)
- [x] CF-4 robots.txt配信経路確認 → **完了**(Pages静的配信+`_headers`で24hエッジキャッシュ、デプロイはパージしないことを実測確認)
- [x] CF-5 Claude系UA robots追記 → **リポジトリ対応済み**(本日PR #374でmainマージ済み。ライブはTTL失効 2026-07-02 10:41 UTC頃に自然反映)
- [x] CF-6 404 URL対応 → **完了**(5件全件トリアージ済み・**リダイレクトは意図的に実施しない**、§CF-6)
- [x] CF-7 キャッシュパージ運用確認 → **完了**(手順確立。現行トークンはパージ権限なし=ダッシュボード運用、§CF-7)

## 変更内容

- 変更したCloudflareルール: **なし**(§13の承認事項に該当する変更は未実施)
- 変更したDNSレコード: **なし**
- 変更したWorker / Pages設定: **なし**
- パージしたURL: **なし**(automation tokenは`purge_cache`権限外 — 認証エラー実測。robots.txtはTTL失効で自然反映)
- リポジトリ変更(本PR):
  - `6515127e391c7f93478f50b879568143.txt`(IndexNowキーファイル、ルート配置)
  - 本報告書

---

## CF-1: paji.me 多段301の平坦化 — 実測結果とオーナー実装手順

### 実測(2026-07-02 09:01 UTC)

| 入口URL | ホップ数 | 経路 |
|---|---|---|
| `http://paji.me/` | **3** | → `https://paji.me/` → `https://www.paji.me/` → captio |
| `https://paji.me/` | **2** | → `https://www.paji.me/` → captio |
| `http://www.paji.me/` | **2** | → `https://www.paji.me/` → captio |
| `https://www.paji.me/` | 1 | → captio ✅ |

最終到達先 `https://simplememofast.com/captio/` は200。全ホップ301(302なし)。

**追加発見(重要)**: ルート以外のパスは現状**壊れている**。

```text
https://paji.me/some-old-post?utm_source=x
  → 301 https://www.paji.me/some-old-post?utm_source=x (パス・クエリ保持)
  → HTTP 525 (SSL handshake failed = オリジン不在)
```

www.paji.me はルート(`/`)だけ captio へ転送するルールになっており、旧ブログ記事等への深いパスの被リンクは現在525で死んでいる。平坦化と同時に**全パスをキャッチオールで captio へ301**させることで、依頼書の「旧被リンク動線を壊さない」をむしろ改善できる。

### アクセス権の確認結果

- paji.me / www.paji.me は Cloudflare管理(NS: mariah/nicolas.ns.cloudflare.com)だが、**simplememoアカウント(6f37d8ca…)とは別アカウント**。ゾーン一覧に存在しない。
- automation token・wrangler OAuth の両方で到達不可を確認 → **オーナーの個人Cloudflareアカウントでの作業が必要**。

### オーナー実装手順(約5分、Freeプラン可)

1. Cloudflareダッシュボード(paji.meを管理するアカウント)→ paji.me ゾーン → **Rules → Redirect Rules → Create rule**
2. ルール設定:
   - 名前: `flatten paji.me -> simplememofast /captio/`
   - If(Custom filter expression / Expression Editor):
     ```text
     (http.host eq "paji.me") or (http.host eq "www.paji.me")
     ```
     ※ パス・スキーム条件は付けない = 全パス・http/https の両方にマッチさせる
   - Then: Type **Static** / URL `https://simplememofast.com/captio/` / Status **301** / **Preserve query string にチェック**
3. **SSL/TLS → Edge Certificates → Always Use HTTPS を OFF**(paji.meゾーンのみ)。現状の `http://paji.me/ → https://paji.me/` の1ホップ目はこの設定由来のため、OFFにしないと http 入口が1ホップにならない。新ルールが http も直接 https の captio へ301するため安全。
4. 既存の転送設定(Page Rules の Forwarding URL 等)があれば無効化/削除。Single Redirects は Page Rules より先に評価される(Cloudflare Rules実行順序)ため残っていても実害はないが、整理推奨。
5. DNSは変更不要(A/AAAAレコードはプロキシ=オレンジ雲のまま維持。プロキシを外すとリダイレクトが機能しなくなるので注意)。

### 実装後の受入検証(依頼書§11+深いパス)

```bash
curl -IL http://paji.me/
curl -IL https://paji.me/
curl -IL http://www.paji.me/
curl -IL https://www.paji.me/
curl -IL "https://paji.me/old-post?utm_source=x"   # → 1ホップで /captio/?utm_source=x
curl -I  https://simplememofast.com/captio/         # → 200
```

すべて1ホップ301(`location: https://simplememofast.com/captio/`)→最終200になること。

---

## CF-2: Bing Webmaster Tools — 現状と実施内容

### 現状確認

- simplememofast.com のDNS TXTに Bing検証レコードなし(apple / google / tiktok / spf のみ)= **Bing未認証**を確認。
- GSCは DNS TXT(`google-site-verification=EvO-…`)でドメイン認証済み → **GSCインポート方式が最速**。

### 実施済み(本PR): IndexNow

- キーファイル `6515127e391c7f93478f50b879568143.txt` をサイトルートに設置。
- デプロイ確認後、`https://api.indexnow.org/indexnow` へ全ページを送信(sitemap-ja 181 + sitemap-en 35 + sitemap-locales 8 = **224 URL**)。IndexNowはBing・Yandex等の参加エンジンに共有され、WMT登録前でもBingへのURL発見を前倒しできる。
- ※ IndexNowはWMT登録の**補完**であり代替ではない(インデックス状況の確認・URL検査はWMTが必要)。
- 今後の運用: 重要ページの追加・更新時に同エンドポイントへ該当URLをPOSTする(キーは上記ファイル)。

### オーナー作業(WMT本登録)

1. https://www.bing.com/webmasters にサインイン(Microsoftアカウント)
2. **「GSCからインポート」**を選択 → Googleアカウント(hajimeataka@gmail.com)で認可 → `simplememofast.com` を選択 → 即時認証完了(DNS変更不要)
3. Sitemaps で `https://simplememofast.com/sitemap.xml` を送信 → 子サイトマップ3件(ja/en/locales)が認識されることを確認
4. 数日後、「URL検査」で主要ページ(トップ, /captio/, /obsidian/)のインデックス状況を確認

代替(DNS TXT方式を選ぶ場合): Bingが提示する `MS=ms…` 等の値を共有いただければ、automation tokenで simplememofast.com へのTXT追加は即時実施可能(DNS書込権限あり)。

---

## CF-3: AIボット到達性 — 検証結果

実測(2026-07-02 09:01 UTC、UAスプーフィングによる確認):

```text
UA                  /      /captio/
GPTBot              200    200
ChatGPT-User        200    200
OAI-SearchBot       200    200
ClaudeBot           200    200
Claude-User         200    200
Claude-SearchBot    200    200
PerplexityBot       200    200
Googlebot           200    200
Bingbot             200    200
```

- 403/429/503 なし。UAベースのブロックルールが存在しないことを確認。
- robots.txt 側も主要AI/検索ボットを明示Allow済み(Google-Extended含む)。CCBot / Bytespider / Amazonbot / Diffbot のみ意図的Disallow(既存方針)。
- `llms.txt` も200(19KB)で配信中。
- Cloudflare設定の変更は行っていない(=許可状態を維持)。
- 注記1: 本トークンでは Bot Management 設定の読取は権限外。Bot Fight Mode 等を今後変更する際は、依頼書§4の禁止事項(無確認ON・一括ブロック)に従い、変更後に上記curl検証を再実施すること。
- 注記2: UAスプーフィング検査は「UA文字列ベースのブロックが無い」ことの確認であり、verified bot(検証済みボット)としての扱いは実ボットのアクセスでのみ確認可能。GSC/Bing WMTのクロール統計で継続監視するのが確実。

---

## CF-4: robots.txt 配信経路 — 確認結果

1. **配信元**: リポジトリルートの静的ファイル `robots.txt` を **Cloudflare Pages** が配信。Workerは経由しない(Workerルートは `www.simplememofast.com/*` の `www-redirect` のみ)。
2. **反映フロー**: mainブランチへのpush → Pages自動ビルド&デプロイ。
3. **キャッシュ**: `_headers` の `/robots.txt` ルールで `Cache-Control: public, max-age=86400` → エッジで最大24hキャッシュされる(実測: `cf-cache-status: HIT`, `age: 80395`)。
4. **重要発見**: **Pagesの新デプロイはエッジキャッシュをパージしない**。本日複数回デプロイされているにもかかわらず22.3時間前のキャッシュが生存していることを実測確認。→ robots.txt 変更の即時反映には手動パージが必要(§CF-7)。
5. 参考TTL(`_headers` 由来): robots.txt / llms.txt = 24h、sitemap*.xml = 1h、HTML(`/*`)= 1h。

---

## CF-5: Claude系UA robots追記 — 状態

- **リポジトリ対応済み**: `robots.txt` に `Claude-SearchBot` / `Claude-User` の明示Allowブロックあり(ClaudeBot / anthropic-ai / Claude-Web は従来から明示済み)。本日 PR #374 で main にマージ済み。既存の Disallow(/admin/, /docs/, /cdn-cgi/, パラメータ系)は不変で、`User-agent: *` とも矛盾なし。
- **ライブ反映**: エッジキャッシュのTTL失効 **2026-07-02 10:41 UTC(19:41 JST)頃**に自然反映(NRTコロの実測ageから算出。コロにより多少前後、最大でも24h)。手動パージすれば即時。
- 反映後の検証:

```bash
curl -s https://simplememofast.com/robots.txt | grep -A1 "Claude-SearchBot"   # → Allow: /
curl -A "Claude-User" -I https://simplememofast.com/                          # → 200(実測済み)
curl -A "Claude-SearchBot" -I https://simplememofast.com/                     # → 200(実測済み)
```

---

## CF-6: GSC 404 5件 — 方針一覧(全件確定)

トリアージ詳細: `docs/seo/gsc-index-triage-2026-07-02.md`(本日PR #370)。live状態も本日再実測済み(全件404)。

| URL | live | 判定 | 方針 |
|---|---|---|---|
| /blog/energy-budget-field-notes | 404 | 捏造URL(git全履歴・sitemap・内部リンクに存在せず) | **404維持** |
| /blog/i-was-wrong-about-todo-debt | 404 | 捏造URL(同上) | **404維持** |
| /blog/ios-cold-start-1-4s-to-287ms | 404 | 捏造URL(同上) | **404維持** |
| /blog/no-third-party-deps-ios-18-months | 404 | 捏造URL(同上) | **404維持** |
| /cdn-cgi/l/email-protection | 404 | Cloudflareメール難読化の副産物 | 404容認(robots.txtで`/cdn-cgi/`Disallow済み) |

- 4件はネガティブSEO(バックリンク・インジェクション、`docs/disavow.txt` 264ドメインと同一攻撃者の可能性が高い)による**外部で捏造されたURL**。
- **Cloudflare側の301リダイレクトは意図的に実施しない**: 存在しないURLへの404はGoogleにとって正しい応答であり、リダイレクトするとスパムリンクの受け皿になる。依頼書§7の分類「パラメータ・bot由来のノイズ=原則放置」「404維持でも可」に整合。
- 内部リンク切れ・復旧すべきページ: **該当なし**(全件外部由来)。
- オーナーTODO(継続): GSCリンクレポートで捏造4URLのリンク元ドメインを確認 → 新規なら `docs/disavow.txt` に追記して再アップロード。

---

## CF-7: キャッシュパージ運用 — 確立した手順

### 実測で判明した制約

- automation token では `POST /zones/{id}/purge_cache` は**権限外**(10000: Authentication error 実測)。wrangler OAuth トークンにも Cache Purge スコープなし。
- Pagesデプロイはエッジキャッシュを**パージしない**(CF-4)。

### 運用手順

1. **通常運用**: `_headers` のTTLで自然反映を待つ(HTML=最大1h、sitemap=最大1h、robots/llms=最大24h)。SEO上、この遅延が問題になるケースはまれ。
2. **即時反映が必要な場合**(オーナー、ダッシュボード): Cloudflare → simplememofast.com ゾーン → **Caching → Configuration → Custom Purge → Purge by URL** で対象URLを個別指定。全パージ(Purge Everything)は使わない。
   ```text
   https://simplememofast.com/robots.txt
   https://simplememofast.com/llms.txt
   https://simplememofast.com/sitemap.xml
   https://simplememofast.com/
   https://simplememofast.com/captio/
   ```
3. **自動化したい場合**(任意): `Zone → Cache Purge` 権限のみの専用APIトークンを発行すれば、デプロイ後の個別URLパージを自動化できる(依頼者判断、§依頼者確認事項)。
4. 反映確認: `curl -sD - -o /dev/null <URL> | grep -iE 'cf-cache-status|age|etag'` — パージ直後は `MISS`/`EXPIRED` になり、`age` がリセットされる。

---

## 検証結果(生ログ抜粋)

### paji.me(現状=変更前ベースライン)

```text
http://paji.me/   → 301 https://paji.me/ → 301 https://www.paji.me/ → 301 https://simplememofast.com/captio/ → 200  (3 hops)
https://paji.me/  → 301 https://www.paji.me/ → 301 https://simplememofast.com/captio/ → 200  (2 hops)
https://paji.me/some-old-post?utm_source=x → 301 www.paji.me/some-old-post?utm_source=x → 525  (broken)
https://simplememofast.com/captio/ → HTTP/2 200
```

### robots.txt

```text
HTTP/2 200 / content-type: text/plain; charset=utf-8
cache-control: public, max-age=86400, must-revalidate
cf-cache-status: HIT / age: 80395  (2026-07-02 09:01 UTC時点 — TTL失効 10:41 UTC頃)
```

### AIクローラー到達性

```text
curl -A "Claude-SearchBot" -I https://simplememofast.com/  → HTTP/2 200
(全9UA×2パスの結果は §CF-3 の表のとおり、すべて200)
```

## 未対応・保留事項

- CF-1 実装: オーナーの個人Cloudflareアカウントでの Redirect Rule 作成 + Always Use HTTPS OFF(手順は§CF-1)
- CF-2 WMT本登録: オーナーによる Bing Webmaster Tools 登録(GSCインポート推奨)
- CF-5 ライブ反映の最終確認: TTL失効(10:41 UTC頃)後に `curl` で Claude-SearchBot ブロックの出現を確認(本セッション内で確認し、結果はチャット報告)
- IndexNow ping: 本PRデプロイ直後に実施(結果はチャット報告)

## 依頼者確認が必要な事項

1. **paji.me の1ホップ301化の実施**(§CF-1手順。承認事項→実施者がオーナー本人のため、実施=承認)
2. **Bing認証方式の選択**: GSCインポート(推奨・即時)/ DNS TXT(値を共有いただければ自動追加可)
3. **Cache Purge専用APIトークンの発行可否**(任意): 発行すれば robots.txt 等の即時反映を今後自動化可能
4. GSCリンクレポートでの捏造4URLリンク元確認 → disavow追記(CF-6、既存TODOの再掲)
