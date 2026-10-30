#!/usr/bin/env node
/**
 * 資格情報の権限・経路・失効手順 — 「止めたいときに、どれを失効させるか」に答えられるか。
 *
 *   node scripts/check-credentials.mjs          # 一覧
 *   node scripts/check-credentials.mjs --check  # CI
 *   node scripts/check-credentials.mjs --stop <経路>   # その経路を止める鍵を出す
 *
 * 【なぜ作るか】
 * 緊急停止の台帳には、この仕組みの外にある最後の手段として
 * **「credential-expiry.json に載っている鍵を無効化する」**と書いてあった。
 * ところが 2026-08-22 に数えたら、ワークフローが実際に使っている secret 11件のうち
 * **台帳にあったのは3件だけ**で、主系を止める鍵（GH_PAT）が入っていなかった。
 * つまり最後の手段が指す先が空だった。**平常時には何の症状も出ない穴。**
 *
 * だから見るのは、期限（それは check-expiry.mjs の仕事）ではなく次の5つ:
 *   1. ワークフローが読む secret が全部台帳にあるか（新しい経路が増えたときに漏れる）
 *   2. 鍵ごとに**失効のさせ方**と**失効させると何が止まるか**が書いてあるか
 *   3. 経路（emergency-stop.json の agents）ごとに、止められる鍵が1つ以上あるか
 *   4. 「自動運転を止める」と名乗る鍵が実在するか
 *   5. secret を**名前で1つずつ**読んでいるか（2026-10-30・セキュリティ監査 F6 の残り）。
 *      `${{ toJSON(secrets) }}`・`secrets[…]`・`${{ secrets }}`・`secrets: inherit` は名前を
 *      書かずに全部を渡すので、1 の台帳もモデルのジョブの検査もすり抜ける。モデルのジョブでは
 *      例外なく落とし、それ以外のジョブは台帳の `$bulk_secret_access`（workflow・job・reason）に
 *      書いたものだけを通す。規則は scripts/lib/workflow-secrets.mjs。
 *
 * 【renewal と revocation は別物】
 * 更新手順があることは、失効手順があることを意味しない。急いでいるときに
 * 「どこを押せば止まるか」が書いていない台帳は、読む時間のほうが長くなる。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';
import { bulkSecretFindings, bulkSecretProblems, inspectWorkflows, workflowJobs } from './lib/workflow-secrets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CRED_PATH = path.join(ROOT, 'data/credential-expiry.json');
const STOP_PATH = path.join(ROOT, 'data/emergency-stop.json');
const WF_DIRS = [
  path.join(ROOT, '.github/workflows'),
  path.join(ROOT, '../simplememo-ios/.github/workflows'),
  path.join(ROOT, '../simplememo-api/.github/workflows'),
];

/** ワークフローが実際に読んでいる secret 名を集める。台帳ではなく**現物**から。 */
export function secretsInUse(dirs = WF_DIRS, { required = false } = {}) {
  const found = new Map(); // name -> [file]
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      if (required) throw new Error(`検査対象が存在しない: ${dir}`);
      continue;
    }
    const files = fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x));
    if (required && files.length === 0) throw new Error(`検査対象にワークフローが無い: ${dir}`);
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const m of src.matchAll(/secrets(?:\.([A-Z0-9_]+)|\[\s*['"]([A-Z0-9_]+)['"]\s*\])/g)) {
        const name = m[1] || m[2];
        const list = found.get(name) || [];
        if (!list.includes(f)) list.push(f);
        found.set(name, list);
      }
    }
  }
  return found;
}

const readWorkflows = (dir) => fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x))
  .map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));

/** 名前を書かずに secret を読む箇所（5）。ディレクトリごとに読む（呼び先の解決は同じディレクトリの中）。 */
export function bulkSecretsInUse(dirs = WF_DIRS) {
  return dirs.filter((dir) => fs.existsSync(dir)).flatMap((dir) => bulkSecretFindings(readWorkflows(dir)));
}

