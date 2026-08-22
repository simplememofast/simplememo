#!/usr/bin/env node
/**
 * プレスリリース原稿の事実検査 — 古い事実と禁止表現を機械が落とす。
 *
 *   node scripts/check-pr-facts.mjs           # 検査結果を出す
 *   node scripts/check-pr-facts.mjs --check   # 違反があれば exit 1
 *   node scripts/check-pr-facts.mjs --file docs/pr-autopilot-2026-09.md
 *
 * 【なぜ要るか】
 * 2026-08-22、2026-06の原稿を雛形にした新しい原稿が、**3件の古い事実を
 * そのまま引き継いだ**。人が読み直して初めて見つかった:
 *
 *   1. 旧アプリ名「Captio式シンプルメモ」を製品名として使っていた
 *      （現行は「Obsidian連携シンプルメモ」。旧名にはApp Storeから
 *        削除された別アプリの名前が入っている）
 *   2. 起動時間「約1秒」（現行の実測は 0.4秒）
 *   3. **「7日間の無料トライアル付き」** — 2026年6月に廃止済み。しかも廃止は
 *      **景表法・ストア審査上のリスクとして**行われたもので、
 *      プレスリリースに書けば一度消したリスクを外向きに作り直すことになる
 *
 * 3件目が一番重い。**人の読み直しに依存している限り、次も同じことが起きる。**
 *
 * 【正はどこか】
 *   data/site-constants.json … 名称・価格・無料枠・バージョン・運営者
 *   data/benchmark.json      … 起動時間（実測・測定条件つき）
 * この2つを読んで突き合わせるので、値が変わればチェックも自動で追随する。
 * **スクリプトに数値を直書きしない。**
 *
 * 【文書の種別を明示させる】
 * `docs/pr-*.md` は冒頭で必ずどれかを宣言する:
 *
 *   <!-- fact-check: draft -->     配信原稿。**全規則を適用し、違反で落ちる**
 *   <!-- fact-check: internal -->  内部分析。禁止語そのものを論じるので適用しない
 *   <!-- fact-check: archived -->  古い文書。**報告するが落とさない**
 *
 * **未宣言は落とす。** 最初の実装は全 pr-*.md を一律に検査したが、
 * 「なぜRSIを名乗らないか」を説明している内部文書が禁止語で埋まって
 * 使い物にならなかった。かといって暗黙のファイル名規則にすると、
 * 新しい原稿が黙って検査から外れる。**宣言を強制するのが唯一の解。**
 *
 * 【打ち消しの扱い】
 * 配信原稿自身も「§5-1 避けるべき表現」の節で禁止語を列挙する。
 * **見出しに打ち消し語を含む節と、打ち消し語を含む行は素通しする。**
 * 打ち消し語の一覧は下の NEGATIONS。足りなければ足す（足したことが記録に残る）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONSTANTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site-constants.json'), 'utf8'));
const BENCHMARK = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/benchmark.json'), 'utf8'));

/** 打ち消し語。行内かセクション見出しにあれば、その規則は適用しない。 */
const NEGATIONS = [
  // 禁止・回避の指示
  '書かない', '使わない', '言わない', '出さない', '入れない', '禁止', '避ける', '避けるべき',
  'やってはいけない', '違反', 'NG', '名乗らない', '名乗るべきでない', '取り下げ',
  // 否定の言明（原稿本文が「〜とは主張していません」と書く形）
  '主張していません', '主張しません', '主張しない', 'ではありません', 'ではない',
  'とは言わない', '言いません', '言えない', 'できていない', 'まだ言えない', '未実装',
  // 古い・誤りであることの明示
  '旧名', '旧称', '廃止', '誤り', '古い', '不一致', '訂正',
];

/** 起動時間の実測値（data/benchmark.json が正）。 */
const READY = BENCHMARK.apps?.[CONSTANTS.appNameEn]?.ready;

