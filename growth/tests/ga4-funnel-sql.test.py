"""Execute the checked-in funnel aggregation with synthetic extracted events.

This is a local SQL behavior test, not a BigQuery schema/live-data validation.
Only the warehouse scan is replaced. SQLGlot translates the remaining GoogleSQL;
the ordered first non-null ARRAY_AGG is adapted for DuckDB's aggregate syntax.
"""
import datetime
import json
import os
from pathlib import Path
import unittest
from urllib.parse import urlsplit

import duckdb
import sqlglot
from sqlglot import exp
from sqlglot.dialects.duckdb import DuckDB


SQL = Path(os.environ.get("GA4_FUNNEL_SQL", Path(__file__).parents[1] / "sql/analytics/ga4-funnel.sql"))
START = int(datetime.datetime(2026, 9, 6, tzinfo=datetime.timezone.utc).timestamp() * 1_000_000)
COLUMNS = {
    "stream_id": "VARCHAR", "user_pseudo_id": "VARCHAR", "session_id": "BIGINT",
    "event_timestamp": "BIGINT", "event_name": "VARCHAR",
    "batch_page_id": "BIGINT", "batch_ordering_id": "BIGINT", "batch_event_index": "BIGINT",
    "device_category": "VARCHAR", "device_language": "VARCHAR",
    "page_location": "VARCHAR", "page_referrer": "VARCHAR",
    "measurement_version": "VARCHAR", "link_url": "VARCHAR",
    "link_route": "VARCHAR", "bridge_scope": "VARCHAR",
    "event_date": "VARCHAR", "analytics_storage": "VARCHAR", "placement": "VARCHAR",
    "cluster": "VARCHAR", "variant": "VARCHAR", "ct": "VARCHAR",
    "default_channel_group": "VARCHAR", "attributed_source": "VARCHAR", "attributed_medium": "VARCHAR",
}


class FixtureDialect(DuckDB):
    class Generator(DuckDB.Generator):
        def ignorenulls_sql(self, expression):
            aggregate = expression.this
            if not isinstance(aggregate, exp.ArrayAgg):
                return super().ignorenulls_sql(expression)
            ordered = aggregate.this
            if isinstance(ordered, exp.Limit):
                if ordered.expression.name != "1":
                    raise AssertionError("Only the production first-item limit is supported")
                ordered = ordered.this
            if not isinstance(ordered, exp.Order):
                raise AssertionError("Landing selection must preserve event/batch order")
            value = self.sql(ordered.this)
            order = ", ".join(self.sql(item) for item in ordered.expressions)
            # The outer SAFE_OFFSET(0) still selects only the first item.
            return f"ARRAY_AGG({value} ORDER BY {order}) FILTER (WHERE {value} IS NOT NULL)"


def host(value):
    if value is None:
        return None
    try:
        return urlsplit(value).hostname
    except ValueError:
        return None


def event(user, kind, offset=0, **overrides):
    row = dict(stream_id="13605182969", user_pseudo_id=user, session_id=1,
               event_timestamp=START + offset, event_name=kind,
               batch_page_id=1, batch_ordering_id=1, batch_event_index=offset,
               device_category="mobile", device_language="ja",
               page_location="https://simplememofast.com/resources/obsidian-inbox/",
               page_referrer="https://note.com/example/post?private=discard#fragment",
               measurement_version=None, link_url=None,
               default_channel_group="Referral", attributed_source="note.com",
               attributed_medium="referral")
    row.update(overrides)
    return row


def visit(user, **overrides):
    return [event(user, "session_start", **overrides), event(user, "page_view", 1, **overrides)]


def click(user, offset=2, **overrides):
    return event(user, "app_store_click", offset, measurement_version="2026-09-05",
                 link_url="https://apps.apple.com/jp/app/id6758438948?ct=fixture", **overrides)


def run(events, sql_file=SQL):
    tree = sqlglot.parse_one(sql_file.read_text(), read="bigquery")
    first = tree.args["with_"].expressions[0]
    assert first.alias_or_name == "extracted"
    first.set("this", sqlglot.parse_one("SELECT * FROM fixture_events"))
    query = FixtureDialect().generate(tree)
    con = duckdb.connect(":memory:")
    try:
        con.execute("CREATE SCHEMA NET")
        con.create_function("fixture_host", host, ["VARCHAR"], "VARCHAR", null_handling="special")
        con.execute("CREATE MACRO NET.HOST(value) AS fixture_host(value)")
        con.execute("CREATE TABLE fixture_events (" + ", ".join(f"{k} {v}" for k, v in COLUMNS.items()) + ")")
        con.executemany("INSERT INTO fixture_events VALUES (" + ",".join("?" for _ in COLUMNS) + ")",
                        [[row.get(k) for k in COLUMNS] for row in events])
        params = {"start_date": datetime.date(2026, 9, 6), "end_date": datetime.date(2026, 9, 6),
                  "measurement_version": "2026-09-05", "bridge_measurement_version": "2026-09-07"}
        result = con.execute(query, {k: v for k, v in params.items() if "$" + k in query})
        names = [c[0] for c in result.description]
        return [dict(zip(names, row)) for row in result.fetchall()]
    finally:
        con.close()


