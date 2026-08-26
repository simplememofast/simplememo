#!/usr/bin/env node
/**
 * 権限表（data/authority-matrix.json）の整合をCIで見る。
 *
 *   node scripts/check-authority.mjs           # 表を出す
 *   node scripts/check-authority.mjs --check   # 不整合で exit 1
 *
 * 【機械が守れる部分だけ機械に守らせる】ここが見るのは3つだけ:
 *
 *   1. **不可逆な領域は承認制、または機械が強制するゲート**
 *      （reversible:false → requires_approval:true **or** 検査を満たす machine_gate）
 *      これが両方とも無い行は、権限表の一番の存在理由が壊れている。
 *      ゲートで承認を外す条件は gateProblems() を読むこと ——
 *      **「ゲートがあります」と書くだけでは外せない。**
 *   2. **active な領域は evidence を持つ**。そう運用されている根拠のファイルが
 *      実在すること。根拠を指せない「そうなっているはず」は、次に判断する人には
 *      存在しないのと同じ。
 *   3. **金額を伴う領域は threshold を持つ**。未設定なら `set_by: "unset"` と
 *      明示されていること。**空欄と「未設定と決めた」は違う。**
 *
 * 実際に人が承認したかは機械では見られない。そこは表の側に正直に書く。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MATRIX_PATH = path.join(ROOT, 'data/authority-matrix.json');

const STATUSES = ['active', 'suspended', 'not_implemented', 'policy_only'];
/** 金額が動く領域。threshold の有無を強制する。 */
const MONEY = ['AI実費（開発・運用のトークン費）', '広告出稿・広告予算の変更', '契約・支払い・送金',
               '価格・プラン・無料枠の変更',
               // [2026-08-25] Actions分数も金。トークン費に上限を書いておきながら、
               // **1日で$10を焼いた実績があるこちらだけ表に無かった。**
               'macOSランナーの起動（GitHub Actions 分数の消費）'];

/**
 * **不可逆な領域の例外 —— 機械が強制するゲート。**
 *
 * [2026-08-27] 元の規則は「不可逆 → 必ず承認制」の1本だった。
 * オーナーが App Store レビュー返信を「品質ゲート通過で自動投稿」に決めたので、
 * **不変条件を1条だけ広げる。**
 *
 *   不可逆 → 承認制 **または** 機械が強制するゲート
 *
 * 【広げ方を間違えると、これが抜け穴になる】
 * 「ゲートがあります」と1行書けば承認を外せる、では表の存在理由が消える。
 * だから**宣言ではなく検査可能な条件**にした。次を全部満たす行だけが例外になる:
 *
 *   checker            … 判定を実装したファイル。**実在すること**
 *   function           … その中の関数名。**本当に export されていること**
 *   kill_switch_path   … 止める場所（台帳のキー）
 *   daily_cap          … 正の数。無制限のゲートは例外に使えない
 *   holds_when_unknown … **true 必須。**材料が無いとき止まらないゲートは例外に使えない
 *
 * いちばん効くのは最後の2つと、**関数が実在するかを実際にソースで見る**ところ。
 * **表に書いただけで実装が無い**状態を通さない。
 */
export const GATE_REQUIRED = ['checker', 'function', 'kill_switch_path', 'daily_cap', 'holds_when_unknown'];

/** ゲートの体裁を見る。**満たさない理由を返す**（満たしていれば空配列）。 */
export function gateProblems(d, { exists, readSource } = {}) {
  const g = d.machine_gate;
  if (!g || typeof g !== 'object') {
    return ['machine_gate が無い — 承認を外すなら、何が止めるのかを機械が読める形で書く'];
  }
  const miss = GATE_REQUIRED.filter((k) => g[k] === undefined || g[k] === null || g[k] === '');
  if (miss.length) return [`machine_gate に ${miss.join(' / ')} が無い`];
  if (typeof g.daily_cap !== 'number' || !(g.daily_cap > 0)) {
    return ['machine_gate.daily_cap が正の数でない — **上限の無いゲートは例外に使えない**'];
  }
  if (g.holds_when_unknown !== true) {
    return ['machine_gate.holds_when_unknown が true でない'
      + ' — **材料が無いとき止まらないゲートは例外に使えない**'];
  }
  if (exists && !exists(g.checker)) {
    return [`machine_gate.checker「${g.checker}」が実在しない`];
  }
  if (readSource) {
    const src = readSource(g.checker);
    if (src !== null && !new RegExp(`export function ${g.function}\\b`).test(src)) {
      return [`${g.checker} が ${g.function} を export していない`
        + ' — **表に書いただけで実装が無い**'];
    }
  }
  return [];
}

