#!/usr/bin/env node
/**
 * **正が無いときに規則が消える書き方**を、機械で洗い出す。
 *
 *   node scripts/check-guard-shapes.mjs --check
 *   node scripts/check-guard-shapes.mjs --selftest
 *   node scripts/check-guard-shapes.mjs --list      # 全候補を並べる（台帳を書くとき）
 *
 * 【なぜ要るか】
 * この形は 2026-08-26 までに **4つのPRで6件** 出ている。どれも手で見つけた。
 *
 *   #633  (authority.domains || [])              空の権限表 → ループ0周 → 「担保されている」
 *   #633  authority.self_repair?.may_modify ?? []  同上 → 「独立の3点が担保されている」
 *   #634  intakeIds.size && !intakeIds.has(id)    空の台帳 → 規則が丸ごと消える
 *   #635  READY !== undefined && n !== READY      実測が無い → 速度の規則が発火しない
 *   #636  vendorIds.size && !vendorIds.has(id)    空のベンダー台帳 → 照合が消える
 *   #636  backlogIds.size && !backlogIds.has(id)  空の棚卸し → 行き先の確認が消える
 *   #636  doc.production_verified !== undefined && …  宣言を消すと突き合わせも消える
 *
 * 抽象化すると **「照合する相手が無いとき偽になる項」が、違反判定の側に置かれている。**
 * 6件を手で見つけたなら、機械で当たれる。**探し方を残さないと、7件目も運になる。**
 *
 * 【これは判定ではなく棚卸し】`X && violation` は、X 自体が違反の一部なら正しい
 * （`if (r.exists && !r.where)` など）。機械で決められるのは「その形をしている」まで。
 * だから **台帳に1件ずつ読んだ記録を残し、新しく増えた分だけを止める。**
 * 上限を上げて通さない、というこのリポジトリの他のラチェットと同じ。
 *
 * 【計測器を間違えた前科】この工程で5回ある。いちばん効いたのが
 * **コメント中の語まで拾って 102 件**を出した走査。だから最初に
 * 「どこがコードか」を確定させ、**その判定自体を自己テストで固定した。**
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, run } from './lib/selftest.mjs';
import { readLedger, requireShape } from './lib/read-ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/guard-shapes.json');

const IDENT_END = /[A-Za-z0-9_$)\]]/;
const KEYWORD_BEFORE_RE = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new',
  'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

/**
 * コードでない部分（コメント・文字列・テンプレート・正規表現）を空白へ潰す。
 * **位置は1対1で保つ**ので行番号がそのまま使える。
 *
 * 正規表現か除算かは直前の意味のあるトークンで決める。曖昧な `}` は
 * **正規表現側へ倒す** —— この用途では正規表現を除算と読むほうが害が大きい。
 */
export function mask(src) {
  const out = src.split('');
  const n = src.length;
  let i = 0;
  let prev = '';
  const blank = (a, b) => { for (let k = a; k < b && k < n; k++) if (out[k] !== '\n') out[k] = ' '; };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      let j = src.indexOf('\n', i); if (j < 0) j = n;
      blank(i, j); i = j; continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2;
      blank(i, j); i = j; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c || src[j] === '\n') break;
        j++;
      }
      blank(i + 1, j); i = Math.min(j + 1, n); prev = '"'; continue;
    }
    if (c === '`') {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') {
          let k = j + 2; let d = 1;
          while (k < n && d) { if (src[k] === '{') d++; else if (src[k] === '}') d--; k++; }
          j = k; continue;                      // ${ } の中はコードなので残す
        }
        if (src[j] === '`') break;
        if (out[j] !== '\n') out[j] = ' ';
        j++;
      }
      i = Math.min(j + 1, n); prev = '`'; continue;
    }
    if (c === '/') {
      let isRe = true;
      if (prev && IDENT_END.test(prev[prev.length - 1]) && !KEYWORD_BEFORE_RE.has(prev)) isRe = false;
      if (prev === '"' || prev === '`') isRe = false;
      if (isRe) {
        let j = i + 1; let inClass = false;
        while (j < n) {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') inClass = true;
          else if (src[j] === ']') inClass = false;
          else if (src[j] === '/' && !inClass) break;
          else if (src[j] === '\n') { j = i; break; }   // 行をまたぐ＝正規表現ではない
          j++;
        }
        if (j > i) {
          for (let k = i; k <= j && k < n; k++) out[k] = ' ';
          let k = j + 1;
          while (k < n && /[a-z]/i.test(src[k])) { out[k] = ' '; k++; }
          i = k; prev = 'x'; continue;
        }
      }
      prev = '/'; i++; continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$.]/.test(src[j])) j++;
      prev = src.slice(i, j); i = j; continue;
    }
    prev = c; i++;
  }
  return out.join('');
}

