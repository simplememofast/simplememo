#!/usr/bin/env node
/**
 * 性質テスト（property-based） — 例ではなく**不変条件**を検査する。
 *
 *   node scripts/property-tests.mjs           # 実行
 *   node scripts/property-tests.mjs --check   # CI
 *
 * 【なぜ例ベースのテストでは足りないか】
 * ドリル（autopilot-drill.mjs）は26の**具体例**を固定している。例は
 * 「この状態でこう振る舞う」を守るが、**書かなかった組み合わせは守らない。**
 * 実際に効くのは組み合わせで、2026-08-21の二重着手も
 * 「副系と再試行が同時に当日分なしと判定する」という**書かれていなかった組み合わせ**だった。
 *
 * ここでは状態を機械的に総当たり／ランダム生成して、**常に成り立つべき性質**を検査する。
 *
 * 【乱数は種を固定する】
 * 失敗したケースを再現できない検査は、落ちても直せない。種を固定し、
 * 失敗時は**その入力をそのまま出力**する（最小化まではやらない）。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, baseState, CODES } from './autopilot-gate.mjs';
import { summarize as summarizeBudget, validate as validateBudget } from './autopilot-budget.mjs';

/** 決定論的な擬似乱数（xorshift32）。種を変えない限り毎回同じ列。 */
function rng(seed = 20260822) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];

const ROUTES = ['actions', 'ccr-0730', 'ccr-0920', 'owner-session'];
const RUN_STATUS = ['queued', 'in_progress', 'completed', null];
const RUNNABLE = new Set([CODES.RUN, CODES.DEGRADE_MODEL, CODES.DEGRADE_EGRESS]);
/** 故障。**force でも予算でも飛び越えられてはいけない側。** */
const FAULTS = new Set([CODES.FAIL_CREDENTIAL, CODES.FAIL_API, CODES.FAIL_NO_MODEL]);

function randomState(r) {
  return baseState({
    route: pick(r, ROUTES),
    secretsPresent: r() < 0.8,
    budgetOver: r() < 0.3,
    runCapOverrun: r() < 0.25,
    branchClaimed: r() < 0.3,
    prodStatusDate: pick(r, ['2026-08-22', '2026-08-23']),
    mainStatusDate: pick(r, ['2026-08-22', '2026-08-23']),
    prTodayExists: r() < 0.3,
    primaryRunStatus: pick(r, RUN_STATUS),
    force: r() < 0.3,
    credentialRejected: r() < 0.2,
    githubApiReachable: r() > 0.2,
    modelsAvailable: pick(r, [null, [], ['claude-sonnet-5'], ['claude-opus-5', 'claude-sonnet-5']]),
    preferredModel: pick(r, [null, 'claude-opus-5', 'claude-sonnet-5']),
    egressBlocked: r() < 0.3,
    emergencyStop: r() < 0.15,
    emergencyStopReason: 'drill',
  });
}

