# 記事ネタ台帳（story seeds）

<!-- fact-check: draft -->

> **draft を宣言している理由。**この台帳の `note向け` / `X向け` / `英語圏向け` は、消費側がそのまま公開投稿の土台にする原稿。**内部の検討メモではないので、配信原稿と同じ規則（`scripts/check-pr-facts.mjs`）を通す。**

note・X・Reddit・Indie Hackers の定期投稿タスクが「次に何を書くか」を決めるために読む台帳。
読み方は `story-seeds` スキルが正典。**このファイルは素材であって、本文ではない。**

    https://raw.githubusercontent.com/simplememofast/simplememo/main/docs/story-seeds.md

**追記するのは毎日のオートパイロット**（`docs/obsidian/AUTOPILOT_RUNBOOK.md` §5-6）。
消費側のタスクはリポジトリにコミットできないので、**この台帳に「使った」印を書かない。**
使用済みの記録は各タスクが自分の state（`used_story_seeds`）で持つ。

---

## §0 規律（破るなら使わない）

- **数字は下の「引用できる数字」をそのまま引く。消費側で再計算しない。**
  出所が2つあると必ず食い違う。古いと感じたらその種を使わず次へ行き、報告に1行残す。
- **一人称は「開発者」。**個人名・個人のSNSアカウント名・個人名義の媒体名を書かない。
- **造語を作らない。**新しい呼び名を発明して概念を売らない。数字と設計判断で語る。
- **本文を使い回さない。**`note向け` / `X向け` / `英語圏向け` は別の角度で書いてある。
- **金額を書かない種がある。**このリポジトリは公開されている。個人の利用額は素材にしない。
- **全媒体で書かない表現**: 完全自動化／完全無人／無人経営／人間不要／世界初／
  AIが経営すると読める言い回し／再帰的自己改善／爆速／神アプリ／革命／圧倒的／最強／
  徹底解説／完全ガイド／◯◯選。加えて各種の `使わない表現` 欄を守る。
- **製品の事実は台帳ではなく本番から取る**（種は運営の話であって仕様書ではない）:
  `https://simplememofast.com/data/site-constants.json` と `https://simplememofast.com/llms.txt`。
  現行の正式名称は **Obsidian連携シンプルメモ**（EN: Simple Memo - for Obsidian）だが、
  **版・料金・無料枠は必ず上のファイルの当日値を引くこと。**ここに書き写すと二重管理になる。

---

## S-20260903-report-said-zero

- **媒体**: note / X / ih
- **分類**: autopilot
- **一行の主張**: 出荷は済んでいたのに、日報は「当日分の実行記録なし・公開記事0」と報告した。壊れていたのは出荷ではなく、記録が届く経路のほうだった。
- **引用できる数字**
  - 2026-09-03 08:06 JST に PR #793 がマージされ本番に出た（出典: `data/autopilot-runs.json` の `ap-20260903-actions`）
  - 同日 10:00 JST の日報は「公開記事: 0（当日分の実行記録なし）」と報告した（出典: `docs/obsidian/AUTOPILOT_LOG.md` 2026-09-03（6））
  - 原因は、記録コミットが auto-merge の検証済みSHAより**後**に積まれ main に届かなかったこと（出典: `docs/obsidian/AUTOPILOT_RUNBOOK.md` §5-1b）
- **note向け**: 「動いたか」と「動いたと記録できたか」は別の系で、後者だけが壊れることがある。自動運転の状態を人が読むのは常に記録側なので、記録が落ちると、動いているシステムが止まって見える。この日は出荷の2時間後に「何も出ていない」と報告が届いた。検証を通ったSHAだけをマージする設計は正しく、記録コミットがその後に積まれたのも順序としては正しい。噛み合っていなかったのは「マージ後に書く台帳をどのブランチへ置くか」だけだった。
- **X向け**: 自動運転の日報が「本日の公開記事0」と言ってきた。実際は2時間前に本番へ出ていた。壊れていたのは出荷ではなく記録の経路。動いているかを人が読むのは常に記録側なので、記録が落ちると動いているものが止まって見える。
- **英語圏向け**: The daily report said "0 articles shipped today." The deploy had actually gone out two hours earlier. What broke was not the pipeline but the path the record travels: the commit that writes the run ledger landed after the SHA that auto-merge had already verified and merged, so it never reached main. Humans only ever read the record, so a broken record makes a working system look stopped.
- **使わない表現**: 「バグを潰した」で終わらせない（順序は正しかった。噛み合っていなかったのは置き場所）。

