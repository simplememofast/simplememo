#!/usr/bin/env node
/**
 * 予算の変更幅・損失上限・撤回条件と、資金繰りのシナリオを検査する。
 *
 *   node scripts/check-financial-policy.mjs           # 表示
 *   node scripts/check-financial-policy.mjs --check   # CI
 *
 * 【なぜ動かす予算が小さいうちに書くのか】
 * 大きくなってから書くと、そのときの都合に合わせた基準になる。
 * いま実際に動いているのは AI実費だけで、広告は未実装・価格は人間専任。
 * **だから今が一番中立に決められる。**
 *
 * 【検査するもの】
 *   - 権限表の領域名と一致しているか（片方だけ名前が変わるのを防ぐ）
 *   - 稼働中の領域に、変更幅・損失上限・撤回条件があるか
 *   - **損失上限が現在の上限を下回っていないか**（下回ると初日から発火する）
 *   - 収入が未接続なのにランウェイ（月数）を書いていないか
 *     — **出せない数字を出さない**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLedger, requireShape } from './lib/read-ledger.mjs';
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const POLICY_PATH = path.join(ROOT, 'data/financial-policy.json');
const AUTHORITY_PATH = path.join(ROOT, 'data/authority-matrix.json');
const COST_PATH = path.join(ROOT, 'data/autopilot-cost.json');
export const APPROVALS_PATH = path.join(ROOT, 'data/spend-approvals.json');

export const STATUSES = ['active', 'not_started', 'ai_excluded'];

/**
 * 上限そのものが読めているか。**「上限を消す」で「上限の検査」を外せないようにする。**
 *
 * [2026-08-26] 突き合わせ2つが `monthlyCap !== null &&` で守られていたため、
 * 書き換え（$40 → $999）は捕まるのに**鍵ごと削除すると exit 0** だった。
 * 止めたい行為が「黙って上限を動かす」なので、削除で外せては止めたことにならない。
 */
export function capProblem(cap) {
  if (typeof cap !== 'number') {
    return 'data/autopilot-cost.json に budget.monthly_usd_cap が無い'
      + ' — **承認記録との突き合わせが丸ごと消える。**'
      + '上限を消すことで上限の検査を外せるようにしない';
  }
  return null;
}

/**
 * 二者承認 — **上限を動かした記録が無いと、上限を動かせない。**
 *
 * 承認記録の最新値と実際の上限が一致していなければ落ちる。つまり
 * autopilot-cost.json の monthly_usd_cap を黙って書き換えることができない。
 *
 * 変更幅が max_step_pct を超える場合は承認者が2人要る。
 * **AIは承認者になれない** — 止めることは許しているが、金額を上げることは許さない。
 */
