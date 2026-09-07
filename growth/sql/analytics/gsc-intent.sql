-- Fixed priority URLs only; retain anonymous/missing buckets for reconciliation.
-- URL aggregation cannot be substituted for the site-level denominator.
WITH normalized AS (
  SELECT data_date, url, clicks, impressions, sum_position,
    CASE WHEN is_anonymized_query THEN 'anonymous'
         WHEN query IS NULL OR query = '' THEN 'missing'
         ELSE 'known' END AS query_status,
    CASE WHEN is_anonymized_query OR query IS NULL OR query = '' THEN NULL
         ELSE query END AS query
  FROM `yurika-simplememo.searchconsole.searchdata_url_impression`
  WHERE site_url = 'sc-domain:simplememofast.com' AND search_type = 'WEB'
    AND data_date BETWEEN @start_date AND @end_date
    AND url IN (
      'https://simplememofast.com/vs/logseq/',
      'https://simplememofast.com/obsidian/compare/logseq/',
      'https://simplememofast.com/vs/capacities/'
    )
)
SELECT data_date, url, query_status, query,
  SUM(clicks) AS clicks, SUM(impressions) AS impressions,
  SUM(sum_position) AS position_sum,
  SAFE_DIVIDE(SUM(clicks), SUM(impressions)) AS ctr,
  SAFE_DIVIDE(SUM(sum_position), SUM(impressions)) + 1 AS position
FROM normalized
GROUP BY data_date, url, query_status, query
ORDER BY data_date, url, impressions DESC, query_status, query;
