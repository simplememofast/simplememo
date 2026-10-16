#!/usr/bin/env python3
"""Validate the proposed patch without modifying the current Web terms."""

from hashlib import sha256
from pathlib import Path
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[2]
PATCH = Path(__file__).with_name("article-7.patch").resolve()
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
        assert sha256(original).hexdigest() == BASE_HASHES[path], (
            f"{path}: current source changed; review against the latest terms"
        )

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
            print(f"PASS {path}: five paragraphs, valid section HTML, anchors preserved")
            print(f"PASS {path}: all content outside Section 7 byte-identical")

    for path, original in originals.items():
        assert (ROOT / path).read_bytes() == original
    print("PASS approved Japanese text matches exactly; English safeguards present")
    print("PASS patch applies cleanly; current Web terms remain unchanged")


if __name__ == "__main__":
    main()
