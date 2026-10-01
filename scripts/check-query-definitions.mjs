#!/usr/bin/env node
/** Existing SQL definition/lineage monitoring only; no query or KPI measurement. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validate, bump } from './check-definitions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REGISTRY_PATH = path.join(ROOT, 'data/sql-query-definitions.json');
export const SQL_FILES = Object.freeze([
  'growth/sql/analytics/ga4-cta-pages.sql',
  'growth/sql/analytics/ga4-funnel.sql',
  'growth/sql/analytics/ga4-journey.sql',
  'growth/sql/analytics/ga4-landing-diagnostic.sql',
  'growth/sql/analytics/ga4-quality.sql',
  'growth/sql/analytics/gsc-intent.sql',
  'growth/sql/analytics/gsc-pages.sql',
  'growth/sql/analytics/gsc-site.sql',
]);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const defaultIO = {
  exists: file => fs.existsSync(path.join(ROOT, file)),
  read: file => hash(fs.readFileSync(path.join(ROOT, file))).slice(0, 16),
  readFull: file => hash(fs.readFileSync(path.join(ROOT, file))),
};
const idFor = file => path.posix.basename(file, '.sql').replaceAll('-', '_') + '_sql_definition';
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
  && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;

function shapeProblems(doc) {
  const problems = [];
  if (doc?.schema_version !== 1 || doc.registry_kind !== 'existing_sql_definition_monitoring'
      || !Array.isArray(doc.definitions)) return ['existing_sql_definition_monitoring registry の宣言が要る'];
  if (doc.definitions.length !== SQL_FILES.length) problems.push('宣言した既存SQL8本の全定義が要る');
  const seen = new Set();
  for (const d of doc.definitions) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) { problems.push('SQL定義はobjectが要る'); continue; }
    if (!SQL_FILES.includes(d.source_file) || d.id !== idFor(d.source_file)) problems.push('既存SQLの固定path/idと一致しない');
    if (seen.has(d.source_file)) problems.push('SQL定義が重複');
    seen.add(d.source_file);
    if (d.definition_kind !== 'existing_sql_source_monitoring') problems.push('queryを新しいKPI/測定値として登録しない');
    if (Object.hasOwn(d, 'source_dependencies')) problems.push('このregistryは宣言したSQL原本だけを監視する');
    if (typeof d.source_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(d.source_sha256)
        || d.checksum !== d.source_sha256.slice(0, 16)) problems.push('SQL fullSHAと原validator用checksumの結合が不正');
    if (!Number.isInteger(d.version) || d.version < 1 || !day(d.changed_at)) problems.push('version/changed_atが不正');
    if (!Array.isArray(d.history) || d.history.length !== d.version
        || d.history.some((h, i) => !h || h.version !== i + 1 || !day(h.at)
          || typeof h.why !== 'string' || !h.why.trim())
        || d.history.at(-1)?.at !== d.changed_at) problems.push('理由付き連続version履歴が不正');
  }
  for (const file of SQL_FILES) if (!seen.has(file)) problems.push('SQL定義の欠落: ' + file);
  return problems;
}

export function validateQueryDefinitions(doc, io = defaultIO) {
  const shape = shapeProblems(doc);
  if (shape.length) return { problems: shape, drifted: [] };
  // Reuse the original validator; its checksum/version/reason semantics remain intact.
  const result = validate(doc, { read: io.read, exists: io.exists });
  const problems = [...result.problems];
  for (const d of doc.definitions) {
    try {
      const full = io.readFull(d.source_file);
      if (typeof full !== 'string' || !/^[a-f0-9]{64}$/.test(full) || full !== d.source_sha256)
        problems.push(d.id + ': SQL fullSHAが変わっている — 理由付きversion更新が要る');
    } catch { problems.push(d.id + ': SQL原本のfullSHAを読めない'); }
  }
  return { problems, drifted: result.drifted };
}

export function bumpQueryDefinition(doc, id, why, io = defaultIO, today = new Date().toISOString().slice(0, 10)) {
  const problems = shapeProblems(doc);
  if (problems.length) throw new Error(problems.join(' / '));
  const original = doc.definitions.find(d => d.id === id);
  if (!original) throw new Error('未知のSQL定義id');
  if (!day(today)) throw new Error('更新日が不正');
  const full = io.readFull(original.source_file);
  if (typeof full !== 'string' || !/^[a-f0-9]{64}$/.test(full)) throw new Error('SQL fullSHAを確認できない');
  // Mutate a copy only after all original-source reads pass; errors never edit the caller.
  const next = JSON.parse(JSON.stringify(doc));
  const changed = bump(next, id, why, { read: io.read, exists: io.exists, today });
  if (changed.checksum !== full.slice(0, 16)) throw new Error('SQL読取中の原本変更を拒否');
  changed.source_sha256 = full;
  const after = shapeProblems(next);
  if (after.length) throw new Error(after.join(' / '));
  return next;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const argv = process.argv.slice(2);
    const doc = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    if (argv.length === 4 && argv[0] === '--bump' && argv[2] === '--why') {
      const next = bumpQueryDefinition(doc, argv[1], argv[3]);
      fs.writeFileSync(REGISTRY_PATH, JSON.stringify(next, null, 2) + '\n');
      console.log('既存SQL定義を理由付きversion更新。query実行/KPI測定なし。');
    } else {
      if (!(argv.length === 0 || (argv.length === 1 && argv[0] === '--check'))) throw new Error('許可引数は --check または --bump <id> --why <reason>');
      const result = validateQueryDefinitions(doc);
      if (result.problems.length) { for (const p of result.problems) console.error(p); process.exitCode = 1; }
      else console.log('既存SQL定義8本のversion/hash契約が一致。query実行/KPI測定なし。');
    }
  } catch (e) { console.error(e.message); process.exitCode = 2; }
}
