-- Read-only diagnostic snapshot. UTC [rollout anchor, snapshot cutoff).
-- Exact published binary; known internal installs have NOT been excluded.
-- These counts are not a product success rate or a final feature verdict.
-- Unknown historical categories MUST NOT be relabeled as flat.
WITH attempts AS (
  SELECT anonymous_install_id, event_name,
    json_extract(properties_json, '$.method') AS method,
    json_extract(properties_json, '$.write_stage') AS write_stage,
    json_extract(properties_json, '$.obsidian_layout') AS layout
  FROM app_analytics_events
  WHERE app_version = '5.8.46' AND build_number = '1179'
    AND server_timestamp >= 1788887639000 -- 2026-09-08T17:13:59Z
    AND server_timestamp < 1789128300000  -- 2026-09-11T12:05:00Z
    AND event_name IN ('obsidian_append_success', 'obsidian_append_failed')
), per_install AS (
  SELECT anonymous_install_id, method, write_stage, layout,
    SUM(event_name = 'obsidian_append_success') AS successes,
    SUM(event_name = 'obsidian_append_failed') AS failures
  FROM attempts GROUP BY anonymous_install_id, method, write_stage, layout
)
SELECT method, write_stage, layout,
  SUM(successes) AS success_events, SUM(failures) AS failure_events,
  COUNT(*) AS installs,
  SUM(successes > 0) AS success_installs,
  SUM(failures > 0) AS failure_installs,
  SUM(successes > 0 AND failures > 0) AS overlapping_installs
FROM per_install GROUP BY method, write_stage, layout;

SELECT json_extract(properties_json, '$.destination_change') AS destination_change,
  COUNT(*) AS events, COUNT(DISTINCT anonymous_install_id) AS installs
FROM app_analytics_events
WHERE app_version = '5.8.46' AND build_number = '1179'
  AND server_timestamp >= 1788887639000
  AND server_timestamp < 1789128300000
  AND event_name = 'obsidian_destination_changed'
GROUP BY destination_change;
