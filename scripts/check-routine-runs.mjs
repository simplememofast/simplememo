#!/usr/bin/env node
/**
 * **副系（スケジュール起動セッション）が走ったかを、外から確かめる。**
 *
 *   node scripts/check-routine-runs.mjs           # 表示
 *   node scripts/check-routine-runs.mjs --check   # CI
 *   node scripts/check-routine-runs.mjs --selftest
 *   node scripts/check-routine-runs.mjs --sync <list_triggers の生JSON>   # 写しを取り直す
 *
 * 【台帳の「構造的に不可」は半分だけ正しかった】
 * `data/automation-coverage.json` の ⑩「実行の完全記録（副系）」は
 * 「スケジュール起動セッションのログが外部から読めない。構造的に不可」と
 * 書いてあった。**セッションの中身については正しい。走ったかどうかは誤り。**
 * Routines API の `last_run` が status / fired_at / finished_at を返す。
 *
 * 【主系と副系で、記録の完結し方が違う】
 *   主系（GitHub Actions） … run を全部列挙できる。**記録が完結する**
 *   副系（セッション）      … セッションが**自分で書いたときだけ**行が残る
 *                            （autopilot-runs.json の source:session）
 *
 * **書かずに死んだ回は、どこにも現れない。**だから自己申告だけでは
 * 「完全な記録」にならない。**外から発火を列挙して突き合わせる**のがここ。
 *
 * 【止まっていることは、静かに起きる】
 * 2026-08-28 に初めて読んだら、その場で4件見つかった ——
 * 副系A/Bが2日以上停止、週次2本が4日前から失敗のまま。
 * どれも**次の発火まで誰も気づかない**形だった。
 *
 * 【緩めない仕掛け】
 *   - 写しの鮮度を検査する（古い写しを緑にすると「読めているつもり」で止まる）
 *   - 健全でない routine は open_findings か intentional_stops のどちらかに必ず居る
 *   - open_findings の件数は open_budget を超えられない（**新しい停止で赤くなる**）
 *   - 直った routine が open_findings に残っていても落とす（**記録が実体と合わなくなる**）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, broken, run } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/routine-runs.json');

const DAY = 86_400_000;
/** 発火予定をこれだけ過ぎたら「止まっている」。cron の揺れと写しの遅れを吸収する。 */
export const OVERDUE_GRACE_HOURS = 6;

/**
 * 1つの routine の健全性。**純関数。**
 * 返すのは `null`（健全）か、`what`（何が起きているか）。
 */
export function diagnose(r, { now }) {
  if (!r || typeof r !== 'object') return 'malformed';
  if (r.enabled !== true) return 'stopped';
  if (r.last_run_status === 'FAILED') return 'failed';
  // 予定を過ぎているのに発火していない。**PENDING は走っている最中なので健全。**
  if (typeof r.next_run_at === 'string') {
    const due = Date.parse(r.next_run_at);
    if (Number.isFinite(due) && now - due > OVERDUE_GRACE_HOURS * 3600 * 1000) return 'overdue';
  }
  // 一度も走っていない。**一度だけの routine（run_once_at）は、まだ発火して
  // いないのが正常。**逆に cron の有無で分けると、cron_expression が欠けた行で
  // この規則ごと消える（check-guard-shapes に捕まった形）。
  // **「一度だけだと分かっているとき以外は cron 扱い」**にして閉じる側へ倒す。
  const isOneShot = typeof r.run_once_at === 'string' && r.run_once_at !== '';
  if (!isOneShot && !r.last_run_status) return 'never_ran';
  return null;
}

