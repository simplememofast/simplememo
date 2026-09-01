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
    check: (s, decide) => { const d = decide(s); return d.run === RUNNABLE.has(d.code); },
  },
  {
    name: '同じ状態からは同じ判定が出る（決定論）',
    why: '判定が揺れると、二重着手の原因が状態ではなく実装になる',
    check: (s, decide) => decide(s).code === decide({ ...s }).code,
  },
  {
    name: 'force は故障を飛び越えられない',
    why: '**force は冪等チェックのためのもの。**資格情報も API 到達性もモデルの有無も作り出さない',
    check: (s, decide) => {
      if (s.emergencyStop) return true;   // 緊急停止はさらに強い（別の性質で見る）
      const forced = decide({ ...s, force: true });
      if (!FAULTS.has(decide({ ...s, force: false }).code)) return true;
      return FAULTS.has(forced.code);
    },
  },
  {
    name: 'force は予算超過を飛び越えられない（主系）',
    why: '上限が force より弱いと、上限が「お願い」になる',
    check: (s, decide) => {
      if (s.route !== 'actions' || !s.budgetOver) return true;
      const d = decide({ ...s, force: true, secretsPresent: true, credentialRejected: false,
        githubApiReachable: true, modelsAvailable: null, emergencyStop: false });
      return d.code === CODES.SKIP_BUDGET;
    },
  },
  {
    name: 'force は1回あたりの上限を飛び越えられない（主系）',
    why: '**1回上限が force より弱いと、超過した翌日に force で押し切れる。**月次上限と同じ強さで置く',
    check: (s, decide) => {
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
    check: (s, decide) => {
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
    check: (s, decide) => {
      const d = decide({ ...s, runCapOverrun: true, credentialRejected: true, emergencyStop: false });
      return d.code === CODES.FAIL_CREDENTIAL;
    },
  },
  {
    name: '緊急停止は、他のどの理由よりも先に出る',
    why: '**止めたいときに止まらない停止**を作らない。2番目以降にあると条件つきの停止になる',
    check: (s, decide) => (s.emergencyStop ? decide(s).code === CODES.EMERGENCY_STOP : true),
  },
  {
    name: '緊急停止中は絶対に走らない',
    why: 'run が立つ経路が1つでもあれば、スイッチとして成立しない',
    check: (s, decide) => (s.emergencyStop ? decide(s).run === false : true),
  },
  {
    name: '資格情報の拒否は、他のどの理由よりも先に出る',
    why: '**報告すべき故障を、正常な安全装置の陰に隠さない。**予算で止まったと報告されると失効に気づかない',
    check: (s, decide) => (s.credentialRejected && !s.emergencyStop
      ? decide(s).code === CODES.FAIL_CREDENTIAL : true),
  },
  {
    name: '副系は「秘密鍵が無い」だけでは止まらない',
    why: '主系の秘密鍵の有無に副系が影響されると、二重化が二重化にならない',
    check: (s, decide) => {
      if (s.route === 'actions' || s.emergencyStop) return true;
      const d = decide({ ...s, secretsPresent: false });
      return d.code !== CODES.SKIP_SECRETS;
    },
  },
  {
    name: '予算超過で止まるのは主系だけ（既知の非対称性）',
    why: '欠陥ではなく仕様。**ここが変わったことを検知するために固定する**',
    check: (s, decide) => {
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
    check: (s, decide) => {
      if (!Array.isArray(s.modelsAvailable) || s.modelsAvailable.length) return true;
      const d = decide({ ...s, credentialRejected: false, emergencyStop: false });
      return !d.run;
    },
  },
  {
    name: 'egress遮断だけでは着手を止めない',
    why: '**止めるのではなく、できることを絞るのが正しい振る舞い**（2026-08-22の実績）',
    check: (s, decide) => {
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
    name: '公表する残額は 上限 − 消化（出せない月は null で、上限側が引き受ける）',
    why: '表示だけ別計算になっていると、止まる境界と見える境界がずれる',
    // [2026-09-01] **不変条件を緩めたのではなく、対象を分けた。**
    // 副系が測れていない月の `spent` は下限なので、`cap - spent` は残高ではなく
    // 上限。そこを「残り」と呼ぶと、測っていないぶんが「まだ使える」に化ける。
    // なので remaining は null にし、`remaining_upper_bound` が同じ算術を持つ。
    // **元の狙い（表示が別計算にならないこと）はどちらの枝でも守る。**
    check: (ledger, month) => {
      const s = summarizeBudget(ledger, month);
      const eq = (a) => Math.abs(a - (s.cap - s.spent)) < 1e-9;
      if (!eq(s.remaining_upper_bound)) return false;
      return s.ccr_measured ? eq(s.remaining) : s.remaining === null;
    },
  },
];

/**
 * 生成器の被覆。**性質テストが黙って無力になる一つ目の道**を塞ぐ。
 *
 * `if (!s.budgetOver) return true;` のような番人つきの性質は、生成器がその
 * 状態を作らなければ全ケースが素通りして「成立」と表示される —— **空虚な真。**
 * 実際に生成されていることを、性質と同じ強さで検査する。
 */
const REQUIRED_COVERAGE = [
  ['主系かつ予算超過', (s) => s.route === 'actions' && s.budgetOver,
    'force が予算を越えられないかは、この状態が生成されて初めて試される'],
  ['主系かつ1回上限超過', (s) => s.route === 'actions' && s.runCapOverrun,
    '1回上限の強さは、この状態が生成されて初めて試される'],
  ['緊急停止中', (s) => s.emergencyStop,
    '**止めたいときに止まるか**を試す唯一の入口'],
  ['資格情報の拒否（緊急停止でない）', (s) => s.credentialRejected && !s.emergencyStop,
    '故障が安全装置の陰に隠れないかを試す入口'],
  ['副系（緊急停止でない）', (s) => s.route !== 'actions' && !s.emergencyStop,
    '二重化が二重化になっているかを試す入口'],
  ['使えるモデルが空配列', (s) => Array.isArray(s.modelsAvailable) && s.modelsAvailable.length === 0,
    '「モデルが無い」と「書くことが無い」を混ぜていないかを試す入口'],
  ['egress 遮断', (s) => s.egressBlocked, '縮退して走る経路を試す入口'],
  ['force あり', (s) => s.force, 'force が越えられない壁を試す入口'],
];
const MIN_HITS = 5;

/** **検証器そのもの**を試す壊れた台帳。落ちなければ「上限に永久に当たらない」。 */
const BROKEN_LEDGERS = [
  ['上限が負', { monthly_usd_cap: -1, on_exceed: 'skip_run' }],
  ['on_exceed が未知', { monthly_usd_cap: 40, on_exceed: 'ignore' }],
  ['枠の合計が上限超過', { monthly_usd_cap: 10, on_exceed: 'skip_run',
    task_budgets: { article: { monthly_usd_cap: 20, note: 'x' } } }],
];

export function run({ cases = 400, seed = 20260822, decider = decide, gen = randomState } = {}) {
  const r = rng(seed);
  const failures = [];
  for (const p of PROPERTIES) {
    for (let i = 0; i < cases; i++) {
      const s = gen(r);
      let ok = false, err = null;
      try { ok = p.check(s, decider); } catch (e) { err = e.message; }
      if (!ok) { failures.push({ property: p.name, why: p.why, input: s, err }); break; }
    }
  }

  // **空虚な真を防ぐ。**番人つきの性質は、その状態が生成されなければ
  // 400ケース全部が素通りして「成立」と表示される。生成器を狭めた瞬間に
  // ここが落ちる（性質のほうは OK のまま出てしまう）。
  const rc = rng(seed);
  const sample = Array.from({ length: cases }, () => gen(rc));
  for (const [label, pred, why] of REQUIRED_COVERAGE) {
    const hits = sample.filter(pred).length;
    if (hits < MIN_HITS) {
      failures.push({
        property: `生成器が「${label}」を作る`,
        why,
        input: { hits, cases, 意味: '**この前提を持つ性質は空虚に通っている**' },
      });
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
  for (const [label, budget] of BROKEN_LEDGERS) {
    if (validateBudget({ budget, runs: [] }).length === 0) {
      failures.push({
        property: `壊れた台帳は落ちる: ${label}`,
        why: '壊れた台帳は「上限に永久に当たらない」を意味する',
        input: budget,
      });
    }
  }

  return {
    total: PROPERTIES.length + BUDGET_PROPERTIES.length
      + REQUIRED_COVERAGE.length + BROKEN_LEDGERS.length,
    failures, cases, seed,
  };
}

// ── 自己テスト（**この性質テストが落ちることを確かめる**） ─────────────
//
// 性質テストが黙って無力になる道は2つある。どちらも「緑」に見える。
//
//   (1) **前提が一度も生成されない。** `if (!s.budgetOver) return true;` の
//       ような番人つきの性質は、生成器がその状態を作らなければ
//       400ケース全部が素通りして「成立」と表示される。**空虚な真。**
//   (2) **壊れた判定器でも通る。** 性質の書き方が緩いと、decide が
//       間違っていても不変条件だけは満たしてしまう。
//
// (1) は生成器の被覆を数え、(2) は**わざと壊した判定器を食わせて、
// 名指しした性質が落ちること**を見る。落ちるのを見ていない性質テストは、
// 例ベースのテストより弱い（例は少なくとも1件は必ず実行される）。

/** わざと壊した判定器と、**それを捕まえるはずの性質**。 */
const MUTANTS = [
  ['run を常に立てる', (d) => (s) => ({ ...d(s), run: true }),
    'run フラグは判定コードと必ず一致する'],
  ['判定コードを常に RUN にする', (d) => (s) => ({ ...d(s), code: CODES.RUN }),
    'run フラグは判定コードと必ず一致する'],
  ['緊急停止を無視する', (d) => (s) => d({ ...s, emergencyStop: false }),
    '緊急停止は、他のどの理由よりも先に出る'],
  ['資格情報の拒否を無視する', (d) => (s) => d({ ...s, credentialRejected: false }),
    '資格情報の拒否は、他のどの理由よりも先に出る'],
  ['force が予算超過を飛び越える', (d) => (s) => (s.force && s.budgetOver ? d({ ...s, budgetOver: false }) : d(s)),
    'force は予算超過を飛び越えられない（主系）'],
  ['force が1回上限を飛び越える', (d) => (s) => (s.force && s.runCapOverrun ? d({ ...s, runCapOverrun: false }) : d(s)),
    'force は1回あたりの上限を飛び越えられない（主系）'],
  ['1回上限を副系にも当てる', (d) => (s) => (s.runCapOverrun ? d({ ...s, route: 'actions', secretsPresent: true }) : d(s)),
    '1回上限で止まるのは主系だけ（二重化が承認待ちを吸収する）'],
  ['判定が呼ぶたびに揺れる', (d) => { let n = 0; return (s) => ({ ...d(s), code: (n++ % 2) ? '__ゆらぎ__' : d(s).code }); },
    '同じ状態からは同じ判定が出る（決定論）'],
];

export function selftest() {
  let bad = 0;
  const say = (ok, name, detail) => {
    if (ok) { console.log(`  ok   ${name}`); return; }
    bad += 1;
    console.log(`  FAIL ${name}\n       ${detail}`);
  };

  // (1) 生成器を1つだけ狭めて、**本番の被覆判定が落ちること**を見る。
  //     ここで並行実装を持つと、自己テストだけ通って本体が無力になりうる。
  const narrowed = (r) => { const st = randomState(r); st.budgetOver = false; return st; };
  const narrowNames = run({ gen: narrowed }).failures.map((f) => f.property);
  say(narrowNames.includes('生成器が「主系かつ予算超過」を作る'),
    '**予算超過を作らない生成器にすると落ちる**（空虚な真の検出）',
    `落ちなかった。**生成器を狭めても性質テストは緑のまま**（落ちたのは ${narrowNames.join(' / ') || 'なし'}）`);

  // 狭めた生成器では、その性質が捕まえるはずの壊し方も**捕まらなくなる**。
  // 空虚な真が「ただの表示の問題」ではないことを、ここで固定する。
  const blindNames = run({
    gen: narrowed,
    decider: ((d) => (st) => (st.force && st.budgetOver ? d({ ...st, budgetOver: false }) : d(st)))(decide),
  }).failures.map((f) => f.property);
  say(!blindNames.includes('force は予算超過を飛び越えられない（主系）'),
    '空虚になった性質は、対応する壊し方を**見逃す**（被覆が表示だけの問題でないこと）',
    '見逃さなかった。前提が要らない性質なら、被覆の一覧から外すべき');

  // (2) 壊した判定器を、名指しした性質が捕まえるか
  for (const [label, wrap, expected] of MUTANTS) {
    const { failures } = run({ decider: wrap(decide) });
    const names = failures.map((f) => f.property);
    say(names.includes(expected), `**壊すと落ちる: ${label}**`,
      names.length
        ? `落ちたが別の性質だった。「${expected}」は通ってしまった（落ちたのは ${names.join(' / ')}）`
        : `**どの性質も落ちなかった —— この壊し方は誰も見ていない**`);
  }

  // (3) 素の判定器では1つも落ちない（常に落ちる検査も、何も見ていないのと同じ）
  const clean = run().failures;
  say(clean.length === 0, '素の判定器では反例が出ない',
    `${clean.length} 件落ちた: ${clean.map((f) => f.property).join(' / ')}`);

  const total = 2 + MUTANTS.length + 1;
  console.log(`\n  自己テスト ${total} 件中 ${bad} 件失敗`);
  return bad;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest() === 0 ? 0 : 1);
  const { total, failures, cases, seed } = run();
  console.log(`性質テスト: ${total - failures.length} / ${total} 性質`
    + `（1性質あたり最大 ${cases} ケース・種 ${seed}）\n`);
  const COVERAGE_ROWS = REQUIRED_COVERAGE.map(([label, , why]) => ({
    name: `生成器が「${label}」を作る`, why,
  }));
  const BROKEN_ROWS = BROKEN_LEDGERS.map(([label]) => ({
    name: `壊れた台帳は落ちる: ${label}`,
    why: '壊れた台帳は「上限に永久に当たらない」を意味する',
  }));
  // **数えたものは全部並べる。**総数だけ増やして行を出さないと、
  // 落ちたときに「27 / 28」とだけ出てどれか分からない。
  for (const p of [...PROPERTIES, ...BUDGET_PROPERTIES, ...COVERAGE_ROWS, ...BROKEN_ROWS]) {
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
