# DR向上戦略 セッションA 分析レポート

作成日: 2026-03-21
対象: simplememofast.com

---

## 1. 被リンクプロファイル比較

### 自社 vs 競合サマリー

| 指標 | simplememofast.com | note2selfmail.app | emailmeapp.net |
|------|-------------------|-------------------|----------------|
| **DR** | **7** | **16** | **26** |
| **被リンク数** | 45 | 136 | 1,300 |
| **リンク元ドメイン数** | 21 | 81 | 240 |
| **dofollow率** | 38% | 77% | 78% |
| **DR40+からのリンク** | 2-3本（実質的） | 5-6本 | 15本以上 |

### 致命的な問題点

1. **simplememofast.comの被リンクの大半がスパム**
   - SEOリンク販売サービスからの低品質リンク（itxoft, backlinks-seorank, rankva, primeseo, grow-your.website等）が**8本以上**
   - paji.me → simplememofast.com/captio/ への301リダイレクト経由のリンクが大半を占める
   - **実質的なオーガニック被リンク: zenn.dev (DR83) + hatena.blog (DR85) の2本のみ**
   - dofollow率38%は競合の半分以下

2. **emailmeapp.netが予想以上に強い**
   - DR26で「send email to yourself app」系クエリの主要プレイヤー
   - **Rich On Techポッドキャスト(2025年6月)** で紹介 → spreaker(DR89), podchaser(DR85), omny.fm(DR86), metacast(DR71), podbay(DR75) の5サイトから同時にリンク獲得
   - GitHub awesome-mac リスト(DR56)に掲載
   - Medium記事(DR94)で言及
   - **教訓: 1回のメディア露出が5-6本の高DRリンクを生む（ポッドキャスト戦略の有効性）**

3. **note2selfmail.appはドイツ語圏に強い**
   - t3n.de (DR84, ドイツ最大級テックメディア) からリンク
   - note2self.de → note2selfmail.app への301リダイレクトで複数リンク継承
   - KrauseFx (Felix Krause) のGitHubリポジトリ(DR96)で言及 → 開発者コミュニティでの認知
   - appadvice.com (DR78) で紹介記事あり
   - **教訓: 開発者個人のネットワークと母国語圏メディアが初期リンクの基盤**

---

## 2. SERP分析（検索結果の現実）

### 日本語クエリ

#### 「captio 代替」
| 順位 | URL | サイト | 備考 |
|------|-----|--------|------|
| 1 | simplememofast.com/captio-alternative/ | **自社** | **1位獲得済み** |
| 2 | attnoel.co.jp | アットノエル | Note To Self Mail + Note to Email推奨 |
| 3 | X (shun_tanak) | Twitter/X | ユーザーの困りツイート |
| 4 | note.com (DJ MASA) | note | 代替アプリ開発中の記事 |
| 5 | note.com (39) | note | NOTE TO EMAIL推奨 |
| 6 | simplememofast.com/blog/captio-discontinued | **自社** | Captio終了記事 |
| 7 | liginc.co.jp | LIG | 2019年の古い記事 |
| 8 | simplememofast.com/vs/ | **自社** | 比較ページ |
| 9 | AlternativeTo | AlternativeTo | **Emburse Captioと混同** |

**評価: 日本語「captio 代替」では1位。ただしボリュームが極小。**

### 英語クエリ

#### 「captio alternative」

**AI Overview（AIによる概要）の内容:**
> Captio（自分宛の高速メール送信アプリ）の代替として、**Note To Self Mail**が最もUIが近くおすすめ。その他、Google Keep、Apple純正「メモ」アプリ、Simplenoteなど。

- **SimpleMemoはAI Overviewに含まれていない** → 最大の問題
- simplememofast.com/en/captio-alternative/ はオーガニック結果に表示されるが上位ではない
- note2selfmail.app が「Replacement for Captio app?」で上位

**重大な障害: 「captio」が「caption」（動画字幕）や「Emburse Captio」（経費管理）と混同される**
- AlternativeTo上のCaptioページ → 経費管理ソフトの代替が表示
- Google AI Overviewも混同リスクあり

#### 「captio replacement app」

**AI Overviewの内容:**
> Captions（動画字幕アプリ）の代替としてVid IO, Blink, Submagicを推薦

- **完全に動画字幕アプリと混同されている**
- simplememofast.com はオーガニック結果に表示あり
- note2selfmail.app も表示あり

