#!/usr/bin/env python3
"""Read-only public delivery audit. A passing result is not Google index status."""
import argparse
import concurrent.futures
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


def request(url):
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

    return 0 if unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Checks)).wasSuccessful() else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--selftest', action='store_true')
    parser.add_argument('--mode', choices=('baseline', 'verify'), default='baseline')
    parser.add_argument('--wait-deploy', type=int, default=0)
    parser.add_argument('--output', type=Path, default=Path('/tmp/gsc-redirect-audit.json'))
    args = parser.parse_args()
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
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(observe, cases + supplemental()))
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
              'discovery': discovery, 'results': results}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ('checked_at', 'mode', 'deployment_behavior_confirmed', 'summary', 'discovery')}, ensure_ascii=False))
    for r in results:
        chain = ' -> '.join(str(s['status']) for s in r.get('chain', []))
        print(('FAIL ' if r['errors'] else 'OK ') + r['from'] + ' : ' + chain + ' : ' + '; '.join(r['errors']))
    # Baselines can contain known pre-deploy failures. Never label them verified.
    return int(args.mode == 'verify' and (not ready or any(r['errors'] for r in results) or discovery['errors']))


if __name__ == '__main__':
    raise SystemExit(main())
