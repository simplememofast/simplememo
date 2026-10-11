-- BigQuery Standard SQL. PREPARED, NOT LIVE-VALIDATED.
-- Descriptive click-page diagnostic only; no CTR/CVR, downloads, LTV or scoring.
-- @start_date/@end_date DATE: start >= 2026-10-01 JST, end <= today JST - 5.
-- Daily tables through end + 1, unchanged quality and funnel queries required.
-- @measurement_version STRING; @cta_page_manifest_json STRING is the exact
-- canonical CTA inventory of the query checkout, not historical deployment proof.
-- page_path must agree with the same click's production page_location path.
-- Never substitute landing, cluster, link token or a guessed alias for that path.
-- Page rows overlap across pages/statuses. Only session_group rows are disjoint;
-- 'both' explicitly retains sessions clicking both valid v1 link-page groups.
WITH extracted AS (
  SELECT stream_id, user_pseudo_id, event_timestamp, event_name,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_path') AS page_path,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'measurement_version') AS measurement_version,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'link_url') AS link_url,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'ct') AS campaign_payload,
    JSON_VALUE(TO_JSON_STRING(session_traffic_source_last_click),
      '$.cross_channel_campaign.default_channel_group') AS default_channel_group,
    NULLIF(TRIM(JSON_VALUE(TO_JSON_STRING(session_traffic_source_last_click),
      '$.cross_channel_campaign.source')), '') AS attributed_source,
    NULLIF(TRIM(JSON_VALUE(TO_JSON_STRING(session_traffic_source_last_click),
      '$.cross_channel_campaign.medium')), '') AS attributed_medium
  FROM `yurika-simplememo.analytics_524656334.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', @start_date)
    AND FORMAT_DATE('%Y%m%d', DATE_ADD(@end_date, INTERVAL 1 DAY))
    AND REGEXP_CONTAINS(_TABLE_SUFFIX, r'^[0-9]{8}$')
    AND stream_id = '13605182969' AND platform = 'WEB'
), identified AS (
  SELECT *,
    IF(attributed_source IS NULL AND attributed_medium IS NULL, NULL,
      TO_JSON_STRING(STRUCT(attributed_source AS source, attributed_medium AS medium))) AS attribution_pair
  FROM extracted
  WHERE NULLIF(user_pseudo_id, '') IS NOT NULL AND session_id IS NOT NULL
), starts AS (
  SELECT stream_id, user_pseudo_id, session_id, MIN(event_timestamp) AS started_at
  FROM identified WHERE event_name = 'session_start'
  GROUP BY stream_id, user_pseudo_id, session_id
), windowed AS (
  SELECT e.*, s.started_at
  FROM identified e JOIN starts s USING (stream_id, user_pseudo_id, session_id)
  WHERE DATE(TIMESTAMP_MICROS(s.started_at), 'Asia/Tokyo') BETWEEN @start_date AND @end_date
    AND e.event_timestamp >= s.started_at
    AND e.event_timestamp < s.started_at + 86400000000
), attribution AS (
  SELECT stream_id, user_pseudo_id, session_id,
    COUNT(DISTINCT NULLIF(default_channel_group, '')) AS channel_values,
    MAX(NULLIF(default_channel_group, '')) AS channel_value,
    COUNT(DISTINCT attribution_pair) AS attribution_values,
    MAX(attribution_pair) AS attribution_value
  FROM windowed GROUP BY stream_id, user_pseudo_id, session_id
), session_context AS (
  SELECT stream_id, user_pseudo_id, session_id,
    CASE WHEN channel_values = 0 THEN '(missing session channel)'
      WHEN channel_values > 1 THEN '(conflicting session channels)' ELSE channel_value END AS session_channel,
    CASE WHEN attribution_values = 0 THEN 'missing'
      WHEN attribution_values > 1 THEN 'conflicting'
      WHEN JSON_VALUE(attribution_value, '$.source') IS NULL
        OR JSON_VALUE(attribution_value, '$.medium') IS NULL THEN 'partial'
      ELSE 'available' END AS session_attribution_status,
    IF(attribution_values = 1, JSON_VALUE(attribution_value, '$.source'), NULL) AS session_source,
    IF(attribution_values = 1, JSON_VALUE(attribution_value, '$.medium'), NULL) AS session_medium
  FROM attribution
), page_map AS (
  SELECT JSON_VALUE(item, '$.path') AS path,
    JSON_VALUE(item, '$.expected_campaign') AS expected_campaign,
    JSON_VALUE(item, '$.group') AS page_group
  FROM UNNEST(JSON_QUERY_ARRAY(@cta_page_manifest_json)) AS item
), candidate_clicks AS (
  -- seo_cta_click mirrors this event and must never count a second time.
  -- OneLink/QA routes, other apps and other versions stay outside this report.
  SELECT *,
    REGEXP_CONTAINS(page_location, r'(?i)^https://(?:www\.)?simplememofast\.com(?:[/?#]|$)') AS production_page,
    COALESCE(NULLIF(REGEXP_EXTRACT(page_location, r'(?i)^https://[^/?#]+([^?#]*)'), ''), '/') AS location_path,
    REGEXP_EXTRACT_ALL(link_url, r'[?&]ct=([^&#]*)') AS link_campaigns
  FROM windowed
  WHERE event_name = 'app_store_click' AND measurement_version = @measurement_version
    AND REGEXP_CONTAINS(link_url, r'(?i)^https://apps\.apple\.com/')
    AND LOWER(NET.HOST(link_url)) = 'apps.apple.com'
    AND REGEXP_CONTAINS(REGEXP_EXTRACT(link_url, r'(?i)^https://[^/?#]+([^?#]*)'), r'/id6758438948(?:/|$)')
), resolved_clicks AS (
  SELECT c.stream_id, c.user_pseudo_id, c.session_id,
    -- Return only reviewed public canonical paths, never arbitrary event URLs.
    IF(c.production_page AND c.page_path = c.location_path, m.path, NULL) AS click_page_path,
    CASE WHEN c.page_location IS NULL OR c.page_location = '' THEN 'missing_page_location'
      WHEN NOT IFNULL(c.production_page, FALSE) THEN 'nonproduction_or_invalid_page_location'
      WHEN c.page_path IS NULL OR c.page_path = '' THEN 'missing_click_page_path'
      WHEN c.page_path != c.location_path THEN 'click_path_location_mismatch'
      WHEN m.path IS NULL THEN 'unmapped_click_page'
      WHEN m.page_group = 'excluded' THEN 'frozen_excluded_page'
      WHEN ARRAY_LENGTH(c.link_campaigns) = 0 THEN 'untagged_or_missing_campaign'
      WHEN ARRAY_LENGTH(c.link_campaigns) != 1 THEN 'ambiguous_link_campaign'
      WHEN c.link_campaigns[SAFE_OFFSET(0)] != m.expected_campaign THEN 'campaign_page_mismatch'
      WHEN c.campaign_payload IS NULL OR c.campaign_payload != m.expected_campaign THEN 'campaign_payload_mismatch'
      ELSE 'matched_v1_page' END AS page_status,
    m.page_group AS manifest_group
  FROM candidate_clicks c LEFT JOIN page_map m ON c.page_path = m.path
), clicks AS (
  SELECT *, IF(page_status = 'matched_v1_page', manifest_group, NULL) AS clicked_page_group
  FROM resolved_clicks
), per_session_page AS (
  SELECT stream_id, user_pseudo_id, session_id,
    click_page_path, page_status, clicked_page_group, COUNT(*) AS click_events
  FROM clicks GROUP BY stream_id, user_pseudo_id, session_id,
    click_page_path, page_status, clicked_page_group
), session_flags AS (
  SELECT s.*,
    COUNTIF(p.clicked_page_group = 'obsidian') > 0 AS clicked_obsidian,
    COUNTIF(p.clicked_page_group = 'other') > 0 AS clicked_other,
    COUNTIF(p.page_status = 'frozen_excluded_page') > 0 AS has_excluded_click,
    COUNTIF(p.page_status NOT IN ('matched_v1_page', 'frozen_excluded_page')) > 0 AS has_unresolved_click,
    COALESCE(SUM(p.click_events), 0) AS click_events
  FROM session_context s LEFT JOIN per_session_page p USING (stream_id, user_pseudo_id, session_id)
  GROUP BY s.stream_id, s.user_pseudo_id, s.session_id,
    s.session_channel, s.session_source, s.session_medium, s.session_attribution_status
), session_groups AS (
  SELECT *, CASE WHEN clicked_obsidian AND clicked_other THEN 'both'
    WHEN clicked_obsidian THEN 'obsidian_only' WHEN clicked_other THEN 'other_only'
    ELSE 'no_v1_group_click' END AS session_group
  FROM session_flags
)
SELECT 'session_group' AS record_type, session_group,
  CAST(NULL AS STRING) AS click_page_path, CAST(NULL AS STRING) AS page_status,
  CAST(NULL AS STRING) AS clicked_page_group,
  session_channel, session_source, session_medium, session_attribution_status,
  SUM(click_events) AS click_events, COUNT(*) AS observed_sessions,
  COUNTIF(has_unresolved_click) AS sessions_with_unresolved_click,
  COUNTIF(has_excluded_click) AS sessions_with_excluded_click
FROM session_groups
GROUP BY session_group, session_channel, session_source, session_medium, session_attribution_status
UNION ALL
SELECT 'click_page' AS record_type, CAST(NULL AS STRING) AS session_group,
  p.click_page_path, p.page_status, p.clicked_page_group,
  s.session_channel, s.session_source, s.session_medium, s.session_attribution_status,
  SUM(p.click_events) AS click_events, COUNT(*) AS observed_sessions,
  CAST(NULL AS INT64) AS sessions_with_unresolved_click,
  CAST(NULL AS INT64) AS sessions_with_excluded_click
FROM per_session_page p JOIN session_context s USING (stream_id, user_pseudo_id, session_id)
GROUP BY p.click_page_path, p.page_status, p.clicked_page_group,
  s.session_channel, s.session_source, s.session_medium, s.session_attribution_status;
