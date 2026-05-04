# CoWork依頼: Reddit上の「Captio」言及徹底調査

**作成日**: 2026-05-05
**対象**: Reddit上で iOS アプリ「Captio」（Tupil B.V. 製、2024年10月終了）に**明示的に**言及した投稿・コメント
**目標**: 1,000件収集（到達不能の場合は根拠と未調査領域を明記）
**最終ゴール**: Captio 代替マーケティング施策（LP / App Store 説明文 / Reddit 投稿 / 返信 / SEO / 機能優先順位 / 価格設計）に直結する実行可能な結論

---

## 0. 背景（SimpleMemo / 株式会社ユリカ）

- SimpleMemo（Captio式シンプルメモ）は、2024年10月にApp Storeから削除された Captio（Tupil B.V. 製、開発者: Ben Lenarts）の **後継アプリ**として2026年に株式会社ユリカ（YURIKA, K.K.）がリリースした iOS アプリ。
- **計測実績**（iPhone 15 / iOS 17, 20回平均）: 起動 0.3 秒 / 送信 150ms / ブレインインボックス 2 秒未満
- AES-GCM 端末内暗号化、オフライン Outbox、Gmail API 非依存（Cloudflare Workers + Resend API 独自基盤）
- 料金: 無料1日3通 + Premium 月額 500 円 / 年額 5,000 円（$2.99/mo or $29.99/yr）、7日間無料トライアル付き
- 公式 LP（UTM 付き紹介用）:
  - JA: `https://simplememofast.com/captio-alternative/?utm_source=reddit&utm_medium=research&utm_campaign=captio-research&utm_content=<context-slug>`
  - EN: `https://simplememofast.com/en/captio-alternative/?utm_source=reddit&utm_medium=research&utm_campaign=captio-research&utm_content=<context-slug>`
  - EN（自分宛メール系）: `https://simplememofast.com/en/send-email-to-yourself/?utm_source=reddit&utm_medium=research&utm_campaign=captio-research&utm_content=<context-slug>`
- **重要**: SimpleMemo および YURIKA, K.K. は Captio (Tupil B.V.) や Ben Lenarts と一切の提携・後援関係にない。「Captio式」は操作思想を引き継ぐマーケ表現であり、なりすまし・公式後継主張は厳禁。

---

## 1. 厳守スコープ

### 1-1. 収集対象

本文・タイトル・コメント・URL・スレッド文脈のいずれかに **Captio / captio / CAPTIO** が明示的に含まれる Reddit 上のもの。

### 1-2. 除外対象（**Captio が出てこない限り全部除外**）

- email yourself notes
- send notes to myself
- quick capture app
- GTD inbox
- ADHD note app
- Apple Notes too slow
- Drafts alternative
- Pigeon app
- SimpleMemo / Simple Memo / Simple Memo Fast

### 1-3. 周辺アプリの扱い

Captio を含むスレッド内で Drafts / Pigeon / Apple Notes / Shortcuts などが「一緒に語られている」場合のみ、そのスレッド単位で競合言及・比較軸として記録する。Captio を含まないスレッドはどれだけ用途が近くても**無視**。

---

## 2. 検索クエリ一覧（厳守 — これ以外の単独検索は禁止）

### 2-1. キーワード単独（Reddit API 内検索 / Reddit 検索ボックス）

```text
Captio
"Captio app"
"Captio iOS"
"Captio notes"
"Captio note"
"Captio email"
"Captio Gmail"
"Captio IFTTT"
"Captio Workflow"
"Captio Shortcuts"
"Captio Drafts"
"Captio Pigeon"
"Captio Bear"
"Captio Workflowy"
"Captio GTD"
"Captio productivity"
"Captio alternative"
"Captio replacement"
"Captio discontinued"
"Captio shut down"
"Captio stopped working"
"Captio no longer works"
"Captio similar app"
"app like Captio"
"apps like Captio"
```

### 2-2. site: 検索（Google / Bing / DuckDuckGo）

```text
site:reddit.com Captio
site:reddit.com/r/productivity Captio
site:reddit.com/r/gtd Captio
site:reddit.com/r/ios Captio
site:reddit.com/r/iosapps Captio
site:reddit.com/r/noteapps Captio
site:reddit.com/r/shortcuts Captio
site:reddit.com/r/workflow Captio
site:reddit.com/r/bearapp Captio
site:reddit.com/r/Workflowy Captio
site:reddit.com/r/ADHD_Programmers Captio
site:reddit.com/r/androidapps Captio
site:reddit.com/r/apple Captio
site:reddit.com/r/iphone Captio
site:reddit.com/r/apps Captio
site:reddit.com/r/macapps Captio
site:reddit.com/r/productivity "Captio app"
site:reddit.com/r/productivity "Captio alternative"
site:reddit.com/r/gtd "Captio"
site:reddit.com/r/ios "Captio"
```

