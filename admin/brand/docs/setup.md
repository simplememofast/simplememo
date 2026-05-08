# Cloudflare 環境変数セットアップ手順

この管理画面から X API を叩くためには、X Developer Portal で取得した認証情報を Cloudflare Pages の環境変数（Secret）として登録する必要があります。**ソースコードや GitHub にキーを書いてはいけません。**

---

## 1. 全体像

- 保管場所: **Cloudflare Pages プロジェクトの「環境変数」** に Secret タイプで登録
- 読み取り箇所: `functions/admin/api/x-verify.js` の `context.env.X_*`
- 認証保護: `/admin/*` は `functions/admin/_middleware.js` の Basic 認証（`simplememo / tiktok2026`）で保護済み
- デプロイ後: 環境変数を変更したら **再デプロイが必要**（Pages の仕様）

---

## 2. 登録する環境変数の一覧

| 変数名 | 用途 | 必須か | 取得元 |
|--------|------|--------|--------|
| `X_BEARER_TOKEN` | OAuth 2.0 App-only Bearer Token。読み取り API（検索等）で使用 | 推奨 | Developer Portal → Keys and tokens → Bearer Token |
| `X_API_KEY` | OAuth 1.0a の Consumer Key | 投稿する場合 | Keys and tokens → API Key and Secret |
| `X_API_SECRET` | OAuth 1.0a の Consumer Secret | 投稿する場合 | 同上 |
| `X_ACCESS_TOKEN` | OAuth 1.0a の User Access Token | 投稿する場合 | Keys and tokens → Access Token and Secret |
| `X_ACCESS_TOKEN_SECRET` | OAuth 1.0a の User Access Token Secret | 投稿する場合 | 同上 |
| `X_USER_ACCESS_TOKEN` | OAuth 2.0 User Context の Access Token | 自分情報取得 | OAuth 2.0 認可フロー経由で取得 |
| `X_EN_API_KEY` | 英語アカウント @simplememo_en の Consumer Key | 英語自動投稿する場合 | 英語アカウントの Developer App から |
| `X_EN_API_SECRET` | 英語アカウントの Consumer Secret | 英語自動投稿する場合 | 同上 |
| `X_EN_ACCESS_TOKEN` | 英語アカウントの User Access Token | 英語自動投稿する場合 | 同上 |
| `X_EN_ACCESS_TOKEN_SECRET` | 英語アカウントの User Access Token Secret | 英語自動投稿する場合 | 同上 |

### どれを先に入れるか

- **最低限**: `X_BEARER_TOKEN` だけ入れれば、この管理画面の「X API 接続テスト」は動きます（Basic ティア以上が必要）。
- **日本語アカウント（@simplememofast）への投稿を自動化したい場合**: OAuth 1.0a の 4 点セット（`X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET`）をすべて登録。
- **英語アカウント（@simplememo_en）への投稿も自動化したい場合**: 上記 4 点に加えて `X_EN_*` の 4 点（`X_EN_API_KEY` / `X_EN_API_SECRET` / `X_EN_ACCESS_TOKEN` / `X_EN_ACCESS_TOKEN_SECRET`）を登録。投稿時に Body の `account: "en"` で切替。
- **自アカウント情報（`/2/users/me`）を取得したい場合**: `X_USER_ACCESS_TOKEN` が必要（App-only Bearer では取れない）。

---

## 3. X Developer Portal でキーを取得する

1. `https://developer.x.com/` にログイン
2. 右上の **Developer Portal** を開く
3. **Projects & Apps** → 該当プロジェクトの App を選択
4. **Keys and tokens** タブを開く
5. 以下をそれぞれ **Generate** または **Regenerate** して控える
   - **API Key and Secret** → `X_API_KEY` / `X_API_SECRET`
   - **Bearer Token** → `X_BEARER_TOKEN`
   - **Access Token and Secret** → `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET`
6. アプリの権限設定（**User authentication settings**）で、最低 **Read** 権限があることを確認。投稿もするなら **Read and write** に変更。

> **注意**: キーは再表示できません。控え忘れたら再生成になります。再生成すると旧キーは無効化されます。

### 料金ティアについて

- **Free**: 投稿（`POST /2/tweets`）と削除のみ。検索・ユーザー情報取得は不可。
- **Basic**（有料）: 検索 API、ユーザー情報取得など一通りの読み取りが可能。
- この管理画面の「検索テスト」は Basic 以上で動作します。Free のままだと 403 が返ります。