/** 台帳が申告している secret 名（1件が複数を束ねることがある）。 */
export function declaredSecrets(doc) {
  const out = new Map();
  for (const c of doc.credentials || []) {
    for (const name of String(c.secret || '').split('/').map((s) => s.trim()).filter(Boolean)) {
      out.set(name, c.id);
    }
  }
  return out;
}

export function validate(doc, stopDoc, inUse) {
  const problems = [];
  const declared = declaredSecrets(doc);
  const exempt = Object.keys(doc.$exempt_secrets || {});

  // 1. 現物にあって台帳に無い secret
  for (const [name, files] of inUse) {
    if (exempt.includes(name) || declared.has(name)) continue;
    problems.push(`secret ${name} をワークフローが読んでいるのに台帳に無い（${files.join(', ')}）`
      + ' — **止めたいときに、その鍵の存在に気づけない**');
  }
  // 台帳にあって現物に無いものは落とさない（Workers の secret など、
  // ワークフロー以外から使う鍵が正当に存在する）。ただし数えて出す。

  // 2. 失効手順と影響範囲
  for (const c of doc.credentials || []) {
    if (!c.revocation) {
      problems.push(`${c.id}: revocation が無い — 更新手順（renewal）は失効手順ではない`);
    }
    if (!c.blast_radius) {
      problems.push(`${c.id}: blast_radius が無い — **止める前に何が止まるかを読めない台帳は、急いでいるときに読まれない**`);
    }
    for (const a of c.agents || []) {
      if (!stopDoc.agents?.[a]) {
        problems.push(`${c.id}: 経路 "${a}" が emergency-stop.json に無い — 台帳どうしが食い違っている`);
      }
    }
  }

  // 3. 経路ごとに止められる鍵があるか
  const routes = Object.keys(stopDoc.agents || {}).filter((k) => !k.startsWith('$'));
  for (const r of routes) {
    const keys = (doc.credentials || []).filter((c) => (c.agents || []).includes(r));
    if (!keys.length) {
      problems.push(`経路 "${r}" を止められる鍵が台帳に1つも無い`
        + ' — 判定が壊れているときの最後の手段が、この経路には存在しないことになる');
    }
  }

  // 4. 「自動運転を止める」と名乗る鍵が実在するか
  const stoppers = (doc.credentials || []).filter((c) => c.revoke_stops_automation);
  if (!stoppers.length) {
    problems.push('revoke_stops_automation の鍵が1件も無い'
      + ' — 緊急停止の台帳が書いている**最後の手段が指す先が空**');
  }
  return problems;
}


// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const SELFTEST_BREAKAGES = [
  ['**失効手順が無い**のは落ちる（更新手順は失効手順ではない）', (d) => { delete d.credentials[0].revocation; }],
  ['**止めたとき何が止まるかが無い**のは落ちる', (d) => { delete d.credentials[0].blast_radius; }],
  ['emergency-stop に無い経路を名乗ったら落ちる', (d) => { d.credentials[0].agents = ['そんな経路は無い']; }],
];
const SCENARIOS = ledgerScenarios(
  () => JSON.parse(fs.readFileSync(CRED_PATH, 'utf8')),
  (d) => validate(d, JSON.parse(fs.readFileSync(STOP_PATH, 'utf8')), secretsInUse()),
  SELFTEST_BREAKAGES,
);

SCENARIOS.push(['明示した検査対象の欠落・空ディレクトリは成功にしない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'credential-scan-'));
  try {
    for (const target of [path.join(dir, 'missing'), dir]) {
      let rejected = false;
      try { secretsInUse([target], { required: true }); } catch { rejected = true; }
      assert(rejected, '検査対象なしを成功にした');
    }
    fs.writeFileSync(path.join(dir, 'test.yml'), "token: ${{ secrets.NEW_UNREGISTERED_KEY }}\nother: ${{ secrets['BRACKET_KEY'] }}\n");
    const found = secretsInUse([dir], { required: true });
    assert(found.has('NEW_UNREGISTERED_KEY') && found.has('BRACKET_KEY'), '実物のsecretを収集できない');
    const doc = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
    const stop = JSON.parse(fs.readFileSync(STOP_PATH, 'utf8'));
    assert(validate(doc, stop, found).some(p => p.includes('NEW_UNREGISTERED_KEY')), '未登録secretで落ちない');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}]);