export function validate(doc, { now = Date.now() } = {}) {
  const problems = [];
  const warnings = [];

  if (!doc || typeof doc !== 'object') return { problems: ['台帳が読めない'], warnings };
  if (!Array.isArray(doc.routines)) return { problems: ['routines が配列でない'], warnings };

  // --- 写しの鮮度。**古い写しを緑にすると「読めているつもり」で止まる** ---
  const maxAge = doc.max_snapshot_age_days;
  if (typeof maxAge !== 'number' || !(maxAge > 0)) {
    problems.push('max_snapshot_age_days が正の数でない — **上限の無い鮮度は鮮度ではない**');
  } else {
    const observed = Date.parse(doc.observed_at ?? '');
    if (!Number.isFinite(observed)) {
      problems.push('observed_at が読めない — **いつ読んだ写しか分からないものを検査に使わない**');
    } else if (now - observed > maxAge * DAY) {
      const days = ((now - observed) / DAY).toFixed(1);
      problems.push(`写しが ${days} 日前で古い（上限 ${maxAge} 日）`
        + ' — **セッションが list_triggers を取り直すこと。**CIからは叩けない');
    }
  }

  const open = Array.isArray(doc.open_findings) ? doc.open_findings : [];
  const intentional = Array.isArray(doc.intentional_stops) ? doc.intentional_stops : [];
  if (!Array.isArray(doc.open_findings)) problems.push('open_findings が配列でない');
  if (!Array.isArray(doc.intentional_stops)) problems.push('intentional_stops が配列でない');

  for (const [i, f] of open.entries()) {
    for (const k of ['id', 'what', 'found_at', 'why']) {
      if (!f?.[k]) problems.push(`open_findings[${i}]: ${k} が無い — **理由の無い記録は、次に読む人には存在しない**`);
    }
  }
  for (const [i, f] of intentional.entries()) {
    for (const k of ['id', 'why']) {
      if (!f?.[k]) problems.push(`intentional_stops[${i}]: ${k} が無い — **「止めてよい」は理由とセット**`);
    }
  }

  const openIds = new Set(open.map((f) => f.id));
  const intentionalIds = new Set(intentional.map((f) => f.id));
  const both = [...openIds].filter((id) => intentionalIds.has(id));
  for (const id of both) problems.push(`${id} が open_findings と intentional_stops の両方に居る`);

  // --- 実体との突き合わせ ---
  const unhealthy = [];
  for (const r of doc.routines) {
    const what = diagnose(r, { now });
    if (!what) continue;
    unhealthy.push({ id: r.id, name: r.name, what });
    if (!openIds.has(r.id) && !intentionalIds.has(r.id)) {
      problems.push(`「${r.name}」が ${what} なのに、どちらの一覧にも無い`
        + ' — **黙って止まったものを通さない。**理由を書いて open_findings へ');
    }
  }

  const unhealthyIds = new Set(unhealthy.map((u) => u.id));
  for (const f of open) {
    if (!unhealthyIds.has(f.id)) {
      problems.push(`open_findings の ${f.id} は健全になっている`
        + ' — **直ったのに記録に残っている。**行を消して open_budget も下げる');
    }
  }
  for (const f of intentional) {
    if (!unhealthyIds.has(f.id)) {
      problems.push(`intentional_stops の ${f.id} は動いている`
        + ' — **止めたはずのものが走っている。**どちらが意図か確かめる');
    }
  }

  // --- ラチェット ---
  const budget = doc.open_budget;
  if (typeof budget !== 'number' || budget < 0) {
    problems.push('open_budget が数でない — **上限を書き忘れたら無制限になる**');
  } else if (open.length !== budget) {
    // **余裕を持たせない。**`>` だけを見ると、上限を先に上げておけば
    // 次に止まったものが黙って通る（この検査を壊して確かめたときに開いていた穴）。
    // 一致を要求すると、上限の変更は必ず findings の変更と同じ差分になり、
    // **理由の書かれた1行を足さずに枠だけ広げることができない。**
    problems.push(open.length > budget
      ? `未対応が ${open.length} 件で上限 ${budget} を超えた`
        + ' — **新しく止まったものがある。**上限を上げるだけで通さない'
      : `未対応が ${open.length} 件なのに上限が ${budget}`
        + ' — **枠が余っている。**直したなら同じPRで open_budget を下げる'
        + '（余った枠は、次に止まったものを黙って飲み込む）');
  }

  return { problems, warnings, unhealthy };
}

/**
 * `list_triggers` の生応答から、写しに残す形へ落とす。**純関数。**
 *
 * **プロンプト（job_config / derived_state.prompt）は写さない。**
 * 副系のプロンプトには運用の中身がそのまま入っていて、この台帳が要るのは
 * 「走ったか」だけ。**要らないものを持つと、置き場所の判断が別の問題になる。**
 */
