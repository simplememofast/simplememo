# C28 Publishと代替：Quartzの有限ローカル実ビルドと記事候補

公開前の記事候補です。原キューC28のcanonicalは `/obsidian/publish/`、独自価値はQuartzのこの環境での実ビルドです。予備連絡のpublish-alternativesというURLは原キューと異なり、採用していません。既存料金記事は料金整理の範囲で、Quartzの実生成と配信先の比較とは分けています。repo・owner・metadata・inbound・branch・PRは変更していません。

## 原本のreceiptと範囲

実行UTC日付は2026年9月30日、日本時間は2026年10月1日です。事前に七ケースを `evidence/pre-build-plan.json` へ固定し、段階的な補助の訂正・限定追加の前には `evidence/pre-amendment.json` を固定しました。最終31 assertionsはtrue、receipt.filesは111ファイル、manifestはreceipt自身を含む112 entriesでmanifest自身は再帰範囲に含みません。

凍結receipt `evidence/verification-receipt.json` のSHA256は `1616adf98c323472b00b44ea2c476dfa875f40a9d51a880ff5ff9bd0f0116b17`。記事準備後に111原本と112 manifest entriesをbytes/hash再照合し、不一致はありません。同担当による保全チェックで、別担当の独立原本レビュー完了を意味しません。C26候補18件、C27候補10件も凍結manifest/各ファイルのhashを再照合し、変更はありません。

receiptは公開source archive、source/公式資料/比較記録、fixture、二回の生成物、原PNG、logs、scripts、selected installed lock/依存readoutを含みます。node_modules/npm cacheとruntime内の重複framework全体はreceipt.files外で、固定source archiveとlock・installed metadataを記録しています。実配信HTTPのhash証明ではありません。

## 固定したQuartzソースと実版

公式jackyzha0/quartz v4ブランチを観測し、commit `d25a6eabf96751ffca56f8a8139272def7a65041` に固定しました。package versionは4.5.2。releases/latestの返したv4.0.8は2023年の古いrelease情報で、現在のソース版として扱っていません。tag一覧のconnector経路は400で、取得成功にも新しいtagの存在証拠にもしていません。

codeload source archiveは13106229 bytes、SHA256 `40c17cdb5e6bbd39850171c9d83acd74dcae9266cb6fba17bc41607682fb8ce7`。README、MITライセンス、package.json、package-lock.json、CLI bootstrap/handlers、config、docs/index/hostingの九保存テキストはconnector取得とarchive bytesが完全一致しました。sourceの原bytesを保持したうえで、private runtimeのconfigだけ変更しました。

package.jsonのminimumはNode>=22、npm>=10.9.2。実版はNode24.19.0、npm11.9.0、実CLI --versionは4.5.2でした。lockfileVersion3、source lock597 entries、source lockSHA256 `80b89f7c3c7b7bc7b8531fa9096d8fdfdb156e34085856ffccf8500901184d9f`。実隔離npm ciはexit0で491 packagesを追加しました。OS別optional依存などを含むlock entriesとinstalled表示件数を混同しません。lockはinstallと二buildの後も原bytes/hashが同じです。auditを省いた実コマンドで、dependencyのsecurity audit通過は主張しません。

## 著者fixtureと二回のビルド

架空の三日本語Markdown `index.md`、`手順/確認.md`、`参考.md` とSVG添付 `assets/fixture-diagram.svg` を直接作成しました。frontmatter title/tags/固定日付、index→確認→参考→indexのwikiリンク、SVG embedが有限範囲です。顧客データではなく、実Obsidian GUI入力でもありません。fixture日付は設定値で、Web公開日ではありません。

実CLIは `node quartz/bootstrap-cli.mjs build --directory <fixture> --output <generated> --concurrency 1` の形で、実logsには絶対pathを残しています。二回ともexit0、各20ファイルを生成。初回 `generated/` を保全し、訂正後は別 `generated-attempt2/` に生成しました。双方の全20原ファイルをfreeze前と記事準備後に再照合しました。fixture四原本は変更していません。

