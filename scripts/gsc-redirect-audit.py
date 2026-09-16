#!/usr/bin/env python3
"""Read-only public delivery audit. A passing result is not Google index status."""
import argparse
import datetime as dt
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://simplememofast.com'
HOSTS = {'simplememofast.com', 'www.simplememofast.com'}
REDIRECTS = {301, 302, 303, 307, 308}


class Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonicals, self.robots = [], []

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): v or '' for k, v in attrs}
        if tag == 'link' and 'canonical' in a.get('rel', '').lower().split():
            self.canonicals.append(a.get('href', ''))
        if tag == 'meta' and a.get('name', '').lower() in ('robots', 'googlebot'):
            self.robots.append(a.get('content', ''))


def safe_url(url):
    u = urllib.parse.urlsplit(url)
    if (u.scheme not in ('https', 'http') or u.hostname not in HOSTS
            or u.username or u.password or u.port is not None):
        raise ValueError('Unexpected URL; no request sent: ' + url)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def raw_request(url):
    safe_url(url)
    opener = urllib.request.build_opener(NoRedirect())
    req = urllib.request.Request(url, headers={'User-Agent': 'SimpleMemo-Redirect-Audit/1.0'})
    try:
        response = opener.open(req, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        headers = {k.lower(): v for k, v in response.headers.items()}
        body = b'' if response.code in REDIRECTS else response.read(4_000_001)
        if len(body) > 4_000_000:
            raise ValueError('Response exceeds 4 MB: ' + url)
        return {'status': response.code, 'headers': headers,
                'body': body.decode('utf-8', errors='replace')}


class PoliteClient:
    """Sequential reads, bounded Retry-After waits, and a stop on persistent 429.

    No rotating identity, cache-busting, allowlisting or bypass of site controls.
    The failed observations stay in the report even when a later retry succeeds.
    """
    def __init__(self, transport=raw_request, clock=time.monotonic, sleep=time.sleep,
                 wall_clock=time.time):
        self.transport, self.clock, self.sleep = transport, clock, sleep
        self.wall_clock = wall_clock
        self.next_allowed = 0
        self.started = clock()
        self.requests = 0
        self.retry_wait_seconds = 0
        self.rate_limits = []
        self.stopped = None

    def once(self, url):
        if self.stopped:
            raise RuntimeError(self.stopped + '; no further request sent')
        if self.clock() - self.started >= 900:
            self.stopped = 'Audit exceeded its 900-second request budget'
            raise RuntimeError(self.stopped)
        self.sleep(max(0, self.next_allowed - self.clock()))
        self.requests += 1
        try:
            return self.transport(url)
        finally:
            self.next_allowed = self.clock() + 2.0

    def retry_delay(self, value):
        try:
            delay = float(value) if value.isdigit() else (
                parsedate_to_datetime(value).timestamp() - self.wall_clock())
            # Be more conservative than a short/missing server delay.
            return max(60.0, delay)
        except (ValueError, TypeError, OverflowError, AttributeError):
            return 60.0

    def fetch(self, url):
        safe_url(url)
        result = self.once(url)
        if result['status'] != 429:
            return result
        retry_after = result['headers'].get('retry-after', '')
        delay = self.retry_delay(retry_after)
        event = {'url': url, 'status': 429, 'retry_after': retry_after,
                 'wait_seconds': delay, 'retried': False}
        self.rate_limits.append(event)
        if delay > 120 - self.retry_wait_seconds:
            self.stopped = 'Rate limit requires more than the remaining retry budget'
            return result
        self.retry_wait_seconds += delay
        self.sleep(delay)
        event['retried'] = True
        result = self.once(url)
        event['retry_status'] = result['status']
        if result['status'] == 429:
            self.stopped = 'Persistent HTTP 429; audit stopped to respect the rate limit'
        return result


CLIENT = PoliteClient()


def request(url):
    return CLIENT.fetch(url)


def trace(url, fetch=request):
    chain, seen = [], set()
    for _ in range(6):
        safe_url(url)
        if url in seen:
            raise ValueError('Redirect loop: ' + url)
        seen.add(url)
        result = fetch(url)
        status, headers = result['status'], result['headers']
        location = headers.get('location')
        chain.append({'url': url, 'status': status, 'location': location})
        if status not in REDIRECTS:
            head = Head()
            head.feed(result['body'])
            return {'chain': chain, 'final_url': url, 'final_status': status,
                    'canonical': head.canonicals, 'robots': head.robots,
                    'x_robots_tag': headers.get('x-robots-tag', ''),
                    'content_type': headers.get('content-type', '')}
        if not location:
            raise ValueError('Redirect without Location: ' + url)
        url = urllib.parse.urljoin(url, location)
    raise ValueError('More than five redirects: ' + url)


def validate(case, result):
    errors = []
    if result['final_status'] != 200:
        errors.append('final HTTP status is not 200')
    if result['final_url'] != case['to']:
        errors.append('unexpected final URL')
    hops = len(result['chain']) - 1
    expected_hops = 0 if case['from'] == case['to'] else 1
    if hops != expected_hops:
        errors.append(f'expected {expected_hops} redirect(s), observed {hops}')
    if any(step['status'] not in (301, 308) for step in result['chain'][:-1]):
        errors.append('non-permanent redirect')
    u = urllib.parse.urlsplit(case['to'])
    canonical = urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, '', ''))
    if result['canonical'] != [canonical]:
        errors.append('missing, duplicate or incorrect canonical')
    if 'text/html' not in result['content_type'].lower():
        errors.append('final response is not HTML')
    directives = result['robots'] + [result['x_robots_tag']]
    if any(re.search(r'\b(noindex|none)\b', value, re.I) for value in directives):
        errors.append('final document blocks indexing')
    return errors


