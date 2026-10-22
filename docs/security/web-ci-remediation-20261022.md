# SimpleMemo Web / CI ローカル修正記録 — 2026-10-22 UTC

対象は `simplememofast/simplememo` のみ。基準 main は `98fe630d4abba7e8045bdbd834d70202f5b6d720`（調査開始時の `cd7bca653` の次）。作業ブランチは `codex/web-ci-security-local-20261022`。最後のリモート main 照合でも同じ SHA。

## 既存修正の扱い

- Draft [#2121](https://github.com/simplememofast/simplememo/pull/2121) の `e0aa50d9` をローカルへ再利用（`eee0708d7`）。管理SNSは廃止。JWT復活は行わない。
- Draft [#2105](https://github.com/simplememofast/simplememo/pull/2105) の `e725ab61d` と `20db00b08` を再利用（`a73e3e716`、`033ec45c2`）。同じ不具合を別実装し直していない。
- Draft [#2136](https://github.com/simplememofast/simplememo/pull/2136) は未マージのまま。`autopilot-publish.mjs` / `devlog-syndication.mjs` の修正を取り込まず、重複実装もしていない。その他の未マージ修正も勝手に統合・クローズしていない。
- checkout の `.agents/skills/autonomy-audit` / `autonomy-lift` / `autonomy-status`、`docs/autonomy/OPERATING_RUNBOOK.md`、`CLAUDE.md` を確認。今回の明示指示に従い、自律運転・配信・出荷は起動しない。

## 優先度と結果

1. **高: 管理SNSの廃止をコード側で完結。** ヘッダー存在だけの認証を使わず `/admin` 系 middleware は常に410。6つの旧APIも直接呼ばれたとき410だけを返す。OAuth/資格情報を読む共有コード、旧TikTok投稿CLI2本、npmの投稿コマンドを除去。3つの旧投稿workflowは `if: false` と権限なしの殻だけにし、秘密情報・依存インストール・投稿処理を除去。一般のスライド合成・ZIP・公開記事・Devlog配信は保持。Cloudflare側の公開到達性は今回未確認であり、実際に認証を突破できたとは主張しない。
2. **高: Devlogのモデル編集コードと投稿キー付き実行を分離。** 各媒体の準備、執筆、検証、手直し、投稿を別ランナーへ移す。信頼側は同じ `github.sha` のクリーンなcheckout。文脈はモデルを動かさない準備ジョブだけが作る。モデル由来のファイルは `runner.temp` に取得し、通常ファイル・256KiB上限・JSON欄/型を検査して記事だけを取り込む。モデルのコード・設定・変更した文脈を信頼側にコピーしない。再検証、停止、間隔、24時間上限、事実・名乗り・リンク・重複、公開後確認を維持。偽キーだけの再現で旧構造では改変スクリプトが動き、新しい実際の取込shellでは動かないことを確認。
3. **高〜中: toolsの脆弱依存を更新。** Express4系とarchiver7系を維持。sharpは公式修正0.35.5へ上げ、他は依存が許容する範囲を解決し直した。`npm audit fix --force` やoverrideは使っていない。auditは14件（Critical2/High10/Moderate2）から0件。これはtools lockのnpm audit結果であり、GitHub全体のアラート解消や全経路の悪用可能性の証明ではない。
4. **中: ローカルサーバーの閉域化とパス境界。** #2105のIPv4/IPv6 loopback・Host/Origin・dir許可リストを再利用し、さらに実パス境界を検査。静的配信、ZIP、再生成でsymlinkによる境界外の読み書きを拒否。
5. **中: SEO Daily入力、CI権限・依存検査。** 手動days/snapshotをenvへ渡し、シェルに直接埋め込まない。正の整数を検査し、既存の28日既定・週次snapshot・PRのゲートを維持。measureはmain限定。GCP資格情報をworkflow全体からmeasureへ狭めた。SEO Validationを明示的contents:readにし、旧SNSジョブをpermissions:{}へ縮小。DevlogのOIDCはモデル用ジョブに限定。
6. **CIランタイム。** setup-nodeの23箇所を24.22.1に統一。重点4workflow（SEO Validation / SEO Daily / Devlog caller / Devlog reusable）の全外部actionを公式タグと照合した完全SHAへ固定し、標準actionをNode24世代へ更新。ほかのworkflowの可変actionタグは全廃していない。toolsの `npm ci --ignore-scripts` と Moderate以上で失敗する `npm audit`、境界検査・ネイティブ画像/HTTP検査をSEO Validationに追加した。

## lockと到達条件の区別

| 依存 | 旧lock → 新lock | このcheckoutでの条件 |
| --- | --- | --- |
| sharp | 0.33.5 → 0.35.5 | スライド合成がネイティブ画像処理を使用。実行したバイナリはrsvg2.63.2 / libvips8.18.7 / libheif1.23.5。外部からの細工SVGやRCEを実証したものではない |
| proxy-addr | 2.0.7 → 2.0.8 | advisoryの条件は誤ったIPv4-mapped IPv6 trust subnet。serverはtrust proxyを設定せず、IP認可にも使っていない |
| minimatch | 9.0.5 / 5.1.6 → 9.0.9 / 5.1.9 | archiver関連の推移依存。ZIPのファイル名は固定で、HTTP入力をglobとして評価する経路は確認していない |
| brace-expansion | 2.0.2 → 2.1.7 | 上記glob依存。古い1件の修正だけで止めず、現在の複数advisoryに合う版へ更新 |
| lodash | 4.17.23 → 4.18.1 | archiver-utils関連の推移依存。アプリからtemplate/unset/omitへ外部入力を渡す呼出しは確認していない |
| qs | 6.14.2 → 6.16.1 | Expressの推移依存。独自stringify/オブジェクト入力は使わず、bodyはexpress.json。パッケージ検出と特定オプションでの到達性を区別 |
| path-to-regexp | 0.1.12 → 0.1.13 | `/api/zip/:dir` は単一パラメーター。複数パラメーターの問題パターンは使っていない |
| body-parser | 1.20.4 → 1.20.8 | `express.json()` の有効な既定limitを使用。不正limit値で制限が無効化される条件は未成立 |
| express | 4.22.1 → 4.22.3 | 4系を維持して依存修正を取り込んだ。実サーバーHTTP/ZIP検査は成功 |

一次情報: [sharp librsvg](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w)、[sharp 0.35.5](https://sharp.pixelplumbing.com/changelog/v0.35.5/)、[proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)、[minimatch](https://github.com/advisories/GHSA-7r86-cg39-jmmj)、[brace-expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr)、[lodash](https://github.com/advisories/GHSA-f23m-r3pf-42rh)、[qs](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g)、[path-to-regexp](https://github.com/advisories/GHSA-37ch-88jc-xwx2)、[body-parser](https://github.com/advisories/GHSA-v422-hmwv-36x6)。取得した現行npm registryの版・audit結果とも照合した。

Nodeは[2026-10-21公式セキュリティリリース](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)の24.22.1を使用。公式SHASUMSとlinux-x64配布物のSHA256 `6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6`を照合して `/tmp` に展開した。ホスト既定の24.19.0を最終検証には使っていない。

## ローカル検証

- セキュリティ境界・廃止・実サーバー/画像: **17成功、失敗0、省略0**。loopback IPv4/IPv6、LAN非公開、偽Host/Origin、encoded traversal、symlink、正常な静的ファイル/ZIP、1080×1920 PNG、モデル改変スクリプトの遮断を実行して検査。
- 既存refactor / GSC redirect回帰: **153成功、失敗0、省略0**。この環境のumask077では既存の実行権限fixtureが失敗するため、通常のumask022を明示した。テストの権限assertは変更していない。
- Devlog自己テスト: **47成功**。外部fetchの既定を例外に置き換えて実行。#2136の49件とは別のmain由来47件。
- routine CI scope、selftest台帳、guard-shapes、injection-surface、credentials、generators、module-entry、emergency-stop、autopilot-publish wiring、preflight自己テストを検査。guard-shapesは新しい合成画像/HTTPテストが実台帳を読まない理由を記帳。既存の上限やチェック本体は緩和していない。
- YAML構文25本成功。重点4workflowはactionlint1.7.11で無除外成功。全体のactionlintでは意図的な廃止3本の `if: false` と、既存acquisitionの `environment.deployment: false` だけが残るため、この2種類を分けて確認。後者の設定は変更していない。
- 全体SEO検査: **失敗（exit1）**、エラー0・警告2652。未変更mainの別worktreeでも同じ結果で、出力全体がバイト単位で一致。修正による新規SEO差分とは扱わず、既存の警告ゲートを弱めていない。
- `git diff --check`、preflight抽出（243コマンド）は成功。全243コマンド、ブラウザー全ページ検査、GitHub CI、CF実配信は今回実行していない。

再実行例（Node24.22.1、umask022）:

```sh
npm ci --prefix tools --ignore-scripts --no-audit
npm audit --prefix tools --omit=dev --audit-level=moderate
node --test scripts/ci-security.test.mjs scripts/admin-retirement.test.mjs scripts/tools-runtime.test.mjs
node --test scripts/refactor.test.mjs scripts/gsc-redirect-regressions.test.mjs
node --input-type=module -e 'globalThis.fetch=async()=>{throw Error("External network forbidden")};const m=await import("./scripts/devlog-syndication.mjs");process.exitCode=await m.selftest()?1:0'
```

## 未確認・必要判断

- **push/PRは未実施・保留。** GitHub Actions費用残枠が不明。Devlogが全4媒体で執筆する場合、従来5ランナー（4媒体+watch）に対して、分離後は手直しなし17、全媒体で手直しあり21。早期に門が閉じる媒体はprepareだけで終わる。ジョブ時間上限は媒体ごと合計90分以内を維持し、モデルのturn/budget/手直し回数も増やしていないが、通常時のランナー起動・成果物転送の時間/実費は未測定。SEO Validationにはnpm取得・audit・小規模テストが増える。費用影響の判断前にCIを発火させない。
- **Cloudflare確認は未実施。** カスタムドメイン、production pages.dev、wildcard previewと過去デプロイのAccess封じ込め、および公開後410の確認が残る。現在のGitコードだけでは歴史的デプロイを停止できない。
- **旧資格情報の失効/削除は未実施。** X/Postiz等の他利用者を確認し、発行元での失効とPages/Actions側の廃止コピー整理を、既存の所有者手順で行う必要がある。今回の指示ではtoken変更・権限変更・deployを行わない。
- #2136の保留判断は維持。API/iOSの変更・テスト、Apple申請、merge/deploy、実投稿、外部モデルAPI/Claude Codeの起動、顧客連絡は行っていない。GitHub securityの拒否を回避する操作も行っていない。

## デプロイ承認後の再確認（2026-10-22 UTC）

所有者の「デプロイまでお願い」を受け、Webセキュリティ修正のpush・Draft PR・必須検査・merge・通常の本番反映を進める準備を行った。新規費用・認証/権限拡張・secret新設定の禁止は継続。候補コードは `db4d5cebee11bb0303787534bdca269fd58fd947`、予定先は既存Cloudflare Pagesの `https://simplememofast.com`（既存pages.dev系統 `simplememo-596.pages.dev`）。

- remote mainをfetchして再照合し、引き続き `98fe630d4`。候補はその子孫で競合なし。#2121と#2136は同じheadのDraft・未マージ。別担当repoには触れていない。
- ローカル境界/実サーバー17件を再実行し全成功。npm audit 0、重点4workflowのactionlint成功。未pushのため、候補headに対するGitHub CI結果はまだ存在しない。
- **SEO警告のリリース判定を明確化:** `seo-check.js` 単体のexit 1は警告のみ。既存 `seo-check.yml` の `Run SEO validation` はexit 2以上を阻害条件としており、mainと同一のエラー0・警告2652は、このステップだけを理由にリリースを阻害しない。今回の修正で判定を変えていない。CI全体の成功を意味するものでもない。
- **Undici:** toolsのlockにはUndiciは含まれない。CI/ローカル用Node24.22.1の実測内蔵版は7.30.1。[Node公式リリース](https://nodejs.org/en/blog/release/v24.22.1/)と、7.30.1が修正版である[上流advisory](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c)を照合。Web本番のCloudflare実行基盤と、別担当API repoの依存は別であり、API側の未解消事項を本記録で成功扱いしない。
- 現ブランチだけのpushはリポジトリのworkflow定義上Actions 0本。Draft PR作成はSEO Validation、PageSpeed Audit、Homepage Section Rendering、Homepage Asset Cache Verification、GSC Redirect Audit、GSC Crawled URL Checksの6本および既存workflow_run連鎖の起動候補となる。publicの標準Ubuntuランナー時間は[公式規則](https://docs.github.com/en/billing/concepts/product-billing/github-actions)上無料。
- **費用停止条件:** `pagespeed-audit.yml` は本番ページを複数回測定し、`gsc-indexing.yml` のPR baselineも100超の本番URLへHTTPアクセスする。リポジトリの2026-09-07確認記録はWorkers Paidの既存契約と、未照合の従量上限を示す。Pages Functionsは[Workers Paidのリクエスト/CPU従量](https://developers.cloudflare.com/pages/functions/pricing/)に含まれ、枠超過時は[公式料金](https://developers.cloudflare.com/workers/platform/pricing/)の追加リクエスト100万件あたり$0.30、追加CPU100万msあたり$0.02の対象となる。当月の実使用量・残枠を確認できず、追加額を0と確定できない。GitHub artifact保存容量のアカウント残枠も未確認。
- 既存GitHub CLIのplan確認は前回 `GET /user` がForbiddenで、同じ拒否を再試行していない。接続GitHubツールは個人billing API未対応。追加で確認したDesktop Commanderは接続端末0台で、認証済み管理画面を読む既存経路が無い。関連する10月の課金通知を既存メール接続で限定検索したが、現在残枠を確定する資料は得られなかった。新grant・新token・ログイン・購読変更は行っていない。

**状態:** push・Draft PR作成・merge・deploy・本番/previewへの新しいHTTP readbackはいずれも未実行（ツールに拒否されたpushではなく、費用条件により実行前で保留）。本番は変更していない。安全検査の削除、ライブ検査の無効化、予算増額で進めることはしない。必要なのは、既存アカウントの当月リクエスト/CPUと保存容量の残枠に関する確認、または所有者による費用条件の具体的な判断である。追加費用禁止の条件が維持される間は、その条件を確認できるまで出荷操作を保留する。
