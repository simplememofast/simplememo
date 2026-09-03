#!/usr/bin/env node
/**
 * 着地面に**横スクロールが出ていないか**を、実際に描画して見る。
 *
 *   node scripts/check-viewport-overflow.mjs            # 表示
 *   node scripts/check-viewport-overflow.mjs --check    # 横漏れ・測定不能なら exit 1
 *   node scripts/check-viewport-overflow.mjs --report   # 表示のみ（CI・常に exit 0）
 *   node scripts/check-viewport-overflow.mjs --selftest
 *
 * 【なぜ要るか】
 * [2026-09-03] 配信当日、トップに追加した PRESS 帯が**実機で横スクロールを起こした**。
 * オーナーのiPhoneのスクリーンショットで発覚するまで、誰も気づいていない。
 *
 * **描画して確かめてはいた。**390 / 900 / 1280px を実描画し、
 * `documentElement.scrollWidth === innerWidth` を確認して「ok」と報告した。
 * **見落としたのは幅のほう** —— 320px（iPhone SE 初代 / 旧Android）を測っていない。
 * 実測すると 320px で `doc=344`、**24px はみ出していた。**
 *
 * 原因は `.nb`（`white-space: nowrap`）を隙間なく並べたこと。
 * **隣り合うインライン要素のあいだに空白も `<wbr>` も無いと、
 * 連続した nowrap は1つの折り返せない塊として扱われる。**
 * 帯の内寸 245px に対して min-content 305px になっていた。
 * `.nb` を細かく割っても**塊の合計は変わらない**（実際、割っても直らなかった）。
 * 効いたのは `<wbr>`（幅を持たない改行機会）と、flex アイテムの `min-width: 0`。
 *
 * 【静的検査にしなかった理由】
 * 「nowrap の塊が長い」を正規表現で数える案を試したが、**過検出する。**
 * 実際に折り返せるかは境界の文字で決まり（`。` の後は切れる、開き括弧の前は切れない等）、
 * 同じ書き方でも切れる場所と切れない場所がある。実測すると 31.5字の塊が無事で
 * 14字の塊が漏れており、**文字数では並べ替えられない。**
 * 過検出する検査は、やがて無視される。だから描画して測る。
 *
 * 【それでも残る限界】
 * ここが使うのはサンドボックスのフォント（IPAGothic）で、**実機のフォントではない。**
 * CJKは1文字1emなのでほぼ一致するが、英数字の字幅は違う。
 * だから**「通った」は「実機で必ず大丈夫」を意味しない。**
 * いちばん狭い 320px を含めているのはその余裕代でもある。
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { run } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 見る面。**配信本文が人を送る先**を入れてある。 */
export const PAGES = ['/', '/en/', '/autopilot/'];

/**
 * 見る幅。**320 を必ず含める。**
 * 2026-09-03 の見落としは 390 から始めたことによる（390 では通っていた）。
 */
export const WIDTHS = [320, 360, 375, 390, 393, 414, 430, 600, 768, 800, 900, 1024, 1100, 1280];

/**
 * **タブレット帯（769〜1099px）を足したのは 2026-09-03。**
 * その日まで `.global-nav__links` は 768px までしかハンバーガーへ切り替わらず、
 * **ほぼ全ページのナビがこの帯で画面を超えていた**（/ が +233px @769、
 * /autopilot/ が +309px @769・+54px @1024）。
 * 幅の一覧に無い帯は、壊れていても誰も気づかない —— 320px のときと同じ形。
 */

/**
 * **既知の漏れ。**新しく作り込んだ漏れと区別するためにここに置く。
 * **免罪符ではない** —— 直す当てが書いてあり、直したら消す。
 * 一覧に無い漏れが出たら `--check` は落ちる。
 */
export const KNOWN = [
  // **2026-09-03 に空にした。**`/autopilot/ @320px +23px`（227ページ共通のナビ）は
  // 共有CSSで直したので消した —— **免除を残すと、次の再発を黙って通す。**
];

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8' };

/** リポジトリをそのまま配る最小のサーバ。外部の起動状態に依存しない。 */
export function serve(root = ROOT) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    let f = path.join(root, p);
    if (!fs.existsSync(f) && fs.existsSync(`${f}.html`)) f = `${f}.html`;
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ srv, port: srv.address().port })));
}

/** Chromium を探す。**見つからないことを「異常なし」と混ぜない**ので、null を返して呼び出し側で落とす。 */
export const CHROMIUM_BASES = () => [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers',
  path.join(process.env.HOME || '', '.cache/ms-playwright')].filter(Boolean);

