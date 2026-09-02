# 「自律型アプリ運営」PR — 訴求軸『software factory ではなく running app』の徹底検討

<!-- fact-check: internal -->

> **対象:** 2026-09-03（木）朝配信の「自律型アプリ運営基盤」プレスリリース
> （原稿 `pr-autopilot-2026-09-body.md`・受け皿 `/autopilot/`）。
> **持ち込まれた整理:** 「2026年の世界を俯瞰すると、AI実装→テスト→レビュー→修正はコモディティ化した。
> 差が出るのは『何を改善するか』の自動化と、**ツールを売る側ではなく App Store で配布中の1本のアプリを
> AIが日々“運営”している**こと。ニュース価値の序列で言えば下2段（★5）を主張できるかどうか」。
> **作成: 2026-09-02 夜（配信前日）。** 3リポジトリを full clone にして台帳・検査スクリプトを実走し、
> 外部事例14件はドメイン限定検索と GitHub README で一次ソースを当て直した（等級B。§1）。
>
> **この文書で原稿に入れた変更は3点だけ**（§4）。見出し・サブタイトル（オーナー承認済み）は触っていない。

---

## 0. 結論（先に）

1. **提案された軸2つは正しく、しかも確定タイトルは既にその形をしている。**
   「アプリが、自ら育ち続ける。」＋「**運営業務**のAI実行率76.4%を公開」は、主語がアプリ（= running app）で、
   動詞が運営（≠開発）。**配信前日にタイトルを動かす理由は無い。**
2. **★5の2段のうち、主張できるのは下の段（分母込み自動化率＋SEO・PR・運営まで同じ系統）で、これは原稿の芯そのもの。**
   上の段（実アプリで数週間連続稼働・本番リリース実績）は**限定形でしか成立しない**：
   「連続」ではない（無運転2日）、AIが毎日本番へ出している19件は**公式サイト・運営基盤側**であって
   アプリ本体ではない、アプリ本体は同期間に **7版が App Store へ出ているが実機確認・審査提出・公開は人**（§3）。
3. **検討の途中で、原稿の事実誤りを1件見つけた。** 「同期間のコミットの99.5%、変更行の94.2%」は
   **8月11日〜21日の計測値**で、原稿が言う23日間の値ではない。同じ数え方で9月1日まで測ると
   **コミット81.9%・変更行70.9%**。「2月からほぼ横ばい」も台帳の月次（変更行66〜100%）と合わない。
   **配信前に直した**（§4-1）。あわせて「本番」「出荷19件」がサイト側であることをリード文と表に明記した（§4-2）。
4. **持ち込まれた外部事例14件のうち、5件が一次ソースと食い違う**（§1）。とくに **Warp「週300PR超」は根拠が無い**
   （公表は「PRの20〜30%を自動化」）。原稿に他社名を書かない方針は正しく、維持する。
   位置づけは社名なしで一文で書ける（§7）。
5. **主張できないもの**（変わらず）：「AIが次に作る**アプリ機能**を選んで本番投入」（提案どまり・カナリア昇格0件）、
   「連続稼働」、「世界初／唯一」、「AIが売上を伸ばした」。
6. **次の開発項目は「Lane B（アプリ本体）の台帳を作ること」**が最優先（§6）。★5上段を限定なしで言えるようにする
   唯一の道で、しかも既存の `release-materials.json` / `device-verification.json` がほぼ材料になっている。

---

## 1. 外部事例のファクトチェック（14件・等級B）

> 直接取得は egress で遮断されたため、**ドメイン限定検索のスニペットと GitHub の README** で確認した。
> 引用句は記載URLで最終確認すること。**原稿には引き続き他社の数値・社名を書かない**（既存方針）。

