#!/usr/bin/env node
/**
 * 監視Issueをアクション台帳へ取り込む。**気づく役を人から外す。**
 *
 *   node scripts/health-intake.mjs                 # 取り込む（GitHub API を読む）
 *   node scripts/health-intake.mjs --dry-run       # 何が入るかだけ出す
 *   node scripts/health-intake.mjs --issues-json <file>  # APIの代わりにファイルを読む
 *   node scripts/health-intake.mjs --check         # CI: 台帳の形と自己検査
 *   node scripts/health-intake.mjs --selftest      # 変換の自己検査（ネットも台帳も見ない）
 *
 * 【なぜ要るか — 塞ぐのは「人が気づく」という一段】
 * 運転台帳の実測で、人間介入のうち**いちばん大きいのが「基盤の修理」22.2%**だった。
 * 修理そのものはAIが書いている。人がやっていたのは
 * **「壊れていることに気づいて、直せと言うこと」**だけ（原稿にもそう書いてある）。
 *
 * ところが気づく仕組みは既にあった:
 *
 *   autopilot-health.yml … 出荷が止まったら `ops/autopilot-stale` の Issue を立てる
 *   cron-health.yml      … 定期実行が落ちたら `ops/cron-failure` の Issue を立てる
 *
 * **繋がっていなかったのは、その先だけ。**レーンF（自己修復）が読むのは
 * `data/autopilot-actions.json` で、**Issue は誰も読んでいなかった。**
 * だから毎回、人がIssueに気づいて伝えるところだけが手作業として残っていた。
 *
 *   障害 → Issueが立つ → **誰も読まない** → 人が気づいて指示 → レーンFが直す
 *                          ↑ ここを塞ぐ
 *
 * 【この script がやらないこと】
 * **仕事を作らない。**監視ワークフローが実際に立てた Issue を写すだけで、
 * 自分で故障を判定しない。判定は向こうの仕事で、ここは運搬。
 *
 * **閉じない。**回復の判定は `issue_closed`（autopilot-act.mjs）が持つ。
 * 監視ワークフローは回復時に自分でIssueを閉じるので、その状態をそのまま使う。
 * ここで閉じると、**故障を消す方向の判断が2箇所に散る。**
 *
 * 【取れなかったら台帳を触らない】
 * API が読めない回は何もしない。**「Issueが無い」と「Issueを読めなかった」を
 * 混ぜると、読めない日に全部の故障が回復したことになる。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selftest as cronRecoverySelftest } from './lib/cron-recovery.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/autopilot-actions.json');

/** 取り込む対象のラベル。**ここに無いラベルは運ばない**（勝手に対象を広げない）。 */
export const HEALTH_LABELS = {
  'ops/autopilot-stale': {
    domain: 'サイトコンテンツの新設・更新',
    what: '出荷が止まっている（status JSON が当日分に更新されていない）',
  },
  'ops/cron-failure': {
    domain: null,
    what: '定期実行が失敗している',
  },
};

export const REPO = 'simplememofast/simplememo';

/** Issue 1件 → 台帳の行。**純関数。** */
export function toAction(issue, todayJst) {
  if (issue?.state !== 'open' || issue.pull_request) return null;
  const label = (issue.labels ?? [])
    .map((l) => (typeof l === 'string' ? l : l?.name))
    .find((n) => HEALTH_LABELS[n]);
  if (!label) return null;
  const meta = HEALTH_LABELS[label];
  return {
    id: `act-health-${issue.number}`,
    title: `【監視】${issue.title}`,
    source: 'health',
    domain: meta.domain,
    touches: [],
    outside_repo: false,
    force_owner: null,
    force_owner_why: null,
    auto: null,
    close_check: { kind: 'issue_closed', params: { issue: issue.number } },
    state: 'open',
    created_jst: todayJst,
    last_seen_jst: todayJst,
    closed_jst: null,
    evidence: `${meta.what}。**判定は監視ワークフローが持つ** —— この行はそれを`
      + `レーンFの視界に運んでいるだけで、回復の判定もあちらが Issue を閉じることで行う。`
      + `\nhttps://github.com/${REPO}/issues/${issue.number}`,
  };
}

/**
 * 台帳へ差分を当てる。**純関数**（読み書きは呼び出し側）。
 *
 * - 既にあるopen行は `last_seen_jst` だけ更新し、書き足された経緯を保つ
 * - doneでもGitHubでopenなら再開する。旧閉鎖の根拠はprevious_closureに保つ
 * - 無い行は足す
 * - **閉じない。**回復は issue_closed が判定する
 */
