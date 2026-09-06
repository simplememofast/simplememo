-- SQLite / Cloudflare D1; aggregate only. v2 is exploratory, not preregistered.
-- Parameters: UTC from-inclusive ms, to-exclusive ms, internal IDs JSON,
-- internal email hashes JSON. Never commit parameter values or raw results.
-- Reads all retained pre-end history for prior-open/save diagnostics, then
-- limits all reported activity to the cohort window. No lifetime-new claim.
WITH
params AS (SELECT CAST(? AS INTEGER) AS from_ms, CAST(? AS INTEGER) AS to_ms),
internal AS MATERIALIZED (
  SELECT value AS iid FROM json_each(?)
  UNION
  SELECT DISTINCT e.anonymous_install_id
  FROM app_analytics_events e
  WHERE CAST(json_extract(e.properties_json, '$.client_send_id') AS TEXT) IN (
    SELECT message_id FROM send_correlation
    WHERE email_hash IN (SELECT value FROM json_each(?))
  )
),
opens AS MATERIALIZED (
  SELECT anonymous_install_id AS iid, MIN(server_timestamp) AS t0,
    COUNT(*) AS open_count
  FROM app_analytics_events, params
  WHERE event_name = 'app_first_open' AND server_timestamp < to_ms
  GROUP BY anonymous_install_id
  HAVING MIN(server_timestamp) >= from_ms AND MIN(server_timestamp) < to_ms
),
save_history AS MATERIALIZED (
  SELECT anonymous_install_id AS iid, MIN(server_timestamp) AS first_save
  FROM app_analytics_events, params
  WHERE event_name IN ('memo_send_success', 'obsidian_only_memo_saved')
    AND server_timestamp < to_ms
  GROUP BY anonymous_install_id
),
cohort_diagnostic AS MATERIALIZED (
  SELECT o.*,
    EXISTS(SELECT 1 FROM internal i WHERE i.iid = o.iid) AS is_internal,
    COALESCE(s.first_save < o.t0, 0) AS has_presave
  FROM opens o LEFT JOIN save_history s ON s.iid = o.iid
),
cohort AS MATERIALIZED (
  SELECT * FROM cohort_diagnostic
  WHERE NOT is_internal AND open_count = 1 AND NOT has_presave
),
capture_candidates AS MATERIALIZED (
  SELECT e.id, e.event_id, e.anonymous_install_id AS iid, e.server_timestamp AS ts,
    e.event_name, e.properties_json, e.locale, c.t0,
    NULLIF(TRIM(CAST(json_extract(e.properties_json, '$.client_send_id') AS TEXT)), '') AS send_id
  FROM app_analytics_events e JOIN cohort c ON e.anonymous_install_id = c.iid
  CROSS JOIN params p
  WHERE e.event_name IN ('memo_send_success', 'obsidian_only_memo_saved')
    AND e.server_timestamp >= c.t0 AND e.server_timestamp < p.to_ms
),
ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY iid,
    CASE WHEN send_id IS NOT NULL THEN 'send:' || send_id ELSE 'event:' || event_id END
    ORDER BY ts, id) AS duplicate_rank
  FROM capture_candidates
),
captures AS MATERIALIZED (
  SELECT *,
    CASE WHEN json_extract(properties_json, '$.input_method') IN
      ('keyboard', 'voice', 'paste', 'sample_chip', 'watch', 'siri', 'share_extension')
      THEN json_extract(properties_json, '$.input_method') ELSE 'unknown' END AS method,
    CASE WHEN json_extract(properties_json, '$.memo_length_bucket') IN
      ('0', '1-10', '11-50', '51-200', '201+')
      THEN json_extract(properties_json, '$.memo_length_bucket') ELSE 'unknown' END AS bucket,
    -- locale is a top-level D1 column populated from the event envelope.
    CASE WHEN locale = 'ja' OR substr(locale, 1, 3) IN ('ja-', 'ja_') THEN 1 ELSE 0 END AS is_ja,
    CASE WHEN NULLIF(TRIM(locale), '') IS NULL
      THEN 1 ELSE 0 END AS locale_missing
  FROM ranked WHERE duplicate_rank = 1
),
first_capture AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY iid ORDER BY ts, id) AS first_rank
  FROM captures
),
state_events AS MATERIALIZED (
  SELECT e.anonymous_install_id AS iid, e.server_timestamp AS ts,
    json_type(e.properties_json, '$.value') AS value_type
  FROM app_analytics_events e, params p
  WHERE e.event_name = 'obsidian_configured'
    AND e.server_timestamp >= p.from_ms AND e.server_timestamp < p.to_ms
),
obsidian AS MATERIALIZED (
  SELECT c.iid,
    MAX(CASE WHEN e.value_type IN ('true', 'false') THEN 1 ELSE 0 END) AS known,
    MAX(CASE WHEN e.value_type = 'true' THEN 1 ELSE 0 END) AS ever_enabled
  FROM cohort c
  LEFT JOIN state_events e ON e.iid = c.iid AND e.ts >= c.t0
  GROUP BY c.iid
),
summary AS (
  SELECT json_object(
    'protocol', 'voice-shift-v2-exploratory',
    'from_inclusive_ms', (SELECT from_ms FROM params),
    'to_exclusive_ms', (SELECT to_ms FROM params),
    'candidate_installs', (SELECT COUNT(*) FROM cohort_diagnostic),
    'excluded_internal_installs', (SELECT COUNT(*) FROM cohort_diagnostic WHERE is_internal),
    'repeated_open_noninternal', (SELECT COUNT(*) FROM cohort_diagnostic WHERE NOT is_internal AND open_count > 1),
    'presave_noninternal', (SELECT COUNT(*) FROM cohort_diagnostic WHERE NOT is_internal AND has_presave),
    'excluded_ambiguous_noninternal_union', (SELECT COUNT(*) FROM cohort_diagnostic WHERE NOT is_internal AND (open_count > 1 OR has_presave)),
    'cohort_installs', (SELECT COUNT(*) FROM cohort),
    'capture_rows_before_dedupe', (SELECT COUNT(*) FROM capture_candidates),
    'capture_events', (SELECT COUNT(*) FROM captures),
    'capture_rows_without_send_id', (SELECT COUNT(*) FROM capture_candidates WHERE send_id IS NULL),
    'first_capture_installs', (SELECT COUNT(*) FROM first_capture WHERE first_rank = 1),
    'day0_events', (SELECT COUNT(*) FROM captures WHERE date(ts/1000, 'unixepoch', '+9 hours') = date(t0/1000, 'unixepoch', '+9 hours')),
    'day0_contributing_installs', (SELECT COUNT(DISTINCT iid) FROM captures WHERE date(ts/1000, 'unixepoch', '+9 hours') = date(t0/1000, 'unixepoch', '+9 hours')),
    'ja_locale_events', (SELECT COALESCE(SUM(is_ja), 0) FROM captures),
    'locale_missing_events', (SELECT COALESCE(SUM(locale_missing), 0) FROM captures),
    'obsidian_known_installs', (SELECT COALESCE(SUM(known), 0) FROM obsidian),
    'obsidian_enabled_installs', (SELECT COALESCE(SUM(ever_enabled), 0) FROM obsidian)
  ) AS value
),
output AS (
  SELECT 'summary' AS report, 'all' AS category, NULL AS n, value AS details FROM summary
  UNION ALL
  SELECT 'first_capture_input_tag', method, COUNT(*), NULL FROM first_capture
    WHERE first_rank = 1 GROUP BY method
  UNION ALL
  SELECT 'day0_length_bucket', bucket, COUNT(*), NULL FROM captures
    WHERE date(ts/1000, 'unixepoch', '+9 hours') = date(t0/1000, 'unixepoch', '+9 hours') GROUP BY bucket
  UNION ALL
  SELECT 'receipt_jst_hour', strftime('%H', ts/1000, 'unixepoch', '+9 hours'), COUNT(*), NULL
    FROM captures GROUP BY strftime('%H', ts/1000, 'unixepoch', '+9 hours')
  UNION ALL
  SELECT 'capture_route', event_name, COUNT(*), NULL FROM captures GROUP BY event_name
)
SELECT * FROM output ORDER BY report, category;