#### 「send email to yourself app iphone」

**AI Overviewの内容:**
> Boomerang (4.9/5), Pigeon Pro, Note to Self, EmailMe を推薦

- **SimpleMemoは一切言及なし**
- Boomerang、Pigeon（新競合）、EmailMe が上位
- このクエリがボリューム最大だが、SimpleMemoは完全に不在

#### 「note to self app ios」

**AI Overviewの内容:**
> Note To Self Mail, Signal, Qept, Luckynote を推薦

- **SimpleMemoは一切言及なし**
- 新競合: **Strflow**（indie iOS/Mac developer、r/appleで50+コメント、2ヶ月前）
- 新競合: **Gravity**（r/ProductivityApps、1週間前）

---

## 3. 新たに発見した競合

セッションA戦略文書で想定していなかった競合:

| アプリ名 | 特徴 | 脅威度 |
|---------|------|--------|
| **Boomerang: Email myself** | 4.9/5 (206件), App Store上位 | **高** |
| **Pigeon (Email Yourself Fast)** | 5.0/5, Apple Watch対応 | 中 |
| **Strflow** | indie dev, r/appleで50+コメント | 中（成長中） |
| **Gravity** | Android+iOS, 1週間前にReddit投稿 | 低（まだ小さい） |
| **Selfmailer** | 3クリック、PDF作成、OCR | 低 |
| **Note To Self: Email Notes** | 5.0/5 (23件), スワイプ送信 | 低 |

**比較ページに含めるべき追加候補: Boomerang, Pigeon**

---

## 4. 戦略への示唆（セッションA修正版）

### 4-1. 最重要な気づき

1. **英語圏でSimpleMemoは「存在していない」に等しい**
   - 5つの主要英語クエリすべてのAI Overviewで不在
   - App Store上でのレビュー数・評価が競合に劣る
   - これはコンテンツの問題ではなく**認知の問題**

2. **「captio」キーワードは汚染されている**
   - caption（動画字幕）、Emburse Captio（経費管理）との混同が深刻
   - 英語圏では「captio alternative」に依存する戦略はリスクが高い
   - **「send email to yourself app」「note to self app」の方がクリーンなクエリ**

3. **ポッドキャスト戦略の有効性（emailmeapp.netの成功パターン）**
   - Rich On Tech 1回の出演 → 5サイトからDR71-89のリンク獲得
   - ポッドキャスト出演は1回の労力で複数の高DRリンクを生むレバレッジが大きい

4. **スパムリンクの除去が必要**
   - 現在の被リンク45本中、8本以上がSEOスパム
   - Google Disavow Toolでの否認を検討すべき

### 4-2. 戦略修正案

#### 既存戦略の維持（セッションA原案どおり）
- `/en/captio-alternative/` の比較ページ強化 → 実測データ追加
- AlternativeTo / SaaSHub / Product Hunt への掲載申請

#### 追加すべき戦略

| 優先度 | 施策 | 期待リンク数 | 根拠 |
|-------|------|------------|------|
| **S** | **英語版ターゲットクエリの変更**: 「captio alternative」→「send email to yourself app」「best note to self app」をメインターゲットに | - | SERPの汚染回避 |
| **S** | **AI Overview対策**: Google AI Overviewに引用されるための構造化 | - | 現在5クエリ全てで不在 |
| **A** | **ポッドキャスト出演**: 生産性系・indie dev系ポッドキャストへの出演申請 | 3-6本/回 | emailmeapp.netの成功パターン |
| **A** | **英語版ページ新設**: `/en/send-email-to-yourself/` 等のクリーンなクエリ向けページ | - | 「captio」依存からの脱却 |
| **B** | **GitHub awesome-listへの掲載**: awesome-mac, awesome-ios等 | 1-3本 | emailmeapp.netが成功済み |
| **B** | **App Storeレビュー数の増加**: 英語レビューの獲得 | 間接効果 | AI Overviewの引用材料 |
| **C** | **スパムリンク否認**: Google Disavow Tool | 0（衛生施策） | DR計算のクリーン化 |

### 4-3. 比較ページの競合追加

英語版比較ページに含めるべきアプリ（修正版）:

