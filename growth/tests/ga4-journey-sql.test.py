"""Execute the checked-in journey SQL on synthetic extracted GA4 events.

Only the warehouse scan is replaced; this is not a live BigQuery schema test.
"""
import datetime
import json
from pathlib import Path
import unittest

import duckdb
import sqlglot
from sqlglot import exp


SQL = Path(__file__).parents[1] / "sql/analytics/ga4-journey.sql"
START = int(datetime.datetime(2026, 9, 5, 15, tzinfo=datetime.timezone.utc).timestamp() * 1_000_000)
DAY = 86_400_000_000
COLUMNS = {
    "stream_id": "VARCHAR", "user_pseudo_id": "VARCHAR", "session_id": "BIGINT",
    "event_timestamp": "BIGINT", "event_name": "VARCHAR",
    "page_location": "VARCHAR", "page_referrer": "VARCHAR", "page_path": "VARCHAR",
    "card_target": "VARCHAR", "card_stage": "VARCHAR", "measurement_version": "VARCHAR",
}


def event(kind, offset=0, **overrides):
    row = dict(stream_id="13605182969", user_pseudo_id="fixture-user", session_id=1,
               event_timestamp=START + offset, event_name=kind,
               page_location="https://simplememofast.com/blog/obsidian-voice-input",
               page_referrer="https://simplememofast.com/obsidian/getting-started/?discard=1#fragment",
               page_path="/blog/obsidian-voice-input", card_target="/obsidian/?discard=2#fragment",
               card_stage="feature", measurement_version="2026-09-05")
    row.update(overrides)
    return row


def run(events):
    tree = sqlglot.parse_one(SQL.read_text(), read="bigquery")
    first = tree.args["with_"].expressions[0]
    assert first.alias_or_name == "extracted"
    first.set("this", sqlglot.parse_one("SELECT * FROM fixture_events"))
    query = tree.sql(dialect="duckdb")
    con = duckdb.connect(":memory:")
    try:
        con.execute("CREATE TABLE fixture_events (" + ", ".join(f"{k} {v}" for k, v in COLUMNS.items()) + ")")
        if events:
            con.executemany("INSERT INTO fixture_events VALUES (" + ",".join("?" for _ in COLUMNS) + ")",
                            [[row.get(k) for k in COLUMNS] for row in events])
        result = con.execute(query, {"start_date": datetime.date(2026, 9, 6),
                                     "end_date": datetime.date(2026, 9, 6),
                                     "measurement_version": "2026-09-05"})
        names = [c[0] for c in result.description]
        return [dict(zip(names, row)) for row in result.fetchall()]
    finally:
        con.close()


def rows_of(rows, basis="event_day", kind="card"):
    return [r for r in rows if r["date_basis"] == basis and r["route_kind"] == kind]


