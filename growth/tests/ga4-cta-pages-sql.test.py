"""Execute the checked-in GoogleSQL after replacing only its warehouse scan.

Synthetic behavior verification, not live BigQuery schema/capture validation.
The canonical manifest is deliberately tiny; unknown aliases must stay unknown.
"""
import datetime
import importlib.util
import json
from pathlib import Path
import unittest

import duckdb
import sqlglot

BASE = Path(__file__).parent
spec = importlib.util.spec_from_file_location("funnel_fixture", BASE / "ga4-funnel-sql.test.py")
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
SQL = BASE.parent / "sql/analytics/ga4-cta-pages.sql"
START = int(datetime.datetime(2026, 10, 1, tzinfo=datetime.timezone.utc).timestamp() * 1_000_000)
MANIFEST = [
    {"path": "/obsidian/", "group": "obsidian", "expected_campaign": "web_obsidian_v1"},
    {"path": "/en/obsidian/", "group": "obsidian", "expected_campaign": "web_obsidian_v1"},
    {"path": "/voice-input/", "group": "other", "expected_campaign": "web_other_v1"},
    {"path": "/obsidian/getting-started/", "group": "excluded", "expected_campaign": None},
]
COLUMNS = {**fixture.COLUMNS, "page_path": "VARCHAR", "campaign_payload": "VARCHAR"}


def event(user, kind, offset=0, **overrides):
    data = dict(stream_id="13605182969", user_pseudo_id=user, session_id=1,
                event_timestamp=START + offset, event_name=kind,
                page_location="https://simplememofast.com/voice-input/", page_path=None,
                default_channel_group="Organic Search", attributed_source="google", attributed_medium="organic")
    data.update(overrides)
    return data


def visit(user, **overrides):
    return [event(user, "session_start", **overrides), event(user, "page_view", 1, **overrides)]


def click(user, offset=2, path="/obsidian/", token="web_obsidian_v1", **overrides):
    data = dict(measurement_version="2026-09-05", page_path=path,
                page_location="https://simplememofast.com" + path,
                link_url="https://apps.apple.com/jp/app/id6758438948?pt=1&ct=" + token,
                campaign_payload=token)
    data.update(overrides)
    return event(user, "app_store_click", offset, **data)


def run(events):
    tree = sqlglot.parse_one(SQL.read_text(), read="bigquery")
    first = tree.args["with_"].expressions[0]
    assert first.alias_or_name == "extracted"
    first.set("this", sqlglot.parse_one("SELECT * FROM fixture_events"))
    query = fixture.FixtureDialect().generate(tree)
    con = duckdb.connect(":memory:")
    try:
        con.execute("CREATE SCHEMA NET")
        con.create_function("fixture_host", fixture.host, ["VARCHAR"], "VARCHAR", null_handling="special")
        con.execute("CREATE MACRO NET.HOST(value) AS fixture_host(value)")
        con.execute("CREATE TABLE fixture_events (" + ", ".join(f"{k} {v}" for k, v in COLUMNS.items()) + ")")
        con.executemany("INSERT INTO fixture_events VALUES (" + ",".join("?" for _ in COLUMNS) + ")",
                        [[row.get(k) for k in COLUMNS] for row in events])
        result = con.execute(query, {"start_date": datetime.date(2026, 10, 1),
            "end_date": datetime.date(2026, 10, 1), "measurement_version": "2026-09-05",
            "cta_page_manifest_json": json.dumps(MANIFEST)})
        names = [c[0] for c in result.description]
        return [dict(zip(names, row)) for row in result.fetchall()]
    finally:
        con.close()


def summary(rows):
    return {r["session_group"]: r for r in rows if r["record_type"] == "session_group"}


def pages(rows):
    return [r for r in rows if r["record_type"] == "click_page"]


