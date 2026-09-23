# Codex への依頼：Captio の「App Store 撤退時期」の誤記、ストア検査の CDN 取り違え、CI を止めている条項マス（2026-09-23）

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
