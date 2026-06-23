# SEO・AIO 最適化プラン v2（実測データ版）

**作成日:** 2026-05-29
**対象:** https://simplememofast.com（Captio式シンプルメモ / iOS メモ→メールアプリ）
**前提データ:**
- Google Search Console パフォーマンス（直近3ヶ月 / 2026-02-28〜05-27）
- GA4（2026-05-01〜05-28、493 アクティブユーザー）
- Ahrefs サイトクロール（2026-05-27、346 URL）

> このドキュメントは v1（`docs/SEO_AIO_STRATEGY_v1.md`, 2026-03-06、当時96ページ・UUほぼ0）の後継。
> v1のPhase 0/1（robots.txt・canonical・OGP・hreflang・/en/分離・llms.txt・middleware 301）は**ほぼ実行済み**。
> 本書は「実トラフィックが出た後の実測診断」と次フェーズのロードマップ。
> AIO引用の詳細運用は `docs/ai-citation-strategy.md` を参照（重複させない）。

---

## 0. エグゼクティブサマリー

技術基盤は完成度が高く、Ahrefs由来の不具合はクロール後のPR #278–#282でほぼ解消済み
（内部リンク切れ1件→修正、画像alt欠落201→3、外部デッドリンク113アンカー除去、
タイトル/meta長さ調整）。**残る本質的課題は技術ではなく運用の3点:**

| # | 課題 | 証拠 | レバー |
|---|------|------|--------|
| **1** | CTR崩壊 | 3ヶ月で 156クリック / 9,079表示 = **CTR 1.72%**。表示のある214ページ中 **159（74%）が0クリック** | タイトル/スニペット + AIO引用 |
| **2** | 英語SEOが構造的に機能不全 | 154コンテンツページが「二重DOM」（JA+ENを1枚に内包しJSで表示切替）。独立EN実体は18ページのみ。US滞在 **2.4秒** / エンゲージ **14.5%** | 二重DOM→/en/分離 |
| **3** | コンバージョン非計測 | GA4にキーイベント **0件**。App Store導線クリックが未計測 | GA4イベント設定 |

加えて本分析で発見した**潜在バグ（高レバー）**:
- **`lang.js` がレンダリング後の `document.title` / meta description / og:title を、隠し `meta-template` から毎回上書き**している。#282で `<title>` を最適化しても、テンプレートが古いままだと**実行時に弱いタイトルへ戻される**。約150ページが該当。
- 比較記事の**アプリ件数がSERP面で矛盾**（例: best-memo は title「20選」/ og・JSON-LD「10選」）。→ 4ページ分はPR `claude/seo-ctr-titles`（commit 4f6d7e56）で修正済み。残りは下記フォローアップ。

---

## 1. 現状スコアカード（実測）

| 指標 | 実測値 | 評価 |
|------|--------|------|
| GSC クリック / 表示（3ヶ月） | 156 / 9,079（CTR 1.72%） | 🔴 |
| クリックを得たページ | 214中 **55** | 🔴 159が0クリック |
| 平均掲載順位 | 約8–9位 | 🟡 上位なのに刺さらない |
| GA4 アクティブユーザー（28日） | 493（JP 327 / US 74 / CN 15 …） | — |
| JP エンゲージ率 / 平均滞在 | 42% / 29.4秒 | 🟢 |
| US エンゲージ率 / 平均滞在 | 14.5% / 2.4秒 | 🔴 即離脱 |
| OS構成 | iOS 231 / Win 138 / Mac 44 / Android 41 | iOS最多 |
| デバイス | mobile 268 / desktop 227 / tablet 4 | — |
| ブラウザ | Chrome 204 / **Safari(in-app) 128** / Safari 92 | in-app多=SNS流入 |
| GA4 キーイベント | **0件** | 🔴 |
| 内部リンク切れ / 5xx / mixed-content | 1（修正済）/ 0 / 0 | 🟢 |
| canonical不整合 | 0 | 🟢 |
| 画像alt欠落 | 201→**3**（#281で解消） | 🟢 |
| 二重DOMページ | blog54・vs39・use-cases22・glossary21・guides8・methods7 ほか = **154** | 🔴 |
| sitemap URL | ja **181** / en **18** | 🔴 EN過少 |

---

## 2. キーワード/機会マップ（実際に来ている需要）

### 2.1 勝てているページ（伸ばす）
| ページ | クリック | 表示 | CTR | 順位 |
|--------|---------|------|-----|------|
| `/`（トップ） | 40 | 357 | 11.2% | 8.9 |
| `/blog/captio-discontinued` | 22 | 207 | 10.6% | 6.3 |
| `/blog/fastest-memo-app-benchmark` | 10 | 127 | 7.9% | 6.6 |
| `/note-to-email/` | 6 | 210 | 2.9% | 8.1 |