class ClickPageTests(unittest.TestCase):
    def test_clicked_page_is_not_landing_and_repeated_clicks_deduplicate_sessions(self):
        rows = run(visit("a") + [click("a"), click("a", 3)])
        self.assertEqual(pages(rows)[0]["click_page_path"], "/obsidian/")
        self.assertEqual(pages(rows)[0]["click_events"], 2)
        self.assertEqual(pages(rows)[0]["observed_sessions"], 1)
        self.assertEqual(summary(rows)["obsidian_only"]["observed_sessions"], 1)

    def test_both_groups_are_disjoint_at_session_level_pages_are_not_additive(self):
        rows = run(visit("both") + [click("both"), click("both", 3, path="/voice-input/", token="web_other_v1"),
                   click("both", 4, path="/en/obsidian/")] + visit("none") + visit("obs") + [click("obs")])
        groups = summary(rows)
        self.assertEqual({k: v["observed_sessions"] for k, v in groups.items()},
                         {"both": 1, "no_v1_group_click": 1, "obsidian_only": 1})
        self.assertEqual(sum(r["observed_sessions"] for r in pages(rows)), 4)
        self.assertEqual(sum(r["observed_sessions"] for r in groups.values()), 3)

    def test_missing_mismatch_alias_and_private_paths_are_unresolved_without_fallback(self):
        changes = [({"page_path": None}, "missing_click_page_path"),
            ({"page_location": "https://simplememofast.com/voice-input/"}, "click_path_location_mismatch"),
            ({"path": "/obsidian"}, "unmapped_click_page"),
            ({"path": "/obsidian/index.html"}, "unmapped_click_page"),
            ({"path": "/private-fixture-secret/"}, "unmapped_click_page"),
            ({"page_location": None}, "missing_page_location"),
            ({"page_location": "https://simplememofast.com.evil.test/obsidian/"}, "nonproduction_or_invalid_page_location")]
        for change, expected in changes:
            with self.subTest(change=change):
                rows = run(visit("a") + [click("a", **change)])
                self.assertEqual(pages(rows)[0]["page_status"], expected)
                self.assertIsNone(pages(rows)[0]["click_page_path"])
                self.assertIsNone(pages(rows)[0]["clicked_page_group"])
                self.assertEqual(summary(rows)["no_v1_group_click"]["sessions_with_unresolved_click"], 1)
                self.assertNotIn("private-fixture-secret", str(rows))

    def test_frozen_pages_do_not_enter_v1_even_when_link_claims_obsidian(self):
        rows = run(visit("a") + [click("a", path="/obsidian/getting-started/")])
        self.assertEqual(pages(rows)[0]["page_status"], "frozen_excluded_page")
        self.assertIsNone(pages(rows)[0]["clicked_page_group"])
        self.assertEqual(summary(rows)["no_v1_group_click"]["sessions_with_excluded_click"], 1)
        self.assertEqual(summary(rows)["no_v1_group_click"]["sessions_with_unresolved_click"], 0)

    def test_known_and_unresolved_clicks_keep_the_group_and_the_diagnostic_flag(self):
        rows = run(visit("same") + [click("same"), click("same", 3, page_path=None),
                   click("same", 4, path="/obsidian/getting-started/")] +
                   visit("same", session_id=2) + [click("same", session_id=2)])
        group = summary(rows)["obsidian_only"]
        self.assertEqual(group["observed_sessions"], 2)
        self.assertEqual(group["sessions_with_unresolved_click"], 1)
        self.assertEqual(group["sessions_with_excluded_click"], 1)
        self.assertEqual(group["click_events"], 4)

    def test_link_token_and_payload_must_both_match_the_observed_page(self):
        cases = [({"token": "web_other_v1"}, "campaign_page_mismatch"),
            ({"link_url": "https://apps.apple.com/app/id6758438948?pt=1"}, "untagged_or_missing_campaign"),
            ({"link_url": "https://apps.apple.com/app/id6758438948?ct=web_obsidian_v1&ct=web_obsidian_v1"}, "ambiguous_link_campaign"),
            ({"campaign_payload": None}, "campaign_payload_mismatch"),
            ({"campaign_payload": "web_other_v1"}, "campaign_payload_mismatch")]
        for change, expected in cases:
            with self.subTest(change=change):
                rows = run(visit("a") + [click("a", **change)])
                self.assertEqual(pages(rows)[0]["page_status"], expected)
                self.assertIsNone(pages(rows)[0]["clicked_page_group"])

    def test_mirrored_events_qa_other_app_version_and_unstarted_clicks_do_not_count(self):
        changes = [{"event_name": "seo_cta_click"}, {"event_name": "web_to_app_click"},
            {"link_url": "https://apps.apple.com/app/id999999"},
            {"link_url": "https://apps.apple.com.evil.test/app/id6758438948"},
            {"link_url": "https://simplememofast.onelink.me/it5q/4x0jfkpw"},
            {"measurement_version": None}, {"measurement_version": "old"}]
        for change in changes:
            with self.subTest(change=change):
                rows = run(visit("a") + [click("a", **change), click("unstarted"), click(None)])
                self.assertEqual(pages(rows), [])
                self.assertEqual(summary(rows)["no_v1_group_click"]["click_events"], 0)

    def test_post_start_window_is_inclusive_at_start_exclusive_at_24_hours(self):
        for offset, counts in [(-1, 0), (0, 1), (86_399_999_999, 1), (86_400_000_000, 0)]:
            with self.subTest(offset=offset):
                rows = run(visit("a") + [click("a", offset)])
                self.assertEqual(sum(r["click_events"] for r in pages(rows)), counts)
        rows = run(visit("a", event_timestamp=START - 9 * 3_600_000_000 - 1) + [click("a")])
        self.assertEqual(rows, []) # JST start day precedes the requested cohort.

    def test_source_conflicts_and_missing_channels_are_retained_without_utms(self):
        rows = run(visit("a") + [click("a", attributed_source="mail", attributed_medium="email",
                   default_channel_group="Email")])
        for row in rows:
            self.assertEqual(row["session_channel"], "(conflicting session channels)")
            self.assertEqual(row["session_attribution_status"], "conflicting")
            self.assertIsNone(row["session_source"])
            self.assertIsNone(row["session_medium"])
        rows = run(visit("a", default_channel_group=None, attributed_source=None, attributed_medium=None)
                   + [click("a", default_channel_group=None, attributed_source=None, attributed_medium=None)])
        self.assertEqual(pages(rows)[0]["session_channel"], "(missing session channel)")
        self.assertEqual(pages(rows)[0]["session_attribution_status"], "missing")

    def test_scan_and_page_projection_use_only_the_prescribed_export_fields(self):
        tree = sqlglot.parse_one(SQL.read_text(), read="bigquery")
        scan = tree.args["with_"].expressions[0].this
        predicate = scan.args["where"].this.sql(dialect="duckdb")
        con = duckdb.connect(":memory:")
        try:
            con.execute("CREATE TABLE fixture (_TABLE_SUFFIX VARCHAR, stream_id VARCHAR, platform VARCHAR)")
            con.executemany("INSERT INTO fixture VALUES (?, ?, ?)",
                [(day, "13605182969", "WEB") for day in ["20260930", "20261001", "20261002", "20261003", "intraday_20261001"]]
                + [("20261001", "wrong", "WEB"), ("20261001", "13605182969", "IOS")])
            rows = con.execute("SELECT _TABLE_SUFFIX FROM fixture WHERE " + predicate + " ORDER BY 1",
                {"start_date": datetime.date(2026, 10, 1), "end_date": datetime.date(2026, 10, 1)}).fetchall()
            self.assertEqual(rows, [("20261001",), ("20261002",)])
        finally:
            con.close()
        field = next(item for item in scan.expressions if item.alias_or_name == "page_path")
        self.assertIn("key = 'page_path'", field.sql(dialect="bigquery"))
        self.assertNotIn("COALESCE", field.sql(dialect="bigquery"))
        self.assertNotIn("first_user", SQL.read_text())
        self.assertNotIn("SAFE_DIVIDE", SQL.read_text())


if __name__ == "__main__":
    unittest.main()
