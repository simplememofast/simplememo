# SimpleMemo 2026年10月のトラフィック倍増計画

2026年9月30日 JST。対象は `simplememofast.com`。目標は、同じ計測条件で2026年10月の月間セッション数を9月の2倍以上にすること。現時点で9月全月のセッション基準値は未確定で、倍増に必要な絶対数や達成率は算出できない。

この記録は、既存計測と実験の定義を保ったまま実施できる作業、実測待ちの作業、アクセス不足で止まる作業を示す。新しい実験台帳、collector、probe、定期実行は作らない。実験の正本は `growth/experiments/experiments.json`、運用は既存のCompany ownerと[Operating Runbook](../autonomy/OPERATING_RUNBOOK.md)を使う。

## 達成判定と計測条件

主指標は対象サイトの9月と10月の暦月セッション数。同一の計測元、プロパティ、対象ストリーム、本番ホスト、タイムゾーン、内部アクセス等のフィルター、セッション定義で比較する。9月の条件を確定したら固定し、達成率を上げるために変更しない。判定は月合計の `October >= 2 × September`。30日と31日の違いを日次値として併記できるが、月合計の判定を置き換えない。

SEOと識別可能な外部AI参照セッションは内訳として追跡する。同じセッションがAI AssistantチャネルとAI参照ドメインの両方に現れる場合は重複を除く。GSCのWEBクリック、AI表示、引用、ブランド言及は別指標。欠測は未観測のまま保持し、0として加算しない。

| 確認項目 | 9月30日時点の事実 | 次の扱い |
| --- | --- | --- |
| 9月全月のGA4セッション | checkoutに集計結果・私有受領書がない。GA4プロパティのタイムゾーンも未確認 | 既存GA4の歴史データで9月1〜30日を同一定義で確認し、出典と条件を固定 |
| 既存BigQueryの成熟コホート | GA4リンクは9月5日、collectorの許可開始日は9月6日。9月1〜5日を同条件で復元できる根拠がない | 9月6〜30日の部分月を9月全月へ読み替えない。GA4 UIのセッションとも同義としない |
| データ遅延 | `export-analytics.mjs`はJST当日−5日を末日上限とする | 9月30日分は最短10月5日、10月31日分は最短11月5日に成熟。実際の既存受領書の完成を確認する |
| GSC最新WEB観測 | 9月29日取得、8月30日〜9月26日、Pacific、28日。サイト1,044クリック・56,437表示 | 検索診断に使う。9月暦月セッション基準値には使わない |
| GSCのAI表示 | 同じ日付窓のproperty表示7,518、ページ表示7,577。集計単位差59 | 実トラフィック、WEBクリック、AI参照セッションと合算しない |
| 検索語の欠落 | 最新WEBの匿名クエリ比率63.56% | 見えているquery×pageだけで全需要やゼロ流入を断定しない |
| 実測の取得経路 | 既存`analytics-read.yml`、`seo-daily.yml`、Company owner。私有の復号鍵・受領書はこの環境にない | 同じ期間の重複照会や鍵の複製をせず、既存出力と元の実行証拠を再利用 |

根拠: [GA4データ説明](../../growth/data/ga4/README.md)、`growth/scripts/export-analytics.mjs`、`growth/sql/analytics/ga4-funnel.sql`、`growth/lib/company-data.mjs`、`growth/data/gsc/2026-09-29/meta.json`。

有効な有料利用者の人数と10月失効予定人数は未取得で、0とは扱わない。購読状態の契約スナップショット、更新停止、購入件数をユニーク有料人数や失効予定へ読み替えず、具体的な契約数と照合根拠は既存課金ownerの非公開レポートに保持する。同じ期間・計測条件のサイトトラフィックと購読結果の対応も未取得であり、異なる日付窓のGSC・ASC・購読状態から獲得率やSEO由来の課金効果を算出しない。

## 技術SEOと表示の監査

監査対象の基準コミットは `ed3a3ca35ba385ae9da0f5ea834b703c8f705bb3`。重大なクロール不具合は再現していない。下記はローカルソース・配信モデル・ブラウザの確認であり、現在のGoogleインデックスや本番の配信内容の証明ではない。

| 領域 | 確認結果 | 次の判断 |
| --- | --- | --- |
| クロール・robots・内部URL | 既存SEO/内部URL検査が通過。既知のURL形は直接解決する | 新しい実際のクロール障害が出た場合に原因を直す |
| canonical・見出し | indexable 432 URLの実headに自己canonical1本、H1が1本 | 過去の9月5日監査の修正済み欠陥を現在の欠陥として再報告しない |
| title・JSON-LD | 重複title、JSON-LD解析エラーなし。SEO検査の47件はメタデータ長の警告 | 文字数だけを理由に、進行中のtitle実験を改変しない |
| sitemap・hreflang | sitemap検査と相互参照が通過 | 内容変更時だけ元のlastmod生成器を使い、最終CIで確認 |
| リンク・情報構造 | 孤立ページ・壊れたfragmentなし。全432ページがホームから到達可能 | 文脈に沿ったリンク追加は需要と実験範囲を確認してから行う |
| FAQ | 生成290面・手書き64面の本文との一致検査が通過 | FAQを変える場合は本文とJSON-LDを同期 |
| ホームのモバイル・JS無効 | JA/EN、320pxを含む20ケースでCTA・画像・メニュー・横幅が通過 | 実装を変えた場合に関連ケースを再確認 |
| 主要LP・記事・ツール | 23ページ×320/900/1100pxの69ケースで200、H1表示、横漏れなし | GSC新規候補も含む。表示正常をインデックス登録済みと解釈しない |
| 表示速度 | 既存日次PageSpeed経路あり。この監査の機能確認では外部リクエストを遮断 | ローカル結果を本番LCPやCrUXの代用にしない。元の日次監査で判定 |

実施した検査は `scripts/seo-check.js`、サイトマップ・content graph・内部URL・FAQ検査、`scripts/perf/browser_checks.cjs` と主要ページの幅確認。ホームの生成物検証はPython Brotliが必要で、依存関係を用意して最終preflightでも確認する。

