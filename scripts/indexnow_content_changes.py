#!/usr/bin/env python3
"""Pick the changed HTML files whose content changed, for IndexNow.

IndexNow asks sites to submit URLs whose content was added or updated. A
sitewide script, CSS or class change touches every .html file without changing
what a reader or a crawler gets: PR #2385 (2026-11-17) changed 2,470 .html files
(2,468 of them notifiable), sent 2,301 URLs and changed the content of none of
them. scripts/indexnow-notify.js
therefore asks this helper which of the changed files changed content.

"Content" is the sitemap lastmod's definition, imported rather than copied
(scripts/sitemap_lastmod.py, docs/seo/SITEMAP-LASTMOD.md): text, headings,
links, media, search metadata and JSON-LD count; CSS/JS references,
class/style, layout wrappers, copyright years, tracking-only link parameters
and JSON-LD dates do not.

  python3 scripts/indexnow_content_changes.py [--root DIR] < rows.json
      stdin   [{"path": ..., "before": <blob id>, "after": <blob id>}]
              (from `git diff --raw --no-abbrev`; a missing side is all zeros)
      stdout  [{"path": ..., "before": <signature or null>, "after": <signature>}]
              only the rows whose content changed, in input order. A new file
              (before all zeros) is always a change; a deleted file (after all
              zeros) never is. The signatures let the notifier compare what
              production serves with what was merged.
  python3 scripts/indexnow_content_changes.py --signature < page.html
  python3 scripts/indexnow_content_changes.py --selftest

Any problem (unreadable input, a blob missing from a shallow checkout, no git)
exits non-zero. The notifier then sends every changed file, as it did before
this helper existed: a failure here may cost precision, never a notification.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from sitemap_lastmod import BlobSignatures, content_signature  # noqa: E402

ROOT = HERE.parent
OBJECT_ID = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")


def is_zero(object_id: str) -> bool:
    return set(object_id) == {"0"}


def parse_rows(value) -> list[dict]:
    """Refuse anything that is not exactly the documented input."""
    if not isinstance(value, list):
        raise ValueError("input must be a JSON list of {path, before, after}")
    rows = []
    for item in value:
        if not isinstance(item, dict) or not isinstance(item.get("path"), str) or not item["path"]:
            raise ValueError("every row needs a path")
        for side in ("before", "after"):
            if not isinstance(item.get(side), str) or not OBJECT_ID.match(item[side]):
                raise ValueError(f"{item['path']}: {side} is not a full git object id")
        rows.append({"path": item["path"], "before": item["before"], "after": item["after"]})
    return rows


def content_changes(rows: list[dict], root: Path) -> list[dict]:
    blobs = BlobSignatures(root)
    try:
        changed = []
        for row in rows:
            if is_zero(row["after"]):
                continue  # Deleted: there is no page to announce.
            after = blobs.get(row["after"])
            before = None if is_zero(row["before"]) else blobs.get(row["before"])
            if before is None or before != after:
                changed.append({"path": row["path"], "before": before, "after": after})
        return changed
    finally:
        blobs.close()


def main(argv: list[str]) -> int:
    if "--selftest" in argv:
        return selftest()
    if "--signature" in argv:
        html = sys.stdin.buffer.read().decode("utf-8", errors="replace")
        print(content_signature(html))
        return 0
    root = ROOT
    if "--root" in argv:
        root = Path(argv[argv.index("--root") + 1])
    rows = parse_rows(json.load(sys.stdin))
    json.dump(content_changes(rows, root), sys.stdout, ensure_ascii=False)
    print()
    return 0


def selftest() -> int:
    """Literal pages through real git blobs: the same path the notifier takes."""
    # A GIT_DIR inherited from a hook would point these temporary repositories
    # (and the blob reader) at the real one.
    for key in [k for k in os.environ if k.startswith("GIT_")]:
        del os.environ[key]
    failures: list[str] = []
    total = 0

    def t(name: str, cond: bool) -> None:
        nonlocal total
        total += 1
        if not cond:
            failures.append(name)

    page = ('<html><head><title>Capture</title><link rel="stylesheet" href="/a.css?v=1">'
            '<script src="/js/app.js?v=1"></script></head><body class="home"><h1>Capture</h1>'
            '<p>Write it down.</p><a href="/guide/">Guide</a></body></html>')
    script_only = (page.replace("/js/app.js?v=1", "/js/app.js?v=2").replace("/a.css?v=1", "/a.css?v=2")
                   .replace('class="home"', 'class="home wide"')
                   .replace("</body>", '<script>window.dataLayer = [];</script></body>'))
    text_edit = page.replace("Write it down.", "Write it down, then send it.")
    t("script・CSS・class だけの変更は署名が変わらない", content_signature(page) == content_signature(script_only))
    t("本文の変更は署名が変わる", content_signature(page) != content_signature(text_edit))

    zero = "0" * 40
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        subprocess.run(["git", "-c", "init.defaultBranch=main", "init", "-q"], cwd=root,
                       check=True, capture_output=True)

        def blob(text: str) -> str:
            return subprocess.run(["git", "hash-object", "-w", "--stdin"], cwd=root, input=text.encode(),
                                  capture_output=True, check=True).stdout.decode().strip()

        a, b, c = blob(page), blob(script_only), blob(text_edit)
        rows = [
            {"path": "script-only.html", "before": a, "after": b},
            {"path": "text.html", "before": a, "after": c},
            {"path": "new.html", "before": zero, "after": c},
            {"path": "deleted.html", "before": a, "after": zero},
            {"path": "mode-only.html", "before": a, "after": a},
        ]
        got = content_changes(rows, root)
        paths = [r["path"] for r in got]
        t("script・class だけの変更は通知しない", "script-only.html" not in paths)
        t("本文の変更は通知する", "text.html" in paths)
        t("新しいファイルは通知する（before は null）",
          any(r["path"] == "new.html" and r["before"] is None for r in got))
        t("消えたファイルは通知しない", "deleted.html" not in paths)
        t("blob が同じ（mode だけの変更）なら通知しない", "mode-only.html" not in paths)
        t("入力の順序を保つ", paths == ["text.html", "new.html"])
        t("返す署名は sitemap の lastmod と同じもの（本番の配信と比べられる）",
          all(r["after"] == content_signature(text_edit) for r in got)
          and next(r for r in got if r["path"] == "text.html")["before"] == content_signature(page))
        try:
            content_changes([{"path": "x.html", "before": "f" * 40, "after": c}], root)
            missing = False
        except ValueError:
            missing = True
        t("履歴に無い blob（浅い checkout）は黙って通さず止まる", missing)

        cli = [sys.executable, str(Path(__file__).resolve())]
        run = subprocess.run(cli + ["--root", tmp], input=json.dumps(rows), capture_output=True, text=True)
        t("CLI は変わった行だけを JSON で返す",
          run.returncode == 0 and [r["path"] for r in json.loads(run.stdout or "[]")] == ["text.html", "new.html"])
        for bad in ['{"not": "a list"}', json.dumps([{"path": "x.html", "before": "abc", "after": c}]), "not json"]:
            refused = subprocess.run(cli + ["--root", tmp], input=bad, capture_output=True, text=True)
            t(f"読めない入力は非0で終わる（通知側は全件の通知に戻る）: {bad[:20]}", refused.returncode != 0)
        signed = subprocess.run(cli + ["--signature"], input=text_edit, capture_output=True, text=True)
        t("--signature は sitemap の lastmod と同じ署名を返す",
          signed.returncode == 0 and signed.stdout.strip() == content_signature(text_edit))

    for name in failures:
        print(f"  ✗ {name}", file=sys.stderr)
    print(f"indexnow_content_changes 自己テスト {total} 件中 {len(failures)} 件失敗")
    return 1 if failures else 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception as error:  # The notifier falls back to sending every changed file.
        print(f"indexnow_content_changes: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
