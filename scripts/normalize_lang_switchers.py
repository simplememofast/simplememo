#!/usr/bin/env python3
"""Make JA/EN language switchers real links on split pages.

The legacy dual-DOM switcher used JS buttons. Once pages are split, both the JA
and EN pages must have crawlable links and must not depend on lang.js.
"""
from __future__ import annotations
import re
from pathlib import Path
from i18n_config import JA_EN_PAIRS

ROOT=Path(__file__).resolve().parent.parent
PAT=re.compile(r'(<(?:div|nav)\b[^>]*class="[^"]*\blang-switcher\b[^"]*"[^>]*>)(.*?)(</(?:div|nav)>)',re.S)

def file_for(url:str)->Path|None:
    rel=url.lstrip('/')
    if url.endswith('/'):
        p=ROOT/(rel+'index.html') if rel else ROOT/'index.html'
        return p if p.exists() else None
    for p in (ROOT/(rel+'.html'),ROOT/rel/'index.html'):
        if p.exists(): return p
    return None

def anchors(ja:str,en:str,current:str)->str:
    ja_cls='lang-switcher__btn active' if current=='ja' else 'lang-switcher__btn'
    en_cls='lang-switcher__btn active' if current=='en' else 'lang-switcher__btn'
    ja_cur=' aria-current="page"' if current=='ja' else ''
    en_cur=' aria-current="page"' if current=='en' else ''
    return (
      f'<a class="{ja_cls}" href="{ja}" hreflang="ja" aria-label="日本語"{ja_cur} style="text-decoration:none">JA</a>'
      f'<a class="{en_cls}" href="{en}" hreflang="en" aria-label="Switch to English"{en_cur} style="text-decoration:none">EN</a>'
    )

def update(path:Path,ja:str,en:str,current:str)->bool:
    s=path.read_text(encoding='utf-8')
    repl=lambda m:m.group(1)+anchors(ja,en,current)+m.group(3)
    out,n=PAT.subn(repl,s)
    if n and out!=s:
        path.write_text(out,encoding='utf-8'); return True
    return False

changed=0
for ja,en in JA_EN_PAIRS:
    jf,ef=file_for(ja),file_for(en)
    if jf: changed+=update(jf,ja,en,'ja')
    if ef: changed+=update(ef,ja,en,'en')
print(f'normalized_switcher_files={changed}')
