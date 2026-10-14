"""Write Japanese calendar dates in each target language's own date format.

The translation engine sees dates only as protected numbers around 年/月/日,
so it rendered them word for word ("2026 año 3 mes 5 día", "2026 year 8
month"). The numbers themselves are known from the source unit, which lets
the builder replace exactly those dates without guessing at other numbers:
durations (3か月), counts and versions are never rewritten.

Chinese and Korean keep their native 年/月/日 forms and are not touched.
"""
import re

MARK = r'(?:</?sm\d+>)*(ZXQ\d{4})(?:</?sm\d+>)*'
DAY_AFTER = r'(?!\s*(?:</?sm\d+>)*ZXQ\d{4}(?:</?sm\d+>)*\s*日)'
# Longest pattern first, so a full date is never split into two partial ones.
# A bare month (8月) is a calendar month; durations are written 8か月/ヶ月.
SOURCE_DATES = (
    ('ymd', re.compile(MARK + r'\s*年\s*' + MARK + r'\s*月\s*' + MARK + r'\s*日')),
    ('ym', re.compile(MARK + r'\s*年\s*' + MARK + r'\s*月' + DAY_AFTER)),
    ('md', re.compile(r'(?<!年)(?<!年\s)' + MARK + r'\s*月\s*' + MARK + r'\s*日')),
    ('m', re.compile(r'(?<!年)(?<!年\s)' + MARK + r'\s*月' + DAY_AFTER)),
)

MONTHS = {
    'en': ['January', 'February', 'March', 'April', 'May', 'June', 'July',
           'August', 'September', 'October', 'November', 'December'],
    'es': ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
           'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    'pt-BR': ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
              'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
    'id': ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
           'Agustus', 'September', 'Oktober', 'November', 'Desember'],
    'tr': ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz',
           'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
    'ar': ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو',
           'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
}

# Literal unit words the engine produced (singular, plural, capitalised,
# Arabic definite forms, Turkish possessive/genitive forms).
WORDS = {
    'en': (r'(?:[Yy]ears?|YEARS?)', r'(?:[Mm]onths?|MONTHS?)', r'(?:[Dd]ays?|DAYS?)'),
    'es': (r'(?:[Aa]ños?)', r'(?:[Mm]es(?:es)?)', r'(?:[Dd]ías?)'),
    'pt-BR': (r'(?:[Aa]nos?)', r'(?:[Mm][eê]s(?:es)?)', r'(?:[Dd]ias?)'),
    'id': (r'(?:[Tt]ahun)', r'(?:[Bb]ulan)', r'(?:[Hh]ari|[Tt]anggal)'),
    'tr': (r'(?:[Yy]ılı(?:nın)?|[Yy]ıl)', r'(?:[Aa]yı|[Aa]y)', r'(?:[Gg]ünü|[Gg]ün|tarihi)'),
    'ar': (r'(?:السنة|العام|سنة|عام)', r'(?:الشهر|أشهر|شهور|شهر)', r'(?:اليوم|أيام|يوم)'),
}
# Arabic letters only: the Arabic comma (،) and digits end a date like any punctuation.
LETTER = r'A-Za-zÀ-ÿçğıöşüİ\u0621-\u064A\u0671-\u06D3'
# Turkish attaches case endings to the month noun ("9 ayında"). Those keep
# the noun phrase: "2026 yılı Eylül ayında".
TR_MONTH_SUFFIX = r'(ının|ını|ına|ında|ından|ındaki|ı)'

SEP = r'[ \t ]*[,،]?[ \t ]*'


def source_dates(unit):
    """Calendar dates in a Japanese source unit as (year, month, day) values."""
    text = unit.get('text', '')
    if '月' not in text:
        return []
    tokens = unit.get('tokens', {})
    def number(marker):
        value = str(tokens.get(marker, {}).get('value', ''))
        return int(value) if re.fullmatch(r'\d{1,4}', value) else None
    dates, taken = [], []
    for shape, pattern in SOURCE_DATES:
        for match in pattern.finditer(text):
            if any(start < match.end() and match.start() < end for start, end in taken):
                continue
            values = [number(marker) for marker in match.groups()]
            if None in values:
                continue
            year, month, day = {'ymd': lambda: values, 'ym': lambda: values + [None],
                                'md': lambda: [None] + values, 'm': lambda: [None, values[0], None]}[shape]()
            if year is not None and not 1990 <= year <= 2100:
                continue
            if not 1 <= month <= 12 or (day is not None and not 1 <= day <= 31):
                continue
            taken.append((match.start(), match.end()))
            dates.append((year, month, day))
    return dates


def _format(locale, year, month, day):
    name = MONTHS[locale][month - 1]
    if locale == 'en':
        if year and day:
            return f'{name} {day}, {year}'
        return f'{name} {year}' if year else (f'{name} {day}' if day else name)
    if locale in ('es', 'pt-BR'):
        if year and day:
            return f'{day} de {name} de {year}'
        return f'{name} de {year}' if year else (f'{day} de {name}' if day else name)
    if year and day:
        return f'{day} {name} {year}'
    return f'{name} {year}' if year else (f'{day} {name}' if day else name)


