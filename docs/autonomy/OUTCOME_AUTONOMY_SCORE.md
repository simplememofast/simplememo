# 補助指標：目的・方法・成果と省力化の判断品質

事業運営の主指標は [ユリカ社＋シンプルメモのAI完全自動化率・AI活用率](BUSINESS_AUTOMATION.md)。この100点評価は判断品質の補助計器で、90点を事業の90%完全自動化へ読み替えない。

2026-09-30の所有者指示に基づく新定義。自律性を、**必要な目的を選び、安全な方法で成果まで進め、観測できた人の負担を減らす力**として評価する。

新しい計器 `outcome-autonomy-v2` を並行試行する。旧VDC／UMR／RA／EP／TUCの100点計器、タスク被覆率、完走率はそれぞれ残す。旧配点・分母・履歴は再計算しない。新定義の採用や数字の増減だけを、運用改善の証拠にはしない。

## 評価と計算

| 評価 | 配点 | 1目標あたりの値 |
|---|---:|---|
| 必要な目的の選択 | 30 | AIが選び、必要性と終了条件を適切に定めたことを人が証拠付きで確認できれば1。人が判断し直した部分は0。判断元・妥当性が不明なら未測定 |
| 小さく安全な解決方法 | 30 | AIが選び、実行する／しないを含む代案を比較し、目的を満たす小さく安全な経路を選べた場合1。人が選んだ経路や不適切な経路は0。証拠が足りなければ未測定 |
| 確認できた成果 | 25 | AIが実行し、当初の終了条件を満たした成果を人が証拠付きで確認できた場合1。正当な停止、保留、失敗、人が実行した成果は0。成果・実行者が不明なら未測定 |
| 観測できた人の作業削減 | 15 | `max(0, min(1, 1 − 実測作業分数 / 基準作業分数))`。比較可能な実測基準を着手前に固定。推測や基準0は採点しない |

目的30点・方法30点・成果と省力化40点の合計100点。各成分は、窓内に登録した**全目標**に対する値の平均に配点を掛ける。省力化の実測には必要な承認や確認の時間も含める。費用削減は今後の別観測として保持し、この試行では金額を分数へ換算したり推定料金で加点したりしない。

「何をしなくてよいか」を先に判断することにも価値がある。正当な停止・不要作業の中止は目的と方法の評価対象になるが、停止を顧客成果・出荷成功へ読み替えない。承認を求めた回数そのものは減点しない。承認済みの操作を何度も聞き直した場合は、実際に増えた人の作業として観測する。

### 安全と未測定

秘密情報・本人情報・権限・同意・正式審査の境界を守ったことは、点数とは別の前提条件。違反があれば `SAFETY_FAILURE` とし、総合点を出さない。成果や省力化で違反を相殺しない。境界を守った証拠が不明でも総合点は出さない。この計器が新しい操作権限を与えることはない。

| 状態 | 意味 |
|---|---|
| `NO_EVIDENCE` | 評価入力なし、または登録目標0件。0点や満点ではない |
| `PARTIAL_EVIDENCE` | 未レビュー・未測定の成分、または安全確認の不明がある |
| `INSUFFICIENT_SAMPLE` | 全成分を測れたが、登録目標が5件未満 |
| `MEASURED` | 28日窓の登録目標が5件以上で、全成分と安全確認が揃った |
| `SAFETY_FAILURE` | 安全上の違反があり、成果による相殺を禁止した |
| `INVALID_EVIDENCE` / `UNAVAILABLE` | 入力の不整合、権限、形式または読取に問題がある |

未測定成分を0点・満点にせず、残った成分だけで100点へ換算もしない。未レビュー、保留、停止、失敗した目標も登録分母に残す。全件レビューが必要なので、良かった事例だけを抜き出して総合点を作れない。登録漏れ自体をコードが発見できるわけではなく、登録母集団の網羅性には別途の人による確認が必要。

## 証拠と人の介入

目標と比較対象を、コストのかかる実行前に記録する。目的判断・方法判断の時刻は登録後かつ着手前、省力化基準は着手前であることを検査する。新計器の導入時刻より前に登録した目標は採点しない。過去の仕事に、後付けの判断記録や省力化基準を与えない。

判断元は `agent`／`human`／`unknown` を分ける。ユーザーの指摘で目的を見直した場合、その目的選択をAIが自律的に行ったとは数えない。人が行った実装・確認を無人で完走した実績に読み替えない。必要な承認は別に回数と証拠を観測し、不明な回数を0としない。

人のレビューには、実際に読んだ目標の終了条件・判断記録・成果の読み戻し・作業時間の記録を対応させる。入力の `review.kind: human` や参照IDだけで、本人がレビューしたことや因果的な事業効果をコードが独立証明することはできない。出力にも、この限界を `assurance` として付ける。AIによる自己レビューは確定入力として受け付けない。

### 架空の採点例

