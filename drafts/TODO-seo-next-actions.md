# SEO / DR改善 — 次の施策チェックリスト

最終更新: 2026-03-21

## 完了済み (このセッション)

### コード側 (Claude実行済み)
- [x] 技術SEO修正（スキーマ、フォント、sitemap日付、リダイレクト等）165ファイル
- [x] vs/ 37ページ差別化（テンプレート重複30%以下に）
- [x] GSC駆動タイトル最適化（best-memo-apps, notion-vs-evernote, google-keep）
- [x] 内部リンク44本追加（18記事→vs/、5記事→blog相互）
- [x] 新規記事6件: iphone-memo-app-fast, business-memo-apps, line-keep-migration, memo-app-encryption-comparison, ios-quick-capture-comparison, second-brain-capture-first
- [x] 記事拡張3件: captio-discontinued (+466行), email-yourself-memo (+GTD/PKM), benchmark-methodology (+raw data)
- [x] ハブページ2件: /comparison/, /guides/
- [x] 被リンクドラフト10件作成（drafts/フォルダ）

### 外部施策 (ユーザー実行済み)
- [x] note.com 投稿 → https://note.com/simplememo/n/n569d5dd54de3
- [x] Zenn 投稿 → https://zenn.dev/simplememo/articles/f7b808c2e129eb
- [x] Qiita 投稿
- [x] はてなブログ 投稿
- [x] Product Hunt 投稿
- [x] AlternativeTo 登録
- [x] Reddit 投稿 (r/productivity, r/iOSProgramming)
- [x] X/Twitter スレッド投稿
- [x] GitHub プロフィール設定

---

## 未実施 — Human-execution-needed（優先度順）

### P1: ディレクトリ登録 (1-2時間)
- [ ] **noteapps.info に登録申請** — 41アプリDB。掲載だけで15-25参照ドメイン見込み。SimpleMemoの全データ（機能、価格、速度、暗号化）を添えてコンタクトフォームから申請
- [ ] **alternativeto.net の Captio ページ修正依頼** — 現在「Captio alternatives」に間違ったCaptio（経費管理アプリ）が表示。SimpleMemoプロフィール作成 + 正しいCaptio代替として登録

### P2: コミュニティ投稿 (2-3時間)
- [ ] **Indie Hackers 投稿** — 「SimpleMemo: Cloudflare Workers上に構築したEmail-to-Selfアプリ」技術ストーリー + 売上データ。コミュニティフィットが高い
- [ ] **Hacker News "Show HN" 投稿** — 技術フォーカス（Cloudflare Workers, Resend, AES-GCM, Gmail API非依存）。週末の朝に投稿が効果的。成功すれば20-100参照ドメイン
- [ ] **Reddit r/notetaking 投稿** — Captio終了後の代替として。r/productivityとは別切り口で

### P3: メディアアウトリーチ (各1-2時間)
- [ ] **MakeUseOf にピッチ** — "5 Alternative Note Apps For iOS" 記事の更新提案。速度ベンチマークデータを添えて
- [ ] **Zapier Blog にピッチ** — 「Email-to-Self Automation with SimpleMemo + Zapier」ゲスト記事提案
- [ ] **MacStories (Federico Viticci) にピッチ** — iOS Quick Capture アプリレビュー。難易度高いが成功すれば15-25ドメイン
- [ ] **Roboin.io にピッチ (日本語)** — LINE Keep + Captio代替としてのSimpleMemo。日本市場向け
- [ ] **note2selfmail.app (競合) へコンタクト** — 相互リンク/メンション提案。同じ市場を共有する協力関係

### P4: 追加ディレクトリ登録 (各15-30分)
- [ ] Toolfinder.com
- [ ] ClickUp Blog へのピッチ
- [ ] AppSumo（該当する場合）
- [ ] SaaSHub
- [ ] G2
- [ ] Capterra（該当する場合）

### P5: ブランド構築 (継続的)
- [ ] **GitHub公開リポジトリ作成**: `simplememo-benchmark` — iOS冷起動ベンチマークスクリプト + 結果データ。SEO価値高い（`github-profile.md`に詳細）
- [ ] **GitHub公開リポジトリ作成**: `captio-migration-guide` — Captioユーザー向けリソース + Apple Shortcuts
- [ ] **メールニュースレター登録ページ作成** — ブログ読者のリテンション
- [ ] **App Store ASO最適化** — タイトル、キーワード、説明文を「email memo」「quick note」「Captio alternative」で最適化

---

## 未実施 — Claude実行可能（次セッションで）

### コンテンツ作成
- [ ] Long-tail記事5-10件（「メモアプリ 無料」「メモ 習慣化 コツ」「ビジネスメモ 書き方」等）
- [ ] /en/captio-alternative/ ページ拡張（3,000語、比較テーブル、移行ガイド追加）
- [ ] Captioユーザー向け専用LP作成（/captio/）
- [ ] LINE Keepユーザー向け専用LP作成（/line-keep/）
- [ ] テスティモニアルページ作成（App Storeレビューから）

### 技術SEO
- [ ] Open Graph / Twitter Card メタタグ監査・最適化
- [ ] 画像alt属性の一括監査
- [ ] Core Web Vitals再チェック
- [ ] rel="me" リンク追加（各外部プロフィールへ）
- [ ] JSON-LD sameAs に新規プラットフォーム追加（Qiita, はてな, Product Hunt, AlternativeTo, Indie Hackers）

### 内部リンク追加ラウンド
- [ ] 新規記事6件からの内部リンク（line-keep→vs/ページ、encryption→vs/ページ等）
- [ ] ハブページ（/comparison/, /guides/）へのフッターリンク追加
- [ ] ブログindex→ハブページへの誘導リンク

---

## Coworkレポートのアウトリーチテンプレート

`drafts/` フォルダにある各ドラフトを投稿時に使用：
- `producthunt-launch.md` — Product Hunt用（投稿済み）
- `alternativeto-listing.md` — AlternativeTo用（登録済み）
- `reddit-productivity.md` — Reddit r/productivity用（投稿済み）
- `reddit-ios.md` — Reddit r/iOSProgramming用（投稿済み）
- `x-thread.md` — X/Twitter用（投稿済み）
- `github-profile.md` — GitHub README + リポジトリ案

Coworkレポート内のメールテンプレート（9. 文案集）を参照：
- Template 1: ディレクトリ/比較DB向けピッチ
- Template 2: 競合記事メンション依頼
- Template 3: メディア/ブログメンション依頼
- Template 4: ブロークンリンク置換
- Template 5: コミュニティ/フォーラム投稿

---

## KPI追跡（90日目標）

| 指標 | 現在 | 90日目標 |
|------|------|----------|
| インデックスページ数 | 150+ | 170+ |
| 参照ドメイン数 | 推定5-10 | 30-50 |
| Domain Rating | 推定5-10 | 15-20 |
| オーガニックトラフィック | 推定500/月 | 1,000-2,000/月 |
| ブランド検索 | 低 | 100+/週 |

---

## タイムライン

- **Week 1-2**: P1ディレクトリ登録 + P2コミュニティ投稿
- **Week 3-4**: P3メディアアウトリーチ開始
- **Week 5-8**: フォローアップ + P4追加登録
- **Month 3+**: ゲスト記事、GitHub OSS、継続的コンテンツ
