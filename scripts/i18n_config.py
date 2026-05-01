"""
i18n configuration for simplememofast.com.

Single source of truth for hreflang/canonical/lang normalization across
the static HTML site. Used by scripts/normalize_i18n_head.py.

Reality of this site: 10 active locales (ja root + 9 prefixed).
Spec assumed only 2 (ja/en). See PR description for adaptation.
"""

SITE_URL = "https://simplememofast.com"

# All active locales on the site, with the URL path of each locale's homepage.
# Order here is the order alternate links are emitted in the <head>.
TOP_CLUSTER = [
    ("ja",      "/"),
    ("en",      "/en/"),
    ("zh-Hans", "/zh/"),
    ("zh-Hant", "/zh-Hant/"),
    ("ko",      "/ko/"),
    ("es",      "/es/"),
    ("pt-BR",   "/pt-BR/"),
    ("id",      "/id/"),
    ("ar",      "/ar/"),
    ("tr",      "/tr/"),
]
TOP_CLUSTER_XDEFAULT = "/"  # x-default points to ja root

# JA<->EN page pairs other than the homepage cluster.
# (ja_url_path, en_url_path)
# Each entry MUST have both files present on disk for hreflang to be emitted.
JA_EN_PAIRS = [
    ("/captio-alternative/",                "/en/captio-alternative/"),
    ("/note-to-email/",                     "/en/note-to-email/"),
    ("/privacy",                            "/en/privacy"),
    ("/terms",                              "/en/terms"),
    ("/blog/ios-quick-capture-comparison",  "/en/blog/ios-quick-capture-comparison"),
]
# x-default for ja-en pairs points to the JA url (current site convention).
JA_EN_XDEFAULT = "ja"  # "ja" or "en"

# Pages that exist only in EN (no ja pair). They get self-canonical + lang=en
# + content-language=en, but NO hreflang alternate (no symmetric pair exists).
EN_ONLY_PAGES = [
    "/en/iphone-shortcuts-email-guide/",
    "/en/send-email-to-yourself/",
    "/en/captio-migration-guide/",
    "/en/blog/",
    "/en/blog/captio-shutdown-alternatives",
    "/en/blog/fastest-note-app-iphone-2026",
    "/en/blog/how-to-email-yourself-note-iphone",
    "/en/blog/inbox-zero-workflow-tips-2026",
    "/en/blog/offline-first-comparison",
    "/en/blog/revenue-report-2025",
    "/en/blog/why-captio-died",
]

# JA-only top-level pages that previously had partial/orphan hreflang to be
# cleaned up (i.e., self-only or to-self x-default with no actual pair).
# /captio/ currently emits hreflang=ja+x-default both pointing to itself.
JA_ONLY_CLEANUP = [
    "/captio/",
]

# Locale -> <html lang="..."> attribute value
LOCALE_LANG = {
    "ja":      "ja",
    "en":      "en",
    "zh-Hans": "zh-Hans",
    "zh-Hant": "zh-Hant",
    "ko":      "ko",
    "es":      "es",
    "pt-BR":   "pt-BR",
    "id":      "id",
    "ar":      "ar",
    "tr":      "tr",
}

# Locale -> <meta http-equiv="content-language" content="..."> value
# Bing reads this. Use BCP 47-ish short codes.
LOCALE_CONTENT_LANG = {
    "ja":      "ja",
    "en":      "en",
    "zh-Hans": "zh",
    "zh-Hant": "zh-Hant",
    "ko":      "ko",
    "es":      "es",
    "pt-BR":   "pt-BR",
    "id":      "id",
    "ar":      "ar",
    "tr":      "tr",
}

# Locales that are RTL (need dir="rtl" on <html>)
RTL_LOCALES = {"ar"}


def absolute_url(path: str) -> str:
    return f"{SITE_URL}{path}"
