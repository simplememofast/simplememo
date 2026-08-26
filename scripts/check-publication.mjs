#!/usr/bin/env node
/**
 * data/*.json のうち**どれをサイトが配信するか**を明示し、実際の配信と突き合わせる。
 *
 *   node scripts/check-publication.mjs           # 表示
 *   node scripts/check-publication.mjs --write   # _redirects の遮断ブロックを更新
 *   node scripts/check-publication.mjs --check   # CI
 *   node scripts/check-publication.mjs --selftest
 *
 * 【⚠ 配信を止めても非公開にはならない — 2026-08-26 に確かめた】
 * **このリポジトリは GitHub 上で公開されている**（api.github.com が
 * `private: false` を返す。simplememo-ios / simplememo-api は非公開）。
 * つまり _redirects の 404 が止めているのは**サイト経由の閲覧だけ**で、
 * 同じファイルは GitHub 上で誰でも読める。
 *
 * 旧版はこの真偽値を `public` と呼んでいた。**名前が事実と違うと、
 * 対策を打ったつもりで穴が残る** —— 実際、下の役員報酬の件は 404 化で
 * 手当てしたことになっていたが、非公開にはなっていなかった。
 * `served_by_site` に改名し、リポジトリ自体の公開状態は
 * publication-policy.json の `repository_is_public` に**別の欄として**持つ。
 *
 * 【なぜ配信の制御自体は要るか — 2026-08-25 に気づいた】
 * Cloudflare Pages は**リポジトリの中身をそのまま配信する。**除外設定は無い。
 * つまり `data/*.json` は34件すべてが `https://simplememofast.com/data/...` で
 * 読める状態にあった。**サイトが意図して参照しているのは6件だけ。**
 * 残り28件は、静的ホスティングの副作用で公開されていた。
 *
 * その中には次のものが含まれる:
 *
 *   credential-expiry.json … **どんな資格情報が存在するか**の一覧
 *   injection-surface.json … **攻撃面の棚卸し**
 *   corporate-obligations.json … 法人の期限・記録
 *   financial-policy.json  … 上限・損失限度・観測した売上
 *   spend-approvals.json / vendor-register.json … 支出承認と取引先
 *
 * **どれも秘密そのものではない**（鍵の値は入っていない）。だが
 * 「何があるか」の地図であって、公開するかどうかは**選んで決めるべきこと**で、
 * 静的ホスティングの既定で決まってよいことではない。
 *
 * **そして実際にこの穴を踏んだ。**2026-08-25、⑦法人経営の欄を埋める作業で
 * `officer_compensation`（役員報酬の有無）を corporate-obligations.json に
 * 書き込んだ。**登記事項ではない情報を、公開ディレクトリへ、確認せずに置いた。**
 *
 * 【この検査が守ること】
 *   1. data/*.json は**全件が方針に載っていること**（新しいファイルは分類するまで落ちる）
 *   2. 配信しないものは _redirects で実際に 404 になっていること
 *   3. 配信するものは**サイトから実際に参照されていること**
 *      （参照が消えたのに配信のまま残る、を防ぐ）
 *   4. **リポジトリ自体の公開状態が、方針に書いた値と一致していること**
 *      （CI が github.event.repository.private から実測値を渡す）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const POLICY_PATH = path.join(ROOT, 'data/publication-policy.json');
export const REDIRECTS_PATH = path.join(ROOT, '_redirects');
export const MIDDLEWARE_PATH = path.join(ROOT, 'functions/_middleware.js');
const DATA_DIR = path.join(ROOT, 'data');

export const BEGIN = '# BEGIN data-publication (scripts/check-publication.mjs --write)';
export const END = '# END data-publication';
export const JS_BEGIN = '// BEGIN data-publication (scripts/check-publication.mjs --write)';
export const JS_END = '// END data-publication';

/**
 * 公開リポジトリに在ってよいか。**配信するかとは別の問い。**
 *
 * `ok`     … 在ってよい。多くは資産（数え方を公開していることが売り）
 * `review` … 判断が要る。`public_repo_why` 必須で、検査が毎回列挙する
 *
 * **`no` を用意していない。**このリポジトリは作られたときから公開で、
 * git の履歴が残る以上、ファイルを消しても公開されなかったことにはならない。
 * 実行可能な対策は「これ以上ここへ機微情報を足さない」だけなので、
 * review は「消す予定」ではなく「足す前に必ず読む」の印にしてある。
 */
