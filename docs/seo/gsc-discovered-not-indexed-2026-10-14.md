# GSC「検出 - インデックス未登録」53件（2026-10-14）

オーナーが GSC の「検出 - インデックス未登録」レポート（最終更新 2026-10-09、該当53件、
検証: 開始 2026-09-29）を貼付し「解決しておいて」と依頼した回の記録。
同日、別スレッドが「クロール済み - インデックス未登録」123件を扱っている
（`gsc-crawled-not-indexed-2026-10-14.md`）。2本は凍結中の実験と統合判定待ちページの扱いを揃えた。

## 結論を先に

1. **53件はすべて、サイト側では正常に配信されている。**本番を1件ずつ取得し、
   53/53 が 200・自己 canonical・`noindex` なし・`X-Robots-Tag` なし・応答 0.08〜0.39 秒だった。
   全件 sitemap に載っている。GSC 実測（`growth/data/gsc/2026-10-12/pages.json`、期間 09-12〜10-09）
   では53件とも表示ゼロで、「前回のクロール: 該当なし」＝ Google がまだ一度も取りに来ていない
   という表示と食い違わない。
2. **53件は全部、公開から間もないページ。**09-19 公開 21件（#1484 の日英分離で独立した英語版）、
   09-30〜10-01 公開 6件（日本語の Obsidian ガイド）、**10-08 公開 26件**（#2031 の10言語化）。
   レポートの最終更新は 10-09 なので、26件は公開翌日の計上。
