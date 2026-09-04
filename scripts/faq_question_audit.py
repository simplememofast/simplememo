"""Read-only question comparison. Differences are review candidates, not errors.

Uses only the standard library; it never calls or changes the FAQ generator.
Language alternatives are read separately, including spans inside one summary.
This checks HTML content, not computed CSS visibility or answer correctness.
"""
from html.parser import HTMLParser
import json
import re
import unicodedata


def normalize(text):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", text)).strip()


class Element:
    def __init__(self, tag, attrs=(), parent=None):
        self.tag, self.attrs, self.parent = tag, dict(attrs), parent
        self.children = []

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Element):
                yield from child.walk()

    def text(self, lang=None, inherited="ja"):
        chosen = (self.attrs.get("data-lang") or self.attrs.get("lang") or inherited).split("-")[0]
        if self.tag in {"script", "style", "template", "noscript", "head"} or "hidden" in self.attrs:
            return ""
        return "".join(c.text(lang, chosen) if isinstance(c, Element)
                       else c if lang is None or chosen == lang else ""
                       for c in self.children)


class Document(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self, raw):
        super().__init__(convert_charrefs=True)
        self.root = self.current = Element("document")
        self.feed(raw)

    def handle_starttag(self, tag, attrs):
        node = Element(tag, attrs, self.current)
        self.current.children.append(node)
        if tag == "br":
            self.current.children.append(" ")
        if tag not in self.VOID:
            self.current = node

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        node = self.current
        while node.parent is not None:
            if node.tag == tag:
                self.current = node.parent
                break
            node = node.parent

    def handle_data(self, data):
        self.current.children.append(data)


def faq_nodes(value):
    if isinstance(value, list):
        for child in value:
            yield from faq_nodes(child)
    elif isinstance(value, dict):
        types = value.get("@type", [])
        if "FAQPage" in ([types] if isinstance(types, str) else types):
            yield value
        for child in value.values():
            if isinstance(child, (list, dict)):
                yield from faq_nodes(child)


def question_elements(root):
    found = []
    for node in root.walk():
        classes = set((node.attrs.get("class") or "").split())
        ancestors = []
        parent = node.parent
        while parent:
            ancestors.append(parent)
            parent = parent.parent
        if node.tag == "summary" or classes & {"faq-question", "faq-q"} or (
            "app-card__name" in classes and any(p.attrs.get("id") == "faq" for p in ancestors)
        ):
            found.append(node)
        if node.tag in {"h2", "h3"} and normalize(node.text()).lower() in {
            "faq", "よくある質問", "frequently asked questions"
        }:
            siblings = node.parent.children
            for sibling in siblings[siblings.index(node) + 1:]:
                if not isinstance(sibling, Element):
                    continue
                if sibling.tag in {"h1", "h2", "h3"} and sibling.tag <= node.tag:
                    break
                if sibling.tag == "p":
                    children = [c for c in sibling.children if isinstance(c, Element)]
                    if len(children) >= 2 and children[0].tag in {"strong", "b"} and children[1].tag == "br":
                        found.append(children[0])
    return list(dict.fromkeys(found))


def inherited_language(node, default):
    parent = node.parent
    while parent:
        lang = parent.attrs.get("data-lang") or parent.attrs.get("lang")
        if lang:
            return lang.split("-")[0]
        parent = parent.parent
    return default


def eligible_content(node):
    while node:
        if "hidden" in node.attrs or node.tag in {"head", "template", "noscript", "script", "style"}:
            return False
        node = node.parent
    return True