// ── 5. 名前で読まない secret（監査 F6 の残り）──────────────────────
// 検体は obsidian-autopilot.yml の形（モデルの無い collect → モデルのジョブ → 再利用ワークフローの
// 呼び出し）を縮めたもの。sibling リポジトリの CI はこのファイルを .github 無しで動かすので、
// 実物のワークフローを使う検体は、実物があるときだけ足す（下）。
const BULK_FIXTURE = {
  'fixture.yml': [
    'name: fixture',
    'on:',
    '  workflow_dispatch:',
    'permissions: {}',
    'env:',
    "  PLAIN: 'secrets are named one by one'",
    'jobs:',
    '  collect:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - name: Collect',
    '        env:',
    '          GOOGLE_SERVICE_ACCOUNT_JSON: ${{ secrets.GCP_SERVICE_ACCOUNT_JSON }}',
    '        run: node scripts/autopilot-data.mjs --digest "$RUNNER_TEMP/gsc-digest"',
    '  autopilot:',
    '    needs: collect',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - name: Gate',
    '        id: gate',
    "        if: always() && steps.secrets.outputs.ok != 'secrets'",
    "        run: echo \"${{ format('{0}', 'secrets') }}\"",
    '      - name: Claude Code',
    '        id: claude',
    '        uses: anthropics/claude-code-action@925afb53776cf1a2b738c6bdbed37b4d4000ef13',
    '        env:',
    '          GH_TOKEN: ${{ github.token }}',
    '        with:',
    '          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}',
    "          github_token: ${{ secrets['GITHUB_TOKEN'] }}",
    '  call:',
    '    uses: ./.github/workflows/callee.yml',
    '    secrets: inherit',
    '',
  ].join('\n'),
  'callee.yml': [
    'on:',
    '  workflow_call:',
    'jobs:',
    '  publish:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - run: echo publish',
    '        env:',
    '          TOKEN: ${{ secrets.GH_PAT }}',
    '',
  ].join('\n'),
};
const bulkFiles = (edit = (files) => files) => Object.entries(edit({ ...BULK_FIXTURE })).map(([name, text]) => ({ name, text }));
const MODEL_SECRET = '${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}';
const inModel = (form) => (f) => ({ ...f, 'fixture.yml': f['fixture.yml'].replace(MODEL_SECRET, form) });
/** モデルのジョブ（autopilot）に入れたら、例外を書いても落ちなければならない形。 */
const BULK_BREAKAGES = [
  ['toJSON(secrets) を経由して名前を引く', inModel('${{ fromJSON(toJSON(secrets)).CLAUDE_CODE_OAUTH_TOKEN }}')],
  ['関数名の大文字小文字を変えた toJson(secrets)', inModel('${{ toJson(secrets) }}')],
  ['${{ secrets }} そのもの', inModel('${{ secrets }}')],
  ['format で作った添字 secrets[format(…)]', inModel("${{ secrets[format('{0}_TOKEN', 'CLAUDE_CODE_OAUTH')] }}")],
  ['変数の添字 secrets[env.NAME]', inModel('${{ secrets[env.NAME] }}')],
  ['全部を並べる secrets.*', inModel("${{ join(secrets.*, ',') }}")],
  ['文脈名の大文字 SECRETS.NAME（大文字小文字を区別する名前の検査をすり抜ける）', inModel('${{ SECRETS.CLAUDE_CODE_OAUTH_TOKEN }}')],
  ['名前の小文字 secrets.name（同上）', inModel('${{ secrets.claude_code_oauth_token }}')],
  ['YAML の二重引用符のエスケープ（\\x73ecrets）', inModel('"${{ toJSON(\\x73ecrets) }}"')],
  ['YAML の行継ぎ（行末の \\）で分けた字面', inModel('"${{ toJSON(sec\\\n            rets) }}"')],
  ["YAML の単引用符の '' で式の中に '}}' を作る（切り出しが途中で止まる）",
    inModel("'${{ ''}}'' && fromJSON(toJSON(secrets)).CLAUDE_CODE_OAUTH_TOKEN }}'")],
  ["format の書式に '}}' を入れる（同上）", inModel("'${{ format(''{0}}}'', toJSON(secrets)) }}'")],
  ["単引用符の値を折り返して、secrets を ${{ の無い行に置く", inModel("'${{ ''}}''\n            && toJSON(secrets) }}'")],
  ['複数行の式', (f) => ({ ...f, 'fixture.yml': f['fixture.yml'].replace('id: claude\n',
    'id: claude\n        run: |\n          echo "${{\n            toJSON(secrets)\n          }}"\n') })],
  ['if: の式（${{ }} なし）', (f) => ({ ...f, 'fixture.yml': f['fixture.yml'].replace('id: claude\n',
    "id: claude\n        if: contains(toJSON(secrets), 'x')\n") })],
  ['run: の中の # の行（GitHub はシェルより先に式を展開する）', (f) => ({ ...f, 'fixture.yml': f['fixture.yml'].replace('id: claude\n',
    'id: claude\n        run: |\n          # ${{ toJSON(secrets) }}\n') })],
  ['ワークフロー全体の env（モデルのジョブにも効く）', (f) => ({ ...f, 'fixture.yml': f['fixture.yml'].replace("env:\n  PLAIN:",
    'env:\n  ALL: ${{ toJSON(secrets) }}\n  PLAIN:') })],
  ['secrets: inherit でモデルを動かす呼び先へ渡す', (f) => ({ ...f, 'callee.yml': f['callee.yml'].replace('      - run: echo publish',
    '      - uses: anthropics/claude-code-action@925afb53776cf1a2b738c6bdbed37b4d4000ef13') })],
  ['secrets: inherit で中身を確かめられない外の呼び先へ渡す', (f) => ({ ...f, 'fixture.yml': f['fixture.yml'].replace(
    'uses: ./.github/workflows/callee.yml', 'uses: example/repo/.github/workflows/x.yml@0123456789abcdef0123456789abcdef01234567') })],
];
const ALLOW_MODEL = [{ workflow: 'fixture.yml', job: 'autopilot', reason: '検体' }, { workflow: 'fixture.yml', job: '(workflow)', reason: '検体' },
  { workflow: 'fixture.yml', job: 'call', reason: '検体' }];