export function validate(doc, {
  exists = (p) => fs.existsSync(path.join(ROOT, p)),
  readSource = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return null; } },
} = {}) {
  const problems = [];
  if (!doc || !Array.isArray(doc.domains)) return ['domains must be an array'];
  const seen = new Set();
  for (const d of doc.domains) {
    const at = `「${d.domain ?? '(no domain)'}」`;
    if (!d.domain) { problems.push('domain name is required'); continue; }
    if (seen.has(d.domain)) problems.push(`${at}: duplicate domain`);
    seen.add(d.domain);

    if (typeof d.reversible !== 'boolean') problems.push(`${at}: reversible must be boolean`);
    if (typeof d.requires_approval !== 'boolean') problems.push(`${at}: requires_approval must be boolean`);
    // 1. 不可逆なのに承認不要 = 権限表が壊れている
    if (d.reversible === false && d.requires_approval === false) {
      // **承認を外せるのは、機械が強制するゲートを持つ行だけ。**（上の注記）
      const gp = gateProblems(d, { exists, readSource });
      if (gp.length) {
        problems.push(`${at}: 不可逆（reversible:false）なのに requires_approval:false`
          + ` — 承認なしで取り返しがつかない変更ができることになる。${gp[0]}`);
      }
    }
    if (!STATUSES.includes(d.status)) {
      problems.push(`${at}: status must be one of ${STATUSES.join('|')} (got ${JSON.stringify(d.status)})`);
    }
    if (!d.gate) problems.push(`${at}: gate is required — 何がその境界を守っているのかを1行で書く`);

    // 2. active なら根拠のファイルが実在すること
    //
    // evidence は**配列**。1つの文字列に複数パスを詰めると分解できず、
    // 「実在するか」を機械が確かめられなくなる（最初の実装がそれで穴になった）。
    if (!Array.isArray(d.evidence)) {
      problems.push(`${at}: evidence must be an array of repo-relative paths`);
    } else if (d.status === 'active') {
      if (d.evidence.length === 0) {
        problems.push(`${at}: status=active なのに evidence が空 — 根拠を指せない運用は、次に判断する人には存在しない`);
      }
      for (const rel of d.evidence) {
        // 他リポジトリ（simplememo-ios / simplememo-api）のパスはこのCIから見えないので
        // 存在確認をしない。**確認できないものを確認したことにしない。**
        //
        // 表記が2通りある（`simplememo-api/...` と `../simplememo-api/...`）。
        // 素の形だけを見ていたため、`../` 付きで書いた行が「存在しない」として
        // CIを落とした（PR #530）。**表記ゆれで偽の失敗を出さない。**
        if (/^(\.\.\/)?simplememo-/.test(rel)) continue;
        if (!exists(rel)) problems.push(`${at}: evidence "${rel}" が存在しない`);
      }
    }

    // 3. 金額を伴う領域は threshold を持つ
    if (MONEY.includes(d.domain)) {
      if (!d.threshold) {
        problems.push(`${at}: 金額が動く領域なのに threshold が無い — 空欄と「未設定と決めた」は違う`);
      } else if (!('set_by' in d.threshold) && !('note' in d.threshold)) {
        problems.push(`${at}: threshold に set_by か note が要る（誰が決めた値か・未設定ならその旨）`);
      }
    }

    if (!Array.isArray(d.ai_may)) problems.push(`${at}: ai_may must be an array`);
    if (!Array.isArray(d.human_only)) problems.push(`${at}: human_only must be an array`);
    // AIが何もできず人間専任でもない領域は、書き漏れの可能性が高い
    if (d.status === 'active' && d.ai_may.length === 0 && d.human_only.length === 0) {
      problems.push(`${at}: active なのに ai_may も human_only も空 — 誰が何をするのか書けていない`);
    }
  }

  // --- レーンF（自己修復）の実効的な歯止め ------------------------------
  //
  // 自分のCIを自分で直す仕組みは、放っておくと必ず
  // 「通らないチェックを消して緑にする」に流れる。must_not に書くだけでは
  // 文章であって歯止めではないので、**実際に消えていないことをここで確かめる。**
  const sr = doc.self_repair;
  if (sr) {
    const wf = 'checks/seo-check';
    let seoYml = '';
    try { seoYml = fs.readFileSync(path.join(ROOT, '.github/workflows/seo-check.yml'), 'utf8'); }
    catch { problems.push('seo-check.yml が読めない — required_ci_checks を検証できない'); }
    for (const cmd of sr.required_ci_checks || []) {
      if (seoYml && !seoYml.includes(cmd)) {
        problems.push(`必須CIチェック "${cmd}" が seo-check.yml から消えている — 自己修復が検証を弱めた可能性がある（self_repair.must_not 違反）`);
      }
    }
    // 自分の権限を広げていないこと
    for (const f of sr.forbidden_permission_files || []) {
      let src = '';
      try { src = fs.readFileSync(path.join(ROOT, f), 'utf8'); }
      catch { problems.push(`forbidden_permission_files の "${f}" が読めない`); continue; }
      for (const perm of sr.forbidden_permissions || []) {
        // コメント行（#で始まる）での言及は許す — 「与えていない理由」を書くのは正しい
        const hit = src.split('\n').some((line) => !line.trim().startsWith('#') && line.includes(perm));
        if (hit) problems.push(`${f} に "${perm}" がある — 自己修復が自分の権限を広げた可能性がある（self_repair.must_not 違反）`);
      }
    }
    void wf;
  }
  return problems;
}