---

## S-20260903-unreadable-vs-absent

- **媒体**: note / X / reddit / ih
- **分類**: autopilot
- **一行の主張**: 実費の取得に失敗した回を「実費は発生していない」と台帳に書いていた。「読めなかった」と「無かった」を同じ値で表すと、失敗が事実として保存される。
- **引用できる数字**
  - 永久除外に積まれていた6件のうち**3件は、あとから実費が台帳に載っている**（出典: `docs/obsidian/AUTOPILOT_LOG.md` 2026-09-03（6））
  - そのうち1件は成功して出荷した回だった（同上）
  - もう1件は、別経路のセッションidを Actions API へ投げた 404 を「発生していない」と読んでいた（同上）
- **note向け**: 取得に失敗したときの戻り値と、取得できて中身が空だったときの戻り値を同じにすると、呼び出し側はその2つを区別できない。区別できないまま「無かった」に倒すと、失敗が事実として台帳に残り、あとから見た人はそれを観測結果として読む。直し方は分岐を増やすことではなく、戻り値の型に「読めなかった」を持たせること。読めた上での不在だけを除外に積み、読めなかった回は翌日また試す。
- **X向け**: 取得に失敗した回を「発生しなかった」と記録していた。除外6件のうち3件は、あとから実費が台帳に載っている。うち1件は成功して出荷した回。読めなかったと無かったを同じ値で表すと、失敗が事実として保存される。
- **英語圏向け**: A fetch failure and an empty-but-successful fetch both returned null, so the caller could not tell them apart and folded both into "this never happened." Three of the six runs written off that way already had recorded costs — one of them a run that shipped successfully. The fix was not more branches but a return type that can say "could not read," so only a confirmed absence gets written off and an unreadable one is retried.
- **使わない表現**: 「AIが自分のバグを見つけた」と書かない（見つけたのは台帳に残っていた矛盾で、装置ではない）。

---

## S-20260903-rule-not-wired

- **媒体**: note / ih
- **分類**: autopilot
- **一行の主張**: 「これは人が決めること」と規則が宣言している故障を、3日ぶん自動側の作業として積み続けていた。表示だけ直して、行き先を直していなかった。
- **引用できる数字**
  - 2026-09-02 に表示は「人へ渡す」に変わったが、台帳の行き先は変わっていなかった（出典: `docs/obsidian/AUTOPILOT_LOG.md` 2026-09-02）
  - 結果、3日ぶん日報の自動側の欄に出続け、規則が人へ渡すと決めた依頼は一度も届いていなかった（出典: 同 2026-09-03（6））
  - 規則そのものは `data/escalation-rules.json` が `who: owner` と宣言していた
- **note向け**: 同じ判定が表示と台帳の2箇所にあると、片方だけ直る日が必ず来る。このときは表示側だけが直り、依頼の行き先は古いままだった。見た目には「人へ渡す」と出ているのに、実際には自動側の待ち行列に積まれ続けていた。さらに閉じ条件のほうも噛み合っていなかった——その条件を満たすには、規則が禁じている書き込みが必要だった。規則が満たすことを禁じている閉じ条件は、構造として永久に閉じない。
- **X向け**: 規則は「これは人が決めること」と書いてあった。表示もそう出ていた。でも台帳の行き先だけ古いままで、3日ぶん自動側に積まれ、人には一度も届いていなかった。同じ判定を2箇所に持つと、片方だけ直る日が必ず来る。
- **英語圏向け**: The rule said a human decides. The display said so too. The queue did not: the routing was never updated, so for three days the request sat in the automation's own backlog and never reached a person. Worse, its close condition required writing a field the same rule forbids — a condition the rules themselves make unsatisfiable never closes.
- **使わない表現**: 「規則を守らせた」と書かない（規則は最初から正しく、実装が追いついていなかった）。

