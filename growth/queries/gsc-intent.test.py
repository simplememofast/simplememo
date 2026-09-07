"""Execute the fixed SELECT with synthetic URL export rows (no network)."""
import sqlite3
from pathlib import Path

db = sqlite3.connect(':memory:')
db.row_factory = sqlite3.Row
db.create_function('SAFE_DIVIDE', 2, lambda a, b: a / b if b else None)
db.execute('CREATE TABLE source (data_date TEXT, url TEXT, clicks INT, impressions INT, sum_position INT, query TEXT, is_anonymized_query INT, site_url TEXT, search_type TEXT)')
u = 'https://simplememofast.com/vs/logseq/'
base = ['2026-09-01', u, 1, 10, 20, 'logseq', 0, 'sc-domain:simplememofast.com', 'WEB']
rows = [base, base, [*base[:2], 0, 5, 15, 'suppressed', 1, *base[7:]], [*base[:2], 0, 3, 9, 'another suppressed', 1, *base[7:]], [*base[:2], 0, 2, 4, '', 0, *base[7:]]]
for index, value in [(0, '2026-08-01'), (1, 'https://simplememofast.com/'), (7, 'sc-domain:other.test'), (8, 'IMAGE')]:
    excluded = base.copy(); excluded[index] = value; rows.append(excluded)
db.executemany('INSERT INTO source VALUES (?,?,?,?,?,?,?,?,?)', rows)
sql = (Path(__file__).resolve().parents[1] / 'sql/analytics/gsc-intent.sql').read_text().replace('`yurika-simplememo.searchconsole.searchdata_url_impression`', 'source')
result = [dict(r) for r in db.execute(sql, {'start_date': '2026-09-01', 'end_date': '2026-09-02'})]
assert len(result) == 3, result
buckets = {r['query_status']: r for r in result}
assert buckets['known']['clicks'] == 2 and buckets['known']['impressions'] == 20
assert buckets['known']['position'] == 3 and buckets['known']['ctr'] == 0.1
assert buckets['anonymous']['query'] is None and buckets['anonymous']['impressions'] == 8
assert buckets['missing']['query'] is None and buckets['missing']['impressions'] == 2
assert sum(r['impressions'] for r in result) == 30
assert sum(r['clicks'] for r in result) == 2
assert sum(r['position_sum'] for r in result) == 68
assert list(db.execute(sql, {'start_date': '2026-09-02', 'end_date': '2026-09-02'})) == []
print('PASS: duplicate dimensions aggregate; anonymous and missing queries stay separate; scope, dates, sums, weighted metrics and empty windows verified')
