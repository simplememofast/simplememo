#!/usr/bin/env node
/**
 * **落ちることを確かめていない検査は、無いのと同じ。**
 *
 *   node scripts/check-selftests.mjs            # 一覧
 *   node scripts/check-selftests.mjs --check    # 台帳の整合とラチェット（CI）
 *   node scripts/check-selftests.mjs --sync     # CI配線の増減を台帳へ取り込む
 *   node scripts/check-selftests.mjs --selftest # 境界の固定
 *
 * 【なぜ要るか】
 * 2026-08-26 の1日で、**自分が書いた検査が黙って効いていない**のを5回踏んだ。
 * うち1件（check-pr-facts.mjs）は、規則を足したのに `scan()` が1行ずつしか
 * 見ないせいで**一度も発火しない**状態だった。緑は出続けていた。
 *
 * data/stop-drills.json が停止機構に対してやっていることを、検査に対してやる ——
 * 「実装した」と「**落ちるのを見た**」を同じ語で呼ばない。
 *
 * 【推測しない】
 * ソースを正規表現で読んで「否定ケースがありそう」と判定する案を捨てた。
 * **推測で作った検査は、推測の分だけ効かない。**台帳が持つのは観測だけで、
 * `demonstrated` は「実際に壊して落ちるのを見た」ときにしか書けない
 * （日付と、何を壊したかが必須）。
 *
 * 【ラチェット】
 * 40本を今日直すのは無理なので、**増える方向だけを止める。**
 * `none` の本数が台帳の `none_budget` を超えたら落ちる。新しい検査は
 * 自己テスト付きで入るしかなく、既存の借金は減る方向にしか動かせない。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/check-selftests.json');
const WORKFLOW = path.join(ROOT, '.github/workflows/seo-check.yml');

/**
 * `none`         … 自己テストが無い
 * `selftest_only`… 自己テストはあるが、**落ちるのを見た記録が無い**
 * `demonstrated` … 壊して落ちるのを実際に見た（`broke` と `at` が必須）
 */
export const STATES = ['none', 'selftest_only', 'demonstrated'];

/**
 * ワークフローの本文から「配線された検査」を拾う正規表現。
 *
 * **2回、狭すぎた。**どちらも `--check` が緑を出したまま、その範囲について
 * 何も見ていない状態だった:
 *   - 2026-09-03 まで `\.mjs` で終わっていて、`seo-check.js`（主検査・12ゲート）
 *     を含む `.js` 5本が台帳の外にいた
 *   - 同じ日、`node` で始まる行しか見ておらず、`python3` の2本
 *     （`generate_sitemap.py` / `inject_locale_seed.py`）が外に残っていた。
 *     前者は 2026-08-22 に**まさにこの形で効いていなかった** ——
 *     `--dry-run` が件数を出すだけで、回し忘れた PR を一度も止められなかった
 *
 * 末尾の否定先読みは `foo.js` を `foo.j` + `s` のような形で拾わないため。
 * インタプリタを増やすときは `scripts/preflight.mjs` の導出も同時に見ること
 * —— **1か所だけ直すと、鏡が古い版を映し続ける。**
 */
const RUN_RE = /(?:node|python3)\s+((?:growth\/)?scripts\/[\w.-]+\.(?:m?js|py))(?![\w.-])/;

/**
 * **配線されているだけでは足りない。落とせるステップを持っているか。**
 *
 * 2026-09-03 に実測: 台帳 91 本のうち `scripts/indexnow-notify.js` の 1 本は、
 * `--selftest` が
 *
 *     - name: IndexNow notification (on main push only)
 *       if: github.ref == 'refs/heads/main' && github.event_name == 'push'
 *       run: |
 *         node scripts/indexnow-notify.js --selftest
 *         node scripts/indexnow-notify.js --since 1
 *       continue-on-error: true
 *
 * の中にしか無かった。**PR では走らず、走っても job を落とせない。**
 * それでも台帳は `demonstrated` と書き、`--check` は緑を出す ——
 * この台帳が狩っている「『判定できなかった』を『異常なし』と報告する」形が、
 * 配線のもう一段外側で起きていた。
 *
 * `if:` の条件の中身は評価しない。**手元で真偽を決められない条件は
 * 「常に走る」と呼べない**ので、一律で「落とせない」に数える。
 * 落とせる呼び出しが1つでもあれば、その検査は数に入る。
 */