→ **「Captio難民」「自分にメール（note-to-email）」が最高効率**。`captio`(CTR10.6%)、`note to self mail アンドロイド`(CTR33%)。

### 2.2 取りこぼし（striking distance：上位なのに0クリック）
| ページ | 表示 | クリック | 順位 | 状態 |
|--------|------|---------|------|------|
| `/blog/best-memo-apps-2026` | 2,059 | 6 | 6.6 | title修正済→効果計測 |
| `/blog/line-keep-alternative` | 1,046 | 8 | 7.6 | title修正済 |
| `/blog/line-keep-migration` | 523 | **0** | 7.9 | 意図ミスマッチ（後述） |
| `/blog/business-memo-apps-2026` | 272 | **0** | 6.9 | title修正済 |
| `/blog/offline-memo-apps` | 263 | 3 | 8.9 | title修正済 |
| `/en/send-email-to-yourself/` | 361 | 1 | 7.3 | EN二重DOM/分離待ち |

### 2.3 需要クラスタ
1. **Captio難民**（最濃）— captio / captio discontinued / captio alternative
2. **note-to-email / 自分にメール** — note to self mail, email to self, self mail
3. **サービス終了→移行** — LINE Keep（line keep 終了 代わり）, Google Keep（google keep サービス終了/代替）
4. **おすすめメモアプリ2026 / ビジネス向け** — 高Vol・AIO激戦
5. **会話型クエリ（AI/音声）** — 「ビジネスユーザーに最適なメモソフトを教えてください」(pos6.6)、「中小企業に特におすすめのメモソフトはどれですか？」 ← GEO直球ターゲット

### 2.4 カニバリゼーション（要統合）
「メモアプリ比較/ランキング」意図で7–8ページが競合し順位シグナルが分散:
`best-memo-apps-2026`・`business-memo-apps-2026`・`free-memo-apps-ranking`・`memo-app-hikaku-matome`・`memo-app-speed-test-2026`・`fastest-memo-app-benchmark`・`/comparison/`・`/vs/`
→ `best-memo-apps-2026` を正規ハブに、他は内部リンクで束ねる（または統合・canonical集約）。

---

## 3. 技術的発見と修正

### 3.1 🔴 `lang.js` タイトル上書きバグ（最重要・システム的）
`js/lang.js` の `applyLang()` は、`.meta-template[data-lang]` から
`document.title` / `meta[name=description]` / `og:title` / `twitter:title` を
**毎ロード上書き**する（L109–137）。
- 結果: 静的 `<title>` を #282 で最適化しても、`meta-template` が古いと**実行時に古い弱いタイトルへ戻る**。
- 影響: 二重DOMの **約150ページ**。

**推奨修正（1ファイル・全ページに波及）:** 初期 `document.documentElement.lang`（＝サーバ配信言語）を保持し、
`applyLang(lang)` 内の**メタ上書きを `lang !== servedLang` のときだけ実行**する。
こうすると JAデフォルトページでは静的 `<title>`（人手で最適化した正）がそのまま生き、
EN切替時のみテンプレEN値を適用する。
→ サイト全体の挙動変更のため、**本番自動デプロイ前にレビュー必須**。別PRで実施。

（暫定対応）高表示4ページは `meta-template` を静的タイトルに合わせて修正済（commit 4f6d7e56）。

### 3.2 アプリ件数の矛盾（4ページ修正済 / フォローアップあり）
- 修正済: best-memo `10→20選`、business `7→10選`、offline `7→5選`（本文H2/intro準拠）、line-keep-alt はタイトルを質問形「終了の代わりは？…7選」へ統一。
- **フォローアップ:** best-memo を `10選` のアンカーで参照する**26ページ**のクロスリンク文言が旧件数。
  `grep -rl 'おすすめメモアプリ10選' --include='*.html'` → 26件。`20選`へ一括更新（別PR、文脈確認の上）。

### 3.3 既に健全な項目（再対応不要）
canonical自己参照100%・5xx 0・mixed-content 0・robots.txt（17 AIボット許可）・llms.txt・
middleware（`?lang=`/`/blog/*.html` の301）・画像alt（残3件）。Ahrefsの4xx 119件の大半は
クローラーブロック誤検知（HBR/NYT/G2/Apple docs/doi）と Cloudflare `email-protection`（実害なし）。
App Store導線はライブで301→localizedに解決し**正常**。

