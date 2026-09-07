# 規約本文の4条項検査：AI実行記録

2026-09-07。対象業務は既存台帳の「責任上限・知財・個人情報・準拠法の条項検査」。その原文は、書面契約が無く各社の規約に同意する運用のため、検査対象を規約本文と定義している。契約承認やアカウント固有の受諾版の認定を、この1業務の完了条件へ追加しない。

AIは公開原文を読み、11件の分析を `contract_review.ai_assessments` に保存した。実行者、取得日時、原文URL・版・文字数・SHA-256、4観点を含む12項目の判断・対応・原文位置、未確認事項を保持している。人が過去に承認した `reviewed_by` と判定は書き換えていない。

今回 `node scripts/vendor-clause-worksheet.mjs --json` を実データで実行し、11社の各4観点に結論・対応・原文根拠があることを照合した。riskはリスクを検出した結論、conditionalは条件の照合が必要な結論であり、問題なしや契約承認ではない。

| ベンダー | 責任上限 | 知財 | 個人情報 | 準拠法 |
| --- | --- | --- | --- | --- |
| Apple | risk | conditional | conditional | conditional |
| Cloudflare | risk | conditional | conditional | risk |
| Resend | risk | conditional | conditional | risk |
| Anthropic | risk | conditional | conditional | risk |
| Google Cloud | risk | conditional | conditional | conditional |
| Search Console | risk | conditional | conditional | risk |
| Firebase | risk | conditional | conditional | conditional |
| AppsFlyer | risk | conditional | risk | risk |
| GitHub | risk | conditional | conditional | risk |
| PR TIMES | risk | conditional | conditional | conditional |
| レジストラ | risk | conditional | conditional | conditional |

44マス・11社を検査した。AnthropicのConsumer/Commercialは別の分析のまま扱う。Firebaseは公式のサービス対応と実装上の利用サービスを照合した明示参照で、GCP共通本文と固有条件の読み合わせを使用する。根拠は `docs/firebase-service-scope-2026-09-07.md`。共有分析は新規分析として複製せず、一意の分析IDは11件のままである。

## ゲートと再確認

通常の `--check` は、直接分析又は根拠付き共有参照が無い観点、原文位置の欠落、不正な原文URL、共有先と指紋の不一致、変更された共有根拠文書、契約承認への誤変換を検出する。既存SEO Validationがこの自己テストと検査を実行する。共有参照・直接分析を消した検体では、それぞれ欠けた4観点を検出した。共有元分析・根拠文書の変更時は再確認する。将来の規約改定をリアルタイムに検知する保証ではなく、既存の週次指紋監視は継続する。

これはスクリプトが法的判断を生成したという意味ではない。AIの原文読解・判断が保存済みの実行であり、スクリプトはその範囲・根拠・参照を照合し作業一覧へ出す。結論の正しさを型検査で証明したとはしない。

## 1業務だけを移管する理由

従来の停止理由「本文を公開リポジトリへ運ばない」は、原文を読み、全文を転載せず判断・原文位置・指紋を記録する経路で解消した。分析を表示しただけのPR #1099には加点せず、今回は元の対象範囲に対する全社の原文読解と共有関係まで照合できたため、この条項検査1件を `ai_proposes` から `ai_executes_gated` へ移す。

実際の契約適用・DPA/SCC・再委託先・SLA・撤退計画の審査、定型契約間の比較、新規契約承認は完了としない。これらへ同じ結果を追加加点しない。契約・利用者の同意や支払いは実行していない。

移管後はAI実行147 / 実施中177 = 83.1%、総合147 / 199 = 73.9%。AI関与160 / 177 = 90.4%、カバー177 / 199 = 88.9%は変わらない。目標のAI実行率90%超には未達であり、本番反映はPRのCI・マージ・Pagesデプロイを別途確認する。
