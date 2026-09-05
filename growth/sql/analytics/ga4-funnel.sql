-- BigQuery Standard SQL. PREPARED, NOT LIVE-VALIDATED.
-- Metric: observed sessions starting in the inclusive JST window that record
-- an own-app CTA click in the same session within 24 hours of session_start.
-- This is an explicitly bounded cohort metric, not a claim of GA4 UI parity.
-- @start_date / @end_date DATE, @measurement_version STRING ('2026-09-05').
-- Start >= 2026-09-06 and >= first complete export day. End <= today JST - 5.
-- All daily tables through end + 1 must be present and pass query 01/02.
-- Do NOT filter page_view/session_start on measurement_version: those standard
-- events do not carry the CTA parameter, and non-clickers are the denominator.
WITH extracted AS (
  SELECT
    stream_id, user_pseudo_id, event_timestamp, event_name,
    batch_page_id, batch_ordering_id, batch_event_index,
    device.category AS device_category,
    device.language AS device_language,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'measurement_version') AS measurement_version,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'link_url') AS link_url,
    JSON_VALUE(TO_JSON_STRING(session_traffic_source_last_click),
      '$.cross_channel_campaign.default_channel_group') AS default_channel_group
  FROM `yurika-simplememo.analytics_524656334.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', @start_date)
    AND FORMAT_DATE('%Y%m%d', DATE_ADD(@end_date, INTERVAL 1 DAY))
    AND REGEXP_CONTAINS(_TABLE_SUFFIX, r'^[0-9]{8}$')
    AND stream_id = '13605182969' AND platform = 'WEB'
), identified AS (
  SELECT *,
    REGEXP_CONTAINS(LOWER(NET.HOST(page_location)), r'^(www\.)?simplememofast\.com$') AS production_event
  FROM extracted
  WHERE NULLIF(user_pseudo_id, '') IS NOT NULL AND session_id IS NOT NULL
), starts AS (
  SELECT stream_id, user_pseudo_id, session_id, MIN(event_timestamp) AS started_at
  FROM identified
  WHERE event_name = 'session_start'
  GROUP BY stream_id, user_pseudo_id, session_id
), windowed AS (
  SELECT e.*, s.started_at
  FROM identified e
  JOIN starts s USING (stream_id, user_pseudo_id, session_id)
  WHERE DATE(TIMESTAMP_MICROS(s.started_at), 'Asia/Tokyo') BETWEEN @start_date AND @end_date
    AND e.event_timestamp >= s.started_at
    AND e.event_timestamp < s.started_at + 86400000000
), per_session AS (
  SELECT
    stream_id, user_pseudo_id, session_id,
    ARRAY_AGG(IF(event_name = 'page_view', STRUCT(
      production_event AS is_production,
      COALESCE(NULLIF(REGEXP_EXTRACT(page_location, r'^https?://[^/]+([^?#]*)'), ''), '/') AS path,
      device_category AS device_category,
      device_language AS device_language
    ), NULL) IGNORE NULLS
      ORDER BY event_timestamp, batch_page_id, batch_ordering_id, batch_event_index LIMIT 1
    )[SAFE_OFFSET(0)] AS landing,
    COUNT(DISTINCT NULLIF(default_channel_group, '')) AS channel_values,
    MAX(NULLIF(default_channel_group, '')) AS channel_value,
    COUNTIF(event_name = 'seo_cta_impression' AND production_event
      AND measurement_version = @measurement_version) > 0 AS saw_cta,
    -- Only app_store_click is counted. seo_cta_click is its mirrored payload.
    COUNTIF(event_name = 'app_store_click' AND production_event
      AND measurement_version = @measurement_version
      AND LOWER(NET.HOST(link_url)) = 'apps.apple.com'
      AND REGEXP_CONTAINS(REGEXP_EXTRACT(link_url, r'^https://[^/]+([^?#]*)'), r'/id6758438948(?:/|$)')) > 0 AS clicked_own_app
  FROM windowed
  GROUP BY stream_id, user_pseudo_id, session_id
), classified AS (
  SELECT *,
    CASE WHEN channel_values = 0 THEN '(missing session channel)'
         WHEN channel_values > 1 THEN '(conflicting session channels)'
         ELSE channel_value END AS session_channel,
    CASE WHEN landing IS NULL THEN 'missing_landing_page'
         WHEN landing.is_production IS NULL THEN 'missing_hostname'
         WHEN landing.is_production THEN 'production'
         ELSE 'nonproduction' END AS landing_scope
  FROM per_session
)
SELECT
  session_channel,
  landing_scope,
  landing.path AS landing_path,
  landing.device_category AS device_category,
  landing.device_language AS device_language,
  COUNT(*) AS observed_started_sessions,
  COUNTIF(saw_cta) AS sessions_with_cta_impression,
  COUNTIF(clicked_own_app) AS sessions_with_own_app_click_24h,
  COUNTIF(clicked_own_app AND NOT saw_cta) AS clicked_without_recorded_impression,
  SAFE_DIVIDE(COUNTIF(clicked_own_app), COUNT(*)) AS own_app_click_session_rate_24h,
  SAFE_DIVIDE(COUNTIF(clicked_own_app AND saw_cta), COUNTIF(saw_cta)) AS clicked_among_cta_exposed_sessions
FROM classified
-- Keep missing/conflicting channels and nonproduction as visible QA rows.
-- The SEO scorecard uses only session_channel='Organic Search' AND
-- landing_scope='production', after the missing-data review.
GROUP BY session_channel, landing_scope, landing_path, device_category, device_language
ORDER BY observed_started_sessions DESC;
