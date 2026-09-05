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
 * **[2026-09-03 訂正] ここに「サンドボックスのフォント（IPAGothic）で測っている」と書いていたのは誤り。**
 * サイトは Noto Sans JP を**自前配信**しており（`/assets/fonts/NotoSansJP-*.woff2`）、
 * 実機も同じ woff2 を読む。実測すると Blink と WebKit で
 * CJK 192px / ラテン 178px / 数字 80px が**完全に一致**する（16px時）。
 * **日本語の字幅は実機と同じ。**
 *
 * 残る差は**ラテン文字と絵文字のフォールバック**にある ——
 * `Noto Sans JP` のあとは `-apple-system` → 実機では SF Pro、ここでは DejaVu 系。
 * 実機の1点で校正すると、修理前の版で **実機 41px / WebKitGTK 31px**（過小に出る）。
 * だから**「通った」は「実機で必ず大丈夫」を意味しない。**
 * いちばん狭い 320px を含めているのはその余裕代でもある。
 *
 * そしてエンジンは2つ測る（`lib/webkit-driver.mjs`）。
 * **Blink だけでは、実機で出ている横スクロールを一度も再現できなかった。**
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { run } from './lib/selftest.mjs';
import { measureWebKit, findWebKitDriver } from './lib/webkit-driver.mjs';

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

/**
 * **隣り合う nowrap のあいだに改行機会があるか**を、描画せずに見る規則。
 *
 * `.nb` は `white-space: nowrap`。隣り合うインライン要素のあいだに空白も `<wbr>` も
 * 無いと、**連続した nowrap はまとめて1つの折り返せない塊**になりうる。
 * 塊が画面より広ければ、そのページは横スクロールする。
 *
 * **描画では捕まらない。**折り返せるかどうかは**エンジンで違う** ——
 * 2026-09-03、実機（iOS = WebKit）で横スクロールが出ているのに、
 * Blink では 3面 × 14幅すべてで再現しなかった。
 * **測れないほうのエンジンで壊れる可能性を、構造の側で消す。**
 *
 * **[同日 追記] WebKit は入った。**「入れられない」は経路を1つしか試していなかった ——
 * `npx playwright install webkit` は egress で 403 だが、
 * `apt-get install webkit2gtk-driver` は通る。いまは実際に両エンジンで測っている。
 * ただしこの静的規則は**測る前に**落とせるので残す（描画は面と幅を絞らざるを得ない）。
 *
 * だから見るのは「実際に折り返したか」ではなく「**折り返せる場所が在るか**」。
 * `<wbr>` は幅を持たないので、入れて悪くなることが無い。
 * 文字数では並べ替えられない（31.5字の塊が無事で14字の塊が漏れた実測がある）が、
 * **改行機会の有無は文字を見ずに決まる。**
 */
export const ADJACENT_NOWRAP =
  /<\/(?:span|b|strong|a|em)>(?=<(?:span|b|strong|a|em)[^>]*class="[^"]*\bnb\b)/g;

/** 改行機会の無い隣接を列挙する。**純関数**なので、入れて落ちることを確かめられる。 */
export function unbreakableAdjacencies(html) {
  const out = [];
  for (const m of html.matchAll(ADJACENT_NOWRAP)) {
    const ctx = html.slice(Math.max(0, m.index - 60), m.index + 80).replace(/\s+/g, ' ');
    out.push({ index: m.index, line: html.slice(0, m.index).split('\n').length, context: ctx });
  }
  return out;
}

/**
 * **`word-break: keep-all` は上限とセットでなければ置けない。**
 *
 * [2026-09-03] 実機の診断が名指しした原因がこれ。トップの3本のピルに
 * `word-break: keep-all` が付いており、**日本語がまったく折り返せない。**
 * WebKit ではそれが厳密に効いて 380px の箱ができ、350px の親からはみ出した
 * （実機: `layout=390 over=41` / `R431 W380 「⚡ アクションボタンで5秒メモ…」`）。
 *
 * **Blink は同じ指定でも折り返す。**だからこちらの実測では
 * 3面 × 14幅・フォント太らせ・iPhoneプリセットのどれでも一度も出なかった。
 * `<wbr>` の規則（隣接 nowrap）とは別の入口で、同じ「折り返せない塊」ができていた。
 *
 * **禁止はしない。**意図して使うなら、箱が親を超えられない上限を同じ宣言に置くこと。
 */
