#!/usr/bin/env node
/**
 * **公開レーンの出荷に、事前登録した予測が付いているか。**
 *
 *   node scripts/check-contract-coverage.mjs            # 一覧
 *   node scripts/check-contract-coverage.mjs --check    # CI
 *   node scripts/check-contract-coverage.mjs --selftest # 境界の固定
 *
 * 【なぜ要るか】
 * 価値契約の仕組みは 2026-09-04 に配線され、承認済み指標も3件入った。
 * それから 09-05 まで、**起案は1本も書かれなかった。**
 * 配線が済んでいることと使われることは別で、**使われなかったことに
 * 気づく仕掛けが無かった。**公開レーンの出荷 14 件のうち契約は 0 件（実測）。
 *
 * VDC 30点は「窓内の出荷のうち決済済み契約を伴う割合」なので、自律スコアを
 * 60 に乗せるには窓内 22 出荷のうち 15 本が要る。**手で1本ずつ書いて届く距離ではない。**
 * 日次runが毎回書く運用に変わるしかなく、変わったかはここが数える。
 *
 * 【何を「覆われている」とするか】
 * 契約が在る、**または**その日の不適格理由が記録されている。
 * Runbook §2-1 の「候補が通らない日は不適格理由だけ記録し、出荷を捏造しない」と同じ。
 * **書けない日があること自体は正常。**異常なのは、書きも記録もせずに出荷が通ること。
 *
 * 【いきなり止めない】
 * enforcement は data/contract-coverage.json（オーナー所有）が持つ。既定は record_only。
 * 日次runは §3-1 に一度も到達していないので、**今日 block にすると明日の朝から
 * 出荷が止まる。**eligibility-policy.json が 09-04 に同じ理由で
 * record_plus_r2_block から始めたのと同じ判断。倒す日を決めるのは L4。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const POLICY_PATH = path.join(ROOT, 'data/contract-coverage.json');
export const REJECTIONS_DIR = path.join(ROOT, 'data/decision-rejections');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/** 公開レーン（A〜E）の出荷のうち、required_from 以降のもの。 */
export function publishingShips(runs, policy) {
  const lanes = new Set(policy.publishing_lanes || []);
  const from = policy.required_from;
  return (runs || []).filter((r) => r.outcome === 'shipped' && lanes.has(r.lane)
    && typeof r.date_jst === 'string' && r.date_jst >= from);
}

/**
 * 1件ずつ「覆われているか」を判定する。
 * **契約が在る**か、**その日の不適格理由が在る**かのどちらか。
 */
export function coverage(runs, policy, { contracts = [], rejectionDates = [] } = {}) {
  const ships = publishingShips(runs, policy);
  const byRun = new Set(contracts.map((c) => c.run_id).filter(Boolean));
  const rejected = new Set(rejectionDates);
  const rows = ships.map((r) => {
    const contract = byRun.has(r.run_id);
    const rejection = rejected.has(r.date_jst);
    return { run_id: r.run_id, date_jst: r.date_jst, lane: r.lane,
      covered: contract || rejection,
      by: contract ? 'contract' : rejection ? 'rejection' : null };
  });
  const uncovered = rows.filter((x) => !x.covered);
  return {
    from: policy.required_from, n: rows.length, rows,
    covered: rows.length - uncovered.length, uncovered,
    rate: rows.length ? (rows.length - uncovered.length) / rows.length : null,
    // **空回りしていることを自分で言う。**分母が無い検査は「合格」ではない。
    idle: rows.length === 0,
  };
}

/** 台帳から不適格理由の日付を集める。ディレクトリが無いのは異常ではない。 */
export function rejectionDates({ dir = REJECTIONS_DIR, read = readJson } = {}) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).flatMap((f) => {
    try {
      const at = read(path.join(dir, f))?.at;
      const d = at ? new Date(Date.parse(at) + 9 * 3600e3) : null;
      return Number.isFinite(d?.getTime()) ? [d.toISOString().slice(0, 10)] : [];
    } catch { return []; }
  });
}

export function check(cov, policy) {
  const problems = [];
  if (!['record_only', 'block'].includes(policy.enforcement)) {
    problems.push(`enforcement が record_only / block のどちらでもない（${policy.enforcement}）`);
  }
  if (policy.policy_owner !== 'human') {
    problems.push('**この台帳の持ち主は人。**policy_owner が human でない —— 止める/止めないを機械が決められる場所を作らない');
  }
  // **止めるのは block のときだけ。**record_only では数えて出すだけ。
  if (policy.enforcement === 'block' && cov.uncovered.length) {
    problems.push(`契約も不適格理由も無い公開レーン出荷が ${cov.uncovered.length} 件`
      + `（${cov.uncovered.map((x) => `${x.date_jst} ${x.run_id}`).join(' / ')}）`
      + ' — **書けない日があること自体は正常。**書きも記録もせずに出荷が通ることが異常');
  }
  return problems;
}