| # | 持ち込まれた主張 | 判定 | 一次ソースが実際に言っていること | 差 |
|---|---|---|---|---|
| 1 | OpenAI 2026-02「手書き0行・約100万行」「Humans steer. Agents execute.」 | ✅ 一致 | openai.com/index/harness-engineering（2026-02-11）："0 lines of manually-written code" / "on the order of a million lines" / "Humans steer. Agents execute." 3人・約1,500 PR・5か月 | なし。6月講演では「9か月」に更新 |
| 2 | LogRocket 2026-06「self-improving software」＋ボトルネック移動 | ✅ 一致 | blog.logrocket.com/introducing-self-improving-software（2026-06-23）："dispatches those issues to Cursor, Claude Code, Codex" / "**Coding is no longer the bottleneck; figuring out what to build is the limiting factor**" | 引用は原文の語で |
| 3 | Warp 2026-08「software factory」「**週300PR超**」「self-improving」 | ⚠️ **300は根拠なし** | warp.dev（2026-08-18 "Warp Factories"）：自社は "**automates 20–30% of its PRs**"。CEO: "30 to 35% on a weekly basis"。self-improving は "self-improving **cloud** software factories"（2026-08-27） | **「週300PR」はどこにも無い**（Stripe の 1,300/週 か "300 line PR" との混同が疑われる） |
| 4 | Fluent「self-improving software factory」 | ✅ 文言一致／⚠️ 主体 | github.com/mrinalwadhwa/fluent（**個人OSS**・2026-07-10 作成・84 stars）。Writer→Tester→Reviewers（5並列）→Learner。"waits for your decision" | 企業ではない。Reviewer は5役 |
| 5 | Amplitude 2026-02 AIエージェント | ✅ 一致 | 2026-02-17 プレス："continuously analyze product usage, identify what's working and what isn't, and recommend actions" | 「monitor」はCEO発言側 |
| 6 | Autensa「Autonomous Product Engine」Full Auto | ✅ 文言一致／⚠️ 主体 | github.com/crshdn/mission-control（**個人OSS**・2,138 stars）："Research → Ideation → Swipe → Build → Test → Review → Pull Request" / "Full Auto … Idea → deployed feature"（**"recommended for side projects and MVPs rather than production"**） | 企業ではない。「learning」段は無い |
| 7 | APDL「Data → Decisions → Shipped features」 | ⚠️ 一部 | github.com/kuvera-apdl/apdl（**2 stars**）。README は "**The Loop is the product direction, not a claim of closed automation**" と自ら断る | 持ち込まれた文言は未確認。規模は控えめに |
| 8 | IBM Bob「discovery→…→operations」 | ✅ 一致 | newsroom.ibm.com 2026-04-28："from discovery and planning through design, coding, testing, deployment, and operations" | 「AI-first SDLC」は複合語としてはIBMの表現ではない |
| 9 | Devin（日本）5工程を自律実行 | ⚠️ 一部 | 列挙は **CTC のプレス（2026-04-22）** の文言。Cognition 自身は「計画から実装、テストまで」 | 出典を CTC に |
| 10 | Codens「開発と運用保守を全自動化」 | ❌ 文言未検出 | help.codens.ai：要件定義〜本番エラー自動修復まで「SDLC全体を自動化」 | 当該フレーズは無い |
| 11 | Bakusoku.AI「開発、運用、改善、保守」 | ⚠️ 趣旨一致 | アステリア 2026-06-23：「**開発し、運用・改善・保守を自律的に支援**」（8/1 提供開始） | 4語並列ではない |
| 12 | Shopify 2026-06 Campaign Autopilot | ✅ 一致 | shopify.com/blog/introducing-campaign-autopilot："You set the budget, add your guardrails, and **can** approve what runs" | early access。承認は任意 |
| 13 | GrowthLoop 閉ループ／**15%**／81% | ✅✅／❌ | 2026-04-15 "closes the loop between measurement, learning, and action"。2026-05-13 調査（n=318）："**81%** … more effective with human intervention"。**15% と "meaningful autonomy" は見つからない**（100−37−48 の導出は可能だが出典にならない） | 15%は使わない |
| 14 | サイバーエージェント 2026-04 | ✅ 一致 | 2026-04-07 発表「24時間365日、入札・配信設定を**自動**最適化」、提供 4/20、Meta のみ | 「自律」ではなく「自動」 |

**先行例の探索（「ストア配布アプリを閉ループでAIが日常運営し、リリース実績を公開」）：** 3条件を同時に満たす例は
**見つからなかった**。近いのは InterWorks（2026-06-26・6体のエージェントが triage production errors / shepherd releases）、
Devin Auto-Triage、Coframe（Web最適化）、UPSIDER（社内）、Show HN「AI agents run my one-person company」（Web事業）。
**「見つからなかった」は「無い」の証明ではない**ので、「世界初」「唯一」は引き続き書かない。
書けるのは「公開実績として確認できる範囲では、同じ3条件を満たす例は見当たらない」まで。

