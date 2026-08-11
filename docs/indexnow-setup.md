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
# 直近1コミットで変更された .html を通知（既定）
node scripts/indexnow-notify.js

# 直近Nコミット（first-parent）の変更を通知
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
実際に変えたページ）になる。

## CI自動通知

`main` ブランチへのpush時に自動実行:
- `seo-check.yml` の最後のステップで `--since 1` で通知（= そのpushのマージが変更した .html のみ）
- checkout は `fetch-depth: 2` が前提（HEAD~1 との diff に親コミットが必要）
- 変更ファイル数・noindex除外数・通知URL一覧・送信結果を**ジョブサマリに出力**
- 失敗してもデプロイは止まらない (`continue-on-error: true`)
- 複数コミットを一度に直接pushした場合は最後の1コミット分のみになるため、必要なら手動で `--since N` を実行

## 注意事項

- Google は IndexNow 非対応（Googlebot は独自クロール）
- Bing, Yandex, Naver, Seznam が対応
- API制限: 1回のリクエストで最大10,000 URL
- 失敗ログ: `scripts/indexnow-failed.log` に記録

## TODO (人間の作業)

- [x] `.indexnow-key` を `.gitignore` に追加するかどうか判断 → 追加済み（ローカル上書き用。CI は コミット済みの鍵検証ファイルから解決する）
- [ ] Bing Webmaster Tools でサイト所有権を確認
- [ ] デプロイ後にキー検証ファイル (`dda35fda390ffabbcce681394b3a57cc.txt`) がアクセス可能か確認
