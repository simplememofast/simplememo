#!/usr/bin/env python3
"""Validate the proposed patch without modifying the current Web terms."""

from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[2]
PATCH = Path(__file__).with_name("article-7.patch").resolve()
BASE_COMMIT = "f1de6301221c7660f37da4ae985fc49599aa61ce"
LOCALES = ["", "en", "ar", "es", "id", "ko", "pt-BR", "tr", "zh", "zh-Hant"]
NOTICE = re.compile(
    r"(?m)^      <!-- BEGIN proposed-section-7-notice -->\n.*?"
    r"^      <!-- END proposed-section-7-notice -->\n", re.S,
)
COPY = re.compile(
    r"(?m)^    <!-- BEGIN proposed-section-7-copy -->\n.*?"
    r"^    <!-- END proposed-section-7-copy -->\n", re.S,
)
BASE_HASHES = {
    "terms.html": "39a68b08ae7a0570d0e48dc603b51f0be5813db9f688a7ed871f31ca94676275",
    "en/terms.html": "f88bdada323c1787043fe0710b2e8ea04a6254645d1484f8518f1e00bb94513a",
}
TITLES = {
    "terms.html": "7. 送信の成否・セキュリティ・損害賠償",
    "en/terms.html": "7. Delivery, Security, and Liability for Damages",
}
APPROVED_JA = [
    "当社は、メールの到達や即時性を保証しません。通信環境、宛先サーバの受信制限、迷惑メール判定等により、送信遅延・失敗が発生する場合があります。ただし、当社の責めに帰すべき事由により生じた損害について、当社の責任を免除するものではありません。",
    "当社は、法令および当社のプライバシーポリシーに従い、情報の安全管理および委託先の監督を行います。ただし、不正アクセス、マルウェア、第三者による攻撃等を完全に防止できることを保証するものではありません。",
    "不正アクセス等による情報の漏えい、滅失、毀損、改ざん、サービス停止等について、当社の責めに帰すべき事由がない場合には、法令により責任を負う場合を除き、当社は損害賠償責任を負いません。第三者による攻撃であることのみを理由として、当社が免責されるものではありません。",
    "当社、その代表者またはその使用する者の軽過失（重大な過失を除く過失）により当社が損害賠償責任を負う場合に限り、賠償の範囲は、当該事由から通常かつ直接生じた損害とします。この制限は、故意または重大な過失による場合、生命・身体に損害が生じた場合、その他法令により責任の制限が認められない場合には適用しません。",
    "本条は、法令に基づく安全管理、漏えい等の報告、本人への通知その他の当社の義務を免除・制限するものではありません。また、消費者契約法その他の強行法規により認められるユーザーの権利を制限するものではありません。",
]


def split_section(text):
    match = re.search(
        r'(?m)^ *<h2 id="reading-07">.*?(?=^ *<h2 id="reading-08">)',
        text,
        re.S,
    )
    assert match is not None, "Section 7 boundary missing"
    return text[:match.start()], match.group(), text[match.end():]


