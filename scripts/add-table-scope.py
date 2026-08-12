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

`--rows` does the other half: promotes the first cell of each body row from
<td> to <th scope="row">, so the table describes both axes. This ships with a
CSS rule and cannot be run without it — `table th[scope=row]` in
assets/css/style.min.css. Every table class on this site styles its <th> as a
COLUMN header (muted uppercase for .compare-table, an accent-tinted band for
.comparison-table), so promoting a cell without that rule renders app names as
uppercase grey text or on a blue band. The rule outranks those by specificity
(0,1,2 against 0,1,1) and restores a plain, slightly bolder first cell.

Promotion is skipped where the first column is not a label: a cell over
LABEL_MAX characters is prose, and a row header holding a sentence helps
nobody. It is also skipped when the table has no header row, because a table
with neither axis described is a layout table and this cannot tell which way
it reads.
"""
import re
import sys
import pathlib

SKIP_DIRS = {'.git', 'node_modules', 'scripts', 'docs', 'screenshots', 'admin'}
ROOT = pathlib.Path(__file__).resolve().parent.parent

TABLE_RE = re.compile(r'<table\b[^>]*>.*?</table>', re.S)
ROW_RE = re.compile(r'<tr\b[^>]*>.*?</tr>', re.S)
TH_RE = re.compile(r'<th\b([^>]*)>')
FIRST_TD_RE = re.compile(r'(<tr\b[^>]*>\s*)<td\b([^>]*)>(.*?)</td>', re.S)
TAGS_RE = re.compile(r'<[^>]+>')

# Longest first-cell text still treated as a label rather than prose. The
# measured spread across the 163 candidate tables was median 16 / p90 26 /
# max 50 characters, so this excludes nothing that is actually a label.
LABEL_MAX = 60


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

    # Body rows whose first cell is a <td>: candidates for scope="row".
    body_rows = [r for r in rows if r.start() >= head_span[1]]
    has_td_first = any(
        re.match(r'\s*<td\b', ROW_RE.match(r.group(0)).group(0)[len(re.match(r'<tr\b[^>]*>', r.group(0)).group(0)):])
        for r in body_rows
    ) if body_rows else False
    return ''.join(out), added, has_td_first


def promote_row_headers(table_html: str) -> tuple[str, int]:
    """First <td> of each body row -> <th scope="row">. See LABEL_MAX."""
    rows = list(ROW_RE.finditer(table_html))
    if not rows:
        return table_html, 0
    thead = re.search(r'<thead\b.*?</thead>', table_html, re.S)
    head_end = thead.end() if thead else rows[0].end()
    if not thead and not TH_RE.search(rows[0].group(0)):
        return table_html, 0  # no header row: a layout table, direction unknown
    body = [r for r in rows if r.start() >= head_end]
    if not body:
        return table_html, 0

    # All-or-nothing per table: a half-promoted column is worse than neither,
    # because the rows that kept <td> then read as data under a header column.
    cells = []
    for r in body:
        m = FIRST_TD_RE.match(r.group(0))
        if not m:
            return table_html, 0
        text = re.sub(r'\s+', ' ', TAGS_RE.sub('', m.group(3))).strip()
        if len(text) > LABEL_MAX:
            return table_html, 0
        cells.append(r)

    out, last, n = [], 0, 0
    for r in cells:
        m = FIRST_TD_RE.match(r.group(0))
        s, e = r.start() + m.start(), r.start() + m.end()
        out.append(table_html[last:s])
        out.append(f'{m.group(1)}<th scope="row"{m.group(2)}>{m.group(3)}</th>')
        last = e
        n += 1
    out.append(table_html[last:])
    return ''.join(out), n


def main() -> int:
    write = '--write' in sys.argv
    rows_mode = '--rows' in sys.argv
    if not write and '--check' not in sys.argv:
        print('usage: add-table-scope.py [--rows] --check | --write', file=sys.stderr)
        return 2

    total_added = 0
    files_changed = 0
    row_header_candidates = 0
    promoted = 0
    tables_promoted = 0
    for f in sorted(ROOT.rglob('*.html')):
        if any(p in SKIP_DIRS for p in f.relative_to(ROOT).parts):
            continue
        html = f.read_text(encoding='utf-8')
        if '<th' not in html:
            continue
        new_html, added_here = html, 0
        pieces, last = [], 0
        promoted_here = 0
        for tm in TABLE_RE.finditer(html):
            patched, n, td_first = add_scope(tm.group(0))
            if td_first:
                row_header_candidates += 1
            if rows_mode:
                patched, k = promote_row_headers(patched)
                if k:
                    tables_promoted += 1
                    promoted_here += k
            pieces.append(html[last:tm.start()])
            pieces.append(patched)
            last = tm.end()
            added_here += n
        pieces.append(html[last:])
        new_html = ''.join(pieces)
        if added_here or promoted_here:
            total_added += added_here
            promoted += promoted_here
            files_changed += 1
            mark = f'{added_here:>3} col'
            if rows_mode:
                mark += f' / {promoted_here:>3} row'
            print(f'  {"+" if write else "?"} {mark}  {f.relative_to(ROOT)}')
            if write:
                f.write_text(new_html, encoding='utf-8')

    verb = 'added' if write else 'would add'
    print(f'\n{verb} scope="col" to {total_added} <th> across {files_changed} page(s)')
    if rows_mode:
        print(f'{verb} scope="row" to {promoted} cell(s) in {tables_promoted} table(s)')
        print('requires the `table th[scope=row]` rule in assets/css/style.min.css')
    else:
        print(f'{row_header_candidates} table(s) still lead body rows with <td> — '
              f'run with --rows to promote them')
    return 0


if __name__ == '__main__':
    sys.exit(main())
