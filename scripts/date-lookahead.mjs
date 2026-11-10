#!/usr/bin/env node
/**
 * 日付の先読み — **暦が進むだけで落ちる検査を、落ちる前に見つける。**
 *
 *   node scripts/date-lookahead.mjs --selftest   # 自己テスト（faketime もネットも要らない）
 *   node scripts/date-lookahead.mjs --check      # 台帳 data/date-lookahead.json の形（CI）
 *   node scripts/date-lookahead.mjs --run        # 先読み（libfaketime の `faketime` が要る）
 *   node scripts/date-lookahead.mjs --run --json out.json --markdown out.md
 *
 * 【なぜ作るか】
 * SEO Validation が通ったコミットだけが main に入る。その検査のいくつかは
 * **期限を持っている**（保留の until、定点観測の鮮度、公開表示の確認日）。
 * 期限は誰もコミットしなくても過ぎる。過ぎた瞬間に main も全PRも同じ検査で落ち、
 * 日次同期も Decision Monitor の公開PRも止まる。**原因がどのPRにも出ない。**
 *
 *   2026-09-19  /autopilot/ の自律スコア（JST の日付で動く）で全PRが落ちた
 *   2026-11-09  リンクゲートの保留7行（until 11-08）が失効し、全PRが [HUB]/[ORPHAN] 80件で
 *               落ちた。Decision Monitor の公開PR #2281 がそこで落ち、39時間詰まった
 *   2026-11-10  時計をずらして測ったら、7日以内に同じ形が3件あった
 *               （11-15 00:00 /obsidian/ ハブの保留、11-15 09:00 言及ウォッチ、
 *                 11-17 09:00 App Store 表示の確認日）
 *
 * どれも**前の日までは緑**で、気づく手段が「落ちてから」しか無かった。
 * この道具は、落ちる側の検査をそのまま使って、落ちる日を先に測る。
 *
 * 【どう測るか】
 * 1. SEO Validation（.github/workflows/seo-check.yml）から、PR を止める検査の
 *    コマンドを導出する（scripts/preflight.mjs と同じ導出）。合成行で導出から外れる
 *    `seo-check.js` 本体は名指しで足す（exit 1 は警告のみ・2 以上が失敗、を CI と同じに扱う）。
 * 2. 時計を horizon_days 先にずらして全部回す（libfaketime。node も python も子プロセスも
 *    同じ時計を見る）。
 * 3. 落ちた検査だけ、**本物の時計でもう一度回す。**いまも落ちるなら日付のせいではない
 *    （環境か、いまの赤）。いまは通るものだけが候補。
 * 4. 候補を、**同じ先の時刻でもう一度回す。**通ってしまうなら再現しない失敗（重い回の時間切れ、
 *    検査中に木が書き換わった等）で、期限ではない。予告せず「再現しなかった」として別に出す。
 *    2026-11-10 の初回の実測で、これが無いと2件を horizon の時刻の期限として出した。
 * 5. 残った検査だけを、JST 0時と 9時（= UTC 0時）の境目ごとに回して、**最初に落ちる時刻**を出す。
 *
 * 【この検査が見ないこと】
 * - **データが毎日入る前提の検査。**`if:` つきの段（運転台帳の当日行など）は導出に入らない。
 *   固定したデータで日付だけ進めると必ず落ちるので、先読みでは偽の警報になる。
 * - **時計以外の未来。**その日までに誰かが台帳を更新すれば落ちない。ここが出すのは
 *   「いまのまま誰も何もしなければ落ちる」という条件つきの予告。
 * - **子プロセスが本物の時計で動く検査。**環境変数を絞って子を起動する自己テストは、
 *   親だけ時計がずれて落ちる。台帳（known_artifacts）に理由つきで名指しし、警報から外す。
 *
 * 【計器が壊れたときに黙らない】
 * faketime が無い・時計がずれていない・導出が0本・落ちた数が多すぎる、のどれかなら
 * exit 2（判定不能）。**「期限は無い」と「測れなかった」を同じ緑にしない。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assert, run as runScenarios } from './lib/selftest.mjs';
import { extractCommands } from './preflight.mjs';
import { runChecks } from './lib/preflight-runner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = path.join(ROOT, '.github/workflows/seo-check.yml');
export const LEDGER_PATH = path.join(ROOT, 'data/date-lookahead.json');

const DAY = 86400e3;
const JST = 9 * 3600e3;

/**
 * 導出に入らない合成行のうち、**日付で落ちうる本体**。
 * seo-check.yml は `node scripts/seo-check.js || EXIT_CODE=$?` と書き、2 以上だけを失敗にする。
 * 2026-11-09 に全PRを止めたのはこの検査の [HUB]/[ORPHAN] で、導出だけでは先読みから漏れる。
 */