| # | アプリ名 | 理由 |
|---|---------|------|
| 1 | Simple Memo | 自社 |
| 2 | Note to Self Mail | 最大の直接競合 |
| 3 | Email Me (Memos) | DR26の強敵、ポッドキャスト露出あり |
| 4 | **Boomerang: Email myself** | **追加**. AI Overview常連、4.9/5 |
| 5 | **Pigeon (Email Yourself Fast)** | **追加**. 新興だがApple Watch対応 |
| 6 | Drafts + Mail Action | パワーユーザー向け |
| 7 | iOS Shortcuts（自作） | 0コスト代替 |
| 8 | Apple Notes + Share Sheet | 追加DL不要 |

---

## 5. アウトリーチ候補リスト（SERP分析ベース更新版）

### Tier 1: 高確率（既存記事にSimpleMemo追加を依頼）

| # | サイト/記事 | DR推定 | アプローチ |
|---|-----------|--------|----------|
| 1 | attnoel.co.jp「Captio代替アプリ2選+α」 | 40-50 | SimpleMemoを3つ目の推薦として追加依頼。日本語で直接連絡可能 |
| 2 | note2selfmail.app/replacement-for-captio-app/ | 16 | 競合だが、比較記事で公平に扱い相互言及を提案 |
| 3 | emailmeapp.net/blog/ | 26 | 「Mail Myself」記事にSimpleMemoの言及を提案 |

### Tier 2: 中確率（新規掲載・記事内リンク）

| # | サイト/記事 | DR推定 | アプローチ |
|---|-----------|--------|----------|
| 4 | zapier.com/blog/best-productivity-apps/ | 90+ | 「note-to-email」カテゴリ追加を提案 |
| 5 | reclaim.ai/blog/productivity-apps | 60-70 | 同上 |
| 6 | emailanalytics.com/50-email-productivity-tools/ | 50-60 | SimpleMemo追加を提案 |
| 7 | spaceship.com/blog/best-email-productivity-tools/ | 60-70 | 同上 |
| 8 | toolfinder.co/best/email-apps | 30-50 | 同上 |
| 9 | awesome-mac (GitHub) | 56 | PR提出（emailmeapp.netが掲載済み） |
| 10 | awesome-ios (GitHub) | 高 | PR提出 |

### Tier 3: 露出効果（nofollow但し認知向上）

| # | プラットフォーム | DR | アプローチ |
|---|----------------|-----|----------|
| 11 | r/productivity | 90+ | 比較記事投稿 / Captio移行スレッドへの回答 |
| 12 | r/iphone | 90+ | 同上 |
| 13 | r/apple | 90+ | Strflowスレッド等で自然に言及 |
| 14 | Product Hunt | 90+ | ローンチ |
| 15 | Hacker News | 90+ | Show HN投稿 |

### Tier 4: ポッドキャスト出演（新規追加）

| # | ポッドキャスト | 想定効果 | アプローチ |
|---|--------------|---------|----------|
| 16 | Rich On Tech | DR75-89 × 5プラットフォーム | emailmeapp.netの成功を再現 |
| 17 | Indie Hackers Podcast | DR60-70 | indie dev + Captio代替ストーリー |
| 18 | Build Your SaaS | DR40-50 | 開発ストーリー |
| 19 | Rebuild.fm (日本語) | DR50-60 | 日本語圏での開発者認知 |

---

## 6. GSCデータ分析（2026/02/20〜03/19, 28日間）

### サイト全体

| 指標 | 値 |
|------|-----|
| クリック数 | **11**（前期比+82%） |
| 表示回数 | **1,477**（前期比+100%） |
| インデックス登録ページ | 80 |
| 主要国 | 日本82%, カナダ9%, トルコ9% |

### 致命的な発見

#### 1. 「captio」関連クエリの検索ボリュームはほぼゼロ

| クエリ | 表示回数 | クリック |
|--------|---------|---------|
| captio | 2 | 0 |
| captio app | 1 | 0 |
| 「captio 代替」 | **GSCに出現せず** | - |
| 「captio alternative」 | **GSCに出現せず** | - |

**SERP分析で「captio 代替」1位を確認済みだが、そもそも誰も検索していない。**
Captio終了から約1年が経過し、移行需要は既に枯渇した可能性が高い。

#### 2. 英語クエリからのトラフィックはゼロ

GSC上位84クエリの中に英語の「captio alternative」「send email to yourself」等のクエリは**1件も存在しない**。
英語版ページ（/en/captio-alternative/）はインデックスされているが、検索流入がゼロ。

#### 3. 実際にインプレッションがあるクエリは「メモアプリ比較」系