/** 探す場所を引数に出してあるのは、**「無ければ null」を試せるようにするため。** */
export function findChromium(bases = CHROMIUM_BASES()) {
  const fromEnv = process.env.CHROMIUM_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  // GitHub の ubuntu ランナーには Chrome が最初から入っている。
  // **ここを見れば CI でブラウザを落とさずに済む**（150MB のダウンロードを毎PR撃たない）。
  for (const f of ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium']) {
    if (fs.existsSync(f)) return f;
  }
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base).filter((x) => x.startsWith('chromium')).sort().reverse()) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const f = path.join(base, d, rel);
        if (fs.existsSync(f)) return f;
      }
    }
  }
  return null;
}

async function loadChromium() {
  for (const m of ['playwright', 'playwright-core']) {
    try { return (await import(m)).chromium; } catch { /* 次を試す */ }
  }
  return null;
}

/**
 * ページ内で測る側。**純関数としてブラウザへ渡す**ので、
 * 「何を漏れと数えるか」を自己テストから同じ形で試せる。
 *
 * 横スクロールできる祖先を持つ要素は数えない —— 料金カルーセルのように
 * **意図して横に並べているもの**まで漏れと呼ぶと、この検査は無視される。
 */
export const PROBE = () => {
  const vw = document.documentElement.clientWidth;
  const doc = document.documentElement.scrollWidth;
  const culprits = [];
  if (doc > vw) {
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect();
      if (!b.width || b.right <= vw + 0.5) continue;
      let scroller = null, a = el.parentElement;
      while (a) {
        const o = getComputedStyle(a).overflowX;
        if (o === 'auto' || o === 'scroll' || o === 'hidden') { scroller = a.className || a.tagName; break; }
        a = a.parentElement;
      }
      if (scroller) continue;
      culprits.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 44),
        right: Math.round(b.right), width: Math.round(b.width),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34) });
    }
    culprits.sort((x, y) => y.right - x.right);
  }
  return { vw, doc, over: Math.max(0, doc - vw), culprits: culprits.slice(0, 4) };
};

