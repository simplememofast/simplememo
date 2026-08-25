#!/usr/bin/env node
/**
 * 隣のリポジトリを指した証跡が、**本当にそこにあるか。**
 *
 *   node scripts/crossrepo.mjs           # 一覧
 *   node scripts/crossrepo.mjs --check   # CI
 *   node scripts/crossrepo.mjs --sync    # 3リポジトリの揃った場所で写しを更新
 *
 * 【なぜ作るか — 2026-08-25 に実際に起きたこと】
 * `automation-rate.mjs` は証跡の実在をCIで確かめている。**ただし1行だけ例外があった。**
 *
 *     if (f.startsWith('../')) continue;   // 他リポジトリのパスは存在確認しない
 *
 * 意図は正しい（確認できないものを確認したことにしない）。**結果が逆だった。**
 * 隣を指した証跡は、隣が見えるセッションでも見に行かれない。つまり
 * **`../simplememo-api/なんでも.ts` と書けば、そのタスクは無条件に「実装済み」として
 * 数えられる。**
 *
 * 棚卸ししたところ、**28ファイル・18タスクがこれに当たった。**どれも
 * 隣2リポジトリの **git履歴に一度も存在しない**（コミット0件。作業ツリーにだけ
 * 存在した状態で台帳に書かれ、そのまま失われたと見られる）。
 * ⑫事業継続性は9タスク中5つがこれで、**領域として 100.0% と表示されていた。**
 *
 * 台帳の存在理由は「やっていることにする」だけで数字が上がるのを止めることなので、
 * **この穴は台帳そのものを無効にする。**だから塞ぐ。
 *
 * 【隣が無いCIでどう確かめるか】
 * `check-degradation.mjs` が 2026-08-24 に同じ問題を解いている。答えは写し
 * （`data/crossrepo-probes.json`）で、この検査もそこへ相乗りする。
 *
 *   - 隣が見えるとき … **実物を見る。**写しは使わない
 *   - 隣が無いとき   … 写しで判定し、**写しで判定したと出力に書く**
 *   - 写しが無い／古い … 落とす。**古い写しは、無い検査と同じ**
 *
 * **「隣が無ければスキップ」は絶対にやらない。**それがこの穴の作り方だった。
 *
 * 【何を落とすか】
 * 台帳が隣を指しているのに、そこに無いものは全部。executor では区別しない —
 * `automation-rate.mjs` がローカルの証跡に対して executor を問わず実在を要求して
 * いるのと同じ規則を、隣にも当てるだけ。
 *
 * 加えて `monitoring-coverage.json` の検知器も見る。**検知器のファイルが無いのに
 * `detection: "automatic"` と書いてある系統**は、「機械が見ている」の顔をした穴で、
 * 監視の棚卸しで最も避けたい形だから（実際に4系統がそうなっていた）。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = path.join(ROOT, 'data/crossrepo-probes.json');
const COVERAGE = path.join(ROOT, 'data/automation-coverage.json');
const MONITORING = path.join(ROOT, 'data/monitoring-coverage.json');

/** 写しの寿命。`check-degradation.mjs` と同じ値にしてある（別々に動かさない）。 */
export const SNAPSHOT_MAX_DAYS = 60;

/** 隣として認めるリポジトリ。ここに無い名前を指した証跡は、それ自体が誤り。 */
export const SIBLINGS = ['simplememo-api', 'simplememo-ios'];

/**
 * パスは**空白で切る。**文字種で切ると
 * `docs/reports/watch_sync_診断改修案_2026-07-26.md` のような日本語のファイル名が
 * 途中で切れ、**実在するのに「無い」と報告する。**（最初の実装で実際にそうなった）
 */
export const CROSSREPO_PREFIX = '../';

export function ageDays(iso, today = new Date()) {
  if (!iso) return null;
  const t = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(t.getTime())) return null;
  return Math.floor((today - t) / 86_400_000);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function readSnapshot() {
  if (!fs.existsSync(SNAPSHOT)) return null;
  try { return readJson(SNAPSHOT); } catch { return null; }
}

/** 証跡の文字列から `../repo/path` を全部拾う（`a / b` のような連結にも耐える）。 */
export function extractPaths(value) {
  if (typeof value !== 'string') return [];
  return value
    .split(/\s+/)
    .filter((tok) => tok.startsWith(CROSSREPO_PREFIX))
    // 行番号やアンカーが付いていても、見るのはファイルそのもの
    .map((tok) => tok.split('#')[0].replace(/:\d+$/, ''))
    .filter((tok) => tok.length > CROSSREPO_PREFIX.length);
}

/**
 * 2つの台帳が隣を指している箇所を全部集める。**手で並べない。**
 * 並べると、新しく足された参照が黙って対象外になる — それはこの検査が
 * 塞ごうとしている穴と同じ形。
 */
export function collectRefs({ coverage = readJson(COVERAGE), monitoring = readJson(MONITORING) } = {}) {
  const refs = [];
  for (const t of coverage.tasks ?? []) {
    for (const e of t.evidence ?? []) {
      for (const p of extractPaths(e)) {
        refs.push({ ref: p, kind: 'evidence', executor: t.executor, where: `${t.area} / ${t.task}` });
      }
    }
  }
  for (const s of monitoring.signals ?? []) {
    for (const p of extractPaths(s.detector)) {
      refs.push({
        ref: p,
        kind: 'detector',
        detection: s.detection,
        where: `監視 / ${s.id ?? s.domain}`,
      });
    }
  }
  return refs;
}

