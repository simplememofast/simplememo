# 第7条の改定予定案 — 公開・施行前レビュー

状態: **draft / 未施行 / 公開承認待ち**。2026-10-16は調査日であり、施行日ではない。

承認された日本語5項と対応する英訳を、[article-7.patch](article-7.patch) に実装した。
このブランチでは現行の `terms.html` と `en/terms.html` を変更しない。
patchは第7条の見出しと本文のみを置換し、既存の `reading-07` アンカーを保持する。
金額上限、言語優先条項、みなし同意、過去の事故への遡及適用を追加していない。
条文の法的有効性・英訳の最終確認は法務レビューを要する。

## 正本と公開内容の照合

- 正規repo: https://github.com/simplememofast/simplememo
- 基点main: `f1de6301221c7660f37da4ae985fc49599aa61ce`
- 専用ブランチ: `claude/terms-security-review-20261016`
- [日本語規約](https://simplememofast.com/terms) / [英語規約](https://simplememofast.com/en/terms) を2026-10-16 02:13:13 UTCに直接HTTP取得。両方200、UTF-8。取得HTMLは基点mainの各ファイルとバイト単位で一致。

| 項目 | 日本語・英語の公開表示 |
| --- | --- |
| 最終更新日 | 2026-01-31 |
| 改定告知 | 2026-10-02掲載、2026-10-15から第3条の「ずっと無料 / free forever」を「利用期間の制限なし / no time limit」へ変更 |
| 第3条本文 | 両方とも旧文言のまま |
| 第7条 | 配信・即時性を保証しない1段落 |
| 第10条 | サービスまたはサイトへの掲示時点で発効 |

10月15日を過ぎても告知・旧本文・1月31日更新日が併存している。
これは表示の観測であり、既存契約にどの版が法的に適用されているかを断定するものではない。
今回の第7条改定に便乗して第3条や更新日を変更せず、告知履歴を保全して整理方針を確認する。

取得HTMLのSHA-256:

- JA: `39a68b08ae7a0570d0e48dc603b51f0be5813db9f688a7ed871f31ca94676275`
- EN: `f88bdada323c1787043fe0710b2e8ea04a6254645d1484f8518f1e00bb94513a`

## 差分の範囲

| 項 | 日本語承認文に対応する英訳の要点 |
| --- | --- |
| 1 | 配信非保証と、当社に帰責事由がある場合の責任留保 |
| 2 | 法令・プライバシーポリシーに従う安全管理と委託先監督、完全防止は非保証 |
| 3 | 帰責事由がない場合の扱いと法令上の例外、第三者攻撃だけでは免責されないこと |
| 4 | 当社・代表者・使用する者の軽過失の場合に限る範囲制限、故意・重過失・生命身体・法令上の例外 |
| 5 | 安全管理・漏えい等報告・本人通知義務と消費者契約法等の強行法規上の権利の留保 |

`reasons attributable to us` は「当社の責めに帰すべき事由」に対応する。
軽過失は `ordinary negligence (negligence other than gross negligence)` と明示し、
`Only where` で制限の適用範囲を限定する。「その使用する者」を従業員だけに限定しない。
新たな金額上限や逸失利益の一律除外は設けない。

## 公開前に必要な判断

1. **法務確認**: 第7条5項と英訳、および既存利用者への変更が個別合意または定型約款変更のどちらにより可能かを確認する。
2. **施行時期**: 日付・時刻・タイムゾーンを明示して決定する。調査日や過去日に自動設定しない。過去の事故には遡及適用しない。既存利用者と新規利用者への適用範囲も明確にする。
3. **事前周知**: 告知開始日、変更理由、新旧対照、変更後全文、施行時期、既存利用者に到達する周知方法を決定する。今回は告知送信やアプリ改修を実施しない。
4. **第10条**: 現在の「掲示時点から効力」と予定施行日の関係を整理する。第10条の改定が必要なら別途文案を提示して承認を得る。今回は変更しない。
5. **10月15日告知**: 既存告知・本文・最終更新日の不整合を、当時の承認内容と既存契約への効力を確認して整理する。今回の第7条の施行日と混同しない。
6. **他言語**: 基点mainには `ar`, `es`, `id`, `ko`, `pt-BR`, `tr`, `zh`, `zh-Hant` の機械翻訳版規約も存在し、日本語原文への案内がある。今回のpatchは依頼範囲のJA/ENのみ。実公開時に旧第7条が他言語へ残るため、翻訳同期・確認の方針を決める。勝手に追加翻訳を公開しない。

[民法548条の4](https://laws.e-gov.go.jp/law/129AC0000000089) は、定型約款変更の利益適合性または合理性、効力発生時期の設定、変更旨・変更後内容・効力発生時期の周知を定める。1項2号による変更は、施行前の周知がなければ効力を生じない。公開e-Gov APIで該当条文を取得して確認した。第10条の掲示時点発効だけで変更手続が十分とは判断しない。

[消費者庁・消費者契約法8条の逐条解説](https://www.caa.go.jp/policies/policy/consumer_system/consumer_contract_act/annotations/assets/consumer_system_cms203_230915_13.pdf) で、全面免責、故意・重過失の場合の一部免責、軽過失のみへの適用を明示しない責任制限に関する規律を確認した。8条だけでなく10条の検討も必要であり、本案の有効性を保証するものではない。

## 公開経路と保留方法

`README.md` と `.github/workflows/auto-merge.yml` により、**mainへのmerge/pushがCloudflare Pagesの本番公開につながる**。`claude/` のPRはSEO Validation成功後に自動merge対象となるが、draftは除外される。親の確認までdraftを維持し、Ready・merge・手動deployを行わない。

レビューコミットには `[CF-Pages-Skip] [skip ci]` を付け、レビュー中のPages preview deployと自動CI起動を抑止する。これは[Cloudflare公式のビルド省略機能](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#skipping-a-build-via-a-commit-message)と[GitHub公式のCI省略機能](https://docs.github.com/actions/managing-workflow-runs/skipping-workflow-runs)を用いる。検査成功や公開完了を意味しない。実装の局所検証は下記のとおりローカルで行う。公開承認後に必要な通常Web CIを実施する。

`docs/` は `functions/_middleware.js` がサイト非配信にするパス。**repo自体はpublicなので、draft PRとこの資料はGitHubから読める。非公開資料ではない。** 現行HTMLやサイト内リンクに本案を追加しない。

施行・周知方針が確定した後、最新mainと再照合し、承認済み第7条patchと承認された告知・施行表示を別途レビューする。現在のpatchだけでは公開準備完了とは扱わない。

## 検証

```sh
python3 docs/terms-security-revision-20261016/verify.py
git apply --check --whitespace=error docs/terms-security-revision-20261016/article-7.patch
git diff --check
```

`verify.py` はPython標準ライブラリと既存gitだけを使用し、一時ディレクトリのHTMLへpatchを適用する。現行ファイルを変更しない。承認済み日本語5項の完全一致、英語5項、HTML構造、既存アンカー保持、第7条以外（第3条・告知・更新日・第10条を含む）のバイト一致を検証する。

Appleアプリのテスト・修正・提出、Claude Code起動、新規インストール、新認証・grant、支出は実施しない。ブラウザ操作も行わない。