const RULES = [
  {
    id: 'old-app-name',
    // 旧名を製品名として使っていないか。由来の説明としては使ってよい。
    pattern: /Captio式シンプルメモ|Simple Memo - Captio-style/g,
    message: () => `旧アプリ名を製品名として使っている。現行は「${CONSTANTS.appNameJa}」/「${CONSTANTS.appNameEn}」`
      + '（data/site-constants.json が正）。由来の説明として使うなら同じ行に「旧名」と書く',
  },
  {
    id: 'stale-launch-time',
    // 起動 + 秒 の組み合わせで、実測値と違う数字。
    pattern: /起動[^。\n]{0,12}?([0-9]+(?:\.[0-9]+)?)\s*秒/g,
    check: (m) => READY !== undefined && Number(m[1]) !== READY,
    message: (m) => `起動時間が「${m[1]}秒」。実測は ${READY}秒`
      + `（${BENCHMARK.measuredOn?.device} / ${BENCHMARK.measuredOn?.os} / v${BENCHMARK.measuredOn?.ourAppVersion}`
      + ` / ${BENCHMARK.measuredOn?.date}実測・data/benchmark.json が正）`,
  },
  {
    id: 'abolished-trial',
    pattern: /無料トライアル|トライアル付き|日間無料/g,
    message: () => '無料トライアルは2026年6月（iOS v3.3 Build 48）に**廃止済み**。'
      + `現行は初日から恒久的に「1日${CONSTANTS.freeSendsPerDay}通までずっと無料」。`
      + '廃止は景表法・ストア審査上のリスクとして行われたもので、書けばそのリスクを外向きに作り直す',
  },
  {
    id: 'overclaim',
    pattern: /完全自動化|完全無人|無人経営|人間不要|人間が不要|世界初|AIが経営/g,
    message: (m) => `誇大表現「${m[0]}」。出荷の最終判断・実機確認・App Store公開・価格・広告・契約は`
      + '人間が持っており、しかもそれは意図的な設計',
  },
  {
    id: 'rsi-claim',
    pattern: /再帰的自己改善|再起的自己改善|\bRSI\b/g,
    message: (m) => `「${m[0]}」は名乗らない。AIモデル自身は一切改良していないので誤読になる。`
      + '「ガードレール付き自律型アプリ運営基盤」「AIがアプリ改善サイクルを継続実行する仕組み」を使う',
  },
  {
    id: 'budget-overclaim',
    pattern: /予算に応じて(?:最適)?配分|予算を最適配分/g,
    message: () => '実装したのは「上限での自己停止」まで。配分の最適化は未実装で、上限値自体も暫定',
  },
  {
    id: 'price-drift',
    pattern: /月額\s*([0-9,]+)\s*円/g,
    check: (m) => m[1].replace(/,/g, '') !== CONSTANTS.priceMonthlyJpy.replace(/,/g, ''),
    message: (m) => `月額が「${m[1]}円」。正は ${CONSTANTS.priceMonthlyJpy}円（data/site-constants.json）`,
  },
  {
    id: 'price-drift-yearly',
    pattern: /年額\s*([0-9,]+)\s*円/g,
    check: (m) => m[1].replace(/,/g, '') !== CONSTANTS.priceYearlyJpy.replace(/,/g, ''),
    message: (m) => `年額が「${m[1]}円」。正は ${CONSTANTS.priceYearlyJpy}円（data/site-constants.json）`,
  },
  {
    id: 'free-tier-drift',
    pattern: /1日\s*([0-9]+)\s*通/g,
    check: (m) => m[1] !== CONSTANTS.freeSendsPerDay,
    message: (m) => `無料枠が「1日${m[1]}通」。正は ${CONSTANTS.freeSendsPerDay}通（data/site-constants.json）`,
  },
];

const hasNegation = (s) => NEGATIONS.some((n) => s.includes(n));

/** 文書の種別を読む。未宣言は null。 */
export function readMode(text) {
  const m = /<!--\s*fact-check:\s*(draft|internal|archived)\s*-->/.exec(text);
  return m ? m[1] : null;
}

