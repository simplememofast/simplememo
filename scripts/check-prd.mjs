#!/usr/bin/env node
/**
 * **PRD が定型を満たしているか。**
 *
 *   node scripts/check-prd.mjs            # 表示
 *   node scripts/check-prd.mjs --check    # CI
 *   node scripts/check-prd.mjs --selftest
 *
 * 【なぜ要るか】
 * data/automation-coverage.json の「PRD・受入条件・UX・多言語の作成」が
 * `ai_proposes` で、note に「**都度作成・定型化されていない**」とあった。
 * 定型が無いと、PRD ごとに何が書いてあるかが変わり、
 * **書かれていないことに気づけない。**
 *
 * 【いちばん効くのは §6「決めていないこと」】
 * PRD は提案であって決定ではない。ここが無いと、
 * **PRD が黙ってオーナー判断を代行できてしまう**
 * （取り消し可能時間・課金の置き場所・本文を残すか、はどれもオーナーの判断）。
 * 本当に何も無いなら「無い」と書く —— **書かないことと、無いことを分ける。**
 *
 * 【VISION §13 の6問】`../simplememo-ios/docs/VISION.md` が
 * 「答えられないなら設計が早い」と書いている。**見出しがあるだけでは通さない。**
 * 各問に本文が要る。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, run as runScenarios } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PRD_DIR = path.join(ROOT, 'docs/prd');
export const TEMPLATE = 'TEMPLATE.md';

/** 見出しは番号で当てる。**文言を変えても壊れない**ようにする。 */
const SECTIONS = [
  { n: 0, what: '一行定義' },
  { n: 1, what: 'なぜこの機能か' },
  { n: 2, what: 'VISION §13 のチェック' },
  { n: 3, what: '受入条件' },
  { n: 4, what: 'UX' },
  { n: 5, what: '多言語' },
  { n: 6, what: '決めていないこと' },
  { n: 7, what: '測り方' },
];

export const STATES = ['設計案', '実装中', '実装済み', '取り下げ'];

/** §2 の6問。**見出しだけで通さない**ので、各問の本文を見る。 */
const GATE = 6;