export function mergeActions(doc, issues, todayJst) {
  const actions = [...(doc.actions ?? [])];
  const byId = new Map(actions.map((a, i) => [a.id, i]));
  const added = [];
  const seen = [];
  for (const issue of issues) {
    const row = toAction(issue, todayJst);
    if (!row) continue;
    const at = byId.get(row.id);
    if (at === undefined) { byId.set(row.id, actions.length); actions.push(row); added.push(row.id); }
    else {
      const current = actions[at];
      actions[at] = { ...current, last_seen_jst: todayJst };
      if (current.state === 'done') {
        Object.assign(actions[at], { state: 'open', closed_jst: null, reopened_jst: todayJst, created_jst: todayJst,
          previous_closure: { closed_jst: current.closed_jst, evidence: current.evidence },
          evidence: row.evidence });
      }
      seen.push(row.id);
    }
  }
  return { doc: { ...doc, actions }, added, seen };
}

export async function fetchOpenIssues({ repo = REPO, token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
  fetchImpl = fetch, perPage = 100, maxPages = 5 } = {}) {
  if (!token) return { issues: null, why: 'GitHubの読み取りトークンが無い' };
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100
    || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10) return { issues: null, why: '不正な取得上限' };
  try {
    // GitHubのlabels=a,bは両ラベルの一致。監視はどちらか一方でよいので別々に読む。
    const groups = await Promise.all(Object.keys(HEALTH_LABELS).map(async label => {
      const issues = [];
      for (let page = 1; page <= maxPages; page++) {
        const url = `https://api.github.com/repos/${repo}/issues?state=open`
          + `&labels=${encodeURIComponent(label)}&per_page=${perPage}&page=${page}`;
        const res = await fetchImpl(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) throw new Error(`GitHub API が ${res.status}`);
        const body = await res.json();
        if (!Array.isArray(body) || body.some(x => !Number.isInteger(x?.number) || x.state !== 'open'
          || !Array.isArray(x.labels))) throw new Error('Issue一覧の形式が不正');
        for (const issue of body) {
          if (!issue.pull_request && issue.labels.some(l => (typeof l === 'string' ? l : l?.name) === label)) issues.push(issue);
        }
        if (body.length < perPage) return issues;
      }
      throw new Error('ページ上限まで取得しても一覧を覆いきれない');
    }));
    const unique = new Map(groups.flat().map(issue => [issue.number, issue]));
    return { issues: [...unique.values()].sort((a, b) => a.number - b.number), why: null };
  } catch (e) {
    return { issues: null, why: `取得に失敗: ${String(e).slice(0, 120)}` };
  }
}

