-- BigQuery Standard SQL. Fixed read-only diagnosis, not a landing-page repair.
-- Same JST session-start cohort and 24-hour page-view window as ga4-funnel.sql.
-- A session_start URL is a candidate only when no page_view was observed in
-- the post-start 24-hour window. An out-of-window page_view may still exist; it
-- never replaces the observed landing in the funnel or clears its quality gate.
-- Only fixed path categories are emitted. No paths, user/session IDs, or URLs leave BQ.
-- @start_date/@end_date DATE; @measurement_version STRING ('2026-09-05').
WITH extracted AS (
  SELECT
    stream_id, user_pseudo_id, event_timestamp, event_name,
    batch_page_id, batch_ordering_id, batch_event_index,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'measurement_version') AS measurement_version,
    JSON_VALUE(TO_JSON_STRING(session_traffic_source_last_click),
      '$.cross_channel_campaign.default_channel_group') AS default_channel_group
  FROM `yurika-simplememo.analytics_524656334.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', @start_date)
    AND FORMAT_DATE('%Y%m%d', DATE_ADD(@end_date, INTERVAL 1 DAY))
    AND REGEXP_CONTAINS(_TABLE_SUFFIX, r'^[0-9]{8}$')
    AND stream_id = '13605182969' AND platform = 'WEB'
), identified AS (
  SELECT *,
    CASE WHEN NOT REGEXP_CONTAINS(COALESCE(page_location, ''), r'(?i)^https?://')
           OR NET.HOST(page_location) IS NULL THEN 'missing_or_invalid'
         WHEN REGEXP_CONTAINS(LOWER(NET.HOST(page_location)), r'^(www\.)?simplememofast\.com$') THEN 'production'
         ELSE 'nonproduction' END AS location_scope,
    IF(REGEXP_CONTAINS(COALESCE(page_location, ''), r'(?i)^https?://')
      AND REGEXP_CONTAINS(LOWER(NET.HOST(page_location)), r'^(www\.)?simplememofast\.com$')
      AND LENGTH(COALESCE(NULLIF(REGEXP_EXTRACT(page_location, r'(?i)^https?://[^/]+([^?#]*)'), ''), '/')) <= 250
      AND REGEXP_CONTAINS(COALESCE(NULLIF(REGEXP_EXTRACT(page_location, r'(?i)^https?://[^/]+([^?#]*)'), ''), '/'),
        r'^/[A-Za-z0-9/_-]*(?:\.html)?$'),
      COALESCE(NULLIF(REGEXP_EXTRACT(page_location, r'(?i)^https?://[^/]+([^?#]*)'), ''), '/'), NULL) AS safe_path
  FROM extracted
  WHERE NULLIF(user_pseudo_id, '') IS NOT NULL AND session_id IS NOT NULL
), starts AS (
  SELECT stream_id, user_pseudo_id, session_id, MIN(event_timestamp) AS started_at,
    ARRAY_AGG(STRUCT(location_scope AS scope, safe_path AS path) IGNORE NULLS
      ORDER BY event_timestamp, batch_page_id, batch_ordering_id, batch_event_index LIMIT 1)[SAFE_OFFSET(0)] AS start_location
  FROM identified
  WHERE event_name = 'session_start' AND event_timestamp IS NOT NULL
  GROUP BY stream_id, user_pseudo_id, session_id
), windowed AS (
  SELECT e.*, s.started_at, s.start_location
  FROM identified e JOIN starts s USING (stream_id, user_pseudo_id, session_id)
  WHERE DATE(TIMESTAMP_MICROS(s.started_at), 'Asia/Tokyo') BETWEEN @start_date AND @end_date
    AND e.event_timestamp >= s.started_at
    AND e.event_timestamp < s.started_at + 86400000000
), per_session AS (
  SELECT stream_id, user_pseudo_id, session_id,
    ANY_VALUE(start_location) AS start_location,
    ARRAY_AGG(IF(event_name = 'page_view', STRUCT(location_scope AS scope, safe_path AS path), NULL)
      IGNORE NULLS ORDER BY event_timestamp, batch_page_id, batch_ordering_id, batch_event_index LIMIT 1
    )[SAFE_OFFSET(0)] AS first_view,
    COUNT(DISTINCT NULLIF(default_channel_group, '')) AS channel_values,
    MAX(NULLIF(default_channel_group, '')) AS channel_value,
    COUNTIF(event_name = 'seo_cta_impression' AND location_scope = 'production'
      AND measurement_version = @measurement_version) > 0 AS saw_cta
  FROM windowed
  GROUP BY stream_id, user_pseudo_id, session_id
), classified AS (
  SELECT *,
    CASE WHEN channel_values = 0 THEN '(missing session channel)'
         WHEN channel_values > 1 THEN '(conflicting session channels)'
         ELSE channel_value END AS session_channel,
    CASE WHEN first_view IS NULL THEN 'missing_page_view_24h'
         ELSE 'observed_page_view_24h' END AS page_view_status
  FROM per_session
)
SELECT
  session_channel,
  page_view_status,
  start_location.scope AS start_location_scope,
  IF(first_view IS NULL AND start_location.scope = 'production' AND start_location.path IS NOT NULL,
    CASE WHEN start_location.path = '/' THEN 'root'
         WHEN REGEXP_CONTAINS(LOWER(start_location.path), r'(^|[/_-])obsidian([/_-]|$)') THEN 'obsidian_path'
         ELSE 'other_production_path' END, NULL) AS candidate_start_group,
  COUNT(*) AS observed_started_sessions,
  COUNTIF(first_view IS NOT NULL AND start_location.scope = 'production' AND first_view.scope = 'production'
    AND start_location.path IS NOT NULL AND start_location.path = first_view.path) AS start_path_matches_page_view,
  COUNTIF(first_view IS NOT NULL AND start_location.scope = 'production' AND first_view.scope = 'production'
    AND start_location.path IS NOT NULL AND first_view.path IS NOT NULL
    AND start_location.path != first_view.path) AS start_path_differs_from_page_view,
  COUNTIF(first_view IS NOT NULL AND (start_location.scope != 'production' OR first_view.scope != 'production'
    OR start_location.path IS NULL OR first_view.path IS NULL)) AS start_path_not_comparable,
  COUNTIF(saw_cta) AS sessions_with_cta_impression
FROM classified
GROUP BY session_channel, page_view_status, start_location_scope, candidate_start_group
ORDER BY observed_started_sessions DESC, session_channel, candidate_start_group;