export const PUBLIC_REPO_VALUES = ['ok', 'review'];

export function listDataFiles(dir = DATA_DIR) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
}

/** サイトの HTML から実際に参照されている data ファイル。 */
export function referencedFiles(root = ROOT) {
  const found = new Set();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) {
        const t = fs.readFileSync(p, 'utf8');
        for (const m of t.matchAll(/\/data\/([a-z0-9-]+\.json)/g)) found.add(m[1]);
      }
    }
  };
  walk(root);
  return found;
}

/** private のファイルを 404 にする _redirects ブロックを組む。 */
/**
 * _redirects 側は**墓標にする。**
 *
 * [2026-08-26] ここに `/data/x.json /404.html 404` を並べていたが、本番で
 * **一度も効いていなかった。**Cloudflare Pages は実在する静的ファイルを優先し、
 * そのパスの _redirects を無視する（対照実験は functions/_middleware.js のコメント）。
 *
 * 消すだけだと、次に同じ穴を見つけた人がまた同じ場所へ書く。
 * **効かない理由を残し、検査でその状態を固定する。**実際の遮断は middleware。
 */
export function buildBlock(policy) {
  const priv = Object.entries(policy.files)
    .filter(([, v]) => !v.served_by_site)
    .map(([f]) => f)
    .sort();
  const lines = [
    BEGIN,
    '# **data/*.json の遮断をここに書かないこと。**効かない。',
    '#',
    '# Cloudflare Pages は実在する静的ファイルを優先し、そのパスの _redirects を',
    '# 無視する。2026-08-25 にここへ404ルールを並べたが、本番で一度も効いていなかった',
    '# （2026-08-26 の対照実験: /privacy-policy は301になるがファイルが無い。',
    '#  /data/credential-expiry.json はファイルが在るので200のまま）。',
    '#',
    `# 実際の遮断は functions/_middleware.js（現在 ${priv.length} 件）。`,
    '# 一覧は data/publication-policy.json が正で、--write が両方を書く。',
    END,
  ];
  return lines.join('\n');
}

/**
 * リポジトリ自体が公開かどうかの**実測値**。
 * CI では seo-check.yml が `REPO_PRIVATE: ${{ github.event.repository.private }}` を渡す。
 * **渡ってこなければ null**（「観測していない」を false と混ぜない）。
 */
export function repoVisibility(env = process.env) {
  // **Apple 側ではなく GitHub 側の生の値をそのまま受ける。**
  // `!private` を YAML 側で計算させない —— 値が空のとき `!'' === true` になり、
  // **観測していない実行が「公開」を名乗る。**否定はここで、三値のまま行う。
  const raw = env.REPO_PRIVATE;
  if (raw === 'true') return false;
  if (raw === 'false') return true;
  return null; // 未設定・空・知らない値は「観測していない」
}

/**
 * 方針が書いている公開状態と、実測が一致するか。
 *
 * **観測できなかったときは通す。**ただし呼び出し側で「観測していない」と表示する。
 * ここで落とすと、ローカル実行や隣リポジトリからの実行が全部赤くなり、
 * 「赤いのが普通」になって本物の食い違いが埋もれる。
 */
export function checkRepoVisibility(policy, observed) {
  const declared = policy.repository_is_public;
  if (typeof declared !== 'boolean') {
    return ['publication-policy.json に repository_is_public が無い'
      + ' — **配信の遮断を「非公開」と読み替えないために、リポジトリ側の状態を明示する**'];
  }
  if (observed === null) return [];
  if (observed !== declared) {
    return [`リポジトリの公開状態が方針と違う（宣言 ${declared} / 実測 ${observed}）`
      + ' — **served_by_site: false の意味が変わる。**方針の repository_is_public と'
      + ' 各ファイルの why を見直すこと'];
  }
  return [];
}

/**
 * middleware に埋める遮断リスト。
 *
 * [2026-08-26] **_redirects では止まらないことが本番で確定した。**
 * Cloudflare Pages は実在する静的ファイルを優先し、そのパスの _redirects を無視する。
 * 対照実験（本番・2026-08-26）:
 *
 *   /privacy-policy               → 301  （ファイルが無い → _redirects が効く）
 *   /data/credential-expiry.json  → 200  （ファイルが在る → 無視される）
 *   /growth/experiments/...json   → 404  （middleware は効く）
 *
 * つまり 2026-08-25 に入れた `_redirects` の404ブロックは**一度も効いていなかった。**
 * それでもこの検査は「ブロックが _redirects に在ること」を確かめて緑を出していた ——
 * **在ることと効くことは別。**Functions は静的アセットより先に走るので、こちらへ移す。
 */