export const SEO_MAIN = Object.freeze({ runner: 'node', script: 'scripts/seo-check.js', args: Object.freeze([]) });
export const SEO_MAIN_LINE = 'node scripts/seo-check.js || EXIT_CODE=$?';

/** runChecks が付けるラベルと同じ形（照合に使う）。 */
export const labelOf = (command) => `${command.script} ${command.args.join(' ')}`.trim().replace(/^scripts\//, '');

const isSeoMain = (args) => args.length === 1 && args[0] === SEO_MAIN.script;

/** `faketime` に渡す絶対時刻（UTC）。子プロセスには TZ=UTC を渡して解釈を固定する。 */
export function faketimeArg(ms) {
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

/** 表示用の JST。 */
export function jst(ms) {
  const iso = new Date(ms + JST).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} JST`;
}

/**
 * 境目の直後の時刻を、いまから horizon まで並べる。
 * **JST 0時**（todayTokyo で決まる期限）と **JST 9時 = UTC 0時**（UTC の日付差で決まる期限）の
 * 2種類。境目の30分後を測る（境目ちょうどは、どちら側に倒れるかが実装で割れる）。
 * 最後に horizon そのものを足す。
 */
export function probeInstants(nowMs, horizonDays) {
  const end = nowMs + horizonDays * DAY;
  const out = [];
  // その日の UTC 0時（= JST 9時）と、UTC 15時（= 翌 JST 0時）
  const firstUtcMidnight = Math.floor(nowMs / DAY) * DAY;
  for (let t = firstUtcMidnight; t <= end + DAY; t += DAY) {
    for (const boundary of [t, t + 15 * 3600e3]) {
      const probe = boundary + 30 * 60e3;
      if (probe > nowMs && probe < end) out.push(probe);
    }
  }
  out.push(end);
  return [...new Set(out)].sort((a, b) => a - b);
}

/**
 * 最初に落ちる時刻を二分探索で出す。**いま通って horizon で落ちる**ことは呼び出し側が確かめてある。
 * 期限は一度過ぎたら戻らない（単調）前提で探す。見つけた境目の**次の点も落ちるか**を1回だけ測り、
 * 通ってしまったら monotonic: false を返す（その検査は「ある日だけ落ちる」形で、境目が複数ある）。
 * **それより前に一度落ちて戻る形までは見つけない**（全点を測らないと分からない）。
 *
 * @param {number[]} probes   昇順。最後の要素（horizon）は落ちると分かっている
 * @param {(ms:number)=>boolean} failsAt
 */
export function firstFailing(probes, failsAt) {
  assert(probes.length > 0, 'probes が空');
  let lo = -1; // 通ると分かっている添字（-1 = いま）
  let hi = probes.length - 1; // 落ちると分かっている添字
  const seen = new Map([[hi, true]]);
  const at = (i) => {
    if (!seen.has(i)) seen.set(i, failsAt(probes[i]) === true);
    return seen.get(i);
  };
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (at(mid)) hi = mid; else lo = mid;
  }
  const monotonic = hi + 1 >= probes.length ? true : at(hi + 1);
  return { first_fail: probes[hi], last_pass: lo >= 0 ? probes[lo] : null, monotonic, probed: seen.size };
}

/**
 * 時計をずらした回の失敗を3つに分ける。**純関数。**
 *   already_red … 本物の時計でも落ちる（日付のせいではない。環境か、いまの赤）
 *   artifacts   … 台帳が名指しした、時計ずらしの副作用で落ちる検査
 *   cliffs      … いまは通り、時計を進めると落ちる検査（＝予告する対象）
 */
export function classify(shiftedFailed, failsNow, knownArtifacts) {
  const known = new Map(knownArtifacts.map((k) => [k.check, k.why]));
  const out = { already_red: [], artifacts: [], cliffs: [] };
  for (const label of shiftedFailed) {
    if (failsNow.has(label)) out.already_red.push(label);
    else if (known.has(label)) out.artifacts.push({ check: label, why: known.get(label) });
    else out.cliffs.push(label);
  }
  return out;
}

/**
 * 候補を「先の時刻で測り直しても落ちる」ものと、再現しないものに分ける。**純関数。**
 * 1周目の失敗を1回の観測のまま期限にしない —— 二分探索は horizon で落ちる前提で始めるので、
 * 再現しない失敗は「horizon ちょうどから落ちる期限」に化ける。
 */
export function splitReproducible(candidates, failsAgain) {
  const out = { cliffs: [], unstable: [] };
  for (const label of candidates) (failsAgain(label) === true ? out.cliffs : out.unstable).push(label);
  return out;
}

/** 台帳の形。問題の配列を返す。 */
export function validateLedger(doc, commandLabels = null) {
  const problems = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['台帳がオブジェクトでない'];
  const unknownKeys = Object.keys(doc).filter((k) => !['$comment', 'horizon_days', 'max_cliffs', 'known_artifacts'].includes(k));
  if (unknownKeys.length) problems.push(`知らないキー: ${unknownKeys.join(', ')} — 打ち間違いは黙って既定値になる`);
  if (!Number.isInteger(doc.horizon_days) || doc.horizon_days < 1 || doc.horizon_days > 31) {
    problems.push('horizon_days は 1〜31 の整数（先読みする日数）');
  }
  if (!Number.isInteger(doc.max_cliffs) || doc.max_cliffs < 1 || doc.max_cliffs > 50) {
    problems.push('max_cliffs は 1〜50 の整数（これを超えて落ちたら計器の故障として判定不能にする）');
  }
  if (!Array.isArray(doc.known_artifacts)) problems.push('known_artifacts が配列でない');
  else {
    const seen = new Set();
    for (const [i, k] of doc.known_artifacts.entries()) {
      const where = `known_artifacts[${i}]`;
      if (!k || typeof k !== 'object') { problems.push(`${where} がオブジェクトでない`); continue; }
      const extra = Object.keys(k).filter((key) => !['check', 'why', 'added'].includes(key));
      if (extra.length) problems.push(`${where} に知らないキー: ${extra.join(', ')}`);
      if (typeof k.check !== 'string' || !k.check.trim()) problems.push(`${where}.check が空`);
      // **理由の無い除外は、検査を黙らせる経路になる。**
      if (typeof k.why !== 'string' || k.why.trim().length < 20) {
        problems.push(`${where}.why が無いか短すぎる — なぜ時計ずらしの副作用だと言えるのかを書く`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k.added ?? '')) problems.push(`${where}.added は YYYY-MM-DD`);
      if (seen.has(k.check)) problems.push(`${where}.check が重複: ${k.check}`);
      seen.add(k.check);
      // **実在しない検査を除外できない**（名前が変わったら、除外だけが残って新しい名前は素通りする）。
      if (commandLabels && typeof k.check === 'string' && !commandLabels.has(k.check)) {
        problems.push(`${where}.check「${k.check}」は SEO Validation から導出した検査に無い — 消すか直す`);
      }
    }
  }
  return problems;
}

/** 報告（機械用）。exit code もここで決める。 */
export function buildReport({ nowMs, horizonDays, total, shiftedFailed, classified, cliffs, unstable = [], problems = [] }) {
  const undetermined = problems.length > 0;
  return {
    version: 1,
    checked_at: new Date(nowMs).toISOString(),
    horizon_days: horizonDays,
    horizon_until: new Date(nowMs + horizonDays * DAY).toISOString(),
    commands: total,
    failed_when_shifted: shiftedFailed,
    already_red: classified.already_red,
    artifacts: classified.artifacts,
    unstable,
    cliffs,
    state: undetermined ? 'undetermined' : cliffs.length ? 'cliffs' : 'clear',
    problems,
  };
}

export const exitCodeOf = (report) => (report.state === 'undetermined' ? 2 : report.state === 'cliffs' ? 1 : 0);

const fence = (text) => '```\n' + String(text ?? '').replace(/```/g, "'''") + '\n```';

/** 出力の末尾だけ残す。Issue 本文に入るので、行数と1行の長さを切る。 */
export function tail(text, lines = 12, width = 300) {
  const rows = String(text ?? '').split('\n').map((l) => l.trimEnd()).filter(Boolean);
  return rows.slice(-lines).map((l) => (l.length > width ? `${l.slice(0, width)}…` : l)).join('\n');
}

/** 報告（人が読む側）。Issue 本文とジョブ要約に同じものを出す。 */
export function renderMarkdown(report) {
  const lines = [];
  const now = Date.parse(report.checked_at);
  if (report.state === 'undetermined') {
    lines.push('## 日付の先読み: **判定不能**', '',
      '測れなかった回。**「期限は無い」という意味ではない。**', '',
      ...report.problems.map((p) => `- ${p}`), '');
    return lines.join('\n');
  }
  if (report.state === 'clear') {
    lines.push(`## 日付の先読み: ${report.horizon_days}日以内に、暦が進むだけで落ちる検査は無い`, '');
  } else {
    lines.push(`## 日付の先読み: ${report.horizon_days}日以内に、暦が進むだけで落ちる検査が ${report.cliffs.length}件`, '',
      '**いまのまま誰も何もしなければ**、下の時刻から全PRの SEO Validation が落ちる'
      + '（main の日次検証・日次同期PR・Decision Monitor の公開PRも同じ検査で止まる）。'
      + '期限の前に台帳を更新するか、検査が求めている作業を行う。', '',
      '| 最初に落ちる時刻 | あと | 検査 |', '| --- | --- | --- |');
    for (const c of report.cliffs) {
      const left = (Date.parse(c.first_fail) - now) / DAY;
      const when = c.monotonic === false ? `${jst(Date.parse(c.first_fail))}（境目が複数ある）` : jst(Date.parse(c.first_fail));
      lines.push(`| ${when} | ${left < 1 ? '1日未満' : `約${Math.floor(left)}日`} | \`${c.check}\` |`);
    }
    lines.push('');
    for (const c of report.cliffs) {
      lines.push(`### \`${c.check}\``, '',
        `- 最後に通った時刻: ${c.last_pass ? jst(Date.parse(c.last_pass)) : 'いま'}`,
        `- 最初に落ちた時刻: ${jst(Date.parse(c.first_fail))}`, '',
        'そのときの出力（末尾）:', '', fence(c.output), '');
    }
  }
  lines.push(`- 測った時刻: ${jst(now)} ／ 先読みの範囲: ${jst(Date.parse(report.horizon_until))} まで`,
    `- 回した検査: ${report.commands}本（SEO Validation から導出）`);
  if (report.already_red.length) {
    lines.push(`- 本物の時計でも落ちる検査（日付のせいではない。先読みの対象外）: ${report.already_red.map((l) => `\`${l}\``).join(' / ')}`);
  }
  if (report.artifacts.length) {
    lines.push(`- 時計ずらしの副作用として除外した検査（data/date-lookahead.json）: ${report.artifacts.map((a) => `\`${a.check}\``).join(' / ')}`);
  }
  if (report.unstable?.length) {
    lines.push(`- 時計を進めた1周目では落ちたが、同じ時刻で測り直すと通った検査（再現しないので予告しない。続くなら検査の側を見る）: ${report.unstable.map((l) => `\`${l}\``).join(' / ')}`);
  }
  lines.push('', '_ここが出すのは「いまのデータのまま日付だけ進めたら」の予告。期限の前に誰かが更新すれば落ちない。_', '');
  return lines.join('\n');
}

// ── 実行側（ここから下は faketime と実物の検査を使う） ───────────────────

const baseEnv = () => ({ ...process.env, TZ: 'UTC' });

/** CI と同じ合否にそろえる（seo-check.js は 1 が警告のみ）。 */
function normalize(args, result) {
  if (isSeoMain(args) && result.status === 1) return { ...result, status: 0 };
  return result;
}

const realExecute = (runner, args, options) => normalize(args, spawnSync(runner, args, options));
const shiftedExecute = (ms) => (runner, args, options) => normalize(args,
  spawnSync('faketime', [faketimeArg(ms), runner, ...args], { ...options, env: baseEnv() }));

/** faketime が node・python・子プロセスの時計を実際に動かすか。動かないなら測れない。 */
function instrumentProblems(targetMs) {
  const probe = (cmd, args) => spawnSync('faketime', [faketimeArg(targetMs), cmd, ...args],
    { encoding: 'utf8', env: baseEnv(), timeout: 30000 });
  const which = spawnSync('faketime', ['--version'], { encoding: 'utf8', timeout: 10000 });
  if (which.error || which.status !== 0) {
    return ['`faketime` が無い（libfaketime）。Ubuntu では `sudo apt-get install -y faketime`'];
  }
  const problems = [];
  const near = (text) => Math.abs(Number(text) - targetMs) < 5 * 60e3;
  const node = probe(process.execPath, ['-e', 'process.stdout.write(String(Date.now()))']);
  if (node.status !== 0 || !near(node.stdout)) problems.push('faketime が node の時計を動かしていない');
  const py = probe('python3', ['-c', 'import time,sys; sys.stdout.write(str(int(time.time()*1000)))']);
  if (py.status !== 0 || !near(py.stdout)) problems.push('faketime が python3 の時計を動かしていない');
  const child = probe(process.execPath, ['-e',
    'process.stdout.write(require("node:child_process").execFileSync("date",["-u","+%s"]).toString().trim()+"000")']);
  if (child.status !== 0 || !near(child.stdout)) problems.push('faketime が子プロセスの時計を動かしていない');
  return problems;
}

function loadLedger() {
  return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
}

function loadCommands() {
  const workflow = fs.readFileSync(WORKFLOW, 'utf8');
  const derived = extractCommands(workflow);
  // 名指しで足す本体が、いまも同じ形でワークフローにあること（書き方が変わったら気づく）。
  const hasMain = workflow.split('\n').some((l) => l.trim() === SEO_MAIN_LINE);
  return { commands: [...derived, SEO_MAIN], derived: derived.length, hasMain };
}

function runLookahead({ log = console.error } = {}) {
  const nowMs = Date.now();
  const ledger = loadLedger();
  const { commands, derived, hasMain } = loadCommands();
  const labels = new Map(commands.map((c) => [labelOf(c), c]));
  const horizonDays = ledger.horizon_days;
  const empty = { already_red: [], artifacts: [], cliffs: [] };
  const undetermined = (problems) => buildReport({ nowMs, horizonDays, total: commands.length,
    shiftedFailed: [], classified: empty, cliffs: [], problems });

  const ledgerProblems = validateLedger(ledger, new Set(labels.keys()));
  if (ledgerProblems.length) return undetermined(ledgerProblems.map((p) => `台帳: ${p}`));
  if (derived < 100) return undetermined([`SEO Validation から導出できた検査が ${derived} 本しかない — 導出が壊れている可能性`]);
  if (!hasMain) return undetermined([`seo-check.yml に「${SEO_MAIN_LINE}」の行が無い — 本体の呼び方が変わった。SEO_MAIN を合わせる`]);
  const horizon = nowMs + horizonDays * DAY;
  const broken = instrumentProblems(horizon);
  if (broken.length) return undetermined(broken);

  log(`先読み: ${commands.length} 本を ${jst(horizon)} の時計で回す`);
  const shifted = runChecks(commands, { root: ROOT, execute: shiftedExecute(horizon), log: () => {} });
  const shiftedFailed = shifted.map((f) => f.label);
  log(`  時計をずらして落ちた検査: ${shiftedFailed.length} 本`);

  // 落ちたものだけを本物の時計で回し直す（全部を2回回さない）。
  const again = runChecks(shifted.map((f) => labels.get(f.label)), { root: ROOT, execute: realExecute, log: () => {} });
  const failsNow = new Set(again.map((f) => f.label));
  const classified = classify(shiftedFailed, failsNow, ledger.known_artifacts);
  log(`  うち、いまも落ちる: ${classified.already_red.length} ／ 既知の副作用: ${classified.artifacts.length} ／ 日付で落ちる: ${classified.cliffs.length}`);

  if (classified.cliffs.length > ledger.max_cliffs) {
    return undetermined([`時計を進めただけで ${classified.cliffs.length} 本が落ちた（上限 ${ledger.max_cliffs}）。`
      + '計器（faketime・実行環境）の故障を疑う。個別の予告は出さない: '
      + classified.cliffs.slice(0, 10).join(' / ')]);
  }

  // 候補を horizon でもう一度測る。再現しないものは期限として出さない。
  const settled = splitReproducible(classified.cliffs, (label) => runChecks([labels.get(label)],
    { root: ROOT, execute: shiftedExecute(horizon), log: () => {} }).length > 0);
  if (settled.unstable.length) log(`  測り直すと通った（再現しない）: ${settled.unstable.join(' / ')}`);

  const probes = probeInstants(nowMs, horizonDays);
  const cliffs = [];
  for (const label of settled.cliffs) {
    const command = labels.get(label);
    let lastOutput = shifted.find((f) => f.label === label)?.out ?? '';
    const failsAt = (ms) => {
      const failed = runChecks([command], { root: ROOT, execute: shiftedExecute(ms), log: () => {} });
      if (failed.length) lastOutput = failed[0].out;
      return failed.length > 0;
    };
    const found = firstFailing(probes, failsAt);
    // 出力は「最初に落ちる時刻」のものに差し替える（horizon の出力は日数が進んでいる）。
    const atFirst = runChecks([command], { root: ROOT, execute: shiftedExecute(found.first_fail), log: () => {} });
    if (atFirst.length) lastOutput = atFirst[0].out;
    cliffs.push({ check: label, first_fail: new Date(found.first_fail).toISOString(),
      last_pass: found.last_pass ? new Date(found.last_pass).toISOString() : null,
      monotonic: found.monotonic, output: tail(lastOutput) });
    log(`  ${label}: ${jst(found.first_fail)} から落ちる`);
  }
  cliffs.sort((a, b) => a.first_fail.localeCompare(b.first_fail) || a.check.localeCompare(b.check));
  return buildReport({ nowMs, horizonDays, total: commands.length, shiftedFailed, classified, cliffs,
    unstable: settled.unstable });
}

// ── 自己テスト（**この道具が黙る形を固定する**） ─────────────────────────

function selftest() {
  const T0 = Date.parse('2026-11-10T13:50:00Z'); // JST 11-10 22:50
  const goodLedger = () => ({ $comment: ['x'], horizon_days: 7, max_cliffs: 12,
    known_artifacts: [{ check: 'a.mjs --selftest', why: '子プロセスを環境変数を絞って起動するので時計がずれない', added: '2026-11-10' }] });
  const labelsWith = (...l) => new Set(['a.mjs --selftest', ...l]);
  const eq = (got, want, what) => assert(JSON.stringify(got) === JSON.stringify(want),
    `${what}: got ${JSON.stringify(got)} / want ${JSON.stringify(want)}`);

  const scenarios = [
    ['faketime へ渡す時刻は UTC の絶対時刻', () => {
      eq(faketimeArg(Date.parse('2026-11-14T15:30:00Z')), '2026-11-14 15:30:00', 'faketimeArg');
      eq(jst(Date.parse('2026-11-14T15:30:00Z')), '2026-11-15 00:30 JST', 'jst');
    }],
    ['境目は JST 0時と 9時の直後を、いまより後・horizon より前だけ並べる', () => {
      const p = probeInstants(T0, 2).map(jst);
      eq(p, ['2026-11-11 00:30 JST', '2026-11-11 09:30 JST', '2026-11-12 00:30 JST',
        '2026-11-12 09:30 JST', '2026-11-12 22:50 JST'], 'probes');
    }],
    ['**境目のどちらの種類も測る**（2026-11-10 の3件は 0時が1件・9時が2件だった）', () => {
      const p = probeInstants(T0, 7).map(jst);
      assert(p.includes('2026-11-15 00:30 JST'), 'JST 0時の直後が無い');
      assert(p.includes('2026-11-15 09:30 JST') && p.includes('2026-11-17 09:30 JST'), 'JST 9時の直後が無い');
      eq(p.at(-1), '2026-11-17 22:50 JST', 'horizon');
    }],
    ['最初に落ちる時刻を当てる（JST 0時の期限）', () => {
      const probes = probeInstants(T0, 7);
      const deadline = Date.parse('2026-11-14T15:00:00Z'); // JST 11-15 00:00
      const f = firstFailing(probes, (ms) => ms >= deadline);
      eq(jst(f.first_fail), '2026-11-15 00:30 JST', 'first_fail');
      eq(jst(f.last_pass), '2026-11-14 09:30 JST', 'last_pass');
      assert(f.monotonic === true, '単調のはず');
      assert(f.probed <= 6, `測りすぎ: ${f.probed} 回`);
    }],
    ['最初に落ちる時刻を当てる（JST 9時の期限・horizon の直前）', () => {
      const probes = probeInstants(T0, 7);
      const deadline = Date.parse('2026-11-17T00:00:00Z'); // JST 11-17 09:00
      const f = firstFailing(probes, (ms) => ms >= deadline);
      eq(jst(f.first_fail), '2026-11-17 09:30 JST', 'first_fail');
      eq(jst(f.last_pass), '2026-11-17 00:30 JST', 'last_pass');
    }],
    ['最初の境目で落ちるなら、最後に通ったのは「いま」', () => {
      const f = firstFailing(probeInstants(T0, 7), () => true);
      eq(jst(f.first_fail), '2026-11-11 00:30 JST', 'first_fail');
      assert(f.last_pass === null, 'last_pass は null');
    }],
    ['**見つけた境目の次の点が通るなら、単調でないと報告する**（境目が1つだと決めつけない）', () => {
      const probes = probeInstants(T0, 7);
      assert(probes.length === 15, `前提: 境目14＋horizon の15点（実際は ${probes.length}）`);
      // 探索の最初の中点（添字6）でだけ落ち、次の点では通る検査。
      const onlyOnePoint = (ms) => ms === probes[6] || ms === probes[14];
      const f = firstFailing(probes, onlyOnePoint);
      assert(f.first_fail === probes[6], `first_fail が ${jst(f.first_fail)}`);
      assert(f.monotonic === false, '次の点が通るのに単調と報告した');
    }],
    ['探索が通らない点でだけ落ちる形は見つけない（**限界を固定する** —— 全点は測らない）', () => {
      const probes = probeInstants(T0, 7);
      const f = firstFailing(probes, (ms) => ms === probes[7] || ms === probes[14]);
      assert(f.first_fail === probes[14] && f.monotonic === true, '限界の形が変わった（全点を測るようにしたなら、この検体を直す）');
    }],
    ['期限が単調なら、次の点も落ちることを確かめたうえで monotonic: true', () => {
      const probes = probeInstants(T0, 7);
      let calls = 0;
      const f = firstFailing(probes, (ms) => { calls += 1; return ms >= probes[3]; });
      assert(f.first_fail === probes[3] && f.monotonic === true, '単調な期限の報告がおかしい');
      assert(calls <= 5, `測りすぎ: ${calls} 回`);
    }],
    ['分類: いまも落ちる検査は予告しない（日付のせいではない）', () => {
      const c = classify(['x.mjs', 'y.mjs'], new Set(['x.mjs']), []);
      eq(c, { already_red: ['x.mjs'], artifacts: [], cliffs: ['y.mjs'] }, 'classify');
    }],
    ['分類: 台帳が名指しした副作用は予告しない。**名指しの無い副作用は予告に残る**', () => {
      const known = goodLedger().known_artifacts;
      const c = classify(['a.mjs --selftest', 'b.mjs --selftest'], new Set(), known);
      eq(c.cliffs, ['b.mjs --selftest'], 'cliffs');
      eq(c.artifacts.map((a) => a.check), ['a.mjs --selftest'], 'artifacts');
    }],
    ['分類: **いまも落ちる検査は、既知の副作用より先に「いまの赤」として出す**', () => {
      const known = goodLedger().known_artifacts;
      const c = classify(['a.mjs --selftest'], new Set(['a.mjs --selftest']), known);
      eq(c.already_red, ['a.mjs --selftest'], 'already_red');
    }],
    ['**1周目で落ちても、同じ時刻で測り直して通る検査は期限にしない**（2026-11-10 の初回で2件を誤報した）', () => {
      const again = new Map([['real-deadline.mjs --check', true], ['timed-out-under-load.test.mjs', false]]);
      const r = splitReproducible([...again.keys()], (label) => again.get(label));
      eq(r, { cliffs: ['real-deadline.mjs --check'], unstable: ['timed-out-under-load.test.mjs'] }, 'split');
    }],
    ['再現しなかった検査は報告に名前で残す（黙って捨てない）。期限が無ければ clear のまま', () => {
      const r = buildReport({ nowMs: T0, horizonDays: 7, total: 246, shiftedFailed: ['x.test.mjs'],
        classified: { already_red: [], artifacts: [], cliffs: ['x.test.mjs'] }, cliffs: [], unstable: ['x.test.mjs'] });
      eq([r.state, exitCodeOf(r)], ['clear', 0], 'state');
      assert(renderMarkdown(r).includes('測り直すと通った検査') && renderMarkdown(r).includes('`x.test.mjs`'), '本文に再現しなかった検査が無い');
    }],
    ['台帳: 正しい形は通る', () => eq(validateLedger(goodLedger(), labelsWith()), [], 'problems')],
    ['台帳: **理由の無い除外は落ちる**（検査を黙らせる経路にしない）', () => {
      const d = goodLedger(); d.known_artifacts[0].why = '副作用';
      assert(validateLedger(d, labelsWith()).some((p) => p.includes('why')), '短い why が通った');
    }],
    ['台帳: **実在しない検査は除外できない**（名前が変わったら除外だけ残る）', () => {
      const d = goodLedger(); d.known_artifacts[0].check = 'renamed.mjs --selftest';
      assert(validateLedger(d, labelsWith()).some((p) => p.includes('導出した検査に無い')), '実在しない除外が通った');
    }],
    ['台帳: 打ち間違えたキーは落ちる（黙って既定値にしない）', () => {
      const d = goodLedger(); d.horizon_day = 3;
      assert(validateLedger(d, labelsWith()).some((p) => p.includes('知らないキー')), '知らないキーが通った');
    }],
    ['台帳: horizon_days と max_cliffs の範囲', () => {
      for (const bad of [0, 32, 1.5, '7', undefined]) {
        const d = goodLedger(); d.horizon_days = bad;
        assert(validateLedger(d, labelsWith()).some((p) => p.includes('horizon_days')), `horizon_days=${bad} が通った`);
      }
      const d = goodLedger(); delete d.max_cliffs;
      assert(validateLedger(d, labelsWith()).some((p) => p.includes('max_cliffs')), 'max_cliffs なしが通った');
    }],
    ['台帳: 同じ検査の除外を2回書けない', () => {
      const d = goodLedger(); d.known_artifacts.push({ ...d.known_artifacts[0] });
      assert(validateLedger(d, labelsWith()).some((p) => p.includes('重複')), '重複が通った');
    }],
    ['**実データの台帳が通り、名指しした検査が実在する**', () => {
      const { commands } = loadCommands();
      eq(validateLedger(loadLedger(), new Set(commands.map(labelOf))), [], 'problems');
    }],
    ['**実データ: seo-check.js 本体を名指しで足す行が、ワークフローに同じ形で在る**', () => {
      const { hasMain, derived, commands } = loadCommands();
      assert(hasMain, `seo-check.yml に「${SEO_MAIN_LINE}」が無い — 本体が先読みから漏れる`);
      assert(derived > 100, `導出が ${derived} 本しかない`);
      assert(commands.filter((c) => labelOf(c) === 'seo-check.js').length === 1, '本体が1本だけ入るはず');
    }],
    ['**実データ: 2026-11-10 に実測した3件の検査が、先読みの対象に入っている**', () => {
      const labels = new Set(loadCommands().commands.map(labelOf));
      for (const l of ['seo-check.js', 'check-content-graph.mjs', 'growth/scripts/check-mentions.mjs --check',
        'check-store-facts.mjs --check']) assert(labels.has(l), `${l} が対象に無い`);
    }],
    ['seo-check.js だけは exit 1 を合格にそろえる（CI と同じ。ほかの検査の 1 は失敗のまま）', () => {
      eq(normalize([SEO_MAIN.script], { status: 1 }).status, 0, 'seo-check 1');
      eq(normalize([SEO_MAIN.script], { status: 2 }).status, 2, 'seo-check 2');
      eq(normalize(['scripts/other.mjs'], { status: 1 }).status, 1, 'other 1');
      eq(normalize([SEO_MAIN.script, '--selftest'], { status: 1 }).status, 1, 'seo-check --selftest 1');
    }],
    ['報告: 期限が無い回は clear・exit 0', () => {
      const r = buildReport({ nowMs: T0, horizonDays: 7, total: 246, shiftedFailed: [], classified: classify([], new Set(), []), cliffs: [] });
      eq([r.state, exitCodeOf(r)], ['clear', 0], 'state');
      assert(renderMarkdown(r).includes('落ちる検査は無い'), '本文');
    }],
    ['報告: 期限がある回は cliffs・exit 1 で、時刻と残り日数と出力を出す', () => {
      const cliffs = [{ check: 'check-content-graph.mjs', first_fail: '2026-11-14T15:30:00.000Z',
        last_pass: '2026-11-14T00:30:00.000Z', monotonic: true, output: '[DEFERRAL] x has lapsed' }];
      const r = buildReport({ nowMs: T0, horizonDays: 7, total: 246, shiftedFailed: ['check-content-graph.mjs'],
        classified: { already_red: [], artifacts: [], cliffs: ['check-content-graph.mjs'] }, cliffs });
      eq([r.state, exitCodeOf(r)], ['cliffs', 1], 'state');
      const md = renderMarkdown(r);
      for (const needle of ['| 2026-11-15 00:30 JST | 約4日 | `check-content-graph.mjs` |', '[DEFERRAL] x has lapsed',
        '最後に通った時刻: 2026-11-14 09:30 JST', '最初に落ちた時刻: 2026-11-15 00:30 JST']) {
        assert(md.includes(needle), `本文に「${needle}」が無い`);
      }
    }],
    ['報告: **測れなかった回は undetermined・exit 2**（期限なしの緑にしない）', () => {
      const r = buildReport({ nowMs: T0, horizonDays: 7, total: 246, shiftedFailed: [],
        classified: { already_red: [], artifacts: [], cliffs: [] }, cliffs: [], problems: ['`faketime` が無い'] });
      eq([r.state, exitCodeOf(r)], ['undetermined', 2], 'state');
      const md = renderMarkdown(r);
      assert(md.includes('判定不能') && md.includes('「期限は無い」という意味ではない'), '本文');
    }],
    ['報告: 出力の ``` は潰す（Issue の本文を壊さない）。末尾だけ・1行の長さも切る', () => {
      const out = tail(`${'x\n'.repeat(40)}${'y'.repeat(500)}\nlast`, 3, 20);
      eq(out.split('\n').length, 3, '行数');
      assert(out.split('\n')[1].length === 21 && out.endsWith('last'), '幅と末尾');
      assert(!fence('a```b').slice(3, -3).includes('```'), 'フェンスが潰れていない');
    }],
  ];
  return runScenarios(scenarios) === 0 ? 0 : 1;
}

