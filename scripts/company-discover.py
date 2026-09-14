#!/usr/bin/env python3
"""Refresh private operating metadata using existing read-only access.

No scheduler mutation, raw transcripts, shell history, secrets or email bodies.
Incomplete sources retain their previous receipt and get a separate failure.
"""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import plistlib
import re
import sqlite3
import subprocess
_spec = importlib.util.spec_from_file_location('company_inventory', Path(__file__).with_name('company-inventory.py'))
_inventory = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_inventory)
private_root, save, build, DEFAULT_STATE, ROOT = (_inventory.private_root, _inventory.save, _inventory.build, _inventory.DEFAULT_STATE, _inventory.ROOT)


def run(args, cwd=None, timeout=45):
    return subprocess.check_output(args, cwd=cwd, timeout=timeout, stderr=subprocess.PIPE).decode()


def local_codex():
    home = Path.home() / '.codex'
    with sqlite3.connect('file:' + str(home / 'sqlite/codex-dev.db') + '?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        scheduler = [dict(r) for r in db.execute('SELECT id,name,status,kind,rrule,last_run_at,next_run_at,target_thread_id,model,reasoning_effort,execution_environment,project_id FROM automations')]
        runs = [dict(r) for r in db.execute('SELECT thread_id,automation_id,status,created_at,updated_at,archived_reason FROM automation_runs')]
    # The scheduler DB is the execution authority. Config existence is separate;
    # do not infer an enabled job from a leftover TOML file or parse its prompt.
    configs = {p.parent.name: {'path': str(p), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
               for p in sorted((home / 'automations').glob('*/automation.toml'))}
    automations = [dict(a, config=configs.get(a['id'])) for a in scheduler]
    orphaned = [dict(id=i, **v) for i,v in configs.items() if i not in {a['id'] for a in scheduler}]
    return dict(automations=automations, scheduler=scheduler, runs=runs, orphaned_configs=orphaned)


def claude_local():
    base = Path.home() / 'Library/Application Support/Claude'
    tasks = []
    for parent in ['local-agent-mode-sessions', 'claude-code-sessions']:
        for p in sorted((base / parent).glob('*/*/scheduled-tasks.json')):
            d = json.loads(p.read_text())
            rows = d if isinstance(d, list) else d['scheduledTasks']
            if isinstance(rows, dict):
                rows = [dict(v, id=k) for k, v in rows.items()]
            for row in rows:
                fields = ['id', 'cronExpression', 'fireAt', 'enabled', 'lastRunAt', 'filePath']
                tasks.append(dict({k: row.get(k) for k in fields}, store=str(p)))
    assets = []
    for p in sorted((Path.home() / 'Documents/Claude/Scheduled').glob('*/SKILL.md')):
        assets.append(dict(path=str(p), name=p.parent.name, sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
    return dict(tasks=tasks, skill_assets=assets)


def local_jobs():
    jobs = []
    for p in sorted((Path.home() / 'Library/LaunchAgents').glob('*.plist')):
        d = plistlib.loads(p.read_bytes())
        if not re.search(r'simplememo|obsidian', json.dumps(d), re.I):
            continue
        try:
            output = run(['launchctl', 'print', f'gui/{os.getuid()}/' + d['Label']])
            evidence = [s.strip() for s in output.splitlines() if re.search(r'^\s*(state|runs|last exit code|run interval) =', s)]
            loaded = True
        except subprocess.CalledProcessError:
            loaded, evidence = False, []
        fields = ['Label', 'ProgramArguments', 'StartInterval', 'StartCalendarInterval', 'RunAtLoad', 'StandardOutPath', 'StandardErrorPath']
        jobs.append(dict({k: d.get(k) for k in fields}, loaded=loaded, runtime_evidence=evidence))
    try:
        cron = run(['crontab', '-l'])
        cron_state = dict(state='observed', related_lines=sum(bool(re.search(r'simplememo|obsidian', s, re.I)) for s in cron.splitlines()))
    except subprocess.CalledProcessError:
        cron_state = dict(state='no_user_crontab')
    return dict(jobs=jobs, cron=cron_state)


def github():
    workflows = []
    for name in ['simplememo', 'simplememo-api', 'simplememo-ios']:
        repo = ROOT if name == 'simplememo' else Path.home() / name
        run(['git', 'fetch', 'origin', 'main'], cwd=repo)
        sha = run(['git', 'rev-parse', 'origin/main'], cwd=repo).strip()
        remote = 'simplememofast/' + name
        defs = json.loads(run(['gh', 'api', f'repos/{remote}/actions/workflows?per_page=100']))
        if defs['total_count'] > 100:
            raise ValueError('Workflow inventory pagination requires continuation')
        history = json.loads(run(['gh', 'api', f'repos/{remote}/actions/runs?per_page=100']))['workflow_runs']
        for w in defs['workflows']:
            try:
                body = run(['git', 'show', sha + ':' + w['path']], cwd=repo)
            except subprocess.CalledProcessError:
                body = ''
            cron = re.findall(r'^\s*-\s*cron:\s*[\'\"]([^\'\"]+)', body, re.M)
            triggers = re.findall(r'^  (schedule|workflow_dispatch|push|pull_request|workflow_run|repository_dispatch):', body, re.M)
            latest = [r for r in history if r['workflow_id'] == w['id']][:5]
            fields = ['id', 'created_at', 'updated_at', 'status', 'conclusion', 'event', 'head_sha', 'html_url']
            workflows.append(dict(repo=name, sha=sha, **{k:w[k] for k in ['id', 'name', 'path', 'state']},
                definition_present=bool(body), cron=cron, trigger_types=triggers,
                code_paths=sorted(set(re.findall(r'(?:scripts|growth/scripts)/[A-Za-z0-9_./-]+\.(?:mjs|js|py|sh)', body))),
                source_sha256=hashlib.sha256(body.encode()).hexdigest(),
                observed_runs=[{k:r.get(k) for k in fields} for r in latest], run_read_complete=False,
                history_scope='at most five matching runs from latest 100 repository runs; older executions not queried'))
    return dict(workflows=workflows)


def cloud_routines():
    # The existing normalizer deliberately discards prompts/session context.
    script = """import {execFileSync} from 'node:child_process';
import {collect} from './scripts/routine-observer.mjs';
const credential=JSON.parse(execFileSync('security',['find-generic-password','-s','Claude Code-credentials','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const d=await collect({token:credential.claudeAiOauth?.accessToken});
process.stdout.write(JSON.stringify(d));"""
    return json.loads(run(['node', '--input-type=module', '-e', script], cwd=ROOT, timeout=90))


CLOUDFLARE_HEALTH_SQL = """WITH recent AS (
SELECT *, ROW_NUMBER() OVER (PARTITION BY job_name,cron_expression ORDER BY started_at DESC,id DESC) AS newest
FROM cron_run_log WHERE started_at >= (unixepoch()-2592000)*1000
)
SELECT job_name,cron_expression,COUNT(*) AS runs,MAX(started_at) AS last_run,
MAX(CASE WHEN COALESCE(errors,0)=0 AND last_error IS NULL THEN finished_at END) AS last_no_error,
MAX(CASE WHEN errors>0 OR last_error IS NOT NULL THEN finished_at END) AS last_failure,
SUM(CASE WHEN errors>0 OR last_error IS NOT NULL THEN 1 ELSE 0 END) AS failures,
SUM(CASE WHEN sent>0 THEN 1 ELSE 0 END) AS runs_with_output,
MAX(CASE WHEN newest=1 THEN finished_at END) AS latest_finished,
MAX(CASE WHEN newest=1 THEN errors END) AS latest_errors,
MAX(CASE WHEN newest=1 THEN CASE WHEN last_error IS NULL THEN 0 ELSE 1 END END) AS latest_thrown,
MAX(CASE WHEN newest=1 THEN eligible END) AS latest_eligible,
MAX(CASE WHEN newest=1 THEN sent END) AS latest_sent,
MAX(CASE WHEN newest=1 THEN reason END) AS latest_reason
FROM recent GROUP BY job_name,cron_expression"""


def cloudflare_health():
    runbook = Path.home() / '.config/cloudflare/simplememo/RUNBOOK.md'
    if not runbook.is_file():
        raise ValueError('Read the existing Cloudflare runbook before diagnosis')
    return json.loads(run([str(Path.home()/'.local/bin/simplememo-cf'),'observe','npx','wrangler@4.129.0','d1','execute','simplememo_reminders','--remote','--command',CLOUDFLARE_HEALTH_SQL,'--json'], cwd=Path.home()/'simplememo-api',timeout=90))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state-root', type=Path, default=DEFAULT_STATE)
    parser.add_argument('--remote', action='store_true', help='Weekly: GitHub definitions/history and existing Claude read-only observer')
    parser.add_argument('--cloudflare', action='store_true', help='Bounded read-only D1 cron health; read the existing Cloudflare runbook first')
    args = parser.parse_args()
    state = private_root(args.state_root)
    discovery = private_root(state / 'discovery')
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    failures = []
    sources = [('codex.json', local_codex), ('claude-local.json', claude_local), ('launchd.json', local_jobs)]
    if args.remote:
        sources += [('github.json', github), ('claude-cloud.json', cloud_routines)]
    archive = private_root(state / 'history')
    previous = state / 'automation-registry.json'
    if previous.exists():
        old = json.loads(previous.read_text())
        save(archive / ('registry-' + now.replace(':','-') + '.json'), old)
    for name, collect in sources:
        try:
            value = collect()
            value.setdefault('observed_at', now)
            save(discovery / name, value)
        except Exception:
            failures.append(dict(source=name, state='refresh_failed', previous_receipt_retained=True))
    if args.cloudflare:
        try:
            save(discovery/'cloudflare-cron-health.json', cloudflare_health())
            save(discovery/'cloudflare-cron-health-meta.json', dict(observed_at=dt.datetime.now(dt.timezone.utc).isoformat(),
                profile='observe', method='fixed aggregate SELECT', scope_days=30, current_run_evidence_version=1,
                raw_sha256=hashlib.sha256((discovery/'cloudflare-cron-health.json').read_bytes()).hexdigest()))
        except Exception:
            failures.append(dict(source='cloudflare-cron-health.json',state='refresh_failed',previous_receipt_retained=True))
    save(discovery / 'refresh.json', dict(observed_at=now, failures=failures))
    registry = build(discovery)
    save(state / 'automation-registry.json', registry)
    print(json.dumps(dict(jobs=len(registry['jobs']), failures=failures, remote_requested=args.remote)))


if __name__ == '__main__':
    main()