**持ち込まれた整理の骨（実装〜修正はコモディティ、差は『何を改善するか』と『運営』）は、一次ソースに当てても崩れない。**
崩れたのは数字と主体だけ。

---

## 2. ニュース価値の段階表を、台帳に当てる

| 持ち込まれた段 | 星 | 台帳の事実 | 判定 |
|---|---|---|---|
| AIでiOSアプリを開発 | ★ | 3リポジトリのAI著者率（§4-1） | 書けるが訴求にしない |
| 人間がコードを書かずAIが開発 | ★★ | 8/11〜21 コミット99.5%。23日間では81.9%（定義上判定できないコミットが増えた） | **窓つきでのみ** |
| AIがテスト・レビュー・修正まで実行 | ★★ | ②バグ修正 84.2%・CI検査81本の自己検査済み | 書ける |
| AIがユーザーデータから問題を発見 | ★★★ | GSC・ASC・ファネル・cron の読み取りは実行側。`daily_actions` は 08-26 から soak（DRY RUN・実行0件） | 書ける（「発見」まで） |
| AIが「次に何を作るか」を選択 | ★★★★ | **サイト側は毎朝1件を選んで出荷（19件）。アプリ機能は `ai_proposes`（提案どまり）** | **サイト側のみ**。原稿は「機能開発は分析と提案まで」と書いており正しい |
| 選択→実装→検証→測定を閉ループ化 | ★★★★ | サイト側：選定→実装→81検査→自動マージ→台帳→翌日の起案が読む。アプリ側：rollout-guard は kill を本番で1回実証（08-22）、**昇格0件・判定は hold**（tf04_progress・母数不足） | **サイト側は閉じている。アプリ側は閉じていない** |
| 公開中の実アプリで数週間連続稼働し、本番リリース実績を公開 | ★★★★★ | 23日間・41実行・無運転2日（**連続ではない**）。本番19件は**サイト側**。アプリ本体は同期間に7版（5.7.6→5.8.4）が READY_FOR_DISTRIBUTION、**実機確認（owner statement）・提出・公開は人** | **限定形でのみ**（§7） |
| SEO・PR・マーケ・運営まで同じAI系統で回し、分母込み自動化率を公開 | ★★★★★ | 13領域203タスク・総合66.8%（未実装25件を分母に含む）・4つの率を併記・下がった月も公開・到達可能上限82.9% | **成立。原稿の芯** |

**持ち込まれた整理が最も押す「running app」は、対象を正確に言うと「running app の“運営面”」である。**
AIが毎日本番に出しているのは、アプリの**集客・監視・サポート・経営**の側（Lane A）で、アプリ本体（Lane B）は
人の3つの門を通る。**これは弱点ではなく、持ち込まれた整理自身が言う「開発ではなく運営」の実体そのもの**なので、
運営に寄せ切るのが正しい。「アプリについて…本番投入…を回している」と縮めると Lane B を Lane A のように読ませる
（§5-1 が既に禁じている読ませ方）。

---

## 3. 「running app」の実態 — 何が毎日本番へ出ているか

### 3-1. 出荷19件の中身（`data/autopilot-runs.json`・41行）

| 種別 | 件数 | 例 |
|---|---:|---|
| サイトのページ新設・更新（レーンB/C/E） | 14 | `/obsidian/compare/logseq/` `/obsidian/plugins/` `/obsidian/pricing/` `/obsidian/sync/icloud/` … |
| 運営基盤の自己修復（レーンF・ccr-fallback） | 5 | ワークフロー・台帳・手順書の修理 |
| **アプリ本体（iOS）の変更** | **0** | — |

### 3-2. アプリ本体（Lane B）は同期間にどう動いたか

| 版 | v* タグ日 | App Store 状態（`release-materials.json` 09-02） |
|---|---|---|
| 5.7.6 / 5.7.7 | 08-11 | 5.7.6 READY_FOR_DISTRIBUTION |
| 5.7.8 | 08-12 | READY_FOR_DISTRIBUTION |
| 5.7.9 / 5.7.10 / 5.7.11 | 08-14〜15 | 5.7.11 READY_FOR_DISTRIBUTION |
| 5.8.0 | 08-19 | READY_FOR_DISTRIBUTION |
| 5.8.1 | 08-22 | READY_FOR_DISTRIBUTION |
| 5.8.2 | 08-28 | READY_FOR_DISTRIBUTION |
| 5.8.3 / 5.8.4 | 08-29 | 5.8.4 READY_FOR_DISTRIBUTION（live_version）。5.8.3 は実機報告で2回落ち**出荷していない** |
| 5.8.5 / 5.8.6 | 09-02 | TestFlight 段階 |

