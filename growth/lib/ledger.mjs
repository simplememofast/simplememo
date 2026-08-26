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
/**
 * `measurement_failed` は 2026-08-25 に足した。**`inconclusive` が2種類を飲んでいた。**
 *
 * 当時 `inconclusive` は7件あり、**7件すべてが `baseline` 全欄 null**、
 * つまり「変更前の値を記録しないまま変えた」だった。1件も
 * 「測れたが母数が足りない」ではなかった。
 *
 * この2つは待ったときの挙動が正反対になる。母数不足は**待てば解ける**が、
 * 基準値の未記録は**待っても永久に解けない**（過去の GSC は遡って取れない）。
 * 同じ語に入れると、後者を前者と思って待ち続けることになり、実際に
 * 6週間そうなっていた（このファイル冒頭の経緯）。
 *
 * さらに悪いことに、7件が同じ理由で潰れていたのに、**同じ理由が7回並んでいる
 * こと自体を誰も検出できなかった。**`data/operating-memory.json` の
 * lesson_key はその検出を持つために作った。
 */
export const DECISIONS = ['keep', 'revert', 'iterate', 'inconclusive', 'measurement_failed', 'abandoned'];
/**
 * 基準値を1つでも持っているか。**測っている指標の名前で判定しない。**
 *
 * 最初この関数は GSC の4欄（clicks / impressions / ctr / position）を見ていたが、
 * それだと **GA4 起点の実験2件を「基準値なし」と誤判定した。**
 * `cta-2026-08-10-*` は app_store_click / sessions / session_to_app_store など
 * GA4 と App Store Connect の値で基準を取っており、GSC の欄は使っていない。
 * 指標名を固定すると、**測り方が違うだけの実験を「測っていない」ことにする。**
 *
 * 判定は「数値が1つでも入っているか」だけにする。実際にこれで
 * 2026-07-01/02 の7件（全欄 null・数値ゼロ）だけが残り、
 * 進行中21件は全件が基準値ありになる —— 誤検知ゼロで意図した7件を捕まえる。
 */
/**
 * **この実験は「そのページの GSC クリック率」を測っているか。**
 *
 * [2026-08-25] この台帳は**均質ではない。**進行中21件の target_metric は
 * ctr / brand_search_impressions / ai_citations / app_store_click /
 * next_step_click / position / impressions / rich_result_impressions と
 * 8種類あり、baseline の出どころも GSC・GA4・ブランド検索クエリ合計・
 * AI引用数とばらばら。**「baseline に数値がある」は「同じものを測っている」ではない。**
 *
 * この判定を関数にしたのは、**同じ思い込みが1セッションで2回起きたから。**
 *
 *   1回目: hasBaseline を GSC の4欄で書き、GA4起点の実験2件を
 *          「基準値なし」と誤判定した
 *   2回目: stop-loss の対象抽出で baseline をページCTRとみなし、
 *          `aio-2026-08-11-answer-blocks` に「CTR 13.53% → 1.70%、
 *          相対87.4%低下」という**偽陽性**を出した。実際にはあの baseline は
 *          ブランド検索14クエリの合計で、target_metric は
 *          brand_search_impressions、判定日は 2026-11-11。
 *          **測っているものがそもそも違った。**
 *
 * どちらも「台帳の行は同じ形をしている」という前提から来ている。
 * **前提のほうを1箇所に閉じ込める。**
 */
export function measuresPageCtr(exp) {
  if (!exp || exp.target_metric !== 'ctr') return false;
  // ページ集合（"(9 pages: …)"）は GSC の1行に対応しない。
  if (typeof exp.page !== 'string' || !exp.page.startsWith('/')) return false;
  const b = exp.baseline;
  if (!b) return false;
  // クリックと表示の両方が要る。CTR だけ書いてある行からは区間が作れない。
  return Number.isFinite(b.clicks) && Number.isFinite(b.impressions) && b.impressions > 0;
}

export function hasBaseline(exp) {
  const b = exp?.baseline;
  if (!b || typeof b !== 'object') return false;
  return Object.values(b).some((v) => typeof v === 'number' && Number.isFinite(v));
}
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

    // [2026-08-25] **基準値の未記録を `inconclusive` に隠さない。**
    // 母数不足は待てば解けるが、基準値未記録は待っても解けない。
    // 同じ語に入れると、後者を前者と思って待ち続けることになる。
    if (e.decision === 'inconclusive' && !hasBaseline(e)) {
      problems.push(`${at}: decision が inconclusive だが baseline に数値が1つも無い`
        + ' — これは「測れたが判断できない」ではなく「測っていない」。'
        + ' measurement_failed を使うこと（待っても解けないことを、待てば解けるように見せない）');
    }

    // **これが7件の再発を止める歯止め。**走り出す時点で基準値を要求する。
    // 評価時に「記録されていませんでした」と分かるのでは遅い —— 過去の
    // GSC は遡れないので、その実験は最初から情報を生まない。
    if (isOpen(e) && !hasBaseline(e)) {
      problems.push(`${at}: status ${e.status} なのに baseline に数値が1つも無い`
        + ' — **変更前の値を記録する前に変えると、その実験は評価日に必ず'
        + ' measurement_failed になる。**2026-07-01/02 の7件がこれで潰れた。'
        + ' 測れないと決めたなら baseline.note に理由を書き、control.kind を "none" にすること');
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