const READ_FN = /\b(readLedger|readJson|readFileSync|JSON\.parse|loadLedger)\b/;
const DECL = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]*)/g;

/** 台帳由来の束縛を、代入をたどって伝播させる（不動点まで）。 */
export function taintedNames(masked) {
  const decls = [];
  for (const m of masked.matchAll(DECL)) decls.push([m[1], m[2]]);
  const t = new Set(decls.filter(([, r]) => READ_FN.test(r)).map(([n]) => n));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [n, rhs] of decls) {
      if (t.has(n)) continue;
      for (const ref of rhs.match(/[A-Za-z_$][\w$]*/g) || []) {
        if (t.has(ref)) { t.add(n); changed = true; break; }
      }
    }
  }
  return t;
}

/**
 * **存在確認が && の左に来ている**箇所を拾う。
 * 空既定（`x.y || []`）は数が多く（117件）ほぼ正当なので、ここでは扱わない。
 * 6件のうち5件はこちらの形で、**残り1件も同じ「相手が無いと偽になる項」**。
 */
const PRESENCE = [
  ['.size', /([A-Za-z_$][\w$]*(?:\??\.[\w$]+)*)\.size\s*&&/g],
  ['.length', /([A-Za-z_$][\w$]*(?:\??\.[\w$]+)*)\.length\s*&&/g],
  ['!== undefined', /([A-Za-z_$][\w$]*(?:\??\.[\w$]+)*)\s*!==?\s*(?:undefined|null)\s*&&/g],
  ['Object.keys', /Object\.keys\(\s*([A-Za-z_$][\w$]*(?:\??\.[\w$]+)*)\s*\)\.length\s*&&/g],
  ['素の &&', /(?<![\w$.])([A-Za-z_$][\w$]*(?:\??\.[\w$]+)+)\s*&&\s*(?![&|])/g],
];

export function scan(src) {
  const m = mask(src);
  const t = taintedNames(m);
  if (!t.size) return [];
  const lines = src.split('\n');
  const byKey = new Map();
  for (const [label, rx] of PRESENCE) {
    for (const mo of m.matchAll(new RegExp(rx.source, 'g'))) {
      const expr = mo[1];
      const root = expr.match(/[A-Za-z_$][\w$]*/)[0];
      if (!t.has(root)) continue;
      const line = m.slice(0, mo.index).split('\n').length;
      // 同じ行は1件に畳む（`.size &&` は「素の &&」にも当たる）
      const key = `${line}`;
      if (!byKey.has(key)) byKey.set(key, { line, shape: label, expr, text: lines[line - 1].trim() });
    }
  }
  return [...byKey.values()].sort((a, b) => a.line - b.line);
}

/** 台帳の鍵。行番号は動くので**ファイル＋式**で持つ。 */
export const siteKey = (file, expr) => `${file}::${expr}`;

export function validate(sites, known) {
  const problems = [];
  const knownKeys = new Set(known.map((k) => siteKey(k.file, k.expr)));
  const seen = new Set();
  for (const s of sites) {
    const k = siteKey(s.file, s.expr);
    seen.add(k);
    if (!knownKeys.has(k)) {
      problems.push(`${s.file}:${s.line} ${s.expr} — **台帳に無い。**`
        + `正が無いときこの規則が消えないか、1件読んで data/guard-shapes.json へ書く\n`
        + `      ${s.text.slice(0, 100)}`);
    }
  }
  for (const k of known) {
    if (!seen.has(siteKey(k.file, k.expr))) {
      problems.push(`${k.file} の ${k.expr} が見当たらない — `
        + '直したなら台帳からも消す（**読んだ記録が実体と合わなくなる**）');
    }
  }
  return problems;
}

function sources() {
  const out = [];
  for (const dir of ['scripts', 'growth/scripts']) {
    const d = path.join(ROOT, dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (f.endsWith('.mjs')) out.push(`${dir}/${f}`);
    }
  }
  return out.sort();
}