### 2-3. 優先サブレ別ピンポイント検索

**最優先（高確度）**: r/productivity, r/gtd, r/ios, r/iosapps, r/noteapps, r/shortcuts, r/workflow, r/bearapp, r/Workflowy, r/ADHD_Programmers, r/androidapps

**次点（低密度想定）**: r/apple, r/iphone, r/apps, r/macapps, r/GetDisciplined, r/Notion, r/ObsidianMD, r/Todoist, r/thingsapp, r/OmniFocus, r/SaaS, r/microsaas, r/SideProject, r/startups, r/Entrepreneur

すべてのサブレで Captio を含むスレッド・コメントのみ記録。

> **禁止**: `email yourself notes` 単独 / `quick capture app` 単独 / `SimpleMemo` 単独。必ず Captio を含むクエリ。

---

## 3. 取得方法（優先順）

| 順位 | 方法 | 備考 |
|---|---|---|
| 1 | **Reddit 公式 API（PRAW）** | `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` / `REDDIT_USER_AGENT` を `.env` で設定 |
| 2 | **Reddit 公開 JSON エンドポイント**（無認証）| `https://www.reddit.com/r/<sub>/search.json?q=Captio&restrict_sr=1` 等。User-Agent 必須 |
| 3 | **Web 検索エンジン**経由 | `site:reddit.com Captio` を Google/Bing で実行、URL を WebFetch で本文化 |
| 4 | **既知シードからの被リンク辿り** | Captio 言及スレを起点に関連スレ・親スレ・コメント全件を取得 |

### Reddit API クレデンシャル取得手順（実行者向け）

```
1. https://www.reddit.com/prefs/apps にログイン
2. "create another app" → "script" タイプ
3. name: simplememo-captio-research
4. redirect uri: http://localhost:8080
5. 発行される client_id と client_secret を取得
6. .env に設定:
   REDDIT_CLIENT_ID=<client_id>
   REDDIT_CLIENT_SECRET=<client_secret>
   REDDIT_USER_AGENT="simplememo-captio-research by /u/<reddit-username>"
```

---

## 4. 厳守の禁止事項

- CAPTCHA 回避禁止
- ログインが必要な非公開領域へのアクセス禁止
- rate limit を無視した大量アクセス禁止
- Reddit 規約違反のスクレイピング禁止
- 個人攻撃・晒し目的の個人情報収集禁止
- 投稿者特定調査禁止
- スパム投稿の自動生成禁止
- ボット自動返信禁止
- **Captio に言及していない周辺ニーズの大量収集禁止**

---

## 5. 出力スキーマ

### 5-1. 収集レコード（CSV / JSONL 共通カラム）

**必須**:
- `id` / `type` (post|comment) / `subreddit`
- `title` / `body` / `url` / `permalink`
- `created_utc` / `created_date`
- `score` / `num_comments` / `author_name`
- `query_that_found_it` / `matched_keywords`
- `captio_mention_context`（Captio が出てくる前後 1〜2 文の抜粋）
- `relevance_score` (0–100) / `relevance_reason`（加減算の根拠を箇条書き）
- `language` (en/ja/mixed)
- `sentiment` (positive / negative / neutral / frustrated / looking_for_solution / nostalgic / skeptical / price_sensitive / privacy_sensitive)
- `pain_point`（リスト：captio_shutdown / no_alternative / launch_speed / drafts_too_complex / shortcuts_unstable / mail_app_slow / privacy_concern / subscription_aversion / lifetime_plan_demand / android_demand 等）
- `user_intent` (discovery / comparison / migration / nostalgia / complaint / praise)
- `competitor_mentions`（リスト：Drafts / Pigeon / Captioo / Apple Notes / Google Keep / Bear / Workflowy / Obsidian / Notion / Todoist / Things / OmniFocus / Nirvana / Evernote / Braintoss / Email Me / Mail to Self / Shortcuts / IFTTT / Zapier — Captio と同じスレッド内で出現した場合のみ）
- `recommended_action` (reply / faq_addition / lp_copy / seo_article / app_store_copy / pricing_signal / no_action)
- `classification` (A / B / C / D / E / F / G — 後述)

