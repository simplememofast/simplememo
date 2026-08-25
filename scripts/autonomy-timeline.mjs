#!/usr/bin/env node
/**
 * ローンチからの自律度の推移 — 台帳から再構成する。
 *
 *   node scripts/autonomy-timeline.mjs            # 表示
 *   node scripts/autonomy-timeline.mjs --json     # 機械可読
 *   node scripts/autonomy-timeline.mjs --check    # CI: 形と、終点が現在値と一致するか
 *   node scripts/autonomy-timeline.mjs --rebuild  # 再計算（git と隣リポジトリが要る）
 *
 * 【この系列が「仮」である理由を先に書く】
 * 総合自動化率を月次で測っていた期間は無い。実測は 2026-08-22 の1点だけ。
 * そこで **AI実行タスクの証跡ファイルが最初にコミットされた月**を
 * 「その工程がAIの手に渡った月」とみなして遡って再構成している。
 *
 * この近似が持つ歪みは3つ。**グラフに出すなら必ず併記する。**
 *   1. 証跡ファイルの追加日 ≒ 稼働開始日。実際には数日〜数週のずれがある
 *   2. **分母は現在の棚卸し（172タスク）を過去へ固定している。**
 *      当時は「やるべきことの一覧」自体が存在しなかった
 *   3. ai_proposes / human_only / nobody の当時の状態は復元していない。
 *      したがって**この系列は総合自動化率だけ**で、AI関与率やカバー率は出せない
 *
 * **終点だけは実測。** --check は終点が automation-rate.mjs の現在値と
 * 一致しない限り落ちる。ここがずれた系列は、グラフとして存在してはいけない。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { summarize } from './automation-rate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIMELINE_PATH = path.join(ROOT, 'data/autonomy-timeline.json');
const COVERAGE_PATH = path.join(ROOT, 'data/automation-coverage.json');
const AI_EXECUTES = new Set(['ai_autonomous', 'ai_executes_gated']);

/** 証跡パス → その月。隣リポジトリは `../name/` と素の `name/` の両表記を受ける。 */
function repoFor(p) {
  for (const name of ['simplememo-ios', 'simplememo-api']) {
    for (const pre of [`../${name}/`, `${name}/`]) {
      if (p.startsWith(pre)) return { cwd: path.resolve(ROOT, '..', name), rel: p.slice(pre.length) };
    }
  }
  return { cwd: ROOT, rel: p };
}

function firstMonth(p) {
  const { cwd, rel } = repoFor(p);
  if (!fs.existsSync(cwd)) return null;
  for (const args of [
    ['log', '--reverse', '--format=%ad', '--date=format:%Y-%m', '--diff-filter=A', '--', rel],
    ['log', '--reverse', '--format=%ad', '--date=format:%Y-%m', '--', rel],
  ]) {
    try {
      const out = execFileSync('git', args, { cwd, encoding: 'utf8' }).split('\n')[0].trim();
      if (out) return out;
    } catch { /* 履歴が浅い・パスが無い。次の手を試す */ }
  }
  return null;
}

/**
 * 月次のコード変更AI比率（実測）。3リポジトリを1パスずつ読む。
 * AI著者の定義: author に Claude を含む、または Co-authored-by に Claude を含む。
 * マージコミットは除く（PRマージは同じ行を二重に数える）。
 */
