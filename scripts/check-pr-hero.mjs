#!/usr/bin/env node
/**
 * ヒーロー画像生成の**前提条件**だけを検査する（画像は作らない）。
 *
 * Chromium を CI に持ち込まずに、生成器が守っている2つの約束を確かめる。
 * 組みは pr-hero-layout.mjs に切り出してあるので、**playwright を読み込まない**:
 *   1. 見出しの「」内が1行に収まる（収まらないと画像で黙って切れる）
 *   2. 裏の取れていない主張があるとき、完成品が作れない仕組みが生きている
 *
 * 画像そのものは配信前に人が確認して出す。**ここで見るのは仕組みであって
 * 出来上がりではない。**
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEAD_MAX_GLYPHS, splitHeadline, heroLines, buildHTML, WIDTH, HEIGHT } from './pr-hero-layout.mjs';
import { evaluate } from './check-pr-claims.mjs';
import { readJSON } from './lib/read-json.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
// この検査が守っているのは「裏の取れていない主張で完成品を作らせない」仕組み。
// **その仕組みが効かなくなったときに落ちること**を、ここで固定する。
const SCENARIOS = [
  ['**DRAFT リボンが draft フラグに連動する**（切れると裏取り未完の画像が完成品として流通する）', () => {
    const RIBBON = '<div class="draft">';
    const draft = buildHTML({ headline: 'あ「い」う', subhead: 'x', appName: 'x', draft: true });
    const final = buildHTML({ headline: 'あ「い」う', subhead: 'x', appName: 'x', draft: false });
    if (!draft.includes(RIBBON)) throw new Error('draft:true なのにリボンが無い');
    if (final.includes(RIBBON)) throw new Error('draft:false なのにリボンがある');
  }],
  ['**文字列 DRAFT では判定しない**（CSS のコメントに当たって常に真になる — 実際に踏んだ）', () => {
    const final = buildHTML({ headline: 'あ「い」う', subhead: 'x', appName: 'x', draft: false });
    if (!final.includes('DRAFT')) return; // CSS に DRAFT が無いなら罠自体が無い
    // 罠がある以上、要素で見ていることを固定する
    if (final.includes('<div class="draft">')) throw new Error('要素で見ていない');
  }],
  ['寸法が PR TIMES の G1 ゲートに合う', () => {
    const h = buildHTML({ headline: 'あ「い」う', subhead: 'x', appName: 'x', draft: true });
    if (!h.includes(`width:${WIDTH}px`) || !h.includes(`height:${HEIGHT}px`)) {
      throw new Error(`寸法が ${WIDTH}x${HEIGHT} でない`);
    }
  }],
  ['**見出しの「」が長すぎれば検出できる**（画像で黙って切れる形）', () => {
    const longLead = 'あ'.repeat(LEAD_MAX_GLYPHS + 5);
    const { lead } = splitHeadline(`「${longLead}」のあと`);
    if (lead.length + 2 <= LEAD_MAX_GLYPHS) throw new Error('長すぎる見出しを長いと判定できていない');
  }],
  ['「」の無い見出しは rest が空になる（検出できる）', () => {
    const { rest } = splitHeadline('かぎかっこの無い見出し');
    if (rest.length > 0) throw new Error('「」が無いのに rest が埋まっている');
  }],
  ['実データが検査を通る', () => {
    const doc = readJSON(ROOT, 'data/pr-claims.json');
    const { lead, rest } = heroLines(doc);
    if (lead.length + 2 > LEAD_MAX_GLYPHS) throw new Error('実データの画像1行目が長い');
    if (!rest.length) throw new Error('実データの rest が空');
  }],
  // [2026-09-02] 見出しと画像の切り離しを固定する。**ここが効かなくなると、
  // 見出しを変えた日に画像が黙って切れる**（9/3 配信稿でその形を踏んだ:
  // 「」で始まらない見出しの全61字が lead と読まれ、CI が落ちて初めて分かった）。
  ['**hero が在れば見出しではなくそちらを使う**', () => {
    const doc = { headline: '「かぎかっこ付き」の見出し', hero: { lead: 'ヒーロー側', rest: '続き' } };
    const { lead, rest } = heroLines(doc);
    if (lead !== 'ヒーロー側' || rest !== '続き') throw new Error('hero が優先されていない');
  }],
  ['**hero が無ければ従来どおり見出しから切り出す**（既存の運用を変えない）', () => {
    const { lead, rest } = heroLines({ headline: '「短い」あとの訴求' });
    if (lead !== '短い' || rest !== 'あとの訴求') throw new Error('従来の切り出しが壊れている');
  }],
  ['**hero.lead が長すぎれば検出できる**（budget を素通りさせない）', () => {
    const doc = { headline: 'x', hero: { lead: 'あ'.repeat(LEAD_MAX_GLYPHS + 5), rest: 'y' } };
    const { lead } = heroLines(doc);
    if (lead.length + 2 <= LEAD_MAX_GLYPHS) throw new Error('長すぎる1行目を長いと判定できていない');
  }],
];

if (process.argv.includes('--selftest')) {
  let failed = 0;
  for (const [name, fn] of SCENARIOS) {
    try { fn(); console.log(`  ok   ${name}`); }
    catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
  }
  console.log(`\n  自己テスト ${SCENARIOS.length} 件中 ${failed} 件失敗`);
  process.exit(failed === 0 ? 0 : 1);
}

const claimsDoc = readJSON(ROOT, 'data/pr-claims.json');
const coverage = readJSON(ROOT, 'data/automation-coverage.json');
let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? 'OK  ' : 'NG  '} ${msg}`); if (!ok) failed++; };

console.log('ヒーロー画像の前提条件\n');

const { lead, rest } = heroLines(claimsDoc);
const heroSrc = claimsDoc.hero?.lead ? 'hero' : '見出しから切り出し';
check(lead.length + 2 <= LEAD_MAX_GLYPHS,
      `画像の1行目が1行に収まる（${lead.length + 2}/${LEAD_MAX_GLYPHS}字・出所: ${heroSrc}）`);
check(rest.length > 0, '1行目の後ろに社名・訴求が続いている');
check(claimsDoc.subhead.length > 0 && claimsDoc.subhead.length <= 200,
      `リード文が長すぎない（${claimsDoc.subhead.length}字）`);

const { claims } = evaluate(claimsDoc, coverage);
const unsupported = claims.filter((c) => !c.supported);
console.log(`  --   裏の取れていない主張: ${unsupported.length}件`
  + (unsupported.length ? `（${unsupported.map((c) => c.phrase).join('・')}）` : ''));
console.log(`  --   この状態では ${unsupported.length ? 'DRAFT リボン付きしか作れない' : '完成品を作れる'}`);

// 透かしの有無が主張の裏取りに連動していること。ここが切れると、
// 裏取り未完の画像が完成品として流通する。
const draftHTML = buildHTML({ lead, rest, subhead: claimsDoc.subhead, appName: 'x', draft: true });
const finalHTML = buildHTML({ lead, rest, subhead: claimsDoc.subhead, appName: 'x', draft: false });
// 文字列 'DRAFT' で探すと CSS のコメントに当たって常に真になる（実際に踏んだ）。
// **要素があるかどうか**で見る。
const RIBBON = '<div class="draft">';
check(draftHTML.includes(RIBBON) && !finalHTML.includes(RIBBON),
      'DRAFT リボンが draft フラグに連動する');
check(draftHTML.includes(`width:${WIDTH}px`) && draftHTML.includes(`height:${HEIGHT}px`),
      `寸法が ${WIDTH}x${HEIGHT}（PR TIMES の G1 ゲート）`);

console.log(failed ? `\n${failed} 件失敗` : '\n前提条件に問題なし。');
process.exit(failed ? 1 : 0);
