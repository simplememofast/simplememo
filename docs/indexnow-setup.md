# IndexNow Setup — simplememofast.com

## 概要

IndexNow は、ページの新規公開・更新・削除を検索エンジン（Bing, Yandex, Naver, Seznam）に即座通知するプロトコルです。

## セットアップ状況

- キー生成: 完了 (`.indexnow-key` に保存)
- キー検証ファイル: `{key}.txt` がサイトルートに配置
- 通知スクリプト: `scripts/indexnow-notify.js`
- CI自動通知: `.github/workflows/seo-check.yml` に組込み

## 使い方

```bash
# 最近1日に変更されたページを通知
node scripts/indexnow-notify.js

# 特定のURLを通知
node scripts/indexnow-notify.js /blog/new-post

# 過去N日間の変更を通知
node scripts/indexnow-notify.js --since 3

# 全ページを通知
node scripts/indexnow-notify.js --all

# キー再生成
node scripts/indexnow-notify.js --generate-key
```

## CI自動通知

`main` ブランチへのpush時に自動実行:
- `seo-check.yml` の最後のステップで `--since 1` で通知
- 失敗してもデプロイは止まらない (`continue-on-error: true`)

## 注意事項

- Google は IndexNow 非対応（Googlebot は独自クロール）
- Bing, Yandex, Naver, Seznam が対応
- API制限: 1回のリクエストで最大10,000 URL
- 失敗ログ: `scripts/indexnow-failed.log` に記録

## TODO (人間の作業)

- [ ] `.indexnow-key` を `.gitignore` に追加するかどうか判断
- [ ] Bing Webmaster Tools でサイト所有権を確認
- [ ] デプロイ後にキー検証ファイル (`{key}.txt`) がアクセス可能か確認