SCENARIOS.push(['名前で1つずつ読む検体は通る（文字列の中の secrets・steps.secrets・secrets[\'NAME\']・モデルの無い呼び先への inherit）', () => {
  const findings = bulkSecretFindings(bulkFiles());
  assert(findings.length === 0 && bulkSecretProblems(findings).length === 0, `誤検出: ${JSON.stringify(findings)}`);
  const { jobs } = inspectWorkflows(bulkFiles());
  const model = jobs.filter((j) => j.model).map((j) => `${j.file}#${j.id}`);
  assert(model.join(',') === 'fixture.yml#autopilot', `モデルのジョブの判定が違う: ${model}`);
}]);
SCENARIOS.push(['モデルの無いジョブの説明文の「, secrets,」は拾わない（字面の拾い直しはモデルの範囲だけ）', () => {
  const findings = bulkSecretFindings(bulkFiles((f) => ({ ...f, 'fixture.yml': f['fixture.yml'].replace(
    '        run: node scripts/autopilot-data.mjs', "        env:\n          NOTE: 'No send, secrets, adoption or billing'\n        run: node scripts/autopilot-data.mjs") })));
  assert(findings.length === 0, `誤検出: ${JSON.stringify(findings)}`);
}]);
for (const [name, edit] of BULK_BREAKAGES) {
  SCENARIOS.push([`**モデルのジョブで落ちる（例外を書いても）**: ${name}`, () => {
    const findings = bulkSecretFindings(bulkFiles(edit));
    assert(findings.length > 0, '見つけられない');
    assert(findings.every((f) => f.model), `モデルのジョブと判定していない: ${JSON.stringify(findings)}`);
    assert(bulkSecretProblems(findings, ALLOW_MODEL).length > 0, '例外の台帳で通ってしまう');
  }]);
}
SCENARIOS.push(['モデルの無いジョブは、理由つきの例外があるときだけ通る', () => {
  const findings = bulkSecretFindings(bulkFiles((f) => ({ ...f, 'fixture.yml': f['fixture.yml'].replace(
    '${{ secrets.GCP_SERVICE_ACCOUNT_JSON }}', '${{ toJSON(secrets) }}') })));
  assert(findings.length === 1 && findings[0].job === 'collect' && !findings[0].model, JSON.stringify(findings));
  assert(bulkSecretProblems(findings).length === 1, '例外なしで通ってしまう');
  assert(bulkSecretProblems(findings, [{ workflow: 'fixture.yml', job: 'collect', reason: '名前の一覧を出すだけ' }]).length === 0, '例外が効かない');
  assert(bulkSecretProblems(findings, [{ workflow: 'fixture.yml', job: 'collect' }]).length === 2, '理由の無い例外で通ってしまう');
  assert(bulkSecretProblems(findings, [{ workflow: 'fixture.yml', job: 'autopilot', reason: '別のジョブ' }]).length === 1, '別のジョブの例外で通ってしまう');
  assert(bulkSecretProblems(findings, { workflow: 'fixture.yml' }).length > 0, '配列でない台帳を黙って読む');
}]);
SCENARIOS.push(['呼び先がモデルを動かすなら、呼ぶ側のジョブもモデルのジョブとして扱う', () => {
  const edited = bulkFiles((f) => ({
    'fixture.yml': f['fixture.yml'].replace('    secrets: inherit\n', '    secrets:\n      ALL: ${{ toJSON(secrets) }}\n'),
    'callee.yml': f['callee.yml'].replace('TOKEN: ${{ secrets.GH_PAT }}', 'CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}'),
  }));
  const findings = bulkSecretFindings(edited);
  assert(findings.length === 1 && findings[0].job === 'call' && findings[0].model, JSON.stringify(findings));
  assert(bulkSecretProblems(findings, ALLOW_MODEL).length === 1, '例外の台帳で通ってしまう');
}]);