export function scanAll() {
  const sites = [];
  for (const rel of sources()) {
    for (const s of scan(fs.readFileSync(path.join(ROOT, rel), 'utf8'))) {
      sites.push({ ...s, file: rel });
    }
  }
  return sites;
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
// 実際に見つけた6件の形を、そのまま検体にしている。
// 走査を骨抜きにすると、ここが落ちる。
const FOUND = [
  ['#634 intakeIds.size &&',
    'const intake = JSON.parse(fs.readFileSync(P, "utf8"));\n'
    + 'const intakeIds = new Set(intake.dispositions.map((d) => d.review_id));\n'
    + 'if (intakeIds.size && !intakeIds.has(r.review_id)) { p.push("x"); }\n', 3],
  ['#635 READY !== undefined &&',
    'const BENCHMARK = JSON.parse(fs.readFileSync(P, "utf8"));\n'
    + 'const READY = BENCHMARK.apps?.[N]?.ready;\n'
    + 'const c = (m) => READY !== undefined && Number(m[1]) !== READY;\n', 3],
  ['#636 vendorIds.size &&',
    'const vendors = JSON.parse(fs.readFileSync(P, "utf8"));\n'
    + 'const vendorIds = new Set(vendors.vendors.map((v) => v.id));\n'
    + 'if (vendorIds.size && !vendorIds.has(v.id)) { p.push("x"); }\n', 3],
];

const NOT_FOUND = [
  ['コメント中の同じ形は拾わない（**102件の誤検出を出した前科**）',
    'const d = JSON.parse(fs.readFileSync(P, "utf8"));\n'
    + '// if (d.ids.size && !d.ids.has(x)) — 昔はこう書いていた\n'],
  ['文字列の中も拾わない',
    'const d = JSON.parse(fs.readFileSync(P, "utf8"));\n'
    + 'const msg = "d.ids.size && !d.ids.has(x)";\n'],
  ['台帳由来でない値は拾わない（引数・定数）',
    'function f(opts) { if (opts.ids.size && !opts.ids.has(x)) return 1; }\n'],
];

const SCENARIOS = [
  ...FOUND.map(([name, src, line]) => [`**実際に見つけた形を拾う** — ${name}`, () => {
    const hits = scan(src);
    assert(hits.some((h) => h.line === line),
      `拾えなかった（**この走査は6件のどれも見つけられない**）: ${JSON.stringify(hits)}`);
  }]),
  ...NOT_FOUND.map(([name, src]) => [name, () => {
    const hits = scan(src);
    assert(hits.length === 0, `誤検出 ${hits.length} 件: ${JSON.stringify(hits)}`);
  }]),
  ['テンプレートの ${} の中はコード', () => {
    const m = mask('const a = `x${ y.z }w`;\n');
    assert(m.includes('y.z'), '${} の中まで潰した');
    assert(!m.includes('w'), 'テンプレートの地の文を残した');
  }],
  ['正規表現の中は拾わない / 直後のコードは拾う', () => {
    const m = mask('const r = /a&&b/g; const c = d && e;\n');
    assert(!m.includes('a&&b'), '正規表現の中を残した');
    assert(m.includes('d && e'), '正規表現の後のコードまで潰した');
  }],
  ['行番号が保たれる', () => {
    const src = '// aaaa\nconst a = 1;\n';
    assert(mask(src).length === src.length, '長さが変わった');
  }],
  ['**実データが台帳と合っている**', () => {
    const led = readLedger(LEDGER_PATH, { onMissing: null, why: '読んだ記録が無い' });
    assert(led !== null, 'data/guard-shapes.json が無い');
    requireShape(led, ['known'], { what: 'data/guard-shapes.json', why: '読んだ記録と突き合わせられない' });
    const p = validate(scanAll(), led.known);
    assert(p.length === 0, `${p.length} 件: ${p.slice(0, 2).join(' / ')}`);
  }],
  ['**台帳から1件消すと落ちる**（読んだ記録が無い箇所を素通りさせない）', () => {
    const led = readLedger(LEDGER_PATH);
    assert(led.known.length > 0, '台帳が空');
    const p = validate(scanAll(), led.known.slice(1));
    assert(p.length > 0, '台帳に無い箇所を通した — **この検査は何も見ていない**');
  }],
];

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 ? 0 : 1);

  const sites = scanAll();
  if (process.argv.includes('--list')) {
    for (const s of sites) console.log(`${s.file}:${s.line}\t${s.shape}\t${s.expr}\n      ${s.text.slice(0, 100)}`);
    console.log(`\n候補 ${sites.length} 件`);
    process.exit(0);
  }

  const led = readLedger(LEDGER_PATH, { onMissing: null, why: '**どれを読んだかが分からない**' });
  if (led === null) {
    console.error('data/guard-shapes.json が無い — 読んだ記録と突き合わせられない');
    process.exit(1);
  }
  requireShape(led, ['known'], { what: 'data/guard-shapes.json', why: '読んだ記録と突き合わせられない' });
  const problems = validate(sites, led.known);

  console.log(`正が無いと消えうる規則の形 — ${sites.length} 箇所`
    + `（読んだ記録 ${led.known.length} 件）\n`);
  if (problems.length) {
    console.error('照合できていない箇所:');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('\n**この形は4つのPRで6件の欠陥を出している。**新しく増えたなら1件読む');
    process.exit(1);
  }
  console.log('  新しく増えた箇所は無い。**上限を上げて通さない。**');
}
