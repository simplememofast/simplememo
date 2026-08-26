"""**引数由来の「無いかもしれない」ガード**を数える。

台帳由来の束縛だけを追う走査は、これを2度取り逃した:

  #636  policyDrift(policy, series)  の `declared === undefined` で return []
  #639  validateApprovals(_, {monthlyCap}) の `monthlyCap !== null &&`

どちらも呼ぶ側が台帳から読んだ値を渡している。引数まで汚染を広げると
ほぼ全部に付くので、**形のほうで絞る** —— 関数の仮引数に対する
「無い/null かどうか」の判定だけを見る。
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jsmask import mask

ROOT = os.environ.get('REPO_ROOT', '/home/user/simplememo')
FN = re.compile(r'function\s+[A-Za-z_$][\w$]*\s*\(([^)]*)\)|\(([^)]*)\)\s*=>')
GUARD = re.compile(r'(?<![\w$.])([A-Za-z_$][\w$]*)\s*(?:!==?|===?)\s*(?:null|undefined)')

def params_of(sig):
    out = set()
    depth = 0
    cur = ''
    for ch in sig + ',':
        if ch in '{[(': depth += 1
        elif ch in '}])': depth -= 1
        if ch == ',' and depth == 0:
            m = re.match(r'\s*([A-Za-z_$][\w$]*)', cur)
            if m: out.add(m.group(1))
            for m2 in re.finditer(r'([A-Za-z_$][\w$]*)\s*=', cur):
                out.add(m2.group(1))
            cur = ''
        else:
            cur += ch
    return out

rows = []
for d in ('scripts', 'growth/scripts', 'scripts/lib', 'growth/lib'):
    p = os.path.join(ROOT, d)
    if not os.path.isdir(p): continue
    for f in sorted(os.listdir(p)):
        if not f.endswith('.mjs'): continue
        rel = f'{d}/{f}'
        src = open(os.path.join(ROOT, rel), encoding='utf-8').read()
        m = mask(src)
        lines = src.split('\n')
        params = set()
        for mo in FN.finditer(m):
            params |= params_of(mo.group(1) or mo.group(2) or '')
        for g in GUARD.finditer(m):
            if g.group(1) in params:
                ln = m.count('\n', 0, g.start()) + 1
                rows.append((rel, ln, lines[ln-1].strip()[:96]))

seen = set(); uniq = []
for r in rows:
    if (r[0], r[1]) in seen: continue
    seen.add((r[0], r[1])); uniq.append(r)
for rel, ln, txt in uniq:
    print(f'  {rel}:{ln}\n      {txt}')
print(f'\n候補 {len(uniq)} 件')