class FunnelTests(unittest.TestCase):
    def test_quality_scan_uses_the_requested_boundary_and_excludes_intraday_other_streams_and_apps(self):
        tree = sqlglot.parse_one(SQL.with_name("ga4-quality.sql").read_text(), read="bigquery")
        predicate = tree.args["with_"].expressions[0].this.args["where"].this.sql(dialect="duckdb")
        con = duckdb.connect(":memory:")
        try:
            con.execute("CREATE TABLE fixture (_TABLE_SUFFIX VARCHAR, stream_id VARCHAR, platform VARCHAR)")
            con.executemany("INSERT INTO fixture VALUES (?, ?, ?)", [
                (day, "13605182969", "WEB") for day in
                ["20260904", "20260905", "20260906", "20260907", "intraday_20260905"]
            ] + [("20260905", "other", "WEB"), ("20260905", "13605182969", "IOS")])
            query = "SELECT _TABLE_SUFFIX FROM fixture WHERE " + predicate + " ORDER BY _TABLE_SUFFIX"
            for end, expected in [(5, ["20260905"]), (6, ["20260905", "20260906"])]:
                params = {"start_date": datetime.date(2026, 9, 5), "scan_end_date": datetime.date(2026, 9, end)}
                self.assertEqual([row[0] for row in con.execute(query, params).fetchall()], expected)
        finally:
            con.close()

    def bridge(self, user, kind="web_to_app_click", offset=2, **overrides):
        data = dict(measurement_version="2026-09-07", link_route="onelink", bridge_scope="pilot",
                    link_url="https://simplememofast.onelink.me/it5q/test1234")
        data.update(overrides)
        return event(user, kind, offset, **data)

    def test_onelink_and_direct_routes_are_separate_with_a_distinct_session_union(self):
        rows = run(visit("both") + [click("both"), self.bridge("both"), self.bridge("both", offset=3),
                   self.bridge("both", "web_to_app_impression", offset=1)] +
                   visit("bridge") + [self.bridge("bridge")] + visit("none"))
        row = rows[0]
        self.assertEqual(row["observed_started_sessions"], 3)
        self.assertEqual(row["sessions_with_own_app_click_24h"], 1)
        self.assertEqual(row["sessions_with_onelink_click_24h"], 2)
        self.assertEqual(row["sessions_with_onelink_impression"], 1)
        self.assertEqual(row["onelink_clicked_without_recorded_impression"], 1)
        self.assertEqual(row["sessions_with_both_app_routes_24h"], 1)
        self.assertEqual(row["sessions_with_any_app_route_click_24h"], 2)
        self.assertEqual(row["sessions_with_cta_impression"], 0)

    def test_onelink_qa_is_visible_but_excluded_even_with_a_wrong_pilot_label(self):
        rows = run(visit("qa") + [self.bridge("qa", bridge_scope="qa")] + visit("wrong") +
                   [self.bridge("wrong", link_url="https://simplememofast.onelink.me/it5q/4x0jfkpw")])
        self.assertEqual(rows[0]["sessions_with_onelink_qa_click_24h"], 2)
        self.assertEqual(rows[0]["sessions_with_onelink_click_24h"], 0)
        self.assertEqual(rows[0]["sessions_with_any_app_route_click_24h"], 0)

    def test_invalid_bridge_targets_versions_routes_and_scopes_cannot_count(self):
        invalid = [{"link_route": None}, {"link_route": "direct"}, {"bridge_scope": None},
                   {"bridge_scope": "organic"}, {"measurement_version": "2026-09-05"}]
        invalid += [{"link_url": url} for url in [None,
            "https://apps.apple.com/app/id6758438948", "https://simplememofast.onelink.me.evil.test/it5q/test1234",
            "http://simplememofast.onelink.me/it5q/test1234", "https://user@simplememofast.onelink.me/it5q/test1234",
            "https://simplememofast.onelink.me/other/test1234", "https://simplememofast.onelink.me/it5q/test1234?token=private"]]
        for change in invalid:
            with self.subTest(change=change):
                row = run(visit("a") + [self.bridge("a", **change)])[0]
                self.assertEqual(row["sessions_with_onelink_click_24h"], 0)
                self.assertEqual(row["sessions_with_own_app_click_24h"], 0)

    def test_onelink_requires_production_identifiers_start_and_24_hour_window(self):
        events = (visit("a") + [self.bridge("a", offset=-1), self.bridge("a", offset=86_400_000_000),
                 self.bridge("a", page_location="https://preview.simplememo.pages.dev/")] +
                 visit(None) + [self.bridge(None)] + [self.bridge("nostart")])
        row = run(events)[0]
        self.assertEqual(row["observed_started_sessions"], 1)
        self.assertEqual(row["sessions_with_onelink_click_24h"], 0)
        row = run(visit("a") + [self.bridge("a", offset=86_399_999_999)])[0]
        self.assertEqual(row["sessions_with_onelink_click_24h"], 1)

    def test_quality_exposes_bridge_failures_and_does_not_require_apple_ct(self):
        sql = SQL.with_name("ga4-quality.sql")
        good = self.bridge("a", placement="hero", cluster="obsidian", variant="pilot")
        invalid = [dict(good, link_url=None), dict(good, measurement_version=None),
                   dict(good, bridge_scope=None), dict(good, placement=None),
                   dict(good, link_url="https://simplememofast.onelink.me/it5q/4x0jfkpw")]
        row = run([good] + invalid, sql)[0]
        self.assertEqual(row["recorded_events"], 6)
        self.assertEqual(row["onelink_target_invalid_or_missing"], 1)
        self.assertEqual(row["onelink_version_missing_or_other"], 1)
        self.assertEqual(row["onelink_dimensions_incomplete"], 2)
        self.assertEqual(row["onelink_qa_scope_mismatch"], 1)
        self.assertEqual(row["cta_dimensions_incomplete"], 0)
        self.assertEqual(row["click_target_invalid_or_missing"], 0)

    def test_projection_trims_session_fields_without_other_attribution_fallbacks(self):
        tree = sqlglot.parse_one(SQL.read_text(), read="bigquery")
        fields = [item for item in tree.args["with_"].expressions[0].this.expressions
                  if item.alias_or_name in {"attributed_source", "attributed_medium"}]
        self.assertEqual(len(fields), 2)
        query = "SELECT " + ", ".join(item.sql(dialect="duckdb") for item in fields)
        query += " FROM (SELECT JSON(?) AS session_traffic_source_last_click, JSON(?) AS traffic_source)"
        con = duckdb.connect(":memory:")
        try:
            for source, medium, expected in [(" note.com ", " referral ", ("note.com", "referral")),
                                              ("note.com", "  ", ("note.com", None)),
                                              (None, None, (None, None))]:
                session = {"cross_channel_campaign": {"source": source, "medium": medium},
                           "manual_campaign": {"source": "manual.test", "medium": "email"}}
                first = {"source": "first-user.test", "medium": "banner"}
                self.assertEqual(con.execute(query, [json.dumps(session), json.dumps(first)]).fetchone(), expected)
        finally:
            con.close()

    def test_distinct_media_keep_nonclickers_and_repeated_clicks_do_not_add_sessions(self):
        rows = run(visit("a") + [click("a"), click("a", 3)] +
                   visit("b", attributed_source="medium.com", page_referrer="https://medium.com/p/one"))
        by_source = {r["session_source"]: r for r in rows}
        self.assertEqual(set(by_source), {"note.com", "medium.com"})
        self.assertEqual(sum(r["observed_started_sessions"] for r in rows), 2)
        self.assertEqual(sum(r["sessions_with_own_app_click_24h"] for r in rows), 1)
        self.assertEqual(by_source["medium.com"]["own_app_click_session_rate_24h"], 0)

    def test_conflicting_source_medium_pairs_are_not_mixed_or_chosen(self):
        rows = run(visit("a") + [event("a", "user_engagement", 2,
                   attributed_source="mail", attributed_medium="email")])
        self.assertEqual(rows[0]["session_attribution_status"], "conflicting")
        self.assertIsNone(rows[0]["session_source"])
        self.assertIsNone(rows[0]["session_medium"])

    def test_missing_and_partial_attribution_are_distinct_from_direct(self):
        rows = run(visit("missing", attributed_source=None, attributed_medium=None) +
                   visit("partial", attributed_source="note.com", attributed_medium=None) +
                   visit("direct", attributed_source="(direct)", attributed_medium="(none)"))
        by_status = {r["session_attribution_status"]: r for r in rows}
        self.assertEqual(set(by_status), {"missing", "partial", "available"})
        self.assertIsNone(by_status["missing"]["session_source"])
        self.assertEqual(by_status["partial"]["session_source"], "note.com")
        self.assertIsNone(by_status["partial"]["session_medium"])
        self.assertEqual(by_status["available"]["session_source"], "(direct)")

    def test_missing_event_attribution_does_not_conflict_with_one_observed_pair(self):
        rows = run(visit("a") + [event("a", "user_engagement", 2,
                   attributed_source=None, attributed_medium=None)])
        self.assertEqual(rows[0]["session_attribution_status"], "available")

    def test_partial_and_complete_pairs_do_not_silently_fill_each_other(self):
        rows = run(visit("a") + [event("a", "user_engagement", 2, attributed_medium=None)])
        self.assertEqual(rows[0]["session_attribution_status"], "conflicting")

    def test_first_page_referrer_is_preserved_and_only_host_is_returned(self):
        rows = run(visit("a", page_referrer="https://user:discard@NOTE.COM/p/private?token=discard#secret") +
                   [event("a", "page_view", 3, page_referrer="https://simplememofast.com/")])
        self.assertEqual(rows[0]["landing_referrer_host"], "note.com")
        self.assertEqual(rows[0]["landing_referrer_status"], "external")
        self.assertNotIn("discard", str(rows))
        self.assertNotIn("private", str(rows))

    def test_missing_referrer_does_not_override_session_attribution(self):
        rows = run(visit("a", page_referrer=None))
        self.assertEqual(rows[0]["landing_referrer_status"], "missing")
        self.assertEqual(rows[0]["session_source"], "note.com")

    def test_invalid_referrers_do_not_become_referral_hosts(self):
        for value in ["mailto:example@example.test", "javascript:alert(1)", "garbage", "https://"]:
            with self.subTest(value=value):
                row = run(visit("a", page_referrer=value))[0]
                self.assertEqual(row["landing_referrer_status"], "invalid")
                self.assertIsNone(row["landing_referrer_host"])

    def test_internal_subdomains_and_lookalike_external_host_are_distinct(self):
        for value, expected in [("simplememofast.com", "internal"),
                                ("www.simplememofast.com", "internal"),
                                ("api.simplememofast.com", "internal"),
                                ("simplememofast.com.example.test", "external")]:
            with self.subTest(host=value):
                row = run(visit("a", page_referrer="https://" + value + "/p"))[0]
                self.assertEqual(row["landing_referrer_status"], expected)

    def test_first_page_uses_batch_order_for_equal_timestamps(self):
        events = [event("a", "session_start"),
                  event("a", "page_view", 1, batch_page_id=2, page_referrer="https://later.test/"),
                  event("a", "page_view", 1, batch_page_id=1, page_referrer="https://first.test/")]
        self.assertEqual(run(events)[0]["landing_referrer_host"], "first.test")

    def test_missing_landing_and_nonproduction_remain_visible(self):
        rows = run([event("a", "session_start")] +
                   visit("b", page_location="https://preview.example.test/"))
        scopes = {r["landing_scope"]: r for r in rows}
        self.assertEqual(set(scopes), {"missing_landing_page", "nonproduction"})
        self.assertEqual(scopes["missing_landing_page"]["landing_referrer_status"], "missing_landing_page")

    def test_mirrors_competitors_prestart_and_24_hour_boundary_do_not_count(self):
        rows = run(visit("a") + [click("a", -1), click("a", 86_400_000_000),
                   event("a", "seo_cta_click", 3, measurement_version="2026-09-05",
                         link_url="https://apps.apple.com/jp/app/id6758438948"),
                   event("a", "app_store_click", 4, measurement_version="2026-09-05",
                         link_url="https://apps.apple.com/jp/app/id999999")])
        self.assertEqual(rows[0]["observed_started_sessions"], 1)
        self.assertEqual(rows[0]["sessions_with_own_app_click_24h"], 0)

    def test_just_before_boundary_counts_but_unidentified_events_do_not(self):
        rows = run(visit("a") + [click("a", 86_399_999_999)] +
                   visit(None) + [click(None)])
        self.assertEqual(sum(r["observed_started_sessions"] for r in rows), 1)
        self.assertEqual(rows[0]["sessions_with_own_app_click_24h"], 1)


if __name__ == "__main__":
    unittest.main()