export async function measure({ pages = PAGES, widths = WIDTHS } = {}) {
  const chromium = await loadChromium();
  const exe = findChromium();
  if (!chromium || !exe) {
    return { measurable: false,
      why: !chromium ? 'playwright / playwright-core が入っていない（`npm i --no-save playwright-core`）'
                     : 'Chromium の実体が見つからない（PLAYWRIGHT_BROWSERS_PATH / CHROMIUM_PATH）' };
  }
  const { srv, port } = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const results = [];
  try {
    for (const page of pages) {
      for (const width of widths) {
        const p = await browser.newPage({ viewport: { width, height: 800 } });
        await p.goto(`http://127.0.0.1:${port}${page}`, { waitUntil: 'domcontentloaded' });
        await p.waitForTimeout(250);
        results.push({ page, width, ...(await p.evaluate(PROBE)) });
        await p.close();
      }
    }
  } finally {
    await browser.close();
    srv.close();
  }
  const isKnown = (r) => KNOWN.some((k) => k.page === r.page && r.width <= k.upTo);
  const over = results.filter((r) => r.over > 0);
  return { measurable: true, results,
    problems: over.filter((r) => !isKnown(r)),   // 落とすのは**新しい漏れ**だけ
    known: over.filter(isKnown) };
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const SCENARIOS = [
  ['実データの着地面に横漏れが無い', async () => {
    const m = await measure();
    if (!m.measurable) throw new Error(`測れなかった: ${m.why}`);
    if (m.problems.length) {
      const p = m.problems[0];
      throw new Error(`${p.page} @${p.width}px で +${p.over}px（${p.culprits[0]?.cls ?? '?'}）`);
    }
  }],
  ['**320px を必ず見る**（2026-09-03 の見落としは 390 から始めたこと）', () => {
    if (!WIDTHS.includes(320)) throw new Error('320 が幅の一覧から外れている');
  }],
  ['**幅より広い要素を漏れと数える**', () => {
    const doc = { documentElement: { clientWidth: 320, scrollWidth: 344 } };
    const r = withDom(doc, [{ right: 344, width: 305, cls: 'pressband__body', scroller: null }]);
    if (r.over !== 24) throw new Error(`over=${r.over}`);
    if (!r.culprits.length) throw new Error('原因を挙げていない');
  }],
  ['**横スクロールできる祖先を持つ要素は数えない**（料金カルーセルを漏れと呼ばない）', () => {
    const doc = { documentElement: { clientWidth: 320, scrollWidth: 344 } };
    const r = withDom(doc, [{ right: 524, width: 160, cls: 'pricing-card', scroller: 'pricing-scroller' }]);
    if (r.culprits.length) throw new Error('カルーセルを漏れに数えた');
  }],
  ['**既知の免除は空**（直したら消す。残すと次の再発を黙って通す）', () => {
    if (KNOWN.length) throw new Error(`免除が ${KNOWN.length} 件ある — 直っていないなら理由と upTo を確かめること`);
  }],
  ['**タブレット帯を見る**（2026-09-03 に壊れていたのはここ）', () => {
    for (const w of [768, 800, 900, 1024]) {
      if (!WIDTHS.includes(w)) throw new Error(`${w}px が幅の一覧から外れている`);
    }
  }],
  ['**測れなかったを「異常なし」と混ぜない**', async () => {
    const m = await measure({ pages: [], widths: [] });
    // ページも幅も無ければ測る対象が無い。**それは「漏れなし」ではない**
    if (m.measurable && m.results.length === 0 && m.problems.length === 0) return; // 対象0件は呼び出し側の責任
    if (!m.measurable && !m.why) throw new Error('測れない理由を言っていない');
  }],
  ['**Chromium が無ければ null**（無いのに在ることにしない）', () => {
    const saved = process.env.CHROMIUM_PATH;
    process.env.CHROMIUM_PATH = '/nonexistent';
    const got = findChromium(['/nonexistent']);
    if (saved === undefined) delete process.env.CHROMIUM_PATH; else process.env.CHROMIUM_PATH = saved;
    if (got !== null) throw new Error(`無い場所から見つけたことにした: ${got}`);
  }],
  ['実環境では見つかる（常に null を返す実装で通らせない）', () => {
    if (findChromium() === null) throw new Error('この環境の Chromium を見つけられていない');
  }],
];

/** PROBE と同じ判定を、DOM 無しで試すための小さな写し。**判定の形をここで固定する。** */
function withDom(doc, els) {
  const vw = doc.documentElement.clientWidth, d = doc.documentElement.scrollWidth;
  const culprits = d > vw ? els.filter((e) => e.right > vw + 0.5 && !e.scroller) : [];
  return { vw, doc: d, over: Math.max(0, d - vw), culprits };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) {
    let failed = 0;
    for (const [name, fn] of SCENARIOS) {
      try { await fn(); console.log(`  ok   ${name}`); }
      catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
    }
    console.log(`\n  横漏れ検査 ${SCENARIOS.length} 件中 ${failed} 件失敗`);
    process.exit(failed ? 1 : 0);
  }

  const report = argv.includes('--report');
  const m = await measure();
  console.log(`着地面の横漏れ — ${PAGES.join(' / ')} × ${WIDTHS.join('/')}px`);
  if (!m.measurable) {
    console.log(`\n  **測れなかった**: ${m.why}`);
    console.log('  「測れなかった」は「漏れなし」ではない。');
    process.exit(report ? 0 : 1);
  }
  for (const r of m.known) {
    const k = KNOWN.find((x) => x.page === r.page);
    console.log(`\n  既知 ${r.page} @${r.width}px — +${r.over}px（${k.since} から）`);
    console.log(`      ${k.why}`);
  }
  for (const r of m.problems) {
    console.log(`\n  ★ ${r.page} @${r.width}px — doc=${r.doc} / 画面=${r.vw}（+${r.over}px）`);
    for (const c of r.culprits) {
      console.log(`      right=${c.right} w=${c.width} <${c.tag}.${c.cls}> "${c.text}"`);
    }
  }
  if (!m.problems.length) {
    console.log(`\n  ${m.results.length} 通りを実測。**新しい横漏れなし**`
      + `${m.known.length ? `（既知 ${m.known.length} 件は上のとおり。直したら KNOWN から消すこと）` : ''}。`);
    console.log('  （サンドボックスのフォントでの実測。**実機のフォントとは字幅が違う**ので、'
      + '通ったことは実機の保証にはならない）');
  } else {
    console.log(`\n  **横スクロールが出る組み合わせが ${m.problems.length} 件。**`);
    console.log('  `.nb` を並べただけでは改行機会にならない —— 隣接する nowrap のあいだに');
    console.log('  `<wbr>` を入れるか、flex アイテムに `min-width: 0` を与えること。');
  }
  if (!report && m.problems.length) process.exit(1);
}