**可能なら**: `parent_post_title`, `parent_post_url`, `comment_depth`, `upvote_ratio`, `flair`, `app_mentions`, `buying_intent`, `spam_risk`, `reply_opportunity`, `suggested_reply_angle`, `SEO_angle`, `LP_copy_angle`

### 5-2. 分類 A〜G

| ラベル | 意味 |
|---|---|
| **A** | Captio 愛用・高評価 |
| **B** | Captio 終了・利用不能 |
| **C** | Captio 代替探索 |
| **D** | Captio の使い方説明 |
| **E** | Captio と競合比較 |
| **F** | Captio への不満 |
| **G** | 低関連（言及はあるが文脈薄） |

### 5-3. relevance_score 計算ルール

| 条件 | 加減算 |
|---|---|
| Captio に直接言及 | +60 |
| Captio alternative / replacement に言及 | +50 |
| Captio discontinued / shut down / stopped working | +50 |
| Captio を愛用・高評価 | +40 |
| Captio の具体的な使い方を説明 | +35 |
| Captio と Drafts / Pigeon / Shortcuts / Apple Notes 比較 | +30 |
| Captio を GTD / inbox / workflow 文脈で使用 | +25 |
| "looking for" / "recommend" / "alternative" / "app like" | +20 |
| "too slow" / "too much friction" / "overkill" 等の不満 | +15 |
| score 高 or num_comments >10 | +10 |
| Captio を含まない | -40（除外候補） |
| Captio 別語義 / 誤爆 | -30 |
| bot / spam / 広告のみ | -20 |
| 本文短すぎ・文脈不明 | -20 |

最終スコアは 0〜100 にクリップ。`relevance_reason` 列に加減算の根拠を箇条書きで残す。

---

## 6. 納品ファイル一覧

### 6-1. データファイル

1. `data/exports/reddit_captio_only_raw.csv` — 全収集結果（重複含む）
2. `data/exports/reddit_captio_only_deduped.csv` — permalink 重複除外済み
3. `data/exports/reddit_captio_only_ranked.csv` — relevance_score ≥50 を降順
4. `data/raw/*.jsonl` — クエリ毎の生レスポンス

### 6-2. レポート（Markdown）

5. `reports/reddit_captio_only_subreddit_map.md` — サブレ別まとめ
   - 各サブレについて: Captio 言及件数 / 代表的な文脈 / 住民の温度感 / 宣伝耐性 / 投稿可否 / コメント返信向きか / 推奨アプローチ / 避けるべき言い方 / 代表スレ URL

6. `reports/reddit_captio_only_insights.md` — 戦略インサイト
   - Reddit 上での Captio 文脈の全体像
   - Captio ユーザーが価値を感じていた点
   - Captio 終了後の代替探索
   - 一緒に語られる競合アプリ
   - Captio 代替として訴求すべき言葉
   - SimpleMemo の勝ち筋・弱点
   - LP に入れるべきコピー
   - App Store 説明文に入れるべきコピー
   - Reddit 投稿案 / 返信案 / FAQ 案 / 価格示唆 / 機能改善示唆 / SEO 記事案

7. `reports/reddit_captio_reply_templates.md` — 返信テンプレ集
   - Captio 終了で困っている人 / 代替探索 / 懐古 / Drafts 比較 / Pigeon 比較 / Shortcuts 比較 / Apple Notes 比較 / GTD 用途 / IFTTT・Zapier 連携 / サブスク高い / privacy 不安 / 開発者自己紹介 / 宣伝臭抑え / r/productivity 向け / r/iosapps 向け / r/noteapps 向け / r/gtd 向け

8. `reports/reddit_captio_seo_keywords.md` — Captio文脈の SEO KW
   - Captio alternative 系 / replacement 系 / discontinued 系 / app 系 / workflow 系 / competitor comparison 系 / long-tail 系
   - **Captio を含まないキーワードは出さない**

9. `reports/reddit_captio_methodology.md` — 調査方法・検索クエリ・制限・未調査領域・再現方法

### 6-3. Python スクリプト一式