export function gatingChecks(workflow = WORKFLOW) {
  const lines = fs.readFileSync(workflow, 'utf8').split('\n');
  const steps = [];
  let cur = null;
  for (const raw of lines) {
    let st = raw.trim();
    if (st.startsWith('- ')) {
      if (cur) steps.push(cur);
      cur = { body: [], gated: false };
      st = st.slice(2).trim();
    }
    if (!cur) continue;
    if (/^if:\s/.test(st) || /^continue-on-error:\s*true\b/.test(st)) cur.gated = true;
    cur.body.push(raw);
  }
  if (cur) steps.push(cur);
  const found = new Set();
  for (const st of steps) {
    if (st.gated) continue;
    for (const m of st.body.join('\n').matchAll(new RegExp(RUN_RE.source, 'g'))) found.add(m[1]);
  }
  return [...found].sort();
}

/**
 * CI（seo-check.yml）が実際に走らせている node 検査。**配線が正。**
 *
 * **[2026-09-03] `.mjs` しか拾っていなかった。**seo-check.yml が走らせる node 検査は
 * `.mjs` 86本 / `.js` 5本で、台帳の86行はすべて `.mjs` だった。つまりこの検査は
 * 「列挙・証跡・ラチェットに問題なし」と緑を出しながら、**5本について何も見ていなかった** ——
 * しかもその中にこのリポジトリの主検査 `seo-check.js` が入っていた。
 * この台帳の $comment が「この工程で見つけた穴は、すべて同じ形をしていた ——
 * **『判定できなかった』を『異常なし』と報告する**」と書いている、まさにその形。
 *
 * 拡張子を `m?js` に広げたのは、5本すべてに自己テストを入れて
 * 落ちるのを観測したあと（先に広げると none/selftest_only が上限0を超えて即赤になる。
 * **上限を上げて通すのは禁じ手**で、順番でしか閉じられない）。
 * 末尾の否定先読みは `foo.js` を `foo.j` + `s` のような形で拾わないため。
 */
export function wiredChecks(workflow = WORKFLOW) {
  const text = fs.readFileSync(workflow, 'utf8');
  const found = new Set();
  for (const m of text.matchAll(new RegExp(RUN_RE.source, 'g'))) found.add(m[1]);
  return [...found].sort();
}

