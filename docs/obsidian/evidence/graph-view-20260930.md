# C26 グラフビュー：有限のLinux実操作と記事候補の確認記録

明示されたmanual Goalに基づくC26の公開用ソース準備です。対象canonicalは `/obsidian/graph-view/`。実操作は2026年9月30日UTC（日本時間2026年10月1日）、Linux版Obsidian 1.13.7・インストーラー1.13.7・コミュニティプラグインなしの隔離した著者作成Vaultで行いました。C17・C20の既存完了証拠を保全し、C26はpendingのままです。この記録は原本と私的QAの証拠で、最終HEADの通常CI・main merge・対応Pages・実公開readbackによる配送完了は別に確認します。

## 原本と固定範囲

実GUIの開始前、2026-09-30 16:50:58 UTCに `evidence/graph-controls-plan.json` の九ケースを固定しました。九ケースを実施し、42 assertionsはすべてtrueです。凍結receipt `evidence/verification-receipt.json` のSHA256は `e50ca67bff81f57f9287c8335b0f4af97446f591271cf3f01cf02eb65ce900cd`。receipt.filesは87ファイル、`evidence/verification-manifest.json` はreceipt自身を加えた88 entriesで、manifest自身は再帰範囲に含みません。準備完了時の再照合で87原本・88 manifest entriesにbytes/hash不一致はありません。これは同じ作成担当による保全再照合で、別担当のGUI目視確認済みという意味ではありません。

原画像・保存Markdown・初回readout・訂正sidecarを保全しました。C17の小さな理由付きリンク段階とは別のfixtureと表示操作です。C17・C24原本は変更していません。

## 実際に操作したこと

初期六Markdownは起動前に用意しました。「研究/入口→研究/仮説→研究/検証」「生活/買い物→生活/食事」と孤立.mdの二成分＋孤立です。Open graph viewを実際に開き、Ctrl+N、名前・CodeMirror本文入力で七つ目の追加メモ.mdを作りました。追加メモ→研究/入口を保存し、全体は6ノート/3リンクから7ノート/4リンクへ変わりました。追加メモの全92 bytesは記事内にもそのまま掲示しています。SHA256は `353b4739dbd144b7ed9ad5b1046e8f58ec3b805ae540412b1d8a1d56ae7ae39c`。

| 実操作 | 確認した有限の結果 |
|---|---|
| Search filesに `path:"研究/"` | 研究フォルダの三ノート、3/2 |
| Search filesに `tag:#研究` | 上記＋直下の追加メモ、4/3 |
| Search filesを空欄へ戻す | 七ノート、7/4 |
| Orphansを実クリックOFF→ON | 孤立.mdだけが除外・復帰、6/4→7/4、リンク端点は同じ |
| Groupsでpath研究＋tag生活を実入力 | 研究三ノート、生活二ノート、残り二ノートは非該当 |
| Linux実色選択GUIのRGBへ30/140/220を入力 | 研究色 `#1e8cdc`、生活の割り当て色 `#d6ad5c`、全体7/4のまま |
| ファイル一覧で入口を開き、More options→Open linked view→Open local graph | Incoming/Outgoing ON、Neighbor links OFF |
| Depthを実スライダー操作で1→2 | 入口・仮説・追加の3/2→検証を加えた4/3 |
| ファイル一覧で追加メモを再表示 | 本文・タグ・保存bytesが一致 |
| General設定を実表示、実Close window | app/installer 1.13.7、17:04:45 UTCに自身のapp終了、app/Xorg exit0 |

ノート追加・検索・切替・色・Depthは実GUIのクリックとキー入力です。初期fixture作成、保存bytes/hash、metadata内部リンク、実rendererのノード名・端点・色・実オプションは補助の読み取りです。コントロールやノートをアプリAPI/DOM代入で変更していません。native色選択では既存X11/XTest入力補助を使用しました。