private設定は日本語locale、著者タイトル、localhost baseURL、analytics null、systemfont、frontmatter/filesystem日付、任意CustomOgImages無効です。source archiveを使い、Git checkout/history/clone/create wizard/syncを実行した結果にはしません。Quartz自身の任意OGは未検証です。

初回の標準Latexは、数式のないfixtureでもKaTeX CSS `https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css` とcopy-tex JSを要求しました。ブラウザーrouteで送信前にブロックし、二件のERR_FAILEDを記録しています。ここをアクセス経路の回避やproxy設定変更で解消していません。未使用Latexをprivate configで無効にし、追加一build/一browser attemptだけを先に固定して進めました。config差分・初回生成物・失敗を保全しています。数学、標準設定の外部通信なし、全Quartz互換性へ結果を広げません。

## 初回の補助失敗と証拠欠落

ブラウザーattempt1はconfig locale ja-JPがHTML langにもそのまま出るという補助の期待値で失敗しました。実QuartzのHTML langはjaで、補助期待値を訂正し、config localeと実languageを分けました。原scriptと当時の `evidence/browser-helper-correction.json` は残っています。

attempt1のfailed JSONはattempt2が同じfilenameへ書いたため、freeze前に上書きしてしまいました。元のfailed JSONは欠落です。再生成・再構成したものを原本として置いていません。実toolのexit/assertion、原補助script、当時の訂正、欠落を `evidence/failed-browser-attempts.json` に正確に記録しました。attempt2はdistinct copy、attempt3はdistinct filenamesに保持しています。これはQuartz製品の不具合や全検査成功の扱いではありません。

## 最終の実ローカル表示

限定したattempt3はPASS。Chromiumで320/390/768/1440pxの四幅を実表示し、frontmatter由来のtitle、著者日本語本文、tag、SVGが読めることと横はみ出しなしを確認しました。入口→確認→参考→入口を各幅で実クリックし、合計12クリックです。実HTML三件、CSS、JS二件、contentIndex、SVGの計八HTTP応答が生成原本とbytes/SHA256一致しました。SVG502 bytesもfixtureの原bytesと同じです。

四原PNGを実際に目視し、本文・リンク・添付の説明と対応させました。グラフ/バックリンクwidgetは写っていますが、その全機能やnode数を別に検証していません。fixture本文にも見出しを書いたため記事題名が重複して表示され、Quartzの全SEO見出し適合を主張しません。参考390原PNGの上部一部切れとscroll位置もそのまま保持しました。

自身のlocalhost8873 server二件は、SIGINTを処理してexit0。別proofのdisplay/CDP/app/serverは操作していません。command/buildの実行はCLI、画面のnavigationは実Chromium click、HTML/DOM/hashは補助読み取りです。PublishサービスやObsidian実GUIとは区別します。

## Publish・GitHub Pagesの公式資料と料金

Publish Introduction/Set upはobsidianmd/obsidian-help commit `9cf8c2913e56830e75c13f33ba198d7e70b6d9ef`、GitHub Pages What isはgithub/docs commit `b93e6c3400d664b49aa87a7b308d87a1dc5157bf` の原blobと一致を確認しました。GitHubのPages plan条件snippetも同commitで取得して保持しました。古いabout-github-pages filenameの404は失敗として保持し、公式directoryから現行what-is pathを特定しました。

公式Publish setupはアカウント/有効なPublish契約の必要性、Introductionはクラウドホスティングの役割を説明します。GitHub公式説明は静的配信、plan snippetは公開・非公開repository条件を示します。実サービス利用・購入・deploy・deliveryを試した結果ではありません。

