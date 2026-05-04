# HARO / Featured / Qwoted アウトリーチ運用ドキュメント

**作成日**: 2026-05-05
**目的**: SimpleMemo の被リンク獲得戦略における3大プラットフォーム（HARO・Featured.com・Qwoted）への登録〜運用フローを標準化し、毎日3回のメール監視〜回答までを再現可能なルーチンにする。
**月間目標**: HARO 経由で **DR40+ メディア言及 3〜6本/月**（戦略レポート Day 22-30 該当）

---

## 0. 前提理解

| プラットフォーム | 概要 | 月額 | 強み | 弱み |
|---|---|---|---|---|
| **HARO** | Help A Reporter Out。Connectivelyから2025年4月独立復活 | 無料 | 一日3回（朝7時・13時・17時 ET）の記者リクエスト配信、業界デファクト | 競争激しい、即返信が必要 |
| **Featured.com** | エキスパート回答プラットフォーム | 無料〜$49/月 | 成功率42.31%報告例、回答→公開までの導線が短い | クエリ数は HARO より少ない |
| **Qwoted** | NYT・Forbes・WSJ級メディア接点 | 無料〜$149/月 | 高権威メディア露出、BtoB系特に強い | 採用率低、SaaS は競合多 |

**SimpleMemo にとっての価値**：個人開発者×元Captio長年ユーザーというナラティブが Helpful Content System で評価されやすい。E-E-A-T の "Experience" 強化。記者にとっても「アプリ終了→開発者が代替を作った」というストーリーは差別化が効きやすい。

---

## 1. 登録手順

### 1-1. HARO（Help A Reporter Out）

```
1. https://www.helpareporter.com/ にアクセス
2. "I'm a Source" を選択
3. 必須情報:
   - Email（推奨: hajimeataka@gmail.com）
   - First Name: AI
   - Last Name: Ataka
   - Country: Japan
   - Industry: Technology / Software / Apps / SaaS
4. 興味あるトピックにチェック:
   ☑ Technology
   ☑ Business and Finance（Indie Hacker / Solo founder 系記事）
   ☑ Lifestyle and Fitness（生産性ハック系記事）
5. Subscription type: Free（一日3配信メールを受信）
6. メール認証完了
```

**確認すべき送信元アドレス**: `haro@helpareporter.com`（迷惑メール振り分け対策）

### 1-2. Featured.com

```
1. https://featured.com/experts にアクセス
2. "Sign up as an Expert" を選択
3. 必須情報:
   - Email
   - Full Name: AI Ataka
   - Title: Founder & iOS Developer
   - Company: YURIKA, K.K.
   - Bio (200字以内):
     "iOS engineer with 10+ years of experience.
      Creator of SimpleMemo (the spiritual successor to Captio,
      the iOS 'note-to-email' app discontinued in October 2024).
      Productivity-focused. Long-time GTD practitioner."
   - Headshot: 顔写真（later: 1枚アップロード推奨）
   - LinkedIn URL（任意だが採用率上がる）
   - Topics: Technology / Productivity / Apps / iOS / Indie Development
4. Email 認証完了
```

### 1-3. Qwoted

```
1. https://www.qwoted.com/sources/sign_up にアクセス
2. "Source" として登録
3. 必須情報:
   - Email
   - Full Name / Title / Company
   - Areas of expertise:
     ☑ Mobile Apps
     ☑ Productivity Software
     ☑ Indie Development
     ☑ iOS Development
     ☑ App Store Marketing
4. Free tier で開始可能（PR Pro $149/月で優先度上昇、まずは無料で）
```

---

## 2. ターゲットキーワード（毎日のクエリ監視対象）

HARO・Featured・Qwoted のメール本文を毎日3回（朝・昼・夕）スキャンし、以下のキーワードが本文に含まれるリクエストに優先回答する：

### 高優先（即時回答必須）
- "Captio"（直接ブランド指名）
- "iOS productivity app"
- "note taking app"
- "email yourself" / "send email to self"
- "GTD" / "Getting Things Done"
- "indie developer" / "solo founder"
- "app shutdown" / "discontinued app"
- "iOS app developer"
- "Apple Notes alternative"
- "Drafts alternative"

### 中優先
- "productivity workflow"
- "note capture"
- "iOS shortcuts"
- "side project"
- "bootstrap SaaS"

### 低優先（時間あれば）
- "Apple ecosystem"
- "iOS 17" / "iOS 18"
- "App Store optimization"
- "ASO"

---

