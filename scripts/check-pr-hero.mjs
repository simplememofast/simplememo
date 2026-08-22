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
import { LEAD_MAX_GLYPHS, splitHeadline, buildHTML, WIDTH, HEIGHT } from './pr-hero-layout.mjs';
import { evaluate } from './check-pr-claims.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const claimsDoc = readJSON('data/pr-claims.json');
const coverage = readJSON('data/automation-coverage.json');
let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? 'OK  ' : 'NG  '} ${msg}`); if (!ok) failed++; };

console.log('ヒーロー画像の前提条件\n');

const { lead, rest } = splitHeadline(claimsDoc.headline);
check(lead.length + 2 <= LEAD_MAX_GLYPHS,
      `見出しの「」内が1行に収まる（${lead.length + 2}/${LEAD_MAX_GLYPHS}字）`);
check(rest.length > 0, '「」の後ろに社名・訴求が続いている');
check(claimsDoc.subhead.length > 0 && claimsDoc.subhead.length <= 200,
      `リード文が長すぎない（${claimsDoc.subhead.length}字）`);

const { claims } = evaluate(claimsDoc, coverage);
const unsupported = claims.filter((c) => !c.supported);
console.log(`  --   裏の取れていない主張: ${unsupported.length}件`
  + (unsupported.length ? `（${unsupported.map((c) => c.phrase).join('・')}）` : ''));
console.log(`  --   この状態では ${unsupported.length ? 'DRAFT リボン付きしか作れない' : '完成品を作れる'}`);

// 透かしの有無が主張の裏取りに連動していること。ここが切れると、
// 裏取り未完の画像が完成品として流通する。
const draftHTML = buildHTML({ headline: claimsDoc.headline, subhead: claimsDoc.subhead, appName: 'x', draft: true });
const finalHTML = buildHTML({ headline: claimsDoc.headline, subhead: claimsDoc.subhead, appName: 'x', draft: false });
// 文字列 'DRAFT' で探すと CSS のコメントに当たって常に真になる（実際に踏んだ）。
// **要素があるかどうか**で見る。
const RIBBON = '<div class="draft">';
check(draftHTML.includes(RIBBON) && !finalHTML.includes(RIBBON),
      'DRAFT リボンが draft フラグに連動する');
check(draftHTML.includes(`width:${WIDTH}px`) && draftHTML.includes(`height:${HEIGHT}px`),
      `寸法が ${WIDTH}x${HEIGHT}（PR TIMES の G1 ゲート）`);

console.log(failed ? `\n${failed} 件失敗` : '\n前提条件に問題なし。');
process.exit(failed ? 1 : 0);
