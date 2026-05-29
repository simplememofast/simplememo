#!/usr/bin/env python3
"""
Extract a clean single-language EN page from a JA dual-DOM page.

The JA content pages embed both languages in one <html lang="ja"> document,
toggled by data-lang + lang.js. This produces the EN counterpart as a clean
<html lang="en"> page (matching the hand-built /en/ pages):

  - decompose every [data-lang="ja"] node; keep [data-lang="en"] but strip the
    now-redundant data-lang attribute (so content is always visible w/o JS)
  - swap <title>/description/og/twitter to the EN .meta-template values
  - rewrite JSON-LD: headline -> EN, url/@id/mainEntityOfPage -> /en/ URL,
    inLanguage -> en
  - drop the .meta-templates block and the /js/lang.js include (no toggling)
  - localize internal links to their /en/ equivalent where one exists on disk
  - DO NOT write canonical/hreflang/content-language — those are owned by
    scripts/normalize_i18n_head.py (register the pair in i18n_config.py and run
    the normalizer afterwards).

Usage:
    python3 scripts/extract_en_page.py blog/best-memo-apps-2026.html en/blog/best-memo-apps-2026.html
"""
from __future__ import annotations
import sys, re
from pathlib import Path
from bs4 import BeautifulSoup

REPO = Path(__file__).resolve().parent.parent
SITE = "https://simplememofast.com"
EN_BRAND = "Simple Memo - Captio-style"

# JA-only blocks (no data-lang wrapper) that leak into the extracted EN page.
# These are SHARED across the blog cluster, so translating once covers all pages.
# Keep entries here exact; applied as plain-text replacements on the final HTML.
SHARED_JA_EN = {
    "Simple Memo - Captio-style開発者。iOS開発歴10年以上。Captio終了をきっかけに"
    "「起動0.3秒・メモ→メール特化」のCaptio式シンプルメモを開発。"
    "プライバシーファースト設計（AES-GCM暗号化・ゼロサーバー保存）を信条とする。":
        "Developer of Simple Memo (Captio-style). 10+ years of iOS development. "
        "After Captio shut down, built Simple Memo — focused on a 0.3-second launch "
        "and memo-to-email — and stands by privacy-first design (AES-GCM encryption, "
        "zero server-side storage).",
    "プロフィール": "Profile",
    "メインナビゲーション": "Main navigation",
    "メニュー": "Menu",
    "ホーム": "Home",
    "ブログ": "Blog",
}


def en_url_for(root_path: str) -> str | None:
    """If an /en/ file exists on disk for this root path, return its URL path."""
    rp = root_path
    if not rp.startswith("/"):
        return None
    # "/blog/foo" -> en/blog/foo.html ; "/foo/" -> en/foo/index.html ; "/" -> en/index.html
    if rp == "/":
        cand = REPO / "en/index.html"; return "/en/" if cand.exists() else None
    rel = rp.strip("/")
    for cand, url in [
        (REPO / "en" / (rel + ".html"), "/en/" + rel),
        (REPO / "en" / rel / "index.html", "/en/" + rel + "/"),
    ]:
        if cand.exists():
            return url
    return None