**現行Publish価格は未確認です。** runtimeの許可hostにobsidian.mdがなく、対応するpublic web connectorも見つからないため公式現行料金を再取得していません。proxy/credentials経路を変えて回避していません。既存の2026年9月9日料金記事は歴史的な二次記録として分け、C28の新しい公式価格根拠にはしません。MITライセンスやGitHub FreeでのPages利用可能条件を、ドメイン・配信・運用・実行費用までゼロという結論にしません。

## 提案する原本公開対応

原local browser PNG四件、author Markdown三件、author SVG一件のコピーは元bytes/SHA256と同じです。入れ子の `手順/確認.md` と添付pathを公開候補に保持します。画像はcrop/annotation/加工/生成し直したものではありません。

| 保全元 | 提案公開パス | bytes | SHA256 |
|---|---|---:|---|
| `evidence/screens/attempt3-quartz-home-1440.png` | `assets/img/obsidian-publish/quartz-home-desktop.png` | 73102 | `549038070036bb009711f295f0ea47bb00dd03b6b836ffcfd86861ce2e7a38d8` |
| `evidence/screens/attempt3-quartz-home-390.png` | `assets/img/obsidian-publish/quartz-home-mobile.png` | 50924 | `3925682678525e1172c3d966304d6c07a314a6280d0d539cea4f251cad682787` |
| `evidence/screens/attempt3-quartz-linked-confirm-390.png` | `assets/img/obsidian-publish/quartz-linked-confirm.png` | 56354 | `bc374051ae928ed0c5663a81e510d5bc13d26786ab7bb88360439a8c3d3cea21` |
| `evidence/screens/attempt3-quartz-reference-390.png` | `assets/img/obsidian-publish/quartz-reference.png` | 53726 | `7fbc82f0a8e030f00ab897e000555651fdd001de1b796f6bd3080807796cbb13` |
| `fixture/index.md` | `assets/downloads/obsidian-publish/index.md` | 340 | `7ae560b23cc6932373a366e86065df5686bb6a4163cbd01fcc2750500db0e04e` |
| `fixture/手順/確認.md` | `assets/downloads/obsidian-publish/手順/確認.md` | 284 | `4679c1f344ea0e05b3d348399edb4e6280891468a71ecaf25dd380964488c6cf` |
| `fixture/参考.md` | `assets/downloads/obsidian-publish/参考.md` | 256 | `cff1aafec032a57ea3ca01c29f8626dfd90b26561bd6636802ab4d921d2f4716` |
| `fixture/assets/fixture-diagram.svg` | `assets/downloads/obsidian-publish/assets/fixture-diagram.svg` | 502 | `6051eeaba8b79b4e478b565f8097706362efea4e7d788d57301a2369db1d1629` |

編集OG `assets/img/og/obsidian-publish.png` は既存HTML/template/localfont/実Chromiumによる新規画像です。GUI/Quartz生成画面の原画像ではありません。1200×630、412866 bytes、SHA256 `9b91786ff141463f3c0596ac3ea169934e669e44136967fb8519ccc52cbf6bde`。初期415509-byte編集OGで小さなMD→Web意匠が80px枠外へ出たため、初期PNGを保全して文字を18pxへ変更しました。OGだけ再生成し、実DOM文字boundsが枠内、実画像title/brandが読めることを目視しました。全記事/原proof再生成はしていません。

## 記事候補の有限プレビュー

実Chromium localhostで候補記事を320/390/768/1440px四幅で表示し、横はみ出し・当該候補console/page/resourceエラーなし、原画像四件、1H1、canonical、title/description、Article/Breadcrumb/FAQを確認。FAQ四件を実際に開いてvisible/schema4/4一致。入口Markdown全文codeは元340 bytesと一致。元Markdown三件とSVG一件の実ダウンロード四件がfilename・bytes/hash一致でした。

次に読む `/obsidian/pricing/` は実クリックし、read-only localhost本文が既存参照元のbytesと一致。参照元は編集していません。その既存ページが要求したAhrefs解析JS一件を送信前にblockし、参考ページscopeとして別記しています。記事候補の四幅エラーへ混ぜず、解析計測/購入/App Store clickの検証にもしていません。記事QAの初期OG hashと修正後最終OG hashは別記録です。最終OG証拠は `qa/final-editorial-og.json` を参照します。

