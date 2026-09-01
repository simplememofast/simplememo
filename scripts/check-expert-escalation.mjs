#!/usr/bin/env node
/**
 * **士業への確認を、機械が起案して送ってよいかを決める門。**
 *
 *   node scripts/check-expert-escalation.mjs            # 表示
 *   node scripts/check-expert-escalation.mjs --check    # CI
 *   node scripts/check-expert-escalation.mjs --selftest
 *   node scripts/check-expert-escalation.mjs --plan     # 実行側へ渡す形
 *
 * 【判断は人のまま。運ぶところだけ】
 * 台帳の ⑦ が physical_human なのは「対人・法的責任」で、**その理由は正しい。**
 * 税務や社会保険の判断を機械がすることはない。ここが持つのは
 * **「誰に・何を・いつまでに聞くか」の起案と送信**だけ。
 *
 * 【⑧の返信ゲートより厳しくしてある】
 * 宛先が外部の専門家なので:
 *   - 送るのは台帳にある reviewed な文面だけ（**送信時に作らない**）
 *   - 向き先が実在すること（engaged / address_source）
 *   - 元の未把握がまだ未把握であること（**答えが出ているのに聞かない**）
 *   - 返事待ちが溜まっていたら送らない
 *   - 金額・資格情報・個人情報が本文に入っていたら落とす
 *
 * 【2026-08-28 に、この検査が塞いだ穴が実際に開いていた】
 * corporate-obligations の social-insurance は「社労士がついているので
 * 期限はそちらに確認する」と書いていたが、**社労士は雇っていない。**
 * **居ない相手を向き先にしていた。**確認先の実在を誰も検査していなかった。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, broken, run } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/expert-escalation.json');
const OBLIGATIONS_PATH = path.join(ROOT, 'data/corporate-obligations.json');

const DAY = 86_400_000;

/**
 * 外部へ出す本文に入れてはいけないもの。**当たったら人へ。**
 * 士業への質問は事実の確認なので、これらが要ることは無い。
 */
export const FORBIDDEN_PATTERNS = [
  { re: /\d[\d,]*\s*(円|万円|ドル|USD|\$)/, what: '金額' },
  { re: /(api[_-]?key|secret|token|password|bearer|-----BEGIN)/i, what: '資格情報' },
  { re: /[\w.+-]+@[\w-]+\.[\w.]+/, what: 'メールアドレス' },
  { re: /(install[_-]?id|email[_-]?hash|transaction[_-]?id)/i, what: '利用者の識別子' },
];

/** 送ってよい状態。**それ以外は送らない。** */
export const SENDABLE_STATUS = 'draft';
/**
 * 向き先が居ないあいだ、質問を置いておくための状態。
 * **draft のまま置かせない** —— それを許すと「居ない相手を向き先にした質問が
 * 緑のまま残る」形に戻る（この検査を作る原因になった 2026-08-28 の穴そのもの）。
 */
export const PARKED_STATUS = 'parked';
export const ASK_STATUSES = [SENDABLE_STATUS, PARKED_STATUS];

/**
 * 1件の ask を送ってよいか。**純関数。**
 *
 * 落ちる順に並べてある。**先に落ちたものが理由**になる。
 * 返す decision: send / would_send（dry_run）/ hold
 */
