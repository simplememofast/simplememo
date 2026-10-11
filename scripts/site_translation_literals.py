"""Protect quantities, plan limits and the names of downloadable examples."""
from decimal import Decimal
from pathlib import PurePosixPath
import re
import json
from urllib.parse import unquote, urlsplit
from zipfile import ZipFile


NUMBER = r'\d[\d,]*(?:\.\d+)?'
QUANTITY = rf'(?:{NUMBER}[兆億万])+(?:{NUMBER})?'
DAILY_LIMIT = r'1\s*日(?:あたり|につき)?\s*3\s*通(?:まで)?'
LIMITS = {
    'ja': ('1日3通', '1日3通まで'),
    'en': ('3 messages per day', 'up to 3 messages per day'),
    'zh-Hans': ('每天3条', '每天最多3条'),
    'zh-Hant': ('每天3則', '每天最多3則'),
    'ko': ('하루 3건', '하루 최대 3건'),
    'es': ('3 mensajes al día', 'hasta 3 mensajes al día'),
    'pt-BR': ('3 mensagens por dia', 'até 3 mensagens por dia'),
    'id': ('3 pesan per hari', 'maksimal 3 pesan per hari'),
    'ar': ('3 رسائل يوميًا', 'ما يصل إلى 3 رسائل يوميًا'),
    'tr': ('günde 3 mesaj', 'günde en fazla 3 mesaj'),
}


def quantity_value(raw):
    if not re.fullmatch(QUANTITY, raw):
        return raw
    factors = {'兆': 10**12, '億': 10**8, '万': 10**4, '': 1}
    total = sum(Decimal(number.replace(',', '')) * factors[scale]
                for number, scale in re.findall(rf'({NUMBER})([兆億万]?)', raw))
    return format(total, 'f').rstrip('0').rstrip('.') if '.' in format(total, 'f') else str(total)


def localized_literal(raw):
    if re.fullmatch(DAILY_LIMIT, raw):
        index = int(raw.endswith('まで'))
        return {locale: values[index] for locale, values in LIMITS.items()}
    folder = re.fullmatch(r'(.+?)(?:フォルダー?|ディレクトリ)', raw)
    if folder:
        name = folder[1]
        return {'ja': raw, 'en': name + ' folder', 'zh-Hans': name + ' 文件夹',
                'zh-Hant': name + ' 資料夾', 'ko': name + ' 폴더',
                'es': 'carpeta ' + name, 'pt-BR': 'pasta ' + name,
                'id': 'folder ' + name, 'ar': 'مجلد ' + name, 'tr': name + ' klasörü'}
    return None


def literal_filenames(source, file, root):
    # Only preserve names evidenced by code, download attributes or a linked
    # local archive. Inferring filenames from prose can swallow whole sentences.
    from site_translation_units import Parser, all_nodes
    from html import unescape
    # These are literal filename/time formats and the app's URI scheme, even
    # when older prose did not wrap them in a code element.
    formats = ('yyyy-MM-dd.md', 'YYYY-MM-DD.md', 'yyyy-MM-dd', 'YYYY-MM-DD',
               'HH:mm', 'Inbox.md', 'obsidian://', '.obsidian', '.md')
    names = {value for value in formats if value in source}
    # Observation case IDs are references to evidence, not translatable prose.
    # Keep complete IDs (including compact runs such as S:D1/D2/D3) together.
    names.update(re.findall(r'(?<![A-Za-z0-9])[A-Z]:[A-Z]\d+(?:[/〜～–-][A-Z]\d+)*', source))

    def add(value):
        value = value.strip().removeprefix('./')
        if not value or len(value) > 240 or '\n' in value or '\r' in value:
            return
        if not re.search(r'\.(?:md|txt|json|csv|canvas|zip|pdf|png|webp)$', value, re.I):
            return
        names.add(value)
        path = PurePosixPath(value)
        names.add(path.name)
        for parent in path.parents:
            if str(parent) not in ('.', '/'):
                names.add(str(parent) + '/')

    for node in all_nodes(Parser(source).root):
        if node.attrs.get('download'):
            add(node.attrs['download'])
        if node.tag in ('code', 'kbd', 'samp') and not any(not c.tag.startswith('#') for c in node.children):
            add(unescape(source[node.inner:node.end]))
        href = node.attrs.get('href', '')
        url = urlsplit(href)
        # Published observation records identify actual files. Keep those names
        # even where an older article printed them as ordinary prose.
        if not url.netloc and url.path.startswith('/assets/evidence/') and url.path.endswith('.json'):
            evidence = (root / unquote(url.path.lstrip('/'))).resolve()
            if evidence.is_relative_to(root.resolve()) and evidence.is_file():
                record = json.loads(evidence.read_text())
                for field in ('before_files', 'after_files'):
                    for name in record.get(field, {}):
                        add(name)
        if url.netloc or not url.path.endswith('.zip'):
            continue
        candidate = (root / unquote(url.path.lstrip('/')) if url.path.startswith('/')
                     else root / PurePosixPath(file).parent / unquote(url.path)).resolve()
        if not candidate.is_relative_to(root.resolve()) or not candidate.is_file():
            continue
        with ZipFile(candidate) as archive:
            for name in archive.namelist():
                add(name)
    folders = {PurePosixPath(name).name for name in names if name.endswith('/')}
    names.update(name + suffix for name in folders for suffix in ('フォルダ','フォルダー','ディレクトリ'))
    return tuple(sorted(names))