## 3. 回答テンプレート

### 3-1. HARO 標準テンプレ（150〜200語、English）

```
Subject: [Pitch: Captio Successor Developer / iOS Productivity Expert] re: [リクエストのトピック]

Hi [記者名],

[記事のトピックに直接関連する一文 — 質問への即答]

I'm AI Ataka, the iOS engineer behind SimpleMemo (simplememofast.com),
a productivity app released in 2026 as the spiritual successor to
Captio — the beloved "note-to-email" iOS app that was removed from
the App Store in October 2024 after 11 years.

[質問への詳細回答 80〜120語]

Specific data I can share:
- 0.3-second cold launch (measured on iPhone 15, 20-launch average)
- 150ms send latency via Cloudflare Workers + Resend API
- AES-GCM on-device encryption, offline Outbox architecture
- Long-time Captio user (2014–2024) before building this

Happy to provide a screenshot, additional measurements, or expand on
any of the above for your piece.

Best,
AI Ataka
Founder, YURIKA, K.K.
SimpleMemo / simplememofast.com
hajimeataka@gmail.com
```

### 3-2. Featured.com 短答テンプレ（80〜120語、回答ボックス用）

```
[質問への直接回答 1〜2文]

As the iOS engineer who built SimpleMemo (a successor to the discontinued
Captio app), I [具体的な根拠 / experience]. Specifically, [data point or
anecdote — e.g., "after 10 years of using Captio daily, I rebuilt it
from scratch when it was removed from the App Store in October 2024"].

[結論またはアクショナブルなアドバイス].
```

### 3-3. Qwoted ピッチテンプレ（30〜60秒で読める長さ）

Qwoted は個別ジャーナリストへの直接ピッチ。HARO より個人化が必須。

```
Hi [記者名],

I saw your recent piece on [記者の最近の記事タイトル]. As someone who
[相手の記事の主張に共感する一文], I thought you might find this angle
useful for [相手のbeat に関連する話題]:

When Captio — the much-loved iOS "email yourself" app — was discontinued
in October 2024, I (a Captio user since 2014) rebuilt it as SimpleMemo.
Three things became clear in the process:

1. [Insight 1 — 1文]
2. [Insight 2 — 1文]
3. [Insight 3 — 1文]

If any of this is useful for [相手の現在の取材], I'd be happy to share
benchmarks (0.3s launch, 150ms send), screenshots, or my reasoning.

— AI Ataka
SimpleMemo / simplememofast.com
```

---

## 4. 毎日3回の監視ルーチン

### 4-1. ルーチン時刻（Asia/Tokyo）

HARO は ET（米東部時間）配信なので、JST に換算すると：

| HARO ET | JST 翻訳 | 推奨行動 |
|---|---|---|
| 5:35 AM ET | 19:35 JST | 朝仕事の終わりにチェック |
| 12:35 PM ET | 02:35 JST（翌日） | 翌朝 8:00 JST までに対応 |
| 5:35 PM ET | 07:35 JST | 朝一でチェック・即回答 |

**実運用**: 朝（07:30 JST）/昼（13:00 JST）/夕（19:30 JST）の3回チェックで全配信をカバー。

### 4-2. 各監視の手順（5〜15分）

```
1. メール受信箱を haro@helpareporter.com / featured.com / qwoted.com で検索
2. 最新リクエストのみスキャン（タイトル + 質問文）
3. ターゲットキーワード一覧（§2）に該当するか判定
4. 該当する場合:
   a. リクエストの全文を読む（締切に注意、通常24時間以内）
   b. 3-1 / 3-2 / 3-3 の該当テンプレでドラフト
   c. データ・スクショを必要なら準備
   d. 送信
5. 該当しない場合: メールを読了マーク
6. 送信したピッチは docs/outreach-log.md に記録
```

### 4-3. 応答品質チェックリスト（送信前）

- [ ] **件名にトピック+資格を1行で**：「[Pitch: Captio Successor Developer] re: [topic]」
- [ ] **冒頭に質問への直接回答**（記者は1秒で読み飛ばす）
- [ ] **資格を1〜2文で証明**（10年iOS開発・元Captioユーザー）
- [ ] **数値データ最低2点**（0.3秒・150ms・AES-GCM 等）
- [ ] **プロモ臭ゼロ**（"the best" "perfect" 等の自賛形容詞NG）
- [ ] **記者がコピペで使えるスニペット形式**で書く
- [ ] **短さ**：HARO 200語、Featured 120語、Qwoted 150語まで
- [ ] **署名のリンク**：simplememofast.com / メール / X(Twitter) ハンドル のみ。LP の長いUTMリンクは記者が編集で削るので入れない