export function evaluateAsk({
  ask, doc, obligations, sentToday = 0, openAsks = 0, lastSentAtByField = {},
  now = Date.now(),
} = {}) {
  const hold = (why) => ({ decision: 'hold', why });

  const policy = doc?.policy;
  if (!policy) return hold('材料が無い: policy');
  if (policy.kill_switch) return hold('kill_switch が立っている');
  const as = policy.auto_send;
  if (!as) return hold('材料が無い: policy.auto_send');
  if (!as.enabled) return hold('自動送信が有効になっていない（enabled を立てるのはオーナー）');

  if (!ask || typeof ask !== 'object') return hold('材料が無い: ask');
  if (ask.status !== SENDABLE_STATUS) return hold(`status が ${ask.status ?? '無し'}（送るのは ${SENDABLE_STATUS} だけ）`);

  // --- 向き先が実在するか。**居ない相手に送らない** ---------------------
  const expert = (doc.experts ?? []).find((e) => e.field === ask.field);
  if (!expert) return hold(`向き先「${ask.field}」が experts に無い`);
  if (!expert.engaged) {
    return hold(`「${ask.field}」の専門家は依頼していない（${expert.why_not ?? '理由なし'}）`
      + ' — **居ない相手を向き先にしない**');
  }
  if (!expert.address_source) return hold(`「${ask.field}」の宛先の在り処が無い`);

  // --- 聞く理由がまだ在るか ---------------------------------------------
  const ob = (obligations?.deadlines ?? []).find((d) => d.id === ask.id);
  if (!ob) return hold(`corporate-obligations に ${ask.id} が無い — **元が消えた質問を送らない**`);
  if (ob.confirmed_by_owner) {
    return hold(`${ask.id} は既に確定している — **答えが出ているのに聞かない**`);
  }

  // --- 本文 -------------------------------------------------------------
  const q = typeof ask.question === 'string' ? ask.question.trim() : '';
  if (!q) return hold('question が空 — **送信時に文面を作らない**');
  for (const p of FORBIDDEN_PATTERNS) {
    if (p.re.test(q)) return hold(`本文に${p.what}が入っている — 外部へ出す文面に入れない`);
  }

  // --- 溜め込みと間隔 ---------------------------------------------------
  if (openAsks > as.max_open_asks) {
    return hold(`返事待ちが ${openAsks} 件で上限 ${as.max_open_asks} を超えている`
      + ' — **返事が来ていないのは相手の手が空いていないということ**');
  }
  const last = lastSentAtByField[ask.field];
  if (last) {
    const days = (now - Date.parse(last)) / DAY;
    if (Number.isFinite(days) && days < as.min_days_between_asks) {
      return hold(`同じ相手へ ${days.toFixed(1)} 日前に送っている（間隔 ${as.min_days_between_asks} 日）`);
    }
  }
  if (sentToday >= as.daily_cap) return hold(`本日の送信が上限 ${as.daily_cap} 件に達している`);

  if (as.dry_run !== false) return { decision: 'would_send', why: 'dry_run（通っているが送らない）' };
  return { decision: 'send', why: 'ゲートを通過', to: expert.address_source, question: q };
}

