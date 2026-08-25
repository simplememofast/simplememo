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
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const COVERAGE_PATH = path.join(ROOT, 'data/automation-coverage.json');

export const EXECUTORS = [
  'ai_autonomous', 'ai_executes_gated', 'ai_proposes',
  'human_only', 'nobody', 'intentional_no',
];
/** AIが実際に実行しているもの。率の分子。 */
const AI_EXECUTES = new Set(['ai_autonomous', 'ai_executes_gated']);
/** 誰かがやっているもの =「実施中タスク」。 */
const DOING = new Set(['ai_autonomous', 'ai_executes_gated', 'ai_proposes', 'human_only']);

export function validate(doc, { exists = (p) => fs.existsSync(path.join(ROOT, p)) } = {}) {
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
      }
      for (const f of t.evidence) {
        if (typeof f !== 'string') { problems.push(`${at}: evidence の要素が文字列でない`); continue; }
        // 隣のリポジトリを指した証跡は `scripts/crossrepo.mjs` が見る。
        //
        // **ここで素通りさせていたのが 2026-08-25 の穴だった。**元の意図は
        // 「確認できないものを確認したことにしない」で正しかったが、結果は
        // **「隣を指せば何でも実装済みとして数えられる」**だった
        // （39ファイル・18タスクが、隣のgit履歴に一度も存在しないまま
        // ai_executes_gated として数えられていた）。
        // 隣が見えるときは実物を、無いときは写しを見る形にして向こうへ移した。
        // **ここへ戻さないこと。**
        if (f.startsWith('../')) continue;
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

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
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

  // 【--doc】docs/automation-rate-2026-08.md の §0〜§2 を台帳から作り直す。
  //
  // **この文書は「機械生成」と名乗っていたが、生成する側が存在しなかった。**
  // 実際には手で書き写されていて、2026-08-25 の訂正で台帳が動いたときに
  // 古い数字がそのまま残った（⑫事業継続性 100.0% など）。
  // ロードマップが「この文書に数字を手で書き足さない」と定めている以上、
  // **名乗るなら在るべきなので作った。**§3以降（分析の散文）は触らない。
  if (argv.includes('--doc')) {
    const DOC = path.join(ROOT, 'docs/automation-rate-2026-08.md');
    const md = fs.readFileSync(DOC, 'utf8');
    const tailAt = md.indexOf('## 3. ');
    if (tailAt < 0) { console.error('§3 が見つからない — 生成範囲を決められない'); process.exit(1); }

    const o = s.overall;
    const c = o.counts;
    const p1 = (x) => `${(x * 100).toFixed(1)}%`;
    const areas = Object.entries(s.by_area)
      .sort((a, b) => (b[1].overall_automation_rate ?? -1) - (a[1].overall_automation_rate ?? -1));
    const ceilAll = (o.ai_executes + c.nobody) / o.defined;
    const ceilTop = (o.ai_executes + c.nobody + c.ai_proposes) / o.defined;
    const need = Math.ceil(0.953 * o.defined);

    const out = [];
    out.push('# 全領域の自動化率 — 実測', '');
    out.push(`> **測定日: ${doc.measured_at} / ${doc.tasks.length}タスク / ${areas.length}領域**`);
    out.push('> 台帳: `data/automation-coverage.json` ／ 集計: `node scripts/automation-rate.mjs`');
    out.push('> **§0〜§2 は `node scripts/automation-rate.mjs --doc` の出力。手で書き足さない。**');
    out.push('> ロードマップ: `autopilot-roadmap.md`');
    out.push('> **証跡の実在はCIが確認している** — このリポジトリ内は `automation-rate.mjs --check`、');
    out.push('> 隣のリポジトリを指したものは `crossrepo.mjs --check`。');
    out.push('', '---', '', '## 0. 全体', '');
    out.push('| 指標 | 値 | 分母 |', '|---|---:|---|');
    out.push(`| **総合自動化率** | **${p1(o.overall_automation_rate)}** | 定義タスク ${o.defined}（未実装を含む・**最も厳しい**） |`);
    out.push(`| AI実行率 | ${p1(o.ai_execution_rate)} | 実施中タスク ${o.doing}（未実装を除く） |`);
    out.push(`| AI関与率 | ${p1(o.ai_involvement_rate)} | 同上（提案・下書きまで含める・**最も甘い**） |`);
    out.push(`| カバー率 | ${p1(o.coverage_rate)} | そもそも誰かがやっているタスクの割合 |`);
    out.push('');
    out.push(`内訳: 自律 ${c.ai_autonomous} / ゲート付き実行 ${c.ai_executes_gated} / 提案 ${c.ai_proposes}`
      + ` / 人間 ${c.human_only} / **未実装 ${c.nobody}** / 意図的にやらない ${c.intentional_no}`);
    out.push('');
    out.push('**4つを必ず並べて出す。**分母を1つに決めると必ず都合のよい数字になる。');
    out.push('**総合自動化率とカバー率を隠してAI関与率だけ出すのが、ここで一番やってはいけないこと。**');
    out.push('', '### 読み方', '');
    out.push(`- **総合自動化率 ${p1(o.overall_automation_rate)}** — あるべきタスクのうちAIが実行している割合。**これが現在地**`);
    out.push(`- **カバー率 ${p1(o.coverage_rate)}** — 誰もやっていないタスクは**${c.nobody}件**`);
    out.push(`- AI関与率 ${p1(o.ai_involvement_rate)} / AI実行率 ${p1(o.ai_execution_rate)}`);
    out.push('', '### この先の天井', '', '```');
    out.push(`  現在                       ${String(o.ai_executes).padStart(3)} / ${o.defined} = ${p1(o.overall_automation_rate)}`);
    out.push(`  未実装 ${String(c.nobody).padStart(2)} 件を全部埋めても            →  ${p1(ceilAll)}`);
    out.push(`  提案どまり ${String(c.ai_proposes).padStart(2)} 件も実行へ上げたら        →  ${p1(ceilTop)}  ← **天井**`);
    out.push(`  95.3% に必要                          ${need} 件（あと ${need - o.ai_executes} 件）`);
    out.push('```', '');
    out.push(`**${p1(ceilTop)} が天井。**人間専任${c.human_only}件を人間に残す限り、`
      + `AI実行に回せるのは最大${o.ai_executes + c.nobody + c.ai_proposes}件。`);
    out.push('**90%超を数字として出すには、人間専任のどれかをAIに渡すしかない。**');
    out.push('', '---', '', '## 1. 領域別（総合自動化率の高い順）', '');
    out.push('| 領域 | 総合 | 実行 | 関与 | カバー | 自律/ゲート/提案/人間/未実装 |', '|---|---:|---:|---:|---:|---|');
    for (const [area, a] of areas) {
      const ac = a.counts;
      out.push(`| ${area} | **${p1(a.overall_automation_rate)}** | ${p1(a.ai_execution_rate)}`
        + ` | ${p1(a.ai_involvement_rate)} | ${p1(a.coverage_rate)}`
        + ` | ${ac.ai_autonomous}/${ac.ai_executes_gated}/${ac.ai_proposes}/${ac.human_only}/${ac.nobody} |`);
    }
    out.push('', '---', '', `## 2. タスク単位（全${doc.tasks.length}件）`, '');
    out.push('`node scripts/automation-rate.mjs --area <領域名の一部>` で同じものが出る。', '');
    const LABEL = {
      ai_autonomous: '自律', ai_executes_gated: 'ゲート付き実行', ai_proposes: '提案',
      human_only: '人間', nobody: '未実装', intentional_no: 'やらない',
    };
    for (const [area, a] of areas) {
      out.push(`### ${area}`, '');
      out.push(`総合 **${p1(a.overall_automation_rate)}** ／ 実行 ${p1(a.ai_execution_rate)}`
        + ` ／ 関与 ${p1(a.ai_involvement_rate)} ／ カバー ${p1(a.coverage_rate)}`, '');
      out.push('| 実行者 | タスク | 状況・証跡 |', '|---|---|---|');
      for (const t of doc.tasks.filter((x) => x.area === area)) {
        const cell = [
          (t.note ?? '').replace(/\n+/g, '<br>').replace(/\|/g, '\\|'),
          ...(t.evidence ?? []).map((e) => `\`${e}\``),
        ].filter(Boolean).join('<br>');
        out.push(`| ${LABEL[t.executor]} | ${t.task.replace(/\|/g, '\\|')} | ${cell} |`);
      }
      out.push('');
    }
    out.push('---', '');
    const next = out.join('\n') + md.slice(tailAt);

    // `--doc --check` は書かずに突き合わせる（sync_constants.js --check と同じ形）。
    // **生成物をコミットし忘れた状態を、CIが緑で通さないため。**
    if (argv.includes('--check')) {
      if (next !== md) {
        console.error('docs/automation-rate-2026-08.md が台帳と一致しない'
          + ' — `node scripts/automation-rate.mjs --doc` を実行して同じコミットに含めること');
        process.exit(1);
      }
      console.log('docs/automation-rate-2026-08.md は台帳と一致している。');
      process.exit(problems.length ? 1 : 0);
    }

    fs.writeFileSync(DOC, next);
    console.log(`docs/automation-rate-2026-08.md の §0〜§2 を再生成（${doc.tasks.length}タスク / ${areas.length}領域）`);
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