**23日間で7版が App Store に並んだ。**ただし各版は `device-verification.json`（`recorded_from: "owner statement"`＝
人が実機で確認したという記録）→ ChatOps/タグでの提出（人）→ 公開（`automatic_release=false`・人）を通っている。
**App Store 側の公開日は台帳に無い**（タグ日しか無い）。ここが §6 の最優先項目。

### 3-3. アプリ側の閉ループの現在地

- Feature Flag（`flags.ts` / `FeatureFlagRollout.swift`）とカナリアガード（`rollout-guard.ts`）は実装済み
- **kill は本番で1回通した（2026-08-22）**。**promote（昇格）は0件**。段階公開中のフラグは `tf04_progress` の1つで、
  ガードは毎時判定を出しているが各群30に届かず **hold**（08-27 run 33076125334）
- `daily_actions`（API 側の日次アクチュエータ）は 08-26 から soak。**DRY RUN で凍結・隔離の実行は0件**
- 対照群による増分効果の評価は `nobody`（`statistical_power`）。App Store クリック 2.1件/日では割れない

**したがって「AIがアプリを運営する」は成立し、「AIがアプリを改善する（機能を選んで出して測る）」はまだ成立しない。**
原稿の「機能開発は分析と提案まで」「自動選定→段階公開→効果測定→継続／撤回まで通した実績はまだ無い」は正確。

---

## 4. 発見した不整合と、原稿に入れた変更（3点）

### 4-1. 【事実誤り・修正済み】コード著者率の窓

原稿は「**同期間**のコミットの99.5%、変更行の94.2%がAI著者…**2026年2月からほぼ横ばい**」と書いていた。

| 窓 | コミット | 変更行 | 出どころ |
|---|---:|---:|---|
| 2026-08-11〜08-21（台帳 `data/code-authorship.json`・08-22 計測） | 99.5% | 94.2% | 原稿が使っていた値 |
| 同窓・**full clone で 09-02 に再計測** | 99.5% | 94.8% | 再現した（絶対数は 194→215 コミットに動く。台帳の known_limits どおり） |
| **2026-08-11〜09-01（原稿の言う「同期間」）** | **81.9%** | **70.9%** | `node scripts/code-authorship.mjs --from 2026-08-11 --to 2026-09-01` |
| 　うち simplememo | 96.0% | 96.0% | |
| 　うち simplememo-api | 73.7% | 54.7% | |
| 　うち simplememo-ios | 59.3% | 42.4% | |
| 月次（`data/autonomy-timeline.json`）2月→8月 | 90/100/100/88/100/94/**87** | 99/100/100/90/100/**66**/**83** | 「横ばい」ではない |

**なぜ下がるか（観測できた範囲）：** 数え方は「author に Claude を含む、または本文に `Co-Authored-By: Claude`」だけ。
8月22日〜9月1日の iOS の所有者名義コミット75件のうち **37件はどちらのマーカーも持たない**
（例：`#284`〜`#294` のスカッシュマージ、9/1 の DSA・EU配信まわり）。手元の環境から所有者の署名で
コミットした変更がこの数え方では人側に落ちる。**AIが書いたかどうかは、この方法では判定できない**——
だから台帳は人側に数えており、原稿もそれに従うのが筋。

**入れた変更：** 窓を「2026年8月11日〜21日の計測で」と明記し、「2月からほぼ横ばい」を月次コミット率の範囲「87〜100%」に
差し替え、9月1日までの再計測（81.9%／70.9%）と理由を1段落で併記した。
`/autopilot/` §3 は元から窓を明記している（本文だけがずれていた）。

> **配信前に原稿から落とすなら**、併記の段落だけを消して窓の明記は残す。窓を書かずに 99.5% を残す選択肢は無い。

### 4-2. 【誤読の穴・修正済み】「本番」「出荷19件」の対象