/** 台帳そのものの検査。 */
export function validate(doc, { obligations = null } = {}) {
  const problems = [];
  if (!doc?.policy?.auto_send) { problems.push('policy.auto_send が無い'); return problems; }
  const as = doc.policy.auto_send;
  if (typeof doc.policy.kill_switch !== 'boolean') problems.push('kill_switch が真偽値でない');
  if (typeof as.enabled !== 'boolean') problems.push('auto_send.enabled が真偽値でない');
  if (typeof as.dry_run !== 'boolean') problems.push('auto_send.dry_run が真偽値でない');
  for (const k of ['daily_cap', 'min_days_between_asks', 'max_open_asks']) {
    if (typeof as[k] !== 'number' || !(as[k] > 0)) {
      problems.push(`auto_send.${k} が正の数でない — **上限の無いゲートは使えない**`);
    }
  }

  if (!Array.isArray(doc.experts)) problems.push('experts が配列でない');
  else {
    for (const [i, e] of doc.experts.entries()) {
      const at = `experts[${i}]「${e?.field ?? '?'}」`;
      if (!e?.field) problems.push(`${at}: field が無い`);
      if (typeof e?.engaged !== 'boolean') problems.push(`${at}: engaged が真偽値でない`);
      if (!e?.set_by) problems.push(`${at}: set_by が無い — **空欄と「未設定と決めた」は違う**`);
      if (e?.engaged === false && !e?.why_not) {
        problems.push(`${at}: 依頼していないのに why_not が無い — **居ない理由を書く**`);
      }
      if (e?.engaged === true && !e?.address_source) {
        problems.push(`${at}: 依頼しているのに宛先の在り処が無い`);
      }
      // **公開リポジトリなので、アドレスそのものを置かせない。**
      if (typeof e?.address_source === 'string' && /@/.test(e.address_source)) {
        problems.push(`${at}: address_source にアドレスが直接書かれている`
          + ' — **このリポジトリは公開。**第三者の個人情報を置かない（secret: の在り処だけ）');
      }
    }
  }

  if (!Array.isArray(doc.asks)) problems.push('asks が配列でない');
  else {
    const fields = new Set((doc.experts ?? []).map((e) => e.field));
    const engaged = new Set((doc.experts ?? []).filter((e) => e.engaged).map((e) => e.field));
    for (const [i, a] of doc.asks.entries()) {
      const at = `asks[${i}]「${a?.id ?? '?'}」`;
      for (const k of ['id', 'field', 'status', 'why_now', 'question']) {
        if (!a?.[k]) problems.push(`${at}: ${k} が無い`);
      }
      if (a?.status && !ASK_STATUSES.includes(a.status)) {
        problems.push(`${at}: status「${a.status}」は ${ASK_STATUSES.join(' / ')} のどれでもない`);
      }
      if (a?.field && !fields.has(a.field)) {
        problems.push(`${at}: 向き先「${a.field}」が experts に無い`
          + ' — **居ない相手を向き先にしない**（2026-08-28 に実際に起きた形）');
      } else if (a?.field && a?.status === SENDABLE_STATUS && !engaged.has(a.field)) {
        // **experts に「居る」ことと「依頼している」ことは違う。**
        // ここを見ていないと、依頼していない相手を向き先にした質問が
        // draft のまま緑で残る —— この検査を作る原因になった形に戻る。
        problems.push(`${at}: 「${a.field}」は依頼していないのに status が ${SENDABLE_STATUS}`
          + ` — **届かない質問を送る側に置かない。**${PARKED_STATUS} にするか、専門家を依頼する`);
      }
      if (typeof a?.question === 'string') {
        for (const p of FORBIDDEN_PATTERNS) {
          if (p.re.test(a.question)) problems.push(`${at}: 本文に${p.what}が入っている`);
        }
      }
      if (obligations && a?.id) {
        const ob = (obligations.deadlines ?? []).find((d) => d.id === a.id);
        if (!ob) problems.push(`${at}: corporate-obligations に ${a.id} が無い`);
        else if (ob.confirmed_by_owner) {
          problems.push(`${at}: ${a.id} は既に確定している`
            + ' — **答えが出た質問を残さない。**行を消すこと');
        }
      }
    }
  }

  if (!Array.isArray(doc.sent)) problems.push('sent が配列でない');
  return problems;
}

/** 実行側（simplememo-api）へ渡す形。**止めたものと理由も返す。** */
export function planAll(doc, obligations, { now = Date.now(), sentToday = 0 } = {}) {
  const sent = Array.isArray(doc.sent) ? doc.sent : [];
  const openAsks = sent.filter((s) => !s.answered_at).length;
  const lastSentAtByField = {};
  for (const s of sent) {
    if (!s?.field || !s?.at) continue;
    if (!lastSentAtByField[s.field] || s.at > lastSentAtByField[s.field]) lastSentAtByField[s.field] = s.at;
  }
  const plans = (doc.asks ?? []).map((ask) => ({
    id: ask.id, field: ask.field,
    ...evaluateAsk({ ask, doc, obligations, sentToday, openAsks, lastSentAtByField, now }),
  }));
  return {
    generated_by: 'scripts/check-expert-escalation.mjs --plan',
    generated_at: new Date(now).toISOString(),
    open_asks: openAsks,
    plans,
    send: plans.filter((p) => p.decision === 'send'),
  };
}

// ============================================================

/**
 * 実台帳を複製し、**質問を1件足してから**壊す。
 *
 * [2026-09-01] **`asks[1]` を直接いじる検体だった。**質問が1件に減った日に
 * `Cannot set properties of undefined` で落ちた —— 検査が壊れたのではなく、
 * **検体が台帳の行数に寄りかかっていた。**見たいのは「向き先の居ない draft を
 * 落とすか」なので、行数に関係なく成り立つ形にする。
 */
