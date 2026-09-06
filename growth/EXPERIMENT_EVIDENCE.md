# 実験の評価資料を記録する

`experiments.mjs evaluate` は、実験の対象指標と比較条件に合う証拠を要求する。GSCファイルの存在だけでCTA・QR・AI引用施策を採用できた旧処理は廃止した。既存の評価結果は書き換えない。

この処理が検査するのは評価資料の受け入れ条件であり、施策効果の有意性、最低件数の妥当性、単独の因果を自動判定するものではない。比較結果・途中変更・限界を確認してから判断する。評価日は資料を読む約束の日であり、取得期間の開始日ではない。

## GSCのページ／検索語×ページを比較する

```sh
node growth/scripts/experiments.mjs evaluate <id> --decision keep \
  --snapshot <label> --note "対象・検索タイプ・国端末フィルタ、比較結果、途中変更と限界"
```

- 対象指標は `ctr`・`position`・`impressions`。単一ページ、または台帳の `measurement_scope` で指定した完全一致検索語×ページを使う。ブランド検索群・検索での見え方・複数ページ・その他の追加フィルタは次節の明示的レビューを使う。
- `--snapshot` は存在するラベルから必ず明示選択する。対象行がない状態を0件へ置換しない。クエリ単位のFAQにページ全体の数字を流用しない。
- 台帳の変更前期間と変更後期間は同じ日数とし、変更前は開始日の前日まで、変更後は開始日の翌日以降。GSCの末日から少なくとも3暦日を置く。期間内すべての日付行が重複なく存在することを確認する。
- クリック・表示は有効な整数を要求し、CTRはクリック÷表示で再計算する。表示0件の実測行ではCTR・順位は未定義とし、`inconclusive` のみ受け付ける。
- 現行スナップショットの日別行は全体の網羅性を示し、各ページの日別完全性を証明するものではない。元の変更前データの抽出は再計算せず、登録値とそのハッシュを保存する。
- 古いCSVスナップショットは検索タイプ・時間帯のメタ情報を持たない。保存規約のWEB・Pacificを前提に処理するが、この未検証部分を証拠の `limitations` へ必ず残す。元CSVのフィルタで国・端末・検索タイプ・期間を確認し、違えば採用しない。明示された非WEB・別時間帯・不完全期間は拒否する。

判定資料には、元ファイル3個のSHA-256、対象範囲、期間、変更前後の値と注意点を保存する。`due` も実験ごとに同じ条件を通る候補だけを表示する。

## GA4・ASC・その他の指標を比較する

```sh
node growth/scripts/experiments.mjs evaluate <id> --decision inconclusive \
  --review /private/analysis/review.json
```

これは**手動レビューの記録経路**。GA4の実データが未生成でも集計できたことにする機能ではない。以下の契約一致とファイルの整合を機械検査し、抽出・日別網羅性・解釈はレビュー者が確認する。現時点のテストは仮データであり、未生成のGA4実スキーマでの動作確認ではない。

事前に台帳へ実際の対象指標を表す `measurement_contract` と `baseline.metric`・`baseline.value`・`baseline.window` を根拠付きで登録する。旧GSCクリックをGA4クリックへ読み替えたり、全サイト値を特定ページの基準にしたりしない。同一定義を復元できない実験は次節で診断する。契約を追加すること自体が旧値の互換性を証明するわけではない。

契約の必須項目は `source`（`gsc` / `ga4` / `asc` / `ai_citations` / `d1`）、`definition`（イベント、分子・分母、対象製品、除外条件、版）、`unit`、`time_zone`、`scope`（対象ページ・チャネル・配置等）、`lag_days`。GA4は5日以上、GSCは3日以上、その他は1日以上を要求する。実レポートの更新・確定遅延が長ければ、それに合わせて増やす。

レビューJSONの構造（値・パス・ハッシュは実際のレビューで置き換える）：

```json
{
  "schema_version": 1,
  "kind": "comparison",
  "experiment_id": "<台帳ID>",
  "target_metric": "<台帳と同じ指標>",
  "decision": "inconclusive",
  "source": "ga4",
  "definition": "<契約と同じ定義>",
  "unit": "ratio",
  "time_zone": "Asia/Tokyo",
  "scope": {"pages": ["/対象/"], "channel": "Organic Search"},
  "reviewed_by": "<レビュー者>",
  "rationale": "<判断の根拠>",
  "limitations": ["<標本、交絡、帰属の限界>"],
  "baseline": {
    "start": "2026-07-01", "end": "2026-07-28", "value": 0.01,
    "complete": true,
    "definition": "<契約と同じ定義>", "unit": "ratio", "time_zone": "Asia/Tokyo",
    "scope": {"pages": ["/対象/"], "channel": "Organic Search"},
    "extraction": "<元資料の行・フィルタ・計算と網羅性を確認した参照箇所>",
    "artifact": {"path": "before.json", "sha256": "<64桁SHA-256>"}
  },
  "post": {
    "start": "2026-08-01", "end": "2026-08-28", "value": 0.012,
    "complete": true,
    "definition": "<契約と同じ定義>", "unit": "ratio", "time_zone": "Asia/Tokyo",
    "scope": {"pages": ["/対象/"], "channel": "Organic Search"},
    "extraction": "<変更後の元資料の抽出・網羅性を確認した参照箇所>",
    "artifact": {"path": "after.json", "sha256": "<64桁SHA-256>"}
  }
}
```

両期間の定義・単位・時間帯・範囲は契約と完全一致し、変更前の期間・数値は登録値と一致しなければならない。比率の0〜1、件数の非負整数、順位の正値も確認する。比較の元JSONは非空の配列または `rows` を持つ形式とする。既存APIの包み形式は `status=complete`・`execution=export`・少なくとも1行の結果を要求し、識別できるGSC/GA4の取り違えを拒否する。その他の形式は手動抽出の責任を伴う。

JSON内の `complete`・数値・抽出説明の真実性をこのCLIが独立検証したとは記録しない。比較経路は `manual_comparison` と表示し、元ファイルとレビューJSONのハッシュを残す。私有ファイルの絶対パスや内容は台帳へ複写せず、ファイル名・サイズ・ハッシュだけを保存する。説明にも秘密情報・個票を入れない。

## 計測不能の診断と運用上の終了

`--force` は廃止した。基準の欠落・定義不一致・必要な元データの欠落は、根拠付き診断JSONで `measurement_failed` と記録できる。診断には変更後GSCを要求しない。

```json
{
  "schema_version": 1, "kind": "diagnostic",
  "experiment_id": "<台帳ID>", "target_metric": "<台帳と同じ指標>",
  "decision": "measurement_failed", "reviewed_by": "<レビュー者>",
  "rationale": "<元の問いを測れないと判断した理由>",
  "findings": ["<復元の確認結果と定義不一致等>"],
  "artifacts": [{"path": "diagnosis.md", "sha256": "<64桁SHA-256>"}]
}
```

この診断JSONを `keep` 等に転用することはできない。同じ条件で測れたが標本が足りない場合の `inconclusive` と区別する。運用上打ち切る `abandoned --note "理由"` は `administrative` と記録し、効果や「指標が到達不能」とする証拠にはしない。一度評価済み・中止済みの記録をこのCLIで上書きすることはできない。

検査：`node growth/scripts/check-experiment-evidence.mjs`。仮データの一時フォルダで評価CLIも実行し、失敗時の台帳不変と成功時の証拠保存を確認する。
