# Codex への依頼：Captio の「App Store 撤退時期」の誤記、ストア検査の CDN 取り違え、CI を止めている条項マス（2026-09-23）

> **2026-09-24 追記：依頼D（3つの赤が互いの PR を止めている件と、#1552 に隠れた失敗）を末尾に足した。**

依頼元: SimpleMemo Developer（Cowork セッション側）。照合基準: main `b33946b60`。
A・B は**公開表示の正確さ**の修正、C は**全PRの自動マージを止めている CI の赤**で、いちばん急ぐ。
自律運転の成果点や実験成功には加算しない。3件は独立しているので、別PRにしてよい。

---

## 依頼C（最優先）. `Corporate obligations` が 2026-09-23 09:00 JST から全PRで落ちている

### 事象

`SEO Validation` の `Corporate obligations`（`node scripts/check-corporate.mjs --check`）が次で落ちる:

```
改定で戻されたまま 14 日を過ぎた条項マスが 16 件 — apple.liability_cap（15日） / apple.ip（15日） / … / registrar.governing_law（15日）
```

`data/corporate-obligations.json` の `contract_review.vendors` で、**`reset_at: 2026-09-08` の4社（apple / google_cloud / firebase / registrar）**の
4観点×4社＝16マスが `unreviewed` のまま、`reset_grace_days`（14日）を越えた。`today` は UTC の日付なので、
**2026-09-23 00:00 UTC（09:00 JST）に一斉に赤くなった。**直前に緑だった run #3652（PR #1539）は 08:36 JST 開始で、閾値の手前だった。

確認方法（main `b33946b60` で実測）:

```sh
node -e "import('./scripts/check-corporate.mjs').then(async m=>{const fs=await import('node:fs');const d=JSON.parse(fs.readFileSync('data/corporate-obligations.json','utf8'));for(const t of ['2026-09-22','2026-09-23'])console.log(t,m.validate(d,{today:t}).problems.length)})"
# → 2026-09-22 0 / 2026-09-23 1（16マスを列挙する1件）
```

**影響：`claude/` と `Codex/` の全PRが auto-merge されない**（中身と無関係に落ちる）。

### 次に来る波（同じ形で落ちる日）

| reset_at | 社 | 落ち始める日（UTC） |
| --- | --- | --- |
| 2026-09-08 | apple / google_cloud / firebase / registrar | **2026-09-23（発生中）** |
| 2026-09-15 | anthropic / search_console / github | 2026-09-30 |
| 2026-09-22 | appsflyer | 2026-10-07 |

### お願いしたいこと

改定後の規約本文を読み直して各マスを判定する（`reviewed_by: ai_draft` なら `draft_note` に何を読んで何を読めなかったかを必須で書く。
`human` に上げるのはオーナーの承認があったときだけ）。**猶予日数を延ばす・`reset_at` を書き換える・`unreviewed_budget` を上げる、
で通すのは見張りを無効化するのでやらない。**

こちらで直さない理由：条項の判定はオーナーが外部ディープリサーチ経由で行ってきた法的判断の欄で、
このセッションの作業範囲（被リンク施策）の外。**このセッションの PR（被リンク台帳の更新）もこの赤で止まっている。**

---

## 依頼A. Captio の App Store 撤退時期・開発元告知の有無を、一次情報に合わせて直す