export function validateApprovals(approvals, { policy = null, monthlyCap = null } = {}) {
  const problems = [];
  const rows = approvals.approvals || [];
  rows.forEach((a, i) => {
    const at = `approvals[seq=${a.seq}]`;
    if (a.seq !== i + 1) problems.push(`${at}: 連番が飛んでいる — 承認記録は追記のみ`);
    if (!Array.isArray(a.approved_by) || !a.approved_by.length) {
      problems.push(`${at}: approved_by が空`);
    } else if (a.approved_by.includes('ai')) {
      problems.push(`${at}: approved_by に ai が入っている`
        + ' — **AIは承認者になれない。**止めることは許しているが、金額を上げることは許さない');
    }
    if (!a.approved_at) problems.push(`${at}: approved_at が無い`);
    if (typeof a.to_usd !== 'number') problems.push(`${at}: to_usd が数値でない`);
    if (!a.note) problems.push(`${at}: note が無い — なぜその額なのかが残らない`);

    // 上げ幅が規則を超えるなら承認者が2人要る
    const limit = (policy?.change_limits || []).find((c) => c.domain === a.domain);

    // **placeholder を実測値へ置き換える1回だけ、上げ幅の規則を外す。**（2026-09-03）
    //
    // 【なぜ例外が要るか】seq=1 の note が自分でこう書いている ——
    // 「初期値。実測1点（$0.8149）からの粗い外挿で置いた placeholder で、実測由来ではない。
    // **ここを実測に置き換えるのが最初の仕事**」。ところが max_step_pct（25%）は
    // 「熟慮した額を大きく動かすな」の規則で、**placeholder からの置き換えを想定していない。**
    // 実測（主系 n=6・日次×30日で $254〜$344/月）へ寄せるには +25% を9回・14日おき、
    // 4か月半かかる。**台帳が「最初の仕事」と呼ぶものが、規則で4か月半かかる。**
    //
    // 【二度使えない形にしてある】次の3つが全部そろったときだけ通る:
    //   ① 規則の側が placeholder_replacement_exempt: true を宣言している
    //   ② その領域でこの例外を使った承認が他に無い（**1領域につき1回だけ**）
    //   ③ **直前の承認が初期値**（from_usd === null）である
    // ③ があるので、placeholder→実測 の1回以外では構造的に成立しない。
    //
    // **二者承認そのものは外していない。**外したのは「上げ幅による自動発動」だけで、
    // approved_by に ai が書けないことも、上限と承認記録の一致も、そのまま効く。
    let exempt = false;
    if (a.placeholder_replacement === true) {
      const reasons = [];
      if (!limit?.placeholder_replacement_exempt) {
        reasons.push('規則の側が placeholder_replacement_exempt を宣言していない');
      }
      const others = rows.filter((x) => x !== a && x.domain === a.domain
        && x.placeholder_replacement === true);
      if (others.length) reasons.push(`同じ領域で既に使われている（seq=${others.map((x) => x.seq).join(',')}）`);
      const prev = [...rows].filter((x) => x.domain === a.domain && x.seq < a.seq).pop();
      if (!prev || prev.from_usd !== null) {
        reasons.push('直前の承認が初期値（from_usd: null）ではない — placeholder からの置き換えに当たらない');
      }
      if (reasons.length) {
        problems.push(`${at}: placeholder_replacement を使えない — ${reasons.join(' / ')}`);
      } else {
        exempt = true;
      }
    }

    if (limit && typeof a.from_usd === 'number' && typeof limit.max_step_pct === 'number') {
      const stepPct = ((a.to_usd - a.from_usd) / a.from_usd) * 100;
      const needsTwo = stepPct > limit.max_step_pct && !exempt;
      if (needsTwo && (a.approved_by || []).length < 2) {
        problems.push(`${at}: 変更幅 ${stepPct.toFixed(1)}% が上限 ${limit.max_step_pct}% を超えるのに承認者が1人`);
      }
      if (a.two_person_required !== needsTwo) {
        problems.push(`${at}: two_person_required が実際の判定（${needsTwo}）と違う`);
      }
    } else if (a.two_person_required && (a.approved_by || []).length < 2) {
      problems.push(`${at}: two_person_required なのに承認者が1人`);
    }
    if (a.two_person_required === false && !a.two_person_reason) {
      problems.push(`${at}: 二者承認を不要とした理由が無い`);
    }

    // **変更の間隔（min_days_between_changes）を実際に見る。**（2026-09-03）
    //
    // 【なぜ足したか】この規則は 2026-08-22 から台帳にあったが、**検査されていなかった。**
    // validate() は「数値が入っているか」しか見ず、ここは承認日の間隔を見ていなかった。
    // つまり **同じ日に何度でも上げられた。**規則の note が「実費の中央値が動いたと言える
    // 最小の窓」と理由まで書いているのに、それを守らせるものが無かった ——
    // この台帳が繰り返し戒めている「散文は手を挙げない」の形そのもの。
    //
    // 【遡って判定しない】`min_days_enforced_from` より後の承認だけを見る。
    // **規則が無かった時点の記録を、後から作った規則で落とすのは、記録のほうを嘘にする。**
    // seq=1（08-22）と seq=2（09-03・間隔12日）はそれ以前なので対象外で、
    // その事実は policy 側の note に書いてある。**免除ではなく、適用の開始点。**
    if (limit && typeof limit.min_days_between_changes === 'number' && limit.min_days_enforced_from
        && a.approved_at && a.approved_at > limit.min_days_enforced_from) {
      const prev = [...rows].filter((x) => x.domain === a.domain && x.seq < a.seq).pop();
      if (prev?.approved_at) {
        const days = Math.floor(
          (Date.parse(`${a.approved_at}T00:00:00Z`) - Date.parse(`${prev.approved_at}T00:00:00Z`)) / 86400000);
        if (Number.isFinite(days) && days < limit.min_days_between_changes) {
          problems.push(`${at}: 前回の承認（seq=${prev.seq} / ${prev.approved_at}）から ${days}日`
            + ` — 規則は ${limit.min_days_between_changes}日以上`
            + '。**効いたかどうかが分かる前に次の判断をしない**');
        }
      }
    }
  });
  if (approvals.next_seq !== rows.length + 1) {
    problems.push(`next_seq=${approvals.next_seq} が記録数 ${rows.length} と合わない`);
  }
  // **実際の上限と、承認された最新値が一致していること。**
  const latest = [...rows].reverse().find((a) => a.domain === 'AI実費（開発・運用のトークン費）');
  if (monthlyCap !== null && latest && latest.to_usd !== monthlyCap) {
    problems.push(`autopilot-cost.json の上限 $${monthlyCap} が、承認された最新値 $${latest.to_usd} と違う`
      + ' — **承認記録を書かずに上限を動かせない**');
  }
  return problems;
}

