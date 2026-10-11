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

function invalidLimit(as) {
  for (const k of ['daily_cap', 'max_open_asks']) {
    if (!Number.isSafeInteger(as[k]) || as[k] <= 0) return k;
  }
  if (!Number.isFinite(as.min_days_between_asks) || as.min_days_between_asks <= 0) {
    return 'min_days_between_asks';
  }
  return null;
}

function timestamp(value) {
  if (typeof value !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return NaN;
  const at = Date.parse(value);
  const date = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  // Date.parse は 2 月 30 日を翌月へ丸める。履歴の誤記を有効な日時へ直さない。
  if (!Number.isFinite(at) || !Number.isFinite(date)
      || new Date(date).toISOString().slice(0, 10) !== value.slice(0, 10)) return NaN;
  return at;
}

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
  if (policy.kill_switch !== false) return hold(policy.kill_switch === true
    ? 'kill_switch が立っている' : 'kill_switch の状態を判定できない');
  const as = policy.auto_send;
  if (!as) return hold('材料が無い: policy.auto_send');
  if (as.enabled !== true) return hold('自動送信が有効になっていない（enabled を立てるのはオーナー）');
  const badLimit = invalidLimit(as);
  if (badLimit) return hold(`auto_send.${badLimit} が有効な有限の上限でない`);
  for (const [key, value] of Object.entries({ sentToday, openAsks })) {
    if (!Number.isSafeInteger(value) || value < 0) return hold(`${key} が非負の安全な整数でない`);
  }
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) return hold('現在時刻を判定できない');
  if (!lastSentAtByField || typeof lastSentAtByField !== 'object' || Array.isArray(lastSentAtByField)) {
    return hold('直前送信日時の記録を判定できない');
  }

  if (!ask || typeof ask !== 'object') return hold('材料が無い: ask');
  if (ask.status !== SENDABLE_STATUS) return hold(`status が ${ask.status ?? '無し'}（送るのは ${SENDABLE_STATUS} だけ）`);

  // --- 向き先が実在するか。**居ない相手に送らない** ---------------------
  const expert = (doc.experts ?? []).find((e) => e.field === ask.field);
  if (!expert) return hold(`向き先「${ask.field}」が experts に無い`);
  if (expert.engaged !== true) {
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
  if (!Array.isArray(doc.sent)) return hold('送信履歴を判定できない');
  const sentRecords = [];
  for (const sent of doc.sent) {
    const at = timestamp(sent?.at);
    if (!sent?.field || !Number.isFinite(at) || at > now) return hold('送信履歴の日時が不正または未来');
    if (sent.answered_at != null) {
      const answeredAt = timestamp(sent.answered_at);
      if (!Number.isFinite(answeredAt) || answeredAt < at || answeredAt > now) return hold('返信履歴の日時が不正または未来');
    }
    sentRecords.push({ sent, at });
  }
  const effectiveOpenAsks = Math.max(openAsks, sentRecords.filter(({ sent }) => !sent.answered_at).length);
  if (effectiveOpenAsks > as.max_open_asks) {
    return hold(`返事待ちが ${effectiveOpenAsks} 件で上限 ${as.max_open_asks} を超えている`
      + ' — **返事が来ていないのは相手の手が空いていないということ**');
  }
  const fieldSentRecords = sentRecords.filter(({ sent }) => sent.field === ask.field);
  const hasLast = Object.hasOwn(lastSentAtByField, ask.field);
  if (fieldSentRecords.length && !hasLast) return hold('送信履歴があるのに直前送信日時が無い');
  let latestRecorded = -Infinity;
  for (const { at } of fieldSentRecords) latestRecorded = Math.max(latestRecorded, at);
  if (hasLast) {
    const last = timestamp(lastSentAtByField[ask.field]);
    if (!Number.isFinite(last) || last > now) return hold('直前送信日時が不正または未来');
    if (last < latestRecorded) return hold('直前送信日時が送信履歴より古い');
    const days = (now - last) / DAY;
    if (days < as.min_days_between_asks) {
      return hold(`同じ相手へ ${days.toFixed(1)} 日前に送っている（間隔 ${as.min_days_between_asks} 日）`);
    }
  }
  // 呼出側の既定 0 で、実履歴にある UTC 当日の送信を消さない。
  const todayStart = Math.floor(now / DAY) * DAY;
  const effectiveSentToday = Math.max(sentToday, sentRecords.filter(({ at }) => at >= todayStart).length);
  if (effectiveSentToday >= as.daily_cap) return hold(`本日の送信が上限 ${as.daily_cap} 件に達している`);

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
  for (const k of ['daily_cap', 'max_open_asks']) {
    if (!Number.isSafeInteger(as[k]) || as[k] <= 0) {
      problems.push(`auto_send.${k} が正の安全な整数でない — **上限の無いゲートは使えない**`);
    }
  }
  if (!Number.isFinite(as.min_days_between_asks) || as.min_days_between_asks <= 0) {
    problems.push('auto_send.min_days_between_asks が有限の正数でない — **間隔を判定できないゲートは使えない**');
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
  const openAsks = sent.filter((s) => !s?.answered_at).length;
  const lastSentAtByField = Object.create(null);
  for (const s of sent) {
    const at = timestamp(s?.at);
    if (!s?.field || !Number.isFinite(at)) continue; // 不正履歴は evaluateAsk が hold にする。
    if (!Object.hasOwn(lastSentAtByField, s.field) || at > timestamp(lastSentAtByField[s.field])) {
      lastSentAtByField[s.field] = s.at;
    }
  }
  const todayStart = Math.floor(now / DAY) * DAY;
  let reservedSentToday = Number.isSafeInteger(sentToday) && sentToday >= 0
    ? Math.max(sentToday, sent.filter((s) => timestamp(s?.at) >= todayStart && timestamp(s?.at) <= now).length)
    : sentToday;
  let reservedOpenAsks = openAsks;
  const plans = (doc.asks ?? []).map((ask) => {
    const result = evaluateAsk({ ask, doc, obligations, sentToday: reservedSentToday,
      openAsks: reservedOpenAsks, lastSentAtByField, now });
    // 実行側へ渡す同じ batch 内で、通った分の上限と間隔を予約する。履歴は書き換えない。
    if (result.decision === 'send' || result.decision === 'would_send') {
      reservedSentToday += 1;
      reservedOpenAsks += 1;
      lastSentAtByField[ask.field] = new Date(now).toISOString();
    }
    return { id: ask.id, field: ask.field, ...result };
  });
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
function withExtraAsk(real, base, mutate) {
  return broken(real, (d) => {
    if (!Array.isArray(d.asks)) d.asks = [];
    const src = d.asks[0] ?? base;
    assert(src, '検体の元になる質問が無い');
    d.asks.push({ ...JSON.parse(JSON.stringify(src)), id: `${src.id}-検体` });
    mutate(d.asks[d.asks.length - 1]);
  });
}

function selftest() {
  const real = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const obligations = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
  const NOW = Date.parse('2026-08-28T00:00:00Z');

  // [2026-09-01] **質問が0件になりうる。**社会保険の答えが出て最後の ask を消した日に、
  // `asks[0]` を使う検体が12件まとめて壊れた。**前日に同じ形を半分だけ直していた**
  // （`asks[1]` を `asks[0]` に寄せただけで、0件は想定していなかった）。
  //
  // **質問が無い状態は異常ではなく、この台帳の正常な終点。**聞くことが全部片づけば0件になる。
  // だから検体の側が0件でも成り立つようにする —— **実データに1件も無ければ、検体を1件でっち上げる。**
  //
  // **id は実在する期限に合わせる。**この検査の規則は ask.id と deadlines[].id の
  // 突き合わせで動くので、`-合成` のような接尾辞を付けると**規則がそもそも噛まない**
  // （「確定済みの質問が残っていたら落とす」が空振りする）。
  // 合成であることは `why_now` に書く。**この検体は実ファイルへ書き戻さない**ので、
  // 台帳の質問と混ざる経路は無い。
  //
  // **検体は実データの状態に依存させない。**id を実在の期限（social-insurance）に
  // 合わせた版を一度作ったが、**その期限が確定した瞬間に送信経路の検体が
  // 「既に確定している」で止まり、12件が落ちた。**
  // 実在の id を借りるかぎり、**台帳が動くたびに検体が壊れる。**
  // だから**検体は自分の期限も持つ** —— 下の SYNTHETIC_OBLIGATION を obligations へ混ぜる。
  const SYNTHETIC_ASK = {
    id: '検体-未確定',
    field: '税務',
    status: 'draft',
    why_now: '**検体。**実台帳に質問が0件のときだけ使う',
    question: '検体の質問です。実際には送りません。',
  };
  const SYNTHETIC_OBLIGATION = {
    id: '検体-未確定',
    title: '検体の期限',
    recurrence: 'annual',
    next_due: null,
    confirmed_by_owner: false,
    unconfirmed_reason: '**検体。**自己テストのためだけに存在する',
    what_breaks: '**検体。**壊れても何も止まらない',
  };
  // 実データの期限に**足す**（置き換えない）。他の検体は実データを見続ける。
  obligations.deadlines = [...(obligations.deadlines ?? []), SYNTHETIC_OBLIGATION];
  const withAsks = (d) => {
    if (!Array.isArray(d.asks)) d.asks = [];
    if (!d.asks.length) d.asks.push({ ...SYNTHETIC_ASK });
    return d;
  };

  /** 実データを使い、enabled だけ立てる（既定 false のままだと他の規則を試せない）。 */
  const on = (over = {}) => {
    const d = withAsks(JSON.parse(JSON.stringify(real)));
    d.policy.auto_send.enabled = true;
    d.policy.auto_send.dry_run = false;
    Object.assign(d.policy.auto_send, over);
    return d;
  };
  const addOtherFieldAsk = (d) => {
    const field = '検体-別分野';
    d.experts.push({ ...d.experts.find((e) => e.field === d.asks[0].field), field });
    d.asks.push({ ...d.asks[0], field });
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
    // [2026-09-01] **質問が0件になると、この2件は主語を失う。**
    // 「実台帳のまま」で見せたかったのは「送る材料が揃っていて、止めているのは
    // dry_run だけ」という状態だが、質問が無ければ止めているのは材料の不在のほう。
    //
    // **どちらの状態でも黙らない形にした** —— 質問があれば従来どおり dry_run で
    // 止まることを見る。0件なら「材料が無いので止まる」ことを見る。
    // **そのうえで、錠前が1枚であること自体は検体で必ず確かめる。**
    // （0件のときに skip すると、**送信経路の唯一の錠前を誰も見なくなる**）
    ['**実台帳のまま評価しても send にはならない**（材料が無いか、dry_run で止まる）', () => {
      const r = ev(real);
      assert(r.decision !== 'send', `実台帳で send が出た: ${JSON.stringify(r)}`);
      if (real.asks?.length) {
        assert(r.decision === 'would_send' && /dry_run/.test(r.why),
          `質問が在るのに dry_run で止まっていない: ${JSON.stringify(r)}`);
      } else {
        assert(r.decision === 'hold' && /材料が無い/.test(r.why),
          `質問が0件なのに材料の不在で止まっていない: ${JSON.stringify(r)}`);
      }
    }],
    ['**dry_run を倒すと send になる**（錠前が1枚であることを隠さない）', () => {
      const d = withAsks(JSON.parse(JSON.stringify(real)));
      d.policy.auto_send.enabled = true;
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
    ['承認の boolean が欠落・非 boolean なら送らない', () => {
      for (const value of [undefined, null, 'false', 'true', 0, 1]) {
        const kill = on(); kill.policy.kill_switch = value;
        held(ev(kill), 'kill_switch');
        const enabled = on({ enabled: value });
        held(ev(enabled), '自動送信');
        const engaged = on(); engaged.experts.find((e) => e.field === engaged.asks[0].field).engaged = value;
        held(ev(engaged), '依頼していない');
      }
    }],
    ['dry_run は false だけ実送信で、未設定や誤型は従来どおり送らない', () => {
      for (const dry_run of [undefined, null, 'false', 0]) {
        assert(ev(on({ dry_run })).decision === 'would_send', 'dry_run の false 以外で送った');
      }
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
    ['不正な件数で日次上限・返事待ち上限を通過しない', () => {
      for (const key of ['sentToday', 'openAsks']) {
        for (const value of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1, '0', null]) {
          held(ev(on(), null, { [key]: value }), key);
        }
      }
    }],
    ['不正な現在時刻で送信間隔を通過しない', () => {
      for (const now of [NaN, Infinity, '2026-08-28', 8.64e16]) {
        held(ev(on(), null, { now }), '現在時刻');
      }
    }],
    ['直前送信日時の不正・未来・暦日の丸めを送信なしと扱わない', () => {
      for (const last of ['unknown', '', null, 0, '2026-02-30T00:00:00Z',
        '2026-08-29T00:00:00Z', '2026-08-01T00:00:00']) {
        held(ev(on(), null, { lastSentAtByField: { 税務: last } }), '直前送信日時');
      }
      for (const lastSentAtByField of [null, [], 'unknown']) {
        held(ev(on(), null, { lastSentAtByField }), '直前送信日時');
      }
    }],
    ['同じ分野の送信履歴があるのに直前日時が無ければ送らない', () => {
      const d = on(); d.sent = [{ field: '税務', at: '2026-08-01T00:00:00Z' }];
      held(ev(d), '送信履歴があるのに');
    }],
    ['有効な日時で同じ分野の不正履歴を隠さない', () => {
      for (const at of ['unknown', undefined, '2026-08-29T00:00:00Z']) {
        const d = on(); d.sent = [{ field: '税務', at }, { field: '税務', at: '2026-08-01T00:00:00Z' }];
        const plan = planAll(d, obligations, { now: NOW });
        assert(plan.send.length === 0, '不正履歴があるのに send が出た');
        held(plan.plans[0], '送信履歴');
      }
    }],
    ['不正な他分野の履歴・返信日時を既知の件数へ丸めない', () => {
      for (const record of [{ field: '別分野', at: 'unknown' },
        { field: '別分野', at: '2026-08-01T00:00:00Z', answered_at: 'unknown' }]) {
        const d = on(); d.sent = [record];
        const plan = planAll(d, obligations, { now: NOW });
        assert(plan.send.length === 0, '不正履歴があるのに send が出た');
        assert(plan.plans[0].decision === 'hold', '不正履歴を hold にしなかった');
      }
    }],
    ['null の送信履歴で例外を投げず、理由付きで保留する', () => {
      const d = on(); d.sent = [null];
      const plan = planAll(d, obligations, { now: NOW });
      assert(plan.send.length === 0, 'null の履歴があるのに send が出た');
      assert(plan.plans.length === d.asks.length, '不正履歴で評価結果を失った');
      held(plan.plans[0], '送信履歴');
    }],
    ['送信履歴より古い直前日時へ戻して間隔を通過しない', () => {
      const d = on(); d.sent = [{ field: '税務', at: '2026-08-26T00:00:00Z' }];
      held(ev(d, null, { lastSentAtByField: { 税務: '2026-08-01T00:00:00Z' } }), '送信履歴より古い');
    }],
    ['UTC 当日の実履歴を既定の sentToday=0 で消さない', () => {
      const d = on(); d.sent = [{ field: '別分野', at: '2026-08-28T09:00:00+09:00', answered_at: '2026-08-28T00:00:00Z' }];
      const plan = planAll(d, obligations, { now: NOW });
      assert(plan.send.length === 0, '当日の上限に達しているのに send が出た');
      held(plan.plans[0], '上限 1 件');
    }],
    ['異なる offset 表記でも最も新しい実時刻で間隔を判定する', () => {
      const d = on(); d.sent = [
        { field: '税務', at: '2026-08-21T00:30:00Z' },
        { field: '税務', at: '2026-08-21T09:00:00+09:00' },
      ];
      held(planAll(d, obligations, { now: NOW }).plans[0], '間隔 7 日');
    }],
    ['有効な過去履歴と間隔境界・返事待ち境界は従来どおり通す', () => {
      const d = on(); d.sent = [{ field: '税務', at: '2026-08-21T09:00:00+09:00' }];
      assert(planAll(d, obligations, { now: NOW }).plans[0].decision === 'send', 'ちょうど 7 日前の履歴を拒否した');
      assert(ev(on(), null, { openAsks: 2 }).decision === 'send', '返事待ち上限ちょうどの従来境界を変えた');
    }],
    ['同じ batch の日次上限を send と would_send の両方で予約する', () => {
      for (const dry_run of [false, true]) {
        const d = addOtherFieldAsk(on({ dry_run }));
        const plan = planAll(d, obligations, { now: NOW });
        assert(plan.plans[0].decision === (dry_run ? 'would_send' : 'send'), '最初の有効な質問を止めた');
        held(plan.plans[1], '上限 1 件');
      }
    }],
    ['日次上限を広げても同じ batch の同分野の間隔を予約する', () => {
      const d = on({ daily_cap: 2 }); d.asks.push({ ...d.asks[0] });
      const plan = planAll(d, obligations, { now: NOW });
      assert(plan.send.length === 1, '同じ相手へ batch 内で繰り返し送る');
      held(plan.plans[1], '間隔 7 日');
    }],
    ['__proto__ の分野名でも同じ batch の送信間隔を予約する', () => {
      const d = on({ daily_cap: 2 });
      d.experts.find((e) => e.field === d.asks[0].field).field = '__proto__';
      d.asks[0].field = '__proto__';
      d.asks.push({ ...d.asks[0] });
      assert(validate(d, { obligations }).length === 0, '有効な分野名の検体でない');
      const plan = planAll(d, obligations, { now: NOW });
      assert(plan.send.length === 1, '特殊な分野名で batch の予約を迂回した');
      held(plan.plans[1], '間隔 7 日');
    }],
    ['実履歴の当日件数と batch の予約件数を合わせて上限を守る', () => {
      const d = addOtherFieldAsk(on({ daily_cap: 2 }));
      d.sent = [{ field: '別分野', at: '2026-08-28T00:00:00Z', answered_at: '2026-08-28T00:00:00Z' }];
      const plan = planAll(d, obligations, { now: NOW });
      assert(plan.send.length === 1, '実履歴と予約を合わせた上限を超えた');
      held(plan.plans[1], '上限 2 件');
    }],
    ['返事待ちの実履歴と batch の予約件数を合わせて上限を守る', () => {
      const d = addOtherFieldAsk(on({ daily_cap: 2 }));
      d.sent = [{ field: '別分野1', at: '2026-08-01T00:00:00Z' }, { field: '別分野2', at: '2026-08-01T00:00:00Z' }];
      const plan = planAll(d, obligations, { now: NOW });
      assert(plan.send.length === 1, '返事待ちの予約件数を無視した');
      held(plan.plans[1], '返事待ちが 3 件');
    }],
    ['異なる分野で全上限内なら同じ batch の両方を通す', () => {
      const d = addOtherFieldAsk(on({ daily_cap: 2 }));
      assert(planAll(d, obligations, { now: NOW }).send.length === 2, '有効な batch を拒否した');
    }],
    ['kill_switch を立てると止まる', () => {
      const d = on(); d.policy.kill_switch = true;
      held(ev(d), 'kill_switch');
    }],

    // --- 台帳の検査 -------------------------------------------------------
    ['**アドレスを直接書いたら落とす**（このリポジトリは公開）', () => {
      const p = validate(broken(real, (d) => { withAsks(d);
        d.experts.find((e) => e.field === '税務').address_source = 'someone@example.com';
      }), { obligations });
      assert(p.some((x) => x.includes('第三者の個人情報を置かない')), p.join(' / '));
    }],
    ['依頼していないのに理由が無ければ落とす', () => {
      const p = validate(broken(real, (d) => { withAsks(d);
        delete d.experts.find((e) => !e.engaged).why_not;
      }), { obligations });
      assert(p.some((x) => x.includes('why_not が無い')), p.join(' / '));
    }],
    ['**experts に無い向き先の ask は落とす**', () => {
      const p = validate(broken(real, (d) => { withAsks(d); d.asks[0].field = '占い'; }), { obligations });
      assert(p.some((x) => x.includes('居ない相手を向き先にしない')), p.join(' / '));
    }],
    // [2026-09-01] **`asks[1]` を前提にしていた。**質問が1件に減った日に
    // `Cannot set properties of undefined` で落ちた ——
    // **検査が壊れたのではなく、検体が台帳の行数に寄りかかっていた。**
    // 見たいのは「向き先の居ない draft を落とすか」なので、**検体を自分で作る。**
    ['**依頼していない相手を向き先にした draft を落とす**（この検査を作った当の穴）', () => {
      const p = validate(withExtraAsk(real, SYNTHETIC_ASK, (a) => { a.field = '社会保険・労務'; a.status = 'draft'; }),
        { obligations });
      assert(p.some((x) => x.includes('届かない質問を送る側に置かない')), p.join(' / '));
    }],
    ['parked にすれば置いておける（向き先が決まるまで消さない）', () => {
      const p = validate(withExtraAsk(real, SYNTHETIC_ASK, (a) => { a.field = '社会保険・労務'; a.status = 'parked'; }),
        { obligations });
      assert(p.some((x) => x.includes('届かない質問を送る側に置かない')) === false,
        `parked が落ちている: ${p.join(' / ')}`);
    }],
    ['知らない status は落ちる', () => {
      const p = validate(broken(real, (d) => { withAsks(d); d.asks[0].status = 'sent'; }), { obligations });
      assert(p.some((x) => x.includes('のどれでもない')), p.join(' / '));
    }],
    // [2026-09-01] **`real` をそのまま渡していた。**質問が0件になった日に空振りした ——
    // **落とすべき行が存在しないので、検査が正しくても何も出ない。**
    // 「実データが偶然この形を持っている」に寄りかからない。
    ['確定済みの質問が残っていたら落とす', () => {
      const ob = JSON.parse(JSON.stringify(obligations));
      const d = withAsks(JSON.parse(JSON.stringify(real)));
      const target = ob.deadlines.find((x) => x.id === d.asks[0].id);
      assert(target, `質問「${d.asks[0].id}」に対応する期限が台帳に無い`);
      target.confirmed_by_owner = true;
      target.next_due = '2099-01-31';
      const p = validate(d, { obligations: ob });
      assert(p.some((x) => x.includes('答えが出た質問を残さない')), p.join(' / '));
    }],
    ['上限が正の数でなければ落とす', () => {
      const p = validate(broken(real, (d) => { withAsks(d); d.policy.auto_send.daily_cap = 0; }), { obligations });
      assert(p.some((x) => x.includes('daily_cap')), p.join(' / '));
    }],
    ['件数上限は正の安全な整数・間隔は有限の正数でなければ落とす', () => {
      for (const key of ['daily_cap', 'max_open_asks', 'min_days_between_asks']) {
        const invalid = [NaN, Infinity, -1, 0, '1', null];
        if (key !== 'min_days_between_asks') invalid.push(0.5, Number.MAX_SAFE_INTEGER + 1);
        for (const value of invalid) {
          const d = on({ [key]: value });
          assert(validate(d, { obligations }).some((x) => x.includes(key)), `${key}=${value} が検査を通った`);
          held(ev(d), key);
        }
      }
      const d = on({ min_days_between_asks: 0.5 });
      assert(validate(d, { obligations }).length === 0, '有限の正の間隔を拒否した');
      assert(ev(d).decision === 'send', '有効な小数の間隔を拒否した');
    }],
    ['set_by が無ければ落とす', () => {
      const p = validate(broken(real, (d) => { withAsks(d); delete d.experts[0].set_by; }), { obligations });
      assert(p.some((x) => x.includes('set_by が無い')), p.join(' / '));
    }],

    // --- plan -------------------------------------------------------------
    ['**実データでは1件も送らない**', () => {
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