## 検索需要と10月の優先順位

次の数値はすべて8月30日〜9月26日のGSC WEBページ観測。クリックはセッションではない。順位は平均値。工数Sは半日程度、Mは1〜2日程度の目安で、データ待ち・審査待ちを含まない。効果欄は期待する方向であり、成果予測ではない。

| 優先度 | 対象と根拠 | タスク・依存関係 | 工数と10月の効果 | 検証 |
| --- | --- | --- | --- | --- |
| P0 | 月間セッション基準値が未確定 | 元のGA4条件と9月全月値を確認。9月1〜5日の欠落を解決する | S、達成判定に必須 | 出典・期間・TZ・フィルター・セッション定義を保存 |
| P0 | 獲得面分析が不適格なスナップショットを成長率として表示 | `acquisition-mix.mjs`に既存comparison guardを適用 | S、施策選択の誤りを防ぐ。流入増そのものではない | 混合出典、重複窓、適格な別窓、単期値保持を自己テスト |
| P1 | LINE Keep代替: 10,158表示/81クリック/順位7.06 | 10月3日の既存CTA実験を元の指標・停止条件で評価し、次の施策を決める | S〜M、改善余地あり、効果量は未確定 | GSCと獲得成果を区別。ASC集計閾値未達を効果なしとしない |
| P1 | 無料メモランキング: 3,187/18/10.25 | 10月3日のselector-hub実験を評価。日付が来ただけで所有を解除しない | S〜M、検索意図の分岐改善を評価 | 元の対照・母数・title変更履歴を保持 |
| P1 | Obsidian関連ハブ: 料金1,829/44/7.53 | 10月12日の内部リンク実験を評価し、回遊と順位を別に判断 | M、既存公開施策の結果待ち | GA4内部遷移が欠測ならその欄を未計測とする |
| P1 | Obsidian導入: 1,393/11/8.25、note-to-email | 10月23日の既存実験評価。固定日まで再改題しない | M、前半の再編集より既存施策の実測を優先 | 元の28日baseline、post窓、source lag、停止条件を保持 |
| P2 | 英語Shortcutsメール: 3,810/23/6.05 | 11月11日評価の改稿実験を保護。機能障害だけ個別に修理 | M、10月の再改稿効果は評価できない | 既存実験と施策の混在を避ける |
| P2 | Dynalist比較: 1,232/26/7.51、`dynalist` 646表示/0クリック | 公式の利用入口について不足を確認。現行公式資料の検証と価値判断ができた場合だけ限定補足 | S、ブランド導航意図が多く効果は不確実 | 公式URL・本文・FAQ整合・ページ所有を確認。約12クリックの曲線差を予測にしない |
| P2 | iPhone標準メモ活用1,240/15/8.75、PKM547/10/6.08 | #1679/#1695の既存改稿後の窓を観測 | S、旧窓から追加改稿を正当化しない | 改稿前後の期間を分ける |
| P2 | 英語SpeechAnalyzer: 1,084表示/0クリック/6.97 | query×pageの不足と表示意図を診断。既存完成サンプルを重複制作しない | M、原因未確定 | 可視検索語はわずか。匿名行をゼロにしない |
| P2 | `/resources/obsidian-uri/`はリンク元1ページ、`/ai-tags/`等は3ページ | 検索需要と所有を照合し、必要なら関連本文から案内 | S、回遊・発見性の仮説 | 孤立修理とは扱わない。全変更元ページも申告 |
| P3 | 新規C13 Templater/C14 QuickAdd | C13/C14の最終CI・merge・Pages成功を確認。両記事の限定実GUI証拠を公開し、配信照合はmainに対応する既存HTTP reportで判断 | M、10月の検索効果は未確定 | 事前根拠を保持。新規URLの欠測baselineを0にしない |

大きな可視CTR機会は既存実験のページに集中している。主要LPは9月後半に既に改稿されており、最新窓の終端9月26日はその改稿前または直後。今の28日窓だけで連続改稿の効果や10月倍増を予測できない。

例えばLINEページの表示数10,158が一定のままCTRを仮に2%へ上げた場合でも、同じ窓のクリックは約203件になる。これは仮定のシナリオで、月間セッション予測ではない。既存高需要ページの結果、獲得導線、適格な新しい需要の発見を合わせて判断する。

## AIOと信頼性

公開された固定Codex系列は9月30日18:56:08 JSTの既存観測へ更新された。5問完了、非指名Q1〜Q4の4問では言及0/4・自サイト引用0/4。ブランド名を与えるQ5だけ言及・引用ありで、非指名率へ合算しない。最新JSONとretained JSONは同じrunの写しであり、別標本として数えない。要求モデル・固定質問・protocolは同じだが、9月19日からCLI版が変わっている。この小標本を全AI掲載率やトラフィック増へ読み替えない。費用USDは未観測のまま保持し、今回のGoalから新probeは起動していない。

