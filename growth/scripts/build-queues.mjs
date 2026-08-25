#!/usr/bin/env node
/**
 * 分析の出力を、コンテンツの待ち行列へ落とす。
 *
 *   node growth/scripts/build-queues.mjs            # 表示（何が増減するか）
 *   node growth/scripts/build-queues.mjs --write    # refresh-queue.json を更新
 *   node growth/scripts/build-queues.mjs --check    # CI: 待ち行列が最新の観測より古くないか
 *   node growth/scripts/build-queues.mjs --selftest
 *
 * 【なぜ要るか】
 * 検出は既に在る（analyze.mjs --only unanswered。ノイズフロアつき）。
 * **無かったのは、その出力を待ち行列に落とす経路。**refresh-queue.json は
 * 2026-08-09 に手で作られたまま更新されず、以後の観測が待ち行列に反映されていなかった。
 * 自律コンテンツループが実際に消化しているのは coverage-queue だけで、
 * **refresh / new は生成時のまま消化0件。**
 *
 * 【この script の核心 — 落とした判断を復活させない】
 * 待ち行列には人（およびAI）の判断が入っている。R1 は
 * 「原因の見立てが誤りだった」という理由つきで status: dropped になっている。
 * **素直に作り直すと、それが毎回よみがえる。**同じ理由で毎回同じ項目を
 * 検討し直すことになり、待ち行列は「判断の記録」ではなく「観測の写し」に落ちる。
 *
 * したがって: **dropped と done は key で引き継ぎ、再生成では絶対に戻さない。**
 * これは data/operating-memory.json の lesson_key（同じことを2回学ばない）と
 * 同じ規律を、待ち行列に当てたもの。
 *
 * 【手で作った分は触らない】
 * 2026-08-09 の5件は origin を持たない。**機械が管理するのは origin: "analyze"
 * の行だけ**で、手作りの行は素通しする。人の判断を機械が上書きしない。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { latestSnapshot } from '../lib/gsc.mjs';
import { loadLedger } from '../lib/ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const QUEUE_PATH = path.join(ROOT, 'growth/content/refresh-queue.json');
const ANALYZE = path.join(ROOT, 'growth/scripts/analyze.mjs');

/** 機械が管理する行の目印。これが無い行は手作りなので触らない。 */
export const MACHINE_ORIGIN = 'analyze';
/** 再生成で戻してはいけない状態。 */
export const STICKY_STATES = ['dropped', 'done'];

/** 観測1行を待ち行列の key にする。**種別込みで一意にする。** */
export function keyOf(row) {
  return `${row.kind}:${row.key}`;
}

/**
 * **到達不能と判定済みのページ**を集める（experiments.json の abandoned）。
 *
 * [2026-08-25] これを足したのは、**初回の試走で実際に踏んだから。**
 * 未回答クエリの第1位（`line キープメモ サービス終了`・期待6.1クリック）の
 * 着地先は `/blog/line-keep-alternative` で、このページは 2026-08-11 に
 * **abandoned** と判定されている —— クエリが確認型（「line keepメモ 終了」）で、
 * タイトルが既に答えを出しているため、**検索者は結果ページで満足して押す必要が無い。**
 *
 * growth/lib/ledger.mjs は `abandoned` をまさにこの事例のために作ったと書いている:
 * 「`inconclusive` は誰かがデータを足して再実行することを誘う。3つとも同じページへ戻る」。
 *
 * **待ち行列を素直に作り直すと、その判定を跨いで同じページが最優先で戻ってくる。**
 * 台帳が2つに分かれていて、片方の判断がもう片方から見えないことが原因。
 * **判断は観測より新しい情報**なので、観測の側が譲る。
 */
export function unreachablePages(ledger) {
  const out = new Map();
  for (const e of ledger.experiments || []) {
    if (e.decision !== 'abandoned') continue;
    if (typeof e.page === 'string' && e.page.startsWith('/')) out.set(e.page, e.id);
  }
  return out;
}

/**
 * 既存の待ち行列と新しい観測をつき合わせる。
 * @returns {{items:Array, added:Array, kept:Array, blocked:Array, manual:Array, unreachable:Array}}
 */
