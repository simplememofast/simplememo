#!/usr/bin/env python3
"""Split substantive JA/EN dual-DOM pages into real /en/ pages.

A page qualifies only when:
- root <html lang="ja">
- it contains data-lang="en"
- EN-visible text is >= MIN_EN_CHARS

This deliberately excludes pages whose only English is navigation or a
"This article is currently only available in Japanese" fallback.
"""
from __future__ import annotations
import argparse
import re
from pathlib import Path
from bs4 import BeautifulSoup
from extract_en_page import main as extract_en
from strip_dual_dom import process as strip_ja

ROOT = Path(__file__).resolve().parent.parent
MIN_EN_CHARS = 1500
LOCALE_PREFIXES = ("en/", "zh/", "zh-Hant/", "ko/", "es/", "pt-BR/", "id/", "ar/", "tr/")


def url_for(rel: str, en: bool = False) -> str:
    if rel == "index.html":
        base = "/"
    elif rel.endswith("/index.html"):
        base = "/" + rel[:-len("index.html")]
    elif rel.endswith(".html"):
        base = "/" + rel[:-len(".html")]
    else:
        raise ValueError(rel)
    if not en:
        return base
    return "/en/" if base == "/" else "/en" + base


def en_rel_for(rel: str) -> str:
    return "en/" + rel


def discover() -> list[tuple[str, int]]:
    out = []
    for p in ROOT.rglob("*.html"):
        rel = p.relative_to(ROOT).as_posix()
        if rel.startswith(LOCALE_PREFIXES):
            continue
        text = p.read_text(encoding="utf-8", errors="ignore")
        if 'data-lang="en"' not in text:
            continue
        soup = BeautifulSoup(text, "html.parser")
        if not soup.html or soup.html.get("lang") != "ja":
            continue
        en_text = " ".join(n.get_text(" ", strip=True) for n in soup.find_all(attrs={"data-lang": "en"}))
        if len(en_text) >= MIN_EN_CHARS:
            out.append((rel, len(en_text)))
    return sorted(out)


def register_pairs(pairs: list[tuple[str, str]]) -> None:
    path = ROOT / "scripts/i18n_config.py"
    text = path.read_text(encoding="utf-8")
    existing = set(re.findall(r'\("([^"]+)",\s*"([^"]+)"\)', text))
    missing = [p for p in pairs if p not in existing]
    if not missing:
        return
    marker = "]\n# x-default for ja-en pairs"
    idx = text.find(marker)
    if idx < 0:
        raise RuntimeError("JA_EN_PAIRS closing marker not found")
    addition = "".join(f'    ("{ja}", "{en}"),\n' for ja, en in missing)
    text = text[:idx] + addition + text[idx:]
    path.write_text(text, encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    rows = discover()
    print(f"substantive_dual_dom={len(rows)} min_en_chars={MIN_EN_CHARS}")
    if not args.apply:
        for rel, chars in rows:
            print(f"{rel}\t{chars}\t{en_rel_for(rel)}")
        return 0

    pairs = []
    created = 0
    reused = 0
    for rel, chars in rows:
        en_rel = en_rel_for(rel)
        en_path = ROOT / en_rel
        ja_url, en_url = url_for(rel), url_for(rel, True)
        if en_path.exists():
            reused += 1
        else:
            extract_en(rel, en_rel)
            created += 1
        strip_ja(rel, ja_url, en_url)
        pairs.append((ja_url, en_url))
    register_pairs(pairs)
    print(f"created_en={created} reused_en={reused} stripped_ja={len(rows)} registered_pairs={len(pairs)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