> **2026-09-24 午後：この依頼はオーナーの判断で Claude が引き取り、[PR #1553](https://github.com/simplememofast/simplememo/pull/1553) を出した。Codex 側では着手しないでください。**
> 直している途中で、日本語 `/captio-alternative/` などが 2026-09-06 の英語版の修正（551358b99）から取り残されていたこと、
> Captio のリリース年が 2010 年（Engadget 2010-09-30）であることも分かったので、同じ PR に入れた。下の「要確認」2件も PR で片付けた。

### 一次情報（2026-09-23 に取得して確認）

https://captio.co/ の終了告知（開発者 Ben Lenarts 名義）の要旨:

- **クラウドサービスは 2024年10月1日に終了する。**
- **「Captio は2年前に App Store を離れたが、既存ユーザー向けにサービスを維持してきた」**
  （原文の趣旨。告知は 2024-10-01 より前に出ているので、App Store 撤退はおおむね2022年ごろ）
- 代わりを探すなら App Store で「email yourself」を検索するよう案内している。

### サイトの誤り（3種類）

1. **「2024年10月に App Store から削除された／消えた」** —— 誤り。2024年10月は**クラウドサービスの終了**で、
   App Store からはその約2年前に撤退している。
2. **「開発元は公式発表をしていない」**（EN: *No official announcement was made by the developer* /
   *The developer never issued an official statement*）—— 誤り。captio.co に終了告知がある。
   同じサイトの JA 版（`blog/captio-discontinued.html` 314行目）は告知の存在を正しく書いており、**JA と EN で矛盾している**。
3. **「後継」「successor」** —— 対外表記の規則（`CLAUDE.md` と私有の identity policy）では、Captio との関係は
   「Captio のワークフローに着想を得た」「Captio alternative／代替」だけを使い、「公式後継」「Captio 公認」は使わない。
   「後継」「successor」単独も後継を名乗っているように読めるので、「代替」「alternative」に寄せてほしい。

**正しいまま残すもの:** 「サービス終了（2024年10月）」「Captio shut down in October 2024」「service ended in October 2024」
「新規ダウンロードはできない」は正しい（2024年10月はサービス終了の月）。**App Store からの撤退を 2024年10月と結び付けている箇所だけ**を直す。

### 該当箇所（`grep` で抽出した行。行番号は `b33946b60` 時点）

| ファイル | 行 | 種類 |
| --- | --- | --- |
| `blog/captio-discontinued.html` | 27, 31, 45, 59（meta / og / twitter / JSON-LD description）, 232（FAQ JSON-LD）, 267, 277, 311（本文「App Storeからの削除（2024年10月）」）, 710（FAQ 本文） | 1 |
| `en/blog/captio-discontinued.html` | 28, 31, 44, 53（meta 系）, 209（FAQ JSON-LD）, 242, 252, 281（本文「App Store Removal (October 2024)」）, 645（FAQ 本文）, 670 | 1・2 |
| `blog/index.html` | 708 | 1 |
| `captio/index.html` | 375（「同名のiOSアプリ「Captio」（2024年10月にApp Storeから削除）」） | 1 |
| `captio-alternative/index.html` | 27（meta「Captio（Tupil製）が2024年10月に終了。後継Obsidian連携シンプルメモ…」）, 80（FAQ JSON-LD）, 1034（年表「2024年10月 — App Store削除・サーバー停止」）, 1285（FAQ 本文） | 1・3 |
| `en/captio-alternative/index.html` | 350 | 1 |
| `vs/captioo/index.html` | 72（JSON-LD）, 356, 358（「Captio本体は2024年10月で配信終了」＝配信は2022年ごろに終了） | 1 |
| `en/vs/captioo/index.html` | 164, 221（*built as a successor to Captio*）, 349 | 1・3 |
| `en/vs/index.html` | 307 | 1 |
| `en/faq.html` | 270 | 1 |
| `en/blog/best-note-to-self-apps-2026.html` | 68, 152, 238, 372, 429（*The developer never issued an official statement* を含む） | 1・2 |
| `en/blog/revenue-report-2025.html` | 506, 509 | 1（下記「要確認」も参照） |
| `llms.txt` | 226（*and its successor*） | 3 |

抽出に使ったコマンド（取りこぼしの確認用）:

```sh
grep -rnoE "(2024年10月(に|で)?App ?Storeから(削除|消え|姿を消)|App ?Storeからの削除（2024年10月）|2024年10月 — App Store削除|（2024年10月にApp Storeから削除）|2024年10月で配信終了|後継Obsidian連携シンプルメモ|(removed|disappeared) from the (Apple )?App Store in October 2024|App Store Removal \(October 2024\)|No official announcement was made by the developer|The developer never issued an official statement|After the October 2024 App Store removal|Captio removed: October 2024|as a successor to Captio)" --include=*.html .
```

他言語（zh / zh-Hant / ko / es / pt-BR / id / tr / ar）のトップページには、該当する日付表現は見つからなかった。

### 直し方の目安

- JA: 「Captio は開発元の告知によると2022年ごろに App Store から撤退し、**クラウドサービスは2024年10月1日に終了**しました」
  のように、**撤退とサービス終了を分けて**書く。「2022年ごろ」は告知の「2年前」からの推定なので、
  断定を避けるなら「告知の約2年前」と書く方が安全。
- EN: *Captio left the App Store around 2022, according to its developer's end-of-life notice, and its cloud service ended on October 1, 2024.*
- 「公式発表なし」は削除し、captio.co の告知を出典として示す。
- 年表（`captio-alternative/index.html` 1034行目付近）は「2022年ごろ — App Store から撤退」「2024年10月1日 — クラウドサービス終了」の2行に分ける。
- JSON-LD の FAQ 回答と、画面に出ている FAQ 本文は**必ず同じ文面**にそろえる（片方だけ直すと検査が落ちる／不一致になる）。
- 変更したページは `python3 scripts/generate_sitemap.py` を同じコミットに入れる。

### 要確認（直す前に事実を確かめてほしい）

- `en/blog/revenue-report-2025.html` の *Captio was removed from the App Store in October 2024. Thousands of users suddenly
  needed a replacement. We shipped in early 2025.* —— App Store の公開日（iTunes Lookup `releaseDate`）は **2026-02-12**。
  「2025年初頭に出荷」がどの版（別アプリID・TestFlight 等）を指すのか、こちらでは確認できなかった。
  **確認できなければ、数字や時期を足さずに削る**方向で。
- `vs/captioo/index.html` の「オランダのBoonbits／Tupil製」は、告知の署名が個人名のみなので会社名の出典を確認してほしい。

### なぜこちらで直さないか

該当が13ファイル・40行弱あり、JSON-LD と本文の対応を崩さずに直すにはリポジトリ上での一括編集が向いている。
こちらの環境は GitHub へ push できず、ディレクトリごとに Web UI でアップロードするしかないため、
13ディレクトリへの分割コミットになり、途中で main が動くと巻き戻しの危険がある。

なお、同じ誤りが私の台帳（`docs/seo/directory-registration-2026-09.md` §4 の事実表）にもあったので、
そちらは今回の PR で直した。媒体向けの本文（`docs/seo/media-pitch-drafts-2026-09-19.md` / `-22.md`）と
2026-09-23 の送信本文には、この誤った日付は入っていない（Captio については「着想を得た」とだけ書いている。
MakeUseOf への訂正提案だけは告知どおり「約2年前に撤退、2024-10-01 にサービス終了」と書いた）。
ディレクトリ登録の文面（台帳 §1）で撤退時期に触れたかどうかは、台帳の記録からは判別できない。

---

## 依頼B. `check-store-facts.mjs --net` が CDN の古いキャッシュを掴み、「ずれなし」と誤判定する

### 実測（2026-09-23 00:09〜00:24 UTC）

- App Store の公開版は **5.9.9**（`currentVersionReleaseDate` 2026-09-22T23:13:13Z）。
- `curl` で `lookup?id=6758438948&country=jp` を引くと 5.9.9。
- **Node の `fetch` で同じ URL を引くと 5.8.66 が返る**（`x-cache: TCP_MISS` → 2回目 `TCP_HIT`、
  同じ Akamai エッジ）。`country=us` は 5.9.9、`country=jp&_=<timestamp>` を付けると 5.9.9。
- その結果、`node scripts/check-store-facts.mjs --net` は **「実物: 評価 4.1 / 26件 / v5.8.66 — ずれなし」** と出力した。
  台帳は 5.8.66 のままで、公開ページは26ファイルで 5.8.66 を名乗っている（`grep -rl "5\.8\.66" --include=*.html .`）。

エッジによって古い応答が残ることがある、という読み。**観測はこのサンドボックスからの2回（00:09 と 00:24 UTC）で、
どちらも同じ傾向**だった。Apple 側の仕様としては確かめていない。GitHub のランナーが別のエッジに当たれば
正しい値が返る可能性もあるので、日次ジョブが同じ誤判定をするかは未確認。

### お願いしたいこと

1. `fetchStore()` に**キャッシュ回避**を入れる（例: クエリに時刻を付ける、`cache: 'no-store'`）。
   あるいは jp と us の両方を引き、`currentVersionReleaseDate` が新しい方を採る。
   **どちらの値を採ったかを出力に残す**こと（あとから機械が読めるように）。
2. そのうえで `--net --write` と `node scripts/sync_constants.js --write` で 5.9.9 へ同期する
   （`appVersionNote` の方針どおり、人が実物を読んで動かす欄であれば、その手順に従う）。

**反証条件:** キャッシュ回避を入れても Node から 5.8.66 が返り続けるなら、原因は CDN ではない。

---

## 依頼D（2026-09-24 追加）. 赤が長引くほど、日付で落ちる検査が増える —— 3つの赤が互いの PR を止めている

2026-09-24 の時点で、main と全 PR を止めている赤は**3つ**ある（依頼C の `Corporate obligations` だけではない）。
main（`b33946b`）で SEO Validation の全手順を手元で流して確かめた（WebKit の導入と report-only の横スクロール検査の2本は除く。
手元だけで落ちた2本は、サンドボックスの `GIT_CONFIG_COUNT` が原因で、CI では通っている）。

| 手順 | 落ちている理由 | 直す PR |
| --- | --- | --- |
| `Mention watch cadence`（44番目） | 言及ウォッチの最新が 2026-09-13（上限10日を超えた。**9/24 から**） | #1552（draft）が 9/24 のスナップショットを足している |
| `Corporate obligations`（98番目） | 規約の条項マス16件が、改定後14日を過ぎても読み直されていない | 人の読み直し（依頼C） |
| `Autopilot page vs ledger` | `/autopilot/` の点数が日付だけで古くなる（CLAUDE.md の既知の形） | #1551（9/24 の日次同期） |

**どの PR も、ほかの2つの赤で落ちる**（#1552 は 98番目で、#1551 は 44番目で、規約を直す PR は 44番目と #1551 の分で）。
自動マージは緑の PR しか入れないので、**別々の PR のままでは、どれも永久に入らない。**
同じ日に作って同じ日に入れる1本にまとめるか、オーナーが1回だけ手でマージするしかない（どちらにするかはオーナーの判断）。

### 待つほど増える（時計だけを進めた試算）

main に 9/24 のスナップショットを足した状態で、Node の `Date` だけを先の日付に固定して全手順を流した
（データは今のまま動かない前提。Python 側の日付は動かしていない）。

| 日付（JST 正午） | 新しく落ちる手順 |
| --- | --- |
| 9/25 | `Autopilot run ledger`（台帳が2日書かれていない・許容1日）、`Waiting progress`（「売上の日次観測範囲と取得の鮮度」が5日止まっている・上限4日） |
| 9/30 までに | `Routine runs`（list_triggers の写しが3日より古い。9/30 時点で7.2日） |
| 9/30 | `Corporate obligations` が **16件 → 28件**（anthropic / github / search_console の各4マスが加わる） |
| 10/07 | `Corporate obligations` が **32件**（appsflyer の4マス）、`Mention watch cadence` が再び（9/24 から13日） |
| 10/14 | `App release ledger` の自己テスト、`Vendor register`（microsoft が未登録・レビュー日の期限切れ） |

**規約の読み直しは、今の16マスだけでなく 8社32マスをまとめて済ませないと、9/30 と 10/07 にまた止まる。**

### #1552 に隠れている失敗（`Corporate obligations` の後ろなので CI にまだ出ていない）

`growth/lib/company-mentions.test.mjs` は時計を `2026-09-14T05:00Z` に固定したまま、**本物の** `growth/data/mentions/` を読む。
`companyMentions()` は `now` より後の日付のスナップショットを `future observation` として弾き、`status: 'unavailable'` を返すので、
**9/14 より後のスナップショットが1件でも入ると** 82番目のテスト
（*real existing observation feeds both status and selector while unknown source claims stay unknown*）が落ちる。
#1552 のブランチ（`4768ef3`）で `node --test growth/lib/company.test.mjs …` を流して、202件成功・この1件だけ失敗を確かめた。
CI では `Autonomous Company source boundaries and recovery` の手順に当たる。

直し方の案：テストの fixture に専用の mentions ディレクトリを持たせるか、`now` を最新スナップショットの日付から決める。
**`future observation` の検査そのものを緩めるのは、見張りを消すのでやらない。**

こちらで直さない理由：どれも自動運転（Codex / 日次同期）側の持ち場で、#1551・#1552 はいま Codex が動かしている。
被リンク施策の PR（#1541・#1546・#1547）は、この3つが解けるまで止まったまま待つ。

### 追記（2026-09-24 昼）：まとめ役は Claude。手元での通し稽古の結果

オーナーの判断で、3つの赤を解く**まとめ役は Claude**（規約の条項の判定はオーナー）、**規約は8社32マスをまとめて読み直す**ことになった。
main に #1552 と #1551 を重ね、上のテストの時計を直し、**規約の読み直しを手元だけで仮に埋めて**（コミットしない。前回の判定を戻しただけ）全手順を流した。

- **失敗は1件だけ残った：** `Sitemap lists every page with content-derived dates` が18件のずれ。
  **#1552 は18ページ（著者表記の統一）を変えたのに `python3 scripts/generate_sitemap.py` を回していない**（CLAUDE.md の「ページを変えたら sitemap も同じコミットに」）。
  これも `Corporate obligations` より後ろなので、CI にはまだ出ていない。**#1552 に隠れた2つ目の失敗。**
- それ以外は全部通った（9/24 の時点）。つまり、1本にまとめるときの中身は次の5つ:
  1. 規約の読み直し（オーナーの判定。`data/corporate-obligations.json` の8社・32マスに `reviewed_by: human` と `reviewed_at`）
  2. #1552 の中身（言及ウォッチの 9/24 分と `gaps.json`、著者表記、Firefox）
  3. `growth/lib/company-mentions.test.mjs` の時計の直し（本物の観測を読むテストは、最新の観測の日付に合わせる）
  4. **マージする日の**日次同期（その日の #1551 にあたるもの。`/autopilot/` の点数と実行台帳は日付で古くなる）
  5. 同じコミットで `python3 scripts/generate_sitemap.py`
- 9/25 以降は、上の表の `Autopilot run ledger` と `Waiting progress` も効いてくるので、4 がその日の分であることが前提になる（`Waiting progress` は日次同期で動くかどうか未確認）。
- **まとめの PR が入ったあとは、sitemap を触る PR を1本ずつ入れる。**#1547（記事）と #1553（Captio）はどちらも sitemap の lastmod を動かすので、
  1本入るたびに次の PR で「Update branch」→ `python3 scripts/generate_sitemap.py` を回して足し、検証が通ってから次へ進む（同時に出すと sitemap の同じ行で衝突する）。
  #1553 は sitemap を入れずに出してあるので、Update branch は衝突しない。

### 読み直しても戻る恐れ（指紋の揺れ）

`vendor-terms.mjs` が毎週取る指紋の履歴を追うと、**読み直しの直後にまた変わっている社がある:**
registrar（ムームードメイン）は 9/02・9/08・9/15・9/22 と**毎週違う指紋**、apple・anthropic・github も戻された後にもう一度変わっている
（google_cloud・firebase・search_console・cloudflare・resend・prtimes は変わっていない）。
指紋は `source` のページ全体なので、本文以外の揺れでも「改定」と数えている可能性が高い（`$note` にも「粗いほうへ倒してある」とある）。
**このままだと、8社を読み直しても registrar などは次の週にまた戻され、14日後にまた全マージが止まる。**
指紋を本文だけに絞る（あるいは揺れる社の取り方を変える）かどうかは、見張りの設計に関わるのでオーナーと Codex の判断。

### 各社の「今の版」を公開ページで確かめた（2026-09-24 昼）

戻された32マスのうち、**本文の版（効力日・最終更新日）が前回の読み（8/28〜8/29）の後に変わっているのは3社だけ**だった。
残る5社は、ページに出ている版の日付が前回の読みより前のままで、指紋の変化は本文の改定ではない可能性が高い。

| 社 | 前回の判定（上限・知財・個人データ・準拠法） | 今の版（公開ページの表示） | 読み直しの要否（こちらの読み） |
| --- | --- | --- | --- |
| google_cloud | risk・ok・risk・risk | Google Cloud Terms「Last modified September 2, 2026」 | **改定あり。読み直しが要る** |
| firebase | risk・ok・risk・risk | Firebase Terms「last modified: September 02, 2026」 | **改定あり。読み直しが要る** |
| registrar | risk・risk・risk・risk | ムームードメイン利用規約の改定履歴に「2026年9月14日 改定」 | **改定あり。読み直しが要る** |
| apple | risk・ok・risk・risk | DPLA「Schedule 1 last updated August 18, 2026」（LYL255） | 前回（8/28）の読みより前の版のまま。指紋は一覧ページ（`/terms/`）の揺れと読める |
| anthropic | risk・ok・risk・risk | Commercial Terms「Effective June 17, 2025」 | 前回の記録にも同じ日付がある。版は同じと読める |
| github | risk・ok・risk・risk | Terms of Service「Effective date: April 27, 2026」 | 前回の記録（2026-04-27）と同じ |
| search_console | risk・risk・risk・risk | Google Terms of Service「Effective July 30, 2026」 | 前回（8/29）の読みより前の日付。前回の記録に版が無いので、同じ版かは未確定 |
| appsflyer | risk・ok・ok・risk | Terms of Use「Last updated November 23, 2025」 | 前回の読みより前の日付。ただし前回の根拠は MSA（記録に July 16, 2024）で、MSA の今の版は未確認 |

- **人が本文を読み直す必要が確かなのは3社12マス。**残る5社20マスは「版が変わっていないことを確かめて、前回の判定のまま付け直す」で済む見込み
  （同じ版であることの確認はオーナーの判断。search_console と appsflyer は上のとおり未確定の点がある）。
- **5社の指紋の変化が本文の改定でないなら、上の「指紋の揺れ」は実際に起きている**ことになる。見張りを版の日付か本文だけに寄せると、2週間ごとの赤はかなり減る。