---

## 4. Cloudflare Dashboard から登録する（推奨・GUI）

1. `https://dash.cloudflare.com/` にログイン
2. 左メニュー → **Workers & Pages**
3. **Pages** タブ → 該当プロジェクト（`simplememo` など）をクリック
4. 上部タブの **Settings** → 左メニュー **Environment variables**
5. **Production** セクションの **Add variable** をクリック
6. 以下のように入力:
   - **Variable name**: `X_BEARER_TOKEN`
   - **Value**: 控えておいた Bearer Token 本体
   - **Type**: **Encrypted**（必ず Encrypted にする。Plaintext だと後から値が見えてしまう）
7. **Save** をクリック
8. 他の変数（`X_API_KEY` など）も同じ手順で追加
9. **Preview** 環境にも同じ値を入れたい場合は、Preview セクションでも同様に追加

### 反映方法

環境変数を追加・変更しただけでは既存のデプロイには反映されません。以下のいずれかで再デプロイします。

- **A**: Cloudflare Pages の **Deployments** タブ → 最新デプロイの右の **…** → **Retry deployment**
- **B**: git で空コミットを打って push
  ```
  git commit --allow-empty -m "chore: trigger redeploy for env vars"
  git push
  ```

---

## 5. Wrangler CLI から登録する（上級者向け）

ローカルの端末から一括で登録したい場合。

### 事前準備

```
npm install -g wrangler
wrangler login
```

### Secret として登録

```
wrangler pages secret put X_BEARER_TOKEN --project-name=simplememo
```

実行すると値の入力を求められるので、Bearer Token を貼り付けて Enter。これを変数ごとに繰り返します。

```
wrangler pages secret put X_API_KEY --project-name=simplememo
wrangler pages secret put X_API_SECRET --project-name=simplememo
wrangler pages secret put X_ACCESS_TOKEN --project-name=simplememo
wrangler pages secret put X_ACCESS_TOKEN_SECRET --project-name=simplememo
```

英語アカウント (@simplememo_en) を使うなら同じ要領で 4 点を追加:

```
wrangler pages secret put X_EN_API_KEY --project-name=simplememo
wrangler pages secret put X_EN_API_SECRET --project-name=simplememo
wrangler pages secret put X_EN_ACCESS_TOKEN --project-name=simplememo
wrangler pages secret put X_EN_ACCESS_TOKEN_SECRET --project-name=simplememo
```

### 一覧表示・削除

```
wrangler pages secret list --project-name=simplememo
wrangler pages secret delete X_BEARER_TOKEN --project-name=simplememo
```

> **注意**: `wrangler pages secret put` は `--project-name` のプロジェクトが存在している必要があります。Cloudflare Dashboard で作成済みのはずです。

---

## 6. ローカル開発での値の扱い

ローカルで Pages Functions を走らせる場合は `.dev.vars` ファイルに書きます。

```
# .dev.vars（.gitignore に追加済みであること）
X_BEARER_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxx
X_API_KEY=xxxxxxxxxxxxx
X_API_SECRET=xxxxxxxxxxxxx
X_ACCESS_TOKEN=xxxxxxxxxxxxx
X_ACCESS_TOKEN_SECRET=xxxxxxxxxxxxx
```

起動:

```
npx wrangler pages dev .
```

**絶対に `.dev.vars` をコミットしないでください。**`.gitignore` に `.dev.vars` が入っているか確認すること。

---

## 7. 登録後の確認フロー

1. Cloudflare で Secret を全部登録
2. 再デプロイ（上記 4 の反映方法）
3. この管理画面の **動作確認** タブを開く
4. **資料ファイル疎通確認** → すべて OK が出るはず
5. **Cloudflare 環境変数の状態** → 登録した変数が `[設定済み]` と表示されるはず
6. **X API 接続テスト** → HTTP 200 が返れば成功。403 の場合は X のプランが Free のままか、権限不足
7. **自アカウント情報取得テスト** → `X_USER_ACCESS_TOKEN` が登録されていれば自分の `id` `username` が返る

---

## 8. セキュリティ上の注意

