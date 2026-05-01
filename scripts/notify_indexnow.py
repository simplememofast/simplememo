"""
Notify IndexNow (Bing / Yandex / Naver) about updated URLs.

The IndexNow key is public by design — verification works via the file
at https://simplememofast.com/<KEY>.txt. Keeping the key in this script
is intentional and safe.

Usage:
    # Notify a fixed list of high-priority URLs (default).
    python3 scripts/notify_indexnow.py

    # Notify a custom URL list (one per line, http(s):// URLs).
    python3 scripts/notify_indexnow.py --file urls.txt

    # Dry-run: print what would be sent without making the request.
    python3 scripts/notify_indexnow.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from i18n_config import SITE_URL  # noqa: E402

INDEXNOW_KEY = "3b4a3c278a4cc17ab7e03d6e7739bd21"
INDEXNOW_HOST = "simplememofast.com"
INDEXNOW_KEY_LOCATION = f"{SITE_URL}/{INDEXNOW_KEY}.txt"
INDEXNOW_API = "https://api.indexnow.org/IndexNow"

# Default high-priority URLs to nudge after deploys. Bing reads its
# own /sitemap.xml on schedule but IndexNow gets immediate crawl.
DEFAULT_URLS = [
    f"{SITE_URL}/",
    f"{SITE_URL}/en/",
    f"{SITE_URL}/captio-alternative/",
    f"{SITE_URL}/en/captio-alternative/",
    f"{SITE_URL}/note-to-email/",
    f"{SITE_URL}/en/note-to-email/",
    f"{SITE_URL}/blog/captioo-alternative",
    f"{SITE_URL}/blog/ios-quick-capture-comparison",
    f"{SITE_URL}/sitemap.xml",
    f"{SITE_URL}/sitemap-ja.xml",
    f"{SITE_URL}/sitemap-en.xml",
]


def submit(urls: list[str], dry_run: bool = False) -> int:
    payload = {
        "host": INDEXNOW_HOST,
        "key": INDEXNOW_KEY,
        "keyLocation": INDEXNOW_KEY_LOCATION,
        "urlList": urls,
    }
    body = json.dumps(payload).encode("utf-8")

    if dry_run:
        print("[dry-run] Would POST to", INDEXNOW_API)
        print(json.dumps(payload, indent=2))
        return 0

    req = urllib.request.Request(
        INDEXNOW_API,
        data=body,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"IndexNow status: {resp.status} {resp.reason}")
            text = resp.read().decode("utf-8", errors="replace").strip()
            if text:
                print(text)
        return 0
    except urllib.error.HTTPError as e:  # 4xx/5xx
        print(f"IndexNow HTTP {e.code}: {e.reason}", file=sys.stderr)
        try:
            print(e.read().decode("utf-8", errors="replace"), file=sys.stderr)
        except Exception:  # noqa: BLE001
            pass
        return 1
    except urllib.error.URLError as e:
        print(f"IndexNow URL error: {e.reason}", file=sys.stderr)
        return 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--file",
        help="Read newline-delimited URLs from this file instead of using DEFAULT_URLS",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.file:
        urls = [
            line.strip()
            for line in Path(args.file).read_text(encoding="utf-8").splitlines()
            if line.strip() and line.strip().startswith("http")
        ]
    else:
        urls = DEFAULT_URLS

    if not urls:
        print("No URLs to submit", file=sys.stderr)
        return 1

    return submit(urls, dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