function render(doc) {
  const o = ['権限表 — 誰が何をどこまで決めてよいか', ''];
  const mark = (d) => d.status !== 'active' ? `[${d.status}]`
    : d.requires_approval ? '承認制' : 'AI自律';
  for (const d of doc.domains) {
    o.push(`  ${mark(d).padEnd(18)} ${d.reversible ? '可逆  ' : '不可逆'}  ${d.domain}`);
    if (d.human_only.length) o.push(`      人間のみ: ${d.human_only.join(' / ')}`);
    if (d.threshold && d.threshold.set_by === 'placeholder') {
      o.push('      ⚠ 上限が暫定値（オーナー未確認）');
    }
    if (d.threshold && d.threshold.set_by === 'unset') {
      o.push('      ⚠ 上限が未設定');
    }
  }
  const active = doc.domains.filter((d) => d.status === 'active').length;
  const approval = doc.domains.filter((d) => d.requires_approval).length;
  o.push('');
  o.push(`  ${doc.domains.length} 領域中 ${active} が稼働中・${approval} が承認制`);
  return o.join('\n');
}


// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
// 通ることだけ確かめる自己テストは、検査が何も見ていなくても緑になる。
// 壊し方は実データを複製して作る（固定フィクスチャだと台帳と形がずれても気づけない）。
/** ゲート付き例外を持つ行。**壊し方はここを狙う。** */
const gated = (d) => d.domains.find((x) => x.machine_gate);

const SELFTEST_BREAKAGES = [
  ['**不可逆なのに承認不要**は落ちる（承認なしで取り返しがつかない変更ができる）', (d) => { d.domains[0].reversible = false; d.domains[0].requires_approval = false; }],
  ['知らない status は落ちる', (d) => { d.domains[0].status = 'たぶん動いてる'; }],
  ['domain 名の重複は落ちる', (d) => { d.domains.push({ ...d.domains[0] }); }],
  ['reversible が真偽値でなければ落ちる', (d) => { d.domains[0].reversible = 'yes'; }],
  // ── ゲート付き例外が抜け穴にならないこと（2026-08-27） ──
  // **「ゲートがあります」と書くだけで承認を外せる**形にしていないかを固定する。
  ['**ゲートを消すと承認制に戻る**', (d) => { delete gated(d).machine_gate; }],
  ['**材料が無いとき止まらないゲート**は例外に使えない', (d) => { gated(d).machine_gate.holds_when_unknown = false; }],
  ['上限の無いゲートは例外に使えない', (d) => { gated(d).machine_gate.daily_cap = 0; }],
  ['実在しない checker を指すと落ちる', (d) => { gated(d).machine_gate.checker = 'scripts/nope.mjs'; }],
  ['**export していない関数名を指すと落ちる**（表に書いただけで実装が無い）',
   (d) => { gated(d).machine_gate.function = 'thisIsNotExported'; }],
  ['ゲートの必須欄が欠けると落ちる', (d) => { delete gated(d).machine_gate.kill_switch_path; }],
];
const SCENARIOS = ledgerScenarios(
  () => JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8')),
  (d) => validate(d),
  SELFTEST_BREAKAGES,
);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 ? 0 : 1);
  const doc = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));
  const problems = validate(doc);
  console.log(render(doc));
  if (problems.length) {
    console.error('\n権限表の不整合:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    if (run(SCENARIOS) !== 0) process.exit(1);
    console.log('\n権限表の整合に問題なし。');
  }
}
