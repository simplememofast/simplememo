#!/usr/bin/env python3
"""Read the SimpleMemo Partners-by-date UA report; no third-party dependencies.

Credentials live outside Git. stdout contains safe result metadata, never the
token, response errors, signed redirect URLs, or per-campaign rows.
"""
import argparse
import csv
import datetime as dt
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

ENDPOINT = 'https://hq1.appsflyer.com/api/agg-data/export/app/id6758438948/partners_by_date_report/v5'
TOKEN_PATH = Path.home() / '.config/appsflyer/simplememo/aggregate-api.token'
JST = dt.timezone(dt.timedelta(hours=9))
MAX_BYTES = 128 * 1024 * 1024
ROW_LIMIT = 200_000
DIMENSIONS = ('Date', 'Agency/PMD (af_prt)', 'Media Source (pid)', 'Campaign (c)')
BASE_METRICS = ('Installs', 'Sessions', 'Loyal Users', 'Total Revenue', 'Total Cost', 'Clicks', 'Impressions')
EXPECTED_METRICS = (*BASE_METRICS, 'af_purchase (Event counter)')
MISSING = {'', 'N/A', 'None'}


class ReadError(Exception):
    """Only fixed error codes belong in this exception, never server content."""


class RequestError(ReadError):
    def __init__(self, code, metadata):
        super().__init__(code)
        self.metadata = metadata


def request_parameters(start, end, today=None):
    today = today or dt.datetime.now(JST).date()
    try:
        first, last = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
    except ValueError:
        raise ReadError('invalid_date') from None
    if first.isoformat() != start or last.isoformat() != end:
        raise ReadError('invalid_date_format')
    if not 1 <= (last - first).days + 1 <= 31:
        raise ReadError('range_must_be_1_to_31_days')
    if last >= today:
        raise ReadError('current_or_future_JST_day_is_not_allowed')
    return {'from': start, 'to': end, 'timezone': 'Asia/Tokyo', 'currency': 'preferred', 'category': 'standard'}


def read_token(path=TOKEN_PATH):
    # No symlink or group/world access. Caller-controlled token values never
    # become command arguments or environment variables.
    parent = path.parent.lstat()
    if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.geteuid() or parent.st_mode & 0o077:
        raise ReadError('credential_directory_must_be_private')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise ReadError('credential_file_must_be_private')
        raw = stream.read(16_385)
    if len(raw) > 16_384:
        raise ReadError('credential_format_invalid')
    try:
        token = raw.decode('ascii').strip()
    except UnicodeError:
        raise ReadError('credential_format_invalid') from None
    if not 100 <= len(token) <= 8192 or len(token.split('.')) not in (3, 5) or not re.fullmatch(r'[A-Za-z0-9_.-]+', token):
        raise ReadError('credential_format_invalid')
    return token


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_report(parameters, token, opener=None):
    # Parameters are built locally; callers cannot inject a destination, app,
    # report, authorization query string, or retargeting population.
    if set(parameters) != {'from', 'to', 'timezone', 'currency', 'category'}:
        raise ReadError('unexpected_request_parameters')
    if parameters != request_parameters(parameters['from'], parameters['to']):
        raise ReadError('unexpected_request_parameters')
    request = urllib.request.Request(ENDPOINT + '?' + urllib.parse.urlencode(parameters),
        headers={'Authorization': 'Bearer ' + token, 'Accept': 'text/csv'}, method='GET')
    opener = opener or urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=30) as response:
            media_type = response.headers.get('Content-Type', '').split(';')[0].strip().lower()
            metadata = {'http_status': response.status,
                        'content_type': 'text/csv' if media_type == 'text/csv' else 'unexpected'}
            if response.status != 200:
                raise RequestError('unexpected_http_status', metadata)
            if media_type != 'text/csv':
                raise RequestError('expected_csv_content_type', metadata)
            body = response.read(MAX_BYTES + 1)
    except urllib.error.HTTPError as error:
        # Do not read/log error bodies: they may echo credentials or links.
        metadata = {'http_status': error.code}
        if error.code in (301, 302, 303, 307, 308):
            target = urllib.parse.urlsplit(error.headers.get('Location', ''))
            metadata['redirect_host'] = target.hostname if target.hostname in ('hq1.appsflyer.com', 'rawdata.appsflyer.com') else 'other_host'
            error.close()
            raise RequestError('redirect_requires_review_no_auth_forwarded', metadata) from None
        error.close()
        raise RequestError('http_request_failed', metadata) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise RequestError('transport_failed', {}) from None
    if len(body) > MAX_BYTES:
        raise RequestError('response_size_limit_exceeded', metadata)
    if token.encode('ascii') in body:
        raise RequestError('credential_echo_response_rejected', metadata)
    metadata['bytes'] = len(body)
    return body, metadata


