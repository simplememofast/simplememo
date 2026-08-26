"""各検査が **実際に読んだ** 台帳を空にして、それでも緑を出すかを測る。

最初の版はソースに台詞として現れるファイル名で当てていて、コメントの言及まで
拾って 102 件を出した。**推測で作った検査は、推測の分だけ効かない。**
今度は fs を計装して、読んだものだけを対象にする。

空で緑＝必ず欠陥、ではない（欠測を報告のみにする設計は正しいことがある）。
これは**判定ではなく棚卸し**で、出た候補は1件ずつ読む。
"""
import json, os, re, subprocess

ROOT = '/home/user/simplememo'
SCRATCH = '/tmp/claude-0/-home-user/5cd0a29f-4e76-59db-ad01-7ecaf869dbfb/scratchpad'
STEPS = json.load(open(f'{SCRATCH}/ci-steps.json', encoding='utf-8'))

CMDS = []
for st in STEPS:
    if st['if']:
        continue
    for m in re.finditer(r'^\s*node (\S+\.mjs)([^\n|&;]*)', st['run'], re.M):
        args = [a for a in m.group(2).strip().split() if a]
        CMDS.append((m.group(1), args))
# 重複を除く
seen_cmd = set()
UNIQ = []
for s, a in CMDS:
    k = (s, tuple(a))
    if k in seen_cmd:
        continue
    seen_cmd.add(k)
    UNIQ.append((s, a))

LEDGER_RE = re.compile(r'^(data|growth/data|growth/experiments)/.*\.json$')


def run(script, args, trace=None):
    env = dict(os.environ)
    cmd = ['node']
    if trace:
        env['TRACE_OUT'] = trace
        env['TRACE_ROOT'] = ROOT
        cmd += ['--require', f'{SCRATCH}/trace.cjs']
    cmd += [script] + args
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=300, env=env)
    return r.returncode


rows = []
for script, args in UNIQ:
    if not os.path.exists(os.path.join(ROOT, script)):
        continue
    tf = f'{SCRATCH}/_trace.txt'
    if os.path.exists(tf):
        os.remove(tf)
    base_rc = run(script, args, trace=tf)
    if base_rc != 0:
        rows.append((script, None, 'SKIP 素で落ちている'))
        continue
    read = []
    if os.path.exists(tf):
        read = [l for l in open(tf, encoding='utf-8').read().split('\n') if LEDGER_RE.match(l)]
    if not read:
        rows.append((script, None, '台帳を読まない'))
        continue
    for led in read:
        abs_l = os.path.join(ROOT, led)
        if not os.path.exists(abs_l):
            continue
        orig = open(abs_l, encoding='utf-8').read()
        empty = '[]\n' if orig.lstrip().startswith('[') else '{}\n'
        try:
            open(abs_l, 'w', encoding='utf-8').write(empty)
            rc_empty = run(script, args)
            open(abs_l, 'w', encoding='utf-8').write('{ this is not json')
            rc_broken = run(script, args)
        finally:
            open(abs_l, 'w', encoding='utf-8').write(orig)
        if rc_broken == 0:
            rows.append((script, led, '**壊れていても緑**'))
        elif rc_empty == 0:
            rows.append((script, led, '**空でも緑**'))

for s, l, v in rows:
    if v.startswith('SKIP') or v == '台帳を読まない':
        print(f'  {v}: {s}')
print()
bad = [r for r in rows if r[2].startswith('**')]
for s, l, v in sorted(bad, key=lambda r: (r[2], r[0])):
    print(f'  {v}  {s}  ← {l}')
print(f'\n読んだ台帳を空／壊しても緑になる組み合わせ: {len(bad)} 件'
      f'（検査 {len({r[0] for r in bad})} 本）')