### 3.4 軽微・バックログ
- オーファン候補3件（`/line-keep/`, `/blog/email-yourself-app-comparison`, `/en/blog/best-note-to-self-apps-2026`）→ 関連記事から内部リンク追加。
- 薄い多言語スタブ（`/zh/ /zh-Hant/ /ar/ /tr/ /id/ /ko/ /es/ /pt-BR/` 62–139語）→ 中身拡充 or `noindex`。
- `AggregateRating` は1ページのみ → App Store実評価を主要LPに展開（★表示でCTR底上げ。実数値のみ）。
- ~~**要確認(privacy):** ルートの `SEO_AIO_STRATEGY_v1.md` / `SEO_AIO_REPORT.md` は robots非ブロックで公開配信され得る。`docs/` へ移動 or 配信除外を推奨。~~ → 2026-06-10 `docs/` へ移動済み（robots.txt の `Disallow: /docs/` 配下）。

---

## 4. 英語SEO移行設計（最大レバー）

### 4.1 現状の問題
- 154コンテンツページが `<html lang="ja">` の中にJA+ENを内包し、`data-lang` + CSS `display:none` で切替。
- EN本文は**JA固定ページに隠れている**（title/desc/canonical/langすべてJA、hreflangはblog 54本中1本のみ）。
- → 英語クエリでまともに上がらず、稀に出てもJA見た目で**US滞在2.4秒で即離脱**。

### 4.2 目標構造（path分離 + 相互hreflang）
```
/<path>           → JA実体（lang=ja, 単一言語, hreflang ja/en/x-default）
/en/<path>        → EN実体（lang=en, 単一言語, hreflang ja/en/x-default）
```
homepage・主要LP・18 ENページは既にこの形。**残り約150ページを段階移行**する。

### 4.3 優先順位（GSC表示×ビジネス価値で決定）
| Wave | 対象 | 根拠 |
|------|------|------|
| **W1** | `note-to-email` / `captio-alternative` / `send-email-to-yourself` / `best-memo-apps-2026` の **EN実体化** | 既にEN表示が出ている（send-email 361imp 等）。コア訴求 |
| **W2** | LINE/Google Keep系・`vs/` 主要10本のEN実体化 | 比較検索のEN Vol |
| **W3** | 残り blog / glossary / methods | ロングテール |

### 4.4 移行手順（1ページあたり）
1. JAページから `data-lang="en"` ブロックを抽出し `/en/<path>` の単一言語HTMLを生成（lang=en, EN title/desc/canonical）。
2. JAページから `data-lang="en"` を除去し純JA化（DOM軽量化・CLS/速度改善の副次効果）。
3. 両ページの `<head>` に相互hreflang（ja / en / x-default）。
4. `sitemap-en.xml` に追加（現18→拡充）。`sitemap-ja.xml` のlastmod更新。
5. 旧 `?lang=en` 着地は既存middlewareが301で正規化済み（追加作業不要）。
6. JA→EN/EN→JAの言語ピルは「対応する実体URL」へリンク（lang.jsのlogic拡張 or 静的href）。

### 4.5 実装メモ
- 静的サイト×154ページの手作業は非現実的 → **簡易ビルド（テンプレ抽出スクリプト）かSSG（Astro/11ty）導入を検討**（v1でも示唆）。
- 移行は**自動デプロイ前にWaveごとにレビュー**。一括変換はdiffが巨大になるためWave分割必須。

---

## 5. コンバージョン計測（GA4）— P0

GA4（`G-EPZVZKCVQG`）は導入済みだが**キーイベント0**。App Store導線を擬似CVとして計測する。

### 5.1 コード（全ページ共通の遅延クリックリスナー）
App Storeリンクは複数（nav CTA / hero badge / footer / 本文）あるため、**委譲リスナー1本**で捕捉する。
`js/lang.js` と同様に全ページ読み込みされる軽量スクリプトを1つ追加（または既存GAスニペット末尾に追記）:
```js
// App Store 導線クリックを GA4 へ送信（擬似コンバージョン）
document.addEventListener('click', function (e) {
  const a = e.target.closest('a[href*="apps.apple.com"]');
  if (!a || typeof gtag !== 'function') return;
  const ct = (a.href.match(/[?&]ct=([^&]+)/) || [])[1] || 'unknown';
  gtag('event', 'app_store_click', {
    link_url: a.href,
    campaign_tag: decodeURIComponent(ct),   // 既存の ?ct=... を流用すると流入元ページが分かる
    page_path: location.pathname
  });
});
```
（`?ct=blog-best-memo-apps-2026-jp` 等の既存campaignタグが入っているので、**どのページのCTAが押されたか**が取れる。）

