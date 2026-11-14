#!/usr/bin/env python3
"""Contracts for the photo-led Japanese homepage, with no encoders or writes.

Run with: python -B scripts/perf/test_editorial_home.py
Fixtures do not depend on the current homepage, so both page generations remain
testable after the checked-in page switches to the editorial profile.
"""
from __future__ import annotations

from copy import deepcopy
from html.parser import HTMLParser
import importlib.util
import json
from pathlib import Path
import sys
import unittest

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import build_home  # noqa: E402


def load_film_guard():
    spec = importlib.util.spec_from_file_location('editorial_film_guard', HERE.parent / 'check_home_film.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


film_guard = load_film_guard()
SIZES = '(max-width: 820px) calc(100vw - 40px), (max-width: 1400px) 51vw, 700px'
SRCSET = ', '.join(f'/assets/home-perf/voice-airpods-pro-bright-1536-{w}-0123456789ab.avif {w}w'
                   for w in (600, 750, 900, 1200, 1536))
QUESTION = 'Obsidianを使っていなくても使えますか？'
ANSWER = 'はい。自分宛てのメールだけでも使えます。'


def nodes():
    return [
        {'@context': 'https://schema.org', '@type': 'WebSite', '@id': 'https://simplememofast.com/#website',
         'url': 'https://simplememofast.com/', 'name': 'シンプルメモ'},
        {'@context': 'https://schema.org', '@type': 'Organization', '@id': 'https://simplememofast.com/#organization',
         'name': '株式会社ユリカ'},
        {'@context': 'https://schema.org', '@type': 'WebPage', '@id': 'https://simplememofast.com/#webpage',
         'url': 'https://simplememofast.com/', 'inLanguage': 'ja'},
        {'@context': 'https://schema.org', '@type': 'SoftwareApplication', '@id': 'https://simplememofast.com/#app',
         'name': 'シンプルメモ', 'url': 'https://simplememofast.com/',
         'downloadUrl': 'https://apps.apple.com/jp/app/id6758438948',
         'applicationCategory': 'ProductivityApplication', 'operatingSystem': 'iOS, watchOS'},
        {'@context': 'https://schema.org', '@type': 'FAQPage', '@id': 'https://simplememofast.com/#faq',
         'mainEntity': [{'@type': 'Question', 'name': QUESTION,
                         'acceptedAnswer': {'@type': 'Answer', 'text': ANSWER}}]},
    ]


def schema_markup(payloads):
    return ''.join('<script type="application/ld+json">' + json.dumps(p, ensure_ascii=False) + '</script>'
                   for p in payloads)


def fixture(payloads=None):
    schemas = schema_markup(nodes() if payloads is None else payloads)
    return f"""<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta name="description" content="声や文字から自分宛てのメールに残すメモアプリです。">
<meta name="apple-itunes-app" content="app-id=6758438948, app-argument=https://simplememofast.com/">
<title>シンプルメモ｜声で、いつもの場所へ</title>
<link rel="canonical" href="https://simplememofast.com/">
<link rel="stylesheet" href="/assets/css/home-editorial.css?v=0123456789">
{schemas}</head><body class="sm-editorial">
<a class="skip-link" href="#main">本文へスキップ</a>
<header><nav aria-label="メインナビゲーション"><a href="#faq">よくある質問</a></nav></header>
<main id="main"><section class="hero" aria-labelledby="hero-title">
<h1 id="hero-title">思いついたら、声で、Obsidianへ。</h1>
<p>自分宛てのメールと、いつものノートへ。</p>
<a class="store-link" data-cta-position="hero" data-cta-placement="hero" data-cta-cluster="home" data-cta-variant="v1" href="https://apps.apple.com/jp/app/id6758438948?pt=128498560&amp;ct=web_other_v1&amp;mt=8">App Storeからダウンロード</a>
<figure class="hero-image"><picture class="hero__photograph">
<img src="/assets/img/voice-airpods-pro-bright-1536.webp" srcset="/assets/img/voice-airpods-pro-bright-600.webp 600w, /assets/img/voice-airpods-pro-bright-900.webp 900w, /assets/img/voice-airpods-pro-bright-1536.webp 1536w" sizes="{SIZES}" width="1536" height="1024" alt="AirPodsを着けた女性。生成されたイメージ画像です。" loading="eager" fetchpriority="high" decoding="async">
</picture><figcaption>写真はイメージです</figcaption></figure></section>
<section id="faq" aria-labelledby="faq-title"><h2 id="faq-title">よくある質問</h2>
<details class="faq-details"><summary>{QUESTION}</summary><p>{ANSWER}</p></details></section></main>
<footer><a href="/privacy">プライバシー</a></footer>
<script src="/js/app-store-tracking.js?v=0123456789" defer data-sitewide-app-routes="true"></script>
</body></html>"""


class Elements(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.tags = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

    def matching(self, tag, **attrs):
        return [a for t, a in self.tags if t == tag and all(a.get(k) == v for k, v in attrs.items())]


class EditorialProfile(unittest.TestCase):
    def test_actual_body_class_token_selects_only_japanese_root(self):
        page = fixture().replace('class="sm-editorial"', 'class="site-designed sm-editorial capture-home"')
        self.assertTrue(build_home.is_editorial_home(page))
        self.assertFalse(build_home.is_editorial_home(page, 'en/index.html'))
        self.assertFalse(build_home.is_editorial_home(page, 'blog/obsidian-voice-input.html'))

    def test_comments_scripts_other_elements_and_lookalikes_do_not_select_profile(self):
        legacy = fixture().replace('class="sm-editorial"', 'class="legacy-home"')
        cases = [
            legacy.replace('</head>', '<!-- <body class="sm-editorial"> --></head>'),
            legacy.replace('</head>', '<script>const example = \'<body class="sm-editorial">\';</script></head>'),
            legacy.replace('</main>', '<div class="sm-editorial"></div></main>'),
            fixture().replace('class="sm-editorial"', 'class="sm-editorial-copy"'),
        ]
        for index, page in enumerate(cases):
            with self.subTest(case=index):
                self.assertFalse(build_home.is_editorial_home(page))


class EditorialContract(unittest.TestCase):
    def reject(self, page, label):
        self.assertTrue(build_home.editorial_contract_errors(page), label + ' was accepted')

    def test_valid_fixture_needs_no_legacy_inline_styles_banners_or_film(self):
        page = fixture()
        self.assertNotIn('data-home-perf="base"', page)
        self.assertNotIn('data-home-banner', page)
        self.assertNotIn('home-film', page)
        self.assertEqual(build_home.editorial_contract_errors(page), [])

    def test_schema_graph_and_array_are_supported(self):
        for payloads in ([{'@context': 'https://schema.org', '@graph': nodes()}], [nodes()]):
            with self.subTest(kind=type(payloads[0]).__name__):
                self.assertEqual(build_home.editorial_contract_errors(fixture(payloads)), [])

    def test_required_document_semantics_are_not_optional(self):
        base = fixture()
        mutations = {
            'wrong language': ('<html lang="ja">', '<html lang="en">'),
            'noindex': ('content="index,follow,max-image-preview:large,max-snippet:-1"', 'content="noindex,nofollow"'),
            'wrong canonical': ('<link rel="canonical" href="https://simplememofast.com/">', '<link rel="canonical" href="https://simplememofast.com/en/">'),
            'duplicate canonical': ('</head>', '<link rel="canonical" href="https://simplememofast.com/"></head>'),
            'wrong smart banner': ('app-id=6758438948,', 'app-id=123456789,'),
            'duplicate smart banner': ('</head>', '<meta name="apple-itunes-app" content="app-id=6758438948"></head>'),
            'empty description': ('content="声や文字から自分宛てのメールに残すメモアプリです。"', 'content=""'),
            'empty viewport': ('content="width=device-width,initial-scale=1,viewport-fit=cover"', 'content=""'),
            'empty title': ('<title>シンプルメモ｜声で、いつもの場所へ</title>', '<title></title>'),
            'missing stylesheet': ('<link rel="stylesheet" href="/assets/css/home-editorial.css?v=0123456789">', ''),
            'wrong stylesheet': ('/assets/css/home-editorial.css?v=0123456789', '/assets/css/unrelated.css?v=0123456789'),
            'duplicate stylesheet': ('</head>', '<link rel="stylesheet" href="/assets/css/home-editorial.css"></head>'),
            'missing h1': ('<h1 id="hero-title">思いついたら、声で、Obsidianへ。</h1>', '<h2>見出し</h2>'),
            'duplicate h1': ('</main>', '<h1>もう一つ</h1></main>'),
            'duplicate main': ('</main>', '</main><main id="extra"></main>'),
            'broken skip destination': ('href="#main"', 'href="#missing-main"'),
            'missing skip link': ('<a class="skip-link" href="#main">本文へスキップ</a>', ''),
            'missing tracker': ('/js/app-store-tracking.js?v=0123456789', '/js/other.js'),
            'disabled tracker routing': ('data-sitewide-app-routes="true"', 'data-sitewide-app-routes="false"'),
            'duplicate tracker': ('</body>', '<script src="/js/app-store-tracking.js" data-sitewide-app-routes="true"></script></body>'),
            'legacy inline style': ('</head>', '<style data-home-perf="base">body{color:black}</style></head>'),
        }
        for label, (before, after) in mutations.items():
            self.assertIn(before, base)
            with self.subTest(label=label):
                self.reject(base.replace(before, after, 1), label)

    def test_hero_fallback_remains_accessible_and_eager(self):
        base = fixture()
        mutations = {
            'missing photograph': ('class="hero__photograph"', 'class="unrelated-picture"'),
            'empty alt': ('alt="AirPodsを着けた女性。生成されたイメージ画像です。"', 'alt=""'),
            'unqualified generated portrait': ('alt="AirPodsを着けた女性。生成されたイメージ画像です。"', 'alt="利用者の実写写真"'),
            'zero dimension': ('width="1536"', 'width="0"'),
            'invalid dimension': ('height="1024"', 'height="auto"'),
            'lazy hero': ('loading="eager"', 'loading="lazy"'),
            'low-priority hero': ('fetchpriority="high"', 'fetchpriority="low"'),
            'missing visible disclosure': ('<figcaption>写真はイメージです</figcaption>', '<figcaption>帰り道に</figcaption>'),
            'hidden disclosure': ('<figcaption>写真はイメージです</figcaption>', '<figcaption hidden>写真はイメージです</figcaption>'),
            'wrong fallback sizes': (' sizes="' + SIZES + '"', ' sizes="100vw"'),
        }
        for label, (before, after) in mutations.items():
            with self.subTest(label=label):
                self.reject(base.replace(before, after, 1), label)

    def test_hero_conversion_route_and_measurement_are_preserved(self):
        base = fixture()
        mutations = {
            'other app': ('https://apps.apple.com/jp/app/id6758438948?pt=', 'https://apps.apple.com/jp/app/id123456789?pt='),
            'missing placement and position': ('data-cta-position="hero" data-cta-placement="hero"', ''),
            'missing cluster': (' data-cta-cluster="home"', ''),
            'missing variant': (' data-cta-variant="v1"', ''),
            'wrong affiliate token': ('?pt=128498560', '?pt=123456'),
            'wrong campaign': ('ct=web_other_v1', 'ct=unknown_campaign'),
            'wrong media type': ('mt=8', 'mt=9'),
        }
        for label, (before, after) in mutations.items():
            with self.subTest(label=label):
                self.reject(base.replace(before, after, 1), label)

    def test_native_faq_and_machine_readable_answers_agree(self):
        base = fixture()
        mutations = [
            (base.replace('<details class="faq-details">', '<div class="faq-details">').replace('</details>', '</div>'), 'non-native FAQ'),
            (base.replace('<summary>' + QUESTION + '</summary>', '<summary>違う質問ですか？</summary>'), 'different visible question'),
            (base.replace('<p>' + ANSWER + '</p>', '<p>違う答えです。</p>'), 'different visible answer'),
        ]
        for page, label in mutations:
            with self.subTest(label=label):
                self.reject(page, label)

    def test_decorative_summary_marker_is_not_a_question_difference(self):
        page = fixture().replace('</summary>', '<span aria-hidden="true">＋</span></summary>')
        self.assertEqual(build_home.editorial_contract_errors(page), [])

    def test_non_faq_details_do_not_change_structured_faq(self):
        page = fixture().replace('</main>', '<section><h2>運営情報</h2>'
                                 '<details><summary>測定台帳を見る</summary>'
                                 '<p>iPhone 16e のウォーム起動条件です。</p></details></section></main>')
        self.assertEqual(build_home.editorial_contract_errors(page), [])

    def test_each_required_entity_is_present_and_duplicate_app_is_rejected(self):
        all_nodes = nodes()
        for kind in ('WebSite', 'Organization', 'WebPage', 'SoftwareApplication', 'FAQPage'):
            with self.subTest(kind=kind):
                self.reject(fixture([n for n in all_nodes if n['@type'] != kind]), 'missing ' + kind)
        app = next(n for n in all_nodes if n['@type'] == 'SoftwareApplication')
        self.reject(fixture(all_nodes + [deepcopy(app)]), 'duplicate own app')
        wrong = deepcopy(all_nodes)
        next(n for n in wrong if n['@type'] == 'SoftwareApplication')['@id'] = 'https://simplememofast.com/#another-app'
        self.reject(fixture(wrong), 'different app identity')

    def test_invalid_json_and_stale_video_do_not_pass_the_no_film_profile(self):
        self.reject(fixture().replace('"@type": "WebSite"', '"@type": '), 'invalid JSON-LD')
        self.reject(fixture().replace('</main>', '<video src="/assets/video/capture-home.mp4"></video></main>'), 'lingering video')
        self.reject(fixture(nodes() + [{'@context': 'https://schema.org', '@type': 'VideoObject',
                                       'contentUrl': 'https://simplememofast.com/assets/video/capture-home.mp4'}]),
                    'invisible video schema')


class EditorialImageBuild(unittest.TestCase):
    def test_preload_picture_agree_and_build_is_idempotent(self):
        original = fixture()
        result = build_home.build_editorial_home(original, SRCSET)
        self.assertIsInstance(result, str)
        self.assertEqual(build_home.build_editorial_home(result, SRCSET), result)
        elements = Elements(result)
        preloads = elements.matching('link', rel='preload', **{'as': 'image'})
        sources = elements.matching('source', **{'data-home-perf': 'image'})
        self.assertEqual(len(preloads), 1)
        self.assertEqual(len(sources), 1)
        self.assertEqual(preloads[0]['imagesrcset'], SRCSET)
        self.assertEqual(sources[0]['srcset'], SRCSET)
        self.assertEqual(preloads[0]['imagesizes'], SIZES)
        self.assertEqual(sources[0]['sizes'], SIZES)
        self.assertEqual(preloads[0]['fetchpriority'], 'high')
        self.assertEqual(preloads[0]['type'], 'image/avif')
        self.assertEqual(sources[0]['type'], 'image/avif')
        self.assertEqual(elements.matching('img'), Elements(original).matching('img'))
        self.assertEqual(elements.matching('a'), Elements(original).matching('a'))
        self.assertEqual(build_home.editorial_contract_errors(result), [])

    def test_build_refuses_semantically_broken_editorial_input(self):
        for before, after in [('loading="eager"', 'loading="lazy"'),
                              ('class="hero__photograph"', 'class="unrelated"'),
                              ('<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">',
                               '<meta name="robots" content="noindex">')]:
            with self.subTest(before=before):
                with self.assertRaises(ValueError):
                    build_home.build_editorial_home(fixture().replace(before, after), SRCSET)

    def test_rebuild_replaces_stale_generated_values_once(self):
        built = build_home.build_editorial_home(fixture(), SRCSET)
        new_srcset = SRCSET.replace('0123456789ab', 'abcdef012345')
        rebuilt = build_home.build_editorial_home(built, new_srcset)
        self.assertNotIn('0123456789ab.avif', rebuilt)
        self.assertEqual(len(Elements(rebuilt).matching('source', **{'data-home-perf': 'image'})), 1)
        self.assertEqual(build_home.build_editorial_home(rebuilt, new_srcset), rebuilt)

    def test_existing_preload_or_source_with_wrong_sizes_is_detected(self):
        built = build_home.build_editorial_home(fixture(), SRCSET)
        for before, after in [(f'imagesizes="{SIZES}"', 'imagesizes="100vw"'),
                              (f' sizes="{SIZES}"', ' sizes="1px"')]:
            with self.subTest(before=before[:20]):
                self.assertTrue(build_home.editorial_contract_errors(built.replace(before, after, 1)))

    def test_duplicate_managed_picture_sources_are_detected(self):
        built = build_home.build_editorial_home(fixture(), SRCSET)
        duplicate = f'<source data-home-perf="image" type="image/avif" srcset="{SRCSET}" sizes="{SIZES}">'
        bad = built.replace('<picture class="hero__photograph">', '<picture class="hero__photograph">' + duplicate)
        self.assertTrue(build_home.editorial_contract_errors(bad))


class EditorialFilmBoundary(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.files = {name: (ROOT / name).read_bytes() for name in film_guard.FILES if name != 'index.html'}

    def files_with(self, page):
        return dict(self.files, **{'index.html': page.encode()})

    def test_editorial_without_film_passes_only_with_full_page_contract(self):
        self.assertEqual(film_guard.validate(self.files_with(fixture())), [])
        self.assertTrue(film_guard.validate(self.files_with(fixture().replace('loading="eager"', 'loading="lazy"'))))

    def test_complete_legacy_contract_remains_valid(self):
        legacy_files = self.files_with(fixture())
        legacy_files['index.html'] = film_guard.legacy_fixture(legacy_files)
        self.assertEqual(film_guard.validate(legacy_files), [])

    def test_legacy_page_still_requires_film(self):
        legacy = fixture().replace('class="sm-editorial"', 'class="home-photo"')
        self.assertTrue(film_guard.validate(self.files_with(legacy)))

    def test_retained_film_export_and_measurement_are_still_checked(self):
        valid = self.files_with(fixture())
        mutations = []
        for key in ('assets/video/capture-home.mp4', 'assets/video/capture-home-poster.jpg', 'scripts/build_home_film.py'):
            changed = valid.copy()
            changed[key] += b'changed'
            mutations.append((key, changed))
        ledger = json.loads(valid['data/benchmark.json'])
        ledger['measuredOn']['device'] = 'Different device'
        changed = valid.copy()
        changed['data/benchmark.json'] = json.dumps(ledger).encode()
        mutations.append(('benchmark device', changed))
        meta = json.loads(valid['assets/video/capture-home.json'])
        meta['bytes'] += 1
        changed = valid.copy()
        changed['assets/video/capture-home.json'] = json.dumps(meta).encode()
        mutations.append(('export length', changed))
        for label, changed in mutations:
            with self.subTest(label=label):
                self.assertTrue(film_guard.validate(changed), label + ' drift was ignored')


if __name__ == '__main__':
    unittest.main()