export function loadLedger(file = LEDGER_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function validate(doc, {
  wired = wiredChecks(),
  gating = gatingChecks(),
  exists = (p) => fs.existsSync(path.join(ROOT, p)),
} = {}) {
  const problems = [];
  const rows = doc?.checks;
  if (!Array.isArray(rows)) return ['checks が配列でない'];

  const seen = new Map();
  for (const r of rows) {
    const at = `checks[${r.script ?? '?'}]`;
    if (!r.script) { problems.push('script が無い行がある'); continue; }
    if (seen.has(r.script)) problems.push(`${at}: 重複`);
    seen.set(r.script, r);
    if (!STATES.includes(r.state)) {
      problems.push(`${at}: 知らない state 「${r.state}」（${STATES.join(' / ')}）`);
    }
    // **demonstrated は証跡を要求する。**日付と「何を壊したか」が無ければ、
    // あとから誰でも「見た」と書けてしまう。
    if (r.state === 'demonstrated') {
      if (!r.at) problems.push(`${at}: demonstrated には at（観測日）が要る`);
      if (!r.broke) problems.push(`${at}: demonstrated には broke（何を壊して落としたか）が要る`);
    }
    if (r.state !== 'demonstrated' && (r.at || r.broke)) {
      problems.push(`${at}: state が ${r.state} なのに観測の記録がある`);
    }
    if (exists(r.script) === false) problems.push(`${at}: ファイルが無い`);
  }

  // **配線と台帳がずれたら落とす。**新しい検査が黙って台帳の外へ出るのを防ぐ。
  for (const s of wired) {
    if (!seen.has(s)) problems.push(`CI が走らせているのに台帳に無い: ${s}（--sync で取り込む）`);
  }
  for (const r of rows) {
    if (!wired.includes(r.script)) problems.push(`台帳にあるが CI が走らせていない: ${r.script}（--sync で外す）`);
  }

  // **走ることと、落とせることは別。**`if:` の中や `continue-on-error: true` の
  // 下にしか無い呼び出しは、PR を止められない。台帳が `demonstrated` と書いても、
  // その観測は CI に効いていない。
  for (const w of wired) {
    if (!gating.includes(w)) {
      problems.push(`配線はされているが**落とせるステップが1つも無い**: ${w}`
        + '（`if:` か `continue-on-error: true` の中にしかいない）。'
        + '自己テストは条件の付かない独立したステップで走らせること');
    }
  }

  // ラチェット。**増える方向だけを止める。**
  //
  // [2026-08-26] **上限は none にしか無かった。**none が 0 になった日に、
  // 新しい検査はすべて selftest_only へ落ちるようになった —— そこに上限が
  // 無いので、**同じ滞留がひとつ下の段で始まる。**
  // 「自己テストを書いた」で止まり、「落ちるのを見た」まで行かない状態が
  // 無制限に積める。段を下ろしただけでは、止める力は移らない。
  const counts = {
    none: rows.filter((r) => r.state === 'none').length,
    selftest_only: rows.filter((r) => r.state === 'selftest_only').length,
  };
  const RATCHETS = [
    ['none', 'none_budget', '自己テストの無い検査',
      '**新しい検査は自己テスト付きで入れること**'],
    ['selftest_only', 'selftest_only_budget', '落ちるのを見ていない検査',
      '**壊して落ちるのを観測してから demonstrated にすること**'],
  ];
  for (const [state, key, label, advice] of RATCHETS) {
    const budget = doc[key];
    if (typeof budget !== 'number') { problems.push(`${key} が数でない`); continue; }
    if (counts[state] > budget) {
      problems.push(`${label}が ${counts[state]} 本で、上限 ${budget} を超えた。`
        + `${advice}（上限を上げて通さない）`);
    }
  }
  return problems;
}

export function summarize(doc) {
  const rows = doc?.checks ?? [];
  const by = {};
  for (const s of STATES) by[s] = rows.filter((r) => r.state === s).length;
  return {
    total: rows.length, by,
    none_budget: doc?.none_budget ?? null,
    selftest_only_budget: doc?.selftest_only_budget ?? null,
  };
}

export function render(doc) {
  const s = summarize(doc);
  const L = ['検査が落ちることを確かめた記録（data/check-selftests.json）', ''];
  L.push(`  CI 配線 ${s.total} 本`);
  L.push(`    落ちるのを見た           ${s.by.demonstrated}`);
  L.push(`    自己テストのみ（未観測） ${s.by.selftest_only}（上限 ${s.selftest_only_budget}）`);
  L.push(`    自己テスト無し           ${s.by.none}（上限 ${s.none_budget}）`);
  L.push('');
  const dem = (doc.checks ?? []).filter((r) => r.state === 'demonstrated');
  if (dem.length) {
    L.push('  落ちるのを見た検査:');
    for (const r of dem) L.push(`    ${r.script} — ${r.at} ${r.broke}`);
    L.push('');
  }
  L.push('  **「実装した」と「落ちるのを見た」を同じ語で呼ばない。**');
  L.push('  自己テストがあることは、落ちることの証明にならない');
  L.push('  （2026-08-26、規則を足したのに一度も発火しない検査を実際に踏んだ）。');
  return L.join('\n');
}

// ── 自己テスト（この検査自身が落ちることを固定する） ──────────────
const SCENARIOS = [
  ['CI が走らせているのに台帳に無ければ落ちる', () => {
    const p = validate({ checks: [], none_budget: 0, selftest_only_budget: 0 }, { wired: ['scripts/x.mjs'], gating: ['scripts/x.mjs'], exists: () => true });
    assert(p.some((x) => x.includes('台帳に無い')), p.join(' / '));
  }],
  ['台帳にあるのに CI が走らせていなければ落ちる', () => {
    const p = validate({ checks: [{ script: 'scripts/x.mjs', state: 'none' }], none_budget: 9, selftest_only_budget: 0 },
      { wired: [], gating: [], exists: () => true });
    assert(p.some((x) => x.includes('CI が走らせていない')), p.join(' / '));
  }],
  ['**demonstrated に証跡が無ければ落ちる**（誰でも「見た」と書けてしまう）', () => {
    const p = validate({ checks: [{ script: 'scripts/x.mjs', state: 'demonstrated' }], none_budget: 0, selftest_only_budget: 0 },
      { wired: ['scripts/x.mjs'], gating: ['scripts/x.mjs'], exists: () => true });
    assert(p.some((x) => x.includes('at（観測日）')), p.join(' / '));
    assert(p.some((x) => x.includes('broke')), p.join(' / '));
  }],
  ['**ラチェット: none が上限を超えたら落ちる**', () => {
    const rows = [{ script: 'a.mjs', state: 'none' }, { script: 'b.mjs', state: 'none' }];
    const opt = { wired: ['a.mjs', 'b.mjs'], gating: ['a.mjs', 'b.mjs'], exists: () => true };
    const doc = (n) => ({ checks: rows, none_budget: n, selftest_only_budget: 0 });
    assert(validate(doc(2), opt).length === 0, '上限ちょうどは通る');
    assert(validate(doc(1), opt).some((x) => x.includes('上限')), '超えたら落ちる');
  }],
  ['**ラチェット: selftest_only にも上限がある**（段を下ろしただけでは止める力は移らない）', () => {
    const rows = [{ script: 'a.mjs', state: 'selftest_only' },
      { script: 'b.mjs', state: 'selftest_only' }];
    const opt = { wired: ['a.mjs', 'b.mjs'], gating: ['a.mjs', 'b.mjs'], exists: () => true };
    const doc = (n) => ({ checks: rows, none_budget: 0, selftest_only_budget: n });
    assert(validate(doc(2), opt).length === 0, '上限ちょうどは通る');
    const over = validate(doc(1), opt);
    assert(over.some((x) => x.includes('落ちるのを見ていない検査')), over.join(' / '));
  }],
  ['**上限を書き忘れたら落ちる**（無ければ無制限、が一番危ない）', () => {
    const opt = { wired: [], gating: [], exists: () => true };
    assert(validate({ checks: [], none_budget: 0 }, opt)
      .some((x) => x.includes('selftest_only_budget が数でない')), 'selftest_only_budget の欠落');
    assert(validate({ checks: [], selftest_only_budget: 0 }, opt)
      .some((x) => x.includes('none_budget が数でない')), 'none_budget の欠落');
  }],
  ['知らない state は落ちる', () => {
    const p = validate({ checks: [{ script: 'a.mjs', state: 'たぶん大丈夫' }], none_budget: 0, selftest_only_budget: 0 },
      { wired: ['a.mjs'], gating: ['a.mjs'], exists: () => true });
    assert(p.some((x) => x.includes('知らない state')), p.join(' / '));
  }],
  ['state が demonstrated でないのに観測記録があれば落ちる', () => {
    const p = validate({ checks: [{ script: 'a.mjs', state: 'none', at: '2026-08-26' }], none_budget: 1, selftest_only_budget: 0 },
      { wired: ['a.mjs'], gating: ['a.mjs'], exists: () => true });
    assert(p.some((x) => x.includes('観測の記録がある')), p.join(' / '));
  }],
  // **拡張子で検査を見落とさない。**2026-09-03 まで `.mjs` しか拾っておらず、
  // `.js` の5本（主検査 seo-check.js を含む）がこの台帳の外にいた。
  // 緑を出しながら何も見ていない、という当台帳が狩っている形そのもの。
  ['**`.js` の検査も列挙する**（拡張子で見落とさない）', () => {
    const f = path.join(os.tmpdir(), `wired-${process.pid}.yml`);
    fs.writeFileSync(f, [
      '        run: node scripts/seo-check.js --selftest',
      '        run: node scripts/a.mjs --check',
      '        run: node growth/scripts/b.mjs --check',
      '        run: node scripts/c.js',
    ].join('\n'));
    try {
      const w = wiredChecks(f);
      assert(w.includes('scripts/seo-check.js'), `.js を落としている: ${w.join(',')}`);
      assert(w.includes('scripts/c.js'), `.js を落としている: ${w.join(',')}`);
      assert(w.includes('scripts/a.mjs') && w.includes('growth/scripts/b.mjs'), `.mjs を落とした: ${w.join(',')}`);
      // 同じ script を --selftest と本体で2回走らせても1本に畳む。
      assert(w.length === 4, `重複を畳めていない: ${w.join(',')}`);
    } finally {
      fs.rmSync(f, { force: true });
    }
  }],
  // ── 走ることと、落とせることは別 ─────────────────────────
  ['**`if:` の中の呼び出しは「落とせる」に数えない**', () => {
    const yml = tmpWorkflow([
      '      - name: x',
      "        if: github.ref == 'refs/heads/main'",
      '        run: node scripts/a.mjs --selftest',
    ]);
    assert(gatingChecks(yml).join() === '', gatingChecks(yml).join());
  }],
  ['**`continue-on-error: true` の下も数えない**（落ちても job は緑）', () => {
    const yml = tmpWorkflow([
      '      - name: x',
      '        run: node scripts/a.mjs --selftest',
      '        continue-on-error: true',
    ]);
    assert(gatingChecks(yml).join() === '', gatingChecks(yml).join());
  }],
  ['条件の付かないステップの呼び出しは数える', () => {
    const yml = tmpWorkflow(['      - name: x', '        run: node scripts/a.mjs --check']);
    assert(gatingChecks(yml).join() === 'scripts/a.mjs', gatingChecks(yml).join());
  }],
  ['落とせる呼び出しが1つでもあれば数に入る（条件付きが別にあってもよい）', () => {
    const yml = tmpWorkflow([
      '      - name: x',
      "        if: github.event_name == 'push'",
      '        run: node scripts/a.mjs --since 1',
      '      - name: y',
      '        run: node scripts/a.mjs --selftest',
    ]);
    assert(gatingChecks(yml).join() === 'scripts/a.mjs', gatingChecks(yml).join());
  }],
  ['`if:` は次のステップへ漏れない', () => {
    const yml = tmpWorkflow([
      '      - name: x',
      "        if: github.event_name == 'push'",
      '        run: node scripts/a.mjs',
      '      - name: y',
      '        run: node scripts/b.mjs',
    ]);
    assert(gatingChecks(yml).join() === 'scripts/b.mjs', gatingChecks(yml).join());
  }],
  ['**落とせるステップを持たない配線は落ちる**（2026-09-03 に indexnow が実際にそうだった）', () => {
    const p = validate({ checks: [{ script: 'a.mjs', state: 'demonstrated', at: '2026-09-03', broke: 'x' }],
      none_budget: 0, selftest_only_budget: 0 },
    { wired: ['a.mjs'], gating: [], exists: () => true });
    assert(p.some((x) => x.includes('落とせるステップが1つも無い')), p.join(' / '));
  }],
  ['実データ: 配線 91 本がすべて落とせるステップを持つ', () => {
    const missing = wiredChecks().filter((w) => !gatingChecks().includes(w));
    assert(missing.length === 0, missing.join(' / '));
  }],
  ['実データが検査を通る', () => {
    const p = validate(loadLedger());
    assert(p.length === 0, p.join(' / '));
  }],
];

function assert(cond, msg) { if (!cond) throw new Error(msg); }

/**
 * 検体のワークフローを一時ファイルへ書いて、そのパスを返す。
 * **リポジトリには置かない** —— 壊れた定義をリポジトリに残せば、いつか読まれる。
 */
function tmpWorkflow(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-selftests-'));
  const file = path.join(dir, 'wf.yml');
  fs.writeFileSync(file, ['jobs:', '  a:', '    steps:', ...lines, ''].join('\n'));
  return file;
}

function selftest() {
  let failed = 0;
  for (const [name, fn] of SCENARIOS) {
    try { fn(); console.log(`  ok   ${name}`); }
    catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
  }
  console.log(`\n  自己テスト ${SCENARIOS.length} 件中 ${failed} 件失敗`);
  return failed;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) process.exit(selftest() === 0 ? 0 : 1);

  if (argv.includes('--sync')) {
    const doc = loadLedger();
    const wired = wiredChecks();
    const byScript = new Map((doc.checks ?? []).map((r) => [r.script, r]));
    doc.checks = wired.map((s) => byScript.get(s) ?? {
      script: s,
      state: fs.readFileSync(path.join(ROOT, s), 'utf8').includes('--selftest') ? 'selftest_only' : 'none',
    });
    doc.checks.sort((a, b) => a.script.localeCompare(b.script));
    fs.writeFileSync(LEDGER_PATH, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`同期: ${doc.checks.length} 本`);
    process.exit(0);
  }

  const doc = loadLedger();
  console.log(render(doc));
  const problems = validate(doc);
  if (problems.length) {
    console.log('\n検査の自己テスト台帳: 不整合');
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  if (argv.includes('--check')) {
    if (selftest() !== 0) process.exit(1);
    console.log('\n列挙・証跡・ラチェットに問題なし。');
  }
}
