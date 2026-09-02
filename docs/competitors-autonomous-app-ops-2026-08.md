# 海外「ど競合」の再検証 — 2026-08-25

<!-- fact-check: internal -->

> **なぜ作るか。** `pr-autopilot-2026-09-evidence.md` §13-1 が海外4件の表を持っているが、
> そこには **「この表の各社の数値・実績は、すべて外部レビュー文書からの伝聞で
> 一次ソースを当てていない」** と自分で書いてある。同 §はさらに
> **「一次ソースを当てるまで、他社の数値は原稿にも記者用Q&Aにも書かない」** と縛っている。
> この文書はその縛りを外すための作業記録であって、**外し切れていない部分も含めて残す。**

---

## 0. この調査の証拠等級（先に書く）

**直接取得（WebFetch）はこの実行環境の egress ポリシーで遮断された。**
`posthog.com` / `www.appdna.ai` いずれも `EGRESS_BLOCKED`。したがって以下は
**検索エンジン経由で得た各社ページの要約**であり、**各社サイトのHTMLを自分で開いた
一次取得ではない。**

| 等級 | 意味 | この調査での扱い |
|---|---|---|
| A | 自分でHTMLを取得して読んだ | **0件**（環境的に不可） |
| B | 検索経由で当該ページの記述として得た | 本文の大半。**出典URLを併記する** |
| C | 第三者記事・伝聞 | 明示する |
| D | 一次ソースが見つからない | **ByVeya がこれ**（§4） |

**したがって、他社の数値をプレスリリース本文に書くことは、依然として推奨しない。**
書いてよいのは **範囲（何を自律化していると各社が言っているか）** と、
**各社が自ら明言している制約**（PostHog の「人がマージする」など）である。
後者は各社にとって不利な記述なので、伝聞でも比較的安全に扱える。

---

## 1. 何が変わったか — ブリーフ（8月時点の外部レビュー）との差分

**4社のうち2社について、外部レビューの記述は今日の実態とずれている。**

| 事例 | 外部レビューの記述 | 2026-08-25 の再検証 | 差分の大きさ |
|---|---|---|---|
| PostHog | 「2026年5月公開の構想」「まだBeta」「これから実現すると語っている」 | **製品として出荷済み。**`/self-driving` に製品ページ、`/docs/self-driving` にドキュメント、open beta（docs は 2026-07-06 付）。**scout 由来のPRを直近30日で178本マージ**（7月中旬時点） | **大**。「構想」ではない |
| AppDNA | 「Dating app +45% / 実験 2→20 / Horoscope 3倍」等をプラットフォーム実績として記載 | プラットフォーム側（`appdna.ai`）の公表値は **「+38% paid conversions / CAC −22% / D7 +11% / 推奨の73%が7日以内に実装」** で、しかも **"Early users report"**（初期利用者の申告）という限定つき。**数字が違う** | 中 |
| OWA AI | 「Autonomy Tier 3段」「Know Your Dosh D7 +27% / CPI −18%」 | 位置づけは **"co-pilot"**（`app.owa.ai`）。Tier の3段分離そのものは今回の検索では確認できず | 中 |
| ByVeya | 「79 AI agents / 13 departments」等 | **検索で一次ソースが出てこない**（§4） | **大** |

> **この差分自体が、原稿にとって重要。**
> 外部レビューをそのまま引き写して「PostHogはまだ構想段階」と書くと、
> **記者が5分で崩せる誤りになる。**PostHog は既に出荷していて、
> 公開している throughput はこちらより大きい。

---

## 2. PostHog — 技術思想でも実装でも、いま最も近い

### 2.1 何を作ったか

- **scouts** … 背景で動くエージェント。プロダクトデータを継続的に見て、
  問題を **PostHog Inbox** にレポートとして立てる。レポートはクラスタされ優先度がつく
- 各レポートには **サンドボックスで生成された draft PR** がつく。
  「サンドボックスで計画し、ファイルを編集し、draft PR を開き、スレッドで操縦できる」
- **self-improving loop**：
  `Collect data → cluster signals → check memory → notify workers → do work → review and ship → evaluate → write back to memory`
- 自律性の5要素： **tools / skills / signals / memory / evaluation**
- signals の入力源：エラーパターン、セッションリプレイ中のフラストレーション、
  実験結果、アンケート回答、insight の閾値、サポートチケット、Slack スレッド
