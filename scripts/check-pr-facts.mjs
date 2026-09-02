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

/**
 * 英語面の打ち消し語。llms.txt は英語で書かれており、
 * `Former names "Captio…"` のような**正しい由来の説明**が日本語の打ち消し語に
 * 当たらず偽陽性になった（2026-08-22・check-public-facts.mjs の初回実行で判明）。
 * **打ち消し語を足したことは記録に残す**という規約どおり、ここに追記する。
 */
const NEGATIONS_EN = [
  'former name', 'former names', 'formerly', 'previously named', 'old name',
  'no longer', 'do not say', "don't say", 'never say', 'wrong:', 'incorrect',
  'deprecated', 'discontinued', 'renamed',
];

/** 起動時間の実測値（data/benchmark.json が正）。 */
const READY = BENCHMARK.apps?.[CONSTANTS.appNameEn]?.ready;

/**
 * 起動時間の主張を、実測に当てる。**正が無いときは「合っている」ではない。**
 *
 * [2026-08-26] ここは `READY !== undefined && ...` と書かれていて、
 * **実測が読めないとこの規則は一度も発火しなかった。**
 * benchmark.json を空にすると「起動 約9.9秒」がそのまま通ることを実測した。
 * 速度はこのプロダクトの訴求そのものなので、
 * **実測が読めないまま数字を書かせる側へ倒さない。**
 */
export function launchTimeSuspect(claimed, ready) {
  if (ready === undefined || ready === null) return true;  // 検証できない
  return claimed !== ready;
}

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
    // [2026-08-26] ここは `READY !== undefined && ...` だった。
    // **実測が読めないと、この規則は一度も発火しない。**
    // benchmark.json を空にすると「起動 約9.9秒」がそのまま通ることを実測した。
    // 正が無いなら「合っている」ではなく「**検証できない**」。
    // 速度はこのプロダクトの訴求そのものなので、
    // 実測が読めないまま数字を書かせる側へ倒さない。
    check: (m) => launchTimeSuspect(Number(m[1]), READY),
    message: (m) => (READY === undefined
      ? `起動時間「${m[1]}秒」を**検証できない** — data/benchmark.json に`
        + ` ${CONSTANTS.appNameEn} の ready が無い。**実測が読めないまま速度を書かない**`
      : `起動時間が「${m[1]}秒」。実測は ${READY}秒`
        + `（${BENCHMARK.measuredOn?.device} / ${BENCHMARK.measuredOn?.os} / v${BENCHMARK.measuredOn?.ourAppVersion}`
        + ` / ${BENCHMARK.measuredOn?.date}実測・data/benchmark.json が正）`),
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
  {
    // 2026-08-26 に実際に踏んだ。原稿が「段階公開中の機能がゼロ」と書いていたが、
    // tf04_progress が rollout 5% で動いていた。08-22 から4日間、誤りのまま残った。
    //
    // **このリポジトリはリレーのフラグを読めない。**だから「ゼロだ」は
    // ここでは確かめようがなく、確かめようのない断定は、外れても誰も気づかない。
    // 数を持たない検査にしてあるのはそのためで、禁じているのは「ゼロ」という値ではなく
    // **「このリポジトリから検証できないことを断定する」形**そのもの。
    id: 'unverifiable-staged-flag-count',
    multiline: true,
    // **改行を跨げること。**この原稿は日本語を手で折り返してあるので、
    // 「段階公開中の\n機能がゼロ」と割れる。最初に書いた版は [^。\n] で
    // 改行を外していたため、**戻した誤りを検知できなかった**（検査を検査して判明）。
    pattern: /段階公開中の\s*(?:機能|フラグ)[^。]{0,10}?(?:ゼロ|0件|無い|ない|存在しない)/g,
    // **逃げ道は実装してある。**読んだ日付と、読んだ経路を近くに書いてあれば通す
    // ——「いつ時点の話か」が本文に残る形なら、断定してよい。
    // 逃げ道をメッセージで約束しておいて実装しないと、直しようのない検査になる
    // （最初に書いた版がそうだった）。
    check: (m) => {
      const around = String(m.input ?? '').slice(Math.max(0, m.index - 120), m.index + m[0].length + 120);
      const dated = /\d{4}-\d{2}-\d{2}/.test(around);
      const sourced = /Flag Ops|\/admin\/flags|list で|確認/.test(around);
      return !(dated && sourced); // 日付と出典が揃っていれば違反にしない
    },
    message: () => '**段階公開中のフラグ数を、このリポジトリは読めない。**'
      + 'フラグはリレー（Cloudflare Workers）のKVにあり、site 側に取得経路が無い。'
      + '2026-08-26 の実測では tf04_progress が rollout 5% で動いており、'
      + '「ゼロ」と書いた原稿は4日間そのままだった。'
      + '書くなら Flag Ops の list で読んだ日付と件数を同じ行に添えること'
      + '（data/stop-drills.json の rollout-guard-freeze に訂正の経緯がある）',
  },
  {
    // [2026-09-02] 配信前日に踏んだ。原稿は「**同期間**のコミットの99.5%、変更行の94.2%」と
    // 書いていたが、その率は 8/11〜8/21 の計測値で、原稿が言う23日間のものではなかった。
    // 同じ数え方で 9/1 まで測ると 81.9% / 70.9%。**率は窓とセットでしか意味を持たない。**
    // 「同期間」「同じ期間」と書いて率を出すなら、その行に日付の窓があること。
    id: 'rate-without-window',
    pattern: /(?:同期間|同じ期間|この期間|当該期間)[^。\n]{0,80}?([0-9]+(?:\.[0-9]+)?)%/g,
    check: (m) => !/\d{1,2}月\d{1,2}日|\d{4}-\d{2}-\d{2}|\d{1,2}月\d{1,2}日?[〜～-]\d{1,2}日/.test(String(m.input ?? '')),
    message: (m) => `「同期間」の率 ${m[1]}% に計測窓が無い。`
      + '率は窓とセットでしか意味を持たない —— 2026-09-02 の原稿は「同期間の99.5%」と書きながら'
      + ' 8/11〜8/21 の値を引いていた（23日間では 81.9%）。同じ行に「8月11日〜21日」の形で窓を書く',
  },
];