3. **背景: 10-08 にサイトの URL 数が約5.5倍になった。**sitemap の URL は #2031 の直前 452 →
   直後 2,480。HEAD 時点で 2,243 URL（約9割）の lastmod が 2026-10-08。Google の説明では、この区分は
   "The page was found by Google, but not crawled yet." で、典型的には "Google wanted to crawl the URL
   but this was expected to overload the site" のため巡回を先送りしたもの
   （[Page indexing report](https://support.google.com/webmasters/answer/7440203)）。
   **待ち行列が一気に長くなった直後に、新しいページが後ろに並んだ**のが主因と見ている（推定。
   Google 側の巡回計画は外から観測できない）。
4. **サイト側で直せる寄与要因が1つあった: 新ページがセクションのハブにも、同じ言語の既存ページにも
   ほとんどリンクされていなかった。**「被リンク」の多くは、自分の翻訳版からの言語切替リンクと
   hreflang だった（§2）。
5. **このPRで直したのは英語側が中心。**英語47件は、ハブ掲載と同じ言語からのリンクがそろった（§5）。
   **日本語6件のうち5件は `/obsidian/` ハブの子で、そのハブは凍結中の実験（動画、評価日 2026-11-14）の
   対象**なので、今回は触っていない。用意した変更は保存してあり、判定後に入れる（§6）。
   評価日を過ぎていた実験 internal-link-2026-09-02-003 は、オーナーの依頼で 10-15 に評価し、
   **基準値を記録された定義で復元できないため measurement_failed で閉じた**（§8）。これで凍結が解けた
   `/obsidian/plugins/`・`/obsidian/sync/` の子リンクは、このPRに入れた。
6. **同じことを黙って出荷しないための CI ゲート**を足した。今は足してはいけないリンクは、名指し・
   理由・期限つきの保留台帳で扱い、期限か実験の判定で自動的に error へ戻る（§4）。
7. **確実に言えないこと**: 内部リンクはクロールの優先度を上げる材料であって、クロールを強制する
   手段ではない。登録の時期は Google 側の判断。

## 1. 53件の内訳

| 公開日 | 件数 | 内訳 |
|---|---:|---|
| 2026-09-19 | 21 | #1484 で独立した英語版。`/en/vs/` 7、`/en/use-cases/` 4、`/en/guides/` 3、`/en/blog/` 2、`/en/obsidian/` 2、devlog・glossary・methods 各1 |
| 2026-09-30〜10-01 | 6 | 日本語の Obsidian ガイド（import / properties / templates / use-cases / zettelkasten / compare/anytype） |
| 2026-10-08 | 26 | #2031 で生成された英語版。`/en/obsidian/` 配下 16、`/en/blog/` 7、captio・data・siri 各1 |

言語別では英語47件・日本語6件。

## 2. 測った寄与要因 — ハブ掲載と同じ言語からのリンク

### ハブが子ページを載せていなかった

最も近い親ページ（ハブ）が子ページへリンクしているかを、修正前の HEAD で数えた。

| ハブ | 子ページ | 未掲載（修正前） | うち53件 |
|---|---:|---:|---:|
| `/en/obsidian/` | 28 | 25 | 13 |
| `/obsidian/` | 28 | 20 | 5 |
| `/blog/` | 67 | 11 | 0 |
| `/en/blog/` | 67 | 9 | 7 |
| `/obsidian/plugins/` `/en/obsidian/plugins/` | 3 | 2 | 0 / 1 |
| `/obsidian/compare/` `/en/obsidian/compare/` | 4 | 1 | 1 / 1 |
| `/en/siri/` | 1 | 1 | 1 |

`data/content-graph.json` は `/obsidian/` を17本の子の親と宣言していたが、`/obsidian/` はその17本に
リンクしていなかった。**宣言だけで、誰も突き合わせていなかった。**

### 同じ言語からのリンクが細かった

翻訳版どうしの言語切替リンクを除き、同じ言語の別ページから張られた `<a>` の本数（ページ数）。

| 集合 | 件数 | 中央値 | 2本以下 | 0本 |
|---|---:|---:|---:|---:|
| 53件のうち英語 | 47 | 3 | 21 | 9 |
| 表示実績のある英語ページ | 181 | 6 | 28 | — |
| 53件のうち日本語 | 6 | 1 | 5 | 0 |
| 表示実績のある日本語ページ | 218 | 6 | 32 | — |

### 既存の検査が見逃していた理由

`scripts/lib/seo-site.js` の孤立ページ検査は、どのファイルのどの `href="…"` でも数えていた。
hreflang の `<link>` と翻訳版どうしの言語切替リンクがあるだけで「リンクされている」扱いになり、
修正前の HEAD で孤立ページ 0件と報告していた（しかも警告止まり）。同じ HEAD に新しい検査をかけると、
孤立 39件・ハブ未掲載 324件（うち日英 15件・68件）になる。

## 3. このPRの変更

| 区分 | 内容 |
|---|---|
| 英語 Obsidian ハブ `/en/obsidian/` | 09章を6分類（はじめる／同期とバックアップ／プラグインと機能／整理の方法と活用例／比べる／声で残す・うまくいかないとき）に分け、31本を追加。既存リンクは同一バイトのまま移動 |
| 英語の下位ハブ | compare に Anytype、plugins に Templater・QuickAdd・テンプレート集・起動が遅いとき、sync にバックアップ・同期コンフリクト。daily-note と `/en/siri/` は日本語版と同じ位置に同じ文を追加 |
| `/obsidian/compare/` | Anytype のカードを、Capacities・memos と同じ形で追加（日英） |
| `/obsidian/plugins/`・`/obsidian/sync/` | Templater・QuickAdd・テンプレート集・起動が遅いとき／バックアップ・同期コンフリクトを、各ハブの関連ガイドに追加（10-15 に凍結が解けた分、§8） |
| ブログ一覧 | `/en/blog/` の一覧に9件（英語記事 67/67）。`/blog/` には、日本語から足してよい5件（Foundation Models、iOS 26 SpeechAnalyzer 2本、自分宛てメールのアプリ比較、サービス終了リスク） |
| 英語の文脈リンク | 日本語版がリンクしている先へ、英語版でも同じ位置からリンク（20本）。自然な置き場が無い3件は見送り（§7） |
| 告知文 | 日本語記事7本に残っていた英語の隠し告知「This article is currently only available in Japanese.」は 10-08 以降事実と違う。英語版への案内に差し替え |
| 翻訳 | 新しい日本語文言55件 × 8言語（英語生成ページの1件を含め計441件）。言語ごとに翻訳と独立レビューを分け、レビューで31件を修正。カタログへは #2059 と同じく追記のみ。うち凍結中の `/obsidian/` ハブと統合判定待ちのカードの分は、まだページに出ない（§6 で入れるときにそのまま使う）。#2080 の生成器（日付の書式・機械翻訳の注記）で再生成 |
| 再生成 | `docs/site-localization.md` 手順5のとおり。変わった翻訳ページは `/blog/`・`/obsidian/compare/`・`/obsidian/plugins/`・`/obsidian/sync/` の32面だけ |

リンクの増減（`<a href>` の本数）: 日本語11ファイル +19（うち7本は告知の付け替え）、英語26ファイル +73、
翻訳ページ32ファイル +96。既存リンクの削除は告知の付け替えの7本だけ。

ラベルは各リンク先の `<h1>`・`<title>`・meta description から取り、「最速」のような強い語は
リンク先の題名にある場合でもハブ側では落とした。英語版に書き足した事実（Anytype の検証範囲、
Linux での確認など）は、リンク先と日本語版の本文で裏を取った。

## 4. CI ゲート — 同じことを黙って出荷しない

| 検査 | 規則 | 種別 |
|---|---|---|
| `scripts/seo-check.js` | **[ORPHAN]** sitemap に載るページに、同じ言語の（自分の翻訳版以外の）ページから `<a>` が1本も無い | エラー |
| `scripts/seo-check.js` | **[HUB]** 親ディレクトリがページとして sitemap にあり、言語トップでないなら、そのハブが子へリンクしている | エラー |
| `scripts/check-content-graph.mjs` | **[CHILD]** content-graph で parent を宣言した子へ、親ページが実際に `<a>` でリンクしている | エラー |
| `scripts/check-content-graph.mjs` | **[CHILD-EN]** 子と親の両方に英語ページがあるとき、英語の親も英語の子へリンクしている | エラー |

- リンクは `<a>` の `href` だけを数える。HTML コメント・`<script>`・`<template>` の中は数えない。
  ページの言語と翻訳グループは `data/i18n/pages.json` から取る。2本の検査は同じ関数を使う。
- **保留台帳** `data/link-gate-deferrals.json`（解釈は `scripts/lib/link-deferrals.js` の1本）:
  今は足してはいけないリンクを、名指し・理由・期限（2026-11-08）つきで書く。当たった指摘は消さず、
  保留の id・期限・理由つきの警告として毎回出す。期限を過ぎるか、名指しした実験がすべて閉じると失効して
  error に戻る。当たらない保留、読めない台帳、知らない実験も error。保留は元ページと、そこから**生成された**
  翻訳にだけ効き、手で書く英語版には効かない。
- 自己テスト: seo-check 40 → 80件、content-graph 8 → 25件。各規則と保留の核（範囲・失効・未使用の判定）を
  壊すと自己テストが落ちることを確かめ、`data/check-selftests.json` に記録した。
- いまの状態: error 0件。保留で警告になっているのは、凍結中の `/obsidian/`（動画の実験、評価日 2026-11-14）と、
  統合判定待ちの日本語ページ7件の分。

## 5. 修正後の指標

同じスクリプトで、修正前と修正後の作業ツリーを数えた。

| 集合 | 中央値 | 2本以下 | 0本 |
|---|---|---|---|
| 53件のうち英語（47） | 3 → **4** | 21 → **10** | 9 → **0** |
| 53件のうち日本語（6） | 1 → 1.5 | 5 → 5 | 0 → 0 |

英語のハブ未掲載は 0（言語トップ `/en/` は対象外）。日本語は `/obsidian/compare/anytype/` と
`/obsidian/templates/`（`/obsidian/plugins/` から）が1本ずつ増えた。残りは凍結中の `/obsidian/` ハブを待っている（§6）。英語で2本以下に残った10件は、いずれもハブからは
リンクされている。これ以上は文脈の無いリンクを足すことになるので、足していない
（`docs/content-linking-rules.md`）。

## 6. 今は入れず、条件がそろったら入れるもの

**凍結中の実験の対象ページ。**`growth/experiments/experiments.json` の排他スコープは「判定が記録されるまで
凍結」（`growth/scripts/check-experiments.mjs`）。CI は警告しか出さないので、変更前に
`growth/lib/experiment-overlap.mjs` の `ownershipConflict()` で差分と照合し、重なり 0 を確認した。

| ページ | 実験 | 用意してある変更 |
|---|---|---|
| `/obsidian/` | video-2026-08-11-five-clips（評価日 2026-11-14） | 関連ページを7つの見出しに分け、21 → 45 リンク（日本語の対象5件を含む） |
| `/voice-input/`・`/blog/email-yourself-memo` | 評価期間中のタイトル実験（11/01・11/02） | 日本語版ができた先への付け替え |
| `/blog/memo-app-hikaku-matome`・`/en/blog/best-memo-apps-2026`・`/en/blog/ios-quick-capture-comparison` | 評価期間中の実験（11/11・11/12） | 告知文の修正、英語の文脈リンク各1本 |

**統合判定待ちの日本語ページ**（「クロール済み」スレッドの方針。10/09〜11/05 の窓で 11/08 頃に判定するまで、
日本語のハブ・ページからリンクを足さない）: `/blog/best-note-to-self-apps-2026`・`/blog/captio-shutdown-alternatives`・
`/blog/fastest-note-app-iphone-2026`・`/blog/how-to-email-yourself-note-iphone`・`/blog/inbox-zero-workflow-tips-2026`・
`/blog/offline-first-comparison`・`/iphone-shortcuts-email-guide/` ほか。`/blog/` のカード6枚と、
`/iphone-shortcuts-email-guide/` への付け替え3本を用意してある。

用意した変更は、ブランチ `claude/gsc-dni-deferred-links-2026-10-14`（PR なし）に完成形のまま置いた。
訳文は既にカタログにある。入れるときは、そのブランチから該当ページを取り出し、翻訳ページを再生成し、
`data/link-gate-deferrals.json` の該当行を消す（消し忘れると「当たらない保留」で CI が落ちる）。

`/obsidian/plugins/`・`/obsidian/sync/` は、internal-link-2026-09-02-003 を閉じた（§8）ので凍結が解け、
このPRに入れた。

## 7. 見つけたが、このPRでは直していないもの

- **翻訳ページの誤訳**（#2031 の機械翻訳）。例: zh-Hans の `/zh/obsidian/troubleshooting/sync-conflict/` の
  題名が「Git竞争」（競合を competition と訳している）、`/zh/obsidian/import/` が「过渡指南」、
  `/zh/obsidian/troubleshooting/slow-startup/` が「切割步骤」。今回の訳はラベルの意味を優先して正しい語に
  したため、リンク先の題名と語が一致しない箇所が出る。リンク先の再翻訳は別作業。
- **翻訳の取り込みスクリプトが HEAD の時点で止まる。**`scripts/import_site_translations.py` は
  `data/i18n/overrides/en.json` の古い訂正（`ja:ed3639667b64cc8d9993`、daily-note-plugins の図の説明。
  原文が変わって抽出に無い）で例外になる。今回は #2059 と同じ追記方式で取り込んだ。
- **見送った文脈リンク3件**:
  - `/en/resources/obsidian-inbox/` → `/en/resources/obsidian-uri/`。このページは
    `scripts/build-citation-assets.py` が生成し CI が `--check` するので、手では直せない。生成スクリプトの
    英語本文に、日本語版と同じ段落を足す必要がある。
  - `/en/guides/` → `/en/blog/open-source-memo-apps`。英語版にはこれに当たる一覧が無い（ブログ一覧からは掲載済み）。
  - `/press/` の「英語レポート」リンク（`/en/autopilot/`）。直前に日本語版へのリンクがあり、付け替えると
    同じリンクが2本になり、ラベルも事実と違ってしまう。
- `/en/blog/sales-meeting-notes` の中段 App Store CTA は、位置の比率が 0.7499 で「中段」の境界 0.75 に近い。
  いまは `tag-cta-placements.js --check` を通るが、上に十数文字足すと「下段」に変わる。
- `sitemap.xml` の lastmod は、main の first-parent（squash マージ）のコミット日（JST）から引かれる。
  PR を出した日とマージの日が JST で食い違うと、次の PR が `WRONG LASTMOD` で落ちる。

## 8. 判定待ちだった実験の評価（2026-10-15、オーナー依頼）

評価日を過ぎて判定待ちだった2件を、台帳の正規の手順（`growth/scripts/experiments.mjs`）で扱った。
GSC の数値は `Analytics API (encrypted)` ワークフロー（`.github/workflows/analytics-read.yml`、固定の読み取り
レポート）で引いた。結果は使い捨ての公開鍵で暗号化して受け取り、手元で復号した（オーナーの認証情報には触れていない）。

**internal-link-2026-09-02-003 → measurement_failed（測定不能）。**

- 台帳の基準値は `/obsidian/` の 2026-08-23〜08-29（7日）で 9クリック・359表示・順位11.81。09-02 に BigQuery を
  直接照会した値だが、照会文（検索種別の絞り込み・集計方法）が残っていない。
- 同じ期間・同じ URL を固定レポート（`searchdata_url_impression`、検索種別 WEB、順位 = `sum_position/impressions + 1`）で
  引き直すと、9クリック・317表示・順位8.18。URL の変種（`#`・`?` 付き）も無い。**記録された定義では基準値を復元できない。**
- 最低標本数（1,500表示）は「51表示/日 × 41日」を前提にしているが、基準の窓は7日で、比較は同じ長さの窓で
  行う決まり。適格な比較では最低標本数に届かない。
- 手順書（`growth/EXPERIMENT_EVIDENCE.md`）の「定義不一致・復元不能は根拠付き診断で measurement_failed」に従った。
  効果があった・無かったとは書いていない。元の基準値は台帳にそのまま残した。根拠の詳細は非公開の証拠置き場に保存し、
  台帳にはハッシュ参照だけを置いた。

**video-2026-08-11-five-clips → 評価日を 2026-11-14 に変更。**基準の窓が92日（05-09〜08-08）なので、同じ長さの
変更後の窓（08-12〜11-11）がまだ閉じていない。指標（動画リッチリザルトの表示数）は固定の読み取りレポートに無いため、
評価時は同じ定義の書き出しを用意する必要がある。`/obsidian/` はそれまで凍結が続く。

**link-2026-08-28-feed-strongest-page**（`/blog/obsidian-voice-input`、評価日 10-12）も判定待ちだが、このPRの変更とは
重ならないので、今回は扱っていない。

## オーナー操作（任意・約5分）

1. URL 検査で次のハブを1件ずつ検査し、「インデックス登録をリクエスト」を押す（5件、1日の上限内）。
   - `https://simplememofast.com/en/obsidian/`
   - `https://simplememofast.com/en/blog/`
   - `https://simplememofast.com/blog/`
   - `https://simplememofast.com/en/obsidian/compare/`
   - `https://simplememofast.com/en/siri/`

   この5件はどれも表示実績があり、Google が巡回しているページ。再クロールされれば、新しく張ったリンクから
   英語の対象が見つかりやすくなる（推定）。53件を1件ずつリクエストするより少ない回数で済む。
2. 「検証」は 09-29 開始のまま進行中なので、触らない。
3. サイトマップの再送信は不要。lastmod は内容を変えたページだけ更新した。

## 次の確認

- 2026-11-14 頃: 実験 video-2026-08-11-five-clips の判定を記録し、§6 の `/obsidian/` を入れる
  （判定が記録されると保留が失効し、CI がそれを知らせる）。
- 2026-10-28 頃: GSC スナップショット（`growth/data/gsc/`）で英語47件に表示が出始めたか、
  レポートの「検出 - インデックス未登録」の件数が減ったか。
- 2026-11-08 頃: 統合判定の結果に合わせて、残すページは `/blog/` へ載せ（訳は用意済み）、保留行を消す。