- 導入は `npx @posthog/wizard@latest self-driving`。操作面は Web / Slack / MCP

### 2.2 **evaluation が本題**（ここがこの原稿の「再帰性」の定義に最も近い）

> PostHog は eval を**長時間ジョブ**としてスケジュールし、**PRマージの数時間〜数日後**に
> 走らせる。**signal を発火させたのと同じダッシュボード/evalを引き直し**、
> 指標が動かなかった／悪い方向に動いたなら、エージェントが **revert するか work を reopen する。**

**「変更して終わりにしない」を製品仕様として持っている会社は、いま調べた範囲でここだけ。**

### 2.3 **ただし、絶対に見落としてはいけない制約**

各社の自己申告のうち、**自分に不利な記述**なので信頼度が高い部類：

> **"Nothing merges itself, and nothing ships on autopilot."**
> 「すべての変更は人がレビューするPRであり、**人が merge を押すまで本番には届かない**」
> エージェントは「ブランチで作業してPRを開き、branch protection・CI・レビュー規則に従うが、
> **merge はできない**」
> 「self-driving は自分の車線から出ない —— 保守・修正・最適化であって、
> アーキテクチャの投機的な書き換えはしない」

課金は **PRごと**。基準に達しないPRは返金する、としている。

### 2.4 SimpleMemo との実際の差

| 軸 | PostHog | SimpleMemo |
|---|---|---|
| signal → 課題 → コード | **あり**（scouts / inbox / draft PR） | あり |
| マージ後の効果測定と revert/reopen | **あり**（数時間〜数日後の eval） | 一部（コンテンツ側。§6） |
| **本番への出荷** | **人が merge を押す。自動では出ない** | **検証済みSHAのみ自動マージ→本番デプロイ** |
| App Store 側の工程 | **無い**（自社SaaSのコード） | 審査提出・段階公開まで扱う |
| 集客・ASO・PR | **無い** | あり |
| 経理・契約・予算 | **無い** | 一部あり |
| 直近30日のPR実績 | **178本（scout由来・マージ済み）** | §6 参照。**こちらの方が小さい** |

**結論：**「PostHogより進んでいる」とは書けない。**書けるのは2つだけ。**
1. **出荷の自律度**（人の merge を要さない）は、こちらが深い
2. **範囲**（プロダクト＋審査＋集客＋経営）は、こちらが広い

そして **throughput は向こうが上**であることを、こちらから先に書く。

---

## 3. AppDNA — 「2つの AppDNA」を混同しない

**最重要の発見。**`appdna.ai`（AIプラットフォーム）と `appdna.agency`（人間のエージェンシー）は
**別のサイト**であり、**大きい数字は後者にある。**

- `appdna.agency/case-studies` … Aion Bank の **conversion +251%**、organic downloads **+71%** など
- `appdna.ai` … プラットフォーム。**"Early users report"** として
  **paid conversions +38% / CAC −22% / D7 retention +11% / 推奨の73%が7日以内に実装**

外部レビューが「AppDNA自身が『これらはAIプラットフォームが出した数字ではない』と
明示している。ここは非常に誠実」と評価した点は、**サイトが分かれているという構造として
確認できた。**（等級B）

### 3.1 ループ

`PROPOSE → APPROVE → SHIP → LEARN`

- **PROPOSE** … 実績プレイブックとアプリのデータから、オンボーディング・ペイウォール・
  リテンション・ASO の具体的な変更案を出す
- **APPROVE** … **すべての提案が1つの承認Inboxを通る**（メールのような形）。
  受理・編集・スケジュール・却下ができる
- **SHIP** … 承認された変更を **軽量SDKとFeature Flag経由で自動配信**
- **LEARN** … 時間とともに **growth memory** になる。何が・どこで・なぜ効いたかを保持

すべての変更に **traffic cap・段階ロールアウト・即時ロールバック・完全な監査ログ**がつく。

### 3.2 **ここが決定的** — AppDNA は App Store のバイナリに触れない

SHIP の説明にこうある：

> 「スプリントや **ストア申請を待たずに** 実験・ロールアウト・最適化を回す」

