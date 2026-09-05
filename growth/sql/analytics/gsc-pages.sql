-- URL aggregation is deliberately separate from the site denominator.
SELECT
  dim.dimension, dim.value,
  SUM(clicks) AS clicks, SUM(impressions) AS impressions,
  SAFE_DIVIDE(SUM(clicks), SUM(impressions)) AS ctr,
  SAFE_DIVIDE(SUM(sum_position), SUM(impressions)) + 1 AS position
FROM `yurika-simplememo.searchconsole.searchdata_url_impression`
CROSS JOIN UNNEST([
  STRUCT('date' AS dimension, CAST(data_date AS STRING) AS value),
  STRUCT('page', url)
]) dim
WHERE site_url = 'sc-domain:simplememofast.com' AND search_type = 'WEB'
  AND data_date BETWEEN @start_date AND @end_date
GROUP BY dim.dimension, dim.value
ORDER BY dim.dimension, impressions DESC, dim.value;
