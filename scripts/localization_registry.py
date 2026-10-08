"""Canonical topic-to-language routes, shared by HTML, navigation and sitemaps."""
import json
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCALES = ('ja', 'en', 'zh-Hans', 'zh-Hant', 'ko', 'es', 'pt-BR', 'id', 'ar', 'tr')


def page_url(file):
    return '/' + (file[:-10] if file.endswith('index.html') else file[:-5])


@lru_cache(maxsize=None)
def groups():
    path = ROOT / 'data/i18n/pages.json'
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    if data.get('version') != 1 or set(data.get('locales', [])) != set(LOCALES):
        raise ValueError('Translation registry must declare all ten supported locales')
    seen = set()
    for group in data['pages']:
        if group.get('existing', {}).get(group.get('sourceLocale')) != group.get('source'):
            raise ValueError('Translation source must be an existing editorial page')
        if set(group['pages']) != set(data['locales']):
            raise ValueError('A translation group is missing a locale')
        for file in group['pages'].values():
            if file in seen or '..' in Path(file).parts or Path(file).is_absolute() or not file.endswith('.html') or '\\' in file:
                raise ValueError('Duplicate or unsafe translation route: ' + file)
            seen.add(file)
        if any(group['pages'].get(locale) != file for locale, file in group['existing'].items()):
            raise ValueError('An existing translation must keep its published route')
        for anchors in group.get('anchors', {}).values():
            if set(anchors) != set(LOCALES) or any(not isinstance(value, str) or not value or '#' in value for value in anchors.values()):
                raise ValueError('Named anchor correspondence must cover all ten locales')
    return data['pages']


def published_groups():
    for group in groups():
        pages = {locale: file for locale, file in group['pages'].items()
                 if (ROOT / file).is_file()}
        if pages:
            yield group, pages


@lru_cache(maxsize=1)
def published_alternates():
    result = {}
    for group, pages in published_groups():
        alternatives = {locale: page_url(path) for locale, path in pages.items()}
        for file in pages.values():
            result[file] = alternatives
    return result


def alternates_for(file):
    return published_alternates().get(file)


def localized_fragment(group, fragment, locale):
    for anchors in group.get('anchors', {}).values():
        if fragment in anchors.values():
            return anchors[locale]
    return fragment
