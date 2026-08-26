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

/**
 * 台帳を読んで**返す**局所関数。`const doc = load()` の load がこれ。
 *
 * [2026-08-26] これを見ていなかったので、**73本中12本を丸ごと飛ばしていた。**
 * check-public-facts / review-intake などは
 * `return JSON.parse(fs.readFileSync(...))` の形で読んでいて、
 * `const NAME = ...` に現れないため束縛が1つも見つからず、
 * scan が即 `[]` を返していた。**それが出力では「新しく増えた箇所は無い」になる。**
 * 自分の検査が、探していた形そのものをしていた。
 */
const READER_FN = /(?:function\s+([A-Za-z_$][\w$]*)\s*\(|(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\()/g;

function readerNames(masked) {
  const out = new Set();
  for (const m of masked.matchAll(READER_FN)) {
    const name = m[1] || m[2];
    if (!name) continue;
    // 本体を大まかに切り出す（次の関数定義まで）。厳密な括弧対応は要らない ——
    // **広めに取って偽陽性側へ倒す。**見落とすほうが害が大きい
    const body = masked.slice(m.index, m.index + 1200);
    if (READ_FN.test(body)) out.add(name);
  }
  return out;
}

/** 台帳由来の束縛を、代入をたどって伝播させる（不動点まで）。 */
export function taintedNames(masked) {
  const decls = [];
  for (const m of masked.matchAll(DECL)) decls.push([m[1], m[2]]);
  const readers = readerNames(masked);
  const t = new Set(decls
    .filter(([, r]) => READ_FN.test(r) || [...readers].some((fn) => new RegExp(`\\b${fn}\\s*\\(`).test(r)))
    .map(([n]) => n));
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

/**
 * **第2の族: 仮引数に対する「無いかもしれない」判定。**
 *
 * 汚染の伝播は `const NAME = ...` を追うので、**関数の仮引数には付かない。**
 * そのせいで同じ形を2度取り逃した:
 *
 *   #638  policyDrift(policy, series)         `declared === undefined` → return []
 *   #639  validateApprovals(_, {monthlyCap})  上限の突き合わせが消える（**金額**）
 *
 * 引数まで汚染を広げるとほぼ全部に付くので、**形のほうで絞る** ——
 * 仮引数に対する null/undefined 判定だけを拾う。25件（lib を除く）を
 * 1件ずつ読んだところ、大半は `—` / `n/a` を出す表示整形で、
 * **欠けていることを隠さず出している側**だった。本物は1件
 * （check-model-routing の `workflow !== null`）。
 */
const FN_SIG = /function\s+[A-Za-z_$][\w$]*\s*\(([^)]*)\)|\(([^)]*)\)\s*=>/g;
const NULL_TEST = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*(?:!==?|===?)\s*(?:null|undefined)/g;

function paramsOf(sig) {
  const out = new Set();
  let depth = 0; let cur = '';
  for (const ch of `${sig},`) {
    if ('{[('.includes(ch)) depth++;
    else if ('}])'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      const m = cur.match(/^\s*([A-Za-z_$][\w$]*)/);
      if (m) out.add(m[1]);
      for (const m2 of cur.matchAll(/([A-Za-z_$][\w$]*)\s*=/g)) out.add(m2[1]);
      cur = '';
    } else cur += ch;
  }
  return out;
}

export function scanParams(src) {
  const m = mask(src);
  const params = new Set();
  for (const mo of m.matchAll(FN_SIG)) {
    for (const p of paramsOf(mo[1] ?? mo[2] ?? '')) params.add(p);
  }
  const lines = src.split('\n');
  const byLine = new Map();
  for (const g of m.matchAll(NULL_TEST)) {
    if (!params.has(g[1])) continue;
    const line = m.slice(0, g.index).split('\n').length;
    if (!byLine.has(line)) byLine.set(line, { line, expr: g[1], text: lines[line - 1].trim() });
  }
  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

export function scanAllParams() {
  const out = [];
  for (const rel of sources()) {
    for (const s of scanParams(fs.readFileSync(path.join(ROOT, rel), 'utf8'))) {
      out.push({ ...s, file: rel });
    }
  }
  return out;
}

/**
 * **検査が実際に見るもの全部**を1つの関数にまとめる。
 *
 * [2026-08-26] main ブロックに配線が散っていると、**--selftest から見えない。**
 * この工程で3度踏んだ（check-generators の --write、check-financial-policy の
 * 上限必須、そしてここ）。族を1つ足したのに main へ繋ぎ忘れても、
 * 「比較する関数は動く」ほうのテストだけが通って緑になる。
 * **配線そのものを1つの関数にして、自己テストから呼ぶ。**
 */
export function allProblems(led) {
  const sites = scanAll();
  const params = scanAllParams();
  const cov = coverage();
  return {
    sites,
    params,
    cov,
    problems: [
      ...validate(sites, led.known),
      ...checkCoverage(cov, led),
      ...validate(params, led.param_guards || []),
    ],
  };
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

/**
 * **この走査が実際に見られた本数。**
 *
 * [2026-08-26] scan は台帳由来の束縛が1つも無いと即 `[]` を返す。
 * つまり**見なかったファイルも「候補0件」と同じ形で出る。**
 * 実測すると 73本中12本がそれで、その中に check-public-facts / review-intake /
 * autopilot-runs が入っていた。出力は「新しく増えた箇所は無い」のままだった。
 *
 * **探していた形を、自分の検査がしていた。**
 * 局所の読み出し関数（`function load() { return JSON.parse(...) }`）を
 * 汚染源に足して 12 → 8本にし、残りは台帳に名指しで置く。
 */
export function coverage() {
  const seen = []; const blind = [];
  for (const rel of sources()) {
    const t = taintedNames(mask(fs.readFileSync(path.join(ROOT, rel), 'utf8')));
    (t.size ? seen : blind).push(rel);
  }
  return { total: seen.length + blind.length, seen, blind };
}

/** 見えていないファイルが**増えていない**ことを見る。上限を上げて通さない。 */
export function checkCoverage(cov, doc) {
  const declared = new Set(doc.no_ledger_binding || []);
  const problems = [];
  for (const f of cov.blind) {
    if (!declared.has(f)) {
      problems.push(`${f} は台帳由来の束縛が1つも見つからない — **この走査から見えていない。**`
        + '読み方が新しいなら汚染源を足す。本当に台帳を読まないなら'
        + ' no_ledger_binding へ理由とともに足す');
    }
  }
  for (const f of declared) {
    if (!cov.blind.includes(f)) {
      problems.push(`no_ledger_binding の「${f}」は今は見えている — 台帳から消す`);
    }
  }
  return problems;
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
  ['**仮引数の判定を拾う**（汚染では届かない族）', () => {
    const hits = scanParams('function f(cap) { if (cap !== null && x) return 1; }\n');
    assert(hits.some((h) => h.expr === 'cap'), JSON.stringify(hits));
  }],
  ['仮引数でない値は拾わない', () => {
    const hits = scanParams('function f(a) { if (b !== null) return 1; }\n');
    assert(hits.length === 0, JSON.stringify(hits));
  }],
  ['**実データの仮引数判定が台帳と合っている**', () => {
    const led = readLedger(LEDGER_PATH);
    const p = validate(scanAllParams(), led.param_guards || []);
    assert(p.length === 0, `${p.length} 件: ${p.slice(0, 2).join(' / ')}`);
  }],
  ['**仮引数の族が本当に配線されている**（比較関数が動くだけでは足りない）', () => {
    const led = readLedger(LEDGER_PATH);
    assert(allProblems(led).problems.length === 0, '実データで問題が出た');
    const short = { ...led, param_guards: (led.param_guards || []).slice(1) };
    assert(allProblems(short).problems.length > 0,
      '**仮引数の台帳から1件消しても通った** — main へ繋がっていない');
  }],
  ['**実データが台帳と合っている**', () => {
    const led = readLedger(LEDGER_PATH, { onMissing: null, why: '読んだ記録が無い' });
    assert(led !== null, 'data/guard-shapes.json が無い');
    requireShape(led, ['known'], { what: 'data/guard-shapes.json', why: '読んだ記録と突き合わせられない' });
    const p = validate(scanAll(), led.known);
    assert(p.length === 0, `${p.length} 件: ${p.slice(0, 2).join(' / ')}`);
  }],
  ['**見えていないファイルが増えたら落ちる**（母数を黙って縮めさせない）', () => {
    const p = checkCoverage({ total: 2, seen: ['a.mjs'], blind: ['b.mjs'] }, { no_ledger_binding: [] });
    assert(p.some((x) => x.includes('見えていない')), JSON.stringify(p));
  }],
  ['台帳に明記した分は通る', () => {
    const p = checkCoverage({ total: 2, seen: ['a.mjs'], blind: ['b.mjs'] }, { no_ledger_binding: ['b.mjs'] });
    assert(p.length === 0, JSON.stringify(p));
  }],
  ['**見えるようになったのに台帳に残っていたら落ちる**（記録が実体と合わなくなる）', () => {
    const p = checkCoverage({ total: 1, seen: ['a.mjs'], blind: [] }, { no_ledger_binding: ['a.mjs'] });
    assert(p.some((x) => x.includes('今は見えている')), JSON.stringify(p));
  }],
  ['**実データの母数が台帳と合っている**', () => {
    const led = readLedger(LEDGER_PATH);
    const p = checkCoverage(coverage(), led);
    assert(p.length === 0, `${p.length} 件: ${p.slice(0, 2).join(' / ')}`);
  }],
  ['**局所の読み出し関数も汚染源になる**（return JSON.parse(...) の形）', () => {
    const t = taintedNames(mask('function load() { return JSON.parse(fs.readFileSync(P, "utf8")); }\n'
      + 'const doc = load();\n'));
    assert(t.has('doc'), '**73本中12本を飛ばしていた形。**再発したらここで落ちる');
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
  const { params, cov, problems } = allProblems(led);

  console.log(`正が無いと消えうる規則の形 — ${sites.length} 箇所`
    + `（読んだ記録 ${led.known.length} 件）`);
  // **見た本数を必ず出す。**「候補0件」と「そのファイルを見ていない」は
  // 出力が同じになりうるので、母数のほうを毎回書く
  console.log(`  仮引数の「無いかもしれない」判定 — ${params.length} 箇所`
    + `（読んだ記録 ${(led.param_guards || []).length} 件）`);
  console.log(`  走査 ${cov.total} 本中 ${cov.seen.length} 本を実際に見た`
    + `（${cov.blind.length} 本は台帳由来の束縛なしと台帳に明記）\n`);
  if (problems.length) {
    console.error('照合できていない箇所:');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('\n**この形は4つのPRで6件の欠陥を出している。**新しく増えたなら1件読む');
    process.exit(1);
  }
  console.log('  新しく増えた箇所は無い。**上限を上げて通さない。**');
}