function sectionBody(text, n) {
  const re = new RegExp(`^##\\s*${n}\\.[^\\n]*$`, 'm');
  const m = re.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const next = /^##\s*\d+\./m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

export function validate(text, { name = 'PRD' } = {}) {
  const problems = [];
  const at = (s) => `${name}: ${s}`;

  const state = /^状態:\s*(\S+)/m.exec(text)?.[1];
  if (!state) problems.push(at('状態 が無い'));
  else if (!STATES.includes(state)) {
    problems.push(at(`状態「${state}」は ${STATES.join(' / ')} のいずれか`));
  }
  if (!/^作成日:\s*\d{4}-\d{2}-\d{2}/m.test(text)) problems.push(at('作成日 が YYYY-MM-DD で無い'));
  if (!/^対象リポジトリ:/m.test(text)) problems.push(at('対象リポジトリ が無い'));

  const bodies = new Map();
  for (const s of SECTIONS) {
    const b = sectionBody(text, s.n);
    if (b === null) { problems.push(at(`§${s.n}「${s.what}」の見出しが無い`)); continue; }
    bodies.set(s.n, b);
    if (!b) problems.push(at(`§${s.n}「${s.what}」が空 — **見出しだけでは書いたことにならない**`));
  }

  // §2: 6問すべてに本文があること。**番号だけ並べて通さない**
  const gate = bodies.get(2);
  if (gate) {
    for (let i = 1; i <= GATE; i++) {
      // [2026-08-26] ここで `$` を multiline のまま使っていて、**行末で止まって
      // 本文を1文字も拾わなかった** —— 正しい PRD を「答えが無い」と落とした。
      // 終端は `(?![\s\S])`（文字列の終わり）で書く。
      const m = new RegExp(
        `^${i}\\.\\s*\\*\\*[^*]+\\*\\*\\s*:?([\\s\\S]*?)(?=^\\d\\.\\s*\\*\\*|^\\*\\*Routing|(?![\\s\\S]))`,
        'm').exec(gate);
      if (!m) { problems.push(at(`§2 の第${i}問が無い`)); continue; }
      if (!m[1].trim()) {
        problems.push(at(`§2 の第${i}問に答えが無い`
          + ' — **VISION §13 は「答えられないなら設計が早い」と書いてある**'));
      }
    }
    if (!/\*\*Routing Level\*\*/.test(gate)) {
      problems.push(at('§2 に Routing Level が無い — 触らないなら「触らない」と書く'));
    }
  }

  // §3: 判定できる形。**チェックボックスが1つも無いのは条件を書いていない**
  const accept = bodies.get(3);
  if (accept && !/^\s*-\s*\[[ x]\]/m.test(accept)) {
    problems.push(at('§3 受入条件にチェックボックスが無い — **是非を判定できる文で書く**'));
  }

  // §5: JA と EN の両方
  const i18n = bodies.get(5);
  if (i18n && !(/JA/.test(i18n) && /EN/.test(i18n))) {
    problems.push(at('§5 多言語に JA / EN の両方が無い — **片方だけの機能は出さない**'));
  }

  // §6: **ここが空だと PRD がオーナー判断を代行できる**
  const undecided = bodies.get(6);
  if (undecided !== undefined && undecided && !/決めるのは|無い/.test(undecided)) {
    problems.push(at('§6 に「決めるのは誰か」も「無い」も書かれていない'
      + ' — **PRD は提案であって決定ではない**'));
  }

  // §1: 出典。**主張だけの PRD を通さない**
  const why = bodies.get(1);
  if (why && !/`[^`]+`|\d{4}-\d{2}-\d{2}/.test(why)) {
    problems.push(at('§1 に出典が無い — `file` か台帳のパスか日付を書く'));
  }
  return problems;
}

export function listPrds(dir = PRD_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== TEMPLATE).sort();
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const good = () => fs.readFileSync(path.join(PRD_DIR, 'undo-last-capture.md'), 'utf8');
const drop = (text, re) => text.replace(re, '');

const SCENARIOS = [
  ['**実データの PRD が通る**', () => {
    const p = validate(good());
    assert(p.length === 0, `${p.length} 件: ${p.slice(0, 3).join(' / ')}`);
  }],
  ['**PRD が1件も無ければ、それを言う**（0件を「問題なし」と混ぜない）', () => {
    assert(listPrds('/nonexistent').length === 0, '存在しない場所で件数が出た');
  }],
  ['状態が語彙外なら落ちる', () => {
    const p = validate(good().replace('状態: 設計案', '状態: たぶん出す'));
    assert(p.some((x) => x.includes('状態')), JSON.stringify(p));
  }],
  ['**§6 を消すと落ちる**（PRD がオーナー判断を代行できないように）', () => {
    const p = validate(drop(good(), /^## 6\.[\s\S]*?(?=^## 7\.)/m));
    assert(p.some((x) => x.includes('§6')), JSON.stringify(p));
  }],
  ['**§6 が「決めるのは」も「無い」も書いていないと落ちる**', () => {
    const t = good().replace(/^## 6\.[\s\S]*?(?=^## 7\.)/m, '## 6. 決めていないこと\n\nあとで考える\n\n');
    const p = validate(t);
    assert(p.some((x) => x.includes('§6')), JSON.stringify(p));
  }],
  ['**§2 の問に答えが無いと落ちる**（見出しだけで通さない）', () => {
    const t = good().replace(/(1\. \*\*Capture Coverage[^*]*\*\*:)[\s\S]*?(?=^2\. \*\*)/m, '$1\n\n');
    const p = validate(t);
    assert(p.some((x) => x.includes('第1問')), JSON.stringify(p));
  }],
  ['Routing Level が無いと落ちる', () => {
    const p = validate(good().replace(/\*\*Routing Level\*\*/, 'Routing について'));
    assert(p.some((x) => x.includes('Routing Level')), JSON.stringify(p));
  }],
  ['**受入条件がチェックボックスでないと落ちる**', () => {
    const t = good().replace(/^## 3\.[\s\S]*?(?=^## 4\.)/m, '## 3. 受入条件\n\n使いやすいこと\n\n');
    const p = validate(t);
    assert(p.some((x) => x.includes('§3')), JSON.stringify(p));
  }],
  ['**多言語が片方だけだと落ちる**', () => {
    const t = good().replace(/^## 5\.[\s\S]*?(?=^## 6\.)/m, '## 5. 多言語\n\nJA だけ\n\n');
    const p = validate(t);
    assert(p.some((x) => x.includes('§5')), JSON.stringify(p));
  }],
  ['**§1 に出典が無いと落ちる**（主張だけの PRD を通さない）', () => {
    const t = good().replace(/^## 1\.[\s\S]*?(?=^## 2\.)/m, '## 1. なぜこの機能か\n\n多くのユーザーが求めているはず\n\n');
    const p = validate(t);
    assert(p.some((x) => x.includes('§1')), JSON.stringify(p));
  }],
  ['**雛形そのものは検査対象にしない**（穴だらけで当然なので）', () => {
    assert(!listPrds().includes(TEMPLATE), '雛形が対象に入っている');
  }],
  ['**雛形が実在する**（対象外にしたまま消えていないこと）', () => {
    assert(fs.existsSync(path.join(PRD_DIR, TEMPLATE)), '雛形が無い — 定型が無いのと同じ');
  }],
];

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(runScenarios(SCENARIOS) === 0 ? 0 : 1);

  const files = listPrds();
  const problems = [];
  if (!fs.existsSync(path.join(PRD_DIR, TEMPLATE))) {
    problems.push(`docs/prd/${TEMPLATE} が無い — **定型が無ければ「定型化した」と言えない**`);
  }
  console.log(`PRD ${files.length} 件（docs/prd/、雛形を除く）\n`);
  for (const f of files) {
    const p = validate(fs.readFileSync(path.join(PRD_DIR, f), 'utf8'), { name: f });
    const state = /^状態:\s*(\S+)/m.exec(fs.readFileSync(path.join(PRD_DIR, f), 'utf8'))?.[1] ?? '?';
    console.log(`  ${p.length ? '✗' : 'ok'}  ${f}  [${state}]`);
    problems.push(...p);
  }
  if (!files.length) {
    console.log('  **1件も無い。**定型はあるが、通したものがまだ無い');
  }
  if (problems.length) {
    console.error('\nPRD: 定型を満たしていない');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n全 PRD が定型を満たしている。§6「決めていないこと」も埋まっている。');
}
