/**
 * Experiment ledger — the file that makes "we'll decide on the 29th" binding.
 *
 * The 2026-07-01/02 retitles were frozen with an evaluation date written into a
 * report body. The date passed, nobody was holding it, and twelve pages sat
 * untouchable for six weeks while the reports kept repeating "decide on 7/29".
 * Nothing was broken — there was simply no artifact that could be *overdue*.
 * This file is that artifact, and `check-experiments.mjs` reads it in CI.
 *
 * Status is the lifecycle; decision is the outcome. The brief lists
 * keep/revert/iterate alongside the lifecycle values, but an experiment that is
 * "keep" is an experiment that has been evaluated, so those live in `decision`
 * and `status` goes to `evaluated`. Storing the same fact twice invites the two
 * copies to disagree.
 *
 * `due` and `overdue` are deliberately NOT stored. They are functions of
 * evaluation_at and today's date, so deriving them means the ledger cannot go
 * stale by sitting still — the failure mode this whole file exists to prevent.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const LEDGER_PATH = path.join(ROOT, 'growth/experiments/experiments.json');

export const STATUSES = ['planned', 'running', 'frozen', 'evaluated', 'cancelled'];
/**
 * `abandoned` is the outcome the first four could not express: the lever was
 * tested, and the metric is not reachable by any amount of further iteration.
 *
 * `/blog/line-keep-alternative` is the case that forced it. Its queries are
 * confirmations — 「line keepメモ 終了」, 「line keepとkeepメモの違い」 — and the
 * title already answers them 「LINE Keepは終了・Keepメモは継続中」, so the
 * searcher is satisfied on the results page and never needs the click. Two
 * rounds went in before that was understood. `keep` would have said the title
 * is fine and implied the CTR is still open; `iterate` promised a third round;
 * `inconclusive` invited someone to re-run it with more data. All three lead
 * back to the same page. `abandoned` says the target is unreachable and the
 * page should leave the CTR working lists — which is the actual finding.
 */
export const DECISIONS = ['keep', 'revert', 'iterate', 'inconclusive', 'abandoned'];
/** Statuses whose evaluation date can come due. */
export const OPEN_STATUSES = ['running', 'frozen'];

export function loadLedger() {
  if (!fs.existsSync(LEDGER_PATH)) return { version: 1, experiments: [] };
  return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
}

