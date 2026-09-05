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
export const SVG_OUT = 'assets/img/autopilot/autonomy-timeline.svg';
/** 系列から引いた数字を載せている面。**増えたらここに足す。** */
export const CLAIM_SURFACES = ['docs/pr-autopilot-2026-09-body.md'];
const COVERAGE_PATH = path.join(ROOT, 'data/automation-coverage.json');
const AI_EXECUTES = new Set(['ai_autonomous', 'ai_executes_gated']);

/** 系列が読むリポジトリ。**この3つが揃っていないと数えない。** */
export const SERIES_REPOS = ['simplememo', 'simplememo-ios', 'simplememo-api'];

export const repoPath = (name) => (name === 'simplememo' ? ROOT : path.resolve(ROOT, '..', name));

/**
 * そのリポジトリの**本線の ref**。
 *
 * 【なぜ ref を固定するのか — 2026-09-05 に踏んだ】
 * `codeRatios` は `git log --all` で読んでいた。`--all` は**クローンに在る ref を
 * 全部**歩くので、**出る数字がクローンの状態しだいになる。**
 *
 * しかも `--rebuild` は浅いクローンを拒むので `git fetch --unshallow` が要り、
 * **それを実行するとリモートブランチが全部降りてくる**（実測 468本）。
 * つまり「指示どおりに直すと汚染される」形をしていた。実測:
 *
 *     2026-08 のコード行AI比率   HEAD 0.8264 / --all 0.4681 / main のみ 0.3600
 *
 * **3つとも違い、HEAD の値はどの引き方でも再現できなかった。**
 * 本線に固定すれば、誰がどこで回しても同じ数になる。
 */