export function render(cov, policy) {
  const L = [];
  L.push(`\n価値契約の被覆（公開レーン A〜E ・ ${cov.from} 以降）  enforcement=${policy.enforcement}\n`);
  if (cov.idle) {
    L.push(`  **この検査はまだ空回りしている。**${cov.from} 以降の公開レーン出荷が 0 件で、`);
    L.push(`  分母が無い。**「問題なし」ではない。**`);
  } else {
    L.push(`  ${cov.covered}/${cov.n} 件が覆われている（${(cov.rate * 100).toFixed(1)}%）`);
    for (const x of cov.rows) {
      L.push(`    ${x.date_jst}  ${String(x.run_id).padEnd(28)} lane=${x.lane}  `
        + (x.covered ? `覆い=${x.by}` : '**契約も不適格理由も無い**'));
    }
  }
  const t = policy.target || {};
  L.push(`\n  自律スコア 60 の条件: 窓内 ${t.window_ships_at_measurement} 出荷のうち`
    + ` **決済済み契約 ${t.settled_contracts_for_score_60} 本**（${t.measured_at} 実測）`);
  if (policy.enforcement === 'record_only') {
    L.push(`  **いまは数えるだけでCIは落ちない。**止める日を決めるのは`
      + ` data/contract-coverage.json の持ち主（enforcement を block にする）\n`);
  }
  return L.join('\n');
}

