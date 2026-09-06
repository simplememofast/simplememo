-- BigQuery Standard SQL. PREPARED, NOT LIVE-VALIDATED.
-- Existing next_step_* events and page_view referrers only; no identity joins.
-- Raw event dates and started-session cohort dates are separate row types.
-- Session counts use starts in the JST window and [start, start + 24 hours).
-- The following daily table is required by the reader; @start_date/@end_date
-- are DATE and @measurement_version is STRING. Same five-day wait as funnel.
-- No user/session IDs, full URLs, queries, fragments or external paths output.
WITH extracted AS (
  SELECT
    stream_id, user_pseudo_id, event_timestamp, event_name,
    (SELECT p.value.int_value FROM UNNEST(event_params) AS p WHERE p.key = 'ga_session_id') AS session_id,
    (SELECT p.value.string_value FROM UNNEST(event_params) AS p WHERE p.key = 'page_location') AS page_location,
    (SELECT p.value.string_value FROM UNNEST(event_params) AS p WHERE p.key = 'page_referrer') AS page_referrer,
    (SELECT p.value.string_value FROM UNNEST(event_params) AS p WHERE p.key = 'page_path') AS page_path,
    (SELECT p.value.string_value FROM UNNEST(event_params) AS p WHERE p.key = 'to') AS card_target,
    (SELECT p.value.string_value FROM UNNEST(event_params) AS p WHERE p.key = 'stage') AS card_stage,
    (SELECT p.value.string_value FROM UNNEST(event_params) AS p WHERE p.key = 'measurement_version') AS measurement_version
  FROM `yurika-simplememo.analytics_524656334.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', @start_date)
    AND FORMAT_DATE('%Y%m%d', DATE_ADD(@end_date, INTERVAL 1 DAY))
    AND REGEXP_CONTAINS(_TABLE_SUFFIX, r'^[0-9]{8}$')
    AND stream_id = '13605182969' AND platform = 'WEB'
    AND event_name IN ('session_start', 'page_view', 'next_step_click', 'next_step_impression')
), starts AS (
  SELECT stream_id, user_pseudo_id, session_id, MIN(event_timestamp) AS started_at
  FROM extracted
  WHERE event_name = 'session_start'
    AND NULLIF(user_pseudo_id, '') IS NOT NULL AND session_id IS NOT NULL
  GROUP BY stream_id, user_pseudo_id, session_id
), urls AS (
  SELECT e.*, s.started_at,
    DATE(TIMESTAMP_MICROS(event_timestamp), 'Asia/Tokyo') AS event_day,
    DATE(TIMESTAMP_MICROS(s.started_at), 'Asia/Tokyo') AS cohort_day,
    IF(event_name = 'page_view', 'referrer_arrival', 'card') AS route_kind,
    NULLIF(TRIM(page_location), '') AS location_url,
    NULLIF(TRIM(page_referrer), '') AS referrer_url,
    -- Current cards use root-relative or HTTP(S) URLs. Do not guess browser
    -- resolution for protocol-relative, fragment-only or other relative links.
    CASE WHEN REGEXP_CONTAINS(TRIM(card_target), r'^/(?:[^/]|$)')
           THEN CONCAT('https://simplememofast.com', TRIM(card_target))
         ELSE NULLIF(TRIM(card_target), '') END AS target_url
  FROM extracted e LEFT JOIN starts s USING (stream_id, user_pseudo_id, session_id)
  WHERE event_name != 'session_start'
), parsed AS (
  SELECT *,
    CASE WHEN location_url IS NULL THEN 'missing'
         WHEN REGEXP_CONTAINS(location_url, r'(?i)^https?://(?:www\.)?simplememofast\.com(?:/|[?#]|$)') THEN 'production'
         WHEN REGEXP_CONTAINS(location_url, r'(?i)^https?://[^/?#\s]+(?:/|[?#]|$)') THEN 'nonproduction'
         ELSE 'invalid' END AS page_scope,
    CASE WHEN referrer_url IS NULL THEN 'missing'
         WHEN REGEXP_CONTAINS(referrer_url, r'(?i)^https?://(?:www\.)?simplememofast\.com(?:/|[?#]|$)') THEN 'internal'
         WHEN REGEXP_CONTAINS(referrer_url, r'(?i)^https?://[^/?#\s]+(?:/|[?#]|$)') THEN 'external'
         ELSE 'invalid' END AS referrer_status,
    CASE WHEN target_url IS NULL THEN 'missing'
         WHEN REGEXP_CONTAINS(target_url, r'(?i)^https?://(?:www\.)?simplememofast\.com(?:/|[?#]|$)') THEN 'internal'
         WHEN REGEXP_CONTAINS(target_url, r'(?i)^https?://[^/?#\s]+(?:/|[?#]|$)') THEN 'external'
         ELSE 'invalid_or_unsupported_relative' END AS target_status,
    COALESCE(NULLIF(REGEXP_EXTRACT(location_url, r'(?i)^https?://[^/?#]+([^?#]*)'), ''), '/') AS location_path,
    COALESCE(NULLIF(REGEXP_EXTRACT(referrer_url, r'(?i)^https?://[^/?#]+([^?#]*)'), ''), '/') AS referrer_path,
    COALESCE(NULLIF(REGEXP_EXTRACT(target_url, r'(?i)^https?://[^/?#]+([^?#]*)'), ''), '/') AS target_path
  FROM urls
), dimensions AS (
  SELECT *,
    -- Only site-shaped paths are emitted. Unusual/encoded paths remain QA,
    -- and are not silently decoded or canonicalized into a different route.
    IF(page_scope = 'production' AND LENGTH(location_path) <= 250
      AND REGEXP_CONTAINS(location_path, r'^/[A-Za-z0-9/_-]*(?:\.html)?$'), location_path, NULL) AS safe_page_path,
    IF(referrer_status = 'internal' AND LENGTH(referrer_path) <= 250
      AND REGEXP_CONTAINS(referrer_path, r'^/[A-Za-z0-9/_-]*(?:\.html)?$'), referrer_path, NULL) AS safe_referrer_path,
    IF(target_status = 'internal' AND LENGTH(target_path) <= 250
      AND REGEXP_CONTAINS(target_path, r'^/[A-Za-z0-9/_-]*(?:\.html)?$'), target_path, NULL) AS safe_target_path,
    CASE WHEN route_kind != 'card' THEN 'not_applicable'
         WHEN NULLIF(TRIM(card_stage), '') IS NULL OR card_stage = '(unset)' THEN '(missing)'
         WHEN card_stage IN ('compare', 'confirm', 'devlog', 'explore', 'feature', 'method', 'obsidian') THEN card_stage
         ELSE '(other)' END AS stage,
    CASE WHEN route_kind != 'card' THEN 'not_applicable'
         WHEN measurement_version = @measurement_version THEN 'current'
         WHEN NULLIF(TRIM(measurement_version), '') IS NULL THEN 'missing'
         ELSE 'other' END AS version_status,
    CASE WHEN route_kind != 'card' THEN 'not_applicable'
         WHEN NULLIF(page_path, '') IS NULL THEN 'missing'
         WHEN page_path = location_path THEN 'matches'
         ELSE 'conflicting' END AS card_page_path_status,
    NULLIF(user_pseudo_id, '') IS NULL OR session_id IS NULL AS missing_session_key,
    IFNULL(cohort_day BETWEEN @start_date AND @end_date
      AND event_timestamp >= started_at
      AND event_timestamp < started_at + 86400000000, FALSE) AS in_started_cohort_24h
  FROM parsed
), routes AS (
  SELECT *,
    IF(route_kind = 'card', safe_page_path, safe_referrer_path) AS from_path,
    IF(route_kind = 'card', safe_target_path, safe_page_path) AS to_path,
    IF(route_kind = 'card', target_status, referrer_status) AS route_status
  FROM dimensions
), scoped AS (
  SELECT *,
    CASE WHEN page_scope = 'production' AND from_path IS NOT NULL AND to_path IS NOT NULL
           AND (route_kind != 'card' OR (stage NOT IN ('(missing)', '(other)')
             AND version_status = 'current' AND card_page_path_status = 'matches'))
         THEN 'production_internal' ELSE 'quality_or_context' END AS row_scope
  FROM routes
), event_counts AS (
  SELECT
    'event_day' AS date_basis, event_day AS report_date, route_kind, row_scope,
    page_scope, from_path, to_path, route_status, stage, version_status, card_page_path_status,
    COUNT(*) AS recorded_events,
    COUNTIF(event_name = 'next_step_click') AS recorded_card_clicks,
    COUNTIF(event_name = 'next_step_impression') AS recorded_card_impressions,
    COUNTIF(missing_session_key) AS events_without_session_key,
    COUNTIF(NOT in_started_cohort_24h) AS events_outside_started_cohort_24h,
    CAST(NULL AS INT64) AS observed_route_sessions_24h,
    CAST(NULL AS INT64) AS sessions_with_card_click,
    CAST(NULL AS INT64) AS sessions_with_card_impression,
    CAST(NULL AS INT64) AS clicked_without_recorded_impression,
    CAST(NULL AS INT64) AS first_click_before_first_impression,
    CAST(NULL AS INT64) AS first_click_tied_with_first_impression
  FROM scoped
  WHERE event_day BETWEEN @start_date AND @end_date
  GROUP BY report_date, route_kind, row_scope, page_scope, from_path, to_path,
    route_status, stage, version_status, card_page_path_status
), per_session_route AS (
  SELECT
    cohort_day, route_kind, row_scope, page_scope, from_path, to_path,
    route_status, stage, version_status, card_page_path_status,
    stream_id, user_pseudo_id, session_id,
    COUNTIF(event_name = 'next_step_click') > 0 AS clicked,
    COUNTIF(event_name = 'next_step_impression') > 0 AS impressed,
    MIN(IF(event_name = 'next_step_click', event_timestamp, NULL)) AS first_click,
    MIN(IF(event_name = 'next_step_impression', event_timestamp, NULL)) AS first_impression
  FROM scoped
  WHERE in_started_cohort_24h AND NOT missing_session_key
  GROUP BY cohort_day, route_kind, row_scope, page_scope, from_path, to_path,
    route_status, stage, version_status, card_page_path_status,
    stream_id, user_pseudo_id, session_id
), session_counts AS (
  SELECT
    'session_start_day_24h' AS date_basis, cohort_day AS report_date, route_kind, row_scope,
    page_scope, from_path, to_path, route_status, stage, version_status, card_page_path_status,
    CAST(NULL AS INT64) AS recorded_events,
    CAST(NULL AS INT64) AS recorded_card_clicks,
    CAST(NULL AS INT64) AS recorded_card_impressions,
    CAST(NULL AS INT64) AS events_without_session_key,
    CAST(NULL AS INT64) AS events_outside_started_cohort_24h,
    COUNT(*) AS observed_route_sessions_24h,
    IF(route_kind = 'card', COUNTIF(clicked), NULL) AS sessions_with_card_click,
    IF(route_kind = 'card', COUNTIF(impressed), NULL) AS sessions_with_card_impression,
    IF(route_kind = 'card', COUNTIF(clicked AND NOT impressed), NULL) AS clicked_without_recorded_impression,
    IF(route_kind = 'card', COUNTIF(IFNULL(first_click < first_impression, FALSE)), NULL) AS first_click_before_first_impression,
    -- Equal timestamps have unresolved order; do not infer one from ingestion
    -- order or combine different tabs into proof of a click-to-arrival chain.
    IF(route_kind = 'card', COUNTIF(IFNULL(first_click = first_impression, FALSE)), NULL) AS first_click_tied_with_first_impression
  FROM per_session_route
  GROUP BY report_date, route_kind, row_scope, page_scope, from_path, to_path,
    route_status, stage, version_status, card_page_path_status
)
SELECT * FROM event_counts
UNION ALL
SELECT * FROM session_counts
ORDER BY date_basis, report_date, route_kind, row_scope, from_path, to_path;