export function checkText(text) {
  const lines = text.split('\n');
  const mode = readMode(text);
  const violations = [];

  // 直近の見出しを追いながら走る。見出しに打ち消し語があれば、その節は素通し。
  let sectionSkip = false;
  lines.forEach((line, i) => {
    if (/^#{1,6}\s/.test(line)) sectionSkip = hasNegation(line);
    if (sectionSkip) return;
    if (hasNegation(line)) return;

    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      let m;
      while ((m = rule.pattern.exec(line)) !== null) {
        if (rule.check && !rule.check(m)) continue;
        violations.push({ rule: rule.id, line: i + 1, text: line.trim().slice(0, 100), message: rule.message(m) });
      }
    }
  });

  // 現行のアプリ名が一度も出てこない配信原稿は、まず疑う（内部文書には求めない）
  const missingName = mode === 'draft'
    && !text.includes(CONSTANTS.appNameJa) && !text.includes(CONSTANTS.appNameEn);
  return { mode, violations, missingName };
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const argv = process.argv.slice(2);
  const fi = argv.indexOf('--file');
  const files = fi >= 0 && argv[fi + 1]
    ? [argv[fi + 1]]
    : fs.readdirSync(path.join(ROOT, 'docs'))
        .filter((f) => f.startsWith('pr-') && f.endsWith('.md'))
        .map((f) => path.join('docs', f))
        .sort();

  if (READY === undefined) {
    console.error(`data/benchmark.json に "${CONSTANTS.appNameEn}" の ready が無い — 起動時間を検査できない`);
    process.exit(1);
  }

  let failed = 0;
  console.log(`PR原稿の事実検査（正: data/site-constants.json + data/benchmark.json）`);
  console.log(`  現行名 ${CONSTANTS.appNameJa} / 起動 ${READY}秒 / 月額 ${CONSTANTS.priceMonthlyJpy}円`
    + ` / 年額 ${CONSTANTS.priceYearlyJpy}円 / 無料枠 1日${CONSTANTS.freeSendsPerDay}通`);
  console.log('');
  for (const rel of files) {
    // --file には絶対パスも渡せるようにする（検証用の一時ファイルを見るため）
    const text = fs.readFileSync(path.isAbsolute(rel) ? rel : path.join(ROOT, rel), 'utf8');
    const r = checkText(text);

    if (r.mode === null) {
      console.log(`  FAIL  ${rel} [未宣言]`);
      console.log('          冒頭に <!-- fact-check: draft|internal|archived --> を書く。');
      console.log('          暗黙のファイル名規則にすると、新しい原稿が黙って検査から外れる。');
      failed++;
      continue;
    }
    // internal は禁止語そのものを論じる文書。適用しない。
    if (r.mode === 'internal') { console.log(`  --    ${rel} [internal: 対象外]`); continue; }

    const tag = r.mode === 'archived' ? ' [archived: 報告のみ]' : '';
    if (r.violations.length === 0 && !r.missingName) { console.log(`  OK    ${rel}${tag}`); continue; }

    console.log(`  ${r.mode === 'archived' ? 'NOTE' : 'FAIL'}  ${rel}${tag}`);
    if (r.missingName) {
      console.log('          現行のアプリ名が一度も出てこない');
      if (r.mode !== 'archived') failed++;
    }
    for (const v of r.violations) {
      console.log(`          L${v.line} [${v.rule}] ${v.message}`);
      console.log(`                ${v.text}`);
    }
    if (r.mode !== 'archived') failed += r.violations.length;
  }
  console.log('');
  console.log('  draft のみ全規則を適用する。internal は禁止語そのものを論じる文書なので対象外。');
  console.log('  打ち消し語（禁止/書かない/主張していません/旧名 ほか）を含む行と節は素通しする。');
  if (failed) {
    console.error(`\n${failed} 件の違反。配信前に直すこと。`);
    process.exit(1);
  }
  if (argv.includes('--check')) console.log('\n事実の不整合と禁止表現なし。');
}
