#!/usr/bin/env node
/**
 * 全領域の自動化率 — 開発以外もすべて同じ物差しで測る。
 *
 *   node scripts/automation-rate.mjs             # 領域別の内訳と全体
 *   node scripts/automation-rate.mjs --json      # 機械可読
 *   node scripts/automation-rate.mjs --check     # CI: 台帳の形と証跡の実在
 *   node scripts/automation-rate.mjs --area 経営 # 1領域だけタスク単位で出す
 *
 * 【4つの率を必ず並べて出す理由】
 * 分母を1つに決めると、必ず都合のよい数字になる。
 *   総合自動化率 … nobody（誰もやっていない）を分母に含む。**一番低く出る。一番正しい**
 *   AI実行率     … 実施中のタスクだけを分母にする
 *   AI関与率     … 提案・下書きまで含める。**一番高く出る**
 *   カバー率     … そもそも誰かがやっているタスクの割合
 *
 * **総合自動化率とカバー率を隠して AI関与率だけ出すのが、ここで一番やってはいけないこと。**
 * だから render は4つを常に同時に出し、片方だけ返すAPIを作らない。
 *
 * 【証跡を強制する理由】
 * ai_autonomous / ai_executes_gated は evidence を持たないとCIが落ちる。
 * ここを緩めると台帳が自己申告になり、「やっていることにする」だけで
 * 数字が上がるようになる。それはこの台帳の存在理由そのものを壊す。
 */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const COVERAGE_PATH = path.join(ROOT, 'data/automation-coverage.json');

export const EXECUTORS = [
  'ai_autonomous', 'ai_executes_gated', 'ai_proposes',
  'human_only', 'nobody', 'intentional_no',
];
/** AIが実際に実行しているもの。率の分子。 */
const AI_EXECUTES = new Set(['ai_autonomous', 'ai_executes_gated']);

/**
 * **執行面の証跡**（実行しているものだけが持てる種類のファイル）。
 *
 * 【なぜ要るか — 2026-08-27 に踏んだ穴】
 * それまでの規則は「`ai_autonomous` / `ai_executes_gated` は evidence を持て」だけで、
 * **evidence が何であるかは見ていなかった。**ところが AI は提案・下書きの段階でも
 * 文書を作るので、**提案側のファイルが証跡欄に入っている行が大量にある。**
 *
 * 実測: `blocker: policy_boundary` の24件のうち **20件は既に evidence が埋まっていた。**
 * その状態で executor を書き換えると、**検査を一度も落とさずに総合自動化率が
 * 65.2% → 77.3% に上がる**（実際に台帳を倒して計測した）。
 * 原稿は「証跡ファイルを指せないタスクをAI側に数えることはCIが禁止している」と
 * 書いていたが、**指せてしまうので禁止できていなかった。**
 *
 * 【この規則が見ているもの】
 * 「手順書・方針・設計書・報告書」と「ワークフロー・スクリプト・実装・テスト・台帳・
 * 実行ログ」を分ける。前者は**やると決めた**ことの証跡で、後者は**やっている**ことの証跡。
 * RUNBOOK も VISION も設計文書も、**読んだだけでは1件も実行されない。**
 *
 * 【これで捕まらないもの】
 * スクリプトを証跡欄に置きさえすれば通るので、**「そのスクリプトが実際に走ったか」は
 * 見ていない。**種類の判定であって、実行の判定ではない。次に強くするならそこ
 * （実行の記録＝run_id や台帳の行を指させる）。**今できたのは、散文だけで
 * 「AIが実行している」と数える経路を塞いだところまで。**
 *
 * 他リポジトリのパス（`../`）も**種類だけは判定できる**ので同じ規則を当てる
 * （実在確認は下の理由でしない）。
 */
