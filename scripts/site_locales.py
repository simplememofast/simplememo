"""Shared language navigation; only existing translations are page alternates."""
from html import escape
from pathlib import Path
from functools import lru_cache
from i18n_config import TOP_CLUSTER, JA_EN_PAIRS

ROOT = Path(__file__).resolve().parent.parent
NAMES = {
    "ja": ("JA", "日本語"), "en": ("EN", "English"),
    "zh-Hans": ("简中", "简体中文"), "zh-Hant": ("繁中", "繁體中文"),
    "ko": ("KO", "한국어"), "es": ("ES", "Español"),
    "pt-BR": ("PT", "Português"), "id": ("ID", "Bahasa Indonesia"),
    "ar": ("AR", "العربية"), "tr": ("TR", "Türkçe"),
}
LABELS = {
    "ja": ("言語を選択", "このページ", "他の言語のトップページ"),
    "en": ("Choose a language", "This page", "Other languages · homepages"),
    "zh-Hans": ("选择语言", "本页", "其他语言的首页"),
    "zh-Hant": ("選擇語言", "本頁", "其他語言的首頁"),
    "ko": ("언어 선택", "이 페이지", "다른 언어의 홈페이지"),
    "es": ("Elegir idioma", "Esta página", "Inicio en otros idiomas"),
    "pt-BR": ("Escolher idioma", "Esta página", "Início em outros idiomas"),
    "id": ("Pilih bahasa", "Halaman ini", "Beranda dalam bahasa lain"),
    "ar": ("اختر اللغة", "هذه الصفحة", "الصفحات الرئيسية بلغات أخرى"),
    "tr": ("Dil seçin", "Bu sayfa", "Diğer dillerde ana sayfalar"),
}
CHROME = {
    "ja": ("Obsidian連携", "思いついたことを、次の一歩へ。", "Obsidianとメールに、メモを送るiPhoneアプリ。", "ダウンロード"),
    "en": ("for Obsidian", "A small note. A next step.", "Send notes from your iPhone to Obsidian and email.", "Download"),
    "zh-Hans": ("Obsidian 集成", "记下一点想法，迈出下一步。", "从 iPhone 向 Obsidian 和电子邮件发送笔记。", "下载"),
    "zh-Hant": ("Obsidian 整合", "記下一點想法，邁出下一步。", "從 iPhone 將筆記傳送至 Obsidian 和電子郵件。", "下載"),
    "ko": ("Obsidian 연동", "작은 메모, 다음 한 걸음.", "iPhone에서 Obsidian과 이메일로 메모를 보내세요.", "다운로드"),
    "es": ("para Obsidian", "Una pequeña nota. Un paso más.", "Envía notas desde tu iPhone a Obsidian y por correo electrónico.", "Descargar"),
    "pt-BR": ("para Obsidian", "Uma pequena nota. Um próximo passo.", "Envie notas do seu iPhone para o Obsidian e por e-mail.", "Baixar"),
    "id": ("untuk Obsidian", "Catatan kecil. Langkah berikutnya.", "Kirim catatan dari iPhone ke Obsidian dan email.", "Unduh"),
    "ar": ("مع Obsidian", "ملاحظة صغيرة. خطوة تالية.", "أرسل الملاحظات من iPhone إلى Obsidian والبريد الإلكتروني.", "تنزيل"),
    "tr": ("Obsidian için", "Küçük bir not. Bir sonraki adım.", "iPhone'unuzdan Obsidian'a ve e-postaya not gönderin.", "İndir"),
}

@lru_cache(maxsize=None)
def file_for(url):
    rel = url.lstrip("/")
    candidates = [rel + "index.html"] if url.endswith("/") else [rel + ".html", rel + "/index.html"]
    return next((f for f in candidates if (ROOT / f).is_file()), None)

def page_url(rel):
    return "/" + (rel[:-10] if rel.endswith("index.html") else rel[:-5])

def translations(rel, locale):
    for loc, url in TOP_CLUSTER:
        if file_for(url) == rel:
            return dict(TOP_CLUSTER)
    for ja, en in JA_EN_PAIRS:
        jf, ef = file_for(ja), file_for(en)
        if jf and ef and rel in (jf, ef):
            return {"ja": ja, "en": en}
    return {locale: page_url(rel)}

def language_menu(rel, locale):
    title, same, other = LABELS[locale]
    code, name = NAMES[locale]
    available = translations(rel, locale)
    globe = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>'
    def link(loc, url, is_page):
        current = ' aria-current="page"' if loc == locale and is_page else ''
        direction = 'rtl' if loc == 'ar' else 'ltr'
        content = f'<span lang="{loc}" dir="{direction}">{NAMES[loc][1]}</span><span class="site-language-check" aria-hidden="true">{"✓" if current else ""}</span>'
        if current:
            # Reloading the current utility route can lose a verification code
            # or an unsaved note. Current language is status, not navigation.
            return f'<span class="site-language-current" data-site-locale="{loc}"{current}>{content}</span>'
        return f'<a href="{escape(url, quote=True)}" hreflang="{loc}" data-site-locale="{loc}">{content}</a>'
    pages = ''.join(link(loc, available[loc], True) for loc, _ in TOP_CLUSTER if loc in available)
    homes = ''.join(link(loc, url, False) for loc, url in TOP_CLUSTER if loc not in available)
    groups = f'<p class="site-language-group">{same}</p><div class="site-language-grid">{pages}</div>' if homes else f'<div class="site-language-grid">{pages}</div>'
    if homes:
        groups += f'<p class="site-language-group site-language-group--homes">{other}</p><div class="site-language-grid">{homes}</div>'
    return f'<details class="site-languages"><summary aria-label="{name} · {title}">{globe}<span>{code}</span><svg class="site-language-chevron" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6 4 4 4-4"/></svg></summary><div class="site-language-panel" lang="{locale}" dir="{"rtl" if locale == "ar" else "ltr"}"><p class="site-language-title">{title}</p>{groups}</div></details>'