§5-1 は「本文はまだこの2経路（Lane A / Lane B）を明示していない」と自分で書いていた。受け皿ページ `/autopilot/`
§1・§2 は明示済み。**リード文の「本番へ出ます」に「（公式サイト側。アプリ本体は実機確認・審査提出を人が持つ別経路）」、
実測表の「出荷」に「いずれも公式サイト・運営基盤側で、アプリ本体の更新は含まない」を足した。**
持ち込まれた「running app」の訴求を強めるほど、この注記の重要度は上がる。

### 4-3. 【変更なし・再確認】「連続稼働」「世界初」

「16日間連続で稼働」は 08-27 に取り下げ済み。持ち込まれた整理の「数週間連続稼働」は**再導入しない**
（無運転2日が台帳にある）。「世界初」は §1 の探索結果でも書けない。

### 4-4. 検査結果

`check-pr-facts --check`・`check-autopilot-page --check`・`check-pr-claims`・`check-public-facts --check` を変更後に通した（§8）。

---

## 5. VISION §0「AIを前面に出さない」との関係

衝突は既に明示され、処理されている：`experiments.json` の `pr-2026-rsi-autopilot` が G2 を「AI語の禁止」ではなく
「S2 を満たす固有名詞を必ず入れる」と読み替え、**今回限りの例外**として記録している。
この PR が語るのは**製品の価値**ではなく**会社の運営**なので、§0 の「ユーザーに見せる価値は『AIが賢い』ではない」とは
対象が違う。守るべき線は **/autopilot/ と配信原稿の外へ AI 前面の文言を広げないこと**（製品ページ・App Store 文言は不変）。
`/autopilot/` への導線はフッター1本（`devlog/index.html` 経由）で、現状その線は守られている。

---

## 6. 開発項目（優先順）

### A. 配信前（今夜〜9/3 朝）

| # | やること | 誰 | 状態 |
|---|---|---|---|
| A1 | §4-1・§4-2 の本文変更を読む。**併記段落（81.9%／70.9%）を残すか落とすか**を決める | オーナー | ⬜ |
| A2 | ヒーロー画像の再生成（`node scripts/generate-pr-hero.mjs`・1.91:1・件数3つ）→ G1〜G4 判定 → PR TIMES 予約（10〜11時） | オーナー | ⬜（`-plan.md` §0-1） |
| A3 | 配信後に `experiments.json` を `running`・評価日 9/17・`annotations.json` へ追加 | AI | ⬜ |

### B. 配信後 2〜4週（★5上段を限定なしで言えるようにする）

| # | 開発項目 | 何が言えるようになるか | 材料 |
|---|---|---|---|
| **B1** | **Lane B（アプリ本体）の運転台帳** —— 1版1行：`version / tag_at / build / device_verified_sha / submitted_at / review_state / released_at / ai_authorship(diff)`。`autopilot-runs.mjs` と同じ形で率を出し、本文・ページの「アプリ側」の数字はここからしか引けないよう CI（`check-autopilot-page`）に載せる | 「同期間に App Store へ出た版は N、各版の実機確認・提出・公開は人、コードのAI著者率は X%」を**台帳つきで**書ける。★5上段の「本番リリース実績を公開」がこれ | `release-materials.json`・`device-verification.json`・`appstore-review-status.yml` が既に材料。App Store 公開日は ASC API `appStoreVersions.createdDate`／`releaseDate` を日次で取り込む |
| **B2** | **コード著者率の数え方の改訂** —— (a) マーカーを `Generated with [Claude Code]`・`claude.ai/code/session` にも広げる（現行はトレーラーのみ）、(b) 手元セッションの commit に trailer を必須化（`commit-msg` hook）、(c) `check-pr-facts` に「率に窓が付いていない」規則を足す（「同期間」「同じ期間」＋率 を落とす） | 99.5%→81.9% の落差のうち**定義由来の分**を切り分けられる。窓の無い率が二度と原稿に入らない | `scripts/code-authorship.mjs`・`scripts/check-pr-facts.mjs` |
| **B3** | **Phase 1d：本番で promote／kill を1周通す** —— `tf04_progress` の母数（各群30）に届く見込み日を出し、届いたら昇格を1回承認して 継続／撤回 の判定を1回本番で見る | 「アプリ側の閉ループを1回完走した」と言える。★4「選択→実装→検証→測定」がアプリ側にも掛かる | `rollout-guard.ts`・`rollout-promote.yml`・`docs/autopilot-roadmap.md` Phase 1 |
| **B4** | **「連続稼働」の定義とSLO** —— `no_run` 日ゼロの連続日数を台帳から出し（現在の最長連続を表示）、検知1h以内を数値目標として置く | 次回は「N日連続」を**台帳の定義つきで**書ける | `autopilot-runs.mjs` |
| **B5** | **効果測定の接続** —— `feature-outcomes.json`（出す前に測り方を決める）を rollout-guard の判定入力に繋ぎ、母数条件を満たさない間は `undecidable` を出す | 「AIが機能を出して測った」を、母数が足りたときに初めて言える | `data/feature-outcomes.json`・`rollout-guard-measure.ts` |
| **B6** | **外部事例台帳** —— §1 の14件＋既存4社を `competitors-autonomous-app-ops-2026-08.md` に一次URL・確認日つきで固定し、**配信2営業日前の再確認**をルール化（`-rsi-audit.md` §6-5 が 9/26 と書いていた手順） | 記者Q&Aで他社を聞かれても、範囲だけを一次ソースつきで答えられる | 本文書 §1 |