// --- 自己検査 -------------------------------------------------------------
function selftest() {
  let n = 0, bad = 0;
  const eq = (got, want, msg) => {
    n += 1;
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      bad += 1; console.error(`  ✗ ${msg}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
    }
  };
  const ok = (name, fn) => { n += 1; try { fn(); } catch (e) { bad += 1; console.error(`  ✗ ${name}\n      ${e.message}`); } };

  const P = { enforcement: 'record_only', policy_owner: 'human', required_from: '2026-09-06',
    publishing_lanes: ['A', 'B', 'C', 'D', 'E'],
    target: { settled_contracts_for_score_60: 15, window_ships_at_measurement: 22, measured_at: '2026-09-05' } };
  const ship = (id, over = {}) => ({ run_id: id, date_jst: '2026-09-07', outcome: 'shipped', lane: 'C', ...over });

  // --- 対象の切り出し ---
  eq(publishingShips([ship('a')], P).length, 1, '公開レーンの出荷は対象');
  eq(publishingShips([ship('a', { lane: 'F' })], P).length, 0, '**レーンFは対象外**（自己修復は公開ではない）');
  eq(publishingShips([ship('a', { lane: undefined })], P).length, 0, 'レーンの無い保守は対象外');
  eq(publishingShips([ship('a', { outcome: 'failed' })], P).length, 0, '出荷でない行は対象外');
  eq(publishingShips([ship('a', { date_jst: '2026-09-05' })], P).length, 0,
     '**required_from より前は遡って見ない**（契約を付けられなかった時期の出荷を落とさない）');
  eq(publishingShips([ship('a', { date_jst: '2026-09-06' })], P).length, 1, 'required_from 当日は対象');

  // --- 覆い ---
  eq(coverage([ship('a')], P, { contracts: [{ run_id: 'a' }] }).uncovered.length, 0, '契約が在れば覆われている');
  eq(coverage([ship('a')], P, { rejectionDates: ['2026-09-07'] }).uncovered.length, 0,
     '**不適格理由の記録でも覆われる**（書けない日があること自体は正常）');
  eq(coverage([ship('a')], P, { rejectionDates: ['2026-09-08'] }).uncovered.length, 1,
     '別の日の理由では覆わない');
  eq(coverage([ship('a')], P, { contracts: [{ run_id: 'b' }] }).uncovered.length, 1,
     '別の run の契約では覆わない');
  eq(coverage([ship('a')], P, {}).uncovered.length, 1, '契約も理由も無ければ覆われていない');
  eq(coverage([ship('a')], P, { contracts: [{ run_id: null }, { run_id: 'a' }] }).uncovered.length, 0,
     'run_id の無い契約行が混ざっても壊れない');

  // --- 空回りを自分で言う ---
  ok('**分母が0のとき「合格」と言わない**', () => {
    const c = coverage([], P, {});
    if (!c.idle) throw new Error('idle が立っていない');
    if (c.rate !== null) throw new Error(`率が出ている: ${c.rate}`);
    const text = render(c, P);
    if (!text.includes('空回り')) throw new Error('空回りだと書いていない');
    if (!text.includes('「問題なし」ではない')) throw new Error('**合格と読ませない一行が無い**');
  });

  // --- enforcement ---
  ok('**record_only では落ちない**（明日の朝の出荷を止めない）', () => {
    const c = coverage([ship('a')], P, {});
    if (c.uncovered.length !== 1) throw new Error('前提が崩れている');
    const p = check(c, P);
    if (p.length) throw new Error(`落ちた: ${JSON.stringify(p)}`);
  });
  ok('**block では落ちる**', () => {
    const c = coverage([ship('a')], P, {});
    const p = check(c, { ...P, enforcement: 'block' });
    if (!p.some((x) => x.includes('契約も不適格理由も無い公開レーン出荷'))) {
      throw new Error(`落ちなかった: ${JSON.stringify(p)}`);
    }
  });
  ok('block でも、覆われていれば落ちない', () => {
    const c = coverage([ship('a')], P, { contracts: [{ run_id: 'a' }] });
    const p = check(c, { ...P, enforcement: 'block' });
    if (p.length) throw new Error(`落ちた: ${JSON.stringify(p)}`);
  });
  ok('**知らない enforcement を黙って通さない**', () => {
    const p = check(coverage([], P, {}), { ...P, enforcement: 'off' });
    if (!p.some((x) => x.includes('enforcement'))) throw new Error(`落ちなかった: ${JSON.stringify(p)}`);
  });
  ok('**持ち主が人でなければ落ちる**（止める/止めないを機械が決めない）', () => {
    const p = check(coverage([], P, {}), { ...P, policy_owner: 'ai' });
    if (!p.some((x) => x.includes('持ち主は人'))) throw new Error(`落ちなかった: ${JSON.stringify(p)}`);
  });

  // --- 不適格理由の読み取り ---
  ok('不適格理由の日付は JST で数える', () => {
    const dir = fs.mkdtempSync(path.join(ROOT, '.tmp-ccov-'));
    try {
      // 2026-09-06T15:30Z は JST で 09-07
      fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ at: '2026-09-06T15:30:00Z' }));
      fs.writeFileSync(path.join(dir, 'b.json'), '{ 壊れたJSON');
      const got = rejectionDates({ dir });
      if (JSON.stringify(got) !== JSON.stringify(['2026-09-07'])) throw new Error(`got=${JSON.stringify(got)}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  ok('ディレクトリが無いのは異常ではない', () => {
    const got = rejectionDates({ dir: path.join(ROOT, '.tmp-ccov-nonexistent') });
    if (got.length !== 0) throw new Error(`got=${JSON.stringify(got)}`);
  });

  // --- 実データ ---
  ok('実データの台帳が検査を通る', () => {
    const policy = readJson(POLICY_PATH);
    const runs = readJson(path.join(ROOT, 'data/autopilot-runs.json')).runs;
    const contracts = readJson(path.join(ROOT, 'data/value-contracts.json')).contracts ?? [];
    const p = check(coverage(runs, policy, { contracts, rejectionDates: rejectionDates() }), policy);
    if (p.length) throw new Error(`実データで ${p.length} 件: ${p.join(' / ')}`);
  });

  console.log(bad ? `\n${bad}/${n} 失敗` : `selftest: ${n}/${n} 通過`);
  return bad;
}

// --- CLI ------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) process.exit(selftest() === 0 ? 0 : 1);
  const policy = readJson(POLICY_PATH);
  const runs = readJson(path.join(ROOT, 'data/autopilot-runs.json')).runs;
  const contracts = readJson(path.join(ROOT, 'data/value-contracts.json')).contracts ?? [];
  const cov = coverage(runs, policy, { contracts, rejectionDates: rejectionDates() });
  if (args.includes('--check')) {
    const problems = check(cov, policy);
    if (problems.length) {
      console.error('\n価値契約の被覆に問題:\n' + problems.map((p) => `  - ${p}`).join('\n') + '\n');
      process.exit(1);
    }
    console.log(cov.idle
      ? `契約被覆: **まだ空回り**（${cov.from} 以降の公開レーン出荷が 0 件）・enforcement=${policy.enforcement}`
      : `契約被覆: ${cov.covered}/${cov.n}・enforcement=${policy.enforcement}`);
    return;
  }
  console.log(render(cov, policy));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
