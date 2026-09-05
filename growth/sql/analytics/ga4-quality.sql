-- BigQuery Standard SQL. NOT EXECUTED; validate actual export schema first.
-- DATE parameters @start_date, @end_date; STRING @measurement_version.
-- No user identifiers or full page URLs are emitted in the result.
WITH extracted AS (
  SELECT
    event_date,
    event_name,
    user_pseudo_id,
    privacy_info.analytics_storage AS analytics_storage,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'measurement_version') AS measurement_version,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'link_url') AS link_url,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'placement') AS placement,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'cluster') AS cluster,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'variant') AS variant,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'ct') AS ct,
    JSON_VALUE(TO_JSON_STRING(session_traffic_source_last_click),
      '$.cross_channel_campaign.default_channel_group') AS default_channel_group
  FROM `yurika-simplememo.analytics_524656334.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', @start_date)
    AND FORMAT_DATE('%Y%m%d', DATE_ADD(@end_date, INTERVAL 1 DAY))
    AND REGEXP_CONTAINS(_TABLE_SUFFIX, r'^[0-9]{8}$')
    AND stream_id = '13605182969'
    AND platform = 'WEB'
), scoped AS (
  SELECT *,
    CASE
      WHEN NET.HOST(page_location) IS NULL THEN 'missing_hostname'
      WHEN REGEXP_CONTAINS(LOWER(NET.HOST(page_location)), r'^(www\.)?simplememofast\.com$') THEN 'production'
      ELSE 'nonproduction'
    END AS hostname_scope
  FROM extracted
)
SELECT
  event_date,
  hostname_scope,
  event_name,
  COUNT(*) AS recorded_events,
  COUNTIF(NULLIF(user_pseudo_id, '') IS NULL OR session_id IS NULL) AS events_without_session_key,
  COUNTIF(analytics_storage = 'No') AS analytics_storage_denied_events,
  COUNTIF(NULLIF(default_channel_group, '') IS NULL) AS missing_session_channel_events,
  COUNTIF(event_name IN ('app_store_click', 'seo_cta_click', 'seo_cta_impression')
    AND (measurement_version IS NULL OR measurement_version != @measurement_version)) AS cta_version_missing_or_other,
  COUNTIF(event_name IN ('app_store_click', 'seo_cta_click') AND NOT IFNULL(
    LOWER(NET.HOST(link_url)) = 'apps.apple.com'
    AND REGEXP_CONTAINS(REGEXP_EXTRACT(link_url, r'^https://[^/]+([^?#]*)'), r'/id6758438948(?:/|$)'), FALSE)) AS click_target_invalid_or_missing,
  COUNTIF(event_name IN ('app_store_click', 'seo_cta_click', 'seo_cta_impression') AND
    (NULLIF(placement, '') IS NULL OR placement = '(untagged)'
     OR NULLIF(cluster, '') IS NULL OR cluster = '(untagged)'
     OR NULLIF(variant, '') IS NULL OR NULLIF(ct, '') IS NULL)) AS cta_dimensions_incomplete
FROM scoped
GROUP BY event_date, hostname_scope, event_name
ORDER BY event_date, hostname_scope, event_name;
