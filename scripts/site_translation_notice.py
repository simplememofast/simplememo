"""Tell readers of a generated page that it is a machine translation.

Generated pages are machine translations of one editorial original. Saying so
next to the title, with a link to the original, keeps the page honest about
how it was made and gives readers the authoritative wording. Editorial pages
(the registry's `existing` routes) never receive the note.
"""
from html import escape
from localization_registry import page_url
from site_translation_units import Parser, all_nodes

# {source language} → sentence and link label in the page's own language.
NOTES = {
    'ja': {'en': ('このページは英語の原文を機械翻訳したものです。', '英語の原文を読む')},
    'en': {'ja': ('This page was machine-translated from Japanese.', 'Read the Japanese original')},
    'zh-Hans': {'ja': ('本页面由日语原文机器翻译而成。', '阅读日语原文'),
                'en': ('本页面由英语原文机器翻译而成。', '阅读英语原文')},
    'zh-Hant': {'ja': ('本頁面由日文原文機器翻譯而成。', '閱讀日文原文'),
                'en': ('本頁面由英文原文機器翻譯而成。', '閱讀英文原文')},
    'ko': {'ja': ('이 페이지는 일본어 원문을 기계 번역한 것입니다.', '일본어 원문 보기'),
           'en': ('이 페이지는 영어 원문을 기계 번역한 것입니다.', '영어 원문 보기')},
    'es': {'ja': ('Esta página es una traducción automática del original en japonés.', 'Leer el original en japonés'),
           'en': ('Esta página es una traducción automática del original en inglés.', 'Leer el original en inglés')},
    'pt-BR': {'ja': ('Esta página é uma tradução automática do original em japonês.', 'Ler o original em japonês'),
              'en': ('Esta página é uma tradução automática do original em inglês.', 'Ler o original em inglês')},
    'id': {'ja': ('Halaman ini diterjemahkan secara otomatis dari bahasa Jepang.', 'Baca versi asli berbahasa Jepang'),
           'en': ('Halaman ini diterjemahkan secara otomatis dari bahasa Inggris.', 'Baca versi asli berbahasa Inggris')},
    'ar': {'ja': ('هذه الصفحة مترجمة آليًا من الأصل الياباني.', 'اقرأ الأصل الياباني'),
           'en': ('هذه الصفحة مترجمة آليًا من الأصل الإنجليزي.', 'اقرأ الأصل الإنجليزي')},
    'tr': {'ja': ('Bu sayfa Japonca aslından makine çevirisiyle hazırlanmıştır.', 'Japonca aslını okuyun'),
           'en': ('Bu sayfa İngilizce aslından makine çevirisiyle hazırlanmıştır.', 'İngilizce aslını okuyun')},
}
MARKER = 'data-machine-translation-note'
STYLE = 'font-size:.85rem;opacity:.8;margin:.25rem 0 1rem'


def note_html(group, locale):
    sentence, label = NOTES[locale][group['sourceLocale']]
    href = page_url(group['source'])
    return (f'\n<p class="machine-translation-note" {MARKER}="" style="{STYLE}">' + escape(sentence) +
            f' <a href="{escape(href, quote=True)}" hreflang="{group["sourceLocale"]}">' + escape(label) + '</a></p>\n')


def add_machine_translation_note(source, group, locale):
    """Insert the note after the page's first main heading (or main start)."""
    if locale in group.get('existing', {}) or MARKER in source:
        return source
    nodes = list(all_nodes(Parser(source).root))
    heading = next((node for node in nodes if node.tag == 'h1'), None)
    if heading is not None:
        return source[:heading.stop] + note_html(group, locale) + source[heading.stop:]
    main = next((node for node in nodes if node.tag == 'main'), None)
    if main is not None:
        return source[:main.inner] + note_html(group, locale) + source[main.inner:]
    return source