| クエリ | 表示回数 | クリック | 備考 |
|--------|---------|---------|------|
| evernote vs notion | 24 | 0 | 競合激戦区、上位は不可能 |
| メモアプリ おすすめ 2026 | 23 | 0 | DR80+メディアが独占 |
| メモソフト おすすめ 2026 | 21 | 0 | 同上 |
| ビジネスユーザー おすすめ メモアプリ 2026 | 21 | 0 | 同上 |
| notion vs evernote | 15 | 0 | 同上 |
| google keep iphone メモ 比較 | 11 | **1** | **唯一のオーガニッククリック** |

#### 4. ニッチで戦えるクエリの芽

| クエリ | 表示回数 | 可能性 |
|--------|---------|--------|
| メモアプリ サービス終了 リスク 比較 | 10 | **独自切り口。強化すべき** |
| メモアプリ セキュリティ | 4 | 暗号化が強み |
| メモアプリ オフライン | 1 | 差別化ポイント |
| aes gcm / aes-gcm | 計12 | 用語集ページへの流入 |
| line keep 終了 代わり | 1 | LINE Keep終了の移行需要 |
| google keep 代わり | 1 | - |

### 戦略への影響（重大な方針転換が必要）

**セッションA原案の前提が崩れた:**
- 原案: 「captio alternative」は英語圏で検索需要が明確に存在
- 現実: GSCにcaptio関連クエリがほぼ出現しない。SERP1位でもクリック0

**修正方針:**

| 変更前 | 変更後 | 理由 |
|--------|--------|------|
| 「captio alternative」をメインキーワード | サブキーワードに降格 | 検索ボリュームがほぼゼロ |
| 英語版Captio代替ページに全力投資 | **「send email to yourself app」「note to self app」向けの新ページ**を最優先 | クリーンで検索ボリュームがあるクエリ |
| 比較ページのリンク獲得が主軸 | **ポッドキャスト・GitHub掲載・Product Huntが主軸** | コンテンツSEOだけではDRは上がらない |
| 日本語ブログ量産は無意味 | 「メモアプリ サービス終了 リスク」等の**独自切り口の日本語記事**は価値あり | GSCで実際にインプレッションが出ているクエリ |

---

## 7. 次のステップ（セッションB向け）

### セッションBで作成すべきもの（優先度順）

1. **【最優先】新規ページ `/en/send-email-to-yourself/`**
   - ターゲットクエリ: 「send email to yourself app」「best note to self app iPhone」
   - 8アプリ比較（Boomerang, Pigeon, Email Me, Note to Self Mail, Drafts等）
   - 実測データ + Methodology + Disclosure
   - AI Overview最適化（TL;DR、Speakable、passage-level citability）
   - **理由: 「captio」は検索ボリュームゼロ。このクエリの方が100倍価値がある**

2. **英語版 `/en/captio-alternative/` の改修**
   - 比較対象を8アプリに拡大
   - 実測データ追加
   - ただし「captio」クエリ依存ではなく、新ページからの内部リンク先として位置づけ
   - Citation Notice追加（アウトリーチ時の引用誘導用）

3. **日本語ニッチ記事の強化**
   - 「メモアプリ サービス終了 リスク 比較」（GSCで10 imp）→ 既存記事を強化
   - 「メモアプリ セキュリティ」「メモアプリ オフライン」→ 関連ページへの内部リンク追加

4. **Schema強化**
   - ItemList + SoftwareApplication（比較ページ）
   - FAQPage強化

### あなた側の準備タスク

1. **実機計測**: SimpleMemo, Note to Self Mail, Email Me, Boomerang の4アプリから開始
2. **App Storeレビュー数確認**: 各競合のレビュー数と評価（AI Overviewの引用判断材料）
3. **AlternativeTo / SaaSHub 掲載申請の実行**
4. **Product Huntローンチ準備**（スクリーンショット、tagline、maker profile）

### DR向上のための優先アクション（コンテンツ外）

| 優先度 | アクション | 期待効果 |
|-------|----------|---------|
| 1 | Product Huntローンチ | DR90+からの1リンク + 認知爆発 |
| 2 | awesome-ios / awesome-mac GitHub PR | DR50-80からの1-2リンク |
| 3 | 英語圏生産性ポッドキャスト出演申請 | 1回で3-6本のDR70+リンク |
| 4 | AlternativeTo + SaaSHub掲載 | DR55-70からの2リンク |
| 5 | スパムリンク否認（Disavow） | DRクリーン化 |
