"""「空でも緑」のうち、**出力が1文字も変わらない**ものを選り分ける。

空で緑になること自体は欠陥ではない —— 欠測を報告のみにする設計は正しいことがある。
だが**出力が実データのときと同じ**なら、読む側は「見て何も無かった」のか
「見ていない」のかを区別できない。そこが本物の穴。

出力に件数などの差が出るなら、少なくとも見えている。
"""
import json, os, re, subprocess, difflib

ROOT = '/home/user/simplememo'
SCRATCH = '/tmp/claude-0/-home-user/5cd0a29f-4e76-59db-ad01-7ecaf869dbfb/scratchpad'
STEPS = json.load(open(f'{SCRATCH}/ci-steps.json', encoding='utf-8'))

PAIRS = []
for line in open(f'{SCRATCH}/final.out', encoding='utf-8'):
    m = re.search(r'\*\*空でも緑\*\*\s+(\S+)\s+←\s+(\S+)', line)
    if m:
        PAIRS.append((m.group(1), m.group(2)))

ARGS = {}
for st in STEPS:
    if st['if']:
        continue
    for m in re.finditer(r'^\s*node (\S+\.mjs)([^\n|&;]*)', st['run'], re.M):
        ARGS.setdefault(m.group(1), [a for a in m.group(2).strip().split() if a])


def out_of(script, args):
    r = subprocess.run(['node', script] + args, cwd=ROOT,
                       capture_output=True, text=True, timeout=300)
    return r.stdout + r.stderr


silent, visible = [], []
seen = set()
for script, led in PAIRS:
    if (script, led) in seen:
        continue
    seen.add((script, led))
    abs_l = os.path.join(ROOT, led)
    if not os.path.exists(abs_l):
        continue
    args = ARGS.get(script, [])
    base = out_of(script, args)
    orig = open(abs_l, encoding='utf-8').read()
    empty = '[]\n' if orig.lstrip().startswith('[') else '{}\n'
    try:
        open(abs_l, 'w', encoding='utf-8').write(empty)
        after = out_of(script, args)
    finally:
        open(abs_l, 'w', encoding='utf-8').write(orig)
    if base == after:
        silent.append((script, led))
    else:
        d = [l for l in difflib.unified_diff(base.split('\n'), after.split('\n'), lineterm='', n=0)
             if l.startswith(('+', '-')) and not l.startswith(('+++', '---'))]
        visible.append((script, led, len(d), d[:2]))

print('═══ 出力が1文字も変わらない（**見ていないことが見えない**） ═══')
for s, l in sorted(silent):
    print(f'  {s}  ← {l}')
print(f'\n  {len(silent)} 件\n')
print('═══ 出力に差が出る（少なくとも見えている） ═══')
for s, l, n, sample in sorted(visible):
    print(f'  {s}  ← {l}  （{n}行の差）')
    for x in sample:
        print(f'      {x[:100]}')
print(f'\n  {len(visible)} 件')