// 実物のワークフロー（このリポジトリで走らせたときだけ）: 全部のモデルのジョブに足すと落ちる。
const OWN_WORKFLOWS = WF_DIRS[0];
if (fs.existsSync(path.join(OWN_WORKFLOWS, 'obsidian-autopilot.yml'))) {
  SCENARIOS.push(['実物: 全部のモデルのジョブに toJSON(secrets) を足すと、それぞれ落ちる（例外を書いても）', () => {
    const files = readWorkflows(OWN_WORKFLOWS);
    const { findings, jobs } = inspectWorkflows(files);
    assert(findings.length === 0, `実物に名前で読まない箇所がある: ${JSON.stringify(findings)}`);
    const model = jobs.filter((j) => j.model);
    const named = model.map((j) => `${j.file}#${j.id}`);
    assert(named.includes('obsidian-autopilot.yml#autopilot') && named.includes('devlog-syndication-platform.yml#draft'),
      `モデルのジョブを見落としている: ${named.join(', ')}`);
    assert(!named.includes('obsidian-autopilot.yml#collect') && !named.includes('obsidian-autopilot.yml#publish'),
      `モデルの無いジョブをモデルのジョブにしている: ${named.join(', ')}`);
    for (const target of model) {
      const mutated = files.map((file) => {
        if (file.name !== target.file) return file;
        const job = workflowJobs(file.text).find((j) => j.id === target.id);
        const head = file.text.indexOf('\n', job.start) + 1;
        const pad = ' '.repeat(job.indent + 2);
        return { ...file, text: `${file.text.slice(0, head)}${pad}env:\n${pad}  BULK: \${{ toJSON(secrets) }}\n${file.text.slice(head)}` };
      });
      const hit = bulkSecretFindings(mutated);
      assert(hit.length === 1 && hit[0].file === target.file && hit[0].job === target.id && hit[0].model,
        `${target.file}#${target.id} に足しても見つけられない: ${JSON.stringify(hit)}`);
      assert(bulkSecretProblems(hit, [{ workflow: target.file, job: target.id, reason: '検体' }]).length === 1,
        `${target.file}#${target.id} が例外の台帳で通ってしまう`);
    }
  }]);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 ? 0 : 1);
  const doc = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  const stopDoc = JSON.parse(fs.readFileSync(STOP_PATH, 'utf8'));
  const dirAt = process.argv.indexOf('--workflow-dir');
  if (dirAt !== -1 && (!process.argv[dirAt + 1] || process.argv[dirAt + 1].startsWith('--'))) {
    console.error('--workflow-dir requires a directory'); process.exit(1);
  }
  const dirs = dirAt === -1 ? WF_DIRS : [path.resolve(process.argv[dirAt + 1])];
  const inUse = secretsInUse(dirs, { required: dirAt !== -1 });
  console.log(`検査対象: ${dirs.filter(d => fs.existsSync(d)).join(', ')}`);
  for (const dir of dirs.filter(d => !fs.existsSync(d))) console.log(`未検査（別リポジトリのCIで検査）: ${dir}`);

  const stopAt = process.argv.indexOf('--stop');
  if (stopAt !== -1) {
    const route = process.argv[stopAt + 1];
    const keys = doc.credentials.filter((c) => (c.agents || []).includes(route));
    if (!keys.length) { console.error(`経路 "${route}" を止められる鍵が台帳に無い`); process.exit(1); }
    console.log(`経路 "${route}" を止める鍵:\n`);
    for (const c of keys) {
      console.log(`  ${c.label}${c.secret ? `（${c.secret}）` : ''}`);
      console.log(`    失効: ${c.revocation}`);
      console.log(`    影響: ${c.blast_radius}\n`);
    }
    console.log('**これは最後の手段。**まず data/emergency-stop.json を立てるほうが速く、意図が残る。');
    process.exit(0);
  }

  const problems = validate(doc, stopDoc, inUse);
  const bulk = bulkSecretsInUse(dirs);
  problems.push(...bulkSecretProblems(bulk, doc.$bulk_secret_access));
  const declared = declaredSecrets(doc);
  console.log('資格情報 — 権限・経路・失効手順\n');
  console.log(`  ワークフローが読む secret ${inUse.size}件 / 台帳が申告 ${declared.size}件`
    + ` / 対象外 ${Object.keys(doc.$exempt_secrets || {}).length}件`);
  console.log(`  名前を書かずに secret を読む箇所 ${bulk.length}件`
    + `（モデルのジョブ ${bulk.filter((f) => f.model).length}件 / 台帳の例外 ${Array.isArray(doc.$bulk_secret_access) ? doc.$bulk_secret_access.length : 0}件）\n`);
  for (const c of doc.credentials) {
    const routes = (c.agents || []).length ? (c.agents || []).join(',') : '—';
    const stops = c.revoke_stops_automation ? ' ⛔止まる' : '';
    console.log(`  ${c.critical ? '★' : ' '} ${c.id.padEnd(28)} 経路:${routes}${stops}`);
  }
  console.log('\n  自動運転を止められる鍵:');
  for (const c of doc.credentials.filter((x) => x.revoke_stops_automation)) {
    console.log(`    ${c.label} — ${c.blast_radius}`);
  }
  console.log('\n  経路ごとに `--stop <経路>` で失効手順が出る。');
  console.log('  **ただし最後の手段。**緊急停止の台帳を立てるほうが速く、意図が残る。');

  if (problems.length) {
    console.error('\n資格情報の台帳: 穴');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    if (run(SCENARIOS) !== 0) process.exit(1);
    console.log('\n止めたい経路ごとに、失効させる鍵が名指しできる。');
  }
}