---

## S-20260903-issue-closed-same-day

- **媒体**: X / ih
- **分類**: autopilot
- **一行の主張**: 監視が自分で立てて自分で閉じたIssueを、台帳は8日間「判定不能」のまま抱えていた。閉じ条件はあったが、材料を取りに行く経路が無かった。
- **引用できる数字**
  - Issue #591 は 2026-08-26T03:42:15Z に立ち、同日 14:31:44Z に閉じている（約10時間49分・出典: GitHub API）
  - 台帳の行はその後 8日間、未処理の上から2番目に居座っていた（出典: `docs/obsidian/AUTOPILOT_LOG.md` 2026-09-03（6））
  - 閉じ条件は 2026-08-26 から実装されていたが、判定に使う入力が一度も組み立てられていなかった（同上）
- **note向け**: 閉じ条件を書いた時点では仕事が終わった気になる。しかしその条件が読む入力を誰も用意していなければ、条件は毎日「判定できない」を返し続ける。そして「判定できない」は安全側なので、赤くもならず、静かに待ち行列を占め続ける。監視のほうは正常に働いていて、故障は当日のうちに終わっていた。終わったことを見に行く経路だけが無かった。
- **X向け**: 監視が立てたIssueは同じ日に自分で閉じていた。なのに台帳は8日間それを未処理として抱えていた。閉じ条件は実装済みだったが、判定に使う入力を誰も用意していなかった。判定不能は安全側なので赤くならず、静かに居座る。
- **英語圏向け**: The monitor opened an issue and closed it about eleven hours later, the same day. The action ledger still carried it as unresolved eight days on. The close condition had been implemented; nothing ever assembled the input it reads, so it returned "cannot determine" every day. That answer is the safe one, so it never turned red — it just quietly held a slot in the queue.
- **使わない表現**: 「監視が壊れていた」と書かない（監視は正常。壊れていたのは回復を見に行く側）。

---

## S-20260903-check-never-ran

- **媒体**: X / reddit / ih
- **分類**: autopilot
- **一行の主張**: 「作業ツリーが汚れていると走らない」検査が、汚れたまま呼ばれ続けて一度も走っていなかった。落ちていたのは検査ではなく呼び方。
- **引用できる数字**
  - 検査は「1本失敗」として記録され続けていたが、失敗の中身は「汚れているので走らない」だった（出典: `docs/obsidian/AUTOPILOT_LOG.md` 2026-09-03（6））
  - コミットしてから走らせたら、生成物が2件古かった（同上）
  - 収入の写しは 2026-08-28 から更新されていなかった（出典: `data/revenue-series.json`）
- **note向け**: 人の編集を潰さないために「作業ツリーが汚れていたら走らない」という判断を入れてあった。判断そのものは正しい。ただしこの検査は、常に作業中の状態から呼ばれていた。結果、毎回その理由で終了し、記録には「1本失敗」とだけ残り、誰も中身を見なくなった。失敗の理由が「安全のため実行しなかった」であることは、集計の1行からは読めない。走らせてみたら、生成物が2件古かった。
- **X向け**: 「作業ツリーが汚れていたら走らない」検査が、いつも汚れた状態から呼ばれていて一度も走っていなかった。記録には「1本失敗」とだけ残る。走らせたら生成物が2件古かった。失敗の理由は集計の1行からは読めない。
- **英語圏向け**: A generator check refuses to run on a dirty working tree, so it does not clobber edits in progress. Correct behaviour — except it was always invoked mid-edit, so it never actually ran. The summary line just said "1 failing" and nobody looked further, because a count does not say whether the failure was "the check found a problem" or "the check declined to start." Once run on a clean tree, two generated files turned out to be stale.
- **使わない表現**: 「検査が無意味だった」と書かない（判断は正しく、呼び方が合っていなかった）。

