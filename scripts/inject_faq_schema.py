"""
Extract FAQ entries from a page's <details class="faq-details"> blocks and
emit a FAQPage JSON-LD <script> in the page <head>.

Pages carrying both languages in one document (data-lang toggled) contribute
only the FAQs matching the page's primary language, so the schema and the
declared inLanguage agree.

Idempotent: if a managed FAQPage block already exists, replace it.

Usage:
    python3 scripts/inject_faq_schema.py [--dry-run]

Targets are DISCOVERED, not listed. The original version named three files.
That was the whole coverage: a 2026-08-12 audit found 144 indexable pages
carrying a visible FAQ section with no FAQPage schema at all — every /vs/
comparison, every /glossary/ entry, every /use-cases/ page. The markup was
already uniform (`faq-item > details.faq-details`), so the only thing standing
between those pages and valid schema was a hardcoded list of three.

A page that already has an UNMANAGED FAQPage block is left alone. Injecting
beside it would publish two FAQPage nodes for one page, and the hand-written
one is the one a human chose the wording for.

Note on what this buys, so nobody re-measures it expecting the wrong thing:
Google restricted FAQ rich results to authoritative government and health
sites in 2023, so this will NOT put FAQ accordions in Google's results for
this domain. It is worth doing for machine-readability — Bing still renders
them, and the AI surfaces this site is actually winning on (3,164 Copilot
citations) read structured data. Judge it on AI citations and Bing, not on
Google rich results.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

MANAGED_MARKER = "<!-- faq-schema: managed by scripts/inject_faq_schema.py -->"

# Pattern for one <details class="faq-details"> ... </details> block
FAQ_DETAILS_RE = re.compile(
    r'<details\s+class="faq-details">\s*'
    r'<summary\s+class="faq-summary">(?P<q>.*?)</summary>\s*'
    r'<div\s+class="faq-answer">(?P<a>.*?)</div>\s*'
    r'</details>',
    re.DOTALL,
)

# For pages where ja and en FAQs are split into <div data-lang="..."> blocks
# (the JA captio-alternative page), match the block that ends just before
# either the next data-lang sibling div or the section closing tag.
DATA_LANG_BLOCK_RE = re.compile(
    r'<div\s+data-lang="(?P<lang>ja|en)"[^>]*>'
    r'(?P<body>.*?)'
    r'</div>\s*(?=<div\s+data-lang=|</section>)',
    re.DOTALL,
)


def strip_tags_and_normalize(html: str) -> str:
    """Remove inner HTML tags from a FAQ answer/question, normalize whitespace."""
    # Replace <br> with space
    text = re.sub(r"<br\s*/?>", " ", html)
    # Strip remaining tags
    text = re.sub(r"<[^>]+>", "", text)
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


LANG_ATTR_RE = re.compile(r'data-lang="(ja|en)"')

# コメント・<style>・<script> の中身。**マークアップではない場所。**
NON_MARKUP_RE = re.compile(
    r"<!--.*?-->"
    r"|<style\b[^>]*>.*?</style>"
    r"|<script\b[^>]*>.*?</script>",
    re.DOTALL | re.IGNORECASE,
)


# 言語判定を遡る下限。**FAQ を含む節の外は見ない。**
LANG_SCOPE_RE = re.compile(r"<(?:section|article)\b", re.IGNORECASE)


def mask_non_markup(html_text: str) -> str:
    """コメント・``<style>``・``<script>`` を**同じ長さの空白**で覆う（位置は保つ）。

    [2026-09-03] これが無いせいで、`LANG_ATTR_RE` が **CSS の属性セレクタ**を
    マークアップの属性として読んでいた。どのページの ``<style>`` にも

        [data-lang="en"]{display:none}

    が入っている。FAQ の前に本物の ``data-lang`` が無いページでは、
    「直前の最後の data-lang」がこの CSS になり、``target_lang`` と食い違った瞬間に
    **FAQ が1件も抽出されない。**実測の被害（2026-09-03）:

        blog/business-memo-kakikata.html          可視FAQ 4 → 抽出 0
        blog/email-yourself-app-comparison.html   可視FAQ 6 → 抽出 0
        blog/iphone-memo-app-fast.html            可視FAQ 4 → 抽出 0
        blog/memo-app-service-shutdown-risk.html  可視FAQ 5 → 抽出 0
        en/vs/index.html                          可視FAQ 5 → **空の FAQPage を出荷**

    前の4面は schema がまったく付かず（`[skip] 0 FAQs found` と出るだけ）、
    en/vs/ は ``"mainEntity":[]`` を本番に出していた。**どれも赤くならない。**

    覆い方はコメントの件（`_first_live_head_close`）と同じ —— 長さを変えると
    位置がずれて、後続の判定がすべて動く。
    """
    return NON_MARKUP_RE.sub(lambda m: " " * (m.end() - m.start()), html_text)


def extract_faqs(html_text: str, target_lang: str) -> list[tuple[str, str]]:
    """(question, answer) pairs belonging to target_lang, in document order.

    Language comes from the nearest `data-lang` attribute BEFORE each FAQ,
    not from trying to delimit the enclosing block. Delimiting was the first
    approach and it silently failed on the bilingual pages: the block pattern
    has to guess where a <div data-lang> ends, and `faq-item` nests a div
    inside a div inside it, so on /vs/capacities/ no ja block matched at all.
    The code then fell through to its "no data-lang shell" fallback, which
    takes every FAQ on the page — publishing all 6 English Q&As inside a
    FAQPage declaring inLanguage "ja". Scanning backwards for the last
    data-lang attribute needs no notion of nesting and cannot mis-delimit.

    A FAQ with no data-lang before it belongs to a single-language page and
    is kept whatever target_lang is.
    """
    candidates: list[tuple[str, str]] = []
    seen: set[str] = set()
    # 言語の判定だけは覆った本文で行う。**CSS の `[data-lang="en"]` を
    # マークアップの属性として読まないため**（mask_non_markup の注記を参照）。
    # FAQ の切り出しは元の本文から行う —— こちらは本物のマークアップ。
    masked = mask_non_markup(html_text)
    for fm in FAQ_DETAILS_RE.finditer(html_text):
        # **走査は FAQ を含む section / article の中だけ。**
        #
        # [2026-09-03] ページの先頭から遡っていたので、**既に閉じたブロックの
        # data-lang が後続をすべて染めていた。**日本語のブログ4面が
        # `<div lang="en" data-lang="en" class="article-en-notice">`（「英語版もあります」の
        # 案内）を記事の前に置いており、その後ろにある日本語の FAQ が全部 en 扱いになって
        # **1件も抽出されなかった**（可視 FAQ 4/6/4/5 = 計19問。schema がまったく付かない）。
        #
        # 実測で境界を選んだ: section だけだと3面（FAQ の前に section が無い面が残る）、
        # **section または article** で4面すべてが直り、**残り141面の抽出結果は
        # 1文字も変わらない**（二言語ページの data-lang は FAQ 節の内側にあるため）。
        floor_hits = [x.start() for x in LANG_SCOPE_RE.finditer(masked, 0, fm.start())]
        floor = floor_hits[-1] if floor_hits else 0
        marks = LANG_ATTR_RE.findall(masked, floor, fm.start())
        lang = marks[-1] if marks else None
        if lang is not None and lang != target_lang:
            continue
        q = strip_tags_and_normalize(fm.group("q"))
        a = strip_tags_and_normalize(fm.group("a"))
        if q and a and q not in seen:
            candidates.append((q, a))
            seen.add(q)
    return candidates


def build_payload(page_url: str, in_language: str, faqs: list[tuple[str, str]]) -> str:
    """JSON-LD の本文だけ。**位置ではなく中身**を突き合わせるために切り出した。"""
    payload = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "@id": f"{page_url}#faq",
        "inLanguage": in_language,
        "mainEntity": [
            {
                "@type": "Question",
                "name": q,
                "acceptedAnswer": {"@type": "Answer", "text": a},
            }
            for q, a in faqs
        ],
    }
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def build_faqpage(page_url: str, in_language: str, faqs: list[tuple[str, str]]) -> str:
    body = build_payload(page_url, in_language, faqs)
    return f'  {MANAGED_MARKER}\n  <script type="application/ld+json">{body}</script>\n'


# 生成済みブロックの形。**書き込み側と検査側で同じものを使う** ——
# 別々に持つと、片方だけ直った日に検査が黙って当たらなくなる。
MANAGED_BLOCK_RE = re.compile(
    r"[ \t]*"
    + re.escape(MANAGED_MARKER)
    + r"\s*<script\s+type=\"application/ld\+json\">(?P<body>.*?)</script>[ \t]*\n?",
    re.DOTALL,
)


def managed_payload(html_text: str) -> str | None:
    """コミット済みの managed ブロックの中身。無ければ None。"""
    hit = MANAGED_BLOCK_RE.search(html_text)
    return hit.group("body") if hit else None


def replace_or_insert(html_text: str, block: str) -> str:
    # Remove existing managed block (idempotent). The block is one line of
    # marker comment plus one line of <script>; consume any leading/trailing
    # whitespace so re-runs leave the same byte count.
    html_text = MANAGED_BLOCK_RE.sub("", html_text)

    # Insert just before </head>. Don't consume any leading whitespace; the
    # block itself ends with '\n' so the resulting layout is stable across
    # repeated runs (idempotent).
    #
    # [2026-09-03] This used to be a bare re.search(r"</head>"), which found the
    # FIRST </head> in the file -- including one inside an HTML comment.
    # /captio-alternative/ carried the comment
    #
    #     <!-- JSON-LD: FAQPage is auto-generated near </head> by scripts/... -->
    #
    # so the block was spliced INTO that comment. HTML comments do not nest, so
    # the comment terminated at the injected block's first "-->", and the
    # remainder ("</head> by scripts/inject_faq_schema.py -->") became live
    # markup: the real </head> moved up, and the trailing text was hoisted into
    # <body>. The literal string "by scripts/inject_faq_schema.py -->" was the
    # FIRST VISIBLE LINE of that production page, and stayed there unnoticed.
    #
    # So: find the first </head> that is not inside a comment.
    head_close = _first_live_head_close(html_text)
    if head_close is None:
        return html_text
    return html_text[:head_close] + block + html_text[head_close:]


COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)


def _first_live_head_close(html_text: str):
    """Offset of the first ``</head>`` that is not inside an HTML comment.

    Returns ``None`` when the document has no live ``</head>``.  Commented-out
    ones are skipped rather than treated as insertion points -- splicing into a
    comment silently corrupts the document (see the note above).
    """
    masked = COMMENT_RE.sub(lambda m: " " * (m.end() - m.start()), html_text)
    hit = re.search(r"</head>", masked)
    return hit.start() if hit else None


def process_file(file_path: Path, page_url: str, lang: str, dry_run: bool) -> bool:
    text = file_path.read_text(encoding="utf-8")
    faqs = extract_faqs(text, lang)
    if not faqs:
        print(f"[skip] {file_path.relative_to(REPO_ROOT)}: 0 FAQs found")
        return False
    # **中身が合っていれば、位置を動かさない。**
    #
    # [2026-09-03] ここが無いと、生成済みブロックをいったん削って `</head>` の直前へ
    # 入れ直すので、**あとから同じ場所へ差し込む別の道具**（inject_locale_seed.py）が
    # 走るたびに順序が入れ替わり、実測16面が「更新あり」と出続けていた。
    # うち15面は**中身が1バイトも変わらない並べ替え**だった。
    if managed_payload(text) == build_payload(page_url, lang, faqs):
        print(f"[ok]   {file_path.relative_to(REPO_ROOT)}: already up to date")
        return False
    block = build_faqpage(page_url, lang, faqs)
    new_text = replace_or_insert(text, block)
    if new_text == text:
        print(f"[ok]   {file_path.relative_to(REPO_ROOT)}: already up to date")
        return False
    if not dry_run:
        file_path.write_text(new_text, encoding="utf-8")
    print(
        f"[update] {file_path.relative_to(REPO_ROOT)}: {len(faqs)} FAQs (lang={lang})"
    )
    return True


SITE_URL = "https://simplememofast.com"
SKIP_DIRS = {".git", "node_modules", "scripts", "docs", "screenshots", "admin"}
SKIP_FILES = {"404.html"}
NOINDEX_RE = re.compile(r'content\s*=\s*["\'][^"\']*noindex', re.IGNORECASE)


def hand_written_faqpage(html_text: str) -> bool:
    """人が書いた FAQPage を持つ面か。**持っていたら触らない。**

    横に足すと1つの面が FAQPage ノードを2つ公開することになり、しかも
    文言を選んだのは人のほうである。実測 47 面がこれに当たる。
    """
    return '"FAQPage"' in html_text and MANAGED_MARKER not in html_text


def page_url_for(path: Path) -> str:
    """Canonical, extension-less URL — the same shape the sitemap publishes:
    `foo/index.html` -> `/foo/`, `blog/bar.html` -> `/blog/bar`."""
    rel = path.relative_to(REPO_ROOT).as_posix()
    if rel.endswith("/index.html"):
        return f"{SITE_URL}/{rel[: -len('index.html')]}"
    if rel == "index.html":
        return f"{SITE_URL}/"
    return f"{SITE_URL}/{rel[: -len('.html')]}"


def discover() -> list[tuple[Path, str, str]]:
    """Every indexable page whose FAQ markup we may safely own."""
    targets: list[tuple[Path, str, str]] = []
    for path in sorted(REPO_ROOT.rglob("*.html")):
        rel = path.relative_to(REPO_ROOT)
        if any(p in SKIP_DIRS for p in rel.parts) or rel.name in SKIP_FILES:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if NOINDEX_RE.search(text):
            continue
        if not FAQ_DETAILS_RE.search(text):
            continue
        if hand_written_faqpage(text):
            print(f"[keep] {rel}: hand-written FAQPage left alone")
            continue
        lang = "en" if rel.parts[0] == "en" else "ja"
        targets.append((path, page_url_for(path), lang))
    return targets


def check_committed(targets: list[tuple[Path, str, str]]) -> int:
    """コミット済みの FAQPage が、いまの可視 FAQ と一致しているかを検査する。

    【なぜ要るか】この道具は**このリポジトリで唯一、本番ページに目に見える壊れ方を
    出した**（コメントの中へブロックを差し込み、`by scripts/inject_faq_schema.py -->` が
    本文1行目に出た）。それでも 2026-09-03 まで CI に配線されておらず、`--check` も
    `--selftest` も無かった。**直したことは書いてあるが、落ちるのを誰も見ていない。**

    実際、無検査のあいだに1面ずれていた —— `en/vs/index.html` は可視 FAQ が5問あるのに
    `"mainEntity":[]`（空の FAQPage）を出荷していた。古い抽出アルゴリズムの化石で、
    アルゴリズムは直ったが**出力は再生成されなかった。**

    【位置は比べない】生成済みブロックの**中身**だけを突き合わせる。`</head>` の直前へ
    入れ直す道具は他にもあり（inject_locale_seed.py）、走った順で並びが入れ替わる。
    順序を差分に数えると、**中身が1バイトも変わらない16面が毎回「ずれ」として出て**、
    やがて誰も見なくなる。JSON-LD の並びは解釈に影響しない。
    """
    problems = 0
    for fp, url, lang in targets:
        # 自己テストは REPO_ROOT の外（tmpdir）の検体を渡す。**壊れたページを
        # リポジトリに置かない**ため。relative_to はそこで ValueError を投げる。
        try:
            rel = fp.relative_to(REPO_ROOT)
        except ValueError:
            rel = fp
        text = fp.read_text(encoding="utf-8")
        faqs = extract_faqs(text, lang)
        # discover() は可視の FAQ マークアップがある面しか返さない。
        # **抽出0は「異常なし」ではなく「読めていない」。**
        if not faqs:
            print(f"  NO FAQ EXTRACTED  {rel}: 可視の FAQ があるのに1件も読めていない（lang={lang}）")
            problems += 1
            continue
        want = build_payload(url, lang, faqs)
        have = managed_payload(text)
        if have is None:
            print(f"  NO SCHEMA         {rel}: FAQ が {len(faqs)} 件あるのに FAQPage が無い")
            problems += 1
        elif have != want:
            print(f"  STALE             {rel}: 出荷中の FAQPage が可視の FAQ と食い違う")
            problems += 1

    if problems:
        print(
            f"\nFAIL: {problems} 件。`python3 scripts/inject_faq_schema.py` を実行して、"
            f"生成された FAQPage を同じコミットに含めてください。"
        )
        return 1
    print(f"FAQ schema: {len(targets)} 面の FAQPage は可視の FAQ と一致（位置は比較対象外）")
    return 0


def run_selftest() -> int:
    """**落ちることを確かめる。**data/check-selftests.json:
    「落ちることを確かめていない検査は、無いのと同じ」。

    この道具は**このリポジトリで唯一、本番ページに目に見える壊れ方を出した**のに、
    2026-09-03 まで CI に配線されておらず `--check` も `--selftest` も無かった
    （data/autopilot-actions.json#act-faq-injector-untested）。
    直し（`_first_live_head_close`）は入っていたが、落ちるのを誰も見ていない。

    固定するのは、**赤くならずに間違える**形ばかりである:
      - コメントの中へブロックを差し込み、本文に生の文字列を出す（実際に起きた）
      - CSS の `[data-lang="en"]` をマークアップの属性として読む
      - 既に閉じた `data-lang` ブロックが、節の外から後続の FAQ を染める
      - 空の FAQPage をそのまま出荷する（en/vs/ が実際にそうだった）

    検体は文字列と tmpdir。**ページには何も書かない。**
    """
    import contextlib
    import io
    import tempfile

    failures: list[str] = []

    def t(name: str, cond: bool) -> None:
        if not cond:
            failures.append(name)

    def quiet(fn):
        """判定と同時に人向けの説明を刷るので黙らせる。**返り値と本文の両方を返す**
        —— 返り値だけを見ると「別の理由で1になった」を見分けられない
        （台帳が「計測器のほうを間違えた」と書いている形）。"""
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = fn()
        return rc, buf.getvalue()

    faq = ('<div class="faq-item"><details class="faq-details">'
           '<summary class="faq-summary">{q}</summary>'
           '<div class="faq-answer">{a}</div></details></div>')
    page = lambda body, head="<title>x</title>": (  # noqa: E731
        f"<html><head>{head}</head><body>{body}</body></html>")

    # --- 文字列の正規化 ---
    t("<br> は空白になる", strip_tags_and_normalize("a<br>b") == "a b")
    t("内側のタグは落とす", strip_tags_and_normalize("<b>a</b> <i>b</i>") == "a b")
    t("空白は畳む", strip_tags_and_normalize("a \n\n  b") == "a b")

    # --- 抽出 ---
    two = faq.format(q="Q1", a="A1") + faq.format(q="Q2", a="A2")
    got = extract_faqs(page(two), "ja")
    t("質問と回答を文書順で取る", [q for q, _ in got] == ["Q1", "Q2"])
    t("data-lang が無ければ target を問わず残す", len(extract_faqs(page(two), "en")) == 2)
    t("同じ質問は1回だけ",
      len(extract_faqs(page(faq.format(q="Q1", a="A1") * 2), "ja")) == 1)

    # **CSS の属性セレクタをマークアップとして読まない。**どのページの <style> にも
    # `[data-lang="en"]{display:none}` が入っている。
    css = '<style>[data-lang="en"]{display:none}</style>'
    t("CSS の [data-lang] は言語判定に使わない",
      len(extract_faqs(page(two, head="<title>x</title>" + css), "ja")) == 2)
    t("mask_non_markup は長さを変えない",
      len(mask_non_markup(css)) == len(css))

    # **閉じたブロックが節の外から後続を染めない。**日本語のブログ4面が
    # 「英語版もあります」の案内（<div data-lang="en">）を記事の前に置いており、
    # その後ろの日本語 FAQ が全部 en 扱いになって1件も読めなくなっていた。
    notice = '<div lang="en" data-lang="en">English version available</div>'
    t("節の外で閉じた data-lang は後続を染めない",
      len(extract_faqs(page(notice + "<article><h2>FAQ</h2>" + two + "</article>"), "ja")) == 2)
    # 節の中の data-lang は効く（二言語ページはこの形で言語を分けている）
    inside = ('<section><div data-lang="ja">' + faq.format(q="日本語", a="答") + '</div>'
              '<div data-lang="en">' + faq.format(q="English", a="answer") + '</div></section>')
    t("節の中の data-lang で言語を分ける",
      [q for q, _ in extract_faqs(page(inside), "ja")] == ["日本語"]
      and [q for q, _ in extract_faqs(page(inside), "en")] == ["English"])

    # --- 出力の形 ---
    payload = json.loads(build_payload("https://x/p/", "ja", [("Q", "A")]))
    t("@id は URL に #faq を付ける", payload["@id"] == "https://x/p/#faq")
    t("inLanguage を載せる", payload["inLanguage"] == "ja")
    t("mainEntity は Question / acceptedAnswer の形",
      payload["mainEntity"][0]["@type"] == "Question"
      and payload["mainEntity"][0]["acceptedAnswer"]["text"] == "A")
    # 書き込み側と検査側が**同じ形**を見ていること。別々に持つと片方だけ直る。
    t("生成したブロックから中身を取り出せる",
      managed_payload(build_faqpage("https://x/p/", "ja", [("Q", "A")]))
      == build_payload("https://x/p/", "ja", [("Q", "A")]))

    # --- 差し込み（本番を壊した形） ---
    block = build_faqpage("https://x/p/", "ja", [("Q", "A")])
    once = replace_or_insert(page(two), block)
    t("</head> の直前に入る", once.index(MANAGED_MARKER) < once.index("</head>"))
    t("2回目は同じバイト列（冪等）", replace_or_insert(once, block) == once)
    t("ブロックは1つだけ", once.count(MANAGED_MARKER) == 1)
    # **コメントの中へ差し込まない。**/captio-alternative/ で実際に起きた形。
    commented = ("<html><!-- FAQPage is auto-generated near </head> by scripts/... -->"
                 "<head><title>x</title></head><body>y</body></html>")
    out = replace_or_insert(commented, block)
    t("コメントの中の </head> を選ばない", out.index(MANAGED_MARKER) > out.index("<head>"))
    t("コメントは壊れていない", "near </head> by scripts/... -->" in out)
    t("</head> が無ければ変えない",
      replace_or_insert("<html><body>y</body></html>", block) == "<html><body>y</body></html>")

    # --- 面の選別 ---
    t("手書きの FAQPage は触らない", hand_written_faqpage('<script>{"@type":"FAQPage"}</script>'))
    t("生成済みのブロックは手書き扱いしない",
      not hand_written_faqpage(f'{MANAGED_MARKER}<script>{{"@type":"FAQPage"}}</script>'))
    t("noindex を拾う", NOINDEX_RE.search('<meta name="robots" content="noindex, follow">') is not None)
    t("index は拾わない", NOINDEX_RE.search('<meta name="robots" content="index, follow">') is None)
    t("ルートの index.html は /", page_url_for(REPO_ROOT / "index.html") == f"{SITE_URL}/")
    t("下位の index.html は末尾スラッシュ",
      page_url_for(REPO_ROOT / "en/vs/index.html") == f"{SITE_URL}/en/vs/")
    t("index 以外は拡張子を落とす",
      page_url_for(REPO_ROOT / "blog/x.html") == f"{SITE_URL}/blog/x")

    # --- 突き合わせ（en/vs/ が実際に空の FAQPage を出荷していた） ---
    with tempfile.TemporaryDirectory() as tmp:
        f = Path(tmp) / "index.html"
        good = page(two).replace("</head>", build_faqpage("https://x/p/", "ja", [("Q1", "A1"), ("Q2", "A2")]) + "</head>")
        f.write_text(good, encoding="utf-8")
        rc, out = quiet(lambda: check_committed([(f, "https://x/p/", "ja")]))
        t("一致していれば 0", rc == 0)

        # **空の FAQPage を通さない。**可視 FAQ が2件あるのに mainEntity が空。
        # en/vs/index.html が実際にこの状態で出荷されていた（古い抽出の化石）。
        f.write_text(page(two).replace("</head>", build_faqpage("https://x/p/", "ja", []) + "</head>"), encoding="utf-8")
        rc, out = quiet(lambda: check_committed([(f, "https://x/p/", "ja")]))
        t("空の FAQPage は落とす", rc == 1 and "STALE" in out)

        # 可視 FAQ があるのに FAQPage が無い。
        f.write_text(good.replace(MANAGED_MARKER, "<!-- gone -->"), encoding="utf-8")
        rc, out = quiet(lambda: check_committed([(f, "https://x/p/", "ja")]))
        t("FAQPage が無ければ落とす", rc == 1 and "NO SCHEMA" in out)

        # **「読めなかった」を「異常なし」と報告しない。**
        # 可視の FAQ があるのに言語の食い違いで1件も読めない面（これが 2026-09-03 まで
        # `[skip] 0 FAQs found` と出るだけで、検査が素通りしていた形）。
        hidden = page('<section><div data-lang="en">' + faq.format(q="Q", a="A") + "</div></section>")
        f.write_text(hidden, encoding="utf-8")
        rc, out = quiet(lambda: check_committed([(f, "https://x/p/", "ja")]))
        t("抽出0を異常なしにしない", rc == 1 and "NO FAQ EXTRACTED" in out)

    for f2 in failures:
        print(f"  x {f2}")
    print(f"自己テスト 31 件中 {len(failures)} 件失敗")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--check", action="store_true",
                        help="コミット済みの FAQPage が可視の FAQ と一致しなければ exit 1")
    parser.add_argument("--selftest", action="store_true",
                        help="この検査自身が落ちることを確かめる（ページは書かない）")
    args = parser.parse_args()

    if args.selftest:
        return run_selftest()

    targets = discover()
    if args.check:
        return check_committed(targets)

    changed = 0
    for fp, url, lang in targets:
        if process_file(fp, url, lang, args.dry_run):
            changed += 1
    print(f"\n{len(targets)} page(s) with FAQ markup; "
          f"{'would update' if args.dry_run else 'updated'} {changed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