function mainRefOf(cwd) {
  for (const ref of ['origin/main', 'main', 'origin/master', 'master']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
        { cwd, stdio: 'ignore' });
      return ref;
    } catch { /* 次を試す */ }
  }
  return null;
}

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
  // **HEAD ではなく本線から取る。**HEAD は「いまどのブランチに居るか」で変わるので、
  // 作業中のブランチによって証跡の初出月が動いてしまう。
  const ref = mainRefOf(cwd);
  if (!ref) return null;
  for (const args of [
    ['log', ref, '--reverse', '--format=%ad', '--date=format:%Y-%m', '--diff-filter=A', '--', rel],
    ['log', ref, '--reverse', '--format=%ad', '--date=format:%Y-%m', '--', rel],
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
  for (const name of SERIES_REPOS) {
    const cwd = repoPath(name);
    if (!fs.existsSync(cwd)) continue;
    // **`--all` をやめて本線に固定した（2026-09-05）。**理由は mainRefOf の頭に書いた。
    const ref = mainRefOf(cwd);
    if (!ref) continue;
    let raw;
    try {
      raw = execFileSync('git', [
        'log', ref, '--no-merges', '--date=format:%Y-%m', '--numstat',
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
 * 台帳から見出しの事実（何か月で何倍）を出す。**図と配信原稿で同じ関数を使う。**
 *
 * [2026-08-26] ここは `Math.max(0, findIndex(...))` だった。**起点が見つからないと
 * 黙って系列の先頭が起点になる。**実測すると「4か月で9倍」が「7か月で123倍」になった。
 * 起点が無いことは「先頭が起点」ではないので、**見出しを作らない側へ倒す。**
 */
export function headlineFacts(doc) {
  const pts = doc.points || [];
  const launchIdx = pts.findIndex((p) => p.month === doc.launch_month);
  if (launchIdx < 0) return { launchIdx, months: null, ratio: null, from: null, to: null };
  const from = pts[launchIdx]?.overall_automation_rate ?? null;
  const to = pts[pts.length - 1]?.overall_automation_rate ?? null;
  return {
    launchIdx,
    months: pts.length - 1 - launchIdx,
    ratio: from && to ? Math.round(to / from) : null,
    from,
    to,
  };
}

/**
 * 配信原稿が系列から引いた数字を、台帳と突き合わせる。
 *
 * [2026-08-26] **実測してから足した。**原稿の数字を1つずつ書き換えて
 * CI の node 検査 75本を回したところ、落ちたのは「62.8%」だけだった:
 *
 *   見出しの「18倍」  → どれも落ちない（台帳は **9倍**）
 *   要約の「1.6%」    → どれも落ちない（台帳は **1.5%**）
 *   表の「10.8%」     → どれも落ちない（台帳は **10.7%**）
 *   表の「6.7%」      → どれも落ちない（台帳は **6.6%**）
 *   注記の「194タスク」 → どれも落ちない（台帳は **196**）
 *
 * **倍率は記者がいちばん引用する数字**で、しかも同じ節の表と食い違っていた
 * （見出し18倍 / 表 6.7%→62.8% ＝ 9倍台）。原稿の中で2つの値が並ぶ形は
 * #618 のコミットメッセージが名指しで警告していたもの。
 */
export function timelineClaims(text, doc) {
  const problems = [];
  const { months, ratio } = headlineFacts(doc);
  const pct1 = (v) => (v * 100).toFixed(1);

  for (const m of text.matchAll(/(\d+)か月で、?\s*運営の自律度は(\d+)倍|運営の自律度は(\d+)か月で(\d+)倍/g)) {
    const mo = Number(m[1] ?? m[3]);
    const ra = Number(m[2] ?? m[4]);
    if (months === null || ratio === null) {
      problems.push(`「${mo}か月で${ra}倍」と書いてあるが、台帳から起点を決められない`
        + '（launch_month が系列に無い） — **検証できない数字を配信原稿に置かない**');
      continue;
    }
    if (mo !== months || ra !== ratio) {
      problems.push(`「${mo}か月で${ra}倍」が台帳と違う（台帳では ${months}か月で${ratio}倍）`
        + ' — **記者がいちばん引用する数字。**同じ節の表とも食い違う');
    }
  }

  // 系列の表（「2026-04（ローンチ）    6.7%」のような行）
  const byMonth = new Map((doc.points || []).map((p) => [p.month, p.overall_automation_rate]));
  // 行頭に限らない（「2026-02時点の1.6%」のような地の文も拾う）。
  // 原稿で当たる6箇所を実測して、誤検出が無いことを確かめてある。
  for (const m of text.matchAll(/(20\d{2}-\d{2})[^\d\n%]{0,20}([\d.]+)%/g)) {
    const want = byMonth.get(m[1]);
    if (want === undefined) continue;
    if (m[2] !== pct1(want)) {
      problems.push(`${m[1]} を ${m[2]}% と書いているが、台帳は ${pct1(want)}%`);
    }
  }

  for (const m of text.matchAll(/分母（(\d+)\s*タスク）/g)) {
    if (Number(m[1]) !== doc.denominator_tasks) {
      problems.push(`分母を ${m[1]} タスクと書いているが、台帳は ${doc.denominator_tasks}`);
    }
  }
  return problems;
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
  const { months, ratio } = headlineFacts(doc);
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
 * **浅いクローンで再計算してはいけない。**
 *
 * [2026-08-25] この関数は証跡ファイルの初出月を `git log` から取る。CI や
 * Claude Code のセッションは既定で shallow clone（このリポジトリでは51コミット・
 * 2026-08-22 まで）なので、**それより前の月が丸ごと取れない。**
 *
 * 実際に起きたこと: --check が「終点が現在値と一致しない、--rebuild を実行して
 * 同じコミットに含めること」と指示し、その通り実行したら **7点あった系列が
 * 2点（2026-07 と 2026-08）になった。**しかも --check はそれを通した ——
 * 終点は正しく、`points.length >= 2` も満たすため。
 * **指示どおりに直すと壊れ、壊れたことを検査が見逃す**形になっていた。
 *
 * `git fetch --unshallow` してから再実行すれば7点に戻る。
 */
function assertFullHistory() {
  const problems = [];
  for (const name of SERIES_REPOS) {
    const cwd = repoPath(name);
    // **無いものを黙って 0 として数えない（2026-09-05）。**旧版は
    // `if (!fs.existsSync(cwd)) continue;` で隣を素通りしていたので、
    // **隣が手元に無い環境で回すと、その分だけ少ない数が「実測」として出た。**
    if (!fs.existsSync(cwd)) { problems.push(`${name} が手元に無い`); continue; }
    let shallow = '';
    try {
      shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'],
        { cwd, encoding: 'utf8' }).trim();
    } catch {
      problems.push(`${name} で git が使えない`); continue;
    }
    if (shallow === 'true') problems.push(`${name} が浅いクローン`);
    if (!mainRefOf(cwd)) problems.push(`${name} に本線の ref（origin/main 等）が無い`);
  }
  if (problems.length === 0) return;
  throw new Error(
    '**揃っていない環境では再計算しない。**証跡の初出月とコード行を git log から取るので、\n'
    + '  欠けているぶんが**黙って少ない数**として系列に載る\n'
    + '  （浅いクローンで7点→2点になった事故、隣を素通りして少なく数えた事故がある）。\n\n'
    + problems.map((x) => `    - ${x}`).join('\n')
    + '\n\n  3リポジトリすべてを `git fetch --unshallow` してから実行すること。');
}

export function rebuild() {
  assertFullHistory();
  const doc = JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8'));
  const defined = doc.tasks.filter((t) => t.executor !== 'intentional_no').length;
  const dated = [];
  const undated = [];
  for (const t of doc.tasks) {
    if (!AI_EXECUTES.has(t.executor)) continue;
    // **since があればそれを優先する。**証跡に長寿命のデータ・コンテンツファイルを
    // 含むタスクは、min(証跡の初出月) だと稼働前の月に付いてしまう
    // （公開面の事実検査の証跡に faq.html が入っている、など）。
    if (t.since) {
      // **形を先に見る。**since は月キー（YYYY-MM）。日付まで書くと下の
      // 月送りループの `key === last` が永久に一致せず、配列長が溢れるまで回る
      // （2026-08-26 に実際に踏んだ。RangeError で落ちるので気づけたが、
      // 「なぜ落ちたか」がスタックからは読めなかった）。
      if (!/^\d{4}-\d{2}$/.test(t.since)) {
        throw new Error(`since は YYYY-MM（月）で書く: 「${t.since}」（${t.area} / ${t.task}）`);
      }
      dated.push({ area: t.area, task: t.task, month: t.since, source: 'since' });
      continue;
    }
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
    const r = rebuild();
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
    const out = argv[si + 1] || SVG_OUT;
    const abs = path.join(ROOT, out);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `${toSvg(doc)}\n`);
    console.log(`SVG: ${out}`);
    process.exit(0);
  }

  const problems = [];
  if (!Array.isArray(doc.points) || doc.points.length < 2) problems.push('points が2点未満');

  // [2026-08-25] **系列が痩せたことを検出する。**
  // points.length >= 2 だけでは、浅いクローンで再計算して過去が消えた系列を
  // 通してしまう（実際に7点→2点になっても、終点が合っていれば緑だった）。
  // 初回リリース月からの連続を要求する —— **月が飛んでいたら、それは
  // 「その月に何も無かった」ではなく「その月を見られていない」。**
  if (Array.isArray(doc.points) && doc.points.length >= 2) {
    const months = doc.points.map((p) => p.month);
    const [y0, m0] = months[0].split('-').map(Number);
    const [y1, m1] = months[months.length - 1].split('-').map(Number);
    const span = (y1 - y0) * 12 + (m1 - m0) + 1;
    if (span !== months.length) {
      problems.push(`系列の月が飛んでいる（${months[0]}〜${months[months.length - 1]} は ${span} ヶ月なのに ${months.length} 点）`
        + ' — **欠けた月は「何も無かった」ではなく「見られていない」。**浅いクローンで --rebuild していないか確認すること');
    }
    // [2026-08-26] ここは `doc.first_release_month` を見ていた。**台帳にその鍵は無い**
    // （在るのは launch_month）ので、**この規則は一度も発火できなかった。**
    // しかも無いと `&&` が偽になるので、飛ばしたことも出力に出ない。
    // 見出しの「ローンチから何倍」はこの起点で決まるから、ここが死ぬと
    // **起点の取り違えを誰も見ていない状態**になる。
    if (!doc.launch_month) {
      problems.push('launch_month が無い — **「ローンチから何倍」の起点が決まらない。**'
        + '起点が無いまま見出しを作ると、系列の先頭が黙って起点になる');
    } else if (!months.includes(doc.launch_month)) {
      problems.push(`launch_month ${doc.launch_month} が系列に無い（${months[0]}〜${months[months.length - 1]}）`
        + ' — **見出しは系列の先頭を起点にしてしまう。**倍率が実際より大きく出る');
    } else if (months[0] > doc.launch_month) {
      problems.push(`系列が ${months[0]} から始まっているが、ローンチは ${doc.launch_month}`
        + ' — 起点より後から始まる系列は「ローンチから何倍」を主張できない');
    }
  }
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

  // [2026-08-26] **配信原稿の数字も、62.8% 以外は誰も見ていなかった。**
  // 原稿の数字を1つずつ書き換えて CI の node 検査 75本を回した結果は
  // timelineClaims のコメントに書いてある。倍率・系列の表・分母が素通りしていた。
  for (const rel of CLAIM_SURFACES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      problems.push(`${rel} が無い — **系列から引いた数字を突き合わせる相手が消える**`);
      continue;
    }
    for (const c of timelineClaims(fs.readFileSync(abs, 'utf8'), doc)) problems.push(`${rel}: ${c}`);
  }

  // [2026-08-26] **生成物が台帳から遅れているのを、誰も見ていなかった。**
  //
  // 終点が現在値と合っているかは上で見ているのに、そこから作った SVG が
  // 台帳と合っているかは検査が1本も無かった。実測（CI の node 検査 75本に
  // 見出しを「4か月で9999倍」に書き換えた SVG を食わせた）→ **1本も落ちない。**
  //
  // 実際にずれていた: #550 で出した図は「4か月で18倍」で、当時は正しかった
  // （ローンチ月 3.5% → 61.3%）。#618 が台帳を組み直して 6.6% → 62.8% になり、
  // 正しい見出しは **9倍**。図だけが 18倍 のまま残っていた。**倍近い過大。**
  // その #618 のコミットメッセージ自身が「ずれたグラフはグラフとして
  // 存在してはいけない」と書いている —— 同じ壊れ方が1段下で再発していた。
  //
  // この図は docs/pr-autopilot-2026-09-body.md が参照している配信物。
  // **数字だけ更新して図を置き去りにする**のを、ここで止める。
  const svgAbs = path.join(ROOT, SVG_OUT);
  if (!fs.existsSync(svgAbs)) {
    problems.push(`${SVG_OUT} が無い — 配信原稿が参照している図が存在しない`);
  } else if (fs.readFileSync(svgAbs, 'utf8') !== `${toSvg(doc)}\n`) {
    const cur = (fs.readFileSync(svgAbs, 'utf8').match(/運営の自律度は[^<]*/) || ['(見出し無し)'])[0];
    const want = (toSvg(doc).match(/運営の自律度は[^<]*/) || ['(見出し無し)'])[0];
    // [2026-08-26] 見出しだけを出していたので、**見出しが同じで中身が違うとき
    // 「同じものが2つ並ぶ」意味不明なメッセージ**になっていた（実際に踏んだ）。
    // 差が見出しに出ていないなら、そう言う。
    problems.push(cur === want
      ? `${SVG_OUT} が台帳と違う — **見出しは同じだが中身が違う**（系列の点・目盛りなど）`
        + '\n      **数字だけ更新して図を置き去りにしない。**`--svg` を実行して同じコミットに含めること'
      : `${SVG_OUT} が台帳と違う — 図の見出し「${cur}」/ 台帳から作ると「${want}」`
        + '\n      **数字だけ更新して図を置き去りにしない。**`--svg` を実行して同じコミットに含めること');
  }

  console.log(render(doc));
  if (problems.length) {
    console.error('\n自律度の推移: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (argv.includes('--check')) console.log('\n終点は実測と一致。系列の形に問題なし。');
}