def _sentence_case(match, value):
    # Spanish and Portuguese month names are lowercase except at the start
    # of a sentence ("Septiembre de 2026, …").
    before = match.string[:match.start()]
    if value[:1].islower() and re.search(r'(?:^|[.!?]\s+)$', before):
        value = value[:1].upper() + value[1:]
    # "UTC2026 9 month 30" was glued to a label; keep the label separate.
    return (' ' + value) if before[-1:].isalpha() else value


def localize_dates(text, dates, locale):
    """Replace word-for-word renderings of the source dates in rendered text.

    Full dates are replaced before year-month, month-day and month forms, so
    a shorter form of one date can never consume the start of a longer one.
    """
    if locale not in MONTHS or not dates:
        return text
    wy, wm, wd = WORDS[locale]
    end = r'(?![' + LETTER + r'0-9])'
    rules = []
    for year, month, day in dates:
        # The engine sometimes glues the numbers ("20263 mes 16"), so the year
        # has no right boundary of its own; the month and day keep theirs.
        y = r'(?<![0-9])0*' + str(year) if year else None
        m = r'0*' + str(month) + r'(?![0-9])'
        lead_m = r'(?<![0-9.])' + m
        # An English ordinal sometimes trails the day ("2026 año 8 mes 20th").
        d = r'0*' + str(day) + r'(?![0-9])(?:st|nd|rd|th)?' if day else None
        ym = (y + r'(?:' + SEP + wy + r')?' + SEP + m) if year else None
        if year and day:
            full = _format(locale, year, month, day)
            rules.append((0, re.compile(ym + SEP + wm + SEP + d + r'(?:' + SEP + wd + r')?' + end), full))
            if locale == 'ar':
                # "2026 سنة 10 شهر تحديث 1": a word such as "updated" lands between month and day.
                rules.append((0, re.compile(ym + SEP + wm + SEP + r'([\u0621-\u064A]+)' + SEP + r'(?:' + wd + SEP + r')?' + d + end),
                              lambda match, full=full: match[1] + ' ' + full))
            if locale == 'id':
                # "tanggal 13 bulan 7 tahun 2026": the noun precedes each number.
                rules.append((0, re.compile(r'(?<=[Tt]anggal )' + r'(?<![0-9])' + d + SEP + wm + SEP + m + SEP + wy + SEP + r'0*' + str(year) + r'(?![0-9])'), full))
        elif year:
            if locale == 'tr':
                rules.append((1, re.compile(y + SEP + r'([Yy]ıl(?:ı|ının)?)' + SEP + m + SEP + r'[Aa]y' + TR_MONTH_SUFFIX + r'(?![a-zçğıöşü])'),
                              lambda match, year=year, month=month: f'{year} {"yılı" if match[1].lower() == "yıl" else match[1]} {MONTHS["tr"][month - 1]} ay{match[2]}'))
            rules.append((2, re.compile(ym + SEP + wm + end), _format(locale, year, month, None)))
        elif day:
            rules.append((3, re.compile(lead_m + SEP + wm + SEP + d + r'(?:' + SEP + wd + r')?' + end), _format(locale, None, month, day)))
        else:
            if locale == 'tr':
                rules.append((4, re.compile(lead_m + SEP + r'[Aa]y' + TR_MONTH_SUFFIX + r'(?![a-zçğıöşü])'),
                              lambda match, month=month: f'{MONTHS["tr"][month - 1]} ay{match[1]}'))
            rules.append((4, re.compile(lead_m + SEP + wm + end), _format(locale, None, month, None)))
    for _, pattern, value in sorted(rules, key=lambda rule: rule[0]):
        if callable(value):
            text = pattern.sub(value, text)
        else:
            text = pattern.sub(lambda match, value=value: _sentence_case(match, value), text)
    return text


# Word-for-word dates that survived localization. Used by the build to fail
# instead of publishing them again.
LEFTOVER = {
    'en': re.compile(r'(?<![0-9])(?:19|20)\d\d\s*(?:years?|YEARS?)?\s*\d{1,2}\s+(?:[Mm]onths?)\b'),
    'es': re.compile(r'(?<![0-9])(?:19|20)\d\d\s*(?:[Aa]ños?)?\s*\d{1,2}\s+[Mm]es(?:es)?\b'),
    'pt-BR': re.compile(r'(?<![0-9])(?:19|20)\d\d\s*(?:[Aa]nos?)?\s*\d{1,2}\s+[Mm][eê]s(?:es)?\b'),
    'id': re.compile(r'(?<![0-9])(?:19|20)\d\d\s*(?:[Tt]ahun)?\s*\d{1,2}\s+[Bb]ulan\b'),
    'tr': re.compile(r'(?<![0-9])(?:19|20)\d\d\s*(?:[Yy]ıl[a-zçğıöşü]*)?\s*\d{1,2}\s+[Aa]y(?:ı|ının|ını|ına|ında|ından|ındaki)?\b'),
    'ar': re.compile(r'(?<![0-9])(?:19|20)\d\d\s*[،,]?\s*(?:سنة|عام|السنة|العام)?\s*\d{1,2}\s+(?:شهر|أشهر|الشهر|شهور)'),
}


def leftover_dates(text, locale):
    pattern = LEFTOVER.get(locale)
    return [match[0] for match in pattern.finditer(text)] if pattern else []
