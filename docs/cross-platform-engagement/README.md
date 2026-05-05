# Cross-Platform Captio Engagement Contexts (100+)

**作成日**: 2026-05-05
**目的**: Reddit 限界（Captio iOS app の Reddit 上の言及は ~7-15 件が真の上限）を超えて、Captio を明示的に言及している全プラットフォーム・全コンテンツに engage する。
**納品件数**: **100+ contexts** across Reddit / HackerNews / English blogs / Japanese blogs / Forums / Product Hunt / App aggregators / News sites / Misc

---

## 0. 重要な前提（厳守）

- **自動投稿は禁止**。各 context は人間が個別レビューして手動投稿。
- **すべてのコメント/メールに開発者開示必須**：`Disclosure: I'm the developer of SimpleMemo, the spiritual successor to Captio. Not affiliated with Tupil B.V. or Ben Lenarts.`
- **商標誤認NG**：「公式後継」「Captioの正規後継」「Tupil承認」など主張禁止
- **UTM必須**：すべてのリンクに `?utm_source=<platform>&utm_medium=<comment|email|forum>&utm_campaign=captio-engagement&utm_content=<context-id>`

---

## 1. Engagement Method 分類

| Method | 説明 | 件数 |
|---|---|---|
| **comment** | コメント欄が開いていて、その場で投稿可能（Reddit/HN/IH/PH/フォーラム/blog） | ~50 |
| **email** | コメント欄が無いか閉じている。著者/編集者にメール or contact form | ~30 |
| **author_dm** | Twitter/X DM や LinkedIn メッセージ | ~10 |
| **monitor_only** | engagement手段なし。流入監視のみ | ~10 |

---

## 2. ファイル構成

| ファイル | 内容 |
|---|---|
| `00-master-index.md` | 100+ contexts の全リスト（CSV-style）、URL / type / engagement_method / priority |
| `01-reddit-threads.md` | Reddit 7+ スレッド、3-version drafts each |
| `02-hackernews-threads.md` | HN 3 スレッド、drafts |
| `03-tier1-english-blogs.md` | MacStories / Engadget / Lifehacker など 15+ |
| `04-tier1-japanese-blogs.md` | teineini.net / app-liv.jp / note.com など 15+ |
| `05-forums-and-communities.md` | RTM / GTD / OmniFocus / Drafts / MPU フォーラム 10+ |
| `06-product-hunt.md` | Captio公式ページ + 競合alts ページ 5+ |
| `07-japanese-aggregators.md` | applion / app-ranking / appstor.io 10+ |
| `08-app-stores-and-data.md` | App Store / Apptopia / Sensor Tower 5+ |
| `09-other-references.md` | LinkedIn / Twitter Wayback / その他 |
| `_skipped.md` | 検出したが engagement 不可能/非推奨な context |

---

## 3. 優先順位（priority tiers）

| Tier | 説明 | 推奨アクション期間 | 件数 |
|---|---|---|---|
| **P0** | Captio shutdown を知らずに代替を探している、または直接質問している | このセッション or 24-48h以内 | ~5 |
| **P1** | Captio を絶賛/愛用している既存 thread（ノスタルジー反応期待） | 1-2週間以内 | ~15 |
| **P2** | Captio 紹介blog (古い記事だが SEO 流入が継続) — 編集者にbroken link通知 | 1ヶ月以内 | ~30 |
| **P3** | 検索や archive ページ (engagement優先度低) | monitor only | ~50 |

---

## 4. 運用フロー

```
1. 00-master-index.md を開く
2. priority P0 の5件を最初に処理：
   - 各fileを開いて draft v1 を読む
   - 該当URLをブラウザで開く
   - スレッド/記事の現状を確認 (closed? archived? OPの最近活動?)
   - draft をその場のトーンに合わせて2-3箇所カスタマイズ
   - 投稿 / 送信
   - docs/outreach-log.md に記録
3. P1 を週3件ペースで処理 (15件 × 5週 = 月1.25回ペース)
4. P2 はメールバッチ (1日1件、30日で完了)
5. P3 は monitor only (毎月1日に GA4 で referral 確認)
```

---

## 5. 戦略インサイト（Reddit データから）

1. **LP コピーは「send my thoughts straight to my inbox」（r/productivity 実音声 verbatim）**
2. **競合言及順位**: Things > Drafts ≈ Apple Notes ≈ IFTTT > Todoist > Bear > OmniFocus
3. **Captio 価値ワード**: 「fast」「instant」「lightning fast」「opens in an instant」「one button」
4. **Captio shutdown は Reddit で話題化されていない** (主に note.com/Twitter/X) → **engagement P0 候補は古いスレ + 日本語ブログにある**
5. **price/privacy は Reddit ユーザーの悩みではない** (LP 強調しすぎ問題)

---

## 6. 関連ドキュメント

- `docs/cowork-broken-link-outreach.md` — 18 件 (Captio shutdown blog targets)
- `docs/cowork-reddit-captio-research.md` — Reddit 調査の元ブリーフ
- `docs/cowork-reddit-reply-drafts.md` — Reddit 7 スレッド向け drafts (本ドキュメントに統合)
- `docs/outreach-haro-setup.md` — HARO/Featured/Qwoted 運用
- `docs/outreach-log.md` — 投稿/送信ログ (作成すべき)
- `reddit-captio-only-research/data/exports/reddit_captio_only_ranked.csv` — 元データ
- `reddit-captio-only-research/reports/reddit_captio_only_strategy.md` — 戦略分析

---

開始。優先度高 (P0/P1) から個別ファイルを開いて投稿してください。
