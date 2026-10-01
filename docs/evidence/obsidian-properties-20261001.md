# C25 PropertiesとDataview：有限GUI例と私的記事候補

公開前の候補です。原キューC25 `/obsidian/properties/`、題名「Obsidianのプロパティ（frontmatter）活用ガイド」、unique「実機検証＋Dataviewとの接続例」を保ちます。既存C12 `/obsidian/plugins/dataview/` は一般的なDQL・インライン式・JSの説明で、GUI動作未確認を明記しており、C25は入力UI→保存YAML→同じ記録の実クエリ結果に範囲を分けます。既存記事を編集せず、次の導線をoutboundのみ追加する候補です。fresh full intent/owner/openPR確認と公開admissionはrootの別検証です。

## 原本の範囲

UTC2026年9月30日、日本時間2026年10月1日のLinux Obsidian1.13.7実GUI。事前九ケースを固定し、一回の隔離Vault起動でp01–p08の値・query・save/reopenを確認しました。p09はGeneral再表示と終了Close要求の記録があり、**Obsidian childの終了codeは未確認**です。全九ケース完了としません。

原receipt SHA256 `e1fb7bbcfbc62e6fd8222906455be7c3f60c3f4708a1ed1c62dbc8dcb3fe1d45`、33有限assertions、129 receipt.files。別manifestはreceipt自身を含む130 entriesで、自身を再帰hash範囲に含みません。原Markdown before/stage/final、query、26rawPNG/DOM、固定source/配布assets、失敗driver/log、終了記録、runtime scripts、最終.obsidian設定/プラグインを含み、runtime cache/data/tmpは除外します。凍結後と記事準備後の129/130 bytes/hashは一致。同じ担当の保全チェックで、別担当の独立レビュー完了ではありません。

再利用した公式Obsidian1.13.7 AppImage SHA256 `e0d8e0a611624de8c9c7dcd8a9e648279fb0a0d552faa1312b7e4f3a5fa72663`。assetsは既存proofからread-only参照、DISPLAY82/CDP9233の専用プロセスとVaultを使いました。他のDISPLAY/CDP/全既存proofは操作していません。

## Dataviewのsourceと版の差

公式blacksmithgu/obsidian-dataview releases/latestはstable0.5.70、2025-04-07公開、prerelease/draft false。tag0.5.70はcommit `77ab745aee787d519642a87ed8f68be12fdc4b0d` に固定。しかし同tag/source/配布manifestのversionは**0.5.68**で、実Community plugins UIも「Dataview v0.5.68」。minAppVersionは0.13.11です。release labelとinstalled manifest/UI版を混同せず、現代Obsidian全版互換性や現在の開発活発度へ広げません。

release main.js2377634 bytes SHA256 `6bb1cf7010afad830e73575fca0e2bfbd3279c562e3d9d24f2d2f45161eb7d00`、manifest357 bytes SHA256 `9235db47112da81b85591c79ecb9ae2574e5e72207056e976472f90616286185`、styles.css2965 bytes SHA256 `3306dd9032e00f989ba7233a37fd255bc4d3f4340cee661762e952f3f6aa1de9`。approvedGitHub release assetsを保存し、隔離Vaultにbyte-copyしました。manifestはpinnedsourceと完全一致。bundleを自分でbuildしsourceから再現した証明ではありません。

Dataview README、manifest、frontmatter annotation、TABLE/LIST query types、WHERE/SORT commands、main.tsと、Obsidian Properties/Community pluginsの計八資料は固定Gitblob原bytesで保存・照合。help pinは `9cf8c2913e56830e75c13f33ba198d7e70b6d9ef`。Dataview MIT LICENSE.txtも原1070 bytesを保存し、固定Gitblob `4b08f3a72f04a54b2e9a89308bf9b0656b2b8a74` と一致。初回licenseコピーのterminal trim差は保全し、別filenameのexactUTF8原sourceへ訂正、freeze初回assert失敗とともに記録しました。

コード/設定/注釈・query形式を事前に読んだ確認で、プラグインの完全なsecurity auditではありません。初期plugin copy/settings/fixturesは直接setupで、UI Browse/Installの成功を主張しません。実Trust author and enable pluginsを押し、enabled-stateはmain windowのread-only helperで照合。DataviewJSとinlineJS optionsfalseをpreseedし、read-only settingsで確認。DQL本文入力とproperty変更は実GUIであり、API property/query/DB writesはありません。browser HTTProuteは各scriptのブロック記録を残しますが、全Electron/process外部通信ゼロの証明ではありません。

## 著者fixtureと実操作

初期三件は直接作成した架空recordで顧客dataではありません。Aはstatus未着手、donefalse、due2026-10-01、tags検証、priorityなし。Bは進行中/priority2/donetrue/due10月4日、Cは完了/priority1/donefalse/due10月5日。querynote初期は見出しのみです。B/C初期内容をGUIで書いた主張にはしません。