```
reddit-captio-only-research/
├── README.md
├── PLAN.md
├── requirements.txt
├── .env.example
├── scripts/
│   ├── search_reddit_captio.py     # PRAW + 公開JSON 経由
│   ├── fetch_thread_comments.py    # スレッド全コメント取得
│   ├── dedupe_results.py           # 重複除外
│   ├── score_relevance.py          # スコア計算（ルールベース、根拠列を残す）
│   ├── classify.py                 # A-G 分類
│   └── generate_reports.py         # MD レポート生成
├── data/
│   ├── raw/                        # クエリ毎の JSONL
│   ├── processed/                  # クリーニング後
│   └── exports/                    # CSV 最終出力
└── reports/                        # MD レポート
```

### 6-4. Python 要件

- 例外処理を入れる
- rate limit を尊重する
- 中断しても再開できる（チェックポイント）
- 生データを保存する
- 同一 URL・同一本文の重複除外
- 検索クエリごとの件数をログ化
- 取得失敗 URL を別ファイルに保存
- 収集結果にタイムスタンプを入れる
- CSV と JSONL の両方で保存
- relevance_score はルールベース、根拠列を残す
- **Captio を含まない結果は保存前に除外**、除外件数をログに残す

---

## 7. 検証する仮説

1. Captio ユーザーは「ノート管理」ではなく「自分の受信箱への一瞬のメモ入口」を求めていた
2. Captio 代替で比較されるのは Notion / Apple Notes より Drafts / Pigeon / Shortcuts / 自分宛メール系
3. Reddit の Captio 言及は少数だが用途解像度が高く、転換可能性が高い
4. Captio 終了・代替探索文脈は SimpleMemo の最重要獲得導線
5. Captio 文脈では機能多さより「速さ」「単機能」「メール送信」「考えが消える前」が価値
6. Captio 代替訴求では Shortcuts 差別化・価格・プライバシー説明が必須

---

## 8. 投稿案 / 返信案の作成条件

### 8-1. Reddit 投稿案

各投稿案に必ず含める:
- 対象サブレ
- 投稿タイトル / 本文
- Captio にどう言及するか
- 宣伝リスク / 想定批判 / 批判への返信
- リンクを貼るべきか
- 開発者であることをどう明示するか
- 投稿タイミング
- 成功指標

方向性:
- Captio 終了後の代替を探していた人向け
- Captio が好きだった理由を分解する投稿
- Captio のような単機能アプリがなぜ今も必要か
- Captio と Drafts / Shortcuts / Pigeon の比較
- 「ノートアプリを作った」ではなく「Captio がなくなって困ったので代替を作った」文脈
- Captio ユーザーにだけ刺さる狭い投稿

### 8-2. コメント返信原則

- Captio に言及している相手にだけ返信
- いきなりリンクを貼らない案も作る
- 開発者であることを明示
- 相手の Captio への思い入れ・困りごとに先に共感
- 「自分のアプリを使って」ではなく「Captio 代替を探しているならこういう選択肢がある」
- 宣伝禁止サブレではリンクを避ける
- 必ず代替案も紹介
- Shortcuts や Drafts を否定しすぎない
- SimpleMemo の弱点も正直に書く
- 1コメントは短く、自然な英語

---

## 9. 英語コピー案も作成

Captio 言及データだけをもとに：

| 項目 | 件数 | 制約 |
|---|---|---|
| Captio 代替 LP Hero 案 | 10案 | — |
| Captio 代替 SEO タイトル案 | 20案 | — |
| App Store subtitle 案 | 10案 | 30文字以内 |
| Reddit 向け一文説明 | 20案 | — |
| FAQ 見出し | 20案 | — |
| 比較記事タイトル | 20案 | — |

すべて Captio 文脈に限定。

---

## 10. 最終納品形式（順序厳守）

1. 収集件数
2. 重複除外後件数
3. Captio 直接言及件数
4. Captio 終了・利用不能文脈の件数
5. Captio 代替探索文脈の件数
6. サブレ別件数ランキング
7. 関連度上位 50 件
8. 最重要インサイト 10 個
9. 今すぐ返信すべき Captio 言及スレ 10 件
10. 今すぐ作るべき Captio 代替 LP 修正案
11. Reddit 投稿案
12. Redditコメント返信案
13. 未調査・不確実な点
14. 次の調査ステップ

---

## 11. 必ず答える質問リスト

