#!/usr/bin/env python3
"""Give every column header cell an explicit `scope`.

    python3 scripts/add-table-scope.py --check
    python3 scripts/add-table-scope.py --write

A bare <th> is ambiguous: nothing in the markup says whether it heads a column
or a row, so a screen reader and a machine reader both have to guess from
position. `scope="col"` says it outright. The site published 697 <th> across
110 pages with 73 carrying scope — 10%.

Scope is only added where the answer is certain: a <th> inside <thead>, or a
<th> in the table's first row. Both are column headers by construction.

What this deliberately does NOT do is promote the first cell of each body row
from <td> to <th scope="row">, which is the other half of a properly described
table. That conversion is correct semantically and visible in the browser —
`.compare-table th` in style.min.css carries its own background and weight, so
every comparison table on the site would gain a bolded, shaded first column.
That is a design decision, not a markup fix, so it is left for a human. The
count of tables it would affect is printed by --check.
"""
import re
import sys
import pathlib

SKIP_DIRS = {'.git', 'node_modules', 'scripts', 'docs', 'screenshots', 'admin'}
ROOT = pathlib.Path(__file__).resolve().parent.parent

TABLE_RE = re.compile(r'<table\b[^>]*>.*?</table>', re.S)
ROW_RE = re.compile(r'<tr\b[^>]*>.*?</tr>', re.S)
TH_RE = re.compile(r'<th\b([^>]*)>')


def add_scope(table_html: str) -> tuple[str, int, bool]:
    """Returns (new_table, n_added, has_td_first_column)."""
    rows = list(ROW_RE.finditer(table_html))
    if not rows:
        return table_html, 0, False

    thead = re.search(r'<thead\b.*?</thead>', table_html, re.S)
    head_span = (thead.start(), thead.end()) if thead else (rows[0].start(), rows[0].end())

    added = 0
    out = []
    last = 0
    for m in TH_RE.finditer(table_html):
        if 'scope=' in m.group(1):
            continue
        if not (head_span[0] <= m.start() < head_span[1]):
            continue  # a <th> outside the header row: ambiguous, leave it
        out.append(table_html[last:m.start()])
        out.append(f'<th scope="col"{m.group(1)}>')
        last = m.end()
        added += 1
    out.append(table_html[last:])

    # Body rows whose first cell is a <td>: candidates for scope="row",
    # reported but not changed.
    body_rows = [r for r in rows if r.start() >= head_span[1]]
    has_td_first = any(
        re.match(r'\s*<td\b', ROW_RE.match(r.group(0)).group(0)[len(re.match(r'<tr\b[^>]*>', r.group(0)).group(0)):])
        for r in body_rows
    ) if body_rows else False
    return ''.join(out), added, has_td_first


def main() -> int:
    write = '--write' in sys.argv
    if not write and '--check' not in sys.argv:
        print('usage: add-table-scope.py --check | --write', file=sys.stderr)
        return 2

    total_added = 0
    files_changed = 0
    row_header_candidates = 0
    for f in sorted(ROOT.rglob('*.html')):
        if any(p in SKIP_DIRS for p in f.relative_to(ROOT).parts):
            continue
        html = f.read_text(encoding='utf-8')
        if '<th' not in html:
            continue
        new_html, added_here = html, 0
        pieces, last = [], 0
        for tm in TABLE_RE.finditer(html):
            patched, n, td_first = add_scope(tm.group(0))
            if td_first:
                row_header_candidates += 1
            pieces.append(html[last:tm.start()])
            pieces.append(patched)
            last = tm.end()
            added_here += n
        pieces.append(html[last:])
        new_html = ''.join(pieces)
        if added_here:
            total_added += added_here
            files_changed += 1
            print(f'  {"+" if write else "?"}{added_here:>3}  {f.relative_to(ROOT)}')
            if write:
                f.write_text(new_html, encoding='utf-8')

    print(f'\n{"added" if write else "would add"} scope="col" to {total_added} <th> '
          f'across {files_changed} page(s)')
    print(f'{row_header_candidates} table(s) still lead body rows with <td> — '
          f'promoting those to <th scope="row"> is a visual change, left for a human')
    return 0


if __name__ == '__main__':
    sys.exit(main())
