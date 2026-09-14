# growth/data/ga4/ — GA4 手動転記の置き場

ここは既存のGA4探索レポートの手動転記を保持する場所。2026-08-20の確認時点では
BigQueryエクスポートが未設定だった。その後、既存の `analytics-read.yml` と
`export-analytics.mjs` による取得が稼働し、Companyの既存日次ownerが出力を再利用する。
現在の取得・品質検証・非公開保存は [運用手順](../../../docs/autonomy/OPERATING_RUNBOOK.md#prospective-cta-measurement)
を参照。新しい転記や同じ期間の別取得を自動運転の前提にしない。

以下の古い探索指標は、その期間・定義のまま残す。現在の24時間セッション開始コホートの
クリック率とは互換ではなく、手動転記のイベント数を新しい施策の基準値へ読み替えない。

## ai-channel.json — AI経由のセッションと app_store_click（v4 R4 の測定面）

GA4 → 探索 で次の2軸を作って読む:

1. セッションのデフォルトチャネルグループ = **AI Assistant**
2. セッションの参照元 に **copilot / claude.ai / gemini / chatgpt / openai** を含む

それぞれの **セッション数** と **app_store_click イベント数** を転記する。
`id` は週次レポートの固定 roster（ai-assistant / copilot / claude.ai / gemini /
chatgpt / openai / other）と一致させる。roster に無いAI参照元は `other` に合算し、
恒常化したら roster への昇格を週次レポート側に提案する。

```json
{
  "window": "2026-07-21..2026-08-20",
  "source": "GA4 探索（2026-08-20閲覧）",
  "rows": [
    { "id": "ai-assistant", "sessions": 0, "app_store_clicks": 0 },
    { "id": "copilot",      "sessions": 0, "app_store_clicks": 0 },
    { "id": "claude.ai",    "sessions": 0, "app_store_clicks": 0 },
    { "id": "gemini",       "sessions": 0, "app_store_clicks": 0 },
    { "id": "chatgpt",      "sessions": 0, "app_store_clicks": 0 },
    { "id": "openai",       "sessions": 0, "app_store_clicks": 0 },
    { "id": "other",        "sessions": 0, "app_store_clicks": 0 }
  ]
}
```

- 「AI Assistantチャネル」と「AI参照ドメイン」は**重なりうる**（GA4のチャネル定義次第）。
  合算せず別行のまま読むこと。
- 参考ベースライン（GA4 30日 2026-07-21..08-20・v4 §2-5）: AI経由 約30セッション/月・
  平均エンゲージ 75.9秒＝全チャネル最長。Copilot の源泉 Bing は別途 95セッション/月。
- 過去分を残したいときは `ai-channel-YYYY-MM-DD.json` として複製してから上書きする。