export const KEEP_ALL = /word-break:\s*keep-all/g;

/** `keep-all` を持つ style 属性のうち、`max-width` を持たないものを列挙する。 */
export function unboundedKeepAll(html) {
  const out = [];
  for (const m of html.matchAll(/style="([^"]*word-break:\s*keep-all[^"]*)"/g)) {
    if (/max-width\s*:/.test(m[1])) continue;
    out.push({ line: html.slice(0, m.index).split('\n').length, style: m[1].slice(0, 90) });
  }
  return out;
}

/**
 * **サイトの全HTML面。**
 *
 * [2026-09-03] ここまで、描画していたのは配信本文が送る3面だけだった。
 * **残り266面は一度も測っていない。**そのうち33面が実際に横漏れしていて、
 * 最大 469px ——「画面の1.5倍」の幅を、誰も見ないまま出していた。
 *
 * 見つからなかった理由は 320px を見落とした回とまったく同じ形で、
 * **一覧に無いものは、壊れていても誰も気づかない。**
 * 面のほうも同じだった。
 */
export function allPages(root = ROOT) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      // `fixtures/` は**検査のための見本**で、公開する面ではない。
      // 中身はわざと壊してあるので、走査に混ぜると検査が自分の見本で落ちる。
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'fixtures') continue;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.name.endsWith('.html')) {
        out.push('/' + path.relative(root, abs).split(path.sep).join('/').replace(/index\.html$/, ''));
      }
    }
  };
  walk(root);
  return out.sort();
}

/**
 * **全面を掃くときの幅。**深い3面の14幅とは別に、全269面をこの幅だけで見る。
 *
 * **2つに決めたのは実測から。**269面 × 11幅 を1回通しで回して漏れた33面に対し、
 * どの幅の組み合わせで全部captureできるかを貪欲法で解いた:
 *
 *     320px … 28面   360px … 25面   375px … 13面   390px … 12面   414px … 10面
 *     430px …  9面   768px …  3面   900px …  4面   1024px …  3面   1100px …  7面
 *
 *     320 → +28面 ／ 360 → +8面 ／ 1100 → +6面 ／ 900 → +3面 ＝ **4幅で45面すべて**
 *
 * **途中経過で決めない。**269面のうち150面まで見た時点では「320+360 の2幅で全部」
 * に見えていた。最後まで回したら 1100px と 900px でしか出ない面が9つあり、
 * **2幅では取りこぼしていた** —— タブレット帯のナビが 2026-09-03 に壊れていたのと同じ帯。
 *
 * **全部の幅（11幅）を回すと 22 分かかり、CIに載らない＝結局また3面しか見ない。**
 * 4幅なら 1,076 通りで、深い3面ぶんと合わせて数分に収まる。
 *
 * **限界も書いておく。**これは「この4幅で漏れない」を保証するだけで、
 * たとえば 414px だけで壊れる新しい書き方は掃きでは捕まらない
 * （深い3面のほうは 14 幅を見ているので、共有部品ならそちらに出る）。
 */
export const SWEEP_WIDTHS = [320, 360, 900, 1100];

/**
 * **WebKit でも測る。**Blink とは**行分割の判断が違う**ので、片方だけでは足りない。
 *
 * [2026-09-03] 実機（iOS = WebKit）で `over=41px` が出た版を、Blink は
 * 320/360/390/393/430px の**すべてで over=0** と報告していた。
 * 同じ版を WebKitGTK で測ると 390px で **over=31px** —— 向きも桁も実機と合う。
 *
 * **速さの都合で対象を絞ってある。**WebKit は 378ms/通り（ドライバ3本並列・4コア）で、
 * 全面 × 4幅（1,076通り）だと 6.8 分かかる。内訳:
 *
 *   - **深い3面 × 14幅**（42通り・約16秒）… 新しい書き方が最初に載る面
 *   - **全269面 × 320px**（269通り・約1.7分）… 漏れが最も出る幅（実測で45面中28面）
 *
 * **限界を承知で使う。**WebKitGTK は iOS Safari そのものではなく、
 * ラテン文字のフォールバックが実機と違うので**過小に出る**（実機41px → ここ31px）。
 * 「WebKit で 0」は「実機で 0」ではない。詳細は `lib/webkit-driver.mjs`。
 */