export function codeRatios() {
  const byMonth = new Map();
  for (const name of ['simplememo', 'simplememo-ios', 'simplememo-api']) {
    const cwd = name === 'simplememo' ? ROOT : path.resolve(ROOT, '..', name);
    if (!fs.existsSync(cwd)) continue;
    let raw;
    try {
      raw = execFileSync('git', [
        'log', '--all', '--no-merges', '--date=format:%Y-%m', '--numstat',
        '--format=\u0001%ad\u0002%an\u0002%(trailers:key=Co-authored-by,valueonly,separator=;)',
      ], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    } catch { continue; }
    let month = null, ai = false;
    for (const line of raw.split('\n')) {
      if (line.startsWith('\u0001')) {
        const [m, an, co] = line.slice(1).split('\u0002');
        month = m;
        ai = /claude/i.test(`${an} ${co ?? ''}`);
        if (!byMonth.has(month)) byMonth.set(month, { lines: 0, ai_lines: 0, commits: 0, ai_commits: 0 });
        const b = byMonth.get(month);
        b.commits += 1; if (ai) b.ai_commits += 1;
        continue;
      }
      const m = /^(\d+|-)\t(\d+|-)\t/.exec(line);
      if (!m || !month) continue;
      const n = (m[1] === '-' ? 0 : +m[1]) + (m[2] === '-' ? 0 : +m[2]);
      const b = byMonth.get(month);
      b.lines += n; if (ai) b.ai_lines += n;
    }
  }
  return byMonth;
}

/**
 * 配布用のSVG（ライト固定）。プレスリリースの図はライト面で使うため、
 * ここではテーマ切り替えをしない。テーマ対応が要る面では描画側で持つ。
 * 色は dataviz の検証済みカテゴリカル 1・2（#2a78d6 / #eb6834）。
 */
export function toSvg(doc) {
  const W = 880, H = 330;
  const M = { t: 58, r: 132, b: 50, l: 62 };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  const pts = doc.points;
  const x = (i) => M.l + (iw * i) / (pts.length - 1);
  const y = (v) => M.t + ih * (1 - v);
  const S1 = '#2a78d6', S2 = '#eb6834';
  const INK = '#14181d', INK2 = '#5a6570', INK3 = '#8b959f';
  const GRID = '#e5e7e6', SURFACE = '#ffffff';
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const pct = (v) => `${(v * 100).toFixed(1)}%`;

  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'Zen Kaku Gothic New','Hiragino Sans','Noto Sans JP',sans-serif" role="img" aria-label="運営タスクの自律度とコード変更のAI比率の月次推移">`);
  o.push(`<rect width="${W}" height="${H}" fill="${SURFACE}"/>`);
  // 見出しの「か月」と「倍」は**系列から計算する。**手で書くと実装が進むたびに
  // 古くなり、しかも「グラフは正しいのに見出しだけ嘘」という一番たちの悪い形で残る
  // （実際に 10倍 と書いたまま 17倍 になっていた）。
  // 起点はローンチ月（グラフの注記もそこを基準にしている）。
  const launchIdx = Math.max(0, pts.findIndex((p) => p.month === doc.launch_month));
  const from = pts[launchIdx]?.overall_automation_rate ?? null;
  const to = pts[pts.length - 1]?.overall_automation_rate ?? null;
  const months = pts.length - 1 - launchIdx;
  const ratio = from && to ? Math.round(to / from) : null;
  const headline = ratio
    ? `運営の自律度は${months}か月で${ratio}倍。コードは最初から高いまま。`
    : '運営の自律度とコード変更のAI比率';
  o.push(`<text x="${M.l}" y="27" fill="${INK}" font-size="17" font-weight="700">${esc(headline)}</text>`);
  o.push(`<text x="${M.l}" y="46" fill="${INK2}" font-size="12">総合自動化率（未実装を分母に含む最も厳しい数え方）／ 2026-08 のみ実測・他は証跡の初出月からの再構成</text>`);

  // グリッドは1pxソリッド・面から1段だけ外す
  for (let v = 0; v <= 1.0001; v += 0.25) {
    o.push(`<line x1="${M.l}" y1="${y(v).toFixed(1)}" x2="${M.l + iw}" y2="${y(v).toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`);
    o.push(`<text x="${M.l - 10}" y="${(y(v) + 4).toFixed(1)}" fill="${INK3}" font-size="11" text-anchor="end" font-variant-numeric="tabular-nums">${Math.round(v * 100)}%</text>`);
  }
  pts.forEach((p, i) => {
    const label = p.month === doc.launch_month ? `${p.month.slice(5)}月 ローンチ` : `${p.month.slice(5)}月`;
    o.push(`<text x="${x(i).toFixed(1)}" y="${M.t + ih + 20}" fill="${p.month === doc.launch_month ? INK2 : INK3}" font-size="11" text-anchor="middle">${esc(label)}</text>`);
  });

  const line = (key, color) => {
    const seg = pts.map((p, i) => (p[key] === null || p[key] === undefined ? null : `${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`)).filter(Boolean);
    return `<polyline points="${seg.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  };

  // 面はウォッシュ（1割）。主系列のみ
  const areaPts = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.overall_automation_rate).toFixed(1)}`).join(' ');
  o.push(`<polygon points="${M.l},${M.t + ih} ${areaPts} ${M.l + iw},${M.t + ih}" fill="${S1}" fill-opacity="0.1"/>`);
  o.push(line('code_ai_line_rate', S2));
  o.push(line('overall_automation_rate', S1));

  // 端点だけ強調（面色の2pxリングつき）
  const last = pts.length - 1;
  const dot = (i, v, color) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4.5" fill="${color}" stroke="${SURFACE}" stroke-width="2"/>`;
  o.push(dot(last, pts[last].overall_automation_rate, S1));
  if (pts[last].code_ai_line_rate != null) o.push(dot(last, pts[last].code_ai_line_rate, S2));
  const li = pts.findIndex((p) => p.month === doc.launch_month);
  if (li >= 0) o.push(dot(li, pts[li].overall_automation_rate, S1));

  // 直接ラベル（端点と極値のみ。全点には振らない）。文字は必ずインク色
  o.push(`<text x="${x(last) + 12}" y="${(y(pts[last].overall_automation_rate) + 4).toFixed(1)}" fill="${INK}" font-size="13" font-weight="700" font-variant-numeric="tabular-nums">${pct(pts[last].overall_automation_rate)}</text>`);
  o.push(`<text x="${x(last) + 12}" y="${(y(pts[last].overall_automation_rate) + 20).toFixed(1)}" fill="${INK2}" font-size="10.5">運営タスク</text>`);
  if (pts[last].code_ai_line_rate != null) {
    o.push(`<text x="${x(last) + 12}" y="${(y(pts[last].code_ai_line_rate) + 4).toFixed(1)}" fill="${INK}" font-size="13" font-weight="700" font-variant-numeric="tabular-nums">${pct(pts[last].code_ai_line_rate)}</text>`);
    o.push(`<text x="${x(last) + 12}" y="${(y(pts[last].code_ai_line_rate) + 20).toFixed(1)}" fill="${INK2}" font-size="10.5">コード変更</text>`);
  }
  if (li >= 0) {
    o.push(`<text x="${x(li).toFixed(1)}" y="${(y(pts[li].overall_automation_rate) - 12).toFixed(1)}" fill="${INK}" font-size="12" font-weight="700" text-anchor="middle" font-variant-numeric="tabular-nums">${pct(pts[li].overall_automation_rate)}</text>`);
  }

  // 凡例（2系列なので必ず置く）
  const ly = H - 12;
  o.push(`<line x1="${M.l}" y1="${ly - 4}" x2="${M.l + 18}" y2="${ly - 4}" stroke="${S1}" stroke-width="2" stroke-linecap="round"/>`);
  o.push(`<text x="${M.l + 24}" y="${ly}" fill="${INK2}" font-size="11">運営タスクの自律度（再構成）</text>`);
  o.push(`<line x1="${M.l + 210}" y1="${ly - 4}" x2="${M.l + 228}" y2="${ly - 4}" stroke="${S2}" stroke-width="2" stroke-linecap="round"/>`);
  o.push(`<text x="${M.l + 234}" y="${ly}" fill="${INK2}" font-size="11">コード変更のAI著者率（実測）</text>`);
  o.push('</svg>');
  return o.join('\n');
}

/**
 * 浅いクローンでは再計算できない。**黙って短い系列を出すほうが危ない。**
 *
 * この系列は「証跡ファイルが最初にコミットされた月」を稼働開始月とみなして
 * 遡る。`git clone --depth` された場所では、その月が**クローン境界まで
 * 繰り上がる。**2026-08-25 に実際に起きた: 3リポジトリとも浅いセッションで
 * `--rebuild` を回したところ、**7点の系列が2点に潰れ**、ローンチ月からの
 * 推移がまるごと消えた（しかも「日付が取れなかったタスク 0件」と表示された
 * ので、成功したように見えた）。
 *
 * 落とすほうを選ぶ。**短くなった系列は、間違っていることが見た目で分からない。**
 */
export function shallowRepos() {
  return ['.', '../simplememo-api', '../simplememo-ios']
    .filter((r) => fs.existsSync(path.join(ROOT, r)))
    .filter((r) => fs.existsSync(path.join(ROOT, r, '.git/shallow')))
    .map((r) => (r === '.' ? 'simplememo' : r.replace('../', '')));
}

export function rebuild() {
  const shallow = shallowRepos();
  if (shallow.length) {
    throw new Error(
      `浅いクローンでは再計算しない: ${shallow.join(', ')}\n`
      + '  証跡の初出月がクローン境界まで繰り上がり、**過去の月がまるごと消える。**\n'
      + '  完全な履歴のある場所で `git fetch --unshallow` してから実行すること。\n'
      + '  終点（実測）だけを直したい場合は、この系列ではなく automation-rate.mjs の\n'
      + '  現在値に合わせて points の最後の1点を更新する。',
    );
  }
  const doc = JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8'));
  const defined = doc.tasks.filter((t) => t.executor !== 'intentional_no').length;
  const dated = [];
  const undated = [];
  for (const t of doc.tasks) {
    if (!AI_EXECUTES.has(t.executor)) continue;
    // **since があればそれを優先する。**証跡に長寿命のデータ・コンテンツファイルを
    // 含むタスクは、min(証跡の初出月) だと稼働前の月に付いてしまう
    // （公開面の事実検査の証跡に faq.html が入っている、など）。
    if (t.since) { dated.push({ area: t.area, task: t.task, month: t.since, source: 'since' }); continue; }
    const months = (t.evidence || []).map(firstMonth).filter(Boolean);
    if (months.length) dated.push({ area: t.area, task: t.task, month: months.sort()[0], source: 'evidence' });
    else undated.push({ area: t.area, task: t.task });
  }
  const months = [...new Set(dated.map((d) => d.month))].sort();
  const first = months[0], last = months[months.length - 1];
  const all = [];
  for (let y = +first.slice(0, 4), m = +first.slice(5); ; m++) {
    if (m > 12) { m = 1; y++; }
    const key = `${y}-${String(m).padStart(2, '0')}`;
    all.push(key);
    if (key === last) break;
  }
  const code = codeRatios();
  let cum = 0;
  const points = all.map((month) => {
    const added = dated.filter((d) => d.month === month).length;
    cum += added;
    const c = code.get(month);
    return {
      month,
      newly_ai_executed: added,
      cumulative: cum,
      overall_automation_rate: cum / defined,
      // コード側は実測。null は「その月にコミットが無い」ではなく「測れなかった」
      code_ai_line_rate: c && c.lines ? c.ai_lines / c.lines : null,
      code_ai_commit_rate: c && c.commits ? c.ai_commits / c.commits : null,
      code_lines: c ? c.lines : null,
    };
  });
  return { defined, points, undated, dated };
}

function fmt(x) { return `${(x * 100).toFixed(1)}%`; }

function render(doc) {
  const lines = [`自律度の推移（再構成・分母 ${doc.denominator_tasks} タスク固定）`, ''];
  const max = Math.max(...doc.points.map((p) => p.overall_automation_rate));
  for (const p of doc.points) {
    const bar = '█'.repeat(Math.round((p.overall_automation_rate / max) * 34));
    const mark = p.month === doc.measured_point.month ? ' ← 実測' : '';
    const code = p.code_ai_line_rate === null || p.code_ai_line_rate === undefined
      ? '   —  ' : fmt(p.code_ai_line_rate).padStart(6);
    lines.push(`  ${p.month}  ${fmt(p.overall_automation_rate).padStart(6)}  ${bar}${mark}`);
    lines.push(`  ${' '.repeat(7)} コード ${code}`);
  }
  lines.push('', `  ${doc.launch_note}`, '', '  この系列の限界:');
  for (const l of doc.known_limits) lines.push(`    - ${l}`);
  return lines.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);

  if (argv.includes('--rebuild')) {
    let r;
    try {
      r = rebuild();
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    const doc = JSON.parse(fs.readFileSync(TIMELINE_PATH, 'utf8'));
    doc.denominator_tasks = r.defined;
    doc.points = r.points;
    doc.undated_tasks = r.undated;
    fs.writeFileSync(TIMELINE_PATH, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`再計算: ${r.points.length} 点 / 日付が取れなかったAI実行タスク ${r.undated.length} 件`);
    process.exit(0);
  }

  const doc = JSON.parse(fs.readFileSync(TIMELINE_PATH, 'utf8'));

  if (argv.includes('--json')) { console.log(JSON.stringify(doc, null, 2)); process.exit(0); }

  const si = argv.indexOf('--svg');
  if (si >= 0) {
    const out = argv[si + 1] || 'assets/img/autopilot/autonomy-timeline.svg';
    const abs = path.join(ROOT, out);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `${toSvg(doc)}\n`);
    console.log(`SVG: ${out}`);
    process.exit(0);
  }

  const problems = [];
  if (!Array.isArray(doc.points) || doc.points.length < 2) problems.push('points が2点未満');
  let prev = -1;
  for (const p of doc.points) {
    if (p.cumulative < prev) problems.push(`${p.month}: 累計が減っている（AI実行タスクは取り消されない前提の系列）`);
    prev = p.cumulative;
  }
  // 終点は実測と一致しなければならない。ここがずれた系列はグラフにしてはいけない
  const live = summarize(JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8')));
  const tail = doc.points[doc.points.length - 1];
  const liveRate = live.overall.overall_automation_rate;
  if (Math.abs(tail.overall_automation_rate - liveRate) > 0.0005) {
    problems.push(`終点 ${fmt(tail.overall_automation_rate)} が現在値 ${fmt(liveRate)} と一致しない`
      + ' — `node scripts/autonomy-timeline.mjs --rebuild` を実行して同じコミットに含めること');
  }
  if (doc.denominator_tasks !== live.overall.defined) {
    problems.push(`分母 ${doc.denominator_tasks} が現在の定義タスク数 ${live.overall.defined} と違う（--rebuild）`);
  }
  if (!doc.known_limits?.length) problems.push('known_limits が空 — 再構成の系列を限界なしで出さない');

  console.log(render(doc));
  if (problems.length) {
    console.error('\n自律度の推移: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (argv.includes('--check')) console.log('\n終点は実測と一致。系列の形に問題なし。');
}
