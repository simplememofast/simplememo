# PLAN.md — Reddit上の「Captio」言及徹底調査

**作成日**: 2026-05-05
**対象**: Reddit上で iOS アプリ「Captio」（Tupil B.V. 製、2024年10月終了）に明示的に言及した投稿・コメント
**目標**: 1000件収集（到達不能の場合は理由・残ギャップを明記）
**最終目的**: Captio代替マーケティング施策（LP コピー、App Store 説明文、Reddit 投稿/返信、SEO、機能優先順位、価格設計）に直結する実行可能な結論

---

## 1. 調査スコープ（厳守）

### 1-1. 収集対象

本文・タイトル・コメント・URL・スレッド文脈のいずれかに **Captio / captio / CAPTIO** が明示的に含まれる Reddit 上のもの。

### 1-2. 除外対象

「Captio」という語が一切出てこないもの。たとえ用途が近くても以下は **収集しない**：
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

Captio を含むスレッド内に Drafts / Pigeon / Apple Notes / Shortcuts などが「一緒に語られている」場合のみ、**そのスレッド単位で**競合言及・比較軸として記録する。Captio を含まないスレッドはどんなに用途が近くても無視する。

---

## 2. 検索クエリ一覧（厳守）

### 2-1. キーワード単独検索（Reddit API / Reddit内検索）

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

### 2-2. site: 検索（Web検索エンジン経由）

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

すべてのサブレで、**Captio を含むスレッド・コメントのみ** 記録対象。

---

## 3. 取得方法（優先順）

### 3-1. 第1優先: Reddit 公式 API（PRAW 経由）

- **使用条件**: `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` / `REDDIT_USER_AGENT` の3つを `.env` に設定
- **エンドポイント**: `subreddit.search(query, syntax='lucene')`、`subreddit.comments()`、`submission.comments`
- **rate limit**: PRAW が自動で 60 req/min に絞ってくれる
- **想定到達範囲**: 各クエリで上位 1000 件まで取得可能（Reddit の検索 API 上限）
- **ステータス**: **クレデンシャル未設定 → このセッションでは未稼働**

### 3-2. 第2優先: Reddit 公開 JSON エンドポイント（無認証）

- **URL 形式**: `https://www.reddit.com/r/<sub>/search.json?q=Captio&restrict_sr=1&limit=100`
- **個別スレッド**: `https://www.reddit.com/r/<sub>/comments/<id>/.json`
- **rate limit**: 60 req/min（実測ベース）
- **制限**: User-Agent ヘッダ必須、CAPTCHA に当たる場合あり、近年は認証必須化が進行
- **代替手段としての位置付け**: 公式 API が使えない場合の最初の選択肢

### 3-3. 第3優先: Web 検索エンジン（Google / Bing / DuckDuckGo）

- **WebSearch ツール経由**で `site:reddit.com Captio` 等を実行
- **取得できるもの**: タイトル + 抜粋 + URL（本文全体は取れない）
- **後続処理**: 取得した URL を WebFetch で個別にフェッチして本文化
- **制限**: 検索結果上限（通常 ~10件/クエリ）、キャッシュ古さ、検索エンジンのクオリティ揺れ

### 3-4. 第4優先: 既知 Reddit スレッド の人手シード

- 過去に SimpleMemo 文脈で確認済みの Captio 言及スレを起点にシードする
- 関連スレッドへのリンクをたどって被リンク的に拡張

---

## 4. 想定制限と未調査リスク

| 制限 | 影響 | 対応 |
|---|---|---|
| Reddit API 認証情報未設定 | 大量・深掘り収集が制限される | `.env.example` を提供、ユーザーに作成を依頼 |
| 公開 JSON は近年 401/403 化 | 無認証収集の信頼性が低下 | API 経由に切替、または Web 検索経由に劣化 |
| WebSearch の結果数 | 1クエリ 10〜20件 | 25 クエリ × 平均 8 件 = ~200 件が初期スキャンの上限 |
| 削除された投稿 | 過去のCaptio絶賛スレッドが消えている可能性 | Wayback Machine（archive.org）で補完 |
| 古い投稿の埋没 | 2024年以前の Captio 言及はランクが低い | 検索 sort=new ではなく sort=top で深掘り |
| 1000件目標 | API 認証なしでは現実的に不可能 | 200〜400件を目標に切り替え、残りは API 取得スクリプトを納品 |