export function validate(doc, { authorityDomains = new Set(), monthlyCap = null } = {}) {
  const problems = [];
  for (const c of doc.change_limits || []) {
    const at = `change_limits「${c.domain}」`;
    if (!STATUSES.includes(c.status)) problems.push(`${at}: status は ${STATUSES.join('/')}`);
    if (c.authority_domain && authorityDomains.size && !authorityDomains.has(c.authority_domain)) {
      problems.push(`${at}: authority_domain "${c.authority_domain}" が権限表に無い`
        + ' — 片方だけ名前が変わると、境界が二重管理になる');
    }
    if (c.who_decides !== 'human') {
      problems.push(`${at}: who_decides が human でない — **金額を動かす判断はAIに渡さない**`);
    }
    if (c.status === 'active') {
      for (const [k, label] of [['max_step_pct', '変更幅'], ['min_days_between_changes', '変更間隔'],
        ['loss_limit_usd', '損失上限']]) {
        if (typeof c[k] !== 'number') problems.push(`${at}: 稼働中なのに${label}（${k}）が数値でない`);
      }
      if (!Array.isArray(c.withdraw_conditions) || !c.withdraw_conditions.length) {
        problems.push(`${at}: 稼働中なのに撤回条件が空`
          + ' — **やめる条件を決めていないものは、やめられない**');
      }
      if (typeof c.loss_limit_usd === 'number' && typeof c.current_monthly_usd === 'number'
          && c.loss_limit_usd <= c.current_monthly_usd) {
        problems.push(`${at}: 損失上限 $${c.loss_limit_usd} が現在の上限 $${c.current_monthly_usd} 以下`
          + ' — 初日から発火する上限は上限ではない');
      }
    } else {
      // 稼働していない領域は「未設定と決めた」と書かせる。**空欄と未設定は違う。**
      for (const [k, note] of [['loss_limit_usd', 'loss_limit_note'], ['max_step_pct', 'max_step_note']]) {
        if (c[k] === null && !c[note]) problems.push(`${at}: ${k} が null なのに ${note} が無い`);
      }
    }
  }

  // AI実費の上限は台帳が正。ここに書いた現在額とずれていたら、どちらかが古い。
  const ai = (doc.change_limits || []).find((c) => c.status === 'active' && typeof c.current_monthly_usd === 'number');
  if (ai && monthlyCap !== null && ai.current_monthly_usd !== monthlyCap) {
    problems.push(`change_limits「${ai.domain}」の現在額 $${ai.current_monthly_usd} が`
      + ` autopilot-cost.json の上限 $${monthlyCap} と違う`);
  }

  const s = doc.cash_scenarios;
  if (s) {
    for (const k of ['pessimistic', 'standard', 'optimistic']) {
      if (typeof s.monthly_outflow_usd?.[k] !== 'number') problems.push(`cash_scenarios.monthly_outflow_usd.${k} が無い`);
      if (!s.assumptions?.[k]) problems.push(`cash_scenarios.assumptions.${k} が無い — 前提の無いシナリオは比較できない`);
    }
    const o = s.monthly_outflow_usd || {};
    if (typeof o.optimistic === 'number' && typeof o.standard === 'number' && o.optimistic > o.standard) {
      problems.push('cash_scenarios: 楽観が標準より大きい');
    }
    if (typeof o.standard === 'number' && typeof o.pessimistic === 'number' && o.standard > o.pessimistic) {
      problems.push('cash_scenarios: 標準が悲観より大きい');
    }
    // **出せない数字を出さない。**
    //
    // [2026-08-25] ここは長く `revenue_connected` だけを見ていた。それで足りて
    // いたのは、その値がずっと false だったから。**収入が接続された瞬間に、
    // この歯止めは実質的に外れる** —— ランウェイには収入と手元資金の両方が
    // 要るのに、片方だけで通ってしまう。
    //
    // 収入接続を true にする作業そのものが、この穴を開ける作業でもあった。
    // **必要な材料を1つずつ数え、欠けているものを名指しする形にする。**
    const missing = [];
    if (!s.revenue_connected) missing.push('収入');
    if (!s.cash_on_hand_connected) missing.push('手元資金');
    // 履歴が1日しかない収入から月次は引けない。**日数も材料のうち。**
    const days = s.revenue_history_days ?? (s.revenue_observed ? 1 : 0);
    if (s.revenue_connected && days < 28) missing.push(`収入の履歴（${days}日 / 28日必要）`);

    if (missing.length && s.runway_months !== null) {
      problems.push(`runway_months を書いているが ${missing.join(' / ')} が機械に入っていない`
        + ' — **足りない材料が1つでもあれば月数は嘘になる**');
    }
    if (s.cash_on_hand_connected === undefined) {
      problems.push('cash_on_hand_connected が無い'
        + ' — **収入だけで資金繰りを引ける形にしない**（この欄が無いと revenue_connected 単独で通る）');
    }
  }
  return problems;
}


// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
// 通ることだけ確かめる自己テストは、検査が何も見ていなくても緑になる。
const SELFTEST_BREAKAGES = [
  ['知らない status は落ちる', (d) => { d.change_limits[0].status = 'たぶん平気'; }],
  ['**変更幅の上限が無い**のは落ちる（無制限に上げられる）', (d) => { delete d.change_limits[0].max_step_pct; }],
  ['**変更の間隔が無い**のは落ちる（同日に何度でも上げられる）', (d) => { delete d.change_limits[0].min_days_between_changes; }],
];
const SCENARIOS = ledgerScenarios(
  () => JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8')),
  (d) => validate(d),
  SELFTEST_BREAKAGES,
);

// [2026-08-26] **上限を消すと、上限の検査が消えていた。**
// 突き合わせは2つとも `monthlyCap !== null &&` で守られていて、
// 書き換え（$40 → $999）は捕まるのに、**鍵ごと削除すると exit 0** だった。
// 止めたい行為が「黙って上限を動かす」なので、削除で外せては止めたことにならない。
// 読み出し側（COST_PATH）で number を要求する形にしたが、
// **突き合わせそのものが効いていること**もここで固定する。
// [2026-09-03] **placeholder からの置き換え例外が、二度使えないこと。**
// 例外そのものより、**例外が閉じていること**のほうを固定する。
// 開いたままだと「max_step_pct を外す口」が台帳に残り、次の増額で使われる。
const EXEMPT_POLICY = {
  change_limits: [{
    domain: 'AI実費', max_step_pct: 25, placeholder_replacement_exempt: true,
  }],
};
const exemptRows = (extra = []) => ({
  next_seq: 3 + extra.length,
  approvals: [
    { seq: 1, domain: 'AI実費', from_usd: null, to_usd: 40, approved_at: '2026-08-22',
      approved_by: ['human'], note: '初期値', two_person_required: false, two_person_reason: '初期値' },
    { seq: 2, domain: 'AI実費', from_usd: 40, to_usd: 280, approved_at: '2026-09-03',
      approved_by: ['human'], note: '置き換え', two_person_required: false,
      two_person_reason: 'placeholder の置き換え', placeholder_replacement: true },
    ...extra,
  ],
});
SCENARIOS.push(
  ['placeholder の置き換えは、承認者1人でも通る', () => {
    const p = validateApprovals(exemptRows(), { policy: EXEMPT_POLICY, monthlyCap: 280 });
    assert(p.length === 0, JSON.stringify(p));
  }],
  ['**同じ例外を2回は使えない**（例外が増額の常用口にならない）', () => {
    const p = validateApprovals(exemptRows([
      { seq: 3, domain: 'AI実費', from_usd: 280, to_usd: 900, approved_at: '2026-09-20',
        approved_by: ['human'], note: 'もう一度', two_person_required: false,
        two_person_reason: 'x', placeholder_replacement: true },
    ]), { policy: EXEMPT_POLICY, monthlyCap: 900 });
    assert(p.some((x) => x.includes('既に使われている')), JSON.stringify(p));
  }],
  ['**直前が初期値でなければ使えない**（後から遡って例外にできない）', () => {
    const rows = exemptRows();
    rows.approvals[0].from_usd = 10; // 初期値ではなくなる
    const p = validateApprovals(rows, { policy: EXEMPT_POLICY, monthlyCap: 280 });
    assert(p.some((x) => x.includes('初期値')), JSON.stringify(p));
  }],
  ['**規則の側が宣言していなければ使えない**（承認記録だけで例外を作れない）', () => {
    const p = validateApprovals(exemptRows(), {
      policy: { change_limits: [{ domain: 'AI実費', max_step_pct: 25 }] }, monthlyCap: 280 });
    assert(p.some((x) => x.includes('宣言していない')), JSON.stringify(p));
  }],
  ['**例外を使わない大幅増額は、今までどおり2人要る**', () => {
    const rows = exemptRows();
    delete rows.approvals[1].placeholder_replacement;
    rows.approvals[1].two_person_required = true;
    const p = validateApprovals(rows, { policy: EXEMPT_POLICY, monthlyCap: 280 });
    assert(p.some((x) => x.includes('承認者が1人')), JSON.stringify(p));
  }],
  ['**例外を使っても approved_by の ai は通らない**（外したのは上げ幅の判定だけ）', () => {
    const rows = exemptRows();
    rows.approvals[1].approved_by = ['ai'];
    const p = validateApprovals(rows, { policy: EXEMPT_POLICY, monthlyCap: 280 });
    assert(p.some((x) => x.includes('ai が入っている')), JSON.stringify(p));
  }],
);