const hasNegation = (s) => NEGATIONS.some((n) => s.includes(n))
  || NEGATIONS_EN.some((n) => s.toLowerCase().includes(n));

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

  // **改行を跨ぐ主張のための2周目。**上の走査は1行ずつなので、
  // 日本語を手で折り返した原稿では「段階公開中の\n機能がゼロ」のように
  // 割れた断定を**どの規則も検知できない**（2026-08-26、規則を足したあとに
  // 誤りを戻す検査をして判明。規則は在るのに一度も発火しない状態だった）。
  //
  // 既定は1行のまま。multiline を宣言した規則だけがここへ来る
  // （全規則を全文に当てると、離れた行が偶然つながって偽陽性になる）。
  const skipLine = [];
  let sectSkip = false;
  lines.forEach((line, i) => {
    if (/^#{1,6}\s/.test(line)) sectSkip = hasNegation(line);
    skipLine[i] = sectSkip || hasNegation(line);
  });
  // 行頭オフセット。一致位置から行番号を引くために持つ。
  const lineStart = [];
  let off = 0;
  for (const line of lines) { lineStart.push(off); off += line.length + 1; }
  const lineOf = (idx) => {
    let lo = 0, hi = lineStart.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStart[mid] <= idx) lo = mid; else hi = mid - 1; }
    return lo;
  };

  for (const rule of RULES) {
    if (!rule.multiline) continue;
    rule.pattern.lastIndex = 0;
    let m;
    while ((m = rule.pattern.exec(text)) !== null) {
      const from = lineOf(m.index);
      const to = lineOf(m.index + m[0].length - 1);
      // **跨いだ行のどれかに打ち消し語があれば素通し。**1行版と同じ扱いにする。
      let skipped = false;
      for (let i = from; i <= to; i++) if (skipLine[i]) skipped = true;
      if (skipped) continue;
      if (rule.check && !rule.check(m)) continue;
      violations.push({
        rule: rule.id, line: from + 1,
        text: m[0].replace(/\n/g, ' ').trim().slice(0, 100),
        message: rule.message(m),
      });
    }
  }

  // 現行のアプリ名が一度も出てこない配信原稿は、まず疑う（内部文書には求めない）
  const missingName = mode === 'draft'
    && !text.includes(CONSTANTS.appNameJa) && !text.includes(CONSTANTS.appNameEn);
  return { mode, violations, missingName };
}

/**
 * 自己テスト。**落ちるのを見る側を必ず持つ**（規則を足したのに一度も発火しない状態を
 * 2026-08-26 に踏んだ。規則は在っても、当たらなければ無い）。
 */
export function selftest() {
  let total = 0; const failures = [];
  const t = (name, cond) => { total += 1; if (!cond) failures.push(name); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`); };
  const draft = (body) => `<!-- fact-check: draft -->\n# x\n${body}\n`;
  const ids = (text) => checkText(text).violations.map((v) => v.rule);
  t('**窓の無い「同期間の率」を落とす**（2026-09-02 の原稿そのもの）',
    ids(draft('いっぽうコードは高い。同期間のコミットの**99.5%**、変更行の**94.2%**がAI著者。')).includes('rate-without-window'));
  t('同じ行に日付の窓があれば通る',
    !ids(draft('2026年8月11日〜21日の計測で、同期間のコミットの**99.5%**がAI著者。')).includes('rate-without-window'));
  t('ISO の日付でも通る',
    !ids(draft('同期間（2026-08-11〜2026-08-21）のコミットの99.5%。')).includes('rate-without-window'));
  t('率の無い「同期間」は対象外',
    !ids(draft('同期間にアプリ本体は7版がApp Storeに並びました。')).includes('rate-without-window'));
  t('打ち消し語のある行は素通し（規約どおり）',
    !ids(draft('同期間の率99.5%とは**書かない**。')).includes('rate-without-window'));
  t('internal 文書には適用しない',
    checkText('<!-- fact-check: internal -->\n同期間のコミットの99.5%。').mode === 'internal');
  t('既存の規則も生きている（旧名）',
    ids(draft('Captio式シンプルメモは速い。')).includes('old-app-name'));
  if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗`); return 1; }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) process.exit(selftest());
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