def inspect_csv(body, start, end):
    try:
        reader = csv.DictReader(io.StringIO(body.decode('utf-8-sig'), newline=''))
        fields = reader.fieldnames or []
        if len(fields) != len(set(fields)) or any(k not in fields for k in (*DIMENSIONS, 'Installs', 'Total Revenue')):
            raise ReadError('unexpected_csv_schema')
        metric_fields = [f for f in fields if f in BASE_METRICS or f.endswith(' (Event counter)')
                         or re.fullmatch(r'.+ \(Sales in [A-Z]{3}\)', f)]
        sums = {f: Decimal(0) for f in metric_fields}
        missing = {f: 0 for f in metric_fields}
        first, last = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
        seen, dates = set(), set()
        rows = 0
        na_cells = 0
        organic_rows = 0
        for row in reader:
            if None in row or any(value is None for value in row.values()):
                raise ReadError('csv_row_width_mismatch')
            day = dt.date.fromisoformat(row['Date'])
            if day.isoformat() != row['Date']:
                raise ReadError('noncanonical_csv_date')
            if not first <= day <= last:
                raise ReadError('csv_date_outside_requested_range')
            key = tuple(row[k] for k in DIMENSIONS)
            if key in seen:
                raise ReadError('duplicate_date_agency_source_campaign')
            seen.add(key); dates.add(day)
            rows += 1
            na_cells += sum(value == 'N/A' for value in row.values())
            organic_rows += row['Media Source (pid)'] == 'Organic'
            for field in metric_fields:
                raw = row[field]
                if raw in MISSING:
                    missing[field] += 1
                    continue
                value = Decimal(raw)
                if not value.is_finite():
                    raise ReadError('nonfinite_metric')
                is_count = field not in ('Total Revenue', 'Total Cost') and ' (Sales in ' not in field
                if is_count and (value < 0 or value != value.to_integral_value()):
                    raise ReadError('invalid_count_metric')
                sums[field] += value
    except (UnicodeError, csv.Error, ValueError, InvalidOperation):
        raise ReadError('invalid_csv_or_numeric_value') from None
    cap_hit = rows >= ROW_LIMIT
    currencies = sorted(set(re.findall(r'\(Sales in ([A-Z]{3})\)', '\n'.join(fields))))
    expected_dates = {first + dt.timedelta(days=i) for i in range((last - first).days + 1)}
    return {
        'rows': rows, 'columns': len(fields), 'sha256': hashlib.sha256(body).hexdigest(),
        'row_cap_hit': cap_hit, 'empty_report': rows == 0,
        'missing_metric_columns': [f for f in EXPECTED_METRICS if f not in fields],
        'missing_dates': sorted(d.isoformat() for d in expected_dates - dates),
        'na_cells_preserved': na_cells, 'organic_rows': organic_rows,
        'reported_sales_currencies': currencies,
        'total_revenue_currency_from_sales_headers': currencies[0] if len(currencies) == 1 else None,
        'additive_metrics': {f: {'observed_sum': str(sums[f]), 'missing_cells': missing[f],
            'report_sum': str(sums[f]) if rows and not missing[f] and not cap_hit else None} for f in metric_fields},
        'notes': [
            'UA install-date LTV report at retrieval time, not activity-period revenue or equal-age D35. Later retrieval can change cohort revenue.',
            'Organic is not SEO. Date/source/campaign rows and unique-user columns are not added to manufacture a person count.',
            'Ratios, CPI/ARPU and event unique users are never summed. Missing values/dates remain missing; no zero-filled calendar is created.',
            'Event columns can be absent for a requested period. A missing purchase column is unavailable, not a reported zero.',
            'Currency and timezone are requested app settings. Sales-column currency is an observation, not a currency conversion. API integrity does not prove vendor freshness or public attribution.',
        ],
    }


def output_directory(root):
    if not root.is_absolute():
        raise ReadError('output_root_must_be_absolute')
    root = root.resolve()
    if any((parent / '.git').exists() for parent in (root, *root.parents)):
        raise ReadError('output_must_be_outside_git')
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if root.stat().st_uid != os.geteuid() or root.stat().st_mode & 0o077:
        raise ReadError('output_directory_must_be_private')
    run = root / (dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + uuid.uuid4().hex[:8])
    run.mkdir(mode=0o700)
    return run


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--from', dest='start', required=True)
    parser.add_argument('--to', dest='end', required=True)
    parser.add_argument('--output-root', required=True, type=Path)
    args = parser.parse_args(argv)
    os.umask(0o077)
    record = {'schema': 'simplememo_appsflyer_aggregate_v1', 'endpoint': ENDPOINT,
              'credential_source': 'private_local_file', 'browser_or_clipboard_read': False}
    run = None
    try:
        parameters = request_parameters(args.start, args.end)
        token = read_token()
        run = output_directory(args.output_root)
        record.update({'parameters': parameters, 'population': 'user_acquisition',
                       'started_at': dt.datetime.now(dt.timezone.utc).isoformat()})
        body, metadata = fetch_report(parameters, token)
        record.update(metadata)
        with (run / 'report.csv').open('xb') as stream:
            stream.write(body)
        record['quality'] = inspect_csv(body, args.start, args.end)
        record['ok'] = not record['quality']['row_cap_hit']
        if not record['ok']:
            record['error'] = 'row_cap_hit_report_is_partial'
    except RequestError as error:
        record.update(error.metadata)
        record.update({'ok': False, 'error': str(error)})
    except ReadError as error:
        record.update({'ok': False, 'error': str(error)})
    except FileNotFoundError:
        record.update({'ok': False, 'error': 'credential_or_output_path_missing'})
    except (OSError, ValueError):
        record.update({'ok': False, 'error': 'local_io_or_configuration_failed'})
    record['finished_at'] = dt.datetime.now(dt.timezone.utc).isoformat()
    if run:
        with (run / 'result.json').open('x') as stream:
            json.dump(record, stream, indent=2)
            stream.write('\n')
    quality = record.get('quality', {})
    print(json.dumps({'ok': record.get('ok', False), 'output': str(run) if run else None,
                      'http_status': record.get('http_status'), 'error': record.get('error'),
                      'rows': quality.get('rows'), 'sha256': quality.get('sha256')}))
    return 0 if record.get('ok') else 1


if __name__ == '__main__':
    sys.exit(main())