// [2026-09-03] **変更の間隔が実際に効くこと。**
// 規則そのものより「落ちるのを見た」ほうを固定する —— 08-22 から台帳にあったのに
// 検査が無く、同じ日に何度でも上げられた期間があった。
const INTERVAL_POLICY = (enforcedFrom = '2026-09-03') => ({
  change_limits: [{
    domain: 'AI実費', max_step_pct: 25, min_days_between_changes: 14,
    min_days_enforced_from: enforcedFrom,
  }],
});
const intervalRows = (secondDate, thirdDate) => ({
  next_seq: 4,
  approvals: [
    { seq: 1, domain: 'AI実費', from_usd: null, to_usd: 40, approved_at: '2026-08-22',
      approved_by: ['human'], note: '初期値', two_person_required: false, two_person_reason: '初期値' },
    { seq: 2, domain: 'AI実費', from_usd: 40, to_usd: 45, approved_at: secondDate,
      approved_by: ['human'], note: '+12.5%', two_person_required: false, two_person_reason: '幅の内' },
    { seq: 3, domain: 'AI実費', from_usd: 45, to_usd: 50, approved_at: thirdDate,
      approved_by: ['human'], note: '+11%', two_person_required: false, two_person_reason: '幅の内' },
  ],
});
SCENARIOS.push(
  ['**間隔が足りない承認は落ちる**（同じ日に何度でも上げられた穴）', () => {
    const p = validateApprovals(intervalRows('2026-09-05', '2026-09-10'),
      { policy: INTERVAL_POLICY(), monthlyCap: 50 });
    assert(p.some((x) => x.includes('5日') && x.includes('14日以上')), JSON.stringify(p));
  }],
  ['間隔が足りていれば通る', () => {
    const p = validateApprovals(intervalRows('2026-09-05', '2026-09-19'),
      { policy: INTERVAL_POLICY(), monthlyCap: 50 });
    assert(p.length === 0, JSON.stringify(p));
  }],
  ['**開始点より前は遡って判定しない**（規則が無かった時点の記録を落とさない）', () => {
    // seq=2 と seq=3 の間隔は5日だが、どちらも開始点(2026-12-31)より前
    const p = validateApprovals(intervalRows('2026-09-05', '2026-09-10'),
      { policy: INTERVAL_POLICY('2026-12-31'), monthlyCap: 50 });
    assert(!p.some((x) => x.includes('14日以上')), JSON.stringify(p));
  }],
  ['**開始点の宣言が無ければ判定しない**（黙って遡及適用しない）', () => {
    const pol = INTERVAL_POLICY();
    delete pol.change_limits[0].min_days_enforced_from;
    const p = validateApprovals(intervalRows('2026-09-05', '2026-09-10'), { policy: pol, monthlyCap: 50 });
    assert(!p.some((x) => x.includes('14日以上')), JSON.stringify(p));
  }],
  ['**実データの承認記録が、いまの規則で通ること**', () => {
    const p = validateApprovals(JSON.parse(fs.readFileSync(APPROVALS_PATH, 'utf8')), {
      policy: JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8')),
      monthlyCap: JSON.parse(fs.readFileSync(COST_PATH, 'utf8')).budget.monthly_usd_cap });
    assert(p.length === 0, JSON.stringify(p));
  }],
);