- 管理画面の Basic 認証は現在 `simplememo / tiktok2026` で、`functions/admin/_middleware.js` にハードコードされています。本番運用するなら、この認証情報も Cloudflare 環境変数（`ADMIN_USER` / `ADMIN_PASS`）に移す運用に切り替えることを推奨します。
- Secret は一度登録すると Cloudflare Dashboard でも値を再表示できません。控えを別途安全な場所に保管しておくこと。
- キーが漏洩した疑いがある場合は、Developer Portal で **Regenerate** して旧キーを無効化、Cloudflare の Secret も上書き更新、再デプロイ、という順で対応します。
- Git の履歴にキーを混入させないため、コードやコメントに直接書かない。`.dev.vars` `.env` などは必ず `.gitignore` に追加。

---

## 9. トラブルシューティング

### 環境変数の状態が全部「未設定」と表示される

- Cloudflare に登録したが再デプロイしていない → 再デプロイする
- Preview 環境に登録したが本番を見ている → Production 側にも登録
- 変数名のタイプミス → 大文字小文字を含め `X_BEARER_TOKEN` と完全一致させる

### X API 接続テストで HTTP 401

- Bearer Token が無効 or 古い → 再生成して Cloudflare の値を更新
- Token の前後に空白が混入 → Cloudflare Dashboard で再入力

### X API 接続テストで HTTP 403

- X の API プランが Free → Basic にアップグレードする、または検索機能は諦める
- アプリの権限が Read になっていない → Developer Portal で権限を設定

### X API 接続テストで HTTP 429

- レートリミット超過 → 15 分待つ。クエリの頻度を下げる

### 管理画面自体が開けない

- Basic 認証の ID/パスワードを忘れた → `functions/admin/_middleware.js` の `CREDENTIALS` を確認
- Cookie が壊れている → ブラウザでサイトのクッキーを削除してから再ログイン

---

## 10. 次のステップ

この画面に追加できる機能の候補:

1. **保存済み検索のワンクリック実行**: X 運用ガイドに載っている 14 個の検索クエリをボタンで実行して結果一覧
2. **候補投稿のスコアリング支援**: 取得した投稿をブランドブックの 5 項目スコアカードで自動採点
3. **引用 RT の下書き生成**: 選んだ投稿に対して、10 型から型を選び下書きを作成
4. **送信ログ**: 何をいつ投稿したか、X 運用ガイドの日次レビュー欄に自動追記
5. **投稿実行**: OAuth 1.0a の 4 点セットが登録済みなら、この画面から直接投稿

これらは別セッションで追加実装できます。まずは Secret の登録と疎通確認までを完了させてください。

---

## 11. 英語アカウント @simplememo_en の自動投稿

日本語の `@simplememofast` と同じ仕組みを別アカウントで動かします。

### 必要なもの
- @simplememo_en の X Developer App から取得した 4 点（API Key / Secret / Access Token / Access Token Secret）
- アプリ権限は **Read and write**

### 登録する Cloudflare 環境変数（Production）
- `X_EN_API_KEY`
- `X_EN_API_SECRET`
- `X_EN_ACCESS_TOKEN`
- `X_EN_ACCESS_TOKEN_SECRET`

すべて **Encrypted** タイプで登録し、登録後に Pages を再デプロイ。

### 動く仕組み
- ワークフロー `.github/workflows/x-post-en-scheduled.yml` が cron で発火
- `admin/brand/content/posts-en.json` の 40 本から 8 時間スロット単位で 1 件選ぶ
- `/admin/api/x-post` に `{"text": "...", "account": "en"}` で POST
- Function は `account === "en"` のときだけ `X_EN_*` の 4 点を使って OAuth1.0a 署名

### スケジュール（UTC ベース・米国東部のゴールデンタイム狙い）
- 13:00 UTC ＝ 8〜9 am ET（米国東部 朝）
- 19:00 UTC ＝ 2〜3 pm ET（米国東部 昼過ぎ）
- 01:00 UTC ＝ 8〜9 pm ET（米国東部 夜）

各スロットは ±25 分のランダム遅延つき。

### 疎通確認
1. Secret 登録 → 再デプロイ
2. **動作確認**タブの **環境変数の状態** で `X_EN_*` が `[設定済み]` になることを確認
3. GitHub Actions → **X EN Auto Post (Scheduled)** → **Run workflow**
   - `dry_run` を `true` にすると投稿せず選択結果だけ確認可能
   - `false` にすると 1 件投稿される

### コンテンツ編集
`admin/brand/content/posts-en.json` を直接編集してコミット。各エントリは `id` / `pillar` / `text` の 3 フィールド、`text` は 280 字以内。
