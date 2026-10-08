#!/usr/bin/env python3
"""Import translation drafts without accepting stale or damaged protected text.

This does not publish HTML or establish linguistic quality. Invalid records are
reported for correction; the static build separately requires complete catalogs.
"""
import argparse
import json
from pathlib import Path
from build_site_translations import extract, CATALOGS
from localization_registry import ROOT, LOCALES, groups
from site_translation_validation import normalize, validate


def required_keys(locale, entries, page_groups):
    sources = {group['source'] for group in page_groups if locale not in group['existing']}
    return {entry['id'] for entry in entries if entry['source'] != locale
            and (entry.get('dynamic') or sources.intersection(entry['files']))}


def import_catalogs(directory, overrides, entries, page_groups):
    expected = {entry['id']: entry for entry in entries}
    catalogs, report = {}, {}
    for locale in LOCALES:
        needed = required_keys(locale, entries, page_groups)
        catalog, invalid = {}, {}
        for path in sorted(directory.glob('translations-*-'+locale+'.jsonl')):
            raw = path.read_text()
            lines = raw.splitlines()
            if lines and not raw.endswith('\n'):
                lines.pop()  # An active writer has not finished this record.
            for line in lines:
                row = json.loads(line)
                key = row['id']
                if key not in needed:
                    continue
                if row.get('target') != locale or row['source'] != expected[key]['text']:
                    invalid[key] = 'stale_source_or_wrong_target'
                    continue
                text = normalize(row['text'])
                problem = validate(row['source'], text, locale)
                if problem:
                    invalid[key] = problem
                    continue
                catalog[key] = {'source': row['source'], 'text': text}
                invalid.pop(key, None)
        override_path = overrides / (locale + '.json')
        if override_path.exists():
            for key, row in json.loads(override_path.read_text()).items():
                if key not in needed or row['source'] != expected[key]['text']:
                    raise ValueError('Review stale translation override: '+locale+':'+key)
                problem = validate(row['source'], row['text'], locale)
                if problem:
                    raise ValueError('Invalid translation override: '+locale+':'+key+':'+problem)
                catalog[key] = {'source': row['source'], 'text': normalize(row['text'])}
                invalid.pop(key, None)
        missing = sorted(needed - set(catalog))
        catalogs[locale] = catalog
        report[locale] = {'required': len(needed), 'accepted': len(catalog),
                          'invalid': invalid, 'missing': missing}
    return catalogs, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--report', type=Path)
    parser.add_argument('--overrides', type=Path, default=ROOT/'data/i18n/overrides')
    args = parser.parse_args()
    catalogs, report = import_catalogs(args.directory, args.overrides, extract(), groups())
    if args.write:
        CATALOGS.mkdir(parents=True, exist_ok=True)
        for locale, catalog in catalogs.items():
            (CATALOGS/(locale+'.json')).write_text(json.dumps(catalog, ensure_ascii=False, sort_keys=True, indent=2)+'\n')
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    for locale, result in report.items():
        print(f"{locale}: {result['accepted']}/{result['required']} accepted; {len(result['invalid'])} invalid drafts")
    return 1 if any(result['missing'] for result in report.values()) else 0


if __name__ == '__main__':
    raise SystemExit(main())