**1000件は API 認証ありでも難しい可能性**：Captio はピーク時でも MacStories / Lifehacker レベルの個人開発アプリ。月 30 検索ボリュームで想定すると、Reddit 上の生涯 Captio 言及総数は **300〜800 件**と推定される。実測 200〜400件で「事実上の網羅」となる可能性が高い。

---

## 5. 出力スキーマ

### 5-1. CSV / JSONL カラム（必須）

| 列名 | 型 | 例 |
|---|---|---|
| id | string | t3_xxxxxx / t1_xxxxxx |
| type | enum | post / comment |
| subreddit | string | productivity |
| title | string (空可) | "Captio is gone, what now?" |
| body | text | フルテキスト |
| url | string | https://reddit.com/.../ |
| permalink | string | /r/productivity/comments/.../ |
| created_utc | int | 1612345678 |
| created_date | ISO 8601 | 2024-10-15T12:34:56Z |
| score | int | 42 |
| num_comments | int | 8 |
| author_name | string | u/username |
| query_that_found_it | string | "Captio alternative" |
| matched_keywords | list | ["captio", "alternative"] |
| captio_mention_context | text | "I used to use Captio every day..." |
| relevance_score | int 0–100 | 92 |
| relevance_reason | text | "Captio終了後の代替探索" |
| language | string | en / ja / mixed |
| sentiment | enum | positive / negative / neutral / frustrated / looking_for_solution / nostalgic / skeptical / price_sensitive / privacy_sensitive |
| pain_point | list | ["captio_shutdown", "no_alternative", ...] |
| user_intent | enum | discovery / comparison / migration / nostalgia / complaint / praise |
| competitor_mentions | list | ["Drafts", "Pigeon"] |
| recommended_action | enum | reply / faq_addition / lp_copy / seo_article / app_store_copy / no_action |
| classification | enum (A〜G) | B (Captio終了・利用不能) |

### 5-2. オプショナル列

`parent_post_title`, `parent_post_url`, `comment_depth`, `upvote_ratio`, `flair`, `app_mentions`, `buying_intent`, `spam_risk`, `reply_opportunity`, `suggested_reply_angle`, `SEO_angle`, `LP_copy_angle`

### 5-3. 出力ファイル一覧

| ファイル | 内容 |
|---|---|
| `data/raw/reddit_captio_<query>_<timestamp>.jsonl` | 検索クエリ毎の生レスポンス（重複含む） |
| `data/exports/reddit_captio_only_raw.csv` | 全収集結果（重複含む） |
| `data/exports/reddit_captio_only_deduped.csv` | permalink 重複除外済み |
| `data/exports/reddit_captio_only_ranked.csv` | relevance_score ≥50 のみ、降順 |
| `reports/reddit_captio_only_subreddit_map.md` | サブレ別まとめ |
| `reports/reddit_captio_only_insights.md` | 戦略インサイト |
| `reports/reddit_captio_reply_templates.md` | 返信テンプレ集 |
| `reports/reddit_captio_seo_keywords.md` | Captio文脈の SEO KW |
| `reports/reddit_captio_methodology.md` | 調査方法・制限・再現方法 |

---

## 6. relevance_score 計算ルール（ベースライン）

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
| score 高 or num_comments 多 (>10) | +10 |
| Captio を含まない | -40（除外候補） |
| Captio 別語義 / 誤爆 | -30 |
| bot / spam / 広告のみ | -20 |
| 本文短すぎ・文脈不明 | -20 |

最終スコアは 0〜100 にクリップ。各加減算の根拠を `relevance_reason` 列に箇条書きで残す。

---

## 7. 分類ラベル（A〜G）

| ラベル | 意味 |
|---|---|
| **A** | Captio 愛用・高評価 |
| **B** | Captio 終了・利用不能 |
| **C** | Captio 代替探索 |
| **D** | Captio の使い方説明 |
| **E** | Captio と競合比較 |
| **F** | Captio への不満 |
| **G** | 低関連（言及はあるが文脈薄） |