つまり **Feature Flag で切り替えられる範囲だけ**が対象。
**審査・バージョン公開・段階公開は AppDNA の外側にある。**

これは Apple の **App Review Guideline 2.5.2**（アプリが外部からコードを落として
機能を変えることの禁止）と整合的な作りでもある。
→ 原稿の **Two-lane Shipping**（`pr-autopilot-2026-09.md`）が扱っている
Lane B（Native App Update）を、**AppDNA は構造的に持っていない。**

---

## 4. ByVeya — **一次ソースが見つからない**

`"ByVeya"` `"Veya" autonomous app manager` いずれの検索でも、
**当該サービスのページが結果に出てこない。**

外部レビューが引いていた「79 AI agents / 13 departments」「90%のbusywork」
「20時間削減」も確認できない。同レビュー自身が
「サイトには『Real-World Scenarios』と書きながら本文が "Imagine this:" で始まる例もあり、
第三者検証できる導入実績はまだ弱い」と書いていた。

**扱い：等級D。競合表から落とすか、「一次ソース未確認」と明記して残す。**
**プレスリリースおよび記者用Q&Aでは言及しない。**
（言及すると、記者が調べて出てこなかったときに**こちらの調査全体の信頼が落ちる。**
1件の弱い引用のために、強い3件を巻き添えにする価値は無い）

---

## 5. ブリーフに無かった競合 — **4社では足りない**

今回の検索で、外部レビューの4社リストに**入っていなかった**近接プレイヤーが出た。

| 事例 | 範囲 | この原稿から見た位置 |
|---|---|---|
| **AppTweak AI Agents** | ASO と Apple Ads を回す3つのAIエージェント。**2026年3月発表**（PR Newswire） | **ASO の既存最大手が参入済み。**「AIがASOを回す」は既に新規性が無い |
| **AppsFlyer AI Agents Hub** | 自律的なマーケティングインサイト | 計測基盤側からの参入 |
| **Mobvy** | 「アイデアを説明すると **8つのAIエージェント**がコーディング・デザイン・QA・ストア掲載・デプロイを担当し、App Store と Play Store まで自動で出す」 | **新規開発の自動化。**「既に公開中のアプリを運営し続ける」ループではない |

### 5.1 これが原稿に効く

**「AIがASO・広告を自律運用する」だけでは、もう差別化にならない。**
AppTweak（ASOの最大手）と AppsFlyer（計測の最大手）が既に出している。

したがって ③自律型マーケティングを主張の中心に置くのは弱い。
**中心に置くべきは、③単独ではなく「①〜⑨が1つの目的関数・予算・権限・記憶で
つながっていること」**（`pr-claims.json` の `end_to_end` が既にそう定義している）。

---

## 6. 4社を横断して見えた、SimpleMemo が唯一名乗れる線

各社が **自ら明言している制約**だけを並べる（自社に不利な記述なので信頼度が高い）。

```
                    signal→   コード    マージ    App Store   集客   経理
                    課題化    変更      自動化    審査工程    ASO    契約
  PostHog            ◎        ◎        ✗ 人が押す  ✗          ✗      ✗
  AppDNA             ◎        △ Flag   △ 承認Inbox ✗ 申請待たず ◎     ✗
  OWA / AppTweak     △        ✗        ✗          △ metadata  ◎      ✗
  ByVeya             ?        ?        ?          ?          ?      ?   ← 一次ソース無し
  ────────────────────────────────────────────────────────────────────
  SimpleMemo         ◎        ◎        ◎ 検証済SHA ◎ 提出まで  ◎      △
```

**「Observe → Decide → Build → Verify → Ship → Measure → Learn」を
1本につないだ主体は、調べた範囲では見つからなかった。**
ただしこの主張の強さは **範囲**から来ており、**深さや量ではない。**

### 6.1 だから原稿ではこう書く（推奨）

- ✅ 「**人の merge を待たずに本番へ出る**ところまで閉じている」
      —— PostHog が自分で「できない」と書いている線を、こちらは越えている
- ✅ 「**App Store の正規リリース工程そのもの**を自律運用する」
      —— AppDNA が「申請を待たない」と書いて回避している工程