def audit_page(label, raw):
    doc = Document(raw)
    nodes = list(doc.root.walk())
    default = next((n.attrs.get("lang", "ja").split("-")[0] for n in nodes if n.tag == "html"), "ja")
    languages = {default} | {(n.attrs.get("data-lang") or n.attrs.get("lang")).split("-")[0]
                            for n in nodes if n.attrs.get("data-lang") or n.attrs.get("lang")}
    questions = [n for n in question_elements(doc.root) if eligible_content(n)]
    visible = {lang: {normalize(n.text(lang, inherited_language(n, default))) for n in questions}
               - {""} for lang in languages}
    rows = []
    for script in nodes:
        if script.tag != "script" or script.attrs.get("type") != "application/ld+json":
            continue
        try:
            payload = json.loads("".join(c for c in script.children if isinstance(c, str)))
        except (ValueError, TypeError):
            rows.append({"path": label, "state": "unread", "reason": "invalid_jsonld"})
            continue
        for schema in faq_nodes(payload):
            entities = schema.get("mainEntity")
            if not isinstance(entities, list) or not entities or any(
                not isinstance(q, dict) or not isinstance(q.get("name"), str) or not q["name"].strip()
                for q in entities
            ):
                rows.append({"path": label, "state": "unread", "reason": "invalid_questions"})
                continue
            language = schema.get("inLanguage")
            if language is not None and not isinstance(language, str):
                rows.append({"path": label, "state": "unread", "reason": "unsupported_language"})
                continue
            # No inLanguage can mean multilingual schema. Never concatenate JA/EN.
            langs = [language.split("-")[0]] if language else sorted(languages)
            actual = set().union(*(visible.get(lang, set()) for lang in langs))
            expected = {normalize(q["name"]) for q in entities}
            missing = sorted(expected - actual)
            rows.append({"path": label, "languages": langs, "schema_questions": len(expected),
                         "html_questions": len(actual), "missing": missing,
                         "state": "unread" if not actual else "candidate" if missing else "match"})
    return rows


def audit_questions(pages):
    from inject_faq_schema import hand_written_faqpage
    rows = [row for path, raw in pages if hand_written_faqpage(raw) for row in audit_page(path, raw)]
    return {"mode": "read_only", "meaning": "String differences need semantic review; not automatic failures.",
            "pages": len({r["path"] for r in rows}),
            "states": {s: sum(r["state"] == s for r in rows) for s in ("match", "candidate", "unread")},
            "rows": rows}


def selftest():
    def page(questions, body, language=None):
        schema = {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q} for q in questions]}
        if language:
            schema["inLanguage"] = language
        return '<html lang="ja"><head><script type="application/ld+json">' + json.dumps(schema) + '</script></head><body>' + body + '</body></html>'

    positives = [
        page(["日本語?", "English?"], '<summary><span data-lang="ja">日本語？</span><span data-lang="en">English?</span></summary>'),
        page(["日本語?"], '<summary><span data-lang="ja">日本語？</span><span data-lang="en">English?</span></summary>', "ja"),
        page(["English?"], '<div data-lang="en"><summary>English?</summary></div>', "en"),
        page(["Q?"], '<summary>Q?</summary><summary>Additional question?</summary>'),
        page(["Q & A?"], '<summary>Q &amp; A?</summary>'),
        page(["Q?"], '<h2>FAQ</h2><p><strong>Q?</strong><br>Answer</p>'),
    ]
    negatives = [
        page(["Q?"], '<summary>Other?</summary><!-- Q? -->'),
        page(["Q?"], '<summary hidden>Q?</summary><summary>Other?</summary>'),
        page(["Q?"], '<div hidden><summary>Q?</summary></div><summary>Other?</summary>'),
        page(["Q?"], '<summary>Other?</summary><script>Q?</script>'),
        page(["English?"], '<summary data-lang="en">English?</summary><summary>日本語?</summary>', "ja"),
    ]
    for raw in positives:
        assert audit_page("fixture", raw)[0]["state"] == "match"
    for raw in negatives:
        assert audit_page("fixture", raw)[0]["state"] != "match"
    assert audit_page("missing", page(["Q?"], ""))[0]["state"] == "unread"
    assert audit_page("invalid", '<script type="application/ld+json">{</script>')[0]["state"] == "unread"
    print(f"FAQ question audit: false positives 0/{len(positives)}, missed defects 0/{len(negatives)}; unread cases passed")