const EXECUTION_SURFACE = [
  /\.(mjs|cjs|js|ts|tsx|py|rb|swift|yml|yaml|sh|sql)$/i, // ワークフロー・スクリプト・実装・テスト・マイグレーション
  /(^|\/)data\/[^/]+\.json$/i,                      // 台帳（機械が書く／機械が読む）
  /(^|\/)[^/]*LOG[^/]*\.[a-z]+$/i,                   // 実行ログ（AUTOPILOT_LOG.md 等）
];
export const isExecutionSurface = (p) => EXECUTION_SURFACE.some((re) => re.test(p));
/** 誰かがやっているもの =「実施中タスク」。 */
const DOING = new Set(['ai_autonomous', 'ai_executes_gated', 'ai_proposes', 'human_only']);

/**
 * 隣のリポジトリの作業ツリーが、取得済みの origin より何コミット遅れているか。
 * **ネットワークは触らない**（既に fetch 済みの ref だけを見る）。
 * 判定できなければ null —— 「遅れていない」と混ぜない。
 */
export function behindOrigin(repoRel, { root = ROOT } = {}) {
  const dir = path.join(root, repoRel);
  const git = (args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  try {
    let upstream;
    try { upstream = git(['rev-parse', '--abbrev-ref', 'origin/HEAD']); }
    catch { upstream = 'origin/main'; }
    git(['rev-parse', '--verify', `${upstream}^{commit}`]);
    return Number(git(['rev-list', '--count', `HEAD..${upstream}`]));
  } catch {
    return null; // ref が無い・gitでない・取得できない
  }
}

export function validate(doc, {
  exists = (p) => fs.existsSync(path.join(ROOT, p)),
  behind = behindOrigin,
} = {}) {
  const problems = [];
  if (!doc || !Array.isArray(doc.tasks)) return ['tasks must be an array'];
  const seen = new Set();
  doc.tasks.forEach((t, i) => {
    const at = `tasks[${i}]「${t.task ?? '?'}」`;
    if (!t.area) problems.push(`${at}: area is required`);
    if (!t.task) problems.push(`${at}: task is required`);
    const key = `${t.area} ${t.task}`;
    if (seen.has(key)) problems.push(`${at}: 同じ領域に同じタスクが2回ある`);
    seen.add(key);

    if (!EXECUTORS.includes(t.executor)) {
      problems.push(`${at}: executor must be one of ${EXECUTORS.join('|')} (got ${JSON.stringify(t.executor)})`);
    }

    if (!Array.isArray(t.evidence)) {
      problems.push(`${at}: evidence must be an array`);
    } else {
      // 「AIがやっている」は証跡なしに主張しない
      if (AI_EXECUTES.has(t.executor) && t.evidence.length === 0) {
        problems.push(`${at}: executor=${t.executor} なのに evidence が空 — 証跡なしに「AIがやっている」と数えない`);
      } else if (AI_EXECUTES.has(t.executor) && !t.evidence.some(isExecutionSurface)) {
        // **散文だけで「実行している」と数えない。**手順書・方針・設計書は
        // 「やると決めた」の証跡であって「やっている」の証跡ではない
        problems.push(`${at}: executor=${t.executor} なのに執行面の証跡が1つも無い（${t.evidence.join(' , ')}）`
          + ' — ワークフロー・スクリプト・実装・テスト・台帳・実行ログのいずれかを指すこと');
      }
      for (const f of t.evidence) {
        if (typeof f !== 'string') { problems.push(`${at}: evidence の要素が文字列でない`); continue; }
        // **他リポジトリは、見える場所でだけ見る。**
        // GitHub Actions は1リポジトリしかチェックアウトしないので、そこでは
        // 確認しようがない（確認できないものを、確認したことにしない）。
        // ただし3リポジトリが揃ったセッションでは確認できる —— そして
        // **確認していなかったせいで、取り下げたファイルを指す証跡が
        // 3件、誰にも気づかれずに残った**（2026-08-27 実測）。
        // 隣が無ければ黙って飛ばし、在れば見る。**片側でしか鳴らないが、
        // 鳴らない側は「無い」ではなく「見えない」**。
        if (f.startsWith('../')) {
          const sibling = f.split('/').slice(0, 2).join('/');   // ../simplememo-ios
          if (!exists(sibling)) continue;
          if (!exists(f)) {
            // **「隣に無い」と「隣が古い」を混ぜない。**
            // 2026-09-01、隣が origin より2コミット遅れているだけの作業ツリーで
            // この規則が2件鳴り、**それを「main でも落ちる欠陥」として報告した。**
            // 隣を最新にしたら消えた。片方（このリポジトリ）だけ stash して
            // 確かめたので、**隣が変数だと気づかないまま結論を出していた。**
            //
            // ここが効くのは誤報そのものより、**次の一手**。この文面を読んだ人の
            // 素直な直し方は「証跡の行を消す」で、それは**まだマージされていない
            // だけの正しい参照を、黙って台帳から落とす。**遅れを見せて止める。
            const n = behind(sibling);
            const hint = n === null
              ? ' — 隣の遅れは判定できなかった（gitでない・ref未取得）。**消す前に隣を更新して確かめ直すこと。**'
              : n > 0
                ? ` — **隣の作業ツリーが origin より ${n} コミット遅れている。**`
                  + '先に隣を更新して確かめ直すこと。**台帳の行を消す前に。**'
                : '';
            problems.push(`${at}: evidence "${f}" が存在しない（隣のリポジトリは在るのに）${hint}`);
          }
          continue;
        }
        if (!exists(f)) problems.push(`${at}: evidence "${f}" が存在しない`);
      }
    }

    // 「なぜ無いか」の無い未実装は、次の棚卸しで拾えない
    if ((t.executor === 'nobody' || t.executor === 'intentional_no') && !t.note) {
      problems.push(`${at}: executor=${t.executor} なのに note が無い — 理由の無い未実装は棚卸しできない`);
    }
  });
  return problems;
}

function tally(tasks) {
  const c = Object.fromEntries(EXECUTORS.map((e) => [e, 0]));
  for (const t of tasks) c[t.executor] = (c[t.executor] || 0) + 1;
  // 意図的にやらないものは分母から外す。やらないと決めたことを未達に数えない。
  const defined = tasks.length - c.intentional_no;
  const doing = tasks.filter((t) => DOING.has(t.executor)).length;
  const aiExec = c.ai_autonomous + c.ai_executes_gated;
  const rate = (n, d) => (d > 0 ? n / d : null);
  return {
    counts: c,
    defined,
    doing,
    ai_executes: aiExec,
    overall_automation_rate: rate(aiExec, defined),
    ai_execution_rate: rate(aiExec, doing),
    ai_involvement_rate: rate(aiExec + c.ai_proposes, doing),
    coverage_rate: rate(doing, defined),
  };
}

export function summarize(doc) {
  const areas = [...new Set(doc.tasks.map((t) => t.area))];
  return {
    overall: tally(doc.tasks),
    by_area: Object.fromEntries(areas.map((a) => [a, tally(doc.tasks.filter((t) => t.area === a))])),
  };
}

const pct = (x) => (x === null ? '  n/a' : `${(x * 100).toFixed(1)}%`.padStart(6));

function renderTally(s, label) {
  const c = s.counts;
  return [
    label,
    `    総合自動化率 ${pct(s.overall_automation_rate)}   AI実行率 ${pct(s.ai_execution_rate)}`
    + `   AI関与率 ${pct(s.ai_involvement_rate)}   カバー率 ${pct(s.coverage_rate)}`,
    `    自律 ${c.ai_autonomous} / ゲート付き実行 ${c.ai_executes_gated} / 提案 ${c.ai_proposes}`
    + ` / 人間 ${c.human_only} / 未実装 ${c.nobody}`
    + (c.intentional_no ? ` / 意図的にやらない ${c.intentional_no}` : ''),
  ].join('\n');
}

const MARK = {
  ai_autonomous: '自律    ',
  ai_executes_gated: 'ゲート  ',
  ai_proposes: '提案    ',
  human_only: '人間    ',
  nobody: '未実装  ',
  intentional_no: 'やらない',
};


// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const SELFTEST_BREAKAGES = [
  ['area が無ければ落ちる', (d) => { delete d.tasks[0].area; }],
  ['task が無ければ落ちる', (d) => { delete d.tasks[0].task; }],
  ['**同じ領域に同じタスクが2回**あれば落ちる（分母が水増しされる）', (d) => { d.tasks.push({ ...d.tasks[0] }); }],
  ['知らない executor は落ちる', (d) => { d.tasks[0].executor = 'なんとなくAI'; }],
  // 2026-08-27 に足した規則。**この穴は実際に踏んだ**（policy_boundary 24件のうち
  // 20件が提案側の証跡を既に持っていて、executor を倒すだけで 65.2% → 77.3% になった）
  ['**散文だけを証跡にしてAI実行に数える**と落ちる', (d) => {
    const t = d.tasks.find((x) => AI_EXECUTES.has(x.executor));
    t.evidence = ['docs/obsidian/AUTOPILOT_RUNBOOK.md'];
  }],
  // 2026-08-27。**隣のリポジトリが在るときだけ鳴る規則**なので、
  // 自己テストも隣が在るときだけ意味を持つ（CI では実データが通ることだけ見る）。
  ['**隣のリポジトリに無いファイルを証跡にする**と落ちる（隣が見えるときだけ）', (d) => {
    const t = d.tasks.find((x) => x.evidence.some((e) => e.startsWith('../')));
    if (!t) throw new Error('前提が崩れた: 他リポジトリを指す証跡が台帳から消えている');
    const repo = t.evidence.find((e) => e.startsWith('../')).split('/').slice(0, 2).join('/');
    if (!fs.existsSync(path.join(ROOT, repo))) {
      // 隣が無い場所（CI）では、この壊し方は落ちなくて正しい。
      // **落ちないことを「通った」と呼ばない**ので、代わりに別の壊し方を当てる
      d.tasks[0].evidence = [];
      d.tasks[0].executor = 'ai_executes_gated';
      return;
    }
    t.evidence.push(`${repo}/src/この-ファイルは-存在しない.ts`);
  }],
  ['提案どまりの行を、証跡を変えずにAI実行へ倒すと落ちる', (d) => {
    const t = d.tasks.find((x) => x.executor === 'ai_proposes' && !x.evidence.some(isExecutionSurface));
    if (!t) throw new Error('前提が崩れた: 散文だけを証跡に持つ ai_proposes が台帳から消えている');
    t.executor = 'ai_executes_gated';
  }],
];
// [2026-09-01] **「隣に無い」と「隣が古い」を混ぜない。**
// 隣が origin より2コミット遅れているだけの作業ツリーでこの規則が2件鳴り、
// それを「main でも落ちる欠陥」として報告した（誤り）。隣を最新にしたら消えた。
// **この文面を読んだ人の素直な直し方は「証跡の行を消す」**で、それは
// まだマージされていないだけの正しい参照を黙って落とす。だから遅れを見せる。
const STALE_SIBLING_SCENARIOS = [
  ['**隣が遅れているときは、そう書く**（消す前に更新させる）', () => {
    const p = validate(
      { tasks: [{ id: 'x', domain: 'd', title: 't', executor: 'ai_executes_gated',
        evidence: ['../simplememo-api/src/ない.ts'] }] },
      { exists: (f) => f === '../simplememo-api', behind: () => 2 });
    assert(p.some((m) => /2 コミット遅れている/.test(m)), p.join(' / '));
    assert(p.some((m) => /台帳の行を消す前に/.test(m)), p.join(' / '));
  }],
  ['隣が最新なら余計な注記を足さない（本当に無いのだから）', () => {
    const p = validate(
      { tasks: [{ id: 'x', domain: 'd', title: 't', executor: 'ai_executes_gated',
        evidence: ['../simplememo-api/src/ない.ts'] }] },
      { exists: (f) => f === '../simplememo-api', behind: () => 0 });
    assert(p.some((m) => /が存在しない/.test(m)), p.join(' / '));
    assert(!p.some((m) => /遅れている/.test(m)), p.join(' / '));
  }],
  ['**遅れを判定できなかったら、判定できなかったと書く**（最新扱いにしない）', () => {
    const p = validate(
      { tasks: [{ id: 'x', domain: 'd', title: 't', executor: 'ai_executes_gated',
        evidence: ['../simplememo-api/src/ない.ts'] }] },
      { exists: (f) => f === '../simplememo-api', behind: () => null });
    assert(p.some((m) => /判定できなかった/.test(m)), p.join(' / '));
  }],
  ['隣が無ければ、そもそも鳴らない（CI はここ）', () => {
    const p = validate(
      { tasks: [{ id: 'x', domain: 'd', title: 't', executor: 'ai_executes_gated',
        evidence: ['../simplememo-api/src/ない.ts'] }] },
      { exists: () => false, behind: () => { throw new Error('隣が無いのに遅れを見に行った'); } });
    assert(!p.some((m) => /が存在しない/.test(m)), p.join(' / '));
  }],
];