## 未完の公開工程と境界

品質91/100はprivate content/editorial/browser/asset評価、閾値80です。現行価格不明と限られたbuild範囲を減点に含めています。fresh intent/owner/openPRのfull scope、別担当原PNG/receipt/source/hashレビュー、実公開日/検証URLplaceholder、metadata/index/inbound差分、通常CI、対応merge/Pages、実公開HTML/原assets readbackはrootの別証拠が必要です。queue/台帳を公開完了にしません。

Publish subscription/service/公開操作、GitHub Pages/別配信先/独自domainのdelivery、新Quartz remote repo/branch/PR/hosting、数式/任意OG/全Obsidian互換性、大Vault/性能/正式securityaudit、iOS/Sync/SimpleMemo/別端末、生産性/SEO性能/流入因果は未確認です。10月倍増は同定義の成熟計測待ちで、Company無人率/schedule復旧へ加点しません。公開npm依存の隔離追加以外、新system dependencies/paidservice/accounts/keys/送信者identityは追加せず、実行費用は不明です。


## Read-only publication source component

Selected source b33101672d93db3923e64267fa3dfda82149f360 tree 7ce3ac2f928d42960fb934ebc9d9f3ef0cc86df1 is source preparation, not delivery. Candidate calendar 2026-10-01 JST, ISO 2026-10-01T00:00:00+09:00 and GitHub main evidence URL https://github.com/simplememofast/simplememo/blob/main/docs/obsidian/evidence/publish-quartz-20260930.md require root timing/publication resolution. Original proof dates, authored IDs, every code/raw pixel/download/OG and old QA remain unchanged. 固定Quartz d25a6eab/package4.5.2、Linux Node24.19/npm11.9の隔離npm ciと二回の実CLI build（各20生成物）。直接作成三日本語MD+SVGと変更private config、unusedLatex無効の追加計画後、localhost四幅/12内部click/生成8HTTP原本一致。初回失敗JSONの上書き欠落・言語期待値訂正・初期KaTeX要求を保持。Publish現行料金/契約/account/実操作、GitHub Pages/他host配信、ObsidianGUI、math/任意QuartzOG/全機能/iOS/Sync/SimpleMemo/security/performance/生産性/流入未検証。

Original title “Obsidian Publishは必要か — 料金と代替（Quartz/GitHub Pages）” and unique “Quartzをこの環境で実ビルドして手順を検証” remain pending; no mandatory12-properties or freshpricing/account/hostedPublish gate is added. Combined scope is measured22 new + existing explanatory contexts2 + sharedsupport9 =33; individual21 descriptions would double-count sharedsupport. Prior actual root review retains recorded private quality91, raw views and operational gaps; no new independent scoredquality or QA rerun is claimed. The selected context has directowner0, but fullsupport Company13 global conflicts remain unwaived. Manual policy42, originalowner/window/stop/budget/value contracts and priorJSON rows/order/meta are exact under inverse. Graphhigh matches unchanged businessRelevance1 while verified=null, verificationType=Not verified, testedSimpleMemoVersion=null remain distinct from Obsidian/Quartz proof.

GSC only adds six representatives for C25/C28 (HTML, original PNG, original MD each), ordered36→candidate42; original85/strict/propagation/dynamic checks are unchanged under whole-file inverse. JA adds only two candidate URLs and two context lastmods; no other queuecloseout/admission. New GUI/browser/build/npm/URI/oldQA/OG/network/rootwrite/ref/PR/Company changes0. Rootfresh fullsource/owners/openPR, normalfinalCI/main/Pages/public HTML and allraw8+OG per article readback remain separate. Actual spend/budget unknown; no new paidprovider/account/key/identity. Missingbaseline is not0; source preparation does not claim natural selection/schedule or October traffic effect.