class JourneyTests(unittest.TestCase):
    def test_actual_projection_and_daily_stream_event_filters(self):
        scan = sqlglot.parse_one(SQL.read_text(), read='bigquery').args['with_'].expressions[0].this.copy()
        scan.set('from_', exp.From(this=exp.Table(this=exp.Identifier(this='warehouse_fixture'))))
        con = duckdb.connect(':memory:')
        try:
            con.execute('''CREATE TABLE warehouse_fixture (
                _TABLE_SUFFIX VARCHAR, stream_id VARCHAR, platform VARCHAR,
                user_pseudo_id VARCHAR, event_timestamp BIGINT, event_name VARCHAR,
                event_params STRUCT(key VARCHAR, value STRUCT(int_value BIGINT, string_value VARCHAR))[]
            )''')
            values = {'ga_session_id': 123, 'page_location': 'https://simplememofast.com/a',
                      'page_referrer': 'https://simplememofast.com/b', 'page_path': '/a',
                      'to': '/b', 'stage': 'feature', 'measurement_version': '2026-09-05',
                      'irrelevant': 'discard'}
            params = [{'key': k, 'value': {'int_value': v if isinstance(v, int) else None,
                       'string_value': v if isinstance(v, str) else None}} for k, v in values.items()]
            candidates = [
                ('20260906', '13605182969', 'WEB', 'next_step_click'),
                ('20260907', '13605182969', 'WEB', 'next_step_impression'),
                ('20260906', '13605182969', 'WEB', 'session_start'),
                ('20260906', '13605182969', 'WEB', 'page_view'),
                ('intraday_20260906', '13605182969', 'WEB', 'next_step_click'),
                ('20260905', '13605182969', 'WEB', 'next_step_click'),
                ('20260908', '13605182969', 'WEB', 'next_step_click'),
                ('20260906', 'another', 'WEB', 'next_step_click'),
                ('20260906', '13605182969', 'IOS', 'next_step_click'),
                ('20260906', '13605182969', 'WEB', 'seo_cta_click'),
            ]
            for day, stream, platform, kind in candidates:
                con.execute('''INSERT INTO warehouse_fixture VALUES (?, ?, ?, ?, ?, ?,
                            CAST(?::JSON AS STRUCT(key VARCHAR, value STRUCT(int_value BIGINT, string_value VARCHAR))[]))''',
                            [day, stream, platform, 'synthetic', START, kind, json.dumps(params)])
            result = con.execute(scan.sql(dialect='duckdb'), {
                'start_date': datetime.date(2026, 9, 6), 'end_date': datetime.date(2026, 9, 6)})
            names = [c[0] for c in result.description]
            rows = [dict(zip(names, row)) for row in result.fetchall()]
            self.assertEqual({row['event_name'] for row in rows},
                             {'next_step_click', 'next_step_impression', 'session_start', 'page_view'})
            self.assertEqual(len(rows), 4)
            for row in rows:
                self.assertEqual(row['session_id'], 123)
                self.assertEqual(row['card_target'], '/b')
                self.assertEqual(row['card_stage'], 'feature')
                self.assertEqual(row['page_path'], '/a')
                self.assertEqual(row['measurement_version'], '2026-09-05')
                self.assertEqual(row['page_referrer'], values['page_referrer'])
        finally:
            con.close()

    def test_repeated_clicks_do_not_create_sessions_or_impressions(self):
        rows = run([event("session_start"), event("next_step_impression", 1),
                    event("next_step_click", 2), event("next_step_click", 3)])
        raw = rows_of(rows)[0]
        self.assertEqual((raw["recorded_events"], raw["recorded_card_clicks"], raw["recorded_card_impressions"]), (3, 2, 1))
        self.assertIsNone(raw["observed_route_sessions_24h"])
        cohort = rows_of(rows, "session_start_day_24h")[0]
        self.assertEqual((cohort["observed_route_sessions_24h"], cohort["sessions_with_card_click"],
                          cohort["sessions_with_card_impression"]), (1, 1, 1))
        self.assertIsNone(cohort["recorded_events"])
        self.assertEqual(cohort["clicked_without_recorded_impression"], 0)

    def test_nonclickers_are_retained_and_no_ctr_is_invented(self):
        rows = run([event("session_start"), event("next_step_impression", 1)])
        cohort = rows_of(rows, "session_start_day_24h")[0]
        self.assertEqual(cohort["sessions_with_card_click"], 0)
        self.assertEqual(cohort["sessions_with_card_impression"], 1)
        self.assertFalse(any("rate" in key or "ctr" in key for key in cohort))

    def test_absent_and_later_impressions_and_timestamp_ties_are_distinct(self):
        for impressions, expected in [([], (1, 0, 0)),
                                      ([event("next_step_impression", 3)], (0, 1, 0)),
                                      ([event("next_step_impression", 2)], (0, 0, 1))]:
            row = rows_of(run([event("session_start"), event("next_step_click", 2)] + impressions), "session_start_day_24h")[0]
            self.assertEqual(tuple(row[k] for k in ("clicked_without_recorded_impression",
                             "first_click_before_first_impression", "first_click_tied_with_first_impression")), expected)

    def test_same_person_different_sessions_cannot_supply_each_others_impression(self):
        events = [event("session_start"), event("next_step_impression", 1),
                  event("session_start", 2, session_id=2), event("next_step_click", 3, session_id=2)]
        row = rows_of(run(events), "session_start_day_24h")[0]
        self.assertEqual(row["observed_route_sessions_24h"], 2)
        self.assertEqual(row["clicked_without_recorded_impression"], 1)

    def test_different_people_with_same_session_number_remain_distinct(self):
        events = [event("session_start"), event("next_step_impression", 1),
                  event("session_start", user_pseudo_id="another"),
                  event("next_step_click", 2, user_pseudo_id="another")]
        row = rows_of(run(events), "session_start_day_24h")[0]
        self.assertEqual((row["observed_route_sessions_24h"], row["clicked_without_recorded_impression"]), (2, 1))

    def test_missing_keys_and_orphan_events_stay_in_raw_quality_counts(self):
        for fields in [{"user_pseudo_id": None}, {"user_pseudo_id": ""}, {"session_id": None}, {}]:
            rows = run([event("next_step_click", 2, **fields)])
            raw = rows_of(rows)[0]
            self.assertEqual(raw["recorded_card_clicks"], 1)
            self.assertEqual(raw["events_without_session_key"], int(bool(fields)))
            self.assertEqual(raw["events_outside_started_cohort_24h"], 1)
            self.assertEqual(rows_of(rows, "session_start_day_24h"), [])

    def test_raw_dates_and_24_hour_cohort_include_different_events(self):
        # Start late on Sep 6 JST; follow-up events arrive on Sep 7 JST.
        rows = run([event("session_start", DAY - 100),
                    event("next_step_impression", DAY - 99),
                    event("next_step_click", 2 * DAY - 101),
                    event("next_step_click", 2 * DAY - 100)])
        self.assertEqual(rows_of(rows)[0]["recorded_card_clicks"], 0)
        self.assertEqual(rows_of(rows, "session_start_day_24h")[0]["sessions_with_card_click"], 1)
        boundary = run([event("session_start", DAY - 100), event("next_step_click", 2 * DAY - 100)])
        self.assertEqual(boundary, [])

    def test_prestart_and_outside_window_starts_do_not_enter_cohort(self):
        for start, click in [(10, 9), (-1, 2), (DAY, DAY + 1)]:
            rows = run([event("session_start", start), event("next_step_click", click)])
            self.assertEqual(rows_of(rows, "session_start_day_24h"), [])
            if 0 <= click < DAY:
                self.assertEqual(rows_of(rows)[0]["events_outside_started_cohort_24h"], 1)

    def test_card_paths_strip_query_and_fragment_and_accept_absolute_host_case(self):
        row = rows_of(run([event("next_step_click", card_target="HTTPS://WWW.SIMPLEMEMOFAST.COM/obsidian/?private=secret#secret")]))[0]
        self.assertEqual(row["to_path"], "/obsidian/")
        self.assertEqual(row["row_scope"], "production_internal")
        self.assertNotIn("secret", json.dumps(row, default=str))

    def test_external_malformed_and_unsupported_targets_are_visible_without_raw_urls(self):
        for target, status in [(None, "missing"), ("https://elsewhere.test/private?secret=1", "external"),
                               ("//simplememofast.com/secret", "invalid_or_unsupported_relative"),
                               ("../secret", "invalid_or_unsupported_relative"),
                               ("javascript:secret", "invalid_or_unsupported_relative")]:
            row = rows_of(run([event("next_step_click", card_target=target)]))[0]
            self.assertEqual(row["route_status"], status)
            self.assertIsNone(row["to_path"])
            self.assertEqual(row["row_scope"], "quality_or_context")
            self.assertNotIn("secret", json.dumps(row, default=str))

    def test_host_spoofs_preview_and_bad_paths_cannot_enter_production_routes(self):
        for location in ["https://simplememofast.com.evil.test/", "https://simplememofast.com@evil.test/",
                         "https://preview.pages.dev/", "https://simplememofast.com/%20secret",
                         "https://simplememofast.com/../secret", "javascript:secret", None]:
            row = rows_of(run([event("next_step_click", page_location=location)]))[0]
            self.assertIsNone(row["from_path"])
            self.assertEqual(row["row_scope"], "quality_or_context")

    def test_version_stage_and_conflicting_page_parameter_are_not_silently_fixed(self):
        for field, value, column, expected in [
            ("measurement_version", None, "version_status", "missing"),
            ("measurement_version", "old-secret", "version_status", "other"),
            ("card_stage", "secret", "stage", "(other)"),
            ("card_stage", None, "stage", "(missing)"),
            ("page_path", "/different", "card_page_path_status", "conflicting"),
            ("page_path", None, "card_page_path_status", "missing"),
        ]:
            row = rows_of(run([event("next_step_click", **{field: value})]))[0]
            self.assertEqual(row[column], expected)
            self.assertEqual(row["row_scope"], "quality_or_context")
            self.assertNotIn("secret", json.dumps(row, default=str))

    def test_referrer_arrivals_do_not_require_clicks_or_custom_parameters(self):
        rows = run([event("session_start"), event("page_view", 1, measurement_version=None, card_stage=None,
                    card_target=None, page_path=None), event("page_view", 2, measurement_version=None)])
        raw = rows_of(rows, kind="referrer_arrival")[0]
        self.assertEqual((raw["from_path"], raw["to_path"]), ("/obsidian/getting-started/", "/blog/obsidian-voice-input"))
        self.assertEqual(raw["recorded_events"], 2)
        self.assertEqual(raw["version_status"], "not_applicable")
        self.assertEqual(rows_of(rows), [])
        cohort = rows_of(rows, "session_start_day_24h", "referrer_arrival")[0]
        self.assertEqual(cohort["observed_route_sessions_24h"], 1)
        self.assertIsNone(cohort["sessions_with_card_click"])

    def test_missing_external_and_invalid_referrers_remain_separate(self):
        for value, expected in [(None, "missing"), ("  ", "missing"),
                                ("https://outside.test/private?secret=1", "external"),
                                ("file:///secret", "invalid")]:
            row = rows_of(run([event("page_view", page_referrer=value)]), kind="referrer_arrival")[0]
            self.assertEqual(row["route_status"], expected)
            self.assertIsNone(row["from_path"])
            self.assertNotIn("secret", json.dumps(row, default=str))

    def test_distinct_referrer_routes_and_same_page_arrival_are_not_collapsed(self):
        events = [event("session_start")]
        for path in ["/obsidian/", "/obsidian/pricing/", "/blog/obsidian-voice-input"]:
            events.append(event("page_view", 1, page_referrer="https://simplememofast.com" + path))
        rows = rows_of(run(events), "session_start_day_24h", "referrer_arrival")
        self.assertEqual(len(rows), 3)
        self.assertEqual(sum(r["observed_route_sessions_24h"] for r in rows), 3)  # Non-additive across routes.
        self.assertEqual(sum(r["from_path"] == r["to_path"] for r in rows), 1)

    def test_root_path_query_is_not_mistaken_for_hostname_or_path(self):
        row = rows_of(run([event("page_view", page_location="https://simplememofast.com?secret=1",
                    page_referrer="https://www.simplememofast.com?secret=2#fragment")]), kind="referrer_arrival")[0]
        self.assertEqual((row["from_path"], row["to_path"], row["row_scope"]), ("/", "/", "production_internal"))

    def test_empty_data_does_not_manufacture_zero_demand(self):
        self.assertEqual(run([]), [])


if __name__ == "__main__":
    unittest.main()
