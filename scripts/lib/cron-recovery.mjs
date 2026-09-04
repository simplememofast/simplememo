/**
 * Cron HealthのIssueを閉じる前に、記録した故障の復旧を確認する。
 * 24hの新規検知窓から消えたことは復旧ではない。
 * Issue本文・追記の失敗一覧にある同一リポジトリのrunだけを読み、
 * 対象workflowの最新run（run_number順）がcompleted/successなら閉じられる。
 * API失敗・不完全な一覧・対象不明は未確認。ここではIssueを書き換えない。
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const integer = x => Number.isSafeInteger(x) && x > 0;
const unknown = why => ({ confirmed: false, why, evidence: [] });

export function failureRefs(bodies, owner, repo) {
  const refs = new Set();
  for (const body of bodies) {
    for (const line of body.split('\n')) {
      // 監視自身のrunを指すフッターや無関係なリンクを故障に混ぜない。
      const match = line.match(/^\s*-\s+.+ JST — (https:\/\/github\.com\/[^\s]+)\s*$/);
      if (!match) continue;
      const url = new URL(match[1]);
      const parts = url.pathname.split('/');
      if (parts[1]?.toLowerCase() !== owner.toLowerCase() || parts[2]?.toLowerCase() !== repo.toLowerCase()
        || parts[3] !== 'actions' || parts[4] !== 'runs' || !/^\d+$/.test(parts[5] ?? '')
        || parts.length !== 6 || url.search || url.hash) continue;
      const id = Number(parts[5]);
      if (integer(id)) refs.add(id);
    }
  }
  return [...refs];
}

async function pages(read, select, { perPage, maxPages }) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const response = await read({ page, per_page: perPage });
    const rows = select(response.data);
    if (!Array.isArray(rows)) throw new Error('malformed response');
    all.push(...rows);
    if (rows.length < perPage) return all;
  }
  throw new Error('incomplete pagination');
}

function validRun(run, now) {
  return integer(run?.id) && integer(run.workflow_id) && integer(run.run_number)
    && run.event === 'schedule' && Number.isFinite(Date.parse(run.created_at))
    && Date.parse(run.created_at) <= now;
}

export async function confirmCronRecovery({ github, owner, repo, issue, now = Date.now(),
  perPage = 100, maxPages = 5 }) {
  if (!integer(issue?.number) || issue.pull_request || typeof issue.body !== 'string' || !Number.isFinite(now)
    || !integer(perPage) || perPage > 100 || !integer(maxPages) || maxPages > 5) return unknown('追跡するIssueまたは取得上限が不正');
  try {
    const comments = await pages(p => github.rest.issues.listComments({ owner, repo, issue_number: issue.number, ...p }),
      data => data, { perPage, maxPages });
    if (comments.some(c => typeof c?.body !== 'string')) return unknown('Issueの追記を読み取れない');
    const refs = failureRefs([issue.body, ...comments.map(c => c.body)], owner, repo);
    if (!refs.length || refs.length > 50) return unknown('故障の参照が無いか、50件の取得上限を超える');
    const workflows = new Map();
    for (const id of refs) {
      const { data: run } = await github.rest.actions.getWorkflowRun({ owner, repo, run_id: id });
      if (!validRun(run, now) || run.id !== id) return unknown(`故障run ${id} の対象を確認できない`);
      const entry = workflows.get(run.workflow_id) ?? { since: run.created_at, number: 0, refs: [] };
      if (Date.parse(run.created_at) < Date.parse(entry.since)) entry.since = run.created_at;
      entry.number = Math.max(entry.number, run.run_number);
      entry.refs.push(id);
      workflows.set(run.workflow_id, entry);
    }
    if (workflows.size > 20) return unknown('追跡するworkflowが20件の取得上限を超える');
    const evidence = [];
    for (const [workflow_id, entry] of workflows) {
      // statusで絞らない。成功後のfailure/cancelled/queuedを読み落とさない。
      // 全ページを読んでrun_numberで選ぶため、APIの並び順に依存しない。
      const runs = await pages(p => github.rest.actions.listWorkflowRuns({ owner, repo, workflow_id,
        event: 'schedule', created: `>=${entry.since}`, ...p }), data => data?.workflow_runs, { perPage, maxPages });
      if (!runs.length || runs.some(r => !validRun(r, now) || r.workflow_id !== workflow_id)) return unknown(`workflow ${workflow_id} の実行一覧が不明`);
      if (entry.refs.some(id => !runs.some(r => r.id === id))) return unknown(`workflow ${workflow_id} の一覧が故障runを覆っていない`);
      const latest = runs.reduce((a, b) => a.run_number > b.run_number ? a : b);
      if (latest.run_number < entry.number || latest.status !== 'completed' || latest.conclusion !== 'success') {
        return unknown(`workflow ${workflow_id} の最新定期実行 ${latest.id} は成功を確認できない`);
      }
      evidence.push({ workflow_id, run_id: latest.id, run_number: latest.run_number,
        run_attempt: latest.run_attempt ?? null, url: `https://github.com/${owner}/${repo}/actions/runs/${latest.id}` });
    }
    return { confirmed: evidence.length > 0, why: '追跡中の全workflowで最新の定期実行が成功', evidence };
  } catch (error) {
    return unknown(`復旧確認の取得が未完了（API status: ${Number.isInteger(error?.status) ? error.status : '不明'}）`);
  }
}

export async function selftest() {
  const errors = [];
  const check = (yes, message) => { if (!yes) errors.push(message); };
  const line = id => `  - 2026/9/1 7:00:00 JST — https://github.com/o/r/actions/runs/${id}`;
  const run = (id, number, extra = {}) => ({ id, run_number: number, workflow_id: 10, event: 'schedule',
    created_at: '2026-09-01T00:00:00Z', status: 'completed', conclusion: 'failure', run_attempt: 1, ...extra });
  const failed = run(101, 1); const recovered = run(102, 2, { conclusion: 'success', created_at: '2026-09-02T00:00:00Z' });
  function fixture({ recent = [recovered, failed], comments = [], failRead = null, original = failed,
    body = line(101), perPage = 100, maxPages = 5 } = {}) {
    const reads = [];
    const github = { rest: { issues: { listComments: async p => {
      reads.push(p); if (failRead === 'comments') throw Object.assign(new Error(), { status: 403 });
      return { data: comments.slice((p.page - 1) * p.per_page, p.page * p.per_page) };
    } }, actions: {
      getWorkflowRun: async p => {
        if (failRead === 'run') throw Object.assign(new Error(), { status: 404 });
        return { data: p.run_id === 101 ? original : run(p.run_id, 1, { workflow_id: 20 }) };
      },
      listWorkflowRuns: async p => {
        reads.push(p); if (failRead === 'latest') throw new Error('network');
        const list = recent.filter(r => r.workflow_id === p.workflow_id && (!p.status || r.conclusion === p.status));
        return { data: { workflow_runs: list.slice((p.page - 1) * p.per_page, p.page * p.per_page) } };
      },
    } } };
    return { github, reads, args: { github, owner: 'o', repo: 'r', issue: { number: 1, body },
      now: Date.parse('2026-09-04T00:00:00Z'), perPage, maxPages } };
  }
  const test = async (options, expected, why) => {
    const f = fixture(options); const result = await confirmCronRecovery(f.args);
    check(result.confirmed === expected, why); return { ...f, result };
  };
  await test({}, true, '故障後の最新successで閉じられない');
  await test({ recent: [failed] }, false, '24hより古い故障を成功なしで閉じた');
  await test({ recent: [] }, false, '空一覧で閉じた');
  await test({ recent: [recovered] }, false, '故障を覆わない不完全な一覧で閉じた');
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'skipped', null]) {
    await test({ recent: [recovered, failed, run(103, 3, { conclusion })] }, false, `最新${conclusion}の前にあるsuccessで閉じた`);
  }
  await test({ recent: [recovered, failed, run(103, 3, { status: 'in_progress', conclusion: 'success' })] }, false, '実行中に閉じた');
  await test({ recent: [recovered, failed, run(103, 3, { event: 'workflow_dispatch', conclusion: 'success' })] }, false, '手動実行を定期実行の復旧にした');
  await test({ recent: [run(100, 0, { conclusion: 'success' }), failed] }, false, '不正なrun番号を見逃した');
  await test({ original: { ...failed, id: 999 } }, false, '異なるrun IDの応答を受け入れた');
  await test({ recent: [{ ...recovered, created_at: '2099-01-01T00:00:00Z' }, failed] }, false, '未来の成功を受け入れた');
  for (const failRead of ['comments', 'run', 'latest']) await test({ failRead }, false, `${failRead}の取得失敗で閉じた`);
  await test({ body: '故障の参照不明' }, false, '追跡対象不明で閉じた');
  await test({ body: line(101).replace('/o/r/', '/other/r/') }, false, '別リポジトリの参照で閉じた');
  check(failureRefs([line(101), line(101), '_[cron-health.yml](https://github.com/o/r/actions/runs/999)_'], 'o', 'r').join(',') === '101', '重複または監視自身のURLを故障に数えた');
  const paged = await test({ body: '', comments: [{ body: 'comment' }, { body: line(101) }], perPage: 1 }, true, '2ページ目の追記や実行を読めない');
  check(paged.reads.some(p => p.page === 2 && p.workflow_id === 10), '実行一覧の2ページ目を読まない');
  check(paged.reads.filter(p => p.workflow_id).every(p => !('status' in p)), '最新実行をstatusで絞り込んだ');
  await test({ perPage: 1, maxPages: 1 }, false, '実行一覧のページ上限を正常扱いした');
  await test({ original: { ...failed, conclusion: 'success', run_attempt: 2 },
    recent: [{ ...failed, conclusion: 'success', run_attempt: 2 }], perPage: 1, maxPages: 1 }, false, '成功が見えていても未完の一覧では閉じない');
  await test({ comments: [{ body: line(101) }], perPage: 1, maxPages: 1 }, false, '追記のページ上限を正常扱いした');
  await test({ comments: [{}] }, false, '不正な追記を無視して閉じた');
  await test({ body: line(101), comments: [{ body: line(201) }], recent: [failed, recovered, run(201, 1, { workflow_id: 20 })] }, false, '追記で増えた別workflowの故障を忘れた');
  await test({ original: { ...failed, conclusion: 'success', run_attempt: 2 }, recent: [{ ...failed, conclusion: 'success', run_attempt: 2 }] }, true, '同じrunの成功した再試行を確認できない');
  await test({ original: { ...failed, conclusion: 'success', run_attempt: 2 },
    recent: [{ ...failed, conclusion: 'success', run_attempt: 2 }, run(103, 3)] }, false, '古い成功した再試行で新しい故障を隠した');

  // 実際のworkflowのscriptを実行する。GitHubへの読み書きだけを検体へ差し替える。
  // helper単体が正しくても、呼び出し側がconfirmedを無視すれば故障を閉じてしまう。
  const workflow = fs.readFileSync(new URL('../../.github/workflows/cron-health.yml', import.meta.url), 'utf8');
  const source = workflow.split('          script: |\n')[1]?.split('\n').map(s => s.replace(/^            /, '')).join('\n');
  check(Boolean(source?.includes('confirmCronRecovery')), 'workflowから復旧確認が切断されている');
  if (source) {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const execute = new AsyncFunction('github', 'core', 'context', 'process', 'Date', source);
    const frozenNow = Date.parse('2026-09-04T00:00:00Z');
    class Clock extends Date { constructor(value = frozenNow) { super(value); } static now() { return frozenNow; } }
    async function workflowCase(options, { open = true, pullRequest = false, incomplete = false } = {}) {
      const f = fixture(options); const writes = [];
      Object.assign(f.github.rest.issues, {
        listForRepo: async () => ({ data: open ? [{ ...f.args.issue, state: 'open', ...(pullRequest ? { pull_request: {} } : {}) }] : [] }),
        createComment: async p => { writes.push({ kind: 'comment', ...p }); },
        update: async p => { writes.push({ kind: 'update', ...p }); },
      });
      f.github.rest.actions.listWorkflowRunsForRepo = async () => ({ data: { workflow_runs: incomplete ? Array(100).fill(failed) : [] } });
      const summary = { addHeading() { return this; }, addRaw() { return this; }, async write() {} };
      let error = null;
      try {
        await execute(f.github, { notice() {}, warning() {}, summary },
          { repo: { owner: 'o', repo: 'r' }, serverUrl: 'https://github.com', runId: 999 },
          { env: { GITHUB_WORKSPACE: fileURLToPath(new URL('../../', import.meta.url)) } }, Clock);
      } catch (e) { error = e; }
      return { writes, error };
    }
    const expired = await workflowCase({ recent: [failed] });
    check(!expired.error && !expired.writes.some(w => w.kind === 'update')
      && expired.writes.some(w => w.body?.includes('未解決のまま')), '実workflowが24h外の故障を成功なしで閉じた');
    const successful = await workflowCase({});
    check(!successful.error && successful.writes.filter(w => w.kind === 'update' && w.state === 'closed').length === 1
      && successful.writes.some(w => w.body?.includes('/actions/runs/102 (completed/success)')), '実workflowが成功の証拠と閉鎖を接続していない');
    const unavailable = await workflowCase({ failRead: 'comments' });
    check(!unavailable.error && !unavailable.writes.some(w => w.kind === 'update'), '実workflowが取得失敗で閉じた');
    const healthy = await workflowCase({}, { open: false });
    check(!healthy.error && healthy.writes.length === 0, '故障もIssueも無い日に書き込んだ');
    const pr = await workflowCase({}, { pullRequest: true });
    check(!pr.error && pr.writes.length === 0, '監視ラベル付きPRに書き込んだ');
    const partial = await workflowCase({}, { incomplete: true });
    check(partial.error?.message.includes('ページ上限') && partial.writes.length === 0, '実workflowが新規検知の不完全な一覧を受け入れた');
  }
  return errors;
}