- ✅ 「プロダクト＋QA＋審査＋集客＋経営を **1つの予算・権限・記憶**で結んだ」
- ❌ 「世界初」「世界最先端」「他社より進んでいる」
      —— **PostHog の 178 PR/30日 に throughput で負ける。**言った瞬間に崩れる
- ❌ 他社の数値を引用すること（等級A が0件のため）
- ❌ ByVeya への言及

---

## 7. この4社（＋3社）から取り込むべき設計

**競合分析の価値は「勝った」と言うことではなく、実装の穴が見えること。**
以下は本リポジトリに**まだ無い**か、**弱い**もの。

| # | 取り込む対象 | 出どころ | 現状 |
|---|---|---|---|
| 1 | **マージ後の効果測定と自動 revert / reopen** | PostHog evaluation | **機能側は未実装。**コンテンツ側のみ |
| 2 | **stop-loss（悪化したら自動で止める）** | AppDNA traffic cap + instant rollback | `rollout-guard` の `kill` はある。**施策KPIに紐づく stop-loss は無い** |
| 3 | **1つの承認Inbox** | AppDNA APPROVE | `autopilot-actions.json` が近い。**「編集して承認」は無い** |
| 4 | **Autonomy Tier の明示** | OWA（伝聞・等級C） | `authority-matrix.json` が実質同じ。**外向けに3段で説明していない** |
| 5 | **signal のクラスタリングと優先度** | PostHog Inbox | `signal-ledger.json` に dedupe_key はある。**優先度の自動採点は弱い** |

---

## 8. 継続監視

各社とも動きが速い（PostHog は3か月で構想→出荷）。**配信直前に再確認する。**

- 再確認日：**2026-09-26**（配信 9/28 の2営業日前）
- 見る場所：PostHog `/self-driving` と `/docs/self-driving/faq`（「人がマージ」の記述が
  変わっていないか）、`appdna.ai` トップ（実績値の更新）、AppTweak / AppsFlyer のリリース
- **「人がマージする」が消えたら、§6.1 の1つ目は使えなくなる。**

---

## 出典

- PostHog — https://posthog.com/self-driving ／ https://posthog.com/docs/self-driving ／
  https://posthog.com/docs/self-driving/self-improving-loop ／
  https://posthog.com/docs/self-driving/faq ／ https://posthog.com/blog/self-driving-product ／
  https://github.com/posthog/posthog
- PostHog（第三者・等級C） — https://www.createwith.com/tool/posthog/updates/posthog-launches-self-driving-mode-with-ai-scouts-that-draft-pull-requests
- AppDNA プラットフォーム — https://www.appdna.ai/ ／ https://www.appdna.ai/generative-ai-app-growth
- AppDNA エージェンシー（**別サイト**） — https://www.appdna.agency/ ／ https://www.appdna.agency/case-studies
- OWA AI — https://app.owa.ai/
- AppTweak（等級C） — https://www.prnewswire.com/news-releases/apptweak-launches-ai-agents-to-scale-aso-and-apple-ads-performance-302704511.html
- AppsFlyer — https://www.appsflyer.com/products/agentic-ai/ai-agents-hub/
- Mobvy — https://mobvy.app/

---

## 2026-09-02 追記 — 配信前日に14件を引き直した（結果は別文書）

`pr-autopilot-2026-09-positioning-review.md` §1 に、2026年の先行例14件
（OpenAI harness engineering / LogRocket / Warp / Fluent / Amplitude / Autensa / APDL /
IBM Bob / Devin（日本） / Codens / Bakusoku.AI / Shopify Campaign Autopilot / GrowthLoop /
サイバーエージェント）を一次ソースのURLつきで当て直した。**等級は本文書と同じB**
（egress で一次ドメインの直接取得は不可。ドメイン限定検索のスニペットと GitHub の README）。

持ち込まれた整理のうち**5件が一次ソースと食い違う**：Warp「週300PR超」（公表は「PRの20〜30%を自動化」）、
GrowthLoop「15%」（出典なし。81%のみ確認）、Fluent／Autensa／APDL（企業ではなく個人・小規模OSS）。
**ストア配布アプリを閉ループでAIが日常運営しリリース実績を公開している先行例は見つからなかった**が、
InterWorks（2026-06-26）と Devin Auto-Triage が「検知→修正→PR→リリース」に近い。
**「世界初」「唯一」は引き続き書かない。**