export function normalizeRoutines(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data
    : Array.isArray(payload?.triggers) ? payload.triggers
    : Array.isArray(payload) ? payload : null;
  if (!rows) return null;
  return rows.map((t) => {
    const lr = t.last_run ?? {};
    return {
      id: t.id ?? null,
      name: t.name ?? null,
      cron_expression: t.cron_expression ?? null,
      run_once_at: t.run_once_at ?? null,
      enabled: Boolean(t.enabled),
      bound_session: Boolean(t.persistent_session_id),
      next_run_at: t.next_run_at ?? null,
      last_fired_at: t.last_fired_at ?? null,
      last_run_status: (lr.status ?? '').replace('ROUTINE_RUN_STATUS_', '') || null,
      last_run_fired_at: lr.fired_at ?? null,
      last_run_finished_at: lr.finished_at ?? null,
    };
  }).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/**
 * 写しを差し替える。**判断（open_findings / intentional_stops / budget）は
 * 触らない** —— 取り直しで異常が消えたり増えたりしたら、`--check` が
 * 「どちらの一覧にも無い」「健全になっている」で落として人に書かせる。
 * **取り直しが判断を上書きすると、この台帳は現状を追認する表になる。**
 */
export function applySync(doc, payload, { now = new Date() } = {}) {
  const routines = normalizeRoutines(payload);
  if (!routines) return null;
  return { ...doc, observed_at: now.toISOString().replace(/\.\d+Z$/, 'Z'), routines };
}

// ============================================================

function selftest() {
  const real = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const NOW = Date.parse('2026-08-28T00:30:00Z');
  const V = (d) => validate(d, { now: NOW });

  const scenarios = [
    ['実データが検査を通る', () => {
      const { problems } = V(real);
      assert(problems.length === 0, problems.join(' / '));
    }],
    // [2026-08-28] 5件 → 6件。**写しを取り直したら1本増えた** ——
    // Routines UI で作った「副系の写しの取り直し」が止まっていて、
    // どちらの一覧にも入っていなかった（列挙の網羅がそのまま鳴った）。
    // **ここは実データに固定してある。**写しが動いたら同じ変更で直すこと。
    ['**実データで6件が健全でない**（緑＝異常が無い、ではない）', () => {
      const { unhealthy } = V(real);
      assert(unhealthy.length === 6, `健全でないのは6件のはずが ${unhealthy.length}`);
      assert(real.open_findings.length === 2, '未対応は2件（週次2本）');
      assert(real.intentional_stops.length === 4,
        '意図的な停止は4件（Reddit監視・副系A・副系B・写しの取り直し）');
    }],

    // --- 黙って止まったものを通さない -----------------------------------
    ['**新しく止まった routine を通さない**', () => {
      const p = V(broken(real, (d) => { d.routines.find((r) => r.enabled).enabled = false; })).problems;
      assert(p.some((x) => x.includes('どちらの一覧にも無い')), p.join(' / '));
    }],
    ['**新しく失敗した routine を通さない**', () => {
      const p = V(broken(real, (d) => {
        const r = d.routines.find((x) => x.enabled && x.last_run_status !== 'FAILED');
        r.last_run_status = 'FAILED';
      })).problems;
      assert(p.some((x) => x.includes('failed')), p.join(' / '));
    }],
    ['**発火予定を過ぎたものを通さない**', () => {
      const p = V(broken(real, (d) => {
        const r = d.routines.find((x) => x.enabled && x.last_run_status !== 'FAILED');
        r.next_run_at = '2026-08-20T00:00:00Z';
      })).problems;
      assert(p.some((x) => x.includes('overdue')), p.join(' / '));
    }],
    // **実データに PENDING が居ることを前提にしない。**居るかどうかは
    // 取り直した瞬間に走っている回があるかで決まり、こちらの都合では決まらない。
    // 検べたいのは diagnose の規則なので、行はここで組む。
    ['走っている最中（PENDING）は健全に数える', () => {
      const r = {
        id: 'x', name: 'x', enabled: true, cron_expression: '0 0 * * *',
        next_run_at: '2026-08-29T00:00:00Z', last_run_status: 'PENDING',
      };
      assert(diagnose(r, { now: NOW }) === null, 'PENDING を異常にしている');
    }],
    ['cron があるのに一度も走っていなければ立つ', () => {
      const r = { id: 'x', name: 'x', enabled: true, cron_expression: '0 0 * * *', next_run_at: '2026-08-29T00:00:00Z' };
      assert(diagnose(r, { now: NOW }) === 'never_ran');
    }],
    ['**cron の欄が欠けていても「一度も走っていない」は立つ**（規則ごと消えない）', () => {
      const r = { id: 'x', name: 'x', enabled: true, next_run_at: '2026-08-29T00:00:00Z' };
      assert(diagnose(r, { now: NOW }) === 'never_ran');
    }],
    ['一度だけの routine（cron 無し）は「一度も走っていない」で落とさない', () => {
      const r = { id: 'x', name: 'x', enabled: true, run_once_at: '2026-08-29T00:00:00Z', next_run_at: '2026-08-29T00:00:00Z' };
      assert(diagnose(r, { now: NOW }) === null);
    }],

    // --- 記録が実体とずれるのを通さない ---------------------------------
    ['**直ったのに open_findings に残っていたら落とす**', () => {
      const p = V(broken(real, (d) => {
        const f = d.open_findings[0];
        const r = d.routines.find((x) => x.id === f.id);
        r.enabled = true; r.last_run_status = 'SUCCEEDED'; r.next_run_at = '2026-08-29T00:00:00Z';
      })).problems;
      assert(p.some((x) => x.includes('健全になっている')), p.join(' / '));
    }],
    ['**止めたはずのものが動いていたら落とす**', () => {
      const p = V(broken(real, (d) => {
        const r = d.routines.find((x) => x.id === d.intentional_stops[0].id);
        r.enabled = true; r.next_run_at = '2026-08-29T00:00:00Z'; r.last_run_status = 'SUCCEEDED';
      })).problems;
      assert(p.some((x) => x.includes('止めたはずのものが走っている')), p.join(' / '));
    }],
    ['両方の一覧に居たら落とす', () => {
      const p = V(broken(real, (d) => { d.intentional_stops.push({ ...d.open_findings[0] }); })).problems;
      assert(p.some((x) => x.includes('両方に居る')), p.join(' / '));
    }],
    ['理由の無い記録は落とす', () => {
      const p = V(broken(real, (d) => { delete d.open_findings[0].why; })).problems;
      assert(p.some((x) => x.includes('why が無い')), p.join(' / '));
    }],

    // --- ラチェット -----------------------------------------------------
    ['**上限を超えたら落とす**（上限を上げて通さない）', () => {
      const p = V(broken(real, (d) => { d.open_budget = 1; })).problems;
      assert(p.some((x) => x.includes('上限 1 を超えた')), p.join(' / '));
    }],
    ['**上限を先に上げておくのも落とす**（余った枠は次の停止を黙って飲む）', () => {
      const p = V(broken(real, (d) => { d.open_budget = 3; })).problems;
      assert(p.some((x) => x.includes('枠が余っている')), p.join(' / '));
    }],
    ['直して減らしたら、上限も同じPRで下げさせる', () => {
      const p = V(broken(real, (d) => {
        const f = d.open_findings.pop();
        const r = d.routines.find((x) => x.id === f.id);
        r.enabled = true; r.last_run_status = 'SUCCEEDED'; r.next_run_at = '2026-08-29T00:00:00Z';
      })).problems;
      assert(p.some((x) => x.includes('枠が余っている')), p.join(' / '));
    }],
    ['上限を書き忘れたら落とす', () => {
      const p = V(broken(real, (d) => { delete d.open_budget; })).problems;
      assert(p.some((x) => x.includes('open_budget')), p.join(' / '));
    }],

    // --- 取り直し（--sync） ---------------------------------------------
    ['**生の応答から写しを作れる**（実物の形で確かめる）', () => {
      const raw = { data: [{
        id: 'trig_z', name: 'z', cron_expression: '0 0 * * *',
        enabled: true, next_run_at: '2026-08-29T00:00:00Z',
        last_fired_at: '2026-08-28T00:00:00Z',
        last_run: { status: 'ROUTINE_RUN_STATUS_SUCCEEDED', fired_at: 'a', finished_at: 'b' },
        job_config: { ccr: { events: [{ data: { message: { content: '副系のプロンプト本文' } } }] } },
        derived_state: { prompt: '副系のプロンプト本文' },
      }] };
      const rs = normalizeRoutines(raw);
      assert(rs.length === 1 && rs[0].last_run_status === 'SUCCEEDED', JSON.stringify(rs));
      // **プロンプトを写さない。**要らないものを持つと置き場所が別の問題になる
      assert(!JSON.stringify(rs).includes('プロンプト本文'), 'プロンプトが写しに入っている');
    }],
    ['list_triggers の応答に見えないものは null（黙って空にしない）', () => {
      assert(normalizeRoutines({ ok: true }) === null);
      assert(normalizeRoutines(null) === null);
    }],
    ['**取り直しは判断を上書きしない**（現状を追認する表にしない）', () => {
      const after = applySync(real, { data: [] }, { now: new Date('2026-08-29T00:00:00Z') });
      assert(after.routines.length === 0, '写しは差し替わる');
      assert(after.open_findings.length === real.open_findings.length, 'open_findings が消えている');
      assert(after.open_budget === real.open_budget, 'open_budget が動いている');
      assert(after.observed_at === '2026-08-29T00:00:00Z', after.observed_at);
      // 異常が消えたら --check が「健全になっている」で落として人に書かせる
      const p = validate(after, { now: Date.parse('2026-08-29T00:00:00Z') }).problems;
      assert(p.some((x) => x.includes('健全になっている')), p.join(' / '));
    }],

    // --- 写しの鮮度 -----------------------------------------------------
    ['**写しが古いと落とす**（読めているつもりを緑にしない）', () => {
      const p = validate(real, { now: NOW + 10 * DAY }).problems;
      assert(p.some((x) => x.includes('古い')), p.join(' / '));
    }],
    ['observed_at が読めなければ落とす', () => {
      const p = V(broken(real, (d) => { d.observed_at = 'いつか'; })).problems;
      assert(p.some((x) => x.includes('いつ読んだ写しか')), p.join(' / '));
    }],
    ['鮮度の上限が無ければ落とす', () => {
      const p = V(broken(real, (d) => { delete d.max_snapshot_age_days; })).problems;
      assert(p.some((x) => x.includes('max_snapshot_age_days')), p.join(' / '));
    }],
  ];
  return run(scenarios, { label: '副系の実行記録' });
}

// ============================================================

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest() === 0 ? 0 : 1);

  const syncAt = process.argv.indexOf('--sync');
  if (syncAt >= 0) {
    const src = process.argv[syncAt + 1];
    if (!src) {
      console.error('--sync には list_triggers の生JSONのパスが要る');
      console.error('  セッションで mcp list_triggers を呼び、応答をファイルへ落として渡す');
      process.exit(1);
    }
    const before = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    const payload = JSON.parse(fs.readFileSync(src, 'utf8'));
    const after = applySync(before, payload);
    if (!after) { console.error(`${src} が list_triggers の応答に見えない`); process.exit(1); }
    fs.writeFileSync(LEDGER_PATH, `${JSON.stringify(after, null, 2)}\n`);
    console.log(`写しを取り直した: routine ${after.routines.length} 本 / observed_at ${after.observed_at}`);
    console.log('**判断（open_findings / intentional_stops / open_budget）は触っていない。**');
    console.log('続けて --check を回すこと。増えた異常はそこで落ちる。');
    process.exit(0);
  }

  const doc = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const { problems, warnings, unhealthy } = validate(doc);

  const age = ((Date.now() - Date.parse(doc.observed_at)) / DAY).toFixed(1);
  console.log(`副系の実行記録 — routine ${doc.routines.length} 本（写しは ${age} 日前）\n`);
  for (const r of doc.routines) {
    const what = diagnose(r, { now: Date.now() });
    const mark = what ? `**${what}**` : 'ok';
    console.log(`  ${mark.padEnd(14)} ${(r.name ?? '').slice(0, 40)}`);
  }
  console.log(`\n  健全でない ${unhealthy?.length ?? 0} 件`
    + ` = 未対応 ${doc.open_findings.length}（上限 ${doc.open_budget}）`
    + ` + 意図的に停止 ${doc.intentional_stops.length}`);
  if (doc.open_findings.length) {
    console.log('\n  **未対応** — 次の発火まで誰も気づかない形で止まっている:');
    for (const f of doc.open_findings) {
      const r = doc.routines.find((x) => x.id === f.id);
      console.log(`    [${f.what}] ${(r?.name ?? f.id).slice(0, 46)}（${f.found_at} 発見）`);
    }
  }
  for (const w of warnings) console.log(`\n  ⚠ ${w}`);

  if (problems.length) {
    console.error('\n副系の実行記録: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    console.log('\n写しの鮮度・列挙の網羅・ラチェットに問題なし。'
      + '**「緑」は異常が無いという意味ではない** — 未対応は上に出ている。');
  }
}