1. Reddit 上で Captio はどのように語られているか？
2. Captio ユーザーは何に価値を感じていたか？
3. Captio 終了後、ユーザーは何を探しているか？
4. Captio の代替として名前が出るアプリは何か？
5. Drafts / Pigeon / Shortcuts / Apple Notes などとの違いは何か？
6. Captio 言及が多いサブレはどこか？
7. Captio 文脈で返信すべき既存スレはどれか？
8. Captio 代替として投稿すべきサブレはどこか？
9. どの言い方をすると宣伝臭くなるか？
10. Captio 代替 LP で最初に直すべきコピーは何か？
11. App Store 説明文で強めるべき訴求は何か？
12. Reddit から見える価格抵抗はあるか？
13. lifetime plan は必要か？
14. privacy 説明はどこまで必要か？
15. Shortcuts との差別化はどう説明すべきか？
16. Captio 代替として必要な機能改善優先順位は何か？
17. 1,000 件収集に届いたか？届かない場合、なぜか？
18. 次に追加調査すべき場所はどこか？

---

## 12. 期待する結論の粒度

**悪い例**: 「r/productivity に Captio の投稿がありました。」

**良い例**: 「r/productivity では Captio は『ノート管理アプリ』ではなく、『思考が消える前に自分のメール受信箱へ投げるための超高速入口』として語られている。したがって Captio 代替 LP の冒頭は "A simple note app" ではなく "The fastest Captio replacement for sending notes to your inbox" のように、Captio 代替であることと用途を明示した方がよい。」

---

## 13. 1,000件目標の現実的見立て

Captio はピーク時でも MacStories / Lifehacker レベルの個人開発アプリ。月間検索 30 件程度のニッチ。**Reddit 上の生涯 Captio 言及総数は 300〜800 件と推定**。1,000 件は API 認証ありでも超困難な可能性が高い。

**実測 200〜400 件で「事実上の網羅」**となる可能性が高い。1,000 件未到達でも諦めず、以下を試すこと:
- 削除済み投稿は Wayback Machine（archive.org）で補完
- Pushshift（独立ミラー）が再公開されていたら活用
- sort=top で深掘り、sort=new で新規動向
- Captio 言及スレッドの全コメントを取得して雪玉的に拡張

---

## 14. 品質基準

- URLなしの主張は禁止
- Reddit の引用は必ず permalink 付き
- 重要な引用は原文を残す（ただし長文引用しすぎない）
- 重複を除く
- ノイズを分類する
- 不確実な点は明記する
- **Captio に言及していないものは除外**
- 1,000 件に届かなくても諦めず、Captio を含む検索語・サブレ・競合との共起語から探索を広げる
- 最終的には「Captio 代替として何をすればインストールが増えるか」まで落とし込む

---

## 15. 最重要アウトプット（特に欲しい順）

1. CaptioがRedditでどう語られていたか
2. Captio 難民がいる場所（サブレ + 代表スレ）
3. Captio 代替を探している既存スレ（返信候補）
4. Captio 文脈で投稿すべきサブレ
5. Captio 文脈では避けるべきサブレ
6. Captio 代替 LP と App Store で変えるべきコピー
7. 価格・privacy・Shortcuts 比較への答え
8. Captio 代替としての機能改善優先順位

調査は **Captio 限定で広く**、分析は **深く**、結論は **実行可能** に。

---

## 16. 既存リソース（参照用）

- 開発側で用意済みの戦略 PLAN: `reddit-captio-only-research/PLAN.md`（このリポジトリ内、すでにディレクトリ構成と取得方法の詳細が記載済み）
- Captio 代替 LP 現状: `https://simplememofast.com/captio-alternative/`（JA / 1,500行 / FAQPage + HowTo + SoftwareApplication + Organization JSON-LD 実装済み）
- Captio 終了情報ハブ: `https://simplememofast.com/blog/captio-discontinued`（rank 6 / 「captio」キーワードで現在最強）
- 過去のCaptio関連プレスリリース（被リンク獲得済み）: `https://prtimes.jp/main/html/rd/p/000000001.000182412.html`

---

## 開始指示

cowork はまずこの依頼書を全文読んだ上で:

1. **Phase 1**: `reddit-captio-only-research/` に Python プロジェクト雛形を生成
2. **Phase 2**: Reddit API クレデンシャル取得手順をユーザーに案内
3. **Phase 3**: クレデンシャル受領後、search → fetch → dedupe → score → classify → generate_reports の順で実行
4. **Phase 4**: 全レポート + データ + スクリプトを納品
5. **Phase 5**: 1,000 件未到達の場合は理由・残ギャップ・次の手を `methodology.md` に明記

調査開始。