const SCENARIOS = ledgerScenarios(
  () => JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8')),
  (d) => validate(d),
  SELFTEST_BREAKAGES,
).concat(STALE_SIBLING_SCENARIOS);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 ? 0 : 1);
  const argv = process.argv.slice(2);
  const doc = JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8'));
  const problems = validate(doc);
  const s = summarize(doc);

  const ai = argv.indexOf('--area');
  if (ai >= 0 && argv[ai + 1]) {
    const tasks = doc.tasks.filter((t) => t.area.includes(argv[ai + 1]));
    if (!tasks.length) { console.error(`領域 "${argv[ai + 1]}" は台帳に無い`); process.exit(1); }
    console.log(renderTally(tally(tasks), tasks[0].area));
    console.log('');
    for (const t of tasks) {
      console.log(`  ${MARK[t.executor]}  ${t.task}`);
      if (t.note) console.log(`            ${t.note}`);
      if (t.evidence.length) console.log(`            -> ${t.evidence.join(' , ')}`);
    }
    process.exit(problems.length ? 1 : 0);
  }

  if (argv.includes('--json')) {
    console.log(JSON.stringify(s, null, 2));
    process.exit(problems.length ? 1 : 0);
  }

  console.log(renderTally(
    s.overall,
    `全領域（${doc.tasks.length} タスク / ${Object.keys(s.by_area).length} 領域・${doc.measured_at} 時点）`,
  ));
  console.log('');
  console.log('  領域別（総合自動化率の高い順）');
  console.log('');
  console.log('     総合   実行   関与  カバー  自律/ゲート/提案/人間/未実装  領域');
  const rows = Object.entries(s.by_area)
    .sort((a, b) => (b[1].overall_automation_rate ?? -1) - (a[1].overall_automation_rate ?? -1));
  for (const [area, a] of rows) {
    const c = a.counts;
    const mix = `${c.ai_autonomous}/${c.ai_executes_gated}/${c.ai_proposes}/${c.human_only}/${c.nobody}`;
    console.log(`   ${pct(a.overall_automation_rate)} ${pct(a.ai_execution_rate)} ${pct(a.ai_involvement_rate)} ${pct(a.coverage_rate)}  ${mix.padEnd(26)} ${area}`);
  }
  console.log('');
  console.log('  この測り方の限界:');
  for (const l of doc.known_limits || []) console.log(`    - ${l}`);

  if (problems.length) {
    console.error('\n台帳の不整合:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (argv.includes('--check')) console.log('\n台帳の形と証跡に問題なし。');
}