export function merge(existing, rows, unreachable = new Map()) {
  const manual = existing.filter((i) => i.origin !== MACHINE_ORIGIN);
  const machine = existing.filter((i) => i.origin === MACHINE_ORIGIN);
  const byKey = new Map(machine.map((i) => [i.source_key, i]));

  const items = [];
  const added = [];
  const kept = [];
  const blocked = [];
  const skippedUnreachable = [];

  for (const row of rows) {
    const k = keyOf(row);
    const prev = byKey.get(k);

    // **到達不能と判定済みのページへは積み直さない。**
    const lands = [row.key, ...(row.ranking_pages || []).map((p) => p.page)];
    const hit = lands.find((p) => unreachable.has(p));
    if (hit) {
      skippedUnreachable.push({ key: k, page: hit, experiment: unreachable.get(hit) });
      byKey.delete(k);
      continue;
    }
    if (prev && STICKY_STATES.includes(prev.status)) {
      // **戻さない。**判断は観測より新しい情報。
      blocked.push(prev);
      items.push(prev);
      byKey.delete(k);
      continue;
    }
    const item = {
      id: prev?.id ?? null,
      origin: MACHINE_ORIGIN,
      source_key: k,
      kind: row.kind,
      target: row.key,
      observed: {
        impressions: row.impressions,
        position: row.position,
        expected_ctr: row.expected_ctr,
        expected_clicks: Math.round(row.expected_clicks * 10) / 10,
      },
      ranking_pages: row.ranking_pages ?? [],
      status: prev?.status ?? 'queued',
    };
    if (prev) { kept.push(item); byKey.delete(k); } else { added.push(item); }
    items.push(item);
  }

  // 観測から消えた機械行 —— **消さずに残す。**
  // 消すと「直したから消えた」と「観測の窓から外れただけ」が区別できなくなる。
  for (const leftover of byKey.values()) {
    items.push({ ...leftover, status: leftover.status === 'queued' ? 'stale' : leftover.status });
  }

  // id を振り直す（機械行だけ）。手作り行の id とぶつからないよう接頭辞を分ける。
  let n = 0;
  for (const i of items) {
    if (i.origin === MACHINE_ORIGIN) { n += 1; i.id = i.id ?? `A${n}`; }
  }
  return { items: [...manual, ...items], added, kept, blocked, manual, unreachable: skippedUnreachable };
}

export function runAnalyze() {
  const out = execFileSync(process.execPath, [ANALYZE, '--json'], { cwd: ROOT, encoding: 'utf8' });
  return JSON.parse(out);
}