/**
 * 隣が見えるなら実物を見る。無いなら写し。**どちらで判定したかを必ず返す。**
 * 「確かめた」と「写しで通した」を混ぜない。
 */
export function resolve(refs, { snapshot = readSnapshot(), today = new Date(), root = ROOT } = {}) {
  const live = SIBLINGS.every((r) => fs.existsSync(path.join(root, '..', r)));
  const unique = [...new Set(refs.map((r) => r.ref))].sort();

  if (live) {
    const map = Object.fromEntries(unique.map((p) => [p, fs.existsSync(path.resolve(root, p))]));
    return { mode: 'live', map, problems: [] };
  }

  if (!snapshot?.evidence) {
    return {
      mode: 'none',
      map: {},
      problems: ['隣のリポジトリが無く、写しも無い'
        + ' — `node scripts/crossrepo.mjs --sync` を3リポジトリの揃った場所で実行する'],
    };
  }
  const age = ageDays(snapshot.synced_at, today);
  if (age === null || age > SNAPSHOT_MAX_DAYS) {
    return {
      mode: 'stale',
      map: {},
      problems: [`写しが ${age === null ? '日付を読めない' : `${age}日前`}`
        + `（上限 ${SNAPSHOT_MAX_DAYS}日）— **古い写しは、無い検査と同じ**`],
    };
  }
  const map = {};
  const problems = [];
  for (const p of unique) {
    const rec = snapshot.evidence[p];
    if (rec === undefined) {
      problems.push(`写しに "${p}" が無い — 台帳が写しより新しい。--sync が要る`);
      continue;
    }
    map[p] = rec.exists === true;
  }
  return { mode: 'snapshot', map, problems };
}

export function validate(refs, resolved) {
  const problems = [...resolved.problems];
  if (resolved.mode === 'none' || resolved.mode === 'stale') return problems;

  for (const r of refs) {
    const repo = r.ref.split('/')[1];
    if (!SIBLINGS.includes(repo)) {
      problems.push(`${r.where}: "${r.ref}" — 隣として登録されていないリポジトリ`);
      continue;
    }
    const exists = resolved.map[r.ref];
    if (exists === undefined) continue; // 写しの欠落は上で報告済み
    if (exists) continue;

    if (r.kind === 'detector') {
      problems.push(`${r.where}: 検知器 "${r.ref}" が無い`
        + `（detection: ${r.detection}）— **無い検知器を automatic と書かない**`);
    } else {
      problems.push(`${r.where}: 証跡 "${r.ref}" が無い`
        + `（executor: ${r.executor}）— **指せない証跡で「やっている」と数えない**`);
    }
  }
  return problems;
}

/** 3リポジトリが揃っている場所でだけ写しを更新する。揃っていなければ書かない。 */
export function sync(today = new Date()) {
  const missing = SIBLINGS.filter((r) => !fs.existsSync(path.join(ROOT, '..', r)));
  if (missing.length) {
    return { ok: false, message: `隣が無いので写しを更新できない: ${missing.join(', ')}` };
  }
  const refs = collectRefs();
  const unique = [...new Set(refs.map((r) => r.ref))].sort();
  const evidence = {};
  for (const p of unique) {
    const abs = path.resolve(ROOT, p);
    if (!fs.existsSync(abs)) { evidence[p] = { exists: false }; continue; }
    const buf = fs.readFileSync(abs);
    evidence[p] = {
      exists: true,
      bytes: buf.length,
      sha256_12: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12),
    };
  }
  const doc = readSnapshot() ?? {};
  doc.synced_at = today.toISOString().slice(0, 10);
  doc.max_age_days = SNAPSHOT_MAX_DAYS;
  doc.evidence = evidence;
  fs.writeFileSync(SNAPSHOT, `${JSON.stringify(doc, null, 2)}\n`);
  const absent = unique.filter((p) => !evidence[p].exists).length;
  return { ok: true, message: `写しを更新: ${unique.length}件（うち存在しない ${absent}件）` };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);

  if (argv.includes('--sync')) {
    const r = sync();
    console.log(r.message);
    process.exit(r.ok ? 0 : 1);
  }

  const refs = collectRefs();
  const resolved = resolve(refs);
  const problems = validate(refs, resolved);

  const source = {
    live: '**隣を実際に見た**',
    snapshot: '写しで判定',
    none: '写しが無い',
    stale: '写しが古い',
  }[resolved.mode];

  const unique = [...new Set(refs.map((r) => r.ref))];
  const absent = unique.filter((p) => resolved.map[p] === false);

  console.log(`隣のリポジトリを指した証跡 — ${source}\n`);
  console.log(`  参照 ${refs.length}件 / 実ファイル ${unique.length}件 / **存在しない ${absent.length}件**\n`);

  if (absent.length) {
    for (const p of absent) console.log(`  ✗ ${p}`);
    console.log('');
  }

  if (!argv.includes('--check')) {
    console.log('  **隣が無ければスキップ、はやらない。**それがこの検査の作られた原因。');
    console.log('  写しの寿命は 60日。古い写しは、無い検査と同じ。');
  }

  if (problems.length) {
    console.log(`\n隣の証跡: 問題 ${problems.length}件`);
    for (const p of problems) console.log(`  - ${p}`);
    if (argv.includes('--check')) process.exit(1);
  } else {
    console.log('\n隣の証跡: OK');
  }
}
