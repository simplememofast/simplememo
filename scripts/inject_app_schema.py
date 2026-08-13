#!/usr/bin/env python3
"""
Put the SoftwareApplication node on the product landing pages that describe
the app but never declared it.

    python3 scripts/inject_app_schema.py [--dry-run]

Every page emits the SAME node under the SAME @id
(`https://simplememofast.com/#app`). That is the point, not an oversight: JSON-LD
merges nodes by @id, so seven pages describing one app converge on one entity.
Minting `#obsidian-app`, `#siri-app` and so on would publish seven competing
products, which is precisely what brand-2024-08-11-entity-merge is trying to
undo. For the same reason `url` stays the app's canonical home on every page
rather than the page doing the emitting — one entity, one URL. The page-level
identity is already carried by each page's own WebPage/Article node.

Values that drift (rating, prices, version) are NOT written here. They are read
from data/site-constants.json at generation time and then enforced in CI by
scripts/sync_constants.js, whose `#app` rule matches exactly the node this
emits. Hardcoding them here would create a second source of truth.

Listed, not discovered: "is this a page about the app" is an editorial call.
/vs/ comparisons and blog listicles mention the app constantly and must not
claim to BE it.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SITE_URL = "https://simplememofast.com"
C = json.loads((REPO_ROOT / "data/site-constants.json").read_text(encoding="utf-8"))

MANAGED_MARKER = "<!-- app-schema: managed by scripts/inject_app_schema.py -->"

# (file, inLanguage)
TARGETS = [
    ("obsidian/index.html", "ja"),
    ("siri/index.html", "ja"),
    ("voice-input/index.html", "ja"),
    ("fastest-voice-memo/index.html", "ja"),
    ("note-to-email/index.html", "ja"),
    ("hands-free/index.html", "ja"),
    ("en/obsidian/index.html", "en"),
    ("en/siri/index.html", "en"),
]


def build_node(lang: str) -> str:
    payload = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "@id": f"{SITE_URL}/#app",
        "name": C["appNameJa"] if lang == "ja" else C["appNameEn"],
        "alternateName": [
            C["appNameEn"] if lang == "ja" else C["appNameJa"],
            *C["alternateNames"],
        ],
        "url": f"{SITE_URL}/",
        "image": f"{SITE_URL}/assets/img/app-icon-256.png",
        "applicationCategory": "UtilitiesApplication",
        "operatingSystem": "iOS 16.0+, watchOS",
        "softwareVersion": C["appVersion"],
        "isAccessibleForFree": True,
        "inLanguage": lang,
        "downloadUrl": f"https://apps.apple.com/jp/app/id{C['appStoreId']}",
        "offers": [
            {
                "@type": "Offer",
                "name": "Free",
                "price": "0",
                "priceCurrency": "JPY",
                "description": (f"1日{C['freeSendsPerDay']}通まで（ずっと無料）" if lang == "ja"
                                else f"Up to {C['freeSendsPerDay']} sends a day, free forever"),
                "availability": "https://schema.org/InStock",
            },
            {
                "@type": "Offer",
                "name": "Premium Monthly",
                "price": C["priceMonthlyJpy"],
                "priceCurrency": "JPY",
                "description": (f"月額{C['priceMonthlyJpy']}円・送信無制限" if lang == "ja"
                                else f"{C['priceMonthlyJpy']} JPY a month, unlimited sends"),
                "availability": "https://schema.org/InStock",
            },
            {
                "@type": "Offer",
                "name": "Premium Yearly",
                "price": C["priceYearlyJpy"].replace(",", ""),
                "priceCurrency": "JPY",
                "description": (f"年額{C['priceYearlyJpy']}円・送信無制限" if lang == "ja"
                                else f"{C['priceYearlyJpy']} JPY a year, unlimited sends"),
                "availability": "https://schema.org/InStock",
            },
        ],
        "author": {
            "@type": "Person",
            "@id": f"{SITE_URL}/about/#person",
            "name": "AI Ataka",
            "url": f"{SITE_URL}/about/",
        },
        "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": C["ratingValue"],
            "ratingCount": C["ratingCount"],
            "bestRating": "5",
            "worstRating": "1",
        },
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return f'  {MANAGED_MARKER}\n  <script type="application/ld+json">{body}</script>\n'


def replace_or_insert(html_text: str, block: str) -> str:
    pat = re.compile(
        r"[ \t]*" + re.escape(MANAGED_MARKER)
        + r"\s*<script\s+type=\"application/ld\+json\">.*?</script>[ \t]*\n?",
        re.DOTALL,
    )
    html_text = pat.sub("", html_text)
    head_close = re.search(r"</head>", html_text)
    if not head_close:
        return html_text
    return html_text[: head_close.start()] + block + html_text[head_close.start():]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    failed = False
    for rel, lang in TARGETS:
        path = REPO_ROOT / rel
        if not path.exists():
            print(f"[err] missing: {rel}")
            failed = True
            continue
        text = path.read_text(encoding="utf-8")
        if "SoftwareApplication" in text and MANAGED_MARKER not in text:
            print(f"[keep] {rel}: already has a hand-written SoftwareApplication")
            continue
        new_text = replace_or_insert(text, build_node(lang))
        if new_text == text:
            print(f"[ok]   {rel}: already up to date")
            continue
        if not args.dry_run:
            path.write_text(new_text, encoding="utf-8")
        print(f"[update] {rel} (lang={lang})")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
