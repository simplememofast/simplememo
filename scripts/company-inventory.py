#!/usr/bin/env python3
"""Normalize observed automation metadata without changing any scheduler.

Private discovery receipts are inputs, not executable instructions. The complete
machine registry stays outside this public repository. No credential is read by
this normalizer. Missing observations remain unknown, including success times.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STATE = Path.home() / '.config/simplememo/company-os'
SCHEMA = 1
REQUIRED = ['id', 'name', 'purpose', 'owner', 'runtime', 'schedule', 'timezone',
            'trigger', 'inputs', 'data_sources', 'outputs', 'destination', 'code_path',
            'last_successful_run', 'last_failure', 'health', 'retry_behavior',
            'human_intervention_required', 'estimated_cost', 'overlapping_jobs',
            'replacement_candidate', 'autonomy_contribution']


def read(path):
    return json.loads(path.read_text())


def iso(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return dt.datetime.fromtimestamp(value / 1000, dt.timezone.utc).isoformat()
    return value


def private_root(path):
    path = path.expanduser().absolute()
    if any((parent / '.git').exists() for parent in [path, *path.parents]):
        raise ValueError('Machine state must be outside Git checkouts')
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if any((parent / '.git').exists() for parent in [path.resolve(), *path.resolve().parents]):
        raise ValueError('Private state resolves into Git')
    if path.is_symlink() or path.stat().st_uid != os.getuid():
        raise ValueError('Private state directory has an unexpected owner or symlink')
    if path.stat().st_mode & 0o077:
        raise ValueError('Private state directory must have mode 0700')
    return path


def save(path, value):
    if path.is_symlink():
        raise ValueError('Refusing symlink output')
    temp = path.with_name(path.name + '.tmp-' + str(os.getpid()))
    with temp.open('x', encoding='utf-8') as f:
        os.chmod(temp, 0o600)
        f.write(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    os.replace(temp, path)


def record(ident, name, runtime, **fields):
    result = dict(id=ident, name=name, purpose=name, owner=runtime, runtime=runtime,
                  schedule=None, timezone=None, trigger=[], inputs=[], data_sources=[],
                  outputs=[], destination=None, code_path=[], last_successful_run=None,
                  last_failure=None, health={'state': 'unknown', 'business_success': 'not_inferred'},
                  retry_behavior='unknown; do not automatically retry side effects',
                  human_intervention_required='unknown',
                  estimated_cost={'usd': None, 'reason': 'not_observed'},
                  overlapping_jobs=[], replacement_candidate=None, autonomy_contribution=[],
                  scope='SimpleMemo', execution_state='unknown')
    result.update(fields)
    return result


def status(runs, enabled=True):
    if not enabled:
        return {'state': 'inactive', 'business_success': 'not_inferred'}
    if not runs:
        return {'state': 'unobserved', 'business_success': 'not_inferred'}
    last = sorted(runs, key=lambda r: r.get('created_at') or '')[-1]
    return {'state': last.get('conclusion') or last.get('status') or 'unknown',
            'last_observed_at': last.get('updated_at') or last.get('created_at'),
            'business_success': 'not_inferred'}


def browser_observation(receipt, now=None):
    """Scope a human-visible observation; never treat it as an evergreen API list."""
    now = now or dt.datetime.now(dt.timezone.utc)
    result = {'state': 'unverified', 'chatgpt_empty': False, 'gcp': {}}
    if (not isinstance(receipt, dict) or receipt.get('schema_version') != 1 or
            receipt.get('method') != 'authenticated_visible_browser_ui' or
            receipt.get('account_scope') != 'SimpleMemo' or receipt.get('identity_verified') is not True):
        return result
    try:
        observed = dt.datetime.fromisoformat(receipt['observed_at'].replace('Z', '+00:00'))
        age = (now - observed).total_seconds()
    except (KeyError, ValueError, TypeError, AttributeError):
        return result
    result['observed_at'] = receipt['observed_at']
    if age < 0 or age > 7 * 86400:
        result['state'] = 'stale_or_future'
        return result
    result['state'] = 'observed'
    tasks = receipt.get('chatgpt_tasks', {})
    tasks = tasks if isinstance(tasks, dict) else {}
    filters = tasks.get('filters', {})
    filters = filters if isinstance(filters, dict) else {}
    result['chatgpt_empty'] = tasks.get('url') == 'https://chatgpt.com/scheduled' and all(
        isinstance(filters.get(key), dict) and
        filters.get(key, {}).get('state') == 'observed' and
        type(filters.get(key, {}).get('visible_count')) is int and
        filters[key]['visible_count'] == 0 for key in ['active', 'paused', 'completed'])
    gcp = receipt.get('gcp', {})
    if isinstance(gcp, dict) and gcp.get('project') == 'yurika-simplememo':
        result['gcp'] = gcp
    return result


def documented_owner_matches(job, purpose):
    # Native IDs are reusable (for example a new one-time login reminder).
    # ID existence alone must not conceal a missing historical operating owner.
    schedule = job.get('schedule') or ''
    return (isinstance(schedule, str) and 'COUNT=1' not in schedule and
            'FREQ=' in schedule and 'heartbeat' in job.get('trigger', []) and
            bool(re.search(purpose, job.get('name', ''), re.I)))


def build(discovery, root=ROOT):
    jobs, surfaces = [], []
    coverage = read(root / 'data/automation-coverage.json')['tasks']

    def source(name, optional=False):
        path = discovery / name
        if not path.exists():
            surfaces.append({'id': name, 'state': 'unavailable', 'reason': 'no_receipt'})
            return {}
        try:
            d = read(path)
            if not isinstance(d, dict):
                raise ValueError('Receipt must be an object')
        except (OSError, ValueError):
            if not optional:
                raise
            surfaces.append({'id': name, 'state': 'unavailable', 'reason': 'invalid_or_unreadable_receipt'})
            return {}
        surfaces.append({'id': name, 'state': 'observed',
                         'observed_at': d.get('observed_at'),
                         'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
        return d

    for w in source('github.json').get('workflows', []):
        runs = w.get('observed_runs', [])
        success = [r for r in runs if r.get('conclusion') == 'success']
        failures = [r for r in runs if r.get('conclusion') in ['failure', 'timed_out', 'cancelled']]
        paths = [w['path'], *w.get('code_paths', [])]
        prefix = '' if w['repo'] == 'simplememo' else '../' + w['repo'] + '/'
        references = [prefix + p for p in paths]
        contribution = [i for i, task in enumerate(coverage)
                        if set(references) & set(task.get('evidence', []))]
        jobs.append(record('github:' + w['repo'] + ':' + str(w['id']), w['name'], 'GitHub Actions',
            owner=w['repo'] + '/' + w['path'], schedule=w['cron'], timezone='UTC',
            trigger=w['trigger_types'], inputs=['workflow inputs and existing repository variables'],
            data_sources=references, outputs=['Actions execution log and artifacts; workflow-specific outputs'],
            destination='https://github.com/simplememofast/' + w['repo'] + '/actions/workflows/' + Path(w['path']).name,
            code_path=references, source_sha=w['sha'],
            last_successful_run=max(success, key=lambda r: r['created_at']) if success else None,
            last_failure=max(failures, key=lambda r: r['created_at']) if failures else None,
            health=status(runs, w['state'] == 'active'),
            history_scope=w.get('history_scope', 'latest five observed executions; null does not mean never failed'),
            execution_state='scheduled' if w['cron'] else 'event_or_manual',
            autonomy_contribution=contribution))

    codex = source('codex.json')
    scheduler = {x['id']: x for x in codex.get('scheduler', [])}
    for x in codex.get('automations', []):
        live = scheduler.get(x['id'], {})
        jobs.append(record('codex:' + x['id'], x['name'], 'Codex', owner=x['id'],
            schedule=x.get('rrule'), timezone='Asia/Tokyo', trigger=[x.get('kind')],
            inputs=['native automation prompt', 'latest canonical repository instructions'],
            data_sources=['native scheduler and original session evidence'],
            code_path=['~/.codex/automations/' + x['id'] + '/automation.toml'],
            outputs=['native task and its verified business artifacts'], destination=x.get('target_thread_id') or x.get('target'),
            health={'state': 'registered' if live else 'scheduler_record_missing',
                    'business_success': 'not_inferred'}, execution_state=x.get('status'),
            last_triggered_at=iso(live.get('last_run_at')), next_run_at=iso(live.get('next_run_at')),
            model=x.get('model'),
            retry_behavior='Use existing owner, claim, stop and budget gates; no parallel replacement run'))

    cloud = source('claude-cloud.json')
    registered = {r['id'] for r in read(root / 'data/routine-runs.json')['routines']}
    for x in cloud.get('records', []):
        state = 'enabled' if x.get('enabled') else 'ended' if x.get('ended_reason') else 'disabled'
        related = x['id'] in registered or bool(re.search(
            r'simplememo|シンプルメモ|obsidian|captio|GSC|PR[⑥6]|SEO|BigQuery|Reddit', x.get('name', ''), re.I))
        last = {'at': x.get('last_run_finished_at'), 'session_id': x.get('last_run_session_id')}
        jobs.append(record('claude:' + x['id'], x['name'], 'Claude Code Routine', owner=x['id'],
            scope='SimpleMemo' if related else 'unclassified_private_inventory',
            schedule=x.get('cron_expression') or x.get('run_once_at'), timezone='UTC',
            trigger=['cron' if x.get('cron_expression') else 'once_or_unscheduled'],
            inputs=['existing bound Routine instructions'], data_sources=['Claude routines API metadata'],
            outputs=['Routine session output'], destination=x.get('last_run_session_id'),
            code_path=['data/routine-runs.json'] if x['id'] in registered else [],
            execution_state=state, next_run_at=x.get('next_run_at'),
            last_successful_run=last if x.get('last_run_status') == 'SUCCEEDED' else None,
            last_failure=last if x.get('last_run_status') == 'FAILED' else None,
            health={'state': x.get('last_run_status') or state, 'business_success': 'not_inferred'},
            history_scope='API latest execution only; ended and never-fired are distinct'))

    local = source('claude-local.json')
    for x in local.get('tasks', []):
        jobs.append(record('claude-local:' + x['id'], x['id'], 'Claude Desktop',
            schedule=x.get('cronExpression') or iso(x.get('fireAt')), timezone='unknown_in_store',
            trigger=['cron' if x.get('cronExpression') else 'once'],
            code_path=[x.get('filePath')], inputs=['existing scheduled skill'],
            data_sources=['Claude Desktop scheduled-tasks.json'], outputs=['local task output'],
            destination=x.get('store'), execution_state='enabled' if x.get('enabled') else 'disabled',
            last_triggered_at=x.get('lastRunAt'),
            health={'state': 'result_not_recorded_in_schedule', 'business_success': 'not_inferred'}))

    launchd = source('launchd.json')
    for x in launchd.get('jobs', []):
        jobs.append(record('launchd:' + x['Label'], x['Label'], 'launchd',
            schedule={'interval_seconds': x.get('StartInterval'), 'calendar': x.get('StartCalendarInterval')},
            timezone='Asia/Tokyo', trigger=['interval'], inputs=['latest repository', 'existing private authentication'],
            code_path=x.get('ProgramArguments', [])[1:2],
            data_sources=['native launchd state'], outputs=[x.get('StandardOutPath'), x.get('StandardErrorPath')],
            destination='existing observer PR and operating ledgers',
            execution_state='loaded' if x.get('loaded') else 'not_loaded',
            health={'state': 'loaded' if x.get('loaded') else 'unavailable', 'evidence': x.get('runtime_evidence'),
                    'business_success': 'not_inferred'},
            retry_behavior='Existing flock and interval retry; no model invocation'))

    cf = source('cloudflare.json')
    health_path = discovery / 'cloudflare-cron-health.json'
    cf_rows = read(health_path)[0].get('results', []) if health_path.exists() else []
    cf_source = discovery / 'sources/simplememo-api/src/index.ts'
    names = set(r['job_name'] for r in cf_rows)
    if cf_source.exists():
        body = cf_source.read_text().split('  async scheduled(', 1)[-1]
        names.update(re.findall("withCronLog\\(env, '([^']+)'", body))
        names.update(re.findall(r'ctx.waitUntil\((pruneD1MorningTables|pruneNotion)\(env\)\)', body))
    for name in sorted(names):
        rows = [r for r in cf_rows if r['job_name'] == name]
        values = lambda key: [r[key] for r in rows if r.get(key) is not None]
        jobs.append(record('cloudflare:simplememo-api:' + name, name, 'Cloudflare Worker',
            owner='simplememo-api/src/index.ts:' + name,
            schedule=sorted(set(r['cron_expression'] for r in rows)), timezone='UTC', trigger=['Worker Cron'],
            inputs=['existing Worker bindings and per-job gates'], data_sources=['D1 cron_run_log', 'Worker runtime'],
            code_path=['../simplememo-api/src/index.ts', '../simplememo-api/src/cron.ts'],
            outputs=['D1 cron_run_log', 'existing job destination'], destination='existing Worker job destination',
            execution_state='observed' if rows else 'declared_unobserved',
            last_successful_run={'at': iso(max(values('last_no_error'))), 'meaning': 'no logged error, may be a skip'} if values('last_no_error') else None,
            last_failure={'at': iso(max(values('last_failure')))} if values('last_failure') else None,
            health={'state': 'errors_observed' if sum(r.get('failures', 0) for r in rows) else 'no_logged_errors' if rows else 'unknown',
                    'runs_30d': sum(r.get('runs', 0) for r in rows),
                    'failures_30d': sum(r.get('failures', 0) for r in rows), 'business_success': 'not_inferred'},
            history_scope='bounded 30-day aggregate; sent may mean deletion or reporting, not growth',
            retry_behavior='Per-job eligibility and existing next Cron tick; outbound actions are not replayed here'))

    gcp = source('gcp-schedules.json')
    gcp_inventory = gcp.get('scheduler_inventory', {})
    if gcp_inventory.get('project') == 'yurika-simplememo':
        for service, details in gcp_inventory.get('services', {}).items():
            bound_parents = {loc.get('canonical_parent') for loc in details.get('locations', [])
                             if loc.get('requested_parent') == 'projects/yurika-simplememo/locations/' + str(loc.get('id'))}
            for item in details.get('jobs', []):
                name = item.get('name', '')
                if not name.startswith('projects/yurika-simplememo/locations/') and name.rsplit('/', 2)[0] not in bound_parents:
                    raise ValueError('Unexpected GCP resource reference')
                jobs.append(record('gcp:' + name, item.get('display_name') or name.rsplit('/', 1)[-1],
                    'GCP Cloud Scheduler' if service == 'scheduler' else 'GCP BigQuery Data Transfer',
                    owner=name, schedule=item.get('schedule'), timezone=item.get('timezone'),
                    trigger=['existing remote schedule'], inputs=['existing remote job definition'],
                    data_sources=[item.get('data_source') or item.get('target_kind') or service],
                    outputs=['existing configured destination'], destination=item.get('destination'),
                    code_path=['growth/lib/gcp-schedule-inventory.mjs'],
                    execution_state='disabled' if item.get('disabled') else item.get('state') or 'unknown',
                    health={'state': item.get('state') or 'unknown', 'last_attempt': item.get('last_attempt'),
                            'last_status_code': item.get('last_status_code'), 'business_success': 'not_inferred'},
                    retry_behavior=item.get('retry') or 'provider-managed; current retry policy unobserved',
                    definition_sha256=item.get('definition_sha256'),
                    history_scope='Current metadata only. State and last attempt do not establish last successful output.',
                    source_sha=gcp.get('source_sha'), observed_at=gcp_inventory.get('observed_at')))

    browser = browser_observation(source('browser-inventory.json', optional=True))
    jobs.extend([
        record('report:mention-watch', 'Mention & Competitor Watch — SimpleMemo', 'existing Autopilot',
            schedule='weekly within maintenance lane', timezone='Asia/Tokyo', trigger=['existing Autopilot selection'],
            code_path=['growth/data/mentions/README.md', 'docs/obsidian/AUTOPILOT_RUNBOOK.md'],
            inputs=['six fixed WebSearch queries'], data_sources=['external mention snapshots'],
            outputs=['growth/data/mentions/YYYY-MM-DD.json'], destination='existing content queues',
            human_intervention_required='Action handoff is evaluated by the canonical selector'),
        record('report:chatgpt-reddit', 'Reddit自然コメント', 'ChatGPT Tasks',
            schedule=None, timezone=None, trigger=['historical scheduled task'],
            data_sources=['2026-08-13 task-paused email'], outputs=['candidate and approval request'],
            execution_state='historically_paused_not_in_current_account_views' if browser['chatgpt_empty'] else 'historically_paused_current_unknown',
            current_inventory_observed_at=browser.get('observed_at'),
            human_intervention_required='Existing posting approval; historical record retained without reactivation'),
        record('data:gsc-bulk', 'Search Console BigQuery Bulk Export', 'Google managed export',
            schedule='daily provider export', timezone='America/Los_Angeles', trigger=['provider-managed'],
            data_sources=['sc-domain:simplememofast.com'], outputs=['yurika-simplememo.searchconsole'],
            code_path=['growth/BIGQUERY_SETUP.md', 'growth/scripts/bq-preflight.mjs']),
        record('data:ga4-bulk', 'GA4 BigQuery Export', 'Google managed export',
            schedule='daily provider export', timezone='Asia/Tokyo', trigger=['provider-managed'],
            data_sources=['GA4 property 524656334'], outputs=['yurika-simplememo.analytics_524656334'],
            code_path=['growth/ANALYTICS_API.md']),
        record('data:appsflyer', 'AppsFlyer Partners by Date UA report', 'local existing reader',
            trigger=['existing daily owner integration', 'manual'],
            code_path=['../simplememo-api/scripts/appsflyer_aggregate.py', 'growth/lib/company-data.mjs'],
            data_sources=['existing AppsFlyer aggregate API'], outputs=['private report.csv and result.json'],
            human_intervention_required='Owner integration installed and bootstrap verified; natural scheduled completion requires follow-up evidence',
            retry_behavior='Existing bounded reader; credentials unchanged'),
    ])
    for job in jobs:
        if job['id'] == 'codex:obsidian':
            job['overlapping_jobs'] = ['codex:obsidian-2', 'github:simplememo:332349520',
                                      'claude:trig_01TRBdBgSA9646FS4LDQgJdt', 'claude:trig_01RC44fYy1D5TGryJ36ixCU1']
        elif job['id'] == 'launchd:com.simplememo.decision-monitor':
            job['overlapping_jobs'] = ['github:simplememo:350001848']
            job['replacement_candidate'] = 'Existing fallback, not duplicate work; shared publication claim required'
    ids = [j['id'] for j in jobs]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate canonical automation ID')
    for job in jobs:
        if any(k not in job for k in REQUIRED):
            raise ValueError('Incomplete automation record')
    native_jobs = {j['id']: j for j in jobs}
    gaps = []
    if not browser['chatgpt_empty']:
        gaps.append({'id': 'chatgpt-current', 'state': browser['state'],
                     'reason': 'Need a fresh scoped observation of all three current task views; nonempty views require individual job normalization, not an empty-inventory claim'})
    if gcp_inventory.get('status') != 'complete' or gcp_inventory.get('project') != 'yurika-simplememo':
        gaps.append({'id': 'gcp-schedulers', 'state': gcp_inventory.get('status') or 'unverified',
                     'reason': 'API inventory remains partial. Authenticated console observations are separate evidence; a disabled Scheduler does not prove no retained definitions and must not be enabled just to clear this gap.',
                     'evidence': {key: value.get('issues', []) for key, value in gcp_inventory.get('services', {}).items()},
                     'browser_observation': browser['gcp'], 'browser_observed_at': browser.get('observed_at')})
    for ident, label, purpose in [('simplememo-ai', 'weekly AI visibility reservation', r'visibility|可視性|露出|probe'),
                                  ('simplememo', 'canonical funnel heartbeat', r'funnel|ファネル')]:
        job = native_jobs.get('codex:' + ident)
        if not job or not documented_owner_matches(job, purpose):
            gaps.append({'id': 'codex-' + ident, 'state': 'identity_unverified' if job else 'unverified',
                         'reason': 'documented ' + label + ' not matched by ID, purpose and recurring heartbeat metadata',
                         'id_present': bool(job)})
    refresh = discovery/'refresh.json'
    if refresh.exists():
        gaps.extend(dict(id='refresh:'+x['source'],state='partial',reason='latest refresh failed; prior evidence is stale') for x in read(refresh).get('failures', []))
    return {'schema_version': SCHEMA, 'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(),
            'privacy': 'private; do not publish this complete machine inventory',
            'discovery_surfaces': surfaces,
            'browser_coverage': browser,
            'known_gaps': gaps,
            'jobs': jobs, 'legacy_skill_assets': local.get('skill_assets', [])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state-root', type=Path, default=DEFAULT_STATE)
    args = parser.parse_args()
    state = private_root(args.state_root)
    registry = build(state / 'discovery')
    save(state / 'automation-registry.json', registry)
    print(json.dumps({'registry': str(state / 'automation-registry.json'), 'jobs': len(registry['jobs']),
                      'surfaces': len(registry['discovery_surfaces']), 'known_gaps': len(registry['known_gaps'])}))


if __name__ == '__main__':
    main()
