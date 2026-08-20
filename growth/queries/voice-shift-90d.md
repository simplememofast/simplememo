# 音声シフト調査 — 90日窓メタデータ集計ランブック（v4 R7② / 弾薬庫案4の土台）

**目的:** /data/voice-shift/ に掲載する4つの集計を、誰が回しても同じ定義で再実行できるようにする。
**データ源:** simplememo-api の D1 `app_analytics_events`（本文非閲覧設計 — メモ本文・生メール・PIIは
一切保存されていない。長さは `memo_length_bucket` のバケットのみ）。
**実行者:** ADMIN_API_KEY または wrangler d1 アクセスを持つオーナー。この環境からは実行できない。
**初回の正史窓:** 2026-08-27以降に、`--to` を実行日の3日前（イベント到着遅延の保守分）として実行する。

---

## 0. 共通の定義（ページに載せる定義と一字一句揃える）

| 用語 | 定義 |
|---|---|
| 窓 | `--from`〜`--to`（両端含む・UTC日付）。標準は直近90日 |
| 新規install | 窓内に `app_first_open` を発火した `anonymous_install_id` |
| first send | そのinstallの最初の `first_memo_send_success` イベント |
| 初日 | そのinstallの `app_first_open` と同じ**JST日付**（UTC+9で日付を切る） |
| 内部除外 | `resolveAnalyticsInternalAccounts` と同一の集合（静的ID ∪ send_correlation×内部メールハッシュの解決分）を除外。**既定で除外ON** |
| n | 各表の分母となるinstall数またはイベント数。**nが30未満の表は公開しない** |

内部除外CTE（全クエリ共通・`src/analytics.ts` のresolverと同じ結合）:

```sql
-- :internal_hashes = ANALYTICS_INTERNAL_EMAIL_HASHES（env・オーナー保持）
-- :internal_ids    = ANALYTICS_INTERNAL_INSTALL_IDS（env・静的リスト）
WITH internal_installs AS (
  SELECT DISTINCT e.anonymous_install_id AS iid
  FROM app_analytics_events e
  WHERE CAST(json_extract(e.properties_json,'$.client_send_id') AS TEXT) IN (
    SELECT message_id FROM send_correlation WHERE email_hash IN (:internal_hashes)
  )
  UNION SELECT value FROM json_each(:internal_ids)
),
new_installs AS (
  SELECT anonymous_install_id AS iid, MIN(server_timestamp) AS first_open_ts
  FROM app_analytics_events
  WHERE event_name = 'app_first_open'
    AND server_timestamp BETWEEN :from_ms AND :to_ms
    AND anonymous_install_id NOT IN (SELECT iid FROM internal_installs)
  GROUP BY 1
)
```

実行方法（例・本番D1に読み取りのみ）:

```sh
wrangler d1 execute simplememo_reminders --remote --env production --command "<SQL>"
```

---

## 1. first send 入力方法比率（install単位）

```sql
SELECT method, COUNT(*) AS installs
FROM (
  SELECT e.anonymous_install_id,
         COALESCE(CAST(json_extract(e.properties_json,'$.input_method') AS TEXT), 'unknown') AS method,
         ROW_NUMBER() OVER (PARTITION BY e.anonymous_install_id ORDER BY e.server_timestamp) AS rn
  FROM app_analytics_events e
  JOIN new_installs n ON n.iid = e.anonymous_install_id
  WHERE e.event_name = 'first_memo_send_success'
)
WHERE rn = 1
GROUP BY method ORDER BY installs DESC;
```

- 分母n = first send到達install数（rn=1の総数）。
- `input_method` は iOS v3.7.0 以降のみ付与。v3.7未満のinstallは `unknown` に落ちる——
  **unknownを除外して比率を出さない**。unknown込みの表とunknownの内訳注記をそのまま公開する。

## 2. 初日メモ文字数分布（イベント単位・バケットのみ）

```sql
SELECT COALESCE(CAST(json_extract(e.properties_json,'$.memo_length_bucket') AS TEXT),'(なし)') AS bucket,
       COUNT(*) AS events
FROM app_analytics_events e
JOIN new_installs n ON n.iid = e.anonymous_install_id
WHERE e.event_name IN ('first_memo_send_success','memo_send_success')
  AND date(e.server_timestamp/1000,'unixepoch','+9 hours')
      = date(n.first_open_ts/1000,'unixepoch','+9 hours')
GROUP BY bucket ORDER BY events DESC;
```

- 文字数は**クライアント側でバケット化された値しか存在しない**（本文非閲覧設計の帰結）。
  バケット境界はiOS実装の定義をページの脚注に転記すること。

## 3. 時間帯分布（JST・送信イベント単位）

```sql
SELECT CAST(strftime('%H', datetime(e.server_timestamp/1000,'unixepoch','+9 hours')) AS INTEGER) AS jst_hour,
       COUNT(*) AS events
FROM app_analytics_events e
JOIN new_installs n ON n.iid = e.anonymous_install_id
WHERE e.event_name IN ('first_memo_send_success','memo_send_success')
GROUP BY jst_hour ORDER BY jst_hour;
```

- server_timestamp基準（クライアント時計の狂いを避ける）。海外installが混ざるとJST変換が
  ずれるため、`locale` 別の感度確認を1回付ける（ja比率をページ脚注に併記）。

## 4. Obsidian併用率（install単位）

```sql
SELECT
  (SELECT COUNT(*) FROM new_installs) AS new_installs,
  COUNT(DISTINCT e.anonymous_install_id) AS obsidian_configured
FROM app_analytics_events e
JOIN new_installs n ON n.iid = e.anonymous_install_id
WHERE e.event_name = 'obsidian_configured';
```

---

## 5. 結果の置き場と公開手順

1. 結果を `growth/data/research/voice-shift-90d.json` に転記（書式は同ディレクトリREADME）。
   窓・n・実行日・内部除外の resolved/configured 数も必ず記録する。
2. `/data/voice-shift/index.html` の各表を値で埋め、ページ内の「最終集計」スタンプを更新する。
3. llms.txt の該当行の注記（「数値未掲載」）を外す。
4. 集計定義を変えた場合は**旧定義の表を消さず**、更新履歴に定義変更として残す（このページは
   定義を事前公開しているのが信頼の根拠なので、黙って差し替えた瞬間に価値が消える）。

**やらないこと:** 生値（--include-internal相当）での公開／n<30の表の公開／
バケットより細かい粒度の推定（「平均◯文字」は算出できない設計であり、しない）。

**将来の置き換え:** この4クエリを `/admin/analytics/voice-shift` エンドポイントに固めるのが
きれいな最終形（resolverを自動で通せる）。実装する場合は simplememo-api 側で別PR
（VISION §14の論点に触れない読み取り専用集計なので衝突はない）。
