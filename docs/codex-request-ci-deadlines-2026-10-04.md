# Codex への依頼：全PRの自動マージが止まる期限（2026-10-05〜10-16）と、Mac 側でしか直せない3件（2026-10-04）

依頼元: SimpleMemo Developer（Cowork セッション側）。照合基準: main `15d3b6fec`。
`SEO Validation`（`seo-check`）の各ステップを、**時計だけを先へ進めて**手元で流した結果から書いている（再現方法は末尾）。
どれも中身の変更とは無関係に**全PRで落ちる**種類で、落ちれば `claude/`・`Codex/` の自動マージと毎朝の自動運転の PR が止まる。
自律運転の成果点や実験成功には加算しない。

---

## 期限の一覧（何もしなかった場合）

| 落ち始め（JST） | ステップ | 原因 | 直せる場所 |
| --- | --- | --- | --- |
| **10/5 01:57** | `Waiting progress`（売上） | `data/revenue-series.json` の `source_generated_at` が 2026-09-29T16:57Z のまま（上限4日） | **Mac**（依頼A） |
| **10/5 09:14** | `Routine runs` | `data/routine-runs.json` の `observed_at` が 2026-10-02T00:14Z のまま（上限3日） | **Mac**（依頼B） |
| 10/9 09:00 | `App release ledger (Lane B)` | `data/app-releases.json` の `measured_at` 2026-09-08 から30日 | **Mac**（依頼C） |
| 10/9 09:00 | `Vendor register` | `data/vendor-operating-review.json` の `valid_until` 2026-10-08 | 再審査（依頼D） |
| 10/9 00:00 | `PR release ledger completeness` | `known_unrecorded`「pr7-dialogue-memo」の `resolve_by` 2026-10-08（日付は JST） | オーナー判断（依頼E） |
| 10/9 09:00 | `Waiting progress`（GSC 週次） | 2026-09-30 がサチコの一括エクスポートに無く、SEO Daily の preflight が落ちて週次の取り込みが止まる（上限9日） | Google の再送待ち（依頼F） |
| 10/12 09:00 | `Mention watch cadence` | 言及ウォッチの最新が 2026-10-01（上限10日） | Cowork セッションでやる |
| 10/16 00:00 | `PR release ledger completeness` | `last_confirmed_complete` 2026-09-24 から21日（日付は JST） | 全件の確認（依頼E） |

時計を進めると、ほかに `Autopilot run ledger`・`Autopilot page vs ledger`（毎朝の自動運転が書く台帳とページ）、
`Self-repair boundary`・`Autonomous Company source boundaries and recovery`（時計の凍結で落ちるテスト）も落ちるが、
前の2つは毎朝の自動運転が作り直す台帳とページ（ただし `Autopilot page vs ledger` は、10/5 0時（JST）から自動運転がページを作り直すまでの数時間は落ちる見込み）、後の2つは時計の差し替えそのもので落ちる（現在時刻で同じ差し替えをしても落ちる）ので、表には入れていない。

---

## 依頼A（最優先・10/5 01:57 JST）. 売上の写しの同期

- 隣のリポジトリの元の系列は **10/4 まで毎日更新されている**（GitHub の履歴で確認）。止まっているのは、このリポジトリの写しの更新だけ。
- 写しは `growth/scripts/revenue-series.mjs --write` が、**両方のリポジトリが手元にある所で**作る（スクリプトの冒頭のとおり）。Cowork のクラウド側には隣のリポジトリが無く、作れない。
- お願い：Mac で `node growth/scripts/revenue-series.mjs --write` → `--check` → PR。

## 依頼B（最優先・10/5 09:14 JST）. Mac の副系の観測係

- `Codex/routine-observations` の先頭は `b706f692e`（10/2 09:14 JST、PR #1862）のまま。`should_publish()` は「状態が変わったか、前回から1日たったか」で PR を出すので、**動いていれば 10/3 以降に少なくとも1日1本出ているはず**。
- 登録済みの16本の状態は、10/4 に `list_triggers`（include_completed）で見たかぎり 10/2 の写しと同じ（変化なし）。止まっているのは観測係のほうと考えている。
- お願い：launchd の `com.simplememo.routine-observer` と、`~/Library/Caches/com.simplememo.routine-observer/runner-error.log` を確認し、直ったら1回走らせて写しの PR を出す。
- こちらでは直せない理由：セッションの `--sync` は登録外の139本も写しに入れてしまい、参照不可の6本の「個別GETの404」の証跡も作れないので `--check` を通らない（10/4 に手元で試し、元に戻した。2026-09-22 の依頼と同じ形）。

## 依頼C（10/9 09:00 JST）. アプリ公開台帳

- `node scripts/app-releases.mjs --write`（3リポジトリが揃った場所で）→ `--check` → PR。自己テストの「実データが検査を通る」が、`measured_at` から31日目で落ちる。

## 依頼D（10/9 09:00 JST）. ベンダーの運用審査の期限

- 2026-09-08 の審査（`valid_until` 2026-10-08）。10/2 の追加審査2件は期限を延ばしていない（各文書に明記）。
- 再審査は `vendorReviewProblems()` のとおり、`reviewed_at` を新しくし、`valid_until` は32日以内。審査の中身（再審査条件：アカウント・プランの変更、処理範囲、規約・再委託先の通知、事故、終了前）を確かめてから。
- **どちらがやるかはオーナーが決める**（Cowork セッションでも、オーナーの指示があれば行う）。

## 依頼E（10/9 00:00・10/16 00:00 JST）. PR⑦ の転記と、全件確認の日付

- `data/pr-release-ledger.json` の `known_unrecorded`「pr7-dialogue-memo」は `resolve_by` 2026-10-08。注記のとおり、`experiments.json` へ行を作るか、期限を延ばす理由を書く。配信前採点が無く、採点は人の仕事とされているので、**オーナーの判断を待つ**。
- `last_confirmed_complete`（2026-09-24）は 10/16 に21日を超える。その間に別の配信が無かったかを確かめて日付を更新する。

## 依頼F（10/9）. サチコの一括エクスポートの 2026-09-30

- BigQuery で確認：site・url の両方の表に 9/30 の行が無い。`temp_` 表も `ExportLog` の行も無い（10/1 は 10/3 22:11 JST に入った）。
- Google の再試行はおよそ1週間（`growth/BIGQUERY_SETUP.md`）。埋まれば何もしなくてよい。**10/8 ごろまでに埋まらなければ**、preflight の扱い（その日を確認済みの欠測として窓の短さを記録し、取り込みを続けるか）をオーナーに聞く。
- なお、この回の失敗の記録が「資格情報の失効」と誤って分類されていた件は [#1974](https://github.com/simplememofast/simplememo/pull/1974) で直した（`classify()` が `Service account …iam.gserviceaccount.com` の `iam` に当たっていた）。

---

## 再現方法（どの環境でも同じ）

```sh
# libfaketime を各ステップの子プロセスだけに当てる（単調時計も進める。親の Python には当てない）
LD_PRELOAD=/usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1 \
FAKETIME='@2026-10-05 00:30:00' FAKETIME_DONT_FAKE_MONOTONIC=0 TZ=UTC \
  bash -e -c 'node scripts/check-routine-runs.mjs --check; node scripts/check-waiting-progress.mjs --check'
```

`2026-10-04 03:30:00` では全部通り、`2026-10-05 00:30:00` で上の2つが落ちる。