SCENARIOS.push(
  ['**承認された最新値と違う上限は落ちる**', () => {
    const approvals = JSON.parse(fs.readFileSync(APPROVALS_PATH, 'utf8'));
    const rows = approvals.approvals || [];
    const latest = [...rows].reverse().find((a) => a.domain === 'AI実費（開発・運用のトークン費）');
    assert(latest, '突き合わせる承認記録が無い — この検査は何も見ていない');
    const p = validateApprovals(approvals, { policy: JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8')),
      monthlyCap: latest.to_usd + 959 });
    assert(p.some((x) => x.includes('承認された最新値')), JSON.stringify(p));
  }],
  ['**上限が数でなければ落ちる**（削除で検査を外せないように）', () => {
    assert(capProblem(null), 'null を通した — **上限を消せば検査も消える**');
    assert(capProblem(undefined), 'undefined を通した');
    assert(capProblem('たくさん'), '数でない値を通した');
    assert(capProblem(40) === null, '正しい上限を落とした');
  }],
  ['**null（上限を読めない）を「一致」と読まない**', () => {
    // validateApprovals は null を「突き合わせない」として扱う（呼ぶ側が明示する）。
    // **その代わり、呼ぶ側が null を通さない**ことを下で確かめる。
    const cost = JSON.parse(fs.readFileSync(COST_PATH, 'utf8'));
    assert(typeof cost.budget?.monthly_usd_cap === 'number',
      '実データの autopilot-cost.json に budget.monthly_usd_cap が無い'
      + ' — **上限を消すことで上限の検査を外せる状態**');
  }],
);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 ? 0 : 1);
  const doc = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
  const authority = requireShape(readLedger(AUTHORITY_PATH), ['domains'],
    { what: 'data/authority-matrix.json', why: '領域の突き合わせができない' });
  const domains = new Set((authority.domains || []).map((d) => d.domain));
  // [2026-08-26] ここは `.budget?.monthly_usd_cap ?? null` だった。
  // 下の2つの突き合わせは両方 `monthlyCap !== null &&` で守られているので、
  // **鍵を消すと「承認記録を書かずに上限を動かせない」規則が丸ごと消える。**実測:
  //
  //   上限を $40 → $999 に黙って書き換える → 捕まる
  //   **上限の鍵ごと消す**                  → **素通り（exit 0）**
  //
  // 書き換えは止まるのに削除は通る、では止めたことにならない。
  // **金額の規則なので、緩む方向の既定を置かない。**
  const costDoc = requireShape(readLedger(COST_PATH), ['budget'],
    { what: 'data/autopilot-cost.json', why: '承認された上限と突き合わせられない' });
  const cap = costDoc.budget?.monthly_usd_cap ?? null;
  const capIssue = capProblem(cap);
  if (capIssue) { console.error(capIssue); process.exit(1); }
  const approvals = JSON.parse(fs.readFileSync(APPROVALS_PATH, 'utf8'));
  const problems = [
    ...validate(doc, { authorityDomains: domains, monthlyCap: cap }),
    ...validateApprovals(approvals, { policy: doc, monthlyCap: cap }),
  ];

  console.log('金額を動かす規則\n');
  for (const c of doc.change_limits) {
    const mark = { active: '稼働中  ', not_started: '未着手  ', ai_excluded: 'AI対象外' }[c.status];
    console.log(`  [${mark}] ${c.domain}`);
    if (c.status === 'active') {
      console.log(`      現在 $${c.current_monthly_usd}/月（${c.cap_set_by}）`
        + ` / 1回の変更幅 ${c.max_step_pct}% / 間隔 ${c.min_days_between_changes}日`);
      console.log(`      損失上限 $${c.loss_limit_usd} / 撤回条件 ${c.withdraw_conditions.length}件`);
    } else {
      console.log(`      ${c.loss_limit_note ?? c.max_step_note ?? ''}`);
    }
  }
  const s = doc.cash_scenarios;
  console.log('\n  月いくら出ていくか（**出ていく側だけ**）');
  console.log(`    悲観 $${s.monthly_outflow_usd.pessimistic} / 標準 $${s.monthly_outflow_usd.standard}`
    + ` / 楽観 $${s.monthly_outflow_usd.optimistic}`);
  const ro = s.revenue_observed;
  console.log(`    収入の接続: ${s.revenue_connected ? 'あり（App Store Connect / Analytics）' : '**無し**（App Store Connect 未接続）'}`);
  if (ro) {
    console.log(`      観測 ${ro.as_of} / ${ro.window}: 課金 ${ro.purchases}件`
      + ` / 入金 $${ro.proceeds_usd} / 課金ユーザー ${ro.paying_users}`);
    console.log('      **月次収入ではない。**日次を積むまで月額に換算しない');
  }
  console.log(`    手元資金の接続: ${s.cash_on_hand_connected ? 'あり' : '**無し**（銀行・カードを読む経路が無い）'}`);
  const need = [];
  if (!s.revenue_connected) need.push('収入');
  if (!s.cash_on_hand_connected) need.push('手元資金');
  const d = s.revenue_history_days ?? (s.revenue_observed ? 1 : 0);
  if (s.revenue_connected && d < 28) need.push(`収入の履歴（${d}/28日）`);
  console.log(`    **ランウェイ（月数）は出さない。**足りない材料: ${need.join(' / ') || 'なし'}`);

  console.log(`\n  上限を動かした記録 ${approvals.approvals.length}件（**追記のみ**）`);
  for (const a of approvals.approvals) {
    console.log(`    #${a.seq} ${a.domain}: ${a.from_usd === null ? '初期値' : `$${a.from_usd} →`} $${a.to_usd}`
      + `  ${a.approved_at} / 承認者 ${a.approved_by.join(', ')}`
      + `${a.two_person_required ? '  **二者承認**' : ''}`);
  }
  console.log('    **承認記録を書かずに上限を動かせない**（実際の上限と最新の承認値が一致しないと落ちる）。');
  console.log('    **AIは承認者になれない。**止めることは許しているが、金額を上げることは許さない。');

  if (problems.length) {
    console.error('\n金額の規則: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    if (run(SCENARIOS) !== 0) process.exit(1);
    console.log('\n規則の形に問題なし。');
  }
}