const PROPERTIES = [
  {
    name: 'run フラグは判定コードと必ず一致する',
    why: '片方だけ見て分岐しているコードがあると、縮退時に「走らない」と誤読される',
    check: (s) => { const d = decide(s); return d.run === RUNNABLE.has(d.code); },
  },
  {
    name: '同じ状態からは同じ判定が出る（決定論）',
    why: '判定が揺れると、二重着手の原因が状態ではなく実装になる',
    check: (s) => decide(s).code === decide({ ...s }).code,
  },
  {
    name: 'force は故障を飛び越えられない',
    why: '**force は冪等チェックのためのもの。**資格情報も API 到達性もモデルの有無も作り出さない',
    check: (s) => {
      if (s.emergencyStop) return true;   // 緊急停止はさらに強い（別の性質で見る）
      const forced = decide({ ...s, force: true });
      if (!FAULTS.has(decide({ ...s, force: false }).code)) return true;
      return FAULTS.has(forced.code);
    },
  },
  {
    name: 'force は予算超過を飛び越えられない（主系）',
    why: '上限が force より弱いと、上限が「お願い」になる',
    check: (s) => {
      if (s.route !== 'actions' || !s.budgetOver) return true;
      const d = decide({ ...s, force: true, secretsPresent: true, credentialRejected: false,
        githubApiReachable: true, modelsAvailable: null, emergencyStop: false });
      return d.code === CODES.SKIP_BUDGET;
    },
  },
  {
    name: 'force は1回あたりの上限を飛び越えられない（主系）',
    why: '**1回上限が force より弱いと、超過した翌日に force で押し切れる。**月次上限と同じ強さで置く',
    check: (s) => {
      if (s.route !== 'actions' || !s.runCapOverrun) return true;
      const d = decide({ ...s, force: true, secretsPresent: true, credentialRejected: false,
        githubApiReachable: true, modelsAvailable: null, emergencyStop: false, budgetOver: false });
      return d.code === CODES.SKIP_RUN_CAP;
    },
  },
  {
    name: '1回上限で止まるのは主系だけ（二重化が承認待ちを吸収する）',
    why: '**副系まで止めると、人間のレビュー待ちの間だけ出荷がゼロになる。**'
      + '止めたいのは「同じ超過をもう一度やること」であって、出荷そのものではない',
    check: (s) => {
      const base = { ...s, credentialRejected: false, githubApiReachable: true,
        modelsAvailable: null, budgetOver: false, runCapOverrun: true,
        force: false, emergencyStop: false };
      const main = decide({ ...base, route: 'actions', secretsPresent: true });
      const sub = decide({ ...base, route: 'ccr-0730' });
      return main.code === CODES.SKIP_RUN_CAP && sub.code !== CODES.SKIP_RUN_CAP;
    },
  },
  {
    name: '1回上限は、報告すべき故障の前に出てこない',
    why: '**「上限で止まった」と報告されると、資格情報の失効に気づかない。**'
      + '安全装置が故障を隠す形は、08-24の即時失敗が2日気づかれなかったのと同じ構図',
    check: (s) => {
      const d = decide({ ...s, runCapOverrun: true, credentialRejected: true, emergencyStop: false });
      return d.code === CODES.FAIL_CREDENTIAL;
    },
  },
  {
    name: '緊急停止は、他のどの理由よりも先に出る',
    why: '**止めたいときに止まらない停止**を作らない。2番目以降にあると条件つきの停止になる',
    check: (s) => (s.emergencyStop ? decide(s).code === CODES.EMERGENCY_STOP : true),
  },
  {
    name: '緊急停止中は絶対に走らない',
    why: 'run が立つ経路が1つでもあれば、スイッチとして成立しない',
    check: (s) => (s.emergencyStop ? decide(s).run === false : true),
  },
  {
    name: '資格情報の拒否は、他のどの理由よりも先に出る',
    why: '**報告すべき故障を、正常な安全装置の陰に隠さない。**予算で止まったと報告されると失効に気づかない',
    check: (s) => (s.credentialRejected && !s.emergencyStop
      ? decide(s).code === CODES.FAIL_CREDENTIAL : true),
  },
  {
    name: '副系は「秘密鍵が無い」だけでは止まらない',
    why: '主系の秘密鍵の有無に副系が影響されると、二重化が二重化にならない',
    check: (s) => {
      if (s.route === 'actions' || s.emergencyStop) return true;
      const d = decide({ ...s, secretsPresent: false });
      return d.code !== CODES.SKIP_SECRETS;
    },
  },
  {
    name: '予算超過で止まるのは主系だけ（既知の非対称性）',
    why: '欠陥ではなく仕様。**ここが変わったことを検知するために固定する**',
    check: (s) => {
      const base = { ...s, credentialRejected: false, githubApiReachable: true,
        modelsAvailable: null, budgetOver: true, force: false, emergencyStop: false };
      const main = decide({ ...base, route: 'actions', secretsPresent: true });
      const sub = decide({ ...base, route: 'ccr-0730' });
      return main.code === CODES.SKIP_BUDGET && sub.code !== CODES.SKIP_BUDGET;
    },
  },
  {
    name: 'モデルが1つも無いときは絶対に走らない',
    why: '「使えるモデルが無い」を「今日は書くことが無い」と混ぜない',
    check: (s) => {
      if (!Array.isArray(s.modelsAvailable) || s.modelsAvailable.length) return true;
      const d = decide({ ...s, credentialRejected: false, emergencyStop: false });
      return !d.run;
    },
  },
  {
    name: 'egress遮断だけでは着手を止めない',
    why: '**止めるのではなく、できることを絞るのが正しい振る舞い**（2026-08-22の実績）',
    check: (s) => {
      const d = decide(baseState({ route: s.route, egressBlocked: true }));
      return d.run && d.code === CODES.DEGRADE_EGRESS;
    },
  },
];