function selftest() {
  let total = 0; const failures = [];
  const t = (n, c) => { total += 1; if (!c) failures.push(n); console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}`); };
  const row = (key, kind = 'query', exp = 5) => ({
    kind, key, impressions: 100, position: 6, expected_ctr: 0.05, expected_clicks: exp, ranking_pages: [],
  });

  t('新しい観測は queued で入る',
    merge([], [row('a')]).items[0].status === 'queued');

  const dropped = [{ origin: MACHINE_ORIGIN, source_key: 'query:a', status: 'dropped', id: 'A1',
    dropped_reason: '見立てが誤りだった' }];
  const m = merge(dropped, [row('a')]);
  t('**dropped は再生成で戻らない**', m.items[0].status === 'dropped');
  t('落とした理由も残る', m.items[0].dropped_reason.includes('誤り'));
  t('戻さなかったことを数える', m.blocked.length === 1 && m.added.length === 0);

  const done = [{ origin: MACHINE_ORIGIN, source_key: 'query:a', status: 'done', id: 'A1' }];
  t('done も戻らない', merge(done, [row('a')]).items[0].status === 'done');

  const manual = [{ id: 'R1', page: '/x', status: 'dropped' }];
  const mm = merge(manual, [row('b')]);
  t('**手作りの行は触らない**', mm.items[0].id === 'R1' && mm.manual.length === 1);
  t('手作り行は機械の採番とぶつからない',
    mm.items.filter((i) => i.origin === MACHINE_ORIGIN).every((i) => i.id.startsWith('A')));

  const gone = [{ origin: MACHINE_ORIGIN, source_key: 'query:z', status: 'queued', id: 'A1' }];
  const g = merge(gone, [row('a')]);
  const z = g.items.find((i) => i.source_key === 'query:z');
  t('観測から消えた行は削除せず stale にする', z && z.status === 'stale');
  t('**消さない理由**: 直ったのか窓から外れたのか区別できないため', z.status !== undefined);

  const gd = merge([{ origin: MACHINE_ORIGIN, source_key: 'query:z', status: 'done', id: 'A1' }], []);
  t('消えた done は done のまま', gd.items[0].status === 'done');

  t('kind が違えば別の行', keyOf(row('a', 'query')) !== keyOf(row('a', 'page')));

  // **別の台帳の判断を跨がない**
  const unreach = new Map([['/blog/x', 'title-2026-07-01-002']]);
  const withPage = { ...row('q'), ranking_pages: [{ page: '/blog/x', impressions: 100, position: 6 }] };
  const u = merge([], [withPage], unreach);
  t('**abandoned のページへは積み直さない**', u.items.length === 0 && u.unreachable.length === 1);
  t('どの実験の判断かを残す', u.unreachable[0].experiment === 'title-2026-07-01-002');
  t('page 種別の行も同じく止める',
    merge([], [row('/blog/x', 'page')], unreach).unreachable.length === 1);
  t('関係ないページは通る', merge([], [row('/blog/other', 'page')], unreach).items.length === 1);

  const led = { experiments: [
    { id: 'e1', decision: 'abandoned', page: '/a' },
    { id: 'e2', decision: 'keep', page: '/b' },
    { id: 'e3', decision: 'abandoned', page: '(3 pages: /c, /d)' },
  ] };
  const up = unreachablePages(led);
  t('abandoned だけを集める', up.has('/a') && !up.has('/b'));
  t('ページ集合は対象にしない（1ページに対応しないため）', up.size === 1);

  if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗 — ${failures.join(' / ')}`); return 1; }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());

  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  const snap = latestSnapshot();
  const analysis = runAnalyze();
  const rows = analysis.unanswered ?? [];
  const unreachable = unreachablePages(loadLedger());
  const { items, added, kept, blocked, manual, unreachable: skipped } = merge(queue.items ?? [], rows, unreachable);

  console.log(`Refresh 待ち行列 — 観測 ${analysis.snapshot} / 未回答 ${rows.length} 件\n`);
  console.log(`  手作りの行（触らない） ${manual.length}`);
  console.log(`  新規 ${added.length} / 更新 ${kept.length} / **戻さなかった（dropped・done）** ${blocked.length}`);
  for (const b of blocked) console.log(`    そのまま: ${b.source_key} (${b.status})`);
  for (const a of added) console.log(`    追加: ${a.source_key}  期待クリック ${a.observed.expected_clicks}`);
  if (skipped.length) {
    console.log(`\n  **到達不能と判定済みなので積まなかった** ${skipped.length} 件:`);
    for (const s2 of skipped) {
      console.log(`    ${s2.key}`);
      console.log(`      → ${s2.page} は experiments.json で abandoned（${s2.experiment}）`);
    }
    console.log('    **判断は観測より新しい情報。**観測の側が譲る。');
  }

  const stale = queue.generated_at && snap?.label && queue.generated_at < snap.label;
  if (stale) {
    console.log(`\n  ⚠ 待ち行列 ${queue.generated_at} が最新の観測 ${snap.label} より古い`);
  }

  if (process.argv.includes('--write')) {
    queue.generated_at = snap?.label ?? queue.generated_at;
    queue.source = `${analysis.snapshot} (${analysis.period})`;
    queue.items = items;
    queue.$machine = [
      '**origin: "analyze" の行は machine が管理する。**手で編集しても次の再生成で上書きされる。',
      '**dropped と done は再生成で戻らない**（判断は観測より新しい情報）。',
      '観測から消えた行は削除せず stale にする —— 直ったのか窓から外れたのかを区別できないため。',
      'origin を持たない行は 2026-08-09 に手で作ったもの。machine は触らない。',
    ];
    fs.writeFileSync(QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`);
    console.log('\n  → growth/content/refresh-queue.json');
    process.exit(0);
  }

  if (process.argv.includes('--check')) {
    if (stale) {
      console.error('\n待ち行列: 最新の観測が反映されていない');
      console.error('  `node growth/scripts/build-queues.mjs --write` を同じコミットに含めること');
      process.exit(1);
    }
    console.log('\n待ち行列は最新の観測に追いついている。');
  }
}
