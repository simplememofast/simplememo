"""Exercise sitewide Web aggregation with synthetic events only.

Reuse the existing SQL execution adapter: no warehouse, network, app, device,
or attribution-provider access is involved. The v1 fixture remains the frozen
oracle for legacy dimensions and counts.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest


TESTS = Path(__file__).parent
spec = importlib.util.spec_from_file_location("ga4_funnel_fixture", TESTS / "ga4-funnel-sql.test.py")
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

SITEWIDE_URL = "https://simplememofast.onelink.me/it5q?pid=owned_web&c=website_bridge_v1"
PILOT_URL = "https://simplememofast.onelink.me/it5q/l250gib4"
QA_URL = "https://simplememofast.onelink.me/it5q/4x0jfkpw"
DAY = 86_400_000_000
SITEWIDE_COLUMNS = {
    "sessions_with_sitewide_onelink_impression",
    "sessions_with_sitewide_onelink_click_24h",
    "sitewide_onelink_clicked_without_recorded_impression",
    "sessions_with_legacy_and_sitewide_routes_24h",
    "sessions_with_expanded_app_route_click_24h",
}


def bridge(user, kind="web_to_app_click", offset=2, **overrides):
    data = dict(measurement_version="2026-09-07", link_route="onelink",
                bridge_scope="sitewide", link_url=SITEWIDE_URL,
                placement="hero", cluster="website", variant="sitewide")
    data.update(overrides)
    return fixture.event(user, kind, offset, **data)


class SitewideSqlTests(unittest.TestCase):
    def test_three_routes_deduplicate_sessions_and_preserve_the_legacy_union(self):
        events = fixture.visit("all") + [fixture.click("all"),
            bridge("all", bridge_scope="pilot", link_url=PILOT_URL),
            bridge("all"), bridge("all", offset=3),
            bridge("all", "web_to_app_impression", offset=1)]
        events += fixture.visit("sitewide-only") + [bridge("sitewide-only")]
        events += fixture.visit("legacy-only") + [fixture.click("legacy-only")]
        events += fixture.visit("none")
        row = fixture.run(events)[0]
        self.assertTrue(SITEWIDE_COLUMNS.issubset(row))
        expected = {
            "observed_started_sessions": 4,
            "sessions_with_own_app_click_24h": 2,
            "sessions_with_onelink_click_24h": 1,
            "sessions_with_both_app_routes_24h": 1,
            "sessions_with_any_app_route_click_24h": 2,
            "sessions_with_sitewide_onelink_impression": 1,
            "sessions_with_sitewide_onelink_click_24h": 2,
            "sitewide_onelink_clicked_without_recorded_impression": 1,
            "sessions_with_legacy_and_sitewide_routes_24h": 1,
            "sessions_with_expanded_app_route_click_24h": 3,
        }
        for column, value in expected.items():
            with self.subTest(column=column):
                self.assertEqual(row[column], value)
        self.assertEqual(row["sessions_with_expanded_app_route_click_24h"],
                         row["sessions_with_any_app_route_click_24h"] +
                         row["sessions_with_sitewide_onelink_click_24h"] -
                         row["sessions_with_legacy_and_sitewide_routes_24h"])

    def test_preserved_apple_destinations_remain_in_legacy_counts_only(self):
        urls = [
            "https://apps.apple.com/jp/app/id6758438948?ct=web_obsidian_v1",
            "https://apps.apple.com/jp/app/id6758438948?pt=128498560",
            "https://apps.apple.com/jp/app/id6758438948?pt=128498560&ct=web_obsidian_v1&mt=8&ppid=0253a7f9-3c1a-4294-95bc-e6d800af5733",
            "https://apps.apple.com/jp/app/id6758438948?see-all=reviews",
            "https://apps.apple.com/jp/app/id6758438948#information",
            "https://apps.apple.com/us/app/id6758438948",
            "https://apps.apple.com/app/id6758438948",
        ]
        events = []
        for index, url in enumerate(urls):
            user = f"preserved-{index}"
            events += fixture.visit(user)
            for kind in ["seo_cta_impression", "app_store_click", "seo_cta_click"]:
                events.append(fixture.event(user, kind, 2,
                    measurement_version="2026-09-05", link_url=url))
        row = fixture.run(events)[0]
        self.assertEqual(row["sessions_with_own_app_click_24h"], len(urls))
        self.assertEqual(row["sessions_with_any_app_route_click_24h"], len(urls))
        self.assertEqual(row["sessions_with_expanded_app_route_click_24h"], len(urls))
        self.assertEqual(row["sessions_with_onelink_click_24h"], 0)
        self.assertEqual(row["sessions_with_sitewide_onelink_click_24h"], 0)
        self.assertEqual(row["sessions_with_sitewide_onelink_impression"], 0)
        self.assertEqual(row["sessions_with_legacy_and_sitewide_routes_24h"], 0)

    def test_qa_and_pilot_short_links_never_enter_sitewide_counts(self):
        cases = [
            ("qa", QA_URL, 1, 0),
            ("pilot", QA_URL, 1, 0),
            ("sitewide", QA_URL, 1, 0),
            ("pilot", PILOT_URL, 0, 1),
            ("sitewide", PILOT_URL, 0, 0),
        ]
        for scope, url, qa, pilot in cases:
            with self.subTest(scope=scope, url=url):
                row = fixture.run(fixture.visit("a") + [
                    bridge("a", bridge_scope=scope, link_url=url),
                    bridge("a", "web_to_app_impression", bridge_scope=scope, link_url=url),
                ])[0]
                self.assertEqual(row["sessions_with_sitewide_onelink_click_24h"], 0)
                self.assertEqual(row["sessions_with_sitewide_onelink_impression"], 0)
                self.assertEqual(row["sessions_with_onelink_qa_click_24h"], qa)
                self.assertEqual(row["sessions_with_onelink_click_24h"], pilot)
                self.assertEqual(row["sessions_with_expanded_app_route_click_24h"], pilot)

    def test_sitewide_requires_the_exact_public_campaign_scope_route_and_version(self):
        changes = [{"bridge_scope": scope} for scope in [None, "qa", "pilot", "organic"]]
        changes += [{"link_route": route} for route in [None, "direct"]]
        changes += [{"measurement_version": version} for version in [None, "2026-09-05"]]
        changes += [{"link_url": url} for url in [
            None,
            SITEWIDE_URL.replace("https://", "http://"),
            SITEWIDE_URL.replace(".onelink.me/", ".onelink.me.evil.test/"),
            SITEWIDE_URL.replace("https://", "https://user@"),
            SITEWIDE_URL.replace("owned_web", "organic"),
            SITEWIDE_URL.replace("website_bridge_v1", "obsidian_bridge_pilot_v1"),
            "https://simplememofast.onelink.me/it5q",
            "https://simplememofast.onelink.me/it5q?c=website_bridge_v1&pid=owned_web",
            SITEWIDE_URL + "&extra=discard",
            SITEWIDE_URL + "#fragment",
        ]]
        for change in changes:
            with self.subTest(change=change):
                row = fixture.run(fixture.visit("a") + [bridge("a", **change),
                    bridge("a", "web_to_app_impression", **change)])[0]
                self.assertEqual(row["sessions_with_sitewide_onelink_click_24h"], 0)
                self.assertEqual(row["sessions_with_sitewide_onelink_impression"], 0)
                self.assertEqual(row["sessions_with_expanded_app_route_click_24h"], 0)

    def test_sitewide_uses_the_same_inclusive_start_exclusive_24h_end(self):
        for offset, expected in [(-1, 0), (0, 1), (DAY - 1, 1), (DAY, 0)]:
            with self.subTest(offset=offset):
                row = fixture.run(fixture.visit("a") + [bridge("a", offset=offset),
                    bridge("a", "web_to_app_impression", offset=offset)])[0]
                self.assertEqual(row["sessions_with_sitewide_onelink_click_24h"], expected)
                self.assertEqual(row["sessions_with_sitewide_onelink_impression"], expected)
                self.assertEqual(row["sessions_with_expanded_app_route_click_24h"], expected)
        started = 14 * 3_600_000_000  # 23:00 JST on the fixture reporting date.
        next_day = 16 * 3_600_000_000
        row = fixture.run([fixture.event("late", "session_start", started),
            fixture.event("late", "page_view", started + 1),
            bridge("late", offset=next_day),
            fixture.event("late", "page_view", next_day + 1)])[0]
        self.assertEqual(row["sessions_with_sitewide_onelink_click_24h"], 1)
        self.assertEqual(row["site_window_page_views"], 1)
        self.assertEqual(row["site_window_observed_visitors"], 1)

    def test_sitewide_rejects_nonproduction_unidentified_and_unstarted_events(self):
        events = fixture.visit("anchor") + [bridge("anchor",
            page_location="https://preview.example.test/")]
        events += [bridge("without-start")]
        for user, key in [(None, 1), ("", 1), ("no-session", None)]:
            events += fixture.visit(user, session_id=key) + [bridge(user, session_id=key)]
        row = fixture.run(events)[0]
        self.assertEqual(row["observed_started_sessions"], 1)
        self.assertEqual(row["sessions_with_sitewide_onelink_click_24h"], 0)
        self.assertEqual(row["sessions_with_expanded_app_route_click_24h"], 0)

    def test_sitewide_additions_preserve_every_frozen_v1_dimension_and_metric(self):
        legacy = TESTS / "fixtures/ga4-funnel-v1.sql"
        self.assertEqual(hashlib.sha256(legacy.read_bytes()).hexdigest(),
                         "a528c1054d236b9bd4a5fdc2d043ae82e282d9c6323213cbb92eeaff4347b71b")
        events = fixture.visit("all") + [fixture.click("all"), bridge("all"),
            bridge("all", bridge_scope="pilot", link_url=PILOT_URL)]
        events += fixture.visit("sitewide", attributed_source="google", attributed_medium="organic")
        events += [bridge("sitewide", attributed_source="google", attributed_medium="organic")]
        events += fixture.visit("qa") + [bridge("qa", bridge_scope="qa", link_url=QA_URL)]
        events += fixture.visit("none")
        events += [fixture.event("missing-landing", "session_start"), bridge("missing-landing")]
        events += fixture.visit("preview", page_location="https://preview.example.test/")
        current, prior = fixture.run(events), fixture.run(events, legacy)
        old_keys = set(prior[0])
        normalize = lambda rows: sorted(json.dumps({k: r[k] for k in old_keys}, sort_keys=True)
                                        for r in rows)
        self.assertEqual(normalize(current), normalize(prior))
        self.assertEqual(sum(r["sessions_with_sitewide_onelink_click_24h"] for r in current), 3)

    def test_quality_and_funnel_agree_on_scope_target_pairs(self):
        quality = fixture.SQL.with_name("ga4-quality.sql")
        cases = [
            ("sitewide", SITEWIDE_URL, 1, 0, 0),
            ("pilot", PILOT_URL, 0, 0, 0),
            ("qa", QA_URL, 0, 0, 0),
            ("pilot", SITEWIDE_URL, 0, 1, 0),
            ("qa", SITEWIDE_URL, 0, 1, 0),
            ("sitewide", PILOT_URL, 0, 1, 0),
            ("sitewide", QA_URL, 0, 1, 1),
            (None, SITEWIDE_URL, 0, 1, 0),
            ("other", SITEWIDE_URL, 0, 1, 0),
            ("sitewide", SITEWIDE_URL + "&extra=discard", 0, 1, 0),
        ]
        for scope, url, accepted, invalid, qa_mismatch in cases:
            with self.subTest(scope=scope, url=url):
                events = [bridge("a", bridge_scope=scope, link_url=url),
                    bridge("a", "web_to_app_impression", bridge_scope=scope, link_url=url)]
                funnel = fixture.run(fixture.visit("a") + events)[0]
                self.assertEqual(funnel["sessions_with_sitewide_onelink_click_24h"], accepted)
                self.assertEqual(funnel["sessions_with_sitewide_onelink_impression"], accepted)
                for row in fixture.run(events, quality):
                    self.assertEqual(row["recorded_events"], 1)
                    self.assertEqual(row["onelink_target_invalid_or_missing"], invalid)
                    self.assertEqual(row["onelink_qa_scope_mismatch"], qa_mismatch)
                    self.assertEqual(row["onelink_dimensions_incomplete"],
                                     int(scope not in {"qa", "pilot", "sitewide"}))
                    self.assertEqual(row["onelink_version_missing_or_other"], 0)
                    self.assertEqual(row["cta_dimensions_incomplete"], 0)


if __name__ == "__main__":
    unittest.main()