export const WEBKIT_SWEEP_WIDTHS = [320];

/**
 * **どの面も「網」を持っていること。**
 *
 * [2026-09-03] 共有CSS（`assets/css/style.min.css`）を読まない面が17あり、
 * そこへは共有側の修理が届かなかった。ナビの断点を 1099px にした修理が `/tiktok/` に届かず、
 * 900px で **+87px** 漏れていた（当日、個別に直した）。
 *
 * 17面を共有CSSへ寄せるのは**見た目が変わる**ので採らず、
 * 網だけを `assets/css/safety-net.css` へ切り出した。
 * ここが見るのは「**どちらか一方は読んでいるか**」だけ ——
 * 新しい面を共有CSS無しで置いたとき、網も無いまま出荷されるのを止める。
 */
export const SHARED_CSS = 'assets/css/style.min.css';
export const SAFETY_NET_CSS = 'assets/css/safety-net.css';

/**
 * **`<link>` として読んでいるかを見る。文字列の出現ではない。**
 *
 * 初版は `html.includes('assets/css/style.min.css')` で見ていた。**素通りする。**
 * `tiktok/index.html` には 2026-09-03 に足した注記
 * 「この面は共有CSS（assets/css/style.min.css）を読み込んでいないので、…」があり、
 * **その文が「読み込んでいる」と判定されていた。**壊しテスト（網の link を外す）が
 * 落ちなかったので気づいた —— 落とせることを確かめていなければ、
 * **この検査は何も見ないまま緑を出し続けていた。**
 *
 * 同じ形をこの日3回踏んでいる（`</head>` をコメント内で数えた、
 * `by scripts/inject_faq_schema.py -->` をコメント内で数えた）。**素の文字列で構造を判定しない。**
 */