export function buildJsBlock(policy) {
  const unserved = Object.entries(policy.files)
    .filter(([, v]) => !v.served_by_site)
    .map(([f]) => f)
    .sort();
  return [
    JS_BEGIN,
    '// **サイトが配信しない data/*.json。**一覧は data/publication-policy.json が正。',
    '// 手で編集しない —— `node scripts/check-publication.mjs --write` が書く。',
    '//',
    '// **これは非公開化ではない。**リポジトリ自体が公開なので、同じ内容は GitHub 上で',
    '// 読める（publication-policy.json の repository_is_public）。ここで止めているのは',
    '// サイト経由の配信・索引・キャッシュだけ。',
    'const UNSERVED_DATA = new Set([',
    ...unserved.map((f) => `  ${JSON.stringify(f)},`),
    ']);',
    JS_END,
  ].join('\n');
}

/** middleware の遮断リストが方針と一致するか。**効く側なので、こちらが本体。** */
export function checkMiddleware(policy, text) {
  const block = buildJsBlock(policy);
  if (!text.includes(JS_BEGIN)) {
    return ['functions/_middleware.js に遮断ブロックが無い'
      + ' — **_redirects では実在ファイルを止められない。**`--write` を実行すること'];
  }
  const start = text.indexOf(JS_BEGIN);
  const end = text.indexOf(JS_END) + JS_END.length;
  if (text.slice(start, end) !== block) {
    return ['functions/_middleware.js の遮断ブロックが方針とずれている'
      + ' — `node scripts/check-publication.mjs --write` を同じコミットに含めること'];
  }
  return [];
}

export function validate(policy, { files, referenced }) {
  const problems = [];
  const listed = new Set(Object.keys(policy.files || {}));

  for (const f of files) {
    if (!listed.has(f)) {
      problems.push(`data/${f} が publication-policy.json に無い`
        + ' — **分類するまで通さない。**公開してよいかを既定で決めさせない');
    }
  }
  for (const f of listed) {
    if (!files.includes(f)) problems.push(`publication-policy.json の ${f} が実在しない`);
    const v = policy.files[f];
    if (typeof v.served_by_site !== 'boolean') problems.push(`${f}: served_by_site を真偽値で書くこと`);
    if (!v.why) problems.push(`${f}: why が無い — **配信する/しない の理由を残す**`);

    // [2026-08-26] **3本目の軸。**served_by_site は「サイトが配信するか」しか
    // 聞いていない。このリポジトリが公開である以上、それでは足りない。
    // 聞くべきは「そもそも公開リポジトリに在ってよいか」。
    if (!PUBLIC_REPO_VALUES.includes(v.ok_in_public_repo)) {
      problems.push(`${f}: ok_in_public_repo は ${PUBLIC_REPO_VALUES.join('|')} のいずれか`
        + ' — **公開リポジトリに在ってよいかを、配信するかと別に決める**');
    }
    if (v.ok_in_public_repo === 'review' && !v.public_repo_why) {
      problems.push(`${f}: ok_in_public_repo=review なのに public_repo_why が無い`
        + ' — **何が引っかかるのかを書く。**「一応 review」は分類ではない');
    }
    // 配信すると言っているのに、どこからも参照されていない
    if (v.served_by_site && !referenced.has(f) && !v.allow_unreferenced) {
      problems.push(`${f}: served_by_site だがサイトのどこからも参照されていない`
        + ' — 参照が消えたのに配信のまま残っている可能性。'
        + ' 意図してURLだけ残すなら allow_unreferenced: true を書く');
    }
  }
  return problems;
}

export function checkRedirects(policy, redirectsText) {
  const problems = [];
  const block = buildBlock(policy);
  if (!redirectsText.includes(BEGIN)) {
    problems.push('_redirects に遮断ブロックが無い — `--write` を実行すること');
    return problems;
  }
  const start = redirectsText.indexOf(BEGIN);
  const end = redirectsText.indexOf(END) + END.length;
  const current = redirectsText.slice(start, end);
  if (current !== block) {
    problems.push('_redirects の遮断ブロックが方針とずれている'
      + ' — `node scripts/check-publication.mjs --write` を同じコミットに含めること');
  }
  return problems;
}

