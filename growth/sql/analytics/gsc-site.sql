-- WEB, site aggregation. GSC data_date is Pacific Time.
SELECT
  dim.dimension, dim.value,
  SUM(clicks) AS clicks, SUM(impressions) AS impressions,
  SAFE_DIVIDE(SUM(clicks), SUM(impressions)) AS ctr,
  SAFE_DIVIDE(SUM(sum_top_position), SUM(impressions)) + 1 AS position,
  SUM(IF(is_anonymized_query, impressions, 0)) AS anonymized_impressions
FROM `yurika-simplememo.searchconsole.searchdata_site_impression`
CROSS JOIN UNNEST([
  STRUCT('date' AS dimension, CAST(data_date AS STRING) AS value),
  STRUCT('country', country), STRUCT('device', device),
  STRUCT('query', IF(is_anonymized_query, NULL, query))
]) dim
WHERE site_url = 'sc-domain:simplememofast.com' AND search_type = 'WEB'
  AND data_date BETWEEN @start_date AND @end_date
GROUP BY dim.dimension, dim.value
ORDER BY dim.dimension, impressions DESC, dim.value;