export async function selftest() {
  const p = await cronRecoverySelftest();
  const eq = (got, want, msg) => { if (got !== want) p.push(`${msg}（got ${JSON.stringify(got)}）`); };

  const iss = { number: 42, state: 'open', title: '出荷が2日止まっている', labels: [{ name: 'ops/autopilot-stale' }] };
  const row = toAction(iss, '2026-08-26');
  eq(row?.id, 'act-health-42', 'id が issue 番号で決まっていない');
  eq(row?.source, 'health', 'source が health でない');
  eq(row?.state, 'open', '取り込んだ行が open でない');
  eq(row?.close_check?.kind, 'issue_closed', '閉じ条件が issue_closed でない');
  eq(row?.close_check?.params?.issue, 42, '閉じ条件に issue 番号が渡っていない');

  // **対象ラベル以外は運ばない**
  eq(toAction({ number: 1, state: 'open', title: 'x', labels: [{ name: 'enhancement' }] }, '2026-08-26'), null,
     '対象外のラベルを運んでいる');
  eq(toAction({ number: 1, title: 'x', labels: [] }, '2026-08-26'), null, 'ラベル無しを運んでいる');
  // 文字列ラベル（APIの表現ゆれ）
  eq(toAction({ number: 2, state: 'open', title: 'x', labels: ['ops/cron-failure'] }, '2026-08-26')?.id,
     'act-health-2', '文字列ラベルを読めていない');

  // 差分の当て方
  const base = { actions: [] };
  const first = mergeActions(base, [iss], '2026-08-26');
  eq(first.added.length, 1, '新規を足していない');
  eq(first.doc.actions.length, 1, '台帳に入っていない');
  eq(mergeActions(base, [iss, iss], '2026-08-26').doc.actions.length, 1, '同一入力内のIssueを重複させた');

  // **2回目は足さない**（毎朝走るので冪等でないと台帳が膨らむ）
  const second = mergeActions(first.doc, [iss], '2026-08-27');
  eq(second.added.length, 0, '同じ Issue を二重に足している');
  eq(second.doc.actions.length, 1, '行が増えている');
  eq(second.doc.actions[0].last_seen_jst, '2026-08-27', 'last_seen が更新されていない');

  // **セッションが書き足したものを消さない**
  const edited = { actions: [{ ...first.doc.actions[0], evidence: '人が書いた経緯', title: '直した題' }] };
  const third = mergeActions(edited, [iss], '2026-08-28');
  eq(third.doc.actions[0].evidence, '人が書いた経緯', '**取り込みが evidence を上書きしている**');
  eq(third.doc.actions[0].title, '直した題', '取り込みが title を上書きしている');

  // **閉じない**
  const closed = mergeActions(first.doc, [], '2026-08-29');
  eq(closed.doc.actions[0].state, 'open', '**取り込みが行を閉じている**（回復の判定は issue_closed の仕事）');

  eq(toAction({ ...iss, state: 'closed' }, '2026-09-04'), null, 'closedを新規障害にしない');
  eq(toAction({ ...iss, pull_request: {} }, '2026-09-04'), null, 'PRを障害にしない');
  const reopened = mergeActions({ actions: [{ ...row, state: 'done', closed_jst: '2026-09-03', evidence: '旧判定' }] }, [iss], '2026-09-04');
  eq(reopened.doc.actions[0].state, 'open', 'GitHubでopenのIssueが台帳のdoneに隠れたまま');
  eq(reopened.doc.actions[0].previous_closure.evidence, '旧判定', '旧閉鎖の根拠を消した');

  const all = [iss, { ...iss, number: 43, labels: ['ops/cron-failure'] },
    { ...iss, number: 44, labels: Object.keys(HEALTH_LABELS) }, { ...iss, number: 45, pull_request: {} }];
  const res = (body, ok = true) => ({ ok, status: ok ? 200 : 403, json: async () => body });
  const requested = [];
  const github = async url => {
    const q = new URL(url).searchParams; requested.push(q);
    const wanted = q.get('labels').split(',');
    const filtered = all.filter(i => wanted.every(l => i.labels.map(x => typeof x === 'string' ? x : x.name).includes(l)));
    const size = Number(q.get('per_page')); const start = (Number(q.get('page')) - 1) * size;
    return res(filtered.slice(start, start + size));
  };
  const observed = await fetchOpenIssues({ token: 'test', fetchImpl: github, perPage: 2 });
  eq(JSON.stringify(observed.issues?.map(i => i.number)), '[42,43,44]', '片方のラベル・2ページ目・重複排除が正しくない');
  eq(requested.every(q => !q.get('labels').includes(',')), true, '監視ラベルをAND指定した');
  eq(requested.some(q => q.get('page') === '2'), true, '2ページ目を読まない');
  eq((await fetchOpenIssues({ token: 'test', fetchImpl: github, perPage: 1, maxPages: 1 })).issues, null, '不完全な一覧を正常扱いした');
  for (const fetchImpl of [async () => res([], false), async () => res({}), async () => res([{}]),
    async () => { throw new Error('network'); }, async url => new URL(url).searchParams.get('labels') === 'ops/cron-failure' ? res([], false) : res([])]) {
    eq((await fetchOpenIssues({ token: 'test', fetchImpl })).issues, null, '取得失敗を空一覧にした');
  }
  eq((await fetchOpenIssues({ token: '', fetchImpl: github })).issues, null, 'トークン欠落を空一覧にした');
  eq((await fetchOpenIssues({ token: 'test', fetchImpl: async () => res([]) })).issues.length, 0, '実際の空一覧を読めない');

  return p;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);

  if (argv.includes('--selftest') || argv.includes('--check')) {
    const problems = await selftest();
    if (problems.length) {
      console.error('自己検査で問題:');
      for (const x of problems) console.error(`  - ${x}`);
      process.exit(1);
    }
    console.log(`health-intake: 自己検査に問題なし（対象ラベル ${Object.keys(HEALTH_LABELS).join(' / ')}）。`);
    process.exit(0);
  }

  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const jsonAt = argv.indexOf('--issues-json');
  let issues;
  let why = null;
  if (jsonAt >= 0) {
    issues = JSON.parse(fs.readFileSync(argv[jsonAt + 1], 'utf8'));
  } else {
    ({ issues, why } = await fetchOpenIssues());
  }

  if (!issues) {
    console.log(`監視Issueの取り込み: **読めなかった** — ${why}`);
    console.log('  **台帳は触らない。**「Issueが無い」と「Issueを読めなかった」を混ぜると、');
    console.log('  読めない日に全部の故障が回復したことになる。');
    process.exit(0);
  }

  const doc = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const { doc: next, added, seen } = mergeActions(doc, issues, today);

  console.log(`監視Issueの取り込み（${today} JST）\n`);
  console.log(`  open な監視Issue: ${issues.length} 件`);
  console.log(`  新規に台帳へ:     ${added.length} 件${added.length ? ` — ${added.join(', ')}` : ''}`);
  console.log(`  既にある行:       ${seen.length} 件（last_seen だけ更新）`);
  if (!issues.length) console.log('\n  **止まっている監視は無い。**（読めた上での 0 件）');

  if (argv.includes('--dry-run')) { console.log('\n  → --dry-run なので書かない'); process.exit(0); }
  if (added.length || seen.length) {
    fs.writeFileSync(LEDGER_PATH, `${JSON.stringify(next, null, 2)}\n`);
    console.log('\n  → 台帳を更新した。**レーンFが次の実行で拾う。**');
  }
}