実explorerからAを開き、型icon→Property type submenu→Textでstatusを進行中へ。Add property、priority key、型Number、3入力をGUIで行い保存YAMLに一致。checkbox false→true→false、Date10月1日→10月3日、Tagsへプロパティ追加。Tagsの初回Enterは確定しなかったため、focused inputでEnterとblurをやり直し保存を確認しました。最終Aの型DOMはtext/tags/checkbox/date/numberの五つです。すべての型、全datevalidation、bulkediting、nestedpropertiesは検証していません。公式資料に同propertynameはVault共通型と記載されていますが全fixture型操作の独立試験とはしません。

querynoteへ実editor click/Control+A/keyboard.insertText/Control+Sで三DQL blocksを入力し、保存472 bytesはplanned sourceと完全一致。Reading viewのTABLEはstatus進行中のA/B二件、priority3/2、donefalse/true、due10月3日/4日を実DOMで確認。LISTdonefalseはA/C二件、LISTstatus保留は「Dataview: No results to show for list query.」で対象なしを確認しました。

A checkboxをGUIでfalse→trueに変更するとTABLEはA/B二件のままAのdonetrue、LISTはC一件になりました。after rawPNGではtable/listが両方見えます。explorerでAとquerynoteを再度開き、保存bytes/hash一致。同じ起動中で、wholeapp restart/別端末ではありません。最終Aは211 bytes SHA256 `4e32d4e5949d648848a1faa0625268685316176373b85688821c3d28e26bbb4c`。rawdownloadsはこのdonetrue最終stateで、初期falseの状態のファイルではありません。

## 失敗、試行数と終了の不足

最初のhelperはSettingsのdefaulttabをGeneralだと誤認し失敗、別Settingswindowにはglobal appがないhelper参照でも失敗。型iconのmenuにはProperty type submenuが必要、Communityplugins文字はnavigationとgroup二件ありselectorも訂正。空のAdd propertyはsettingsfocus移動で消えたため再度実クリック。全元driversとproduced PNG/JSON、redirected failurelogsを保全しています。初回p01stderrは当時の実CLI errorをsidecarへ記録し、元stderrfileはないと区別。元失敗PNG/JSONを再生成していません。

原計画automated_observation_attempts_max12の範囲を明確にしていませんでした。persisteddriver八件とinlineGUIexploration五件を合計すると13で、広くコマンドを数える解釈では一件超過です。この不足を隠さず記録し、新fixture/ケース/GUIsessionを増やさず追加GUIを止めました。planned/actualGUI sessionは一回、finitecaseの種類は九のままです。attemptbudget合格assertionはありません。

変更前TABLEをDOMで確認したとき、スクロール位置のrawPNGは表より下でした。LIST二件はrawPNGで可視、変更後TABLE二件/LIST一件はrawPNGで可視です。beforeTABLE画像の独立可視確認を主張しません。どの原画像も加工/再生成/置換していません。

最後のGeneral実UIを保存後、holderへPTY SIGINTが入り、実titlebar Closeクリック要求を開始。PTYgroupへもsignalが届き、Xorg exit0が先に記録され、holderが終了するためObsidian child-exitcallback/正確なcodeは記録されていません。従ってCloseのみでappがnormalexit0したというassertionはありません。自身のCDP9233接続はclosed、Display82 lock/socketなし、ownprocessなしを確認。再起動して失われた終了原証拠を埋めていません。

## 提案する原本と記事候補

rawPNG四件と最終savedMD四件のcandidatecopiesはfrozenoriginalと同bytes/hash。入れ子の記録folder/fullpublicaliasを保持し、queryFROMに対応します。sourcebefore/stage/intermediate、plugin実行assetは今回公開候補に入れず、導入・取り込み成功を推測しません。

| 保全元 | 提案公開パス | bytes | SHA256 |
|---|---|---:|---|
| `evidence/screens/p03-number-saved.png` | `assets/img/obsidian-properties/properties-number.png` | 44365 | `712af91db2128914d1080f57d539ebfeac88a7835bd58bb958155ab1ef371538` |
| `evidence/screens/p08-property-reopened.png` | `assets/img/obsidian-properties/properties-final.png` | 48685 | `d8727e77f4b4921ef195a522897d756e2329e81c013b1097c965d29ed4a03387` |
| `evidence/screens/p06-list-reading.png` | `assets/img/obsidian-properties/dataview-before-list.png` | 36276 | `5fad7a748fdc9eeaa44577095fab13b97b3f32cbd128bc076c9b00c3552554cf` |
| `evidence/screens/p08-updated-reading.png` | `assets/img/obsidian-properties/dataview-updated-results.png` | 63937 | `c7e087be8831d7399ea696ae0adeab21ba61677a71ddfdc137adde3bb99ce6c8` |
| `evidence/inputs-after/記録/調査A.md` | `assets/downloads/obsidian-properties/記録/調査A.md` | 211 | `4e32d4e5949d648848a1faa0625268685316176373b85688821c3d28e26bbb4c` |
| `evidence/inputs-after/記録/調査B.md` | `assets/downloads/obsidian-properties/記録/調査B.md` | 152 | `9ccaa81caf6d9cf78d0d83c380c47953cdb33e3c362ffc4a74a5cef75f56bc46` |
| `evidence/inputs-after/記録/調査C.md` | `assets/downloads/obsidian-properties/記録/調査C.md` | 150 | `baf31c6a23bd01100140254ca6ddbb65a2a5f9d615b3af34241e961017146ded` |
| `evidence/inputs-after/一覧.md` | `assets/downloads/obsidian-properties/一覧.md` | 472 | `f2c988993f9c76d7efb9aead697f02b811fc11b68f6e16169914f47d29d82278` |