def main(ja_rel: str, en_rel: str) -> None:
    ja_path = REPO / ja_rel
    en_path = REPO / en_rel
    en_url = "/" + en_rel[:-len("/index.html")] + "/" if en_rel.endswith("/index.html") else "/" + en_rel
    if en_rel.startswith("en/") and en_rel.endswith(".html") and not en_rel.endswith("index.html"):
        en_url = "/" + en_rel[:-len(".html")]
    abs_en = SITE + en_url

    soup = BeautifulSoup(ja_path.read_text(encoding="utf-8"), "html.parser")

    # --- pull EN meta-template values BEFORE removing the block ---
    en_tmpl = soup.select_one('.meta-template[data-lang="en"]')
    def tmpl(cls, default=""):
        el = en_tmpl.select_one(f".{cls}") if en_tmpl else None
        return el.get_text() if el else default
    en_title = tmpl("meta-title")
    en_ogtitle = tmpl("meta-og-title", en_title)
    en_desc = tmpl("meta-description")

    # --- <html lang> ---
    soup.html["lang"] = "en"

    # --- head meta swap ---
    if soup.title and en_title:
        soup.title.string = en_title
    def set_meta(attr, key, value):
        el = soup.find("meta", attrs={attr: key})
        if el and value:
            el["content"] = value
    set_meta("name", "description", en_desc)
    set_meta("property", "og:title", en_ogtitle)
    set_meta("property", "og:description", en_desc)
    set_meta("name", "twitter:title", en_ogtitle)
    set_meta("name", "twitter:description", en_desc)
    set_meta("property", "og:url", abs_en)
    set_meta("property", "og:locale", "en_US")
    set_meta("property", "og:site_name", EN_BRAND)
    # drop og:locale:alternate (single-language page)
    for el in soup.find_all("meta", attrs={"property": "og:locale:alternate"}):
        el.decompose()

    # --- canonical / hreflang / content-language: remove (normalizer owns them) ---
    for el in soup.find_all("link", attrs={"rel": ["canonical"]}):
        el.decompose()
    for el in soup.find_all("link", attrs={"rel": ["alternate"]}):
        if el.get("hreflang"):
            el.decompose()
    for el in soup.find_all("meta", attrs={"http-equiv": "content-language"}):
        el.decompose()

    # --- JSON-LD: localize to EN (headline/name/description/publisher/breadcrumb/FAQ) ---
    import json
    ja_abs = SITE + "/" + re.sub(r"\.html$", "", ja_rel).replace("/index", "")
    JA_TITLE_RE = re.compile(r"[ぁ-んァ-ヶ一-龯]")  # any Japanese char

    def localize(obj):
        if isinstance(obj, dict):
            t = obj.get("@type")
            # FAQPage: keep only EN questions (drop ones whose name has Japanese)
            if t == "FAQPage" and isinstance(obj.get("mainEntity"), list):
                obj["mainEntity"] = [q for q in obj["mainEntity"]
                                     if not JA_TITLE_RE.search(str(q.get("name", "")))]
            for k, v in list(obj.items()):
                if k == "inLanguage":
                    obj[k] = "en"
                elif k in ("headline",) and isinstance(v, str):
                    obj[k] = en_title
                elif k == "description" and isinstance(v, str) and JA_TITLE_RE.search(v):
                    obj[k] = en_desc
                elif k == "name" and isinstance(v, str):
                    # Order matters: brand, then known shared strings (Home/Blog
                    # breadcrumb crumbs), then any remaining JA title-name on the
                    # page/article/last-breadcrumb -> the EN page title.
                    if v in ("Captio式シンプルメモ",):
                        obj[k] = EN_BRAND
                    elif v in SHARED_JA_EN:
                        obj[k] = SHARED_JA_EN[v]
                    elif obj.get("@type") in ("WebPage", "WebSite", "Article", "BlogPosting", "ListItem") and JA_TITLE_RE.search(v):
                        obj[k] = en_title
                elif isinstance(v, str) and ja_abs in v:
                    obj[k] = v.replace(ja_abs, abs_en)
                else:
                    localize(v)
            # breadcrumb item URLs: /blog/ -> /en/blog/
            if obj.get("@type") == "ListItem" and isinstance(obj.get("item"), str):
                obj["item"] = obj["item"].replace(SITE + "/blog/", SITE + "/en/blog/")
        elif isinstance(obj, list):
            for x in obj:
                localize(x)

    for sc in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = sc.string or ""
        if not raw.strip():
            continue
        try:
            data = json.loads(raw)
            localize(data)
            sc.string = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        except Exception:
            # fallback: minimal regex localization
            sc.string = raw.replace('"inLanguage":"ja"', '"inLanguage":"en"').replace(ja_abs, abs_en)

    # --- remove meta-templates block + lang.js include ---
    for el in soup.select(".meta-templates"):
        el.decompose()
    for sc in soup.find_all("script", src=True):
        if "lang.js" in sc["src"]:
            sc.decompose()
    # remove language-toggle buttons (no JS to drive them)
    for el in soup.find_all(attrs={"data-lang-btn": True}):
        el.decompose()

    # --- body: keep EN, drop JA ---
    for el in soup.find_all(attrs={"data-lang": "ja"}):
        el.decompose()
    for el in soup.find_all(attrs={"data-lang": "en"}):
        del el["data-lang"]

    # --- localize internal links to /en/ where an EN file exists ---
    localized = 0
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("/") and not href.startswith("/en/") and not href.startswith("/assets"):
            base = href.split("#")[0].split("?")[0]
            tgt = en_url_for(base)
            if tgt:
                a["href"] = tgt + href[len(base):]
                localized += 1

    html_out = str(soup)
    # --- residual JA-only shared strings (bio, headings, aria-labels) ---
    for ja, en in SHARED_JA_EN.items():
        html_out = html_out.replace(ja, en)

    en_path.parent.mkdir(parents=True, exist_ok=True)
    en_path.write_text(html_out, encoding="utf-8")
    print(f"wrote {en_rel}")
    print(f"  title: {en_title}")
    print(f"  internal links localized to /en/: {localized}")


def _json_str(s: str) -> str:
    import json
    return json.dumps(s, ensure_ascii=False)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__); sys.exit(1)
    main(sys.argv[1], sys.argv[2])