export function linksStylesheet(html, file) {
  const re = /<link\b[^>]*>/gi;
  for (const tag of html.match(re) || []) {
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) continue;
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (href && href[1].split('?')[0].endsWith(file.replace(/^.*\//, ''))) return true;
  }
  return false;
}

export function pagesWithoutNet(files = STATIC_FILES, read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8')) {
  return files.filter((f) => {
    const html = read(f);
    return !linksStylesheet(html, SHARED_CSS) && !linksStylesheet(html, SAFETY_NET_CSS);
  });
}

/** 静的規則を当てる面。**サイトの全HTMLに当てる**（正規表現なので実質ただ）。 */
export const STATIC_FILES = allPages().map((u) => (u.endsWith('/') ? `${u}index.html` : u).slice(1));

export function checkStatic(files = STATIC_FILES) {
  const problems = [];
  let scanned = 0;
  for (const f of files) {
    const abs = path.join(ROOT, f);
    if (!fs.existsSync(abs)) { problems.push(`${f}: 面が無い — 改名したなら STATIC_FILES も直すこと`); continue; }
    scanned += 1;
    const html = fs.readFileSync(abs, 'utf8');
    for (const a of unbreakableAdjacencies(html)) {
      problems.push(`${f}:${a.line} 隣り合う nowrap に改行機会が無い — 閉じタグの直後へ \`<wbr>\` を入れること`
        + `\n      …${a.context}…`);
    }
    if (!linksStylesheet(html, SHARED_CSS) && !linksStylesheet(html, SAFETY_NET_CSS)) {
      problems.push(`${f}: **共有CSSも網も読んでいない。**`
        + ` \`${SHARED_CSS}\` か \`${SAFETY_NET_CSS}\` のどちらかを読むこと ——`
        + '\n      どちらも無いと、横漏れの修理がこの面へ**一切届かない**'
        + '（2026-09-03、そうなっていた17面のうち `/tiktok/` が 900px で +87px 漏れていた）');
    }
    for (const k of unboundedKeepAll(html)) {
      problems.push(`${f}:${k.line} \`word-break: keep-all\` に上限が無い — **日本語がまったく折り返せなくなる。**`
        + ' WebKit では箱が親を超える（2026-09-03 の実機で over=41px）。'
        + ' 同じ宣言へ `max-width` を置くか、`keep-all` を外すこと'
        + `\n      style="${k.style}…"`);
    }
  }
  return { problems, scanned };
}

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

/** キャッシュ・環境変数・システムの候補を分け、探索の全経路をテストできるようにする。 */
export function findChromium(bases = CHROMIUM_BASES(), {
  fromEnv = process.env.CHROMIUM_PATH,
  systemPaths = ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'],
  exists = fs.existsSync,
  readDir = fs.readdirSync,
} = {}) {
  if (fromEnv && exists(fromEnv)) return fromEnv;
  // GitHub の ubuntu ランナーには Chrome が最初から入っている。
  // **ここを見れば CI でブラウザを落とさずに済む**（150MB のダウンロードを毎PR撃たない）。
  for (const f of systemPaths) {
    if (exists(f)) return f;
  }
  for (const base of bases) {
    if (!exists(base)) continue;
    for (const d of readDir(base).filter((x) => x.startsWith('chromium')).sort().reverse()) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const f = path.join(base, d, rel);
        if (exists(f)) return f;
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

/**
 * **同時に開く枚数。**直列だと1枚 0.44 秒（描画待ち 250ms が支配的）で、
 * 269面 × 11幅 = 2,959通りに 22 分かかる —— **CIでは回せない＝全面を見ない口実になる。**
 * 待ち時間が支配的なので、並べれば実時間はほぼ枚数ぶん縮む。
 */
export const CONCURRENCY = 6;

export async function measure({ pages = PAGES, widths = WIDTHS, concurrency = CONCURRENCY } = {}) {
  const chromium = await loadChromium();
  const exe = findChromium();
  if (!chromium || !exe) {
    return { measurable: false,
      why: !chromium ? 'playwright / playwright-core が入っていない（`npm i --no-save playwright-core`）'
                     : 'Chromium の実体が見つからない（PLAYWRIGHT_BROWSERS_PATH / CHROMIUM_PATH）' };
  }
  const { srv, port } = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const jobs = [];
  for (const page of pages) for (const width of widths) jobs.push({ page, width });
  const results = [];
  const failures = [];
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < jobs.length; i = next++) {
      const { page, width } = jobs[i];
      const p = await browser.newPage({ viewport: { width, height: 800 } });
      try {
        await p.goto(`http://127.0.0.1:${port}${page}`, { waitUntil: 'domcontentloaded' });
        await p.waitForTimeout(250);
        results.push({ page, width, ...(await p.evaluate(PROBE)) });
      } catch (e) {
        // **測れなかったことを、漏れが無かったことにしない。**
        failures.push({ page, width, why: String(e.message || e).split('\n')[0].slice(0, 120) });
      } finally { await p.close().catch(() => {}); }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  } finally {
    await browser.close();
    srv.close();
  }
  const isKnown = (r) => KNOWN.some((k) => k.page === r.page && r.width <= k.upTo);
  const over = results.filter((r) => r.over > 0);
  return { measurable: true, results, failures,
    problems: over.filter((r) => !isKnown(r)),   // 落とすのは**新しい漏れ**だけ
    known: over.filter(isKnown) };
}

/**
 * WebKit 側の実測。**サーバの立ち上げはこちらが持つ**ので、
 * 呼ぶ側は Chromium 側と同じ形（`measure`）で扱える。
 */
export async function measureWk({ pages = PAGES, widths = WIDTHS, concurrency = 3, deep = null } = {}) {
  const { srv, port } = await serve();
  try {
    // `deep` を渡すと**2段**で測る: 深い面は全幅、それ以外は WEBKIT_SWEEP_WIDTHS だけ。
    // 速さの都合で、Chromium 側と同じ「面を絞る側」と「幅を絞る側」を持つ。
    const jobs = deep
      ? [{ pages: deep, widths },
         { pages: pages.filter((p) => !deep.includes(p)), widths: WEBKIT_SWEEP_WIDTHS }]
      : [{ pages, widths }];
    const merged = { measurable: true, engine: 'webkit', results: [], failures: [], problems: [] };
    for (const j of jobs) {
      if (!j.pages.length) continue;
      const r = await measureWebKit({ ...j, port, concurrency });
      if (!r.measurable) return r;
      merged.results.push(...r.results);
      merged.failures.push(...r.failures);
      merged.problems.push(...r.problems);
    }
    return merged;
  } finally { srv.close(); }
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
    if (!SWEEP_WIDTHS.includes(320)) throw new Error('掃きの幅から 320 が外れている');
  }],
  ['**WebKit で本当に測れているか**（Blink と差が出る見本で確かめる）', async () => {
    // `fixtures/engine-divergence.html` は **Blink では収まり WebKit でははみ出す**ように作ってある。
    // WebKit 側の経路が黙って壊れた（ドライバが消えた・iframe が読めない・常に 0 を返す）とき、
    // **実データは通ってしまう**ので、差が出ると分かっている見本で確かめる。
    const P = ['/fixtures/engine-divergence.html'], W = [360];
    const wk = await measureWk({ pages: P, widths: W });
    if (!wk.measurable) throw new Error(`WebKit で測れなかった: ${wk.why}`);
    const over = wk.results[0]?.over ?? 0;
    if (over <= 0) {
      throw new Error('**WebKit が見本を素通りした。**`word-break: keep-all` を守らない'
        + 'エンジンで測っているか、iframe の中身が読めていない'
        + `（doc=${wk.results[0]?.doc} vw=${wk.results[0]?.vw}）`);
    }
    const bl = await measure({ pages: P, widths: W });
    if ((bl.results[0]?.over ?? 0) > 0) {
      throw new Error('**Blink でも見本が漏れた。**エンジン差の見本として成立していないので、'
        + 'この検査は「WebKit を測れている」ことを示せていない。見本を作り直すこと');
    }
  }],
  ['**WebKit が無い環境では「異常なし」にしない**', () => {
    // 落とすかどうかは呼び出し側の判断だが、**measurable: false と理由が返ること**は要求する。
    if (typeof findWebKitDriver !== 'function') throw new Error('ドライバ探索が export されていない');
    const none = findWebKitDriver(['/does/not/exist']);
    if (none !== null && !fs.existsSync(none)) throw new Error('存在しない実体を返した');
  }],
  ['**全面を数える**（3面しか見ていなかった回の再発防止）', () => {
    const all = allPages();
    if (all.length < 200) throw new Error(`面が ${all.length} しかない — 列挙が壊れている`);
    for (const p of PAGES) {
      if (!all.includes(p)) throw new Error(`深く見ている ${p} が全面の一覧に無い — 列挙が面を落としている`);
    }
    if (!all.includes('/blog/')) throw new Error('index.html を持つディレクトリが `/…/` になっていない');
    if (all.some((u) => u.includes('node_modules') || u.includes('.git'))) throw new Error('作業用ディレクトリを拾っている');
  }],
  ['**どの面も共有CSSか網を読んでいる**（届かない面を作らない）', () => {
    const none = pagesWithoutNet();
    if (none.length) {
      throw new Error(`共有CSSも網も無い面が ${none.length}: ${none.slice(0, 5).join(' ')}`);
    }
  }],
  ['**どちらも無い面は落ちる**（2026-09-03 に17面そうなっていた）', () => {
    const fake = (f) => (f === 'x.html' ? '<html><head></head></html>'
      : '<link rel="stylesheet" href="/assets/css/style.min.css?v=abc">');
    const out = pagesWithoutNet(['x.html', 'y.html'], fake);
    if (out.join() !== 'x.html') throw new Error(JSON.stringify(out));
  }],
  ['網だけでも通る（共有CSSを読まない面のための逃げ道）', () => {
    const fake = () => '<link rel="stylesheet" href="/assets/css/safety-net.css?v=abc">';
    if (pagesWithoutNet(['z.html'], fake).length) throw new Error('網を読んでいるのに落とした');
  }],
  ['**文中に名前が出るだけでは「読んでいる」と数えない**（初版はこれで素通りした）', () => {
    // tiktok/index.html の注記が実際にこの形で、検査を無効にしていた。
    const prose = '<!-- この面は共有CSS（assets/css/style.min.css）を読み込んでいない -->';
    if (linksStylesheet(prose, SHARED_CSS)) throw new Error('コメント内の文字列を <link> と読んだ');
    if (!pagesWithoutNet(['p.html'], () => prose).length) throw new Error('素通りした');
    // rel が違うものも数えない
    if (linksStylesheet('<link rel="preload" href="/assets/css/style.min.css">', SHARED_CSS)) {
      throw new Error('preload を stylesheet と読んだ');
    }
  }],
  ['**静的規則は全面に当たる**（3面だけだと 266 面が素通りする）', () => {
    if (STATIC_FILES.length !== allPages().length) {
      throw new Error(`静的の対象が ${STATIC_FILES.length} / 全 ${allPages().length} 面`);
    }
    // 実際に 2026-09-03、3面から全面へ広げた瞬間に /ai-tags/ で2件見つかっている。
    if (!STATIC_FILES.includes('ai-tags/index.html')) throw new Error('/ai-tags/ が対象外');
  }],
  ['**組み合わせを黙って落とさない**（並列化で一番こわいのがこれ）', async () => {
    // 並列にすると、例外が出た組み合わせが**そのまま消える**書き方になりやすい。
    // 消えると「測った通り数」が減るだけで、報告は「漏れなし」になる。
    // だから **要求した通り数 = 結果 + 失敗** を実測で確かめる。
    const pages = ['/', '/en/', '/__ここには面が無い__/'];
    const widths = [320, 360];
    const m = await measure({ pages, widths, concurrency: 3 });
    if (!m.measurable) throw new Error(`測れなかった: ${m.why}`);
    const asked = pages.length * widths.length;
    const got = m.results.length + m.failures.length;
    if (got !== asked) throw new Error(`要求 ${asked} 通りに対し ${got} 通りしか戻っていない`
      + ` — **並列化が組み合わせを落としている**（results ${m.results.length} / failures ${m.failures.length}）`);
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
  ['実データに改行機会の無い隣接が無い', () => {
    const { problems, scanned } = checkStatic();
    if (scanned !== STATIC_FILES.length) throw new Error(`見た面が ${scanned} / ${STATIC_FILES.length}`);
    if (problems.length) throw new Error(problems[0].split('\n')[0]);
  }],
  ['**改行機会の無い隣接は落ちる**（2026-09-03 に14箇所あった形）', () => {
    const bad = '<span class="nb">ワンタップでメールへ届き、</span><span class="nb">Obsidianにも自動追記。</span>';
    if (!unbreakableAdjacencies(bad).length) throw new Error('検出しなかった');
  }],
  ['`<wbr>` があれば通る', () => {
    const ok = '<span class="nb">ワンタップでメールへ届き、</span><wbr><span class="nb">Obsidianにも自動追記。</span>';
    if (unbreakableAdjacencies(ok).length) throw new Error('改行機会が在るのに落とした');
  }],
  ['空白があれば通る（英語面はこちらが自然）', () => {
    const ok = '<span class="nb">AirPods support</span> <span class="nb">— available now.</span>';
    if (unbreakableAdjacencies(ok).length) throw new Error('空白を改行機会と読んでいない');
  }],
  ['nowrap でない隣接は対象外', () => {
    const ok = '<span class="x">あ</span><span class="y">い</span>';
    if (unbreakableAdjacencies(ok).length) throw new Error('関係ない隣接を拾った');
  }],
  ['**面が消えたら落ちる**（静的側も）', () => {
    const { problems } = checkStatic(['そんなファイルは無い.html']);
    if (!problems.length) throw new Error('無い面が通った');
  }],
  ['**上限の無い keep-all は落ちる**（2026-09-03 の実機が名指しした原因）', () => {
    const bad = '<a style="border-radius:24px;word-break:keep-all;">⚡ アクションボタンで5秒メモ</a>';
    if (!unboundedKeepAll(bad).length) throw new Error('検出しなかった');
  }],
  ['`max-width` が同じ宣言に在れば通る（意図して使う道を塞がない）', () => {
    const ok = '<a style="word-break:keep-all;max-width:calc(100% - .6rem);">x</a>';
    if (unboundedKeepAll(ok).length) throw new Error('上限が在るのに落とした');
  }],
  ['keep-all が無い style は対象外', () => {
    if (unboundedKeepAll('<a style="border-radius:24px;">x</a>').length) throw new Error('関係ない style を拾った');
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
    const got = findChromium(['/cache'], {
      fromEnv: '/env/chrome', systemPaths: ['/system/chrome'], exists: () => false,
      readDir: () => { throw new Error('存在しないディレクトリを読んだ'); },
    });
    if (got !== null) throw new Error(`無い場所から見つけたことにした: ${got}`);
  }],
  ['Chromium は環境変数、システム、キャッシュの順に探す', () => {
    const cache = '/cache/chromium-1/chrome-linux/chrome';
    const present = new Set(['/env/chrome', '/system/chrome', '/cache', cache]);
    const options = {
      fromEnv: '/env/chrome', systemPaths: ['/system/chrome'],
      exists: (f) => present.has(f), readDir: () => ['firefox-1', 'chromium-1'],
    };
    for (const expected of ['/env/chrome', '/system/chrome', cache]) {
      const got = findChromium(['/cache'], options);
      if (got !== expected) throw new Error(`expected ${expected}, got ${got}`);
      present.delete(expected);
    }
    if (findChromium(['/cache'], options) !== null) throw new Error('キャッシュ本体が無いのに見つけた');
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

  // **静的規則はブラウザが要らない。**だからCIでも落とせる側に置ける
  //（描画のほうは報告のみ。判定にブラウザを要求するとCIが外部要因で赤くなる）。
  if (argv.includes('--static')) {
    const { problems, scanned } = checkStatic();
    console.log(`隣り合う nowrap の改行機会 — ${scanned} 面`);
    for (const p of problems) console.log(`  - ${p}`);
    if (!problems.length) console.log('  改行機会の無い隣接なし。');
    process.exit(problems.length ? 1 : 0);
  }

  const report = argv.includes('--report');
  const staticResult = checkStatic();
  // **全面 × 2幅を、深い3面 × 14幅と一緒に測る。**
  // 面を絞る側（3面）と幅を絞る側（全面）を両方持つ。片方だけだと、
  // 2026-09-03 に実際そうなったように「見ていない面」か「見ていない幅」が残る。
  const sweep = argv.includes('--no-sweep') ? null
    : await measure({ pages: allPages(), widths: SWEEP_WIDTHS });
  const m = await measure();
  // **もう一方のエンジン。**Blink とは行分割の判断が違い、実機（iOS）はこちら側。
  //   深い3面 × 14幅（約16秒）＋ 全269面 × 320px（約1.7分）。
  //   全面 × 4幅まで広げると 6.8 分で、CIに載らない＝結局また測らなくなる。
  const wk = argv.includes('--no-webkit') ? null
    : await measureWk({
        pages: [...new Set([...PAGES, ...allPages()])],
        widths: WIDTHS,
        concurrency: 3,
        deep: PAGES,
      }).catch((e) => ({ measurable: false, engine: 'webkit',
        why: String(e.message || e).split('\n')[0].slice(0, 160) }));
  console.log(`着地面の横漏れ — ${PAGES.join(' / ')} × ${WIDTHS.join('/')}px`);
  if (sweep) {
    console.log(`全面の掃き — ${allPages().length}面 × ${SWEEP_WIDTHS.join('/')}px`
      + `${sweep.measurable ? `（${sweep.results.length} 通り）` : ''}`);
  }
  if (wk) {
    console.log(wk.measurable
      ? `WebKit — 深い ${PAGES.length}面 × ${WIDTHS.length}幅 ＋ 全 ${allPages().length}面 × ${WEBKIT_SWEEP_WIDTHS.join('/')}px`
        + `（${wk.results.length} 通り）`
      : `WebKit — **測れなかった**: ${wk.why}`);
  }
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
  // 掃きの側。**同じ面が2幅で出るので、面ごとに1行へまとめる。**
  const sweepPages = new Map();
  if (sweep?.measurable) {
    for (const r of sweep.problems) {
      if (!sweepPages.has(r.page) || sweepPages.get(r.page).over < r.over) sweepPages.set(r.page, r);
    }
    for (const r of [...sweepPages.values()].sort((a, b) => b.over - a.over)) {
      console.log(`\n  ★ ${r.page} @${r.width}px — +${r.over}px`);
      for (const c of r.culprits.slice(0, 2)) {
        console.log(`      right=${c.right} w=${c.width} <${c.tag}.${c.cls}> "${c.text}"`);
      }
    }
  }
  if (sweep && !sweep.measurable) console.log(`\n  **全面の掃きが測れなかった**: ${sweep.why}`);
  // WebKit 側。**面ごとに1行へまとめる**（Blink 側と同じ扱い）。
  const wkPages = new Map();
  if (wk?.measurable) {
    for (const r of wk.problems) {
      if (!wkPages.has(r.page) || wkPages.get(r.page).over < r.over) wkPages.set(r.page, r);
    }
    for (const r of [...wkPages.values()].sort((a, b) => b.over - a.over)) {
      console.log(`\n  ◆ WebKit ${r.page} @${r.width}px — +${r.over}px`);
      for (const c of (r.culprits ?? []).slice(0, 2)) {
        console.log(`      right=${c.right} w=${c.width} <${c.tag}.${c.cls}> "${c.text}"`);
      }
    }
    for (const f of wk.failures) console.log(`  ! WebKit で測れなかった ${f.page} @${f.width}px — ${f.why}`);
  }
  for (const f of [...(m.failures ?? []), ...(sweep?.failures ?? [])]) {
    console.log(`  ! 測れなかった ${f.page} @${f.width}px — ${f.why}`);
  }
  for (const p of staticResult.problems) console.log(`  ★ ${p}`);
  const sweepFailed = sweep && (!sweep.measurable || sweepPages.size || sweep.failures.length);
  const wkFailed = wk && (!wk.measurable || wkPages.size || wk.failures.length);
  if (!m.problems.length && !staticResult.problems.length && !sweepFailed && !wkFailed
    && !(m.failures ?? []).length) {
    const wkN = wk?.measurable ? wk.results.length : 0;
    console.log(`\n  ${m.results.length + (sweep?.results.length ?? 0) + wkN} 通りを実測`
      + `（Blink: 深い ${PAGES.length}面 × ${WIDTHS.length}幅 ＋ 全 ${allPages().length}面 × ${SWEEP_WIDTHS.length}幅`
      + `${wkN ? ` ／ WebKit: ${wkN} 通り` : ''}）。`
      + '**新しい横漏れなし**'
      + `${m.known.length ? `（既知 ${m.known.length} 件は上のとおり。直したら KNOWN から消すこと）` : ''}。`);
    // **留保は正確に書く。**「フォントが違う」ではない —— 日本語は自前配信の woff2 で実機と同じ。
    console.log('  （日本語の字幅は実機と同じ（Noto Sans JP を自前配信しているため）。'
      + '**ラテン文字と絵文字のフォールバックだけが違い、実機より小さめに出る** ——'
      + '\n   2026-09-03 の校正で 実機41px に対しここは31px。**余裕は多めに見ること。**）');
    if (!wkN) {
      console.log('  （**WebKit を測っていない。**`apt-get install -y --no-install-recommends '
        + 'webkit2gtk-driver xvfb` を入れると、Blink では出ない壊れ方も見る）');
    }
  } else {
    console.log(`\n  **横スクロールが出る組み合わせが ${m.problems.length} 件。**`);
    console.log('  `.nb` を並べただけでは改行機会にならない —— 隣接する nowrap のあいだに');
    console.log('  `<wbr>` を入れるか、flex アイテムに `min-width: 0` を与えること。');
  }
  if (sweepPages.size) {
    console.log(`\n  **全面の掃きで ${sweepPages.size} 面が漏れている。**`);
    console.log('  表が原因なら `<div style="overflow-x:auto">` で包むこと（サイトの既存の書き方）。');
  }
  if (wkPages.size) {
    console.log(`\n  **WebKit で ${wkPages.size} 面が漏れている。**Blink では出ない壊れ方がある ——`);
    console.log('  `word-break: keep-all` のように、**行分割の判断がエンジンで違う**指定を疑うこと。');
    console.log('  （WebKitGTK は iOS Safari そのものではなく、ラテン文字のフォールバックが違うので');
    console.log('   **実機より小さめに出る。**2026-09-03 の実測で 実機41px → ここ31px）');
  }
  if (!report && (m.problems.length || staticResult.problems.length || sweepFailed || wkFailed
    || (m.failures ?? []).length)) process.exit(1);
}