def observe(case):
    try:
        result = trace(case['from'])
        return dict(case, **result, errors=validate(case, result))
    except Exception as error:
        return dict(case, errors=[f'{type(error).__name__}: {error}'])


def supplemental():
    pairs = [('/en?lang=en', '/en/'),
             ('/en?lang=ja&utm_source=audit&gclid=123&fbclid=456',
              '/en/?utm_source=audit&gclid=123&fbclid=456')]
    for slug in ('whatsapp', 'telegram', 'trello', 'slack-self-dm'):
        pairs.extend([(f'/vs/{slug}', '/vs/'), (f'/vs/{slug}?lang=en', '/vs/')])
    pairs.extend((source, '/') for source in ('/)', '/%29', '/)?lang=ja', '/%29?lang=ja'))
    return [{'from': ORIGIN + a, 'to': ORIGIN + b, 'supplemental': True} for a, b in pairs]


def discovery_checks(destinations):
    errors, locations = [], set()
    for path in ('/sitemap-ja.xml', '/sitemap-en.xml'):
        r = request(ORIGIN + path)
        if r['status'] != 200:
            raise ValueError(path + ' is not directly 200')
        for node in ET.fromstring(r['body']).iter():
            if node.tag == '{http://www.sitemaps.org/schemas/sitemap/0.9}loc' and node.text:
                locations.add(node.text.strip())
    r = request(ORIGIN + '/robots.txt')
    if r['status'] != 200:
        raise ValueError('robots.txt is not directly 200')
    robots = urllib.robotparser.RobotFileParser()
    robots.parse(r['body'].splitlines())
    for destination in sorted(destinations):
        if destination not in locations:
            errors.append(destination + ': missing from live sitemap')
        if not robots.can_fetch('Googlebot', destination):
            errors.append(destination + ': robots.txt blocks Googlebot')
    return {'sitemap_urls': len(locations), 'destinations': len(destinations), 'errors': errors}


def deployed():
    # Both responses distinguish this fix from the measured pre-deploy baseline.
    # No token, private endpoint, DNS change or cache purge is needed.
    for source, target in [('/en?lang=en', '/en/'), ('/vs/trello?lang=ja', '/vs/')]:
        try:
            result = trace(ORIGIN + source)
            if validate({'from': ORIGIN + source, 'to': ORIGIN + target}, result):
                return False
            if result['chain'][0]['status'] != 301:
                return False
        except Exception:
            return False
    return True