グローバル原画像の設定パネル・狭い表示領域は一部の丸を覆います。6/3・7/4などは明記した実renderer API読み取り値で、画像内に全ノードが見えるとする数え方ではありません。ローカルDepth1/2は設定パネルを閉じた原PNGで、三/四ノードを確認できます。位置や形はレイアウトで、経過時間や知識の程度を示しません。

## 補助読み取りの訂正を保全

初回readoutの `filters.enabled` は標準input.checkedを参照していました。Obsidianの独自checkbox UIではこの値がfalseのままで、ON/OFFを示しません。初回JSON・原PNGは上書きせず、`evidence/custom-toggle-readout-correction.json` に実engine optionsとUIを対応付けました。後続補助は `.checkbox-container.is-enabled` とnative値を分けます。初回のnative falseをOrphans OFFの証拠に使いません。

Global/Localのengineメンバー名の違いで初回readout補助に不足があり、読み取り側だけを修正しました。検索候補が切替クリックを遮った際は実Escで閉じてからクリックしました。xdotool未導入による失敗では色入力は起きず、既存のX11ライブラリで実操作しました。原本・失敗記録・訂正を残しています。

## 固定した公式説明

[Graph view](https://github.com/obsidianmd/obsidian-help/blob/9cf8c2913e56830e75c13f33ba198d7e70b6d9ef/en/Plugins/Graph%20view.md) と [Search](https://github.com/obsidianmd/obsidian-help/blob/9cf8c2913e56830e75c13f33ba198d7e70b6d9ef/en/Plugins/Search.md) は公式obsidianmd/obsidian-help commit `9cf8c2913e56830e75c13f33ba198d7e70b6d9ef` に固定しました。保存文書はconnector応答より末尾LFが一つ多く、本文段落は一致します。`evidence/source/source-text-comparison.json` に差を記録しています。保存文書SHAは保存したファイルの識別子で、Gitblobの完全同一bytes/hashを主張しません。公式説明全項目を実操作したという結果ではありません。

## 提案する原本の公開対応

以下の原PNG七件と保存後Markdown七件は原本bytes/SHA256と同じコピーです。Markdownの入れ子フォルダ相対パスを保持します。公開パスは候補で、公開HTTP応答のhash証明ではありません。

| 保全元の相対パス | 提案公開パス | bytes | SHA256 |
|---|---|---:|---|
| `evidence/screens/g01-global-before-note.png` | `assets/img/obsidian-graph-view/global-before.png` | 42645 | `baa720869970842975f042b88a5e8e685a689623c0c193863508f5b504c2b8cb` |
| `evidence/screens/g02-global-after-note.png` | `assets/img/obsidian-graph-view/global-after.png` | 47251 | `93da66c235d12c810e594593b539c5a50f2f3b0950f21b64183b4a9929a0e3d7` |
| `evidence/screens/g03-global-path-filter.png` | `assets/img/obsidian-graph-view/path-filter.png` | 40718 | `1dce52d3e78b8bb2c15b26c9a3e466fe8c588004ab11b7f546960a900d7fd6d5` |
| `evidence/screens/g07-native-custom-color-chosen.png` | `assets/img/obsidian-graph-view/native-color-choice.png` | 78634 | `65a32aad7de9688cf5946c07ade578a27edbe9cdf3155978bb1b3000830318a4` |
| `evidence/screens/g08-local-depth-1-controls-closed.png` | `assets/img/obsidian-graph-view/local-depth-1.png` | 41533 | `3a0e9bdde8e9087d26ca626339e130b492bf4dad047c4345e40d5b3bf7bc4478` |
| `evidence/screens/g08-local-depth-2-controls-closed.png` | `assets/img/obsidian-graph-view/local-depth-2.png` | 44197 | `d1dab655467e20e8e6538084fc75da8a154b374231ebc76e2393e7cc4b050663` |
| `evidence/screens/g09-added-note-reopened.png` | `assets/img/obsidian-graph-view/added-note-reopened.png` | 46177 | `e579d13e2d27fefd313bf467e666142c2c2492edcfae4cf5aa2a03addc18b422` |
| `evidence/saved-md/after/孤立.md` | `assets/downloads/obsidian-graph-view/孤立.md` | 80 | `8834b4faff644eb018997081f7f56a0e561219017c9aaa3945512fbcd6e983cf` |
| `evidence/saved-md/after/生活/買い物.md` | `assets/downloads/obsidian-graph-view/生活/買い物.md` | 74 | `193a153b4feb0871e95718c83dc3395530bcc947ab1688a2a6c26e88cb5a3ac0` |
| `evidence/saved-md/after/生活/食事.md` | `assets/downloads/obsidian-graph-view/生活/食事.md` | 71 | `1081ae04ecfa3ced8cd1319273b2c56088992ac72156688e3a843ebd358f0d1c` |
| `evidence/saved-md/after/研究/仮説.md` | `assets/downloads/obsidian-graph-view/研究/仮説.md` | 86 | `aa3e8bbb46e6696d3bdd02419327653c3275379d2ba53a41c6773cce517c9e18` |
| `evidence/saved-md/after/研究/入口.md` | `assets/downloads/obsidian-graph-view/研究/入口.md` | 65 | `c1e5aec9d29b89456ed5fffad44f2e31ac8fa9b10a47f6dac0bd8b81c7f87209` |
| `evidence/saved-md/after/研究/検証.md` | `assets/downloads/obsidian-graph-view/研究/検証.md` | 68 | `75a413fedbbda37b3b81c73c1953e010bd50140295f4a12c1cd4d1c987da62d3` |
| `evidence/saved-md/after/追加メモ.md` | `assets/downloads/obsidian-graph-view/追加メモ.md` | 92 | `353b4739dbd144b7ed9ad5b1046e8f58ec3b805ae540412b1d8a1d56ae7ae39c` |

## 追加した派生ZIP・編集OG

ZIP `assets/downloads/obsidian-graph-view/obsidian-graph-fixture.zip` は記事準備時の新しい配布用パッケージで、実GUI原本そのものではありません。1307 bytes、SHA256 `38eacca3a18d57e007e9fc1f33f1a3cefe543041bf773b9130d85941d2c93dbf`。七つの元Markdownだけを元の相対パスで格納しました。固定したZIP metadata時刻は実操作時刻ではありません。ローカルブラウザーで実際にダウンロードしたZIPのbytes/hash、および展開後の七相対パス・本文hashを照合しました。原MarkdownやPNGをZIPで置き換えていません。読者側での取り込み、別Vault、実配信を検証したという主張ではありません。

| ZIP内の相対パス | bytes | SHA256 |
|---|---:|---|
| `孤立.md` | 80 | `8834b4faff644eb018997081f7f56a0e561219017c9aaa3945512fbcd6e983cf` |
| `生活/買い物.md` | 74 | `193a153b4feb0871e95718c83dc3395530bcc947ab1688a2a6c26e88cb5a3ac0` |
| `生活/食事.md` | 71 | `1081ae04ecfa3ced8cd1319273b2c56088992ac72156688e3a843ebd358f0d1c` |
| `研究/仮説.md` | 86 | `aa3e8bbb46e6696d3bdd02419327653c3275379d2ba53a41c6773cce517c9e18` |
| `研究/入口.md` | 65 | `c1e5aec9d29b89456ed5fffad44f2e31ac8fa9b10a47f6dac0bd8b81c7f87209` |
| `研究/検証.md` | 68 | `75a413fedbbda37b3b81c73c1953e010bd50140295f4a12c1cd4d1c987da62d3` |
| `追加メモ.md` | 92 | `353b4739dbd144b7ed9ad5b1046e8f58ec3b805ae540412b1d8a1d56ae7ae39c` |

編集OG `assets/img/og/obsidian-graph-view.png` は既存のHTMLテンプレートと既存ローカルfont、実Chromiumで生成した1200×630の新画像です。408999 bytes、SHA256 `3d168288160fd8b7c8508003ab1ad22b61e9072ed702ee5c2e24e2104ab9295a`。タイトルと青いグラフ意匠が枠内で読めることを目視しました。GUI原画像ではありません。

## 有限のプレビュー検査

実Chromiumでlocalhost記事候補を320/390/768/1440 pxの四幅で表示し、横はみ出し・console/page/resourceエラーなし、原画像七件読み込み、1H1、canonical、タイトル・description、Article/FAQ schemaを確認しました。FAQ四件を実際に開き、visible text/schemaが4/4一致。追加メモの全文コードが保存92 bytesと一致。Markdown七件と派生ZIP一件を実ダウンロードし、各bytes/SHA256を確認しました。next stepを実クリックし、既存 `/obsidian/zettelkasten/` のローカル本文が参照元と一致しました。参照元は編集していません。外部リクエスト/書き込みはブロックする設定で、当該検査のblocked requestsは0件です。App Storeクリック・計測効果は未検証です。

## 未確認・公開工程

公開前に別担当の原PNG目視・hash照合、fresh full-scope owner/重複確認、本文公開日時・検証記録URLのplaceholder解決、メタデータ・索引・inboundの必要差分、通常CI、対応するmerge/Pages、実公開HTMLと元assetsのreadbackを別々に記録する必要があります。記事候補の品質評価は公開完了証明ではありません。queue/台帳を完了にしません。

iOS/Android/Windows/macOS、Sync、SimpleMemo、別端末、大Vault、全検索・全表示条件、group重複/並べ替え、Depth3–5、速度、学習、生産性、因果的な流入効果は未検証です。10月倍増は同定義の成熟計測待ちです。Company無人率・schedule復旧に加点しません。新dependency・鍵・paid provider・送信者identityは追加せず、実行費用は不明で0と主張しません。


## 全変更範囲と手動公開の記録 — 2026-10-01 JST

ユーザーのSEO/AIO Goalは必要な作業からdeployまでの実行を明示しています。既存のサイトコンテンツ権限とmeasurement-coexistence-policyの明示依頼による公開・事実訂正の行に従い、影響範囲と実公開時刻を記録します。これはCompany prospective計測のglobal衝突を免除する変更ではありません。稼働・凍結・follow-upを含む既存owner/停止/評価日/予算/契約を維持し、新規計測実験やCompany成果へ読み替えません。

申告対象は29ファイルです。article、原PNG7件・元相対パスのMarkdown7件、派生ZIP、編集OG、このevidence、Zettelkastenとsecond-brainの各1文、graph1行・配信seed1行・C26準備note、annotation、既存brand/engage非排他観測の交絡note各1件、llms1案内、October audit、JA sitemapの割当行、GSC追加3対象です。既存title/description/canonical/hreflang/FAQ/CTA/Next stepを維持し、二つのinboundは挿入分を除く全bytesが元に戻ることを検査します。保護されたhub/plugins/getting-started/Logseq/sync/pricing/vault本文・権限表・workflow・owner規則は変更しません。

C17は理由つきリンク・索引・backlinksを固定した表示条件で説明します。C26は別fixtureの6/3→7/4と、global/local・path/tag検索・Orphans・Groups・native色・Depth1/2という有限の表示操作を説明します。原キューtitleとunique_valueは書き換えません。7PNG/7Markdownのsource一致と、本番比較のHTML・追加メモ92B・local-depth-2 PNGの3対象は別の証拠です。ZIPは元7Markdownを相対パスで包む派生物で、原本の代替や読者側import試験ではありません。

GSCの元85ケースとC13/C14/C17/C20の既存12比較は維持し、C26固有3比較だけを追加します。先行mainで完了したGSC修復・workflow変更は再導入しません。ソース日付は準備時のJST暦日であり、merge秒や実配信開始を創作しません。最終HEADの通常CI・対応main merge/Pages・HTMLと元assetsの実readbackを別々に記録するまでC26のqueue/台帳を完了にしません。

公開・検索登録・AIO引用・CTA・10月流入倍増・生産性・SimpleMemo/端末/同期・大Vault・全表示条件は、この私的QAや限定GUI確認から認定しません。同定義の成熟した流入計測を待ち、Company無人率・自然schedule復旧へ加点しません。新支出・秘密値・送信者identityは追加せず、実行費用は不明です。


## Primary article delivery and combined C27 source closeout — 2026-10-01 JST

C26の原キューを、実際に確認した一次記事配信に基づいてdoneにします。元title・unique_value・publication_noteとowner/停止/窓/予算/契約は保持します。C27はpendingで、この同時台帳closeout/記事準備の最終CI・main merge・対応Pages・本番readbackは別工程として未完です。

[PR #1790](https://github.com/simplememofast/simplememo/pull/1790) final head `3901319551fcef5568b7b346d044306d62056717` の通常SEO run36760940643/job110043007417 は146success/1main-only IndexNow skip/0failureです。通常mergeはmain `afdae7d0603acc964b372f1a46c56dfec6742c6d`、UTC 2026-09-30T19:00:04Z。その対応Pages deployment 4254da31-f309-411b-ad8e-2c3fbdf8915d/check110048767006 はUTC 2026-09-30T19:00:33Z にsuccessです。branch previewを本番配信証拠へ読み替えません。

実strict production run36763192137/job110050684023、source `207cb6fbb56a1bb18cdf5af99e3f71f0ddadc48b`、UTC 2026-09-30T19:06:07.005Z は元85ケースと既存15比較すべてpass、0failure/0skipです。C26 HTML200（観測UTC 2026-09-30T19:06:13.380Z）、元追加メモ92bytes/SHA256 `353b4739dbd144b7ed9ad5b1046e8f58ec3b805ae540412b1d8a1d56ae7ae39c`（観測UTC 2026-09-30T19:06:13.686Z）、元local-depth-2 PNG 44197bytes/SHA256 `d1dab655467e20e8e6538084fc75da8a154b374231ebc76e2393e7cc4b050663`（観測UTC 2026-09-30T19:06:14.019Z）を確認しました。

artifact11118549990 archive digest `sha256:968c39d3511701b612799e32668f5bfc76d6388cf2c6b9f49057df87aa9250cd` と、実parsed report SHA256 `57a1939785b6ea311ceca0161c50d7dba67c0fbb1ee90cfe762a8484e707d8f6` を区別します。原GUI receipt/evidenceのSHAも別の証拠です。C26の全14原assetsはsource同一性を確認し、実HTTP bytesの確認はこの2原assetsに限ります。HTML全文・全assets・ZIPの読者import・全siteの配送、Google登録、AIO引用、CTA、速度/生産性/流入は認定しません。

初期ローカルpreflightの4環境失敗と通常環境218/218成功、actual reader12/download8を私的履歴で保持しました。元証拠文書の全本文と、この一次配信proofのprior_failures 0件を削除せず、後続successで置き換えません。


Linux著者作成例の6/3→7/4、有限global/local表示操作、補助API/overlay/訂正sidecarと実GUIを区別します。有限品質93は検証範囲を広げず、Not verified/verified:null/testedSimpleMemoVersion:nullを維持します。C27カード操作とは意図を分け、全graph条件/大Vault/別OS/端末/Sync/SimpleMemoは未検証です。policy42の明示manual公開で全22変更を申告し、13Company global衝突、既存owner/停止/窓/予算/評価/契約を免除しません。Company無人率・自然schedule復旧はfalse、10月流入倍増は同定義の成熟計測待ちです。

この同時ソース準備でのqueue残数は18（pending 16、blocked 2）です。C27はpendingで、このcloseout/記事準備自身の実配信確認は別に残します。
