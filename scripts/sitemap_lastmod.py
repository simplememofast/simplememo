"""Trace static HTML content changes, including large commits, through Git.

The signature covers text, headings, links, media references, search metadata
and JSON-LD. CSS/JS references, classes, layout wrappers and copyright years
are excluded. This is a reproducible source-history signal, not a claim about
Google's crawl time or about the contents of an unchanged external asset URL.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

JST = timezone(timedelta(hours=9))
ZERO = "0" * 40


def link_destination(value: str) -> str:
    """Ignore attribution-only changes; preserve CPP IDs and functional queries."""
    try:
        parts = urlsplit(value)
        tracking = {"gclid", "fbclid"}
        if parts.hostname == "apps.apple.com":
            tracking |= {"pt", "ct"}
        query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
                 if k.lower() not in tracking and not k.lower().startswith("utm_")]
        return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
    except ValueError:
        return value


def normalized_text(value: str) -> str:
    value = re.sub(r"(©|copyright\s*)\s*\d{4}(?:\s*[-–—]\s*\d{4})?", r"\1", value, flags=re.I)
    return re.sub(r"\s+", " ", value).strip()


def schema_content(value):
    if isinstance(value, dict):
        return {k: schema_content(v) for k, v in value.items()
                if k not in {"dateModified", "datePublished", "copyrightYear"}}
    if isinstance(value, list):
        return [schema_content(v) for v in value]
    return value


class ContentParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text = []
        self.metadata = []
        self.links = []
        self.media = []
        self.structure = []
        self.schemas = []
        self.ignored = None
        self.script_type = None
        self.script_text = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if self.ignored:
            return
        if tag in {"style", "script"}:
            self.ignored = tag
            self.script_type = attrs.get("type", "").lower()
            self.script_text = []
        elif tag == "meta":
            name = attrs.get("name", attrs.get("property", "")).lower()
            if name in {"description", "robots", "googlebot", "og:title", "og:description", "og:image", "og:url", "twitter:title", "twitter:description", "twitter:image"}:
                self.metadata.append((name, attrs.get("content", "")))
        elif tag == "link" and attrs.get("rel", "").lower() in {"canonical", "alternate"}:
            self.metadata.append((attrs.get("rel"), attrs.get("hreflang", ""), attrs.get("href", "")))
        elif tag in {"a", "area"} and "href" in attrs:
            self.links.append(link_destination(attrs["href"]))
        elif tag in {"img", "video", "audio", "source", "iframe"}:
            self.media.append((tag, [(k, attrs[k]) for k in ("src", "srcset", "poster", "alt", "title") if k in attrs]))
        if tag in {"title", "h1", "h2", "h3", "h4", "h5", "h6"}:
            self.structure.append(tag)

    def handle_endtag(self, tag):
        if tag == self.ignored:
            if tag == "script" and self.script_type == "application/ld+json":
                raw = "".join(self.script_text)
                try:
                    self.schemas.append(schema_content(json.loads(raw)))
                except ValueError:
                    # A malformed schema must change the signature, not vanish.
                    self.schemas.append({"invalid_json_ld": raw})
            self.ignored = None
        elif not self.ignored and tag in {"title", "h1", "h2", "h3", "h4", "h5", "h6"}:
            self.structure.append("/" + tag)

    def handle_data(self, data):
        if self.ignored == "script":
            self.script_text.append(data)
        elif not self.ignored:
            self.text.append(data)

    def content(self):
        return {"text": normalized_text(" ".join(self.text)),
                "metadata": sorted(self.metadata), "links": self.links,
                "media": self.media, "headings": self.structure,
                "schemas": sorted(self.schemas, key=lambda x: json.dumps(x, sort_keys=True, ensure_ascii=False))}


def content_signature(html: str) -> str:
    parser = ContentParser()
    parser.feed(html)
    raw = json.dumps(parser.content(), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()


def git(root: Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, check=True).stdout


class BlobSignatures:
    def __init__(self, root: Path):
        self.process = subprocess.Popen(["git", "cat-file", "--batch"], cwd=root,
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        self.cache = {}

    def get(self, oid: str) -> str | None:
        if oid == ZERO:
            return None
        if oid not in self.cache:
            self.process.stdin.write((oid + "\n").encode())
            self.process.stdin.flush()
            header = self.process.stdout.readline().decode().split()
            if len(header) != 3 or header[1] != "blob":
                raise ValueError("Missing HTML blob in Git history")
            data = self.process.stdout.read(int(header[2]))
            if self.process.stdout.read(1) != b"\n":
                raise ValueError("Invalid Git blob response")
            self.cache[oid] = content_signature(data.decode("utf-8", errors="replace"))
        return self.cache[oid]

    def close(self):
        self.process.stdin.close()
        self.process.stdout.close()
        self.process.wait()


def content_lastmods(root: Path, files: list[Path], today: str | None = None) -> dict[str, dict]:
    """Return source date + commit/blob provenance for each current HTML file.

    First-parent diffs include squash and ordinary merges, irrespective of the
    number of files. Missing history never falls back to today's date. A new
    or materially edited working file is explicitly marked as unpublished.
    """
    today = today or datetime.now(JST).date().isoformat()
    if git(root, "rev-parse", "--is-shallow-repository").strip() == "true":
        raise ValueError("Full Git history required; fetch full history before generating sitemaps")
    current = {p.relative_to(root).as_posix(): content_signature(p.read_text(encoding="utf-8")) for p in files}
    records = {}
    pending = set(current)
    out = git(root, "-c", "core.quotepath=false", "log", "--first-parent", "--diff-merges=first-parent", "--root", "--raw", "--no-renames", "--no-abbrev",
              "--format=%x1e%H%x09%ct", "--", "*.html")
    blobs = BlobSignatures(root)
    seen = set()
    try:
        for chunk in out.split("\x1e"):
            lines = chunk.strip().splitlines()
            if not lines:
                continue
            commit, epoch = lines[0].split("\t")
            day = datetime.fromtimestamp(int(epoch), JST).date().isoformat()
            for line in lines[1:]:
                if not line.startswith(":"):
                    continue
                spec, name = line.split("\t", 1)
                if name not in pending:
                    continue
                _, _, before, after, _ = spec.split()
                if name not in seen:
                    seen.add(name)
                    if after == ZERO or blobs.get(after) != current[name]:
                        records[name] = {"date": today, "basis": "unpublished_content", "commit": None,
                                         "signature": current[name]}
                        pending.remove(name)
                        continue
                if blobs.get(before) != blobs.get(after):
                    records[name] = {"date": day, "basis": "git_content_change", "commit": commit,
                                     "before_blob": before, "after_blob": after, "signature": current[name]}
                    pending.remove(name)
            if not pending:
                break
        # A file with no history is new, not an old page to stamp on every run.
        tracked = set(git(root, "ls-tree", "-r", "--name-only", "-z", "HEAD").split("\0"))
        if pending & tracked:
            raise ValueError("Tracked HTML has no traceable content history; do not invent its lastmod")
        for name in pending:
            records[name] = {"date": today, "basis": "unpublished_content", "commit": None,
                             "signature": current[name]}
    finally:
        blobs.close()
    return records