/** 予算台帳の不変条件。**合計が合わない集計は、合っていないことに気づけない。** */
const BUDGET_PROPERTIES = [
  {
    name: '種別ごとの消化＋未分類 = 全体の消化',
    why: '種別に落ちなかった run を黙って捨てると、合計が合わなくなり「使っていない」に見える',
    check: (ledger, month) => {
      const s = summarizeBudget(ledger, month);
      const kinds = Object.values(s.by_task.kinds).reduce((a, v) => a + v.spent, 0);
      return Math.abs(kinds + s.by_task.unclassified_usd - s.spent) < 1e-9;
    },
  },
  {
    name: '経路別の消化の合計 = 全体の消化',
    why: '主系と副系のどちらにも入らない run があると、実費が過少に出る',
    check: (ledger, month) => {
      const s = summarizeBudget(ledger, month);
      return Math.abs(s.by_route.actions.spent + s.by_route.ccr.spent - s.spent) < 1e-9;
    },
  },
  {
    name: '残額 = 上限 − 消化',
    why: '表示だけ別計算になっていると、止まる境界と見える境界がずれる',
    check: (ledger, month) => {
      const s = summarizeBudget(ledger, month);
      return Math.abs(s.remaining - (s.cap - s.spent)) < 1e-9;
    },
  },
];

export function run({ cases = 400, seed = 20260822 } = {}) {
  const r = rng(seed);
  const failures = [];
  for (const p of PROPERTIES) {
    for (let i = 0; i < cases; i++) {
      const s = randomState(r);
      let ok = false, err = null;
      try { ok = p.check(s); } catch (e) { err = e.message; }
      if (!ok) { failures.push({ property: p.name, why: p.why, input: s, err }); break; }
    }
  }

  // 予算側は「作った台帳」で回す。実データ1件では性質が試されないため。
  const rb = rng(seed + 1);
  const KINDS = ['article', 'repair', 'analysis', 'pr', 'qa_triage', 'unknown-kind', undefined];
  for (const p of BUDGET_PROPERTIES) {
    for (let i = 0; i < 120; i++) {
      const runs = Array.from({ length: Math.floor(rb() * 8) }, () => ({
        date_jst: '2026-08-15',
        route: rb() < 0.5 ? 'actions' : 'ccr',
        total_cost_usd: Number((rb() * 5).toFixed(4)),
        task_kind: pick(rb, KINDS),
      }));
      const ledger = {
        budget: {
          monthly_usd_cap: 40, on_exceed: 'skip_run',
          task_budgets: {
            article: { monthly_usd_cap: 20, note: 'x' }, repair: { monthly_usd_cap: 8, note: 'x' },
            analysis: { monthly_usd_cap: 6, note: 'x' }, pr: { monthly_usd_cap: 4, note: 'x' },
            qa_triage: { monthly_usd_cap: 2, note: 'x' },
          },
        },
        runs,
      };
      let ok = false, err = null;
      try { ok = p.check(ledger, '2026-08'); } catch (e) { err = e.message; }
      if (!ok) { failures.push({ property: p.name, why: p.why, input: { runs }, err }); break; }
    }
  }

  // 台帳の検証器そのものの性質: 壊した台帳は必ず落ちる
  const broken = [
    ['上限が負', { monthly_usd_cap: -1, on_exceed: 'skip_run' }],
    ['on_exceed が未知', { monthly_usd_cap: 40, on_exceed: 'ignore' }],
    ['枠の合計が上限超過', { monthly_usd_cap: 10, on_exceed: 'skip_run',
      task_budgets: { article: { monthly_usd_cap: 20, note: 'x' } } }],
  ];
  for (const [label, budget] of broken) {
    if (validateBudget({ budget, runs: [] }).length === 0) {
      failures.push({ property: `壊れた台帳は落ちる: ${label}`, why: '壊れた台帳は「上限に永久に当たらない」を意味する', input: budget });
    }
  }

  return { total: PROPERTIES.length + BUDGET_PROPERTIES.length + broken.length, failures, cases, seed };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { total, failures, cases, seed } = run();
  console.log(`性質テスト: ${total - failures.length} / ${total} 性質`
    + `（1性質あたり最大 ${cases} ケース・種 ${seed}）\n`);
  for (const p of [...PROPERTIES, ...BUDGET_PROPERTIES]) {
    const f = failures.find((x) => x.property === p.name);
    console.log(`  ${f ? 'FAIL' : 'OK  '}  ${p.name}`);
    console.log(`        ${p.why}`);
    if (f) {
      console.log(`        反例: ${JSON.stringify(f.input)}`);
      if (f.err) console.log(`        例外: ${f.err}`);
    }
  }
  console.log('');
  console.log('  例ベースのドリルとの違い: あちらは「この状態でこう振る舞う」を26件固定する。');
  console.log('  ここは**書かなかった組み合わせ**を総当たりで踏む。2026-08-21の二重着手は、');
  console.log('  まさに書かれていなかった組み合わせだった。');
  if (failures.length) process.exit(1);
  if (process.argv.includes('--check')) console.log('\n  すべての不変条件が成立。反例なし。');
}