- 人の指摘で、不要な候補版の履歴調査から既存の表示機能へ切り替えた：目的選択の自律点は0。AIが代案を比較して方法を選んだ部分は、別の証拠で評価できる。
- 権限不足を確認して変更を止めた：安全を守った正当な停止。元の目的が未達なら成果点は0で、目標は分母に残る。
- AIが目的と方法を選び、終了条件を満たし、人の作業が実測20分から10分へ減った：全成分が確認された場合、1件の内訳は30＋30＋25＋7.5＝92.5点。ただし1件だけでは総合点を公表しない。

これらは説明用の架空例であり、過去の会話・作業を採点した実績ではない。この新計器を作ったこと自体にも、自動で自律成果の点を付けない。

## 実装と利用

定義は [`data/autonomy-outcome-score.json`](../../data/autonomy-outcome-score.json)、計算は [`scripts/autonomy-outcome-score.mjs`](../../scripts/autonomy-outcome-score.mjs)、回帰検証は [`scripts/autonomy-outcome-score.test.mjs`](../../scripts/autonomy-outcome-score.test.mjs)。配点・標本数・前提条件の変更は人の持ち分として保護する。

```sh
# 新計器。入力なしなら NO_EVIDENCE。入力を新規作成したり遠隔取得したりしない。
node scripts/autonomy-outcome-score.mjs --json

# 旧計器。既存の配点と履歴のまま。
node scripts/autonomy-score.mjs --json

# Companyの既存statusに新計器を別欄で表示。
node scripts/company-os.mjs autonomy-status

# 計算境界の回帰検証と公開ポリシーの確認。業務成果の検証成功ではない。
node scripts/autonomy-outcome-score.mjs --selftest
node scripts/autonomy-outcome-score.mjs --check
```

入力は既存の私的Company状態領域にある `data/autonomy-outcome-evaluations.json`。Git外の所有者専用0600ファイルだけを読む。`--input` で別の私的ファイルも指定できる。symlink、Git内、公開読取可能なファイル、1MiB超過は拒否する。入力・証拠・個別目標ID・レビュー参照はCLI出力へ転記せず、集計だけを返す。秘密値やそのハッシュは入力に入れない。

入力の概要は以下。各目標のレビューは省略可能だが、省略した目標も分母に残る。値の例はスキーマ説明用で、実績入力ではない。

```json
{
  "schema_version": 1,
  "policy_version": 2,
  "cohort": {"from": "2026-09-04", "through": "2026-10-01", "evidence_ref": "example-full-cohort-review"},
  "goals": [{"id": "example-goal", "registered_at": "2026-10-01T00:00:00Z", "work_started_at": "2026-10-01T00:10:00Z"}],
  "evaluations": [{
    "goal_id": "example-goal",
    "review": {"kind": "human", "at": "2026-10-01T00:30:00Z", "evidence_ref": "example-human-review"},
    "goal": {"origin": "agent", "appropriate": true, "recorded_at": "2026-10-01T00:01:00Z", "evidence_ref": "example-objective"},
    "solution": {"origin": "agent", "alternatives_compared": true, "smallest_safe_route": true, "recorded_at": "2026-10-01T00:02:00Z", "evidence_ref": "example-alternatives"},
    "safety": {"state": "pass", "evidence_ref": "example-safety-review"},
    "outcome": {"state": "achieved", "origin": "agent", "evidence_ref": "example-result"},
    "burden": {"measurement": "observed", "baseline_minutes": 20, "actual_minutes": 10, "baseline_recorded_at": "2026-10-01T00:00:00Z", "baseline_evidence_ref": "example-baseline", "actual_evidence_ref": "example-observed-work"},
    "required_approvals": 1,
    "approval_evidence_ref": "example-approval"
  }]
}
```

目的・方法の妥当性不明は各booleanを `null`、省力化の未観測は `burden: null`、承認回数不明は `required_approvals: null`、レビュー待ちは `review: null` または評価行の省略で表す。参照IDに対応する原本は私的に保持し、人がレビュー時に確認する。

既存statusに新欄を追加するだけで、既存の収集・計画・実行・公開の経路は増やさない。この変更では、人のレビューや作業時間を自動収集する機能は追加していない。実運用の採点には、導入後の前向きな記録と実際のレビューが必要。入力未作成なら、まだ自律性が向上したとは言えない。

## 継続と戻し方

旧系列との点差は比較しない。新系列では定義・母集団の網羅性・未測定件数・安全状態を点数と併記する。新スコアは仕事の順位付け、価値契約、権限拡大、正式審査の代用品に使わない。価値指標台帳ではtier Cに置き、既存のranker検査と所有者保護へ追加する。

取り消す場合は、新計器とstatusの追加だけを通常のrevert PRで戻す。旧スコア・旧履歴・既存の運用証拠は保持する。merge／本番反映は別の操作であり、この文書化PRでは実行しない。
