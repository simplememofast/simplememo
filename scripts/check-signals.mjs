#!/usr/bin/env node
/**
 * 要望・レビュー・問い合わせ・競合情報の統合台帳を検査する。
 *
 *   node scripts/check-signals.mjs           # 表示
 *   node scripts/check-signals.mjs --check   # CI
 *
 * 【なぜ重複排除が要るか】
 * 声の大きさは「何回報告されたか」で測るべきで、「何回転記されたか」で
 * 測ってはいけない。同じ話が要望・レビュー・アンケートの3経路から来たとき、
 * 3行に分けると**1つの話が3倍の重みを持つ。**dedupe_key はそれを防ぐ。
 *
 * 【何を落とすか】
 *   - dedupe_key の重複（同じ話が2行）
 *   - 出どころのファイルが実在しない（**このリポジトリから見える範囲だけ確認する**）
 *   - merged なのに、どこへ落ちたかが書いていない
 *   - declined なのに、なぜ採らないかが書いていない
 *
 * **declined を空欄にできると、この台帳は「無視した要望の置き場」になる。**
 * 採らない判断も判断なので、理由まで含めて残す。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/signal-ledger.json');
const BACKLOG_PATH = path.join(ROOT, 'data/feature-backlog.json');

export const STATUSES = ['open', 'merged', 'declined'];
export const KINDS = ['request', 'review', 'inquiry', 'competitor', 'usage', 'survey'];

export function validate(doc, { exists = (p) => fs.existsSync(path.join(ROOT, p)), backlogIds = new Set() } = {}) {
  const problems = [];
  const keys = new Set(), ids = new Set();
  for (const s of doc.signals || []) {
    const at = `signal ${s.id || '(id無し)'}`;
    if (!s.id) problems.push('id の無いシグナルがある');
    else if (ids.has(s.id)) problems.push(`${at}: id が重複`);
    else ids.add(s.id);

    if (!s.dedupe_key) problems.push(`${at}: dedupe_key が無い`);
    else if (keys.has(s.dedupe_key)) {
      problems.push(`${at}: dedupe_key "${s.dedupe_key}" が重複`
        + ' — 同じ話は1行にまとめ、sources を足すこと（**転記の回数を声の大きさにしない**）');
    } else keys.add(s.dedupe_key);

    if (!s.title) problems.push(`${at}: title が無い`);
    if (!Array.isArray(s.kinds) || !s.kinds.length) problems.push(`${at}: kinds が空`);
    else for (const k of s.kinds) if (!KINDS.includes(k)) problems.push(`${at}: 未知の kind "${k}"`);

    if (!Array.isArray(s.sources) || !s.sources.length) {
      problems.push(`${at}: sources が空 — 出どころの無いシグナルは検算できない`);
    } else {
      for (const f of s.sources) {
        // 隣リポジトリはこのCIから見えない。**確認できないものを確認したことにしない。**
        if (f.startsWith('../')) continue;
        if (!exists(f)) problems.push(`${at}: sources "${f}" が実在しない`);
      }
    }
    if (!s.evidence_note) problems.push(`${at}: evidence_note が無い — 何を根拠に受けたかが残らない`);

    if (!STATUSES.includes(s.status)) {
      problems.push(`${at}: status は ${STATUSES.join('/')} のいずれか`);
      continue;
    }
    if (s.status === 'merged' && !s.shipped_in && !s.backlog_id) {
      problems.push(`${at}: merged なのに shipped_in も backlog_id も無い — どこへ落ちたか分からない`);
    }
    if (s.backlog_id && backlogIds.size && !backlogIds.has(s.backlog_id)) {
      problems.push(`${at}: backlog_id "${s.backlog_id}" が data/feature-backlog.json に無い`);
    }
    if (s.status === 'declined' && !s.why_not) {
      problems.push(`${at}: declined なのに why_not が無い`
        + ' — **理由の無い却下は、次の棚卸しで「見落とし」と区別できない**');
    }
  }
  return problems;
}


// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
// 通ることだけ確かめる自己テストは、検査が何も見ていなくても緑になる。
const SELFTEST_BREAKAGES = [
  ['id の重複は落ちる', (d) => { d.signals.push({ ...d.signals[0] }); }],
  ['**dedupe_key が無い**のは落ちる（同じ信号を何度も新規として拾う）', (d) => { delete d.signals[0].dedupe_key; }],
  ['kinds が空なら落ちる', (d) => { d.signals[0].kinds = []; }],
  ['title が無ければ落ちる', (d) => { delete d.signals[0].title; }],
];
const SCENARIOS = ledgerScenarios(
  () => JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')),
  (d) => validate(d),
  SELFTEST_BREAKAGES,
);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 ? 0 : 1);
  const doc = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const backlogIds = new Set(
    fs.existsSync(BACKLOG_PATH)
      ? (JSON.parse(fs.readFileSync(BACKLOG_PATH, 'utf8')).candidates || []).map((c) => c.id)
      : []);
  const problems = validate(doc, { backlogIds });

  const by = (st) => doc.signals.filter((s) => s.status === st);
  console.log(`統合シグナル台帳 — ${doc.signals.length} 件`
    + `（open ${by('open').length} / merged ${by('merged').length} / declined ${by('declined').length}）\n`);
  for (const s of doc.signals) {
    const mark = { open: '未決', merged: '反映', declined: '不採用' }[s.status];
    console.log(`  [${mark}] ${s.title}`);
    console.log(`         ${s.kinds.join(' + ')} / 初出 ${s.first_seen} / 出どころ ${s.sources.length}件`);
    if (s.status === 'merged') console.log(`         → ${s.shipped_in || s.backlog_id}`);
    if (s.status === 'declined') console.log(`         → 採らない: ${s.why_not.slice(0, 60)}…`);
  }
  const multi = doc.signals.filter((s) => s.kinds.length > 1);
  if (multi.length) {
    console.log(`\n  複数チャネルから来ている話 ${multi.length} 件:`);
    for (const s of multi) console.log(`    ${s.title}（${s.kinds.join(' + ')}）`);
    console.log('    **台帳を作るまで別々の紙に載っていた。**ここが重複排除の効くところ。');
  }
  if (problems.length) {
    console.error('\nシグナル台帳: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    if (run(SCENARIOS) !== 0) process.exit(1);
    console.log('\n重複・出どころ・採否の理由に問題なし。');
  }
}