### 5.2 推奨は「コード不要」のGA4ネイティブ方式
**重要:** トップページと全 `/en/` ページは `lang.js` を読み込んでいない（173/206ページのみ読込）。
よって §5.1 のコードリスナーを lang.js に置くと**最重要のトップCTAを取りこぼす**。
GA4は「拡張計測機能 → 外部リンクのクリック」で `apps.apple.com` への遷移を**自動で**`click`イベント化しているため、コード不要で全ページ計測できる。

1. 管理 → データストリーム → 拡張計測機能 →「外部リンクのクリック」がONか確認（`click`イベントが既に出ていればON）。
2. 管理 → イベント → イベントを作成: 名前 `app_store_click`、条件 `event_name = click` かつ `link_url` に `apps.apple.com` を含む。
3. `app_store_click` を**キーイベント**にマーク。
4. 探索レポートで「ページ別 app_store_click 率」→ どのページがDLに効くかを可視化。

（より詳細な `campaign_tag`（`?ct=`）が欲しい場合のみ §5.1 のコードを Cloudflare Pages middleware の HTMLRewriter で全ページ注入する手もあるが、まずはネイティブ方式で十分。）

→ これが入って初めて、以降のタイトル/コンテンツ施策の**ROIが測定可能**になる。最優先。

---

## 6. AIO/GEO（土台は強い・引用される中身に集中）

robots(17ボット)・llms.txt・Speakable・FAQ schema は整備済み。詳細運用は `docs/ai-citation-strategy.md`。
本フェーズの追加アクション:
- 各ページ冒頭に**自己完結の定義段落**（数値込み: 起動約1秒・端末内AES-GCM・料金）。
- vs/比較は**HTML表**を維持（AIは表を好む）。EN実体化で英語AIにも露出。
- 会話型クエリ（既に表示が来ている）に**Q&A見出し+直答**を用意。
- 「メモアプリ おすすめ2026」系はAI Overviewが上部占有 → 自然枠CTR改善に限界。**AI Overview内の引用**を狙う設計に振る。

---

## 7. 優先ロードマップ

### ✅ 2026-05-29 に出荷済み（main マージ・自動デプロイ）
- [x] 高表示4ページのタイトル/件数矛盾の修正（**PR #284**）
- [x] best-memo クロスリンク19箇所 `10選→20選`（17ファイル・**PR #285**、巻き込み検証済）
- [x] **`lang.js` タイトル上書き修正**（§3.1）＋キャッシュバスター更新173ファイル（**PR #286**）。154ページ監査で劣化ゼロ・24ページがリッチなタイトルに改善

### P0（残・今週）
- [ ] **GA4 App Storeクリック計測**（§5）← 最優先。**コード不要・GA4 UIで設定**（トップ/`/en/`が lang.js 非読込のためコードリスナーは不可）
- [ ] オーファン3件へ内部リンク追加（低優先）

### P1（4週間）
- [ ] **英語EN実体化（dual-DOM→/en/ 移行）の"抽出ツール"構築**。手作業150ページは不可。`data-lang="en"` を抽出し `/en/<path>` を生成するスクリプトを作り、**best-memo 1本でテスト→レビュー→段階展開**。新規大量インデックスは影響大のため一括自動デプロイ禁止
  - 注: note-to-email / captio-alternative の hreflang は**既に正しく配線済**。150ページの hreflang 欠落は EN実体が無いためで、本移行が前提
- [ ] カニバリ統合の継続（§2.4。`_redirects` で既に captio-alternatives-comparison / memo-shuukan-tips を統合済の方向で）

### P2（四半期）
- [ ] EN実体化 Wave 2–3（vs/主要 + blog/glossary）
- [ ] 二重DOM全廃（SSG/ビルド導入）
- [ ] `AggregateRating` 展開・薄い多言語スタブの判断・被リンクでDR向上（B-2のインデックス未登録解消）
- [ ] 軽微: `captio-alternative` の x-default が EN を指す（他はJA）— 意図確認の上で統一

---

## 8. 計測サイクル
- **毎週:** GSC（新規クリック・CTR・順位変動）/ GA4（`app_store_click` 率・離脱ページ）
- **施策後2週:** タイトル変更4ページのCTR before/after を確認（特に best-memo 2,059表示のCTR）
- **毎月:** カニバリ・EN移行Waveの効果、Ahrefs再クロールで技術回帰チェック

---

*本書は実測ベースで継続更新。次アクションは §7 P0 のGA4イベント実装を推奨。*