// ── 入口 ────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const value = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
  };
  if (argv.includes('--selftest')) process.exit(selftest());
  if (argv.includes('--check')) {
    const { commands } = loadCommands();
    const problems = validateLedger(loadLedger(), new Set(commands.map(labelOf)));
    if (problems.length) {
      console.error('日付の先読みの台帳（data/date-lookahead.json）: 問題');
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log(`日付の先読み: 台帳に問題なし（対象 ${commands.length} 本・除外 ${loadLedger().known_artifacts.length} 件）。`
      + '先読みそのものは日次の date-lookahead.yml が回す。');
    process.exit(0);
  }
  if (argv.includes('--run')) {
    let report;
    try { report = runLookahead(); }
    catch (e) {
      report = buildReport({ nowMs: Date.now(), horizonDays: 0, total: 0, shiftedFailed: [],
        classified: { already_red: [], artifacts: [], cliffs: [] }, cliffs: [],
        problems: [`先読みの実行に失敗: ${String(e?.message ?? e).split('\n')[0].slice(0, 300)}`] });
    }
    const markdown = renderMarkdown(report);
    const jsonPath = value('--json');
    const mdPath = value('--markdown');
    if (jsonPath) fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    if (mdPath) fs.writeFileSync(mdPath, markdown);
    console.log(markdown);
    process.exit(exitCodeOf(report));
  }
  console.error('使い方: node scripts/date-lookahead.mjs --selftest | --check | --run [--json <file>] [--markdown <file>]');
  process.exit(2);
}