---

## 5. 運用ルール

### 5-1. やるべきこと

- 毎回 **24時間以内** に回答（HARO は古いと採用されない）
- ピッチは **個別カスタマイズ**（テンプレそのままはNG、最低3行は記事固有のフレーズ）
- 反応 0% でも継続（HARO は1〜2ヶ月の継続で平均値が出る）
- 採用された場合：
  - 公開URLを `docs/outreach-log.md` に記録
  - 公開24時間以内にAhrefsで被リンク反映確認
  - お礼メール送信（次回以降の優先度UP）

### 5-2. やってはいけないこと

- HARO配信外のメディアに無断で同じピッチをコピペ（spam扱い）
- 同じ記者に1ヶ月以内に2件目のピッチ
- "Best Captio alternative" のような自賛フレーズ
- 「公式後継」「Tupil承認」「Captioチームの後継」など事実と異なる主張
- 記者の質問テーマを無視して自社宣伝
- アンサブされたメディアへの再ピッチ

### 5-3. 月次レビュー（毎月1日）

```
1. docs/outreach-log.md から先月の送信件数 / 採用件数 / 採用率を集計
2. 採用された記事の Ahrefs 被リンク反映を確認
3. 採用率が低いキーワードを §2 から外す
4. 採用率が高いキーワードを §2 トップに昇格
5. 質問テーマ毎の採用率を見て、テンプレ §3 を改善
```

---

## 6. ターゲット記者リスト（個別ピッチ用）

定期的に Captio / iOS productivity / GTD / indie dev を扱うジャーナリスト。HARO/Featured 配信外でも個別ピッチが効く先：

| 記者 | 媒体 | beat | 連絡先 |
|---|---|---|---|
| Federico Viticci | MacStories | iOS productivity | tips@macstories.net |
| Casey Newton | Platformer | Tech / startups | hi@platformer.news |
| Ryan Christoffel | 9to5Mac | iOS apps | tips@9to5mac.com |
| John Voorhees | MacStories | App reviews | tips@macstories.net |
| Mike Schramm | TouchArcade | iOS apps | tips@toucharcade.com |
| (追加予定 — 採用された記者を蓄積) | | | |

`docs/cowork-broken-link-outreach.md` に記載の20件のターゲットも、HARO で同じ記者が出てきたら個別ピッチに切替。

---

## 7. ログテンプレート（docs/outreach-log.md）

各送信は以下の形式で記録：

```markdown
## YYYY-MM-DD [記者名 / 媒体]

- **Channel**: HARO / Featured / Qwoted / Direct
- **Topic**: [リクエストの要約]
- **Pitch sent**: YYYY-MM-DD HH:MM JST
- **Pitch text**: （200語以内、要約）
- **Sent from**: hajimeataka@gmail.com
- **Status**: pending / accepted / rejected / no-reply
- **Outcome**: （採用なら記事URL・公開日・被リンク反映日）
- **Notes**: （次回への学び）
```

毎月1日の月次レビューで集計。

---

## 8. 90日想定アウトプット（戦略レポート Day 22-30 〜 Day 90）

| 期間 | 送信件数 | 想定採用率 | 想定獲得リンク |
|---|---|---|---|
| Day 22-30（月の終盤9日） | 9件（毎日1件） | 8〜15% | 1件 |
| Day 31-60（30日） | 30件 | 8〜15% | 3〜4件 |
| Day 61-90（30日） | 30件 | 12〜20%（テンプレ改善後） | 4〜6件 |
| **3か月合計** | **〜70件** | — | **8〜11件** |

戦略レポートの「90日で180件アウトリーチ → 期待20〜40本」のうち、HARO/Featured/Qwoted 経由分はこの **8〜11本** が下限値。残りは broken-link outreach（`docs/cowork-broken-link-outreach.md` の18件）+ ゲスト投稿 + リンク再生で補う。

---

## 9. 関連ドキュメント

- `docs/cowork-broken-link-outreach.md` — Captio/LINE Keep 死リンクのアウトリーチ（18件）
- `docs/cowork-reddit-captio-research.md` — Reddit 上の Captio 言及調査
- `reddit-captio-only-research/PLAN.md` — Reddit 調査の技術プラン

3本のドキュメントで「メディア露出 + コミュニティ言及 + 記者ネットワーク」の3面攻めをカバーする。