function selftest() {
  let total = 0; const failures = [];
  const t = (n, c) => { total += 1; if (!c) failures.push(n); console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}`); };

  const pol = { files: {
    'a.json': { served_by_site: true, why: 'サイトが読む', ok_in_public_repo: 'ok' },
    'b.json': { served_by_site: false, why: '内部だけ', ok_in_public_repo: 'ok' },
  } };
  t('未分類のファイルは落ちる',
    validate(pol, { files: ['a.json', 'b.json', 'c.json'], referenced: new Set(['a.json']) })
      .some((p) => p.includes('c.json')));
  t('理由の無い行は落ちる',
    validate({ files: { 'a.json': { served_by_site: true } } }, { files: ['a.json'], referenced: new Set(['a.json']) })
      .some((p) => p.includes('why')));
  t('配信すると書いたのに参照が無ければ落ちる',
    validate(pol, { files: ['a.json', 'b.json'], referenced: new Set() })
      .some((p) => p.includes('参照されていない')));
  t('allow_unreferenced を書けば通る',
    validate({ files: { 'a.json': { served_by_site: true, why: 'x', allow_unreferenced: true, ok_in_public_repo: 'ok' } } },
      { files: ['a.json'], referenced: new Set() }).length === 0);
  t('配信しないものは参照が無くても落ちない',
    !validate(pol, { files: ['a.json', 'b.json'], referenced: new Set(['a.json']) })
      .some((p) => p.includes('b.json') && p.includes('参照')));

  // 公開リポジトリに在ってよいか — **配信するかとは別の問い**
  const arg = { files: ['a.json'], referenced: new Set(['a.json']) };
  const one = (over) => ({ files: { 'a.json': { served_by_site: true, why: 'x', ...over } } });
  t('**3本目の軸が無ければ落ちる**（配信するかだけでは足りない）',
    validate(one({}), arg).some((p) => p.includes('ok_in_public_repo')));
  t('知らない値は落ちる',
    validate(one({ ok_in_public_repo: 'maybe' }), arg).some((p) => p.includes('ok_in_public_repo')));
  t('review は理由が要る（「一応 review」は分類ではない）',
    validate(one({ ok_in_public_repo: 'review' }), arg).some((p) => p.includes('public_repo_why')));
  t('review + 理由なら通る',
    validate(one({ ok_in_public_repo: 'review', public_repo_why: 'y' }), arg).length === 0);
  t('**no は用意しない**（消しても履歴には残るので、実行可能な選択肢ではない）',
    !PUBLIC_REPO_VALUES.includes('no'));

  // リポジトリ自体の公開状態 — **配信の遮断と混ぜない**
  t('観測値が無ければ null（「観測していない」を false にしない）',
    repoVisibility({}) === null && repoVisibility({ REPO_PRIVATE: '' }) === null);
  t('GitHub の private をそのまま受けて否定はこちらで行う',
    repoVisibility({ REPO_PRIVATE: 'false' }) === true
    && repoVisibility({ REPO_PRIVATE: 'true' }) === false);
  t('知らない値は「観測していない」に倒す（**空文字を公開と読まない**）',
    repoVisibility({ REPO_PRIVATE: 'yes' }) === null);
  t('宣言が無ければ落ちる', checkRepoVisibility({}, true).length === 1);
  t('観測できなければ落とさない', checkRepoVisibility({ repository_is_public: true }, null).length === 0);
  t('一致すれば通る', checkRepoVisibility({ repository_is_public: true }, true).length === 0);
  t('**非公開のつもりが公開だったら落ちる**',
    checkRepoVisibility({ repository_is_public: false }, true).length === 1);
  t('公開のつもりが非公開になっても落ちる（意味が変わるので気づく）',
    checkRepoVisibility({ repository_is_public: true }, false).length === 1);

  // middleware 側 — **_redirects は実在ファイルを止められない**ので、こちらが本体
  const js = buildJsBlock(pol);
  t('配信しないものだけを middleware に並べる',
    js.includes('"b.json"') && !js.includes('"a.json"'));
  t('middleware にブロックが無ければ落ちる',
    checkMiddleware(pol, 'nothing').some((p) => p.includes('実在ファイルを止められない')));
  t('middleware のずれを検出する',
    checkMiddleware(pol, `${JS_BEGIN}\nwrong\n${JS_END}`).length === 1);
  t('middleware が一致すれば通る', checkMiddleware(pol, `head\n${js}\ntail`).length === 0);

  const block = buildBlock(pol);
  t('_redirects 側は墓標（ルールを書かない・理由を残す）',
    !block.includes('/data/b.json') && block.includes('効かない'));
  t('遮断ブロックの欠落を検出する', checkRedirects(pol, 'nothing').length === 1);
  t('ずれを検出する', checkRedirects(pol, `${BEGIN}\nwrong\n${END}`).length === 1);
  t('一致すれば通る', checkRedirects(pol, `head\n${block}\ntail`).length === 0);

  if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗`); return 1; }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());

  const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
  const files = listDataFiles();
  const referenced = referencedFiles();
  const problems = validate(policy, { files, referenced });

  const pub = Object.entries(policy.files).filter(([, v]) => v.served_by_site).map(([f]) => f);
  const priv = Object.entries(policy.files).filter(([, v]) => !v.served_by_site).map(([f]) => f);
  console.log(`data/*.json ${files.length} 件 — サイトが配信 ${pub.length} / 配信しない ${priv.length}\n`);
  console.log('  サイトが配信:');
  for (const f of pub) console.log(`    ${f}  — ${policy.files[f].why}`);
  console.log(`\n  配信しない（_redirects で 404）: ${priv.length} 件`);
  const review = Object.entries(policy.files)
    .filter(([, v]) => v.ok_in_public_repo === 'review');
  if (review.length) {
    console.log(`\n  **公開リポジトリに在ることを判断済み（要再読）: ${review.length} 件**`);
    for (const [f, v] of review) console.log(`    ${f}\n      ${String(v.public_repo_why).slice(0, 120)}…`);
    console.log('  **消しても履歴には残る。**ここへ新しい機微情報を足さない、が対策の全部。');
  }

  const observed = repoVisibility();
  problems.push(...checkRepoVisibility(policy, observed));
  if (observed === null) {
    console.log('\n  リポジトリの公開状態: **この実行では観測していない**'
      + `（方針の宣言は ${policy.repository_is_public ? '公開' : '非公開'}）`);
    console.log('  **照合できなかったことを「一致」と書かない。**CI では seo-check.yml が渡す。');
  } else {
    console.log(`\n  リポジトリの公開状態: ${observed ? '**公開**' : '非公開'}（実測）`);
    if (observed) {
      console.log('  → 上の「配信しない」は**非公開という意味ではない。**GitHub 上では読める');
    }
  }

  if (process.argv.includes('--write')) {
    let text = fs.readFileSync(REDIRECTS_PATH, 'utf8');
    const block = buildBlock(policy);
    if (text.includes(BEGIN)) {
      const s = text.indexOf(BEGIN);
      const e = text.indexOf(END) + END.length;
      text = text.slice(0, s) + block + text.slice(e);
    } else {
      text = `${text.trimEnd()}\n\n${block}\n`;
    }
    fs.writeFileSync(REDIRECTS_PATH, text);
    console.log('\n  → _redirects を更新');

    // **効くのはこちら。**_redirects は実在ファイルには適用されない（本番で確認）。
    let mw = fs.readFileSync(MIDDLEWARE_PATH, 'utf8');
    const jsBlock = buildJsBlock(policy);
    if (mw.includes(JS_BEGIN)) {
      const s2 = mw.indexOf(JS_BEGIN);
      const e2 = mw.indexOf(JS_END) + JS_END.length;
      mw = mw.slice(0, s2) + jsBlock + mw.slice(e2);
      fs.writeFileSync(MIDDLEWARE_PATH, mw);
      console.log('  → functions/_middleware.js を更新');
    } else {
      console.error('  functions/_middleware.js に遮断ブロックの目印が無い');
      process.exit(1);
    }
    process.exit(0);
  }

  problems.push(...checkRedirects(policy, fs.readFileSync(REDIRECTS_PATH, 'utf8')));
  problems.push(...checkMiddleware(policy, fs.readFileSync(MIDDLEWARE_PATH, 'utf8')));
  if (problems.length) {
    console.error('\n公開方針: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n分類・遮断・参照に食い違いなし。');
}