編集OGは既存HTMLgenerator/localfontsを使った新規1200×630ChromiumPNGで、GUI原画ではありません。405689 bytes SHA256 `498dd6fdd387e4e47efed2caf1df59521481e52f9f49f5fc1a928f3dbd402024`。title/brand/YAMLglyphを目視し、DOMglyphboundsが80px枠内であることも確認。

## 私的記事の有限QAと未完

候補記事を実Chromium localhostで320/390/768/1440の四幅、1H1、canonical/title/description、Article/Breadcrumb/FAQを検査し、候補のconsole/page/resourceエラーと横はみ出しなし。raw四PNGをloaded確認、FAQ四件を実openしてschema4/4一致、保存211B全文codeは原Aと完全一致。四Markdownを実downloadし、names/bytes/hash一致。既存C12へactualnextclick200、HTTP本文bytesはread-only既存source一致。既存C12が要求したAhrefs解析JS一件を送信前blockし、candidate四幅エラーへ混ぜずreference scopeに記録。C12 sourceは編集していません。

own8875serverはSIGINTを処理してexit0で終了。品質86/100は私的記事/QAの評価で80閾値を満たし、終了code不足・attemptbudget不足を除外していません。品質評価は公開proofgateの代わりではありません。rootの独立rawPNG/source/receipt照合、p09とbudgetgapのadmission判断、freshfullintent/owner/PR、publication dates/evidenceURLplaceholder、metadata/index/inbound、通常CI、merge/Pages、実公開HTML/元assetreadbackは未完です。queue/台帳を完了にしません。

protectedC26/C27/C28候補は全filehash不変を再照合。rootrepo/metadata/owner/branch/ref/PR/Companyは変更なし。新deps/account/key/paidprovider/identityなし、費用unknown。iOS/Sync/SimpleMemo/security全部/大Vault/performance/生産性/SEO因果は未検証。10月倍増は同定義の成熟計測待ち、Company無人率・schedule復旧へ加点なし。


## Read-only publication source component

Selected source b33101672d93db3923e64267fa3dfda82149f360 tree 7ce3ac2f928d42960fb934ebc9d9f3ef0cc86df1 is source preparation, not delivery. Candidate calendar 2026-10-01 JST, ISO 2026-10-01T00:00:00+09:00 and GitHub main evidence URL https://github.com/simplememofast/simplememo/blob/main/docs/evidence/obsidian-properties-20261001.md require root timing/publication resolution. Original proof dates, authored IDs, every code/raw pixel/download/OG and old QA remain unchanged. Linux Obsidian1.13.7の一回の隔離起動で、架空三ノートのProperties五型・保存YAML・DQL TABLE2/LIST2→1/対象なし・同一起動内再openを実GUI確認。release tag0.5.70と配布manifest/UI0.5.68を区別。直接manual asset配置後の実Trust/enableでありBrowse/Installではない。8 persisted+5 inline=13観測、原max12との差・p09 exact app exit未記録・beforeTABLE PNGのscroll不足を保持。全型/datevalidation/wholeapp restart/iOS/Sync/SimpleMemo/security/performance/生産性/流入未検証。

Original title “Obsidianのプロパティ（frontmatter）活用ガイド” and unique “実機検証＋Dataviewとの接続例” remain pending; no mandatory12-properties or freshpricing/account/hostedPublish gate is added. Combined scope is measured22 new + existing explanatory contexts2 + sharedsupport9 =33; individual21 descriptions would double-count sharedsupport. Prior actual root review retains recorded private quality86, raw views and operational gaps; no new independent scoredquality or QA rerun is claimed. The selected context has directowner0, but fullsupport Company13 global conflicts remain unwaived. Manual policy42, originalowner/window/stop/budget/value contracts and priorJSON rows/order/meta are exact under inverse. Graphhigh matches unchanged businessRelevance1 while verified=null, verificationType=Not verified, testedSimpleMemoVersion=null remain distinct from Obsidian/Quartz proof.

GSC only adds six representatives for C25/C28 (HTML, original PNG, original MD each), ordered36→candidate42; original85/strict/propagation/dynamic checks are unchanged under whole-file inverse. JA adds only two candidate URLs and two context lastmods; no other queuecloseout/admission. New GUI/browser/build/npm/URI/oldQA/OG/network/rootwrite/ref/PR/Company changes0. Rootfresh fullsource/owners/openPR, normalfinalCI/main/Pages/public HTML and allraw8+OG per article readback remain separate. Actual spend/budget unknown; no new paidprovider/account/key/identity. Missingbaseline is not0; source preparation does not claim natural selection/schedule or October traffic effect.