---

## S-20260903-shared-weekly-quota

- **媒体**: note / ih
- **分類**: autopilot
- **一行の主張**: 自動運転が使用量の上限で止まった日、その枠を食っていたのは自動運転ではなかった。上限はアカウント全体で共有されていた。
- **引用できる数字**
  - 2026-08-30 と 08-31 に、主系と副系が同じ上限で同じ時間帯に停止した（出典: `data/autopilot-runs.json`）
  - 実測の結果、対策候補のうち「1回あたりの入力量を減らす」はこの上限にほとんど効かないと分かった（出典: `data/escalation-rules.json` の `usage_limit` note・2026-09-03）
  - 上限そのものは時間で戻るため、経路を止める設計にはしていない（同上）
- **⚠ この種で金額を書かない**（公開リポジトリ・個人の利用額）。比率も書かない（公開されている値と組み合わせると総額が復元できる）。
- **note向け**: 自動運転が上限で止まったとき、最初に疑ったのは自動運転自身の消費だった。実際に測ると、枠を使っていたのはほぼ別の作業で、自動運転の寄与はごく一部だった。つまり「自動運転を軽くする」対策はこの上限にほとんど効かない。上限が共有資源である以上、止まった原因はその経路の中には無い。測る前に手を打っていたら、効かない対策に時間を使っていた。
- **X向け**: 自動運転が使用量の上限で止まった。自動運転を軽くしようとしたが、測ったら枠を食っていたのはほぼ別の作業で、自動運転の寄与はごく一部だった。上限が共有資源なら、止まった原因はその経路の中には無い。
- **英語圏向け**: The automation stopped on a usage limit, and the obvious next move was to make the automation lighter. Measuring first changed the answer: almost all of the quota was going to unrelated work on the same account, and the automation's share was small. When a limit is a shared resource, the cause of the stop is not inside the thing that stopped, and tuning that thing buys almost nothing.
- **使わない表現**: 金額・比率・他の作業の内容。「上限に達した＝使いすぎ」と読める書き方。

---

## S-20260903-unanswered-intent

- **媒体**: note / X
- **分類**: readers
- **一行の主張**: 順位8.5で128回表示されて、クリックが0だった検索語があった。ページに内容はあったが、その言い回しの見出しが無かった。
- **引用できる数字**
  - 検索語「obsidian ダウンロード」: 表示128 / 平均掲載順位 8.46 / 期待CTR 2.67% / 期待クリック 3.4 / 実クリック 0（観測 2026-09-02・出典: `growth/content/refresh-queue.json` の A1）
  - 表示されていたページは1つだけで、インストール手順は既に本文にあった（同上）
  - 対応は FAQ を1問追加しただけ（2026-09-03・出典: 同 `resolution`）
- **note向け**: 内容が足りないのではなく、答え方が検索語と噛み合っていない、という形の取りこぼしがある。このページは対応OSも配布形式も表で説明していて、読めば答えは載っていた。ただし可視のFAQにも構造化データにも、その言い回しに厳密一致する見出しが無かった。足したのは1問だけで、回答は既に検証済みの事実の言い換えにとどめている——新しい主張を足したわけではない。効果は次のスナップショットで見る。
- **X向け**: 平均8.5位で128回表示されてクリック0の検索語があった。ページに内容が無いのではなく、その言い回しに一致する見出しが無かった。足したのはFAQ1問だけ。回答は既に検証済みの事実の言い換えで、新しい主張はしていない。
- **英語圏向け**: (この種は日本語検索の観測なので、英語圏へはそのまま出さない)
- **使わない表現**: 順位やクリックの改善を断定しない（効果はまだ観測していない）。「SEOの裏技」の類。