---

## 8. 検証する仮説

1. Captio ユーザーは「ノート管理」ではなく「自分の受信箱への一瞬のメモ入口」を求めていた
2. Captio 代替で比較されるのは Notion/Apple Notes より Drafts / Pigeon / Shortcuts / 自分宛メール系
3. Reddit の Captio 言及は少数だが用途解像度が高く、転換可能性が高い
4. Captio 終了・代替探索文脈は SimpleMemo の最重要獲得導線
5. Captio 文脈では機能多さより「速さ」「単機能」「メール送信」「考えが消える前」が価値
6. Captio 代替訴求では Shortcuts 差別化・価格・プライバシー説明が必須

---

## 9. 倫理・遵守事項

- **CAPTCHA 回避禁止** / ログイン突破禁止 / rate limit 無視禁止
- スクレイピングは Reddit 公式 API + 公開 JSON のみ
- 個人攻撃・晒し目的の個人情報収集禁止
- 投稿者特定調査禁止
- スパム生成禁止 / ボット自動返信禁止
- Captio に言及していない周辺ニーズの大量収集禁止

---

## 10. ディレクトリ構成

```
reddit-captio-only-research/
├── PLAN.md                   ← 本ファイル
├── README.md                 ← 実行手順
├── requirements.txt          ← praw, pandas, python-dotenv 等
├── .env.example
├── scripts/
│   ├── search_reddit_captio.py     # PRAW + 公開JSON 経由の検索
│   ├── fetch_thread_comments.py    # スレッド全コメント取得
│   ├── dedupe_results.py           # 重複除外
│   ├── score_relevance.py          # スコア計算
│   ├── classify.py                 # A-G 分類
│   └── generate_reports.py         # MD レポート生成
├── data/
│   ├── raw/                  # クエリ毎の JSONL
│   ├── processed/            # クリーニング後
│   └── exports/              # CSV 最終出力
└── reports/                  # MD レポート
```

---

## 11. 段階的実行計画

| フェーズ | 内容 | 想定到達 | このセッション内で可能か |
|---|---|---|---|
| **Phase 1** | PLAN.md 作成 | 完了 | ✅ |
| **Phase 2** | プロジェクト雛形 + Python スクリプト一式 | 全コード | ✅ |
| **Phase 3** | WebSearch / WebFetch で初期スキャン (~20-50件) | サンプル収集 | ✅ |
| **Phase 4** | Reddit API での本格収集 (200〜400件) | 必要: API認証 | ❌（クレデンシャル要） |
| **Phase 5** | 全レポート生成（Phase 3 データで草稿、Phase 4 で確定） | 8レポート | 草稿: ✅ / 確定: ❌ |

---

## 12. ユーザーへの依頼事項

このセッションで Phase 4 まで実行するには **Reddit API クレデンシャル**が必要です：

```
1. https://www.reddit.com/prefs/apps にログイン
2. "create another app" → "script" タイプ
3. name: simplememo-research
4. redirect uri: http://localhost:8080
5. 発行される client_id と client_secret を取得
6. .env に下記を設定:
   REDDIT_CLIENT_ID=<client_id>
   REDDIT_CLIENT_SECRET=<client_secret>
   REDDIT_USER_AGENT="simplememo-research by /u/<your-reddit-username>"
```

**未設定でも進める場合**：Phase 3 までで可能な範囲（WebSearch/WebFetch 経由で 20〜50件）を実行し、Python スクリプトは Phase 4 が起動できる状態で納品します。

---

## 13. 想定アウトプット品質

- **悪い例**: 「r/productivity に Captio の投稿があった」
- **良い例**: 「r/productivity では Captio は『ノート管理アプリ』ではなく『思考が消える前に自分のメール受信箱へ投げる超高速入口』として語られている。したがって Captio 代替 LP の冒頭は "A simple note app" ではなく "The fastest Captio replacement for sending notes to your inbox" のように、Captio 代替であることと用途を明示した方がよい」

すべての結論は **施策に直結する形** に落とし込む。
