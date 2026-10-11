#!/usr/bin/env python3
"""Install only this repository's missing Company skills; refuse foreign owners."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]
NAMES=['autonomy-status','autonomy-audit','autonomy-lift','growth-status','growth-audit','growth-autopilot','aio-audit','content-gap']


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--check',action='store_true')
    args=p.parse_args()
    target=Path.home()/'.codex/skills'
    receipts=[]
    for name in NAMES:
        source=ROOT/'.agents/skills'/name/'SKILL.md'
        body=source.read_text()
        if not body.startswith('---\nname: '+name+'\ndescription: ') or 'OPERATING_RUNBOOK.md' not in body:
            raise ValueError('Invalid skill entrypoint: '+name)
        dest=target/name
        marker=dest/'.simplememo-company-owner.json'
        if dest.exists() and (not marker.is_file() or json.loads(marker.read_text()).get('source')!='simplememofast/simplememo'):
            raise ValueError('Existing skill belongs to another source; integrate it before replacement: '+name)
        receipts.append({'name':name,'source':str(source),'installed':str(dest/'SKILL.md'),'sha256':hashlib.sha256(source.read_bytes()).hexdigest()})
    if not args.check:
        sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
        for r in receipts:
            dest=Path(r['installed']).parent;dest.mkdir(mode=0o700,parents=True,exist_ok=True)
            shutil.copyfile(r['source'],r['installed'])
            (dest/'.simplememo-company-owner.json').write_text(json.dumps({'source':'simplememofast/simplememo','commit':sha,'sha256':r['sha256']})+'\n')
    print(json.dumps({'mode':'check' if args.check else 'installed','skills':[r['name'] for r in receipts]}))


if __name__=='__main__': main()
