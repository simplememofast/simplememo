#!/usr/bin/env python3
"""Normalize repeated slashes in simplememofast.com URLs on EN pages."""
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
import re
ROOT=Path(__file__).resolve().parent.parent
URL=re.compile(r'https://simplememofast\.com/[^"\'<>\s]*')

def norm(raw:str)->str:
    u=urlsplit(raw)
    path=re.sub(r'/+','/',u.path)
    return urlunsplit((u.scheme,u.netloc,path,u.query,u.fragment))

changed=0
for p in (ROOT/'en').rglob('*.html'):
    s=p.read_text(encoding='utf-8')
    out=URL.sub(lambda m:norm(m.group(0)),s)
    if out!=s:
        p.write_text(out,encoding='utf-8'); changed+=1
print(f'normalized_en_url_files={changed}')