function withExtraAsk(real, mutate) {
  return broken(real, (d) => {
    const base = d.asks[0];
    assert(base, '実台帳に質問が1件も無い — **この検体が作れない**');
    d.asks.push({ ...JSON.parse(JSON.stringify(base)), id: `${base.id}-検体` });
    mutate(d.asks[d.asks.length - 1]);
  });
}

function selftest() {
  const real = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const obligations = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
  const NOW = Date.parse('2026-08-28T00:00:00Z');

  /** 実データを使い、enabled だけ立てる（既定 false のままだと他の規則を試せない）。 */
  const on = (over = {}) => {
    const d = JSON.parse(JSON.stringify(real));
    d.policy.auto_send.enabled = true;
    d.policy.auto_send.dry_run = false;
    Object.assign(d.policy.auto_send, over);
    return d;
  };
  const ev = (doc, ask, extra = {}) =>
    evaluateAsk({ ask: ask ?? doc.asks[0], doc, obligations, now: NOW, ...extra });
  const held = (r, needle) => {
    assert(r.decision === 'hold', `hold になっていない（${r.decision}: ${r.why}）`);
    assert(r.why.includes(needle), `理由が違う: ${r.why}`);
  };

  const scenarios = [
    ['実データの台帳が検査を通る', () => {
      const p = validate(real, { obligations });
      assert(p.length === 0, p.join(' / '));
    }],
    // **[2026-08-28] enabled が立ったので「必ず止まる」は成り立たなくなった。**
    // この行が守っていたのは「出荷している台帳のまま評価しても、実際には送らない」
    // ことで、その錠前は enabled から dry_run へ移っただけ。**性質のほうをピンし直す**
    // （フラグの値をピンすると、値が変わった日に検査ごと消える）。
    ['**実台帳のまま評価しても send にはならない**（最後の錠前は dry_run）', () => {
      const r = ev(real);
      assert(r.decision !== 'send', `実台帳で send が出た: ${JSON.stringify(r)}`);
      assert(r.decision === 'would_send' && /dry_run/.test(r.why),
        `dry_run で止まっていない: ${JSON.stringify(r)}`);
    }],
    ['**dry_run を倒すと、実台帳がそのまま send になる**（錠前が1枚であることを隠さない）', () => {
      const d = JSON.parse(JSON.stringify(real));
      d.policy.auto_send.dry_run = false;
      const r = ev(d);
      assert(r.decision === 'send', `dry_run を倒しても send にならない: ${JSON.stringify(r)}`);
    }],
    ['条件が揃えば送る', () => {
      const r = ev(on());
      assert(r.decision === 'send', JSON.stringify(r));
      assert(r.to === 'secret:EXPERT_TAX_EMAIL', r.to);
    }],
    ['dry_run のときは送らない', () => {
      const r = ev(on({ dry_run: true }));
      assert(r.decision === 'would_send', JSON.stringify(r));
    }],

    // --- 向き先 ----------------------------------------------------------
    ['**依頼していない相手には送らない**（2026-08-28 に実際に起きた形）', () => {
      const d = on();
      d.asks[0].field = '社会保険・労務';
      held(ev(d), '居ない相手を向き先にしない');
    }],
    ['experts に無い向き先は送らない', () => {
      const d = on();
      d.asks[0].field = '占い';
      held(ev(d), 'experts に無い');
    }],
    ['宛先の在り処が無ければ送らない', () => {
      const d = on();
      delete d.experts.find((e) => e.field === '税務').address_source;
      held(ev(d), '宛先の在り処が無い');
    }],

    // --- 聞く理由 --------------------------------------------------------
    // [2026-09-01] **実台帳の asks[0] が確定済みである前提を捨てた。**
    // legal-record-statutory の答えが出て行を消したら、asks[0] が別の質問になり
    // このテストが送信側へ倒れた。**台帳の行数と並び順に寄りかかっていた。**
    // 見たいのは「その質問の元になった期限が確定したら hold か」なので、
    // **いま残っている質問そのものを使い、その期限だけを確定させる。**
    ['**答えが出ているのに聞かない**', () => {
      const doc = on();
      const ask = doc.asks[0];
      assert(ask, '実台帳に質問が1件も無い — **この検査が空回りしている**');
      const ob = JSON.parse(JSON.stringify(obligations));
      const target = ob.deadlines.find((x) => x.id === ask.id);
      assert(target, `質問「${ask.id}」に対応する期限が台帳に無い`);
      target.confirmed_by_owner = true;
      target.next_due = '2099-01-31';
      held(evaluateAsk({ ask, doc, obligations: ob, now: NOW }), '既に確定している');
    }],
    ['元の未把握が消えていたら送らない', () => {
      const ob = { deadlines: [] };
      held(evaluateAsk({ ask: on().asks[0], doc: on(), obligations: ob, now: NOW }), '元が消えた質問');
    }],

    // --- 本文 ------------------------------------------------------------
    ['**送信時に文面を作らない**（question が空なら止まる）', () => {
      const d = on(); d.asks[0].question = '   ';
      held(ev(d), '送信時に文面を作らない');
    }],
    ['**金額が入っていたら落とす**', () => {
      const d = on(); d.asks[0].question = '報酬 50,000円 の支払いについて伺います';
      held(ev(d), '金額');
    }],
    ['**資格情報が入っていたら落とす**', () => {
      const d = on(); d.asks[0].question = 'api_key の扱いについて伺います';
      held(ev(d), '資格情報');
    }],
    ['**メールアドレスが入っていたら落とす**', () => {
      const d = on(); d.asks[0].question = 'a@example.com へ送ってよいか伺います';
      held(ev(d), 'メールアドレス');
    }],
    ['**利用者の識別子が入っていたら落とす**', () => {
      const d = on(); d.asks[0].question = 'install_id の保存期間について伺います';
      held(ev(d), '利用者の識別子');
    }],
    ['draft 以外は送らない', () => {
      const d = on(); d.asks[0].status = 'sent';
      held(ev(d), '送るのは draft だけ');
    }],

    // --- 溜め込みと間隔 ---------------------------------------------------
    ['**返事待ちが溜まっていたら送らない**', () => {
      held(ev(on(), null, { openAsks: 3 }), '返事待ちが 3 件');
    }],
    ['同じ相手へ間隔を空けずに送らない', () => {
      held(ev(on(), null, { lastSentAtByField: { 税務: '2026-08-26T00:00:00Z' } }), '2.0 日前に送っている');
    }],
    ['日次上限に達していたら送らない', () => {
      held(ev(on(), null, { sentToday: 1 }), '上限 1 件');
    }],
    ['kill_switch を立てると止まる', () => {
      const d = on(); d.policy.kill_switch = true;
      held(ev(d), 'kill_switch');
    }],

    // --- 台帳の検査 -------------------------------------------------------
    ['**アドレスを直接書いたら落とす**（このリポジトリは公開）', () => {
      const p = validate(broken(real, (d) => {
        d.experts.find((e) => e.field === '税務').address_source = 'someone@example.com';
      }), { obligations });
      assert(p.some((x) => x.includes('第三者の個人情報を置かない')), p.join(' / '));
    }],
    ['依頼していないのに理由が無ければ落とす', () => {
      const p = validate(broken(real, (d) => {
        delete d.experts.find((e) => !e.engaged).why_not;
      }), { obligations });
      assert(p.some((x) => x.includes('why_not が無い')), p.join(' / '));
    }],
    ['**experts に無い向き先の ask は落とす**', () => {
      const p = validate(broken(real, (d) => { d.asks[0].field = '占い'; }), { obligations });
      assert(p.some((x) => x.includes('居ない相手を向き先にしない')), p.join(' / '));
    }],
    // [2026-09-01] **`asks[1]` を前提にしていた。**質問が1件に減った日に
    // `Cannot set properties of undefined` で落ちた ——
    // **検査が壊れたのではなく、検体が台帳の行数に寄りかかっていた。**
    // 見たいのは「向き先の居ない draft を落とすか」なので、**検体を自分で作る。**
    ['**依頼していない相手を向き先にした draft を落とす**（この検査を作った当の穴）', () => {
      const p = validate(withExtraAsk(real, (a) => { a.field = '社会保険・労務'; a.status = 'draft'; }),
        { obligations });
      assert(p.some((x) => x.includes('届かない質問を送る側に置かない')), p.join(' / '));
    }],
    ['parked にすれば置いておける（向き先が決まるまで消さない）', () => {
      const p = validate(withExtraAsk(real, (a) => { a.field = '社会保険・労務'; a.status = 'parked'; }),
        { obligations });
      assert(p.some((x) => x.includes('届かない質問を送る側に置かない')) === false,
        `parked が落ちている: ${p.join(' / ')}`);
    }],
    ['知らない status は落ちる', () => {
      const p = validate(broken(real, (d) => { d.asks[0].status = 'sent'; }), { obligations });
      assert(p.some((x) => x.includes('のどれでもない')), p.join(' / '));
    }],
    ['確定済みの質問が残っていたら落とす', () => {
      const ob = JSON.parse(JSON.stringify(obligations));
      ob.deadlines.find((x) => x.id === 'social-insurance').confirmed_by_owner = true;
      const p = validate(real, { obligations: ob });
      assert(p.some((x) => x.includes('答えが出た質問を残さない')), p.join(' / '));
    }],
    ['上限が正の数でなければ落とす', () => {
      const p = validate(broken(real, (d) => { d.policy.auto_send.daily_cap = 0; }), { obligations });
      assert(p.some((x) => x.includes('daily_cap')), p.join(' / '));
    }],
    ['set_by が無ければ落とす', () => {
      const p = validate(broken(real, (d) => { delete d.experts[0].set_by; }), { obligations });
      assert(p.some((x) => x.includes('set_by が無い')), p.join(' / '));
    }],

    // --- plan -------------------------------------------------------------
    ['**実データでは1件も送らない**（enabled:false）', () => {
      const plan = planAll(real, obligations, { now: NOW });
      assert(plan.send.length === 0, JSON.stringify(plan.send));
      assert(plan.plans.length === real.asks.length, '止めたものも返す');
    }],
    ['plan は止めた理由も返す（止まっていることに気づけるように）', () => {
      const plan = planAll(real, obligations, { now: NOW });
      assert(plan.plans.every((p) => typeof p.why === 'string' && p.why), JSON.stringify(plan.plans));
    }],
  ];
  return run(scenarios, { label: '士業への確認' });
}