C13 Templaterは、9月30日の隔離Linux Obsidian 1.13.7 / Templater 2.25.1で、手動挿入、新規Daily notesのTrigger OFF/ON（matching None）、既存ノートの通常再openと明示置換を実証して記事化した。原画像・Markdownと[限定した確認範囲](../obsidian/evidence/templater-20260930.md)を同梱。通常の手動カバレッジ公開として扱い、先行scheduled/Companyの停止・未完了記録は保持する。PR [#1758](https://github.com/simplememofast/simplememo/pull/1758)の最終head `8d7e5f812585bb134d553919d44cf50cce88c122`はSEO Validation run `36707612473`で成功し、11:32:02 UTCにmain `eb1d8ba08daa04ffd58a2e015005739edc9f0e84`へmergeされた。Cloudflare check `109866583332`は11:32:33 UTCに成功し、[対応Pages配備](https://75fd7e42.simplememo-596.pages.dev)を確認した。既存85件の本番HTTP検査（観測11:32:29.547 UTC）はC13の新規URLを含んでいない。記事の作成は検索・引用増の証明ではない。

C14 QuickAddは、9月30日の別の隔離Linux Obsidian 1.13.7 / QuickAdd 2.29.0で、既存Inbox.mdへの2回の末尾追記、元本文と作業中Working.mdの保持、Cancel後の不変、Create file OFFで不存在保存先への実行中止を実GUIで確認した。原画像3枚・原Markdown4件と[確認範囲](../obsidian/evidence/quickadd-20260930.md)を同梱し、share-sheet比較とiPhoneメモ記事から文脈リンクを追加。役割図のiPhone側は既存ガイド案内であり、配送試験ではない。品質判定は92/100。iOS・同期・URI/CLI・新規ファイル作成成功・SimpleMemo実機動作は未検証。PR [#1761](https://github.com/simplememofast/simplememo/pull/1761)の最終head `aae9ed8279baea23ba505caefd31404dacb6fa60`はSEO Validation run `36712308579`で成功し、12:16:38 UTCにmain `c7648cde2d6d921eb550426152e4cf7b77a8753e`へmergeされた。Cloudflare check `109881567606`も成功し、[対応Pages配備](https://9e1329b3.simplememo-596.pages.dev)を確認した。本番HTTP比較はC13/C14のHTML2件とPNG/Markdown4件に限定して追加するもので、Googleの登録状態、CTA動作、全サイトのバイト一致を証明しない。通常の手動公開として既存非排他観測への交絡を記録し、scheduled/Company成果や検索・引用増へ付け替えない。

このC14 merge APIは実際のmerge後にHTTP 502を返し、Auto-merge run `36713723127`はfailureとなった。後続GSC run `36713793929`は上流success条件でskipしたため、このrunから新しい6対象の配信成功は確認できない。マージ前のGSC run `36712308394`は元85件の本番baselineに成功したが、未公開候補6件は取得していない。[PR #1764](https://github.com/simplememofast/simplememo/pull/1764)は既存GSC workflowの読取専用ジョブを、上流successまたはfailureの完了後にtrusted mainを検査する条件へ修理し、9月30日21:45:31 JSTにmain `df94d9b0cbccca370f28fd8bdff5f31c2ba570e8`へmergeされた。イベント・権限・checkout・元85ケース・計測収集器は保持し、失敗した上流やIndexNow通知を成功へ付け替えない。以後の証拠はGSC自身のsourceCommit・観測時刻・HTML2件と原本4件の結果を参照する。 同mainのCloudflare check `109891946106`は成功。[既存GSC run #36716874612](https://github.com/simplememofast/simplememo/actions/runs/36716874612)は同じsourceCommitで21:46:01.909 JSTに元85件と追加6件すべて成功（失敗0・skip 0）した。HTMLの指定属性と原本4件のSHA256を照合した結果である。この自然起動は上流successであり、修理したfailure分岐の実運転を証明するものではない。

9月24日のMention Watchは検索要約の `verified:false`。本文確認なしに自社不掲載、独立推薦、獲得済みリンクを断定しない。既存の週次probeと元のownerを再利用し、弱い結果を理由に追加の有料probeを起動しない。

ソース上のrobotsはChatGPT-User、OAI-SearchBot、PerplexityBot、Perplexity-User、Bingbotに公開領域を許可する。middlewareにUA別の拒否はなく、記事への一律noindex/nosnippetもない。公開JSON/CSVのnoindexは取得拒否とは異なる。Cloudflareの実際のWAF・Bot Management・challengeや各ベンダーのIPからの到達性は、このソース監査では未確認。robotsでの許可を引用・流入の実績として扱わない。

施策候補は、読者の問いへの直接的な答え、公式根拠、実際の仕様、手順・例・制約、本文とschemaの一致、更新日の正確さ。AIに向けた誇張、未実測速度、未出荷機能、未確認の競合仕様は加えない。商品説明は[Capture OSのビジョン](https://github.com/simplememofast/simplememo-ios/blob/main/docs/VISION.md)に従い、Obsidian等を保存先として説明する。

## 実行と配送

- [x] 最新mainと進行中PRを確認し、独立worktreeを作成。
- [x] GA4/BQ/GSC/AIOの期間・単位・欠測・取得経路を確認。
- [x] 技術SEO、本文・検索意図、既存キュー、実験所有、予算と停止条件を監査。
- [x] 獲得面consumerの比較不具合を修正し、適格・不適格な比較を検証。
- [x] 既存preflightの失敗グループを再検証し、最終headのSEO Validationを通過。
- [x] 通常PRを作成し、最終head一致のauto-mergeとCloudflare Pages配送を確認。
- [x] 既存の本番85 URL HTTP検証を確認し、配送証拠をこの記録へ追記。
- [ ] 主要導線の本番ブラウザ操作を検証。現在はローカルでの機能確認のみ。
- [ ] 9月全月の確定値と条件を保存。
- [ ] 10月3日・12日・23日の既存実験を元のownerと観測窓で評価。
- [ ] 成熟した10月全月値で倍増の成否を判定し、必要な次の改善を選ぶ。

consumer修正は手動Goalからの独立した計測コード修理。新しいページ実験、Company prospective shipment、定期運転の復旧、流入増として計上しない。`assessComparison`/`selectComparison`、実験台帳、原本、collector、出典、停止条件は変更しない。

9月21日と29日のGSC窓は21日重複する。旧consumerはページ集計の日次クリック35.7143→37.4643を「+4.9%」と表示していた。修正後は元の日次値・表示・構成比を保持し、全群と合計の伸び率・順位を`null`、理由を`overlapping_or_reversed_windows`として返す。混合出典の8月9日→9月21日を「+22.1%」とする比較も保留する。これらの日次ページ集計はサイト全体の月間セッション数ではない。

自己テスト34件と独立レビューが通過。既存preflightは217チェック中215が通過し、残る2グループはクラウドの`umask 0077`がテストfixtureの公開権限を狭めたことで失敗した。コードや判定を変えず、コマンド内だけCI相当の`umask 0022`にして再検証し、refactor 61/61、Company関連208/208が通過した。217チェック全体をローカルで再実行したという意味ではなく、失敗した2グループを検証し直した結果である。最終PRのSEO Validationは下記のとおり成功した。

### 9月30日の配送証拠

[PR #1739](https://github.com/simplememofast/simplememo/pull/1739)はbranch `claude/october-seo-aio-20260930`のhead `2bf618c6a0ddb83b17e5b46e15d26ad3c9828ce5`を検証後、9月30日17:14:34 JSTに自動マージされた。mainへの直書きは行っていない。

| 証拠 | 結果と範囲 |
| --- | --- |
| [SEO Validation #36686912989](https://github.com/simplememofast/simplememo/actions/runs/36686912989) | pull_requestイベント、上記最終head、success。seo-checkジョブの必須検査が通過 |
| mainコミット | `e89dd930616a0cf938226792abbb6ea2734327a7`。変更2ファイルが検証済みheadと一致することをローカルgitで照合 |
| Cloudflare Pages | main上記コミットのチェック`109800038611`がsuccess。配備URLは[対応するPages配備](https://e46bc116.simplememo-596.pages.dev) |
| [既存GSC Crawled URL Checks #36688515412](https://github.com/simplememofast/simplememo/actions/runs/36688515412) | 同mainをsourceCommitとする既存workflow_run。ジョブ`109799905386`がsuccess。新たな計測照会・collectorは追加していない |
| 本番HTTP検証 | 観測開始`2026-09-30T08:15:03.611Z`。85件成功・0件失敗（redirect 56、HTML 15、data 13、asset 1）。HTTP状態・redirect後の到達・意図したnoindex等の配信検査 |

本番HTTP検証はGoogle URL Inspectionでも、正確な本番revision・配信バイトの証明でもない。主要導線のブラウザ操作も、このHTTP検証には含まれない。ローカルの20ホームケース・69追加ケース、mainに結び付いたPages配備記録、本番85 URLのHTTP結果を、それぞれの確認範囲で扱う。

この環境は本番ホストへの直接HTTP許可と計測の私有受領書がない。9月基準値、主要導線の本番ブラウザ操作、全サイトの配信バイト・revisionの厳密な照合は未検証として残す。新しいHTML2件の指定属性と原本4件だけの照合を、その代用にしない。別のネットワーク経路や新collectorを作って補わない。配送・配信検証の成功は、月間セッション増やAI引用増の証拠にはならない。

## 未実施のカバレッジ作業

C13/C14公開後のキューには21件が残っていた（pending 19件、blocked 2件）。C17の最終CI・merge・後続Pages・本番readback確認後は20件（pending 18件、blocked 2件）。これは全件がデータ待ちという意味ではない。C20・C22・C24・C26・C27・C32は、既存Linux Obsidian環境で必要な実証に着手できる。品質80点・固有価値・検証範囲・全変更面の所有・最終CIが公開条件であり、未実証の状態を公開可能とは扱わない。

| 残件 | 次の作業・条件 |
| --- | --- |
| C20・C22・C24・C26・C27・C32 | 順に競合復元、URI実行、Markdown描画、グラフ操作、Canvas保存、バックアップ復元を隔離サンプルで検証し、実結果から記事化 |
| C18・C21・C25・C28〜C31・C33〜C36 | 各候補の一次資料・実行例・比較条件・独自の役割を揃える。証拠が未作成という理由だけで全件をアクセス待ちとしない |
| C23 URIジェネレーター | 既存`/resources/obsidian-uri/`が同じ主題を持つ。重複URLを作らず既存面優先のRefreshへ戻し、現行需要と元のゲート・所有を確認 |
| C08・C19（blocked） | C08は既存Notion比較と同主題。C19は既存iPhone記事との役割判断とiOS実機検証が必要。Linux確認をiOS証拠へ読み替えない |

この手動GoalからC17の実証と公開候補実装を再開した。9月30日の隔離Linux Obsidian 1.13.7で、3ノート・接続0本、理由つきリンク追加後の3ノート・1本、索引追加後の4ノート・3本という段階を実際のGraphと保存Markdownで確認した。記事の主題はリンクを用意する実装例であり、著者作成のサンプルから知識・学習・生産性の向上は認定しない。公開記事には原画像・Markdown・[検証範囲](../obsidian/evidence/zettelkasten-20260930.md)と、methods/Zettelkasten・Obsidian/Second Brainから各1文の案内を含む。追加の本番比較対象はC17 HTMLと原PNG・索引Markdownの3件で、元85ケース・C13/C14の6件は保持する。公開成功の証拠は以下の最終head CI、対応mergeと後続Pages、既存HTTP reportから別々に確認した。キューの先頭から適格性を確認し、公開完了ごとに元のキューで状態を更新する。新規Lane Eには既存URLの期待クリック3件条件を適用しない。同主題のRefreshへ切り替えた候補には元の条件を適用する。

### C17の初回配送失敗と後続配送確認（2026-10-01 JST）

[PR #1775](https://github.com/simplememofast/simplememo/pull/1775)の最終head `73272d0231c9273601ffb14407df3961019b1044` はSEO Validation run `36731180959`（147 steps、failed 0）に成功し、2026-09-30T14:58:22Zにmain `d41860d8d5771b60f168146af138470374c19881`へ通常mergeされた。local preflightは218/218、変更24ファイルはレビュー済みbytesを保持した。

同mainの本番Pages deployment `24f1b939-dd89-491b-84f3-8dcb199bd295` はcheck `109952972502`でbuild失敗（15:09:57Z）。プレビューdeployment `a88b2ffc-07fe-4f18-b3b9-24c54e36f722`もcheck `109942851022`で失敗した。既存Cloudflare project `simplememo`内の両deploymentの失敗stage/build-log本文が不足している。現在のGitHub読取経路には状態とdashboardリンクだけがあり、Cloudflareログの既存認可経路はこの環境で利用できない。原本不足や記事の不備、一時的な基盤障害のいずれとも断定しない。

[初回の本番HTTP run `36733191095`](https://github.com/simplememofast/simplememo/actions/runs/36733191095)（sourceCommitは同main、観測開始14:58:49.683Z）は配備中にC17のHTML・原PNG・索引Markdownが404となりfailure。C13/C14の6対象はpass、元85件はskip 85で、このrunから85件の成功を主張しない。failure artifact `11105324398`を保持する。別のPageSpeed run `36731180957`は既存本番JAホームの中央値89<90で失敗し、artifact `11104633609`を保存した。C17はhome・共通CSS/font・性能基準を変更しておらず、C17による性能回帰の因果は未確定。既存failure ownerを保持する。

初回配送失敗時点ではC17のpendingと21件（pending 19、blocked 2）を保持していた。この失敗は後続成功へ付け替えず、[限定した実証と配送記録](../obsidian/evidence/zettelkasten-20260930.md)に残す。既存のactions停止・次回自然起動限定の許可、GSCの85+6+3ケースと既存条件を変更せず、新しい復旧実行・collector・probe・課金・送信者identityを追加しない。10月流入倍増とCompany無人率は未認定のまま保持する。

後続の別deployment `1ddcd405-8cab-4d10-85a3-60613d69ec38` は同exact main `d41860d8d5771b60f168146af138470374c19881`でCloudflare check `109960971844`が2026-09-30T15:27:56Zに成功し、[対応Pages配備](https://1ddcd405.simplememo-596.pages.dev)を確認した。起点と原因は未確認で、このタスクからCF rerun/dispatchは行っていない。自然schedule復旧・Company成果として認定しない。

[既存strict本番GSC run `36737882225`](https://github.com/simplememofast/simplememo/actions/runs/36737882225)（job `109964254546`、sourceCommitはexact同main、観測`2026-09-30T15:35:42.425Z`）は元85件と追加9件が全pass、failure/skip各0。C17 HTMLは15:35:47.259Zに200でtitle/canonical/robots/sitemapを確認し、索引Markdownは15:35:47.632Zに324bytes・SHA256 `425e7d6493f6926f3f3250a95c5d648cc1f64ab2fef1d6f536de609a3d72a264`、最終Graph PNGは15:35:48.085Zに45648bytes・SHA256 `9162bb00d4d7ea9e3a8e872ddeb4baaf4e5d6495c7142a5ded551b780913c989`が一致した。success artifact `11109420177`のarchive SHA256は`e25d0eada2677ad596d595107f2fd588dfd57b3879f7dee6fe8a1395580006fe`。原10件のsource一致と本番raw2件のbytes一致を分け、HTML全文・全サイト・他assetのbytes、Google登録・CTA・iOS/SimpleMemo・流入改善を認定しない。

この実配送確認で元のqueue C17をdoneとし、残件は20件（pending 18、blocked 2）。初期の配備・HTTP・PageSpeed失敗、GUI実証18assertionと品質92/100、graphのNot verified/verified:null、既存owner/停止/評価日は保持する。この台帳更新の最終CI・merge・対応Pagesは、記事本体の配送証拠と別に確認する。9月月間sessions基準値の欠落と10月倍増の未測定・未判定、Company加点なしを維持する。

### C20のGit本文競合復元候補（2026-10-01 JST）

9月30日の隔離Linux Obsidian 1.13.7と一つのオフラインGitで、両原文の手動保全・比較・明示した内容選択・実エディタ保存・Gitのmerge完了・再表示を限定確認した。原本22assertions/20fileと原3PNG・保存Markdown4件を保持し、private Chromiumの4幅・実download4件・FAQ/schema4組・原文code2件・OGを確認、候補品質92/100。C05の方式選択/競合生成と復元の実操作を分ける。自動conflicted copy生成・provider同期・remote/複数端末・iOS/SimpleMemo・長期成果は未検証。

[確認範囲](../obsidian/evidence/sync-conflict-20260930.md)とofficial-sync FAQのリンク化・icloud Git参考文献の1文、article/raw/OG/全metadata/GSC3対象を申告する。元85件・C13/C14六件・C17三件と既存GSC strict条件を保持する。原7件のsource一致と本番比較3件の確認範囲を分け、全サイトbytes・Google登録・CTA・流入増を認定しない。C20はpendingのままで、最終exact-head通常CI・main merge・対応Pages成功・実本番readbackまで完了としない。現在の残件数を減らさず、既存owner/停止/窓/契約を保持。Company prospective計測のglobal衝突を解除せず、明示された手動公開として全範囲と公開時刻を別に記録し、自然schedule復旧・Company加点に付け替えない。

### C20の配備後readbackと元キュー完了（2026-10-01 JST）

PR1783 finalhead935ac0960605dc91de1727b25c7fe5ab5a8fce3cの通常SEO36751347416/job110010481154は147steps（146success/0failure/IndexNow main-only skip）で成功。main57f8440d292d506707688d373c2c94d50beb0f5cへ2026-09-30T17:37:26Z通常merge。初回production GSC36752740802/job110015199923（source同57、観測17:37:54.849Z）はC20三404・先行九pass・元85skip85でfailure、artifact11115173232/ZIP SHAcab993cc0ae06c338636ed3efd953598a3c747e49a51d88da24cdda21c9aeb2eを保持。対応Pages33c63cf6/check110018671517は17:46:11Zに同57で独立success。前のin_progress照会や別4d51c27dの履歴を上書きせず、起動者・stage logs不明、rootからdispatchなしを区別する。

通常の上流PR1784のmainf38bf04d57107fac003dde6b5114ddc63e78f4adではC20記事/raw/OG九file不変。後続strict GSC36754462880/job110021050459（source同f38、観測17:52:16.161Z）は元85+追加12全pass、0fail/0skip。C20 HTML200（17:52:22.079Z）、resolved MD251bytes/SHA69d3ace2d907d3d548a1fe592e3f64e82fbd0a2c09bab5533cf61251b485f1a5（17:52:22.529Z）、reopened PNG43494bytes/SHA328b600802b5641ffd3642e5e885c31bff9bdfaabbbbdd1d819b90d6d911f6a9（17:52:23.024Z）一致。success artifact11115568270/ZIP SHAee3d795029530656e8b2dc289d2cd9099bbf2cecd26530a134da220be06b1b32。上流PR1781/1782/1784の独立した保護ページ・他URL/日付更新を保持し、C20による変更へ帰属しない。

この原記事の実配送確認でC20の元title/unique_value/evidenceを保持しdone記録を準備、残19（pending17/blocked2）。このqueue/evidence/audit三filecloseoutの最終CI・対応main merge/Pagesは記事本体と別に確認する。原7source一致・本番raw2bytesとHTML条件を分け、全サイト/全文/全assets・Google登録・CTA・iOS/SimpleMemo・同期/生産性・流入改善は認定しない。既存owner/停止/評価/契約を維持し、Company無人率・自然schedule復旧へ加点しない。詳しくは[元実証と配備経過](../obsidian/evidence/sync-conflict-20260930.md)。

### C26のグラフ表示操作候補（2026-10-01 JST）

原キューのノート増加による時系列を、別fixtureの6/3→7/4として実GUI保存と元Markdownで確認。C17の理由つきリンク・索引とはglobal/local表示条件のhow-toを分け、path/tag/Orphans/Groups/native色/Depth1・2を九つの固定ケースで確認した。42assertions/87原本file、原7PNG/7MD相対パス・派生ZIP・OGと有限私的品質93/100、4幅・実download8件・FAQ4・原文code1・Next stepを保持する。API補助値・設定overlay・初回readout訂正を明示し、全graph条件・大Vault・Sync/SimpleMemo・速度/生産性/流入の検証へ広げない。

[確認範囲](../obsidian/evidence/graph-view-20260930.md)とZettelkasten/second-brain各1文、article/raw/ZIP/OG/evidence/全metadata/GSC3対象を申告。元85ケースとC13/C14/C17/C20の12比較を保持し、C26のHTML・追加メモ92B・local-depth-2 PNGだけを追加する。先行GSC修復・workflowを重複導入しない。C26のtitle/unique/status:pendingと全既存owner/停止/評価/契約を維持し、最終HEAD通常CI・対応main merge/Pages・実本番readbackまで完了としない。Company prospective global衝突は免除せず、policy42の明示された手動公開として全範囲と実公開時刻を別に記録する。流入倍増は同定義の成熟計測待ちで、Company無人率・自然schedule復旧へ加点しない。

### C27のCanvas操作候補（2026-10-01 JST）

Linux1.13.7・著者作成の隔離Vaultで、空Canvasから短文2/参照Markdown1カード・接続1件/ラベル・移動/resize Undo・保存/同一process再表示を九つの固定GUIケースで確認。原32assertions/70file・原4PNG/612B Canvas全文/214B MDと相対パスを保持し、派生2member ZIPは原本の代替としない。品質93/100は有限私的評価で、実4幅/download3件/FAQ4/full612Bcode/Next stepを確認。C17理由つきリンク/C26表示条件とはカード操作で意図を分け、Canvas接続を内部リンク・知識・生産性へ読み替えない。

[確認範囲](../obsidian/evidence/canvas-20260930.md)、C17/C26各1文、article/raw/ZIP/OG/evidence/全metadata/GSC3対象を全申告。元85ケースと既存15比較、dynamic集計2箇所/strict伝播/workflowの先行修復を維持し、Canvas HTML/元Canvas/reopened PNGだけを追加。元キューtitle/unique/status:pendingと全owner/停止/予算/評価/契約を保持し、通常CI・対応main merge/Pages・実HTTP readbackまで完了としない。C26doneは元依存条件ではなくinbound実sourceのみ必要で、Next stepは公開済みC17。policy42の明示された手動公開として全範囲・実公開時刻を記録し、Company global衝突を解除せず無人率・自然schedule復旧へ加点しない。全機能/大Vault/アプリ再起動/Sync/他端末/SimpleMemo/速度/生産性/流入は未検証で、倍増は同定義の成熟計測待ち。

### C26の一次配信とC27の同時ソース準備（2026-10-01 JST）

C26の原キューを、実際に確認した一次記事配信に基づいてdoneにします。元title・unique_value・publication_noteとowner/停止/窓/予算/契約は保持します。C27はpendingで、この同時台帳closeout/記事準備の最終CI・main merge・対応Pages・本番readbackは別工程として未完です。

[PR #1790](https://github.com/simplememofast/simplememo/pull/1790) final head `3901319551fcef5568b7b346d044306d62056717` の通常SEO run36760940643/job110043007417 は146success/1main-only IndexNow skip/0failureです。通常mergeはmain `afdae7d0603acc964b372f1a46c56dfec6742c6d`、UTC 2026-09-30T19:00:04Z。その対応Pages deployment 4254da31-f309-411b-ad8e-2c3fbdf8915d/check110048767006 はUTC 2026-09-30T19:00:33Z にsuccessです。branch previewを本番配信証拠へ読み替えません。

実strict production run36763192137/job110050684023、source `207cb6fbb56a1bb18cdf5af99e3f71f0ddadc48b`、UTC 2026-09-30T19:06:07.005Z は元85ケースと既存15比較すべてpass、0failure/0skipです。C26 HTML200（観測UTC 2026-09-30T19:06:13.380Z）、元追加メモ92bytes/SHA256 `353b4739dbd144b7ed9ad5b1046e8f58ec3b805ae540412b1d8a1d56ae7ae39c`（観測UTC 2026-09-30T19:06:13.686Z）、元local-depth-2 PNG 44197bytes/SHA256 `d1dab655467e20e8e6538084fc75da8a154b374231ebc76e2393e7cc4b050663`（観測UTC 2026-09-30T19:06:14.019Z）を確認しました。

artifact11118549990 archive digest `sha256:968c39d3511701b612799e32668f5bfc76d6388cf2c6b9f49057df87aa9250cd` と、実parsed report SHA256 `57a1939785b6ea311ceca0161c50d7dba67c0fbb1ee90cfe762a8484e707d8f6` を区別します。原GUI receipt/evidenceのSHAも別の証拠です。C26の全14原assetsはsource同一性を確認し、実HTTP bytesの確認はこの2原assetsに限ります。HTML全文・全assets・ZIPの読者import・全siteの配送、Google登録、AIO引用、CTA、速度/生産性/流入は認定しません。

初期ローカルpreflightの4環境失敗と通常環境218/218成功、actual reader12/download8を私的履歴で保持しました。元証拠文書の全本文と、この一次配信proofのprior_failures 0件を削除せず、後続successで置き換えません。


Linux著者作成例の6/3→7/4、有限global/local表示操作、補助API/overlay/訂正sidecarと実GUIを区別します。有限品質93は検証範囲を広げず、Not verified/verified:null/testedSimpleMemoVersion:nullを維持します。C27カード操作とは意図を分け、全graph条件/大Vault/別OS/端末/Sync/SimpleMemoは未検証です。policy42の明示manual公開で全22変更を申告し、13Company global衝突、既存owner/停止/窓/予算/評価/契約を免除しません。Company無人率・自然schedule復旧はfalse、10月流入倍増は同定義の成熟計測待ちです。

この同時ソース準備でのqueue残数は18（pending 16、blocked 2）です。C27はpendingで、このcloseout/記事準備自身の実配信確認は別に残します。

<!-- C26 primary delivery / C27 combined source closeout END -->

### C18のAIプラグイン経路表候補（2026-10-01 JST）

公式固定Copilot4.0.12/Smart Connections4.7.2/Text Generator0.8.7の24ranges/14files/579linesをhash/bytes/原引用で照合し、staticprivacy経路表と派生24引用JSON/編集OGを準備。private品質90/100、4幅/FAQ5/9引用controls/実download/1NextStepを保持。静的分岐・提供元説明・runtime未確認を分け、SecretStoragegetterから実暗号化、local説明からzero-network、clipboardflagから実payloadを主張しない。plugin/providerGUIや有料呼び出しは静的表の要件としない。

[根拠と全範囲](../obsidian/evidence/ai-plugins-sources-20260930.md)、QuickAddの既存AI未検証context後1文、全14filesを申告。元85ケース/既存18比較/dynamic2集計/strictgate/workflow修復を保持し、C18HTML/派生引用JSON/編集OG3対象だけを追加。元キューtitle/unique/pendingと全owner/stop/budget/window/contractを保持し、policy42manual公開をCompany global衝突解除・無人率・自然schedule復旧へ読み替えない。通常最終HEADCI/mainmerge/対応Pages/本番readbackまで完了としない。AI-tags自社機能/QuickAdd実Captureと意図を分離し、保護hub/ownedpages不変。実通信/backend/全依存/他端末/速度・生産性/流入は未検証、10月倍増は同定義の成熟計測待ち。

### C27の一次配信とC18の同時ソース準備（2026-10-01 JST）

C27原キューを、実際に確認した一次記事配信に基づいてdoneにします。元title/unique_value/publication_noteとowner/停止/窓/予算/契約は保持します。C18はpendingで、この同時台帳closeout/source準備自身の通常最終HEAD CI・main merge・対応Pages・strict85+21readbackは別工程で未完です。

[PR #1794](https://github.com/simplememofast/simplememo/pull/1794) final head `73658fa98f59797efdb5b5a8a8eb05a1a50b4825` の通常SEO run36765929655/job110059964479 は146success/1main-only IndexNow skip/0failure。実normal squash main `05ecaa962890d39188e10da99aaca5bbd28f38cc`、UTC 2026-09-30T19:43:52Z と実first-parent/source22/21nonJA、割当JA3行・他のfresh upstream行の保全を確認しました。remote headのmain祖先を要求せず、実PR REST/GitData/public author/treeとcommitted source同一性を区別します。

対応main Pages deployment 65de4b0d-9a2f-46f8-8e79-4de8c441bf22/check110066089512 はUTC 2026-09-30T19:44:24Z にsuccess。実strict production run36767719921/job110065983501、source `05ecaa962890d39188e10da99aaca5bbd28f38cc`、UTC 2026-09-30T19:44:21.762Z は元85と既存18比較すべてpass、0failure/0skipです。C27 HTML200（UTC 2026-09-30T19:44:29.604Z）、原Canvas612B/SHA256 `9b5a184035c68dd36440e332450ffa98ba805c44a0fb5a865e3a347de31fe807`（UTC 2026-09-30T19:44:30.043Z）、原reopened PNG71395B/SHA256 `e49b9c964380ceb952de4b2df79866974c34e053cc02ff0539da93290c518c2b`（UTC 2026-09-30T19:44:30.529Z）を実読取しました。branch previewを本番へ読み替えません。

reportのobservedAtはレポート開始時刻で、Pages完了時刻や各HTTP観測時刻とは別です。C27 HTML・Canvas・PNGの実observedAtはすべて対応Pages success後であり、元reportのtimestampは書き換えません。

artifact11121557273 archive digest `sha256:5dcc8e813e74d47b41170fae1413ad92ef3cc4bddbf4efc2e3d0f6c5f4bb6791`、実parsed report SHA256 `e9b4e7e1529290ad9ce29505120746d874b71793f38ad3f8334e0638f9b0dde5`、原GUI receipt52bd5756は別の証拠です。source原6assetsとZIP2memberの保全、本番比較のCanvas/PNG2原assetsのbytesを区別し、HTML全文・全assets・ZIP読者import・全site配送やGoogle登録/AIO引用/速度/生産性/流入は認定しません。

原Linux著者fixtureの九つの有限GUIケース、32assertions/70原本＋receiptの71manifest、品質93、local reader12/download3/FAQ4/full612B/実inbound2/Next1/正常218を保持します。bootstrap/readonly補助と実GUI、resize Undo・カード内scroll・同一process再表示とapp再起動未検証を区別します。C26の元done rowと同時closeout evidence/sourceを、PR1794の実source配信gatesで再照合しました。過去観測を後続successで上書きせず、prior_failures 0件を保持します。


全15変更はpolicy42明示manual公開として申告し、Company global13衝突と全既存owner/stop/budget/window/契約を免除・変更しません。Company無人率・自然schedule復旧はfalse、Codex実費不明を0とせず、新支出・秘密値・provider/依存・送信者identityを追加しません。10月流入倍増は同定義の成熟した月次計測待ちです。

この同時ソース準備での残キューは17（pending 15、blocked 2）。C18はpendingで、今回のcombined closeout自身の実配信確認も別に残します。

<!-- C27 primary delivery / C18 combined source closeout END -->

### C32の三方法バックアップ復元候補（2026-10-01 JST）

元title/unique/pendingを保持。Linux著者作成例の実Git旧blob新path/GUI、実coreFileRecovery自然snapshot/古い本文Restore/保存/再表示、同filesystem保管庫外3MDcopy/別folderrestoreを確認し、original26/28とsupplement30/46を区別。三方法uniqueは局所範囲で充足しphysical/cloudmandatorygateを追加せず、独立装置・災害/故障/長期保持/全Vault設定添付は未検証。品質92/100、4幅/8実download/4FAQ/full原code/1NextStepと原8PNG/8MDを保全。

[根拠と全範囲](../obsidian/evidence/backup-20260930.md)、C20原文保全context後1文と全29filesを申告。C21未公開原稿には依存せず保護hub/pricing/sync/vault/ownedpages不変。元85/既存21GSC比較/dynamic2/strict/workflow修復を保持し、C32HTML・原復元MD・actualFileRecovery原PNG3件のみ追加。旧JSON/order/metaとowner/stop/budget/windows/contractsを逆変換で保全し、manualpolicy42をCompany全範囲衝突免除/無人率/自然schedule復旧へ読み替えない。通常finalHEADCI/対応mainmerge/Pages/本番readbackまで未完。provider/remote/mobile/iOS/SimpleMemo/速度・生産性/流入は未検証、10月倍増は同定義の成熟計測待ち。

### C18の一次配信とC32の同時ソース準備（2026-10-01 JST）

C18の一次記事はPR1795 final head `a2f8b205e17f9ba7f58c03f365aae73a2a64a3d7`、main `c1159d578d886752de5b2b0ac8be667ddba1adb0`（merge `2026-09-30T20:25:06Z`）、通常SEO run `36771143039`/job `110077553321` 146 success/1 main-only skip/0 failureで確認しました。対応main Pages `f95071e3-a282-4fd7-ad17-b6fd924b710a`/check `110082245647` success `2026-09-30T20:25:33Z`、ordinary strict run `36772504472`/job `110082152854`、source `c1159d578d886752de5b2b0ac8be667ddba1adb0`、元85＋順序付きpublication21は全pass/failed0/skipped0です。

report開始 `2026-09-30T20:25:33.928Z` と各HTTP観測を区別します。parsed report SHA256 `d4a42737b8a957532b05560e284d853154014fe15ba348f0077498373fc15b61`、artifact `11123728476`/ZIP digest `sha256:315267dbf062bd5e1f0a248b834bad1dfa4be7eb844bb15e08cdf45ac61dca2d`。
- `/obsidian/ai-plugins/` HTTP200 `2026-09-30T20:25:42.630Z`
- `/assets/downloads/obsidian-ai-plugins/source-quotes-20260930.json` HTTP200 `2026-09-30T20:25:43.023Z` / 44287 B / SHA256 `cb8faf1dde375bd5a4c7091a0a25d291a67d254f23d3b0b07a9561b0fe50c6fa`
- `/assets/img/og/obsidian-ai-plugins.png` HTTP200 `2026-09-30T20:25:43.530Z` / 71985 B / SHA256 `8b804039331978203be33553a521da463c3cc0da87b9963dae5a872bbe414b63`

固定24引用/14file/579line、ソース準備15path、private品質90、2page×4幅/FAQ5/9引用controls/JSON実download/Nextを保全。初回preflight未登録clusterと原文末尾空白checkを履歴として保持します。資料/コードのstatic reviewとplugin/provider runtimeを区別し、送信先・鍵保存・clipboardの実通信/暗号化認証、mobile/SimpleMemo/同期/速度/生産性/流入は未検証です。

今回の30pathはC32 component29＋既存C18 evidence1（coverage/audit共有）。C18の実一次配信に基づく元pending→done記録とC32のpendingソース準備を合わせ、今回自身の最終CI/main/Pages/85+24実readbackは別に残します。全owner/stop/budget/windows/契約、Company global13衝突、manualpolicy42を保ち、Company無人率・自然schedule復旧へ加点しません。新支出・秘密・送信者identityなし、実費unknown、10月倍増は同定義成熟計測待ちです。

<!-- C18 actual primary / C32 combined source END -->

## 残る依存関係

1. 同一条件のGA4歴史データと既存私有受領書。BigQueryの部分月やGSCを主指標へ代用できない。
2. 主要導線の本番ブラウザ操作・全サイトの配信バイトを確認する既存実行経路。元85 URLと追加9対象のHTTP結果は、それぞれの検査範囲を超えた証明の代用にしない。この環境のネットワーク制限を回避しない。
3. 実験のpost窓と評価日。未来の測定が必要で、経過時間だけを実行証拠にしない。
4. 既存日次`actions` ownerの導出停止と、9月30日承認の次回自然起動限定の復旧許可。手動Goalから再開・再分類・成功認定しない。

これらの依存関係を残したまま独立した修理を進める。10月の倍増は未達成・未判定であり、デプロイや監査完了だけでは達成扱いにしない。