class PageParser(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__()
        self.stack, self.ids, self.canonicals, self.robots = [], [], [], []
        self.json_script = False
        self.json_text = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonicals.append(attrs["href"])
        if tag == "meta" and attrs.get("name") == "robots":
            self.robots.append(attrs["content"])
        if tag == "script" and attrs.get("type") == "application/ld+json":
            self.json_script = True
            self.json_text = []
        if tag not in self.VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        assert self.stack and self.stack.pop() == tag, f"Unbalanced HTML: {tag}"
        if tag == "script" and self.json_script:
            json.loads("".join(self.json_text))
            self.json_script = False

    def handle_data(self, data):
        if self.json_script:
            self.json_text.append(data)


def main():
    patch = PATCH.read_text(encoding="utf-8")
    assert re.findall(r"(?m)^--- a/(.+)$", patch) == list(BASE_HASHES)
    assert re.findall(r"(?m)^\+\+\+ b/(.+)$", patch) == list(BASE_HASHES)
    subprocess.run(
        ["git", "apply", "--check", "--whitespace=error", str(PATCH)],
        cwd=ROOT, check=True,
    )
    originals = {path: (ROOT / path).read_bytes() for path in BASE_HASHES}
    for path, original in originals.items():
        without_notice, count = NOTICE.subn("", original.decode("utf-8"))
        without_proposal, copies = COPY.subn("", without_notice)
        assert count == copies == 1
        assert sha256(without_proposal.encode()).hexdigest() == BASE_HASHES[path], (
            f"{path}: current terms changed outside the pending notice"
        )

    for locale in LOCALES:
        path = f"{locale}/terms.html" if locale else "terms.html"
        text = (ROOT / path).read_text(encoding="utf-8")
        baseline = subprocess.check_output(
            ["git", "show", f"{BASE_COMMIT}:{path}"], cwd=ROOT,
        ).decode("utf-8")
        stripped, count = NOTICE.subn("", text)
        stripped, copies = COPY.subn("", stripped)
        assert count == copies == 1 and stripped == baseline, f"{path}: changed current terms"
        notice = NOTICE.search(text).group()
        assert '#proposed-section-7-ja' in notice
        assert '#proposed-section-7-en' in notice
        copy = COPY.search(text).group()
        assert '<div class="container" data-nosnippet="">' in copy
        assert 'id="proposed-section-7" translate="no"' in copy
        assert 'lang="ja"' in copy and 'lang="en"' in copy
        parser = PageParser()
        parser.feed(text)
        assert not parser.stack and len(parser.ids) == len(set(parser.ids))
        print(f"PASS {path}: additions separated; all existing text and dates preserved")

    with tempfile.TemporaryDirectory(prefix="simplememo-terms-review-") as tmp:
        candidate = Path(tmp)
        for path, original in originals.items():
            target = candidate / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(original)
        subprocess.run(
            ["git", "apply", "--whitespace=error", str(PATCH)],
            cwd=candidate, check=True,
        )
        for path, original in originals.items():
            before = original.decode("utf-8")
            after = (candidate / path).read_text(encoding="utf-8")
            before_parts, after_parts = split_section(before), split_section(after)
            assert before_parts[0] == after_parts[0], f"{path}: preceding content changed"
            assert before_parts[2] == after_parts[2], f"{path}: following content changed"
            assert re.findall(r'\bid="([^"]+)"', before) == re.findall(
                r'\bid="([^"]+)"', after
            ), f"{path}: anchor IDs changed"
            section = ET.fromstring("<section>" + after_parts[1] + "</section>")
            assert [child.tag for child in section] == ["h2", "ol"]
            assert section.find("h2").text == TITLES[path]
            items = section.findall("ol/li")
            assert len(items) == 5 and all(len(item) == 0 for item in items)
            if path == "terms.html":
                assert [item.text for item in items] == APPROVED_JA
            else:
                assert "reasons attributable to us" in items[0].text
                assert "does not, by itself, exempt us from liability" in items[2].text
                assert items[3].text.startswith("Only where")
                assert "negligence other than gross negligence" in items[3].text
                assert "harm to life or bodily injury" in items[3].text
                assert "Consumer Contract Act of Japan" in items[4].text
            language = "ja" if path == "terms.html" else "en"
            for locale in LOCALES:
                proposal_path = f"{locale}/terms.html" if locale else "terms.html"
                proposal = COPY.search((ROOT / proposal_path).read_text(encoding="utf-8")).group()
                proposed_section = re.search(
                    r'<section [^>]*data-proposed-terms="section-7-' + language + r'"[^>]*>(.*?)</section>',
                    proposal, re.S,
                ).group(1)
                proposed_tree = ET.fromstring("<section>" + proposed_section + "</section>")
                assert [item.text for item in proposed_tree.findall("ol/li")] == [
                    item.text for item in items
                ], f"{proposal_path}: {language} differs from the reviewed patch"
                assert '<time ' not in proposal, "Proposal must not invent an effective date"
                assert "改定案・未施行・施行日未定" in proposal
                assert "Proposal — not in effect; effective date not set" in proposal
            print(f"PASS {language} proposal: exact reviewed text on all ten locales")
            print(f"PASS {path}: five paragraphs, valid section HTML, anchors preserved")
            print(f"PASS {path}: all content outside Section 7 byte-identical")

    for path, original in originals.items():
        assert (ROOT / path).read_bytes() == original
    print("PASS approved Japanese text matches exactly; English safeguards present")
    print("PASS patch applies cleanly; current clauses remain unchanged; notices are separate")


if __name__ == "__main__":
    main()