// ============================================================

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest() === 0 ? 0 : 1);

  const doc = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const obligations = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));

  if (process.argv.includes('--plan')) {
    console.log(JSON.stringify(planAll(doc, obligations), null, 2));
    process.exit(0);
  }

  const problems = validate(doc, { obligations });
  const as = doc.policy.auto_send;
  console.log('士業への確認 — 起案と送信の門\n');
  for (const e of doc.experts) {
    console.log(`  ${e.engaged ? '依頼あり' : '**依頼なし**'.padEnd(8)}  ${e.field}`
      + (e.engaged ? `（宛先: ${e.address_source}）` : ''));
  }
  console.log(`\n  有効        ${as.enabled ? 'はい' : '**いいえ**（オーナーが立てる）'}`);
  console.log(`  dry_run     ${as.dry_run ? 'はい（通っても送らない）' : 'いいえ'}`);
  console.log(`  日次上限    ${as.daily_cap} 通 / 同じ相手へ ${as.min_days_between_asks} 日おき`
    + ` / 返事待ち上限 ${as.max_open_asks}`);
  console.log(`\n  起案 ${doc.asks.length} 件 / **送った ${doc.sent.length} 件**`);
  for (const a of doc.asks) console.log(`    [${a.status}] ${a.field} :: ${a.id}`);
  if (doc.sent.length === 0) {
    console.log('\n  「経路ができた」と「経路を通って何かが動いた」は別。');
  }

  if (problems.length) {
    console.error('\n士業への確認: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    console.log('\n向き先の実在・本文・上限に問題なし。**アドレスは台帳に無い**（secret の在り処だけ）。');
  }
}