def selftest():
    import unittest
    from unittest import mock
    import contextlib
    import io
    import tempfile

    class FakeClock:
        def __init__(self):
            self.now = 0.0
            self.waits = []

        def clock(self):
            return self.now

        def sleep(self, seconds):
            self.waits.append(seconds)
            self.now += seconds

    def response(status=200, headers=None, body=None):
        return {'status': status, 'headers': headers or {'content-type': 'text/html'},
                'body': body if body is not None else '<link href="https://simplememofast.com/" rel="canonical">'}

    class Checks(unittest.TestCase):
        def result(self):
            return trace(ORIGIN + '/', lambda _: response())

        def test_good_direct(self):
            self.assertEqual(validate({'from': ORIGIN + '/', 'to': ORIGIN + '/'}, self.result()), [])

        def test_good_redirect(self):
            result = trace(ORIGIN + '/old', lambda u: response(301, {'location': '/'}) if u.endswith('/old') else response())
            self.assertEqual(validate({'from': ORIGIN + '/old', 'to': ORIGIN + '/'}, result), [])

        def test_chain_rejected(self):
            result = trace(ORIGIN + '/a', lambda u: response() if u.endswith('/') else response(301, {'location': '/b' if u.endswith('/a') else '/'}))
            self.assertTrue(validate({'from': ORIGIN + '/a', 'to': ORIGIN + '/'}, result))

        def test_loop_rejected(self):
            with self.assertRaisesRegex(ValueError, 'loop'):
                trace(ORIGIN + '/', lambda _: response(301, {'location': '/'}))

        def test_foreign_host_never_fetched(self):
            calls = []
            def fetch(url):
                calls.append(url)
                return response(301, {'location': 'https://example.com/'})
            with self.assertRaisesRegex(ValueError, 'no request sent'):
                trace(ORIGIN + '/', fetch)
            self.assertEqual(calls, [ORIGIN + '/'])

        def test_missing_location_rejected(self):
            with self.assertRaisesRegex(ValueError, 'without Location'):
                trace(ORIGIN + '/', lambda _: response(301))

        def test_missing_duplicate_and_wrong_canonical(self):
            for canonical in ([], [ORIGIN + '/wrong'], [ORIGIN + '/', ORIGIN + '/']):
                with self.subTest(canonical=canonical):
                    result = self.result(); result['canonical'] = canonical
                    self.assertTrue(validate({'from': ORIGIN + '/', 'to': ORIGIN + '/'}, result))

        def test_index_blocking_directives(self):
            for change in ({'robots': ['NOINDEX']}, {'robots': ['none']}, {'x_robots_tag': 'googlebot: noindex'}):
                result = self.result(); result.update(change)
                self.assertTrue(validate({'from': ORIGIN + '/', 'to': ORIGIN + '/'}, result))

        def test_bad_status_type_and_final_url(self):
            for change in ({'final_status': 404}, {'content_type': 'application/json'}, {'final_url': ORIGIN + '/wrong'}):
                result = self.result(); result.update(change)
                self.assertTrue(validate({'from': ORIGIN + '/', 'to': ORIGIN + '/'}, result))

        def test_html_attribute_order_and_bot_meta(self):
            h = Head(); h.feed("<LINK HREF='x' REL='canonical'><META CONTENT='none' NAME='googlebot'>")
            self.assertEqual(h.canonicals, ['x']); self.assertEqual(h.robots, ['none'])

        def test_unsafe_start_url_rejected(self):
            for url in ('file:///etc/passwd', 'https://example.com/', ORIGIN + ':8443/', 'https://user@simplememofast.com/'):
                with self.subTest(url=url), self.assertRaises(ValueError):
                    safe_url(url)

        def client(self, responses):
            clock = FakeClock()
            sent = []
            def transport(url):
                sent.append((url, clock.now))
                return responses.pop(0)
            return PoliteClient(transport, clock.clock, clock.sleep, lambda: 0), clock, sent

        def test_requests_are_spaced_at_least_two_seconds(self):
            client, clock, sent = self.client([response(), response(), response()])
            for _ in range(3):
                client.fetch(ORIGIN + '/')
            self.assertEqual([t for _, t in sent], [0, 2, 4])
            self.assertEqual(client.requests, 3)

        def test_429_waits_and_preserves_failed_observation(self):
            client, clock, sent = self.client([response(429, {'retry-after': '75'}), response()])
            self.assertEqual(client.fetch(ORIGIN + '/')['status'], 200)
            self.assertEqual([t for _, t in sent], [0, 75])
            self.assertEqual(client.rate_limits[0]['status'], 429)
            self.assertEqual(client.rate_limits[0]['retry_status'], 200)

        def test_retry_after_date_or_invalid_value(self):
            client, _, _ = self.client([])
            self.assertEqual(client.retry_delay('Thu, 01 Jan 1970 00:01:30 GMT'), 90)
            for value in ['', 'invalid', '0', '10']:
                self.assertEqual(client.retry_delay(value), 60)

        def test_persistent_429_stops_all_further_reads(self):
            client, clock, sent = self.client([response(429), response(429)])
            self.assertEqual(client.fetch(ORIGIN + '/')['status'], 429)
            with self.assertRaisesRegex(RuntimeError, 'no further request'):
                client.fetch(ORIGIN + '/sitemap-ja.xml')
            self.assertEqual(len(sent), 2)

        def test_long_retry_after_is_not_ignored_or_clamped(self):
            client, clock, sent = self.client([response(429, {'retry-after': '3600'})])
            self.assertEqual(client.fetch(ORIGIN + '/')['status'], 429)
            with self.assertRaises(RuntimeError):
                client.fetch(ORIGIN + '/')
            self.assertEqual(len(sent), 1)
            self.assertFalse(client.rate_limits[0]['retried'])

        def test_total_retry_wait_budget_is_bounded(self):
            client, clock, sent = self.client([response(429), response(), response(429),
                                              response(), response(429)])
            for _ in range(3):
                client.fetch(ORIGIN + '/')
            self.assertEqual(client.retry_wait_seconds, 120)
            self.assertEqual(len(sent), 5)
            with self.assertRaises(RuntimeError):
                client.fetch(ORIGIN + '/')

        def test_time_budget_prevents_further_transport(self):
            client, clock, sent = self.client([])
            clock.now = 900
            with self.assertRaisesRegex(RuntimeError, '900-second'):
                client.fetch(ORIGIN + '/')
            self.assertEqual(sent, [])

        def test_non_429_errors_are_not_hidden_by_retries(self):
            for status in [301, 403, 404, 410, 500, 503]:
                client, _, sent = self.client([response(status)])
                self.assertEqual(client.fetch(ORIGIN + '/')['status'], status)
                self.assertEqual(len(sent), 1)

        def test_main_success_failure_and_baseline_exit_codes(self):
            # Exercise main itself: an empty discovery-errors list previously
            # reached int([]), which crashes ONLY on an otherwise successful run.
            variants = [('verify', True, [], [], 0),
                        ('verify', False, [], [], 1),
                        ('verify', True, ['HTTP 429'], [], 1),
                        ('verify', True, [], ['blocked sitemap'], 1),
                        ('baseline', True, ['HTTP 429'], ['blocked sitemap'], 0)]
            for mode, ready, row_errors, discovery_errors, expected in variants:
                with self.subTest(mode=mode, ready=ready, row_errors=row_errors,
                                  discovery_errors=discovery_errors), tempfile.TemporaryDirectory() as tmp:
                    def fake_observe(case):
                        return dict(case, chain=[{'status': 200}], final_status=200,
                                    errors=list(row_errors))
                    outfile = Path(tmp) / 'result.json'
                    with mock.patch.dict(globals(), {
                        'observe': fake_observe, 'deployed': lambda: ready,
                        'discovery_checks': lambda _: {'errors': list(discovery_errors)},
                    }), contextlib.redirect_stdout(io.StringIO()):
                        code = main(['--mode', mode, '--wait-deploy', '0', '--output', str(outfile)])
                    self.assertEqual(code, expected)
                    report = json.loads(outfile.read_text())
                    self.assertEqual(len(report['results']), 101)
                    self.assertEqual(report['mode'], mode)
                    self.assertEqual(report['deployment_behavior_confirmed'], ready if mode == 'verify' else None)
                    self.assertEqual(report['discovery']['errors'], discovery_errors)

        def test_complete_verify_pipeline_with_fake_http_and_clock(self):
            fixture = json.loads((ROOT / 'docs/seo/gsc-redirect-cases-2026-09-16.json').read_text())
            cases = fixture['cases'] + supplemental()
            targets = {case['to'] for case in cases}
            mapping = {case['from']: case['to'] for case in cases}
            mapping[ORIGIN + '/vs/trello?lang=ja'] = ORIGIN + '/vs/'
            sitemap = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + ''.join(
                '<url><loc>' + url + '</loc></url>' for url in sorted(targets) if '?' not in url) + '</urlset>'
            def transport(url):
                if url.endswith('/robots.txt'):
                    return response(headers={'content-type': 'text/plain'}, body='User-agent: *\nAllow: /\n')
                if url.endswith(('/sitemap-ja.xml', '/sitemap-en.xml')):
                    return response(headers={'content-type': 'application/xml'}, body=sitemap)
                if url in mapping and mapping[url] != url:
                    return response(301, {'location': mapping[url]})
                self.assertIn(url, targets)
                return response(body='<link rel="canonical" href="' + url.split('?')[0] + '">')
            clock = FakeClock()
            client = PoliteClient(transport, clock.clock, clock.sleep, lambda: 0)
            with tempfile.TemporaryDirectory() as tmp:
                outfile = Path(tmp) / 'result.json'
                with mock.patch.dict(globals(), {'CLIENT': client}), contextlib.redirect_stdout(io.StringIO()):
                    code = main(['--mode', 'verify', '--output', str(outfile)])
                report = json.loads(outfile.read_text())
            self.assertEqual(code, 0)
            self.assertIs(report['deployment_behavior_confirmed'], True)
            self.assertEqual(report['summary']['original_passed'], 87)
            self.assertEqual(report['summary']['supplemental_rows'], 14)
            self.assertEqual(report['summary']['failed_rows'], 0)
            self.assertEqual(report['discovery']['errors'], [])
            self.assertEqual(client.requests, 208)
            self.assertEqual(clock.now, 414)

    return 0 if unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Checks)).wasSuccessful() else 1


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--selftest', action='store_true')
    parser.add_argument('--mode', choices=('baseline', 'verify'), default='baseline')
    parser.add_argument('--wait-deploy', type=int, default=0)
    parser.add_argument('--output', type=Path, default=Path('/tmp/gsc-redirect-audit.json'))
    args = parser.parse_args(argv)
    if args.selftest:
        return selftest()
    if not 0 <= args.wait_deploy <= 300:
        parser.error('--wait-deploy must be between 0 and 300 seconds')
    fixture = json.loads((ROOT / 'docs/seo/gsc-redirect-cases-2026-09-16.json').read_text())
    cases = fixture['cases']
    if len(cases) != 87 or len({c['from'] for c in cases}) != 87:
        raise ValueError('Expected exactly 87 distinct original URLs')
    ready = None
    if args.mode == 'verify':
        deadline = time.monotonic() + args.wait_deploy
        while True:
            ready = deployed()
            if ready or time.monotonic() >= deadline:
                break
            time.sleep(10)
    # Intentionally sequential: all HTTP reads, including redirects and discovery,
    # share CLIENT's two-second spacing rather than flooding the public endpoint.
    results = [observe(case) for case in cases + supplemental()]
    try:
        discovery = discovery_checks({c['to'] for c in cases})
    except Exception as error:
        discovery = {'errors': [f'{type(error).__name__}: {error}']}
    original = results[:87]
    report = {'checked_at': dt.datetime.now(dt.timezone.utc).isoformat(),
              'mode': args.mode, 'deployment_behavior_confirmed': ready,
              'source': fixture['source'], 'note': fixture['note'],
              'summary': {'original_rows': 87, 'original_passed': sum(not r['errors'] for r in original),
                          'original_final_200': sum(r.get('final_status') == 200 for r in original),
                          'original_direct': sum(len(r.get('chain', [])) == 1 for r in original),
                          'original_one_hop': sum(len(r.get('chain', [])) == 2 for r in original),
                          'unique_destinations': len({c['to'] for c in cases}),
                          'supplemental_rows': len(results) - 87,
                          'failed_rows': sum(bool(r['errors']) for r in results)},
              'delivery': {'requests': CLIENT.requests, 'minimum_interval_seconds': 2,
                           'rate_limit_observations': CLIENT.rate_limits,
                           'stopped': CLIENT.stopped},
              'discovery': discovery, 'results': results}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ('checked_at', 'mode', 'deployment_behavior_confirmed', 'summary', 'discovery')}, ensure_ascii=False))
    for r in results:
        chain = ' -> '.join(str(s['status']) for s in r.get('chain', []))
        print(('FAIL ' if r['errors'] else 'OK ') + r['from'] + ' : ' + chain + ' : ' + '; '.join(r['errors']))
    # Baselines can contain known pre-deploy failures. Never label them verified.
    failed = not ready or any(r['errors'] for r in results) or bool(discovery['errors'])
    return 1 if args.mode == 'verify' and failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