### C. やらない

| やらない | 理由 |
|---|---|
| 「software factory」を名乗る／比較軸にする | 売っているのは工場ではなく1本のアプリの運営。名乗った瞬間に PostHog（178 PR/30日）や Warp と throughput で比べられて負ける |
| 「AIが次に作るアプリ機能を選んで本番投入」と書く | ①は `ai_proposes`。昇格0件 |
| 「世界初」「唯一」「日本初」 | 検索の不在は証明にならない（§1） |
| Warp「週300PR」・GrowthLoop「15%」を引く | 一次ソースに無い |
| 配信前日に見出し・サブタイトルを動かす | オーナー承認済みで、提案軸と既に一致している |

---

## 7. 推奨文言

**位置づけの一文（社名なし・原稿に足すなら「■ できていないこと」の直前）：**

> 同社が公開しているのは開発ツールでも運営基盤の製品でもなく、App Storeで配布中の1本のアプリを、
> その運営データを読むAIが日々動かした**運転台帳そのもの**です。

**★5上段の限定形（そのまま書ける範囲）：**

> 2026年8月11日〜9月2日の23日間で、公式サイト側の成果物19件をAIが出荷し、人が中身に手を入れた回数は0回。
> 同じ期間にアプリ本体は7版がApp Storeに並びましたが、実機確認・審査提出・公開はいずれも人の操作です。
> 23日のうち2日はどの経路も動いておらず、「連続稼働」とは書きません。

**記者Q&Aの想定3問：**

| 問 | 答え（台帳） |
|---|---|
| 「AIが出したもの」にアプリの更新は入っていますか | 入っていません。19件はサイト・運営基盤側。アプリは7版で、3つの門は人（§3-2） |
| コードの99.5%は今も続いていますか | 8/11〜21の値。9/1まで広げると81.9%。数え方が署名とトレーラーだけを見るため、判定できないコミットは人側に数えている（§4-1） |
| 他社と何が違いますか | 社名は出さない。違いは（1）人のマージを待たずに本番へ出る、（2）App Storeの正規工程まで範囲に含む、（3）未実装を分母に含む率と下がった月を公開している。throughput は大手に負ける（`competitors-…-2026-08.md` §2.4） |

---

## 8. 再現コマンド

```
# 3リポジトリを full clone にしてから
node scripts/code-authorship.mjs --from 2026-08-11 --to 2026-08-21   # 99.5% / 94.8%
node scripts/code-authorship.mjs --from 2026-08-11 --to 2026-09-01   # 81.9% / 70.9%
node scripts/automation-rate.mjs                                      # 66.8 / 76.4 / 87.9 / 87.4
node scripts/autopilot-runs.mjs                                       # 23日 41run 出荷19 完走67.9%
node scripts/autonomy-gap.mjs                                         # 上限 82.9%
node scripts/check-pr-claims.mjs                                      # 16 claim すべて「書ける」
node scripts/check-pr-facts.mjs --check && node scripts/check-autopilot-page.mjs --check
cd ../simplememo-ios && git tag -l 'v*' --sort=version:refname | tail -22   # 版とタグ日
```

**この文書の限界：** 外部事例は等級B（一次HTMLを自分で開いていない）。iOS の所有者名義コミット37件が
AI著作かどうかは判定していない（判定できないから人側に数える、という台帳の規則に従っただけ）。
App Store の公開日は台帳に無く、§3-2 の日付はタグ日である。
