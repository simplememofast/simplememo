"""Execute the actual D1 SQL on adversarial synthetic data; no network or secrets."""
import json
from pathlib import Path
import sqlite3
import unittest

SQL = Path(__file__).with_name('voice-shift-v2.sql').read_text()
DAY = 86_400_000


class VoiceShiftTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
          CREATE TABLE app_analytics_events (id INTEGER PRIMARY KEY, event_id TEXT UNIQUE,
            anonymous_install_id TEXT, server_timestamp INTEGER, event_name TEXT, properties_json TEXT, locale TEXT);
          CREATE TABLE send_correlation (message_id TEXT, email_hash TEXT);
        ''')
        self.sequence = 0

    def tearDown(self):
        self.db.close()

    def event(self, iid, name, ts, **props):
        self.sequence += 1
        locale = props.pop('locale', None)
        self.db.execute('INSERT INTO app_analytics_events VALUES(?,?,?,?,?,?,?)',
                        (self.sequence, 'e'+str(self.sequence), iid, ts, name, json.dumps(props), locale))

    def run_query(self, start=DAY, end=3*DAY):
        rows = [dict(x) for x in self.db.execute(SQL, [start, end, '["internal"]', '["staff-hash"]'])]
        summary = json.loads(next(x['details'] for x in rows if x['report'] == 'summary'))
        counts = {(x['report'], x['category']): x['n'] for x in rows if x['report'] != 'summary'}
        self.assertEqual(sum(v for (r, _), v in counts.items() if r == 'first_capture_input_tag'), summary['first_capture_installs'])
        self.assertEqual(sum(v for (r, _), v in counts.items() if r == 'day0_length_bucket'), summary['day0_events'])
        self.assertEqual(sum(v for (r, _), v in counts.items() if r == 'receipt_jst_hour'), summary['capture_events'])
        return summary, counts

    def test_mirror_test_and_queue_are_not_additional_captures(self):
        self.event('a', 'app_first_open', DAY)
        for event in ['memo_send_success', 'first_memo_send_success', 'test_send_success', 'queued_send_flushed']:
            self.event('a', event, DAY+1, input_method='voice', memo_length_bucket='1-10')
        s, c = self.run_query()
        self.assertEqual(s['capture_events'], 1)
        self.assertEqual(c['first_capture_input_tag', 'voice'], 1)

    def test_boolean_false_missing_and_malformed_are_distinct_from_enabled(self):
        for iid in ['true', 'false', 'missing', 'string-true']:
            self.event(iid, 'app_first_open', DAY)
        self.event('true', 'obsidian_configured', DAY+1, value=True)
        self.event('true', 'obsidian_configured', DAY+2, value=False)
        self.event('false', 'obsidian_configured', DAY+1, value=False)
        self.event('string-true', 'obsidian_configured', DAY+1, value='true')
        s, _ = self.run_query()
        self.assertEqual((s['cohort_installs'], s['obsidian_known_installs'], s['obsidian_enabled_installs']), (4, 2, 1))

    def test_retained_prior_open_repeat_presave_and_both_are_diagnosed(self):
        self.event('old', 'app_first_open', DAY-1)
        self.event('old', 'app_first_open', DAY+1)
        for iid in ['repeat', 'presave', 'both', 'valid']:
            self.event(iid, 'app_first_open', DAY+1)
        for iid in ['repeat', 'both']:
            self.event(iid, 'app_first_open', DAY+2)
        for iid in ['presave', 'both']:
            self.event(iid, 'memo_send_success', DAY)
        s, _ = self.run_query()
        self.assertEqual(s['candidate_installs'], 4)
        self.assertEqual(s['repeated_open_noninternal'], 2)
        self.assertEqual(s['presave_noninternal'], 2)
        self.assertEqual(s['excluded_ambiguous_noninternal_union'], 3)
        self.assertEqual(s['cohort_installs'], 1)

    def test_internal_defaults_and_correlation_exclude_before_reporting(self):
        for iid in ['internal', 'resolved', 'public']:
            self.event(iid, 'app_first_open', DAY)
            self.event(iid, 'memo_send_success', DAY+1, client_send_id=iid+'-message')
        self.db.execute('INSERT INTO send_correlation VALUES(?,?)', ('resolved-message', 'staff-hash'))
        s, _ = self.run_query()
        self.assertEqual((s['excluded_internal_installs'], s['cohort_installs'], s['capture_events']), (2, 1, 1))

    def test_dedupe_is_per_install_with_separate_event_id_namespace(self):
        for iid in ['a', 'b']:
            self.event(iid, 'app_first_open', DAY)
        self.event('a', 'memo_send_success', DAY+1, client_send_id='same')
        self.event('a', 'obsidian_only_memo_saved', DAY+2, client_send_id='same')
        self.event('b', 'memo_send_success', DAY+1, client_send_id='same')
        # next event ID e6 must not collide with client_send_id e6 on a different event.
        self.event('a', 'memo_send_success', DAY+3)
        self.event('a', 'memo_send_success', DAY+4, client_send_id='e6')
        s, _ = self.run_query()
        self.assertEqual(s['capture_rows_before_dedupe'], 5)
        self.assertEqual(s['capture_events'], 4)

    def test_window_is_half_open_and_jst_day0_is_not_24_hours(self):
        # DAY + 14h = JST 23:00; two hours later is a different JST date.
        t0 = DAY + 14*3_600_000
        self.event('a', 'app_first_open', t0)
        self.event('a', 'memo_send_success', t0, memo_length_bucket='1-10')
        self.event('a', 'memo_send_success', t0+2*3_600_000, memo_length_bucket='11-50')
        self.event('a', 'memo_send_success', 3*DAY)
        self.event('late', 'app_first_open', 3*DAY)
        s, c = self.run_query()
        self.assertEqual((s['cohort_installs'], s['capture_events'], s['day0_events']), (1, 2, 1))
        self.assertEqual(c['receipt_jst_hour', '23'], 1)
        self.assertEqual(c['receipt_jst_hour', '01'], 1)

    def test_unknown_tags_buckets_and_locale_stay_in_denominators(self):
        self.event('a', 'app_first_open', DAY)
        self.event('a', 'obsidian_only_memo_saved', DAY+1, input_method='future-tag', memo_length_bucket='12')
        self.event('b', 'app_first_open', DAY)
        self.event('b', 'memo_send_success', DAY+1, input_method='keyboard', memo_length_bucket='51-200', locale='ja-JP')
        s, c = self.run_query()
        self.assertEqual(c['first_capture_input_tag', 'unknown'], 1)
        self.assertEqual(c['day0_length_bucket', 'unknown'], 1)
        self.assertEqual((s['first_capture_installs'], s['ja_locale_events'], s['locale_missing_events']), (2, 1, 1))

    def test_locale_uses_envelope_column_and_not_a_nested_or_prefix_lookalike(self):
        self.event('a', 'app_first_open', DAY)
        self.event('a', 'memo_send_success', DAY+1, locale='jargon')
        self.db.execute("UPDATE app_analytics_events SET properties_json=? WHERE event_name='memo_send_success'", ('{"locale":"ja"}',))
        self.event('a', 'memo_send_success', DAY+2, locale='ja_JP')
        s, _ = self.run_query()
        self.assertEqual((s['ja_locale_events'], s['locale_missing_events']), (1, 0))

    def test_empty_window_has_explicit_zero_summary_not_fabricated_distribution(self):
        s, c = self.run_query()
        self.assertEqual(s['cohort_installs'], 0)
        self.assertEqual(s['obsidian_known_installs'], 0)
        self.assertEqual(c, {})


if __name__ == '__main__':
    unittest.main()