export function saveLedger(ledger) {
  ledger.experiments.sort((a, b) =>
    (a.started_at || '').localeCompare(b.started_at || '') || a.id.localeCompare(b.id));
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n');
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function isOpen(exp) {
  return OPEN_STATUSES.includes(exp.status);
}

export function isDue(exp, asOf = today()) {
  return isOpen(exp) && !!exp.evaluation_at && exp.evaluation_at <= asOf;
}

export function daysOverdue(exp, asOf = today()) {
  if (!isDue(exp, asOf)) return 0;
  const ms = Date.parse(asOf) - Date.parse(exp.evaluation_at);
  return Math.max(0, Math.round(ms / 86400000));
}

/**
 * Structural validation. Returns a list of human-readable problems; empty means
 * the ledger is well-formed. Called by the CI gate so a malformed entry fails
 * loudly instead of being silently skipped by the overdue scan — an experiment
 * that cannot be parsed is an experiment that can never come due.
 */
/** 対照群の型。**「無い」も選択肢だが、選んだと書かせる。** */
export const CONTROL_KINDS = ['holdout', 'pre_post', 'none'];

export function validate(ledger) {
  const problems = [];
  const seen = new Set();
  const DATE = /^\d{4}-\d{2}-\d{2}$/;

  for (const e of ledger.experiments || []) {
    const at = `experiment ${e.id || '(missing id)'}`;
    if (!e.id) problems.push('an experiment has no id');
    else if (seen.has(e.id)) problems.push(`${at}: duplicate id`);
    else seen.add(e.id);

    if (!e.page) problems.push(`${at}: missing page`);
    if (!e.type) problems.push(`${at}: missing type`);
    if (!STATUSES.includes(e.status)) {
      problems.push(`${at}: status ${JSON.stringify(e.status)} not one of ${STATUSES.join('/')}`);
    }
    for (const field of ['started_at', 'evaluation_at']) {
      if (e[field] && !DATE.test(e[field])) {
        problems.push(`${at}: ${field} ${JSON.stringify(e[field])} is not YYYY-MM-DD`);
      }
    }
    if (isOpen(e) && !e.evaluation_at) {
      problems.push(`${at}: status ${e.status} requires evaluation_at (otherwise it can never come due)`);
    }

    // 【2026-08-25】変更前の値を記録していない実験は、**評価日が来ても判定できない。**
    //
    // 評価済み12件のうち**7件が inconclusive で、原因は全部これ1つ**だった
    // （2026-07-01〜02 のバッチ。baseline の4項目が全部 null）。
    // **半分以上の実験が、測る前に測定不能が確定していた。**
    //
    // evaluation_at が無い実験を落とすのと同じ理由でここに置く ——
    // どちらも「評価日が来ても判定できない」ことが**始める前から分かっている**形。
    //
    // 【この規則は一度書き直している。理由は残す】
    // 最初は「baseline の値、無いなら `baseline.note` に理由」で通した。
    // **その形だと7件は全部すり抜ける。**あの7件の note には
    // "No pre-change GSC value was recorded for this page." と書いてあり、
    // これは「置けないと決めた理由」ではなく**失敗そのものを文にしたもの**だからだ。
    // 何か書いてあれば通る検査は、書いた内容ではなく欄が埋まったことを見ている。
    //
    // なので **control.kind に紐付ける。**`pre_post` は「前と後を比べる」と
    // 宣言した実験で、**前が無い pre_post は実験ではなく矛盾**である。
    // ここは文章では抜けられない。値が要る。
    // 前が本当に取れないなら、それは pre_post ではない —— `none` か `holdout` を
    // 選ぶことになり、`control.note` でどう比べるのかを書くことが既に強制される。
    // **「測れない」を宣言する場所は baseline の隅ではなく、比較設計のほう。**
    //
    // いま走っている21件は pre_post 17 / none 4 で、**pre_post は全部値を持っている。**
    // 運用はすでに直っていて、直っていることを誰も守っていなかった。
    // ここはその規律を固定するだけで、現状のどれも落とさない。
    //
    // 評価済みのものは見ない。**履歴は履歴**で、7件の note には
    // 記録が無かったことがすでに書いてある（消すと同じ失敗の証拠が消える）。
    if (isOpen(e)) {
      const b = e.baseline;
      const hasValue = b && Object.entries(b)
        .some(([k, v]) => k !== 'note' && v !== null && v !== undefined);
      if (e.control?.kind === 'pre_post' && !hasValue) {
        problems.push(`${at}: control.kind が pre_post なのに baseline の値が無い`
          + ' —— **前と後を比べると宣言して、前を記録していない。**'
          + '評価日が来ても判定できないことが、始める前から確定している'
          + '（2026-07のバッチはこれで7件が inconclusive になった）。'
          + '前が本当に取れないなら pre_post ではない。control.kind を none か holdout にして、'
          + '何と比べるのかを control.note に書くこと');
      } else if (!hasValue && !b?.note) {
        problems.push(`${at}: baseline が無い`
          + ' —— 変更前の値か、置けない理由（baseline.note）のどちらかが要る');
      }
    }
    if (e.started_at && e.evaluation_at && e.evaluation_at < e.started_at) {
      problems.push(`${at}: evaluation_at precedes started_at`);
    }
    if (e.status === 'evaluated') {
      if (!DECISIONS.includes(e.decision)) {
        problems.push(`${at}: evaluated experiments need decision one of ${DECISIONS.join('/')}`);
      }
      if (!e.evaluated_at) problems.push(`${at}: evaluated experiments need evaluated_at`);
    }
    if (e.decision != null && !DECISIONS.includes(e.decision)) {
      problems.push(`${at}: decision ${JSON.stringify(e.decision)} not one of ${DECISIONS.join('/')}`);
    }

    // 対照群・最低サンプル数・停止条件（2026-08-22追加）
    //
    // ここを空欄にできると、実験は「変えて、あとで良かったことにする」装置になる。
    // **対照群が無いこと自体は禁じていない** — 置けない実験のほうが多い。
    // 禁じているのは**無いのに書かないこと**で、`kind: "none"` と理由を必ず書かせる。
    // 空欄と「無いと決めた」は違う、という authority-matrix と同じ規律。
    if (isOpen(e)) {
      const c = e.control;
      if (!c || !CONTROL_KINDS.includes(c.kind)) {
        problems.push(`${at}: control.kind が ${CONTROL_KINDS.join('/')} のいずれかで要る`
          + '（対照群が無いなら "none" と書く。空欄と「無いと決めた」は違う）');
      } else {
        if (!c.note) problems.push(`${at}: control.note が無い — どういう比較をしているかが残らない`);
        if (c.kind === 'pre_post' && !c.confounders) {
          problems.push(`${at}: pre_post なのに confounders が無い`
            + '（季節性・アルゴリズム更新を分離できないことを明示しないと、因果を主張しているのと同じになる）');
        }
      }
      const m = e.min_sample;
      if (!m || typeof m.threshold !== 'number' || !m.metric) {
        problems.push(`${at}: min_sample.metric と threshold が要る`
          + '（母数の下限を決めずに評価日を迎えると、ノイズを結論にする）');
      } else if (!m.rationale) {
        problems.push(`${at}: min_sample.rationale が無い — その閾値の出どころが残らない`);
      }
      if (!Array.isArray(e.stop_conditions) || e.stop_conditions.length === 0) {
        problems.push(`${at}: stop_conditions が空`
          + '（**止める条件を決めていない実験は止まらない。**評価日が来ても「もう少し様子を見る」で延びる）');
      }
    }
  }
  return problems;
}

export function summarize(ledger, asOf = today()) {
  const exps = ledger.experiments || [];
  const due = exps.filter((e) => isDue(e, asOf));
  return {
    total: exps.length,
    open: exps.filter(isOpen).length,
    due,
    overdue: due.filter((e) => daysOverdue(e, asOf) > 0),
    byStatus: exps.reduce((acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1;
      return acc;
    }, {}),
  };
}
