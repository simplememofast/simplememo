#!/usr/bin/env node
/**
 * 運転台帳 — 共通実行IDで「1つの改善サイクルが完走したか」を数える。
 *
 *   node scripts/autopilot-runs.mjs            # 指標サマリ
 *   node scripts/autopilot-runs.mjs --json     # 機械可読（status JSON / 日報用）
 *   node scripts/autopilot-runs.mjs --write-status # 同じ内容を status JSON の runs へ書く
 *   node scripts/autopilot-runs.mjs --check    # CI: 台帳の形と整合を検証（壊れていたら exit 1）
 *   node scripts/autopilot-runs.mjs --selftest # 検査そのものの自己検査（台帳を読まない）
 *   node scripts/autopilot-runs.mjs --since 2026-08-15
 *   node scripts/autopilot-runs.mjs --append --run-id ... --date ... --route ... --outcome ...
 *        [--failure-class ... --failed-at ... --detected-at ... --needs-triage true]
 *
 * 【何を測るか】外部レビュー（2026-08-22）が求めた指標のうち、
 * 実行を一意に指す識別子があれば数えられるもの:
 *
 *   AI完走率     = shipped / attempted
 *   人間介入率   = 介入のあった実行 / attempted
 *   変更失敗率   = (no_artifact + failed + cancelled) / attempted
 *   経路別内訳   = 主系 vs 副系（＝バックアップ切替が起きたことの機械的な証拠）
 *   無運転日     = どの経路も動かなかった日（**これだけは正常系ではない**）
 *
 * 【単位を1つにしない — 2026-08-22追記】
 * `human_intervention_rate` は「その実行に人が1回でも触ったか」の**二値**で、
 * YAMLの権限を1行直しただけの日も丸ごと「介入あり」になる。これは
 * **AIの自律性を構造的に過少評価する。** 実測でも、run単位では 53.8% だが、
 * 同期間の変更行の 94.2% はAI著者のコミットだった（scripts/code-authorship.mjs の実測。
 * 98.8% と書いていた時期があるが、**その値はどの数え方でも再現できなかった**）。
 *
 * かといって都合のよい分母に乗り換えるのは goodharting そのものなので、
 * **総計と内訳の両方を必ず出す**。とくに分けるべきは:
 *   - **成果物への介入**（人が記事を書いた／書き直した）＝ AIの成果が信用されていない
 *   - **基盤の修理**（ワークフロー・Runbook・スクリプト）＝ 基盤が脆い
 * この2つは自律性について正反対のことを言っており、混ぜると両方見えなくなる。
 *
 * 【分母を attempted にする理由】
 * 秘密鍵未設定によるGateスキップは「意図的に静かに寝る」設計で、着手していない。
 * これを失敗に数えると、正しく動いている安全装置が失敗率として現れる。
 * 逆に no_run（どの経路も動かなかった日）は着手すべきだったのに動かなかった日なので、
 * 完走率の分母には入れないが**別枠で必ず表示する**。隠すと「稼働率100%」に見える。
 *
 * 【費用をここに持たない】実費は data/autopilot-cost.json が正で、external_ref
 * （GitHub の run id）で結合する。同じ数字の出所を2つ作らない。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLedger, readLedgerScenarios } from './lib/read-ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RUNS_PATH = path.join(ROOT, 'data/autopilot-runs.json');
export const COST_PATH = path.join(ROOT, 'data/autopilot-cost.json');
export const STATUS_PATH = path.join(ROOT, 'data/autopilot-status.json');

export const OUTCOMES = [
  'shipped', 'no_artifact', 'failed', 'cancelled',
  'skipped_gate', 'skipped_duplicate', 'no_run',
];
/** 着手した扱いにしない outcome。分母から外れる。 */
const NOT_ATTEMPTED = new Set(['skipped_gate', 'skipped_duplicate', 'no_run']);
/** 着手したが本番に何も出せなかった outcome。変更失敗率の分子。 */
const FAILED = new Set(['no_artifact', 'failed', 'cancelled']);

/**
 * 台帳が何日ぶん書かれていないかの許容。**これを超えたら --check が落ちる。**
 *
 * 2026-08-23 にこの検査を足した理由:
 * 主系が初めて自走出荷した（run 32599191984 → PR #538）のに、台帳には行が無く、
 * `--check` は素通りした。**台帳は「主系 0/3 出荷」と言い続けていた。**
 * 行の形はどれも正しかったので、既存の validate() は何も言えなかった。
 *
 * 壊れた行は検知できて、**書かれなかった行は検知できない**。
 * 前者は指標を嘘にするが、後者は指標を止める — 止まった指標は、
 * 「変化が無い」と見分けがつかないぶん質が悪い。
 *
 * 1日にしてあるのは、当日ぶんが夜になるまで書かれないのは普通だから。
 * 2日連続で書かれていなければ、それは運用が止まっている。
 */
export const MAX_LEDGER_LAG_DAYS = 1;

/** 今日（JST）。台帳の日付が JST なので、比較もJSTで揃える。 */
export function todayJst(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * 台帳が最後に書かれてから何日経ったか。
 *
 * **`days_behind` は「実行が無かった日数」ではない。**「記録が無い日数」。
 * 実行が無い日も no_run として1行書く決まりなので、行が無い＝記録していない。
 */
export function staleness(doc, today = todayJst()) {
  const dates = (doc.runs || []).map((r) => r.date_jst).filter(Boolean).sort();
  const latest = dates.at(-1) ?? null;
  const days = latest
    ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${latest}T00:00:00Z`)) / 864e5)
    : null;
  return {
    latest, today,
    days_behind: days,
    max_days: MAX_LEDGER_LAG_DAYS,
    stale: days === null || days > MAX_LEDGER_LAG_DAYS,
  };
}

export function load(file = RUNS_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * 運転台帳と `data/autopilot-status.json` の突き合わせ。
 *
 * 2026-08-23 にこの検査を足した理由（`staleness()` とは別の実害）:
 * 主系が初自走で `/obsidian/pricing/` を出荷し（PR #538・06:33 JST）、台帳にも
 * `ap-20260823-actions / shipped` が入った。ところが **status JSON だけが
 * 08-22 のまま**だった。10:00 JST の日報はその古いファイルを読み、
 * 「公開記事: 0（当日分の実行記録なし）」と報告した。
 * **初めて自走した日を、上流停止として報せたことになる。**
 *
 * なぜ既存の検査が黙っていたか:
 *   - `validate()` は行の形しか見ない。status JSON を知らない
 *   - `staleness()` は台帳が書かれているかしか見ない。台帳は正しかった
 *   - `autopilot-health.yml` は「デフォルトブランチの status」と「本番の status」を
 *     比べる。**両方が同じだけ古いと一致してしまう**（配信遅れは見えるが、
 *     そもそも書かれなかったことは見えない）
 *
 * つまり status JSON の鮮度を、status JSON 以外の情報源から言える者がいなかった。
 * 台帳がその独立した証人になる。両方向を見る:
 *   - 台帳のほうが新しい → status JSON が書かれなかった（08-23 の実害）
 *   - status JSON のほうが新しい → 台帳の行が書かれなかった（PR #540 の実害。
 *     `staleness()` は許容1日ぶんは黙るので、当日中はこちらでしか捕まらない）
 */
/**
 * この検査が「実行した回」と見なす行。
 *
 * 【2026-08-25 統合時に追加】日次アクチュエータ（scripts/autopilot-act.mjs）が
 * reconcile-runs で埋めた行（source が `act-` 始まり）は、**セッションが実行した
 * 回ではない。** Actions API から機械的に写した「落ちた回の記録」で、成功した回は
 * PR特定が要るため意図的に写さない。つまり status JSON に書くべき成果を持たない。
 *
 * ここを区別しないと、**主系が落ちた日にアクチュエータ自身が止まる**:
 *   1. 主系が失敗する（セッションが status JSON を書けない）
 *   2. 09:00 のアクチュエータが台帳へ ap-YYYYMMDD-actions/failed を追記する
 *   3. 台帳の最終記入だけが翌日へ進み、status JSON は前日のまま
 *   4. この検査が落ち、**アクチュエータのPRがマージされない**
 * 台帳を埋めるための経路が、埋めた結果で自分を止めることになる。
 * しかも主系が壊れている日にだけ起きるので、**要るときに限って効かない。**
 */
const isSessionAuthored = (r) => !String(r.source ?? '').startsWith('act-');

/**
 * status JSON の `runs` ブロックが持つべき「数え直せる事実」。
 *
 * **`--json` が吐く形と同じ数え方を、検査側からも使う。**日報と公開ページと
 * プレスリリースが読むのはこのブロックで、`summarize()` の出力ではない。
 */
export function runsFacts(doc) {
  const runs = doc?.runs || [];
  const days = [...new Set(runs.map((r) => r.date_jst).filter(Boolean))].sort();
  return {
    window: { from: days[0] ?? null, to: days.at(-1) ?? null, days: days.length },
    totals: {
      runs: runs.length,
      attempted: runs.filter((r) => r.attempted).length,
      shipped: runs.filter((r) => r.outcome === 'shipped').length,
      failed: runs.filter((r) => FAILED.has(r.outcome)).length,
      no_run: runs.filter((r) => r.outcome === 'no_run').length,
    },
  };
}

export function statusAgreement(doc, statusDoc) {
  const authored = (doc?.runs || []).filter(isSessionAuthored);
  const dates = authored.map((r) => r.date_jst).filter(Boolean).sort();
  const latest = dates.at(-1) ?? null;
  const problems = [];
  // 空の台帳（およびアクチュエータの行しかない台帳）は staleness の担当。ここで二重に鳴らさない。
  if (!latest) return { checked: false, latest: null, status_date: null, problems };

  if (!statusDoc) {
    problems.push('data/autopilot-status.json が読めない — 日報の唯一のデータ源が無い');
    return { checked: true, latest, status_date: null, problems };
  }

  const statusDate = statusDoc.date_jst ?? null;
  const shipped = authored.filter(
    (r) => r.date_jst === latest && r.outcome === 'shipped' && r.artifact);

  if (statusDate !== latest) {
    const behind = statusDate && statusDate < latest;
    problems.push(
      `台帳の最終記入は ${latest} なのに status JSON は ${statusDate ?? 'なし'}`
      + (behind
        ? ' — 実行はしたが status JSON を書いていない。日報はこの日を「実行記録なし」と報告する'
        : ' — status JSON にある日の行が台帳に無い。指標がその実行を数えられない'));
  } else if (shipped.length) {
    const want = shipped.map((r) => normalizeArtifact(r.artifact));
    const got = normalizeArtifact(statusDoc.article?.url ?? null);
    if (!got || !want.includes(got)) {
      problems.push(
        `${latest} は ${want.join(' / ')} を出荷した記録なのに、status JSON の article は `
        + `${got ?? 'なし'} — 日付だけ当日にして中身が前日のままだと、日報は前日の記事を今日の成果として出す`);
    }
  }

  // --- 数値ブロックの突き合わせ（2026-09-02 追加）---
  //
  // 【なぜ足したか】日付と記事URLは見ていたが、**`runs` ブロックの数字は
  // 誰も突き合わせていなかった。**2026-09-02、台帳が 41実行/着手28/出荷19 の
  // ところ status JSON は **40/27/18・完走率66.67%・22日** のまま本番に出ていて、
  // `--check` は緑だった。公開ページとプレスリリースは台帳側（67.9%）を引いており、
  // **同じリリースがリンクする2つのJSONが違う数字を出していた。**
  // 記者が最初にやるのは数字を1つ選んで出どころを開くことなので、ここが割れる。
  //
  // 【なぜ黙る条件が要るか】アクチュエータ（source が `act-`）が行を足すと totals は
  // 動くが、**status JSON を書くのはセッションで、アクチュエータの実行時にはもう
  // 書き終わっている。**上の日付検査が `isSessionAuthored` で黙るのと同じ理由で、
  // ここも黙る必要がある——さもないと台帳を埋めるための経路が、埋めた結果で
  // 自分のPRを止める（このファイル冒頭の 2026-08-25 と同じ形）。
  //
  // **「その日の act- 行だけ」を除外する形では足りない。**前日ぶんの追記でも
  // totals は動くので、`status の日付以降に act- の行があるか`で見る。
  // 最初にその形で書いて、前日追記のケースで自分を止めることに気づいた。
  //
  // 【残す弱さ】アクチュエータが status の日付以降に1行でも足すと、
  // そこから先は**次にセッションが status を書き直すまで数字が検査されない。**
  // 消したのではなく先送りで、アクチュエータを止めないほうを選んだ結果。
  const actAtOrAfterStatus = (doc?.runs || []).some(
    (r) => !isSessionAuthored(r) && r.date_jst && statusDate && r.date_jst >= statusDate);
  if (statusDate === latest && !actAtOrAfterStatus) {
    const want = runsFacts(doc);
    const got = statusDoc.runs;
    if (!got) {
      problems.push('status JSON に runs ブロックが無い'
        + ' — 日報も公開ページもここを読む。`--write-status` で書くこと');
    } else {
      for (const k of ['runs', 'attempted', 'shipped', 'failed', 'no_run']) {
        if (got?.totals?.[k] !== want.totals[k]) {
          problems.push(
            `status JSON の runs.totals.${k} は ${got?.totals?.[k] ?? 'なし'} だが、`
            + `台帳を数え直すと ${want.totals[k]}`
            + ' — **数字を手で写さない。**`node scripts/autopilot-runs.mjs --write-status` で書き直すこと');
        }
      }
      if (got?.window?.days !== want.window.days) {
        problems.push(
          `status JSON の runs.window.days は ${got?.window?.days ?? 'なし'} だが、`
          + `台帳の実行日は ${want.window.days} 日ぶんある`
          + ' — 同じ期間を違う長さで名乗ると、率の分母が食い違う');
      }
    }
  }

  return {
    checked: true, latest, status_date: statusDate,
    shipped_artifacts: shipped.map((r) => r.artifact),
    status_article: statusDoc.article?.url ?? null,
    problems,
  };
}

/** 絶対URLでも相対パスでも同じものとして比べる（どちらの書き方も実在する）。 */
function normalizeArtifact(v) {
  if (!v) return null;
  try { return new URL(v).pathname; } catch { return v; }
}

/**
 * 台帳の形を検証する。
 *
 * 壊れた台帳は「集計できない」ではなく「**指標が黙って嘘になる**」を意味する。
 * とくに attempted と outcome の食い違い（Gateスキップなのに attempted=true 等）は
 * 完走率を静かにずらすので、ここで必ず落とす。
 */
export function validate(doc) {
  const problems = [];
  if (!doc || !Array.isArray(doc.runs)) return ['runs must be an array'];
  const seen = new Set();
  doc.runs.forEach((r, i) => {
    const at = `runs[${i}]${r.run_id ? ` (${r.run_id})` : ''}`;
    if (!r.run_id) problems.push(`${at}: run_id is required — 共通実行IDが無い行は台帳の意味を成さない`);
    else if (seen.has(r.run_id)) problems.push(`${at}: duplicate run_id`);
    else seen.add(r.run_id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date_jst || '')) problems.push(`${at}: date_jst must be YYYY-MM-DD`);
    if (!r.route) problems.push(`${at}: route is required`);
    if (!OUTCOMES.includes(r.outcome)) problems.push(`${at}: outcome must be one of ${OUTCOMES.join('|')} (got ${JSON.stringify(r.outcome)})`);
    if (typeof r.attempted !== 'boolean') problems.push(`${at}: attempted must be boolean`);
    // 着手フラグと結果の整合。ここがずれると完走率が静かに嘘になる。
    if (r.attempted && NOT_ATTEMPTED.has(r.outcome)) {
      problems.push(`${at}: attempted=true なのに outcome=${r.outcome}（着手していない結果）`);
    }
    if (!r.attempted && !NOT_ATTEMPTED.has(r.outcome)) {
      problems.push(`${at}: attempted=false なのに outcome=${r.outcome}（着手した結果）`);
    }
    if (r.outcome === 'shipped' && !r.pr) {
      problems.push(`${at}: shipped なのに pr が無い — 出荷はPRのマージでしか成立しない`);
    }
    if (FAILED.has(r.outcome) && !r.failure_reason) {
      problems.push(`${at}: ${r.outcome} なのに failure_reason が無い — 「なぜ落ちたか」の無い失敗は再発防止に使えない`);
    }
    if (!r.source) problems.push(`${at}: source is required — 後から検算できない行は指標として存在しないのと同じ`);
    if (r.interventions && !Array.isArray(r.interventions)) problems.push(`${at}: interventions must be an array`);
  });
  return problems;
}

/**
 * 検知までの時間と修理までの時間。**別の指標として分けて出す。**
 *
 * 前者は監視の穴、後者は修理能力の話で、混ぜると改善先を間違える。
 * 実測（2026-08-16の無運転）では検知まで50時間かかったが、気づいてからの
 * 修理は1時間以内だった。**弱点は修理速度ではなく検知の穴**だと数字が言っている。
 *
 * 時刻が無い行は分母に入れない。n を必ず一緒に返す — 1件の中央値を
 * 「MTTR」と呼ぶと、測っていないことを測ったことにしてしまう。
 */
function timings(runs) {
  const hrs = (a, b) => (new Date(b) - new Date(a)) / 36e5;
  const detect = [], repair = [];
  for (const r of runs) {
    if (r.failed_at && r.detected_at) detect.push(hrs(r.failed_at, r.detected_at));
    if (r.detected_at && r.resolved_at) repair.push(hrs(r.detected_at, r.resolved_at));
  }
  const med = (xs) => {
    if (!xs.length) return null;
    const a = [...xs].sort((x, y) => x - y), m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const unresolved = runs.filter((r) => r.detected_at && !r.resolved_at);
  return {
    time_to_detect_hours: { median: med(detect), max: detect.length ? Math.max(...detect) : null, n: detect.length },
    time_to_repair_hours: { median: med(repair), max: repair.length ? Math.max(...repair) : null, n: repair.length },
    unresolved: unresolved.map((r) => ({ run_id: r.run_id, failure_class: r.failure_class ?? null })),
  };
}

/** 主系（GitHub Actions）以外はすべて副系・代走とみなす。 */
const isPrimary = (r) => r.route === 'actions';

/**
 * **「連続稼働」を数字で言うための定義。**
 *
 * [2026-09-02] 配信原稿は「16日間連続で稼働」を 08-27 に取り下げた（台帳に無運転日が
 * 2日あった）。取り下げは正しいが、**次に「連続」と書くときの定義がどこにも無い**ので、
 * 数えられるうちは書けず、数えずに書けば同じ誤りをする。ここに定義を置く。
 *
 *   停止日 … no_run の行がある日。**no_run は日単位の判定**（「その日どの経路も
 *            動かなかった」）なので、同じ日に主系の skipped_gate 行が並んでいても停止。
 *            実際 08-16 / 08-17 は actions の skipped_gate と none の no_run が並ぶ —
 *            主系は起動して寝ただけで、出荷できる経路が1つも無かった日。
 *            **ここを「skipped_gate があるから稼働」と読むと 23日連続になり、
 *            08-27 に取り下げた「連続稼働」が定義の違いで復活する。**
 *   稼働日 … no_run の行が無く、行が1つでもある日（出荷・失敗・スキップを問わない）。
 *   行の無い日 … 台帳は「実行が無い日も no_run として1行書く」決まりなので、
 *            行が無い＝記録していない。**稼働とも停止とも言えないので連続を切る**
 *            （分からない日を稼働に数えない）。
 *
 * current は台帳の最終記入日で終わる連続。longest は窓の中の最長。
 * **暦日で歩く**（行の並びではなく日付で数える）。
 */
export function activeStreaks(runs) {
  return streakWalk(runs, (rows) => !rows.some((r) => r.outcome === 'no_run'));
}

/**
 * 暦日を歩いて連続を数える共通部。**3つの指標で歩き方を分けない。**
 *
 * 分けると、都合のよい定義を後から選べる —— 08-27 に「16日間連続」を取り下げた
 * のは、まさに定義が無いまま数えたからだった。判定（どの日を「続いている」と
 * みなすか）だけを差し替え、切れ方（行の無い日は切る／暦日で歩く）は共通にする。
 *
 * `isActive(rows)` は**その日の行の配列**を受け取る。行の無い日は呼ばれずに切れる。
 */
function streakWalk(runs, isActive) {
  const byDay = new Map();
  for (const r of runs) {
    if (!r?.date_jst) continue;
    const a = byDay.get(r.date_jst) ?? [];
    a.push(r);
    byDay.set(r.date_jst, a);
  }
  const days = [...byDay.keys()].sort();
  const empty = { current: { days: 0, from: null }, longest: { days: 0, from: null, to: null }, active_days: 0, last_day: null };
  if (!days.length) return empty;
  const nextDay = (d) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  let longest = { days: 0, from: null, to: null };
  let cur = { days: 0, from: null };
  let activeDays = 0;
  for (let d = days[0]; d <= days[days.length - 1]; d = nextDay(d)) {
    const rows = byDay.get(d);
    if (rows && isActive(rows)) {
      activeDays += 1;
      if (cur.days === 0) cur = { days: 0, from: d };
      cur.days += 1;
      if (cur.days > longest.days) longest = { days: cur.days, from: cur.from, to: d };
    } else {
      cur = { days: 0, from: null };
    }
  }
  return { current: cur, longest, active_days: activeDays, last_day: days[days.length - 1] };
}

/**
 * **連続出荷日数 — 「動いていた」ではなく「出ていた」の連続。**
 *
 * [2026-09-02] 連続稼働は現在 16 日と出るが、**その 16 日は 08-29〜08-31 の
 * 出荷ゼロ3日を丸ごとまたいでいる。**稼働の定義（no_run の行がある日だけ停止）は
 * それ自体は正しい —— 主系が失敗して行が立った日は「記録がある日」であって
 * 「動かなかった日」ではない。だが**失敗し続けても連続稼働は伸びる。**
 * 毎日落ちる機械は、この指標の上では永久に連続稼働になる。
 *
 * だから同じ台帳から、**切れる指標**を並べて出す。出荷のある日だけが続く。
 * 停止・失敗・スキップ・行の無い日はすべて切る。
 */
export function shippingStreaks(runs) {
  return streakWalk(runs, (rows) => rows.some((r) => r.outcome === 'shipped'));
}

/**
 * **無介入出荷の連続 — 人が一度も触らずに出荷できた日の連続。**
 *
 * 率（人間介入率）には天井がある。到達可能上限 82.9%（autonomy-gap.mjs）の内側で
 * しか動かないので、**率だけを追うと伸びしろが先に尽きる。**時間には天井が無い。
 *
 * 【なぜ「出荷があること」を条件に入れるか】入れないと、**壊れたまま誰も触らない日**が
 * 無介入として積み上がる。08-30・08-31 は主系も副系も 429 で落ち、人は触っていない
 * —— 触っていないのは自律していたからではなく、直しに行かなかったからである。
 * 自律の指標が放置で伸びる形にはしない。
 *
 * 【日単位で数える】その日のどの行に介入があっても切る。出荷した副系ではなく
 * 落ちた主系を人が直した日も、**オーナーの手は動いている。**
 */
export function handsOffStreaks(runs) {
  return streakWalk(runs, (rows) =>
    rows.some((r) => r.outcome === 'shipped')
    && !rows.some((r) => (r.interventions || []).length > 0));
}

/**
 * **公開面を出したと数えてよいレーン。**Runbook §2 の分類そのもの。
 *
 *   A  SEO（Refresh / New / 配線）      B  AIO（回答ブロック）
 *   C  Evidence Asset（一次情報）        D  Paid relevance 例外（四半期1本）
 *   E  Coverage（まとめサイト化）
 *
 * **F（自己修復）は入らない。**Runbook が「レーンFで1日使い切ってよい。その日の
 * 記事はゼロでよく」と明記しているとおり、あれは**自分を直す日**であって、
 * 公開面に何かが出た日ではない。lane が無い日（§6 の保守のみ）も同じ。
 */
export const PUBLISHING_LANES = ['A', 'B', 'C', 'D', 'E'];

/**
 * **連続公開日数 — 「出荷した」ではなく「公開面に出た」の連続。**
 *
 * [2026-09-03] 連続出荷は現在 3 日と出るが、**その3日のうち2日はレーンF（自己修復）
 * で、公開面には何も出ていない。**連続出荷の定義（shipped の行がある日）は
 * それ自体は正しい —— 自己修復も出荷である。だが**自分を直し続けても連続出荷は
 * 伸びる。**これは連続稼働に対して連続出荷を足したときと**同じ形の穴**で、
 * 一段内側に残っていた。
 *
 * 実物（2026-09-03 時点）:
 *
 *     09-01  actions  lane F  PR #749   公開面の成果物なし
 *     09-02  actions  lane F  PR #774   公開面の成果物なし
 *     09-03  actions  lane A  PR #793   /obsidian/getting-started/
 *
 * 連続出荷は 3 日。**公開面が出たのは1日だけ。**新規カバレッジ（レーンE）は
 * 08-28 が最後で、6日空いている。
 *
 * **どちらが正しい優先順位かは、この指標では決めない。**故障が続けばレーンFが
 * 勝ち続けるのが正しい日もある。決められるようにするために、まず**分けて数える。**
 */
export function publishingStreaks(runs) {
  return streakWalk(runs, (rows) =>
    rows.some((r) => r.outcome === 'shipped' && PUBLISHING_LANES.includes(r.lane)));
}

/**
 * 最後に公開面が出た日と、そのレーン。**空白が伸びていることを1行で言うため。**
 * 連続が 0 のとき「いつから出ていないか」が無いと、読み手は台帳を遡ることになる。
 */
export function lastPublishing(runs) {
  const rows = (runs ?? [])
    .filter((r) => r.outcome === 'shipped' && PUBLISHING_LANES.includes(r.lane))
    .sort((a, b) => String(a.date_jst).localeCompare(String(b.date_jst)));
  const last = rows[rows.length - 1];
  return last ? { date_jst: last.date_jst, lane: last.lane, artifact: last.artifact ?? null } : null;
}

/**
 * **マージ済みの当日ブランチに台帳を積もうとしていないか。**
 *
 * 【なぜここで止めるか】取り残しコミットの41%（アクション台帳17/41行）は、
 * 全部これ1つの形だった —— 記事のPRがマージされた**後**に、その日の run を
 * 台帳へ書く。`outcome: shipped` も `pr: 774` もマージされるまで確定しないので、
 * **順序としては正しい。**間違っているのは書く先で、閉じたPRのブランチに積むと
 * 次の検証が拾う先が無く、そのまま取り残しになる（auto-merge は検証済みSHAだけを
 * マージする設計の帰結であって、事故ではない）。
 *
 * 直し方は1行: **main から新しいブランチを切って、そこへ書く。**
 * 散文で書いても順番に効かないので、書く側が拒否する形にした。
 *
 * 【**祖先判定だけでは1回も発火しない**】最初これを
 * `git merge-base --is-ancestor HEAD origin/main` だけで書いた。**効かない。**
 * auto-merge は `merge_method: 'squash'` なので、マージ済みのブランチは
 * main の祖先にならない。実際 `claude/obsidian-auto-20260827` は
 * 「main に無いコミットを1件持つ」状態で残っている。
 * だから `delete-branch.yml` と同じ二段構えにする ——
 * 祖先であるか、**そのブランチが変えたファイルが main と同じ内容か。**
 *
 * @param {string|null} branch  いまのブランチ名（取れなければ null）
 * @param {object} facts
 * @param {boolean|null} facts.ancestor     head が origin/main の祖先か（null=判定不能）
 * @param {boolean|null} facts.sameContent  変えたファイルが main と同内容か（null=判定不能）
 */
export function refusesMergedDayBranch(branch, facts = {}) {
  // **判定できないときは止めない。**git が無い環境・detached HEAD・fetch できない日に
  // 台帳が書けなくなるほうが害が大きい（落ちた回ほど記録されない、を再現する）。
  if (typeof branch !== 'string' || !/^claude\/obsidian-auto-\d{8}$/.test(branch)) return false;
  return facts.ancestor === true || facts.sameContent === true;
}

export function summarize(doc, { since = null, costDoc = null, statusDoc = null, today = undefined } = {}) {
  let runs = doc.runs;
  if (since) runs = runs.filter((r) => r.date_jst >= since);

  const attempted = runs.filter((r) => r.attempted);
  const shipped = runs.filter((r) => r.outcome === 'shipped');
  const failed = runs.filter((r) => FAILED.has(r.outcome));
  const noRun = runs.filter((r) => r.outcome === 'no_run');
  const withIntervention = attempted.filter((r) => (r.interventions || []).length > 0);
  const rate0 = (n, d) => (d > 0 ? n / d : null);

  // 介入の内訳。kind ごとに「その kind の介入を含む実行」を数える
  // （1実行に複数kindがありうるので、合計が withIntervention と一致するとは限らない）。
  const KINDS = ['artifact', 'infra', 'substitute', 'bootstrap', 'request'];
  const byKind = {};
  for (const k of KINDS) {
    const runsWith = attempted.filter((r) => (r.interventions || []).some((i) => i.kind === k));
    byKind[k] = { runs: runsWith.length, rate: rate0(runsWith.length, attempted.length) };
  }
  // 出荷物のうち、人が中身に手を入れたもの。**AIの自律性の中核はここ。**
  const shippedWithArtifactIntervention = runs.filter(
    (r) => r.outcome === 'shipped' && (r.interventions || []).some((i) => i.kind === 'artifact'));

  const days = [...new Set(runs.map((r) => r.date_jst))].sort();
  const shippedDays = new Set(shipped.map((r) => r.date_jst));

  const rate = rate0;

  const byRoute = {};
  for (const r of runs) {
    const k = isPrimary(r) ? 'primary' : 'secondary';
    byRoute[k] ??= { runs: 0, attempted: 0, shipped: 0 };
    byRoute[k].runs++;
    if (r.attempted) byRoute[k].attempted++;
    if (r.outcome === 'shipped') byRoute[k].shipped++;
  }

  // 実費は cost 台帳が正。external_ref（GitHub run id）で結合する。
  let costLinked = null;
  if (costDoc) {
    const byRunId = new Map(costDoc.runs.map((c) => [String(c.run_id), c]));
    const linked = runs.map((r) => byRunId.get(String(r.external_ref))).filter(Boolean);
    costLinked = {
      linked_runs: linked.length,
      spent_usd: Number(linked.reduce((a, c) => a + c.total_cost_usd, 0).toFixed(4)),
      unobservable_runs: runs.filter((r) => r.attempted && !isPrimary(r)).length,
    };
  }

  return {
    window: { from: days[0] ?? null, to: days.at(-1) ?? null, days: days.length },
    totals: {
      runs: runs.length, attempted: attempted.length,
      shipped: shipped.length, failed: failed.length, no_run: noRun.length,
    },
    // レビューが求めた指標。分母は attempted（§ヘッダの理由）。
    completion_rate: rate(shipped.length, attempted.length),
    change_failure_rate: rate(failed.length, attempted.length),
    human_intervention_rate: rate(withIntervention.length, attempted.length),
    // 内訳。総計だけ出すと過少評価、内訳だけ出すと都合のよい分母選びになる。両方出す。
    intervention_by_kind: byKind,
    // 出荷物のうち人が中身に手を入れた割合。**AIの自律性の中核。**
    artifact_autonomy_rate: rate(shipped.length - shippedWithArtifactIntervention.length, shipped.length),
    shipping_day_rate: rate(shippedDays.size, days.length),
    no_run_days: noRun.map((r) => r.date_jst),
    // 「連続稼働」の定義つきの値。**書くならここから引く。**
    streaks: activeStreaks(runs),
    // 稼働より厳しい2本。**稼働だけを出すと、失敗し続けても伸びる数字になる。**
    shipping_streaks: shippingStreaks(runs),
    hands_off_streaks: handsOffStreaks(runs),
    // **出荷の内側にもう1本。**自己修復も出荷なので、連続出荷は自分を直し続けても伸びる。
    publishing_streaks: publishingStreaks(runs),
    last_publishing: lastPublishing(runs),
    by_route: byRoute,
    // 「主系が一度も出荷していない」を機械が言えるようにする（＝切替の証拠）
    primary_ever_shipped: (byRoute.primary?.shipped ?? 0) > 0,
    interventions: withIntervention.flatMap((r) =>
      (r.interventions || []).map((i) => ({ run_id: r.run_id, date_jst: r.date_jst, ...i }))),
    cost: costLinked,
    timings: timings(runs),
    // 台帳そのものが書かれ続けているか。**壊れた行より、書かれなかった行のほうが見つけにくい。**
    staleness: staleness(doc, today ?? todayJst()),
    // 台帳と status JSON が同じ実行を指しているか。**日報が読むのは status JSON のほう。**
    status_agreement: statusAgreement(doc, statusDoc),
  };
}

const pct = (x) => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);

function render(s, doc) {
  const o = [];
  o.push(`Autopilot runs ${s.window.from} → ${s.window.to} (${s.window.days} 日 / ${s.totals.runs} run)`);
  o.push('');
  o.push(`  AI完走率      ${pct(s.completion_rate)}   (${s.totals.shipped} / ${s.totals.attempted} 着手)`);
  o.push(`  変更失敗率    ${pct(s.change_failure_rate)}   (${s.totals.failed} / ${s.totals.attempted} 着手)`);
  o.push(`  人間介入率    ${pct(s.human_intervention_rate)}   (${s.interventions.length} 件の介入)`);
  const bk = s.intervention_by_kind ?? {};
  o.push(`    ├ 成果物への介入   ${pct(bk.artifact?.rate)}  (${bk.artifact?.runs ?? 0} 実行)  ← AIの自律性の中核`);
  o.push(`    ├ 基盤の修理       ${pct(bk.infra?.rate)}  (${bk.infra?.runs ?? 0} 実行)`);
  o.push(`    ├ 代走             ${pct(bk.substitute?.rate)}  (${bk.substitute?.runs ?? 0} 実行)`);
  o.push(`    ├ 立ち上げ         ${pct(bk.bootstrap?.rate)}  (${bk.bootstrap?.runs ?? 0} 実行・一度きり)`);
  o.push(`    └ 起票のみ         ${pct(bk.request?.rate)}  (${bk.request?.runs ?? 0} 実行・未実行)`);
  o.push(`  成果物のAI自律率 ${pct(s.artifact_autonomy_rate)}   (出荷 ${s.totals.shipped} 件のうち人が中身に触っていない割合)`);
  o.push(`  出荷日率      ${pct(s.shipping_day_rate)}   (${s.window.days} 日中)`);
  o.push('');
  o.push(`  経路別:  主系 ${s.by_route.primary?.shipped ?? 0}/${s.by_route.primary?.attempted ?? 0} 出荷` +
         `   副系・代走 ${s.by_route.secondary?.shipped ?? 0}/${s.by_route.secondary?.attempted ?? 0} 出荷`);
  if (!s.primary_ever_shipped) {
    o.push('  ⚠ 主系は一度も出荷していない。日々の出荷は副系・代走が担っている');
    o.push('    （＝バックアップ切替は「起きた」のではなく常態。冗長化が実際に効いている状態）');
  }
  if (s.no_run_days.length) {
    o.push(`  ⚠ 無運転日 ${s.no_run_days.length} 日: ${s.no_run_days.join(', ')}`);
    o.push('    （どの経路も動かなかった日。Gateスキップと違い、これは正常系ではない）');
  }
  const sk = s.streaks;
  if (sk) {
    const cur = sk.current.days ? `${sk.current.days} 日（${sk.current.from}〜${sk.last_day}）` : '0 日（最終記入日が無運転）';
    const lg = sk.longest.days ? `${sk.longest.days} 日（${sk.longest.from}〜${sk.longest.to}）` : '0 日';
    o.push(`  連続稼働      現在 ${cur} ／ 最長 ${lg}`);
    o.push('    （停止日 = no_run の行がある日。それ以外で行のある日が稼働。行の無い日は連続を切る）');
  }
  // **稼働の隣に、切れる2本を必ず並べる。**片方だけ出すと「16日連続」が
  // 出荷ゼロ3日をまたいでいることが読めない（2026-09-02 の実物がその形）。
  const fmt = (st, zero) => {
    if (!st) return null;
    const c = st.current.days ? `${st.current.days} 日（${st.current.from}〜${st.last_day}）` : zero;
    const l = st.longest.days ? `${st.longest.days} 日（${st.longest.from}〜${st.longest.to}）` : '0 日';
    return `現在 ${c} ／ 最長 ${l}`;
  };
  const sh = fmt(s.shipping_streaks, '0 日（最終記入日に出荷が無い）');
  if (sh) {
    o.push(`  連続出荷      ${sh}`);
    o.push('    （出荷のある日だけが続く。停止・失敗・スキップ・行の無い日はすべて切る）');
  }
  const pb = fmt(s.publishing_streaks, '0 日（最終記入日に公開面の出荷が無い）');
  if (pb) {
    o.push(`  連続公開      ${pb}`);
    o.push('    （レーンA〜Eの出荷がある日だけが続く。**レーンF＝自己修復と保守のみの日は切る**）');
    const lp = s.last_publishing;
    if (lp) {
      const to = s.staleness?.latest ?? lp.date_jst;
      const gap = Math.round(
        (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${lp.date_jst}T00:00:00Z`)) / 86400000);
      o.push(`    最後の公開面: ${lp.date_jst}（レーン${lp.lane}`
        + `${Number.isFinite(gap) && gap > 0 ? ` / ${gap}日前` : ''}）${lp.artifact ? ` ${lp.artifact}` : ''}`);
    } else {
      o.push('    最後の公開面: 窓の中に無い');
    }
  }
  const ho = fmt(s.hands_off_streaks, '0 日（最終記入日に無介入の出荷が無い）');
  if (ho) {
    o.push(`  無介入出荷    ${ho}`);
    o.push('    （出荷があり、その日のどの行にも介入が無い日の連続。**率と違って天井が無い**）');
    o.push('    （出荷を条件に入れてある。入れないと「壊れたまま誰も触らない日」が無介入で積み上がる）');
  }
  const st = s.staleness;
  o.push('');
  o.push(`  最終記入: ${st.latest ?? 'なし'}（今日 ${st.today} / ${st.days_behind ?? '?'} 日前・許容 ${st.max_days} 日）`);
  if (st.stale) {
    o.push('  ⚠ 台帳が書かれていない。**指標は止まっているだけで、正しくはない。**');
    o.push('    実行があったのに行が無いと、出荷しても「0/N 出荷」のままになる');
    o.push('    （2026-08-23、主系の初出荷が実際にこれで落ちた）');
    o.push('    追記: node scripts/autopilot-runs.mjs --append --run-id ap-<YYYYMMDD>-<route> \\');
    o.push('            --date <YYYY-MM-DD> --route <actions|ccr-XXXX|owner-session> \\');
    o.push('            --outcome <shipped|no_artifact|failed|cancelled|skipped_gate|skipped_duplicate|no_run> \\');
    o.push('            --pr <n> --artifact <path> --external-ref <run id> --source <一次資料>');
  }
  const sa = s.status_agreement;
  if (sa?.checked) {
    o.push(`  日報のデータ源: status JSON = ${sa.status_date ?? 'なし'}（台帳の最終記入 ${sa.latest}）`);
    for (const p of sa.problems) {
      o.push(`  ⚠ ${p}`);
    }
    if (sa.problems.length) {
      o.push('    日報は status JSON しか読まない。**台帳が正しくても、ここが古いと出荷が無かったことになる**');
      o.push('    （2026-08-23、主系の初出荷が実際にこれで「実行記録なし」と報告された）');
      o.push('    直し: data/autopilot-status.json を Runbook §5-2 のスキーマで当日の内容に上書きし、同じPRに含める');
    }
  }

  const tm = s.timings;
  if (tm.time_to_detect_hours.n || tm.time_to_repair_hours.n) {
    o.push('');
    const f = (t, label) => t.n
      ? `  ${label}: 中央値 ${t.median.toFixed(1)}h / 最大 ${t.max.toFixed(1)}h (n=${t.n})`
      : `  ${label}: 記録なし`;
    o.push(f(tm.time_to_detect_hours, '検知まで'));
    o.push(f(tm.time_to_repair_hours, '修理まで'));
    if (tm.unresolved.length) {
      o.push(`  ⚠ 未解消 ${tm.unresolved.length} 件: ${tm.unresolved.map((u) => `${u.run_id}[${u.failure_class}]`).join(', ')}`);
    }
  }
  if (s.cost) {
    o.push('');
    o.push(`  実費: $${s.cost.spent_usd.toFixed(4)}（${s.cost.linked_runs} run 分。data/autopilot-cost.json と結合）`);
    o.push(`        ${s.cost.unobservable_runs} run は副系のため**観測手段が無い**（ゼロではない）`);
  }
  const gaps = doc.seeded?.known_gaps || [];
  if (gaps.length) {
    o.push('');
    o.push('  台帳が持てていないもの:');
    for (const g of gaps) o.push(`    - ${g}`);
  }
  return o.join('\n');
}

/**
 * 陳腐化検知の自己検査。**台帳を読まない**ので、台帳の中身がどう変わっても壊れない。
 *
 * 元にした実害: 2026-08-23、主系が初めて自走出荷した（PR #538）のに
 * `data/autopilot-runs.json` に行が無く、`--check` は素通りした。
 * 台帳は「主系 0/3 出荷」と言い続けた。**その状態を落とせることを固定する。**
 */
function selftest() {
  let n = 0, bad = 0;
  const eq = (got, want, msg) => {
    n++;
    if (got !== want) { bad++; console.error(`  ✗ ${msg}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
  };
  // **台帳の読み方そのもの**もここから走らせる。費用の台帳が壊れると
  // 実費の行が消えるだけで、0とも未観測とも区別がつかなくなる。
  for (const [name, fn] of readLedgerScenarios(fs, os)) {
    n++;
    try { fn(); } catch (e) { bad++; console.error(`  ✗ ${name}\n      ${e.message}`); }
  }
  const doc = (...dates) => ({ runs: dates.map((d, i) => ({ run_id: `r${i}`, date_jst: d })) });

  // 主系が残していった状態そのもの（最終記入 08-22・08-23 の出荷は未記入）
  const asLeft = doc('2026-08-21', '2026-08-22');
  eq(staleness(asLeft, '2026-08-23').stale, false, '出荷当日はまだ落とさない（当日ぶんが夜まで空くのは普通）');
  eq(staleness(asLeft, '2026-08-24').stale, true,  '**翌日には落ちる** — これが 2026-08-23 に効かなかった検査');
  eq(staleness(asLeft, '2026-08-24').days_behind, 2, '2日前と数える');

  // 追記して直った状態
  const fixed = doc('2026-08-22', '2026-08-23');
  eq(staleness(fixed, '2026-08-23').stale, false, '当日に書けば通る');
  eq(staleness(fixed, '2026-08-24').stale, false, '1日前までは許容');
  eq(staleness(fixed, '2026-08-25').stale, true,  '2日空けば落ちる');

  // 境界と異常系
  eq(staleness(doc(), '2026-08-23').stale, true, '**空の台帳は「問題なし」ではない**');
  eq(staleness(doc(), '2026-08-23').latest, null, '空なら latest は null');
  eq(staleness(doc('2026-08-25'), '2026-08-23').days_behind, -2, '未来日付は負で出す（隠さない）');
  eq(staleness(doc('2026-08-25'), '2026-08-23').stale, false, '未来日付は陳腐化ではない（別の異常）');
  // 順序に依存しない — 台帳は sort されている前提だが、そこに寄りかからない
  eq(staleness(doc('2026-08-23', '2026-08-11'), '2026-08-23').days_behind, 0, '並び順に依存しない');

  // --- 台帳と status JSON の突き合わせ（statusAgreement）---
  // ここも台帳ファイルを読まない。合成データだけで、両方向の食い違いを固定する。
  const ledger = (date, extra = {}) => ({
    runs: [{ run_id: 'r0', date_jst: '2026-08-22', outcome: 'shipped', artifact: '/a/' },
           { run_id: 'r1', date_jst: date, ...extra }] });
  /**
   * status JSON の合成。**`runs` は既定で台帳と一致させる。**
   * 数値ブロックの検査（下）を足したので、ここを空にすると
   * 日付の検査を見ているつもりのテストが全部その理由で落ちる
   * ——実際に5件落として気づいた。fixture は検査対象以外を成立させておく。
   */
  const st = (date, url, ledgerDoc = null, over = {}) => ({
    date_jst: date,
    article: url ? { url } : null,
    runs: { ...(ledgerDoc ? runsFacts(ledgerDoc) : { window: { days: 0 }, totals: {} }), ...over },
  });
  const probs = (d, sd) => statusAgreement(d, sd).problems.length;

  // 2026-08-23 の実害そのもの: 出荷したのに status JSON が前日のまま
  const shippedToday = ledger('2026-08-23', { outcome: 'shipped', artifact: '/obsidian/pricing/' });
  eq(probs(shippedToday, st('2026-08-22', '/obsidian/plugins/dataview/')), 1,
     '**出荷したのに status JSON が前日のまま → 落とす**（08-23 に日報を誤らせた状態）');
  eq(probs(shippedToday, st('2026-08-23', '/obsidian/pricing/', shippedToday)), 0,
     '当日ぶんを書けば通る');

  // 逆向き（PR #540 の実害）: status は当日なのに台帳に行が無い。
  // staleness は許容1日ぶん黙るので、当日中はこちらでしか捕まらない。
  eq(staleness(ledger('2026-08-22', { outcome: 'shipped', artifact: '/a/' }), '2026-08-23').stale, false,
     '前提: 台帳が1日遅れでも staleness は当日は黙る');
  eq(probs(ledger('2026-08-22', { outcome: 'shipped', artifact: '/a/' }), st('2026-08-23', '/b/')), 1,
     '**status のほうが新しい（台帳の行が無い）→ 落とす**');

  // 日付だけ合わせて中身が前日、を通さない
  eq(probs(shippedToday, st('2026-08-23', '/obsidian/plugins/dataview/', shippedToday)), 1,
     '日付は当日でも article が別の記事なら落とす');
  // 絶対URLと相対パスは同じものとして扱う（どちらの書き方も実在する）
  eq(probs(shippedToday, st('2026-08-23', 'https://simplememofast.com/obsidian/pricing/', shippedToday)), 0,
     '絶対URLでも一致とみなす');

  // 出荷が無い日は article を問わない（スキップ日も status JSON は更新する決まり）
  const skipToday = ledger('2026-08-23', { outcome: 'no_run' });
  eq(probs(skipToday, st('2026-08-23', null, skipToday)), 0, '無運転の日は article なしで通る');
  eq(probs(skipToday, st('2026-08-22', null)), 1, 'スキップでも status JSON を書かなければ落ちる');

  // --- 日次アクチュエータとの相互作用（2026-08-25 統合時に追加）---
  // **主系が落ちた日にアクチュエータ自身を止めない。** reconcile-runs が埋めた行は
  // 「セッションが実行した回」ではないので、status JSON の更新を要求しない。
  // ここを取り違えると、台帳を埋めるための経路が埋めた結果で自分を止める。
  const withActRow = { runs: [
    { run_id: 'ap-20260825-ccr', date_jst: '2026-08-25', outcome: 'shipped', artifact: '/x/', source: 'session' },
    { run_id: 'ap-20260826-actions', date_jst: '2026-08-26', outcome: 'failed', source: 'act-reconcile' }] };
  eq(probs(withActRow, st('2026-08-25', '/x/')), 0,
     '**アクチュエータが埋めた行だけが先行しても落とさない**（主系が落ちた日にactが止まる）');
  // ただしセッションが書いた行なら、従来どおり落とす
  const withSessionRow = { runs: [
    { run_id: 'ap-20260825-ccr', date_jst: '2026-08-25', outcome: 'shipped', artifact: '/x/', source: 'session' },
    { run_id: 'ap-20260826-ccr', date_jst: '2026-08-26', outcome: 'shipped', artifact: '/y/', source: 'session' }] };
  eq(probs(withSessionRow, st('2026-08-25', '/x/')), 1,
     'セッションが書いた行が先行しているなら従来どおり落とす');
  // source 未記入は従来どおりセッション扱い（過去の行を素通りさせない）
  eq(probs(ledger('2026-08-26', { outcome: 'shipped', artifact: '/y/' }), st('2026-08-25', '/a/')), 1,
     'source 未記入の行はセッション扱い（既存の台帳を素通りさせない）');

  // --- 数値ブロックの突き合わせ（2026-09-02 追加）---
  // **本番で実際に起きた形を先に固定する。**台帳 41/28/19 に対し status JSON が
  // 40/27/18 のまま公開され、`--check` は緑だった。日付と記事URLしか見ていなかった。
  eq(probs(shippedToday, st('2026-08-23', '/obsidian/pricing/', shippedToday)), 0,
     '前提: 数字が一致していれば通る');
  eq(probs(shippedToday, st('2026-08-23', '/obsidian/pricing/', shippedToday,
     { totals: { runs: 1, attempted: 9, shipped: 0, failed: 0, no_run: 0 } })), 3,
     '**totals が台帳とずれたら落とす**（runs / attempted / shipped の3件）');
  eq(probs(shippedToday, st('2026-08-23', '/obsidian/pricing/', shippedToday,
     { window: { days: 1 } })), 1,
     '**期間の日数がずれたら落とす**（同じ期間を違う長さで名乗ると率の分母が食い違う）');
  eq(probs(shippedToday, { date_jst: '2026-08-23', article: { url: '/obsidian/pricing/' } }), 1,
     '**runs ブロックごと無いのは「問題なし」ではない**（日報も公開ページもここを読む）');

  // アクチュエータを止めないこと。**ここを取り違えると本番の日次が毎日落ちる。**
  // act- の行は totals を動かすが、status JSON はその前に書き終わっている。
  const actYesterday = { runs: [
    { run_id: 'a1', date_jst: '2026-08-25', outcome: 'shipped', artifact: '/x/', attempted: true, source: 'session' },
    { run_id: 'a2', date_jst: '2026-08-26', outcome: 'failed', attempted: true, source: 'act-reconcile' }] };
  eq(probs(actYesterday, st('2026-08-25', '/x/', { runs: [actYesterday.runs[0]] })), 0,
     '**翌日ぶんの act- 追記で status の数字を落とさない**（埋める経路が埋めた結果で止まらない）');
  const actSameDay = { runs: [
    { run_id: 'b1', date_jst: '2026-08-25', outcome: 'shipped', artifact: '/x/', attempted: true, source: 'session' },
    { run_id: 'b2', date_jst: '2026-08-25', outcome: 'failed', attempted: true, source: 'act-reconcile' }] };
  eq(probs(actSameDay, st('2026-08-25', '/x/', { runs: [actSameDay.runs[0]] })), 0,
     '**同じ日の act- 追記でも落とさない**（前日ぶんだけ除外する形では足りなかった）');
  // ただし act- が1行も無いなら、ずれは全部セッションの責任として落とす
  eq(probs(shippedToday, st('2026-08-23', '/obsidian/pricing/', { runs: [shippedToday.runs[0]] })), 3,
     'act- が無ければ、写し損ねはそのまま落ちる（runs / shipped / 日数）');

  // 異常系
  eq(probs(shippedToday, null), 1, '**status JSON が読めないのは「問題なし」ではない**');
  eq(statusAgreement({ runs: [] }, null).checked, false, '空の台帳は staleness の担当・ここでは二重に鳴らさない');

  // JST 換算。UTC 21:00 は JST では翌日の 06:00。
  eq(todayJst(new Date('2026-08-22T21:18:07Z')), '2026-08-23', '主系の起動時刻(UTC 21:18)は JST では 08-23');
  eq(todayJst(new Date('2026-08-22T14:59:59Z')), '2026-08-22', 'JST 23:59 はまだ当日');
  eq(todayJst(new Date('2026-08-22T15:00:00Z')), '2026-08-23', 'JST 00:00 で日付が変わる');

  // --- 連続稼働（activeStreaks）— 台帳を読まない。定義の境界を固定する ---
  const runsOf = (...pairs) => pairs.map(([d, o], i) => ({ run_id: `s${i}`, date_jst: d, outcome: o }));
  const three = activeStreaks(runsOf(['2026-08-11', 'shipped'], ['2026-08-12', 'skipped_gate'], ['2026-08-13', 'failed']));
  eq(three.current.days, 3, '3日続けて行があれば連続3（no_run が無ければ Gateスキップも失敗も稼働）');
  eq(three.longest.days, 3, '最長も3');
  eq(three.current.from, '2026-08-11', '現在の連続の始まり');
  const broken = activeStreaks(runsOf(['2026-08-11', 'shipped'], ['2026-08-12', 'shipped'], ['2026-08-13', 'no_run'], ['2026-08-14', 'shipped']));
  eq(broken.current.days, 1, '**no_run で連続が切れる**（16日間連続と書いた誤りを再現できる形）');
  eq(broken.longest.days, 2, '最長は切れる前の2');
  eq(broken.longest.to, '2026-08-12', '最長の終わり');
  const gap = activeStreaks(runsOf(['2026-08-11', 'shipped'], ['2026-08-13', 'shipped']));
  eq(gap.current.days, 1, '**行の無い日は連続を切る**（分からない日を稼働に数えない）');
  eq(gap.longest.days, 1, '行の無い日を挟むと最長も1');
  const mixed = activeStreaks(runsOf(['2026-08-16', 'skipped_gate'], ['2026-08-16', 'no_run']));
  eq(mixed.current.days, 0, '**同じ日に skipped_gate と no_run が並ぶなら停止**（08-16 の実物の形。ここを稼働と読むと23日連続が復活する）');
  eq(activeStreaks(runsOf(['2026-08-11', 'no_run'])).current.days, 0, '無運転だけの日は0');
  eq(activeStreaks([]).longest.days, 0, '空の台帳は0（推測で埋めない）');
  eq(activeStreaks(runsOf(['2026-08-11', 'shipped'], ['2026-08-12', 'no_run'])).current.days, 0,
     '最終記入日が無運転なら現在の連続は0');

  // --- 書く先の拒否 — **取り残しの41%が1つの形だった** ---
  const DAY = 'claude/obsidian-auto-20260827';
  eq(refusesMergedDayBranch(DAY, { ancestor: true }), true,
     'マージ済み（祖先）の当日ブランチには積ませない');
  eq(refusesMergedDayBranch(DAY, { ancestor: false, sameContent: true }), true,
     '**squash マージでも止める**（祖先判定だけだと1回も発火しない）');
  eq(refusesMergedDayBranch(DAY, { ancestor: false, sameContent: false }), false,
     'まだマージされていない当日ブランチには積んでよい（通常の出荷経路）');
  eq(refusesMergedDayBranch(DAY, { ancestor: null, sameContent: null }), false,
     '**判定できない日は止めない**（落ちた回ほど記録されない、を再現しない）');
  eq(refusesMergedDayBranch(DAY, {}), false, '材料が無ければ止めない');
  eq(refusesMergedDayBranch('claude/autopilot-act-20260903', { ancestor: true }), false,
     '日次アクチュエータのブランチは対象外（別経路・別の作り方）');
  eq(refusesMergedDayBranch('main', { ancestor: true }), false, 'main は当日ブランチではない');
  eq(refusesMergedDayBranch(null, { ancestor: true }), false, 'ブランチ名が取れなければ止めない');
  eq(refusesMergedDayBranch('claude/obsidian-auto-2026082', { ancestor: true }), false,
     '日付の桁が違うものは当日ブランチと見なさない');

  // --- 連続出荷・無介入出荷 — **稼働より厳しいことを固定する** ---
  // 稼働と同じ値になったら、並べて出す意味が消える。境界を1つずつ当てる。
  const failing = runsOf(['2026-08-11', 'shipped'], ['2026-08-12', 'failed'], ['2026-08-13', 'failed']);
  eq(activeStreaks(failing).current.days, 3, '**失敗し続けても連続稼働は伸びる**（この形があるから連続出荷を並べる）');
  eq(shippingStreaks(failing).current.days, 0, '連続出荷は失敗で切れる');
  eq(shippingStreaks(failing).longest.days, 1, '最長は出荷した1日だけ');
  const skipped = runsOf(['2026-08-11', 'shipped'], ['2026-08-12', 'skipped_gate']);
  eq(shippingStreaks(skipped).current.days, 0, 'Gateスキップも出荷ではない（稼働では切れない日）');
  const gapShip = runsOf(['2026-08-11', 'shipped'], ['2026-08-13', 'shipped']);
  eq(shippingStreaks(gapShip).longest.days, 1, '行の無い日は連続出荷も切る');
  const twoRoutes = [
    { run_id: 'a', date_jst: '2026-08-11', outcome: 'failed' },
    { run_id: 'b', date_jst: '2026-08-11', outcome: 'shipped' },
  ];
  eq(shippingStreaks(twoRoutes).current.days, 1, '同じ日に失敗と出荷が並べば出荷日（経路のどれかが出せばよい）');

  // --- 連続公開 — **出荷の内側にもう1本。**自己修復も出荷なので、
  //     連続出荷は自分を直し続けても伸びる。ここが切れることを固定する。
  const laned = (...triples) => triples.map(([d, o, lane], i) =>
    ({ run_id: `p${i}`, date_jst: d, outcome: o, lane }));
  const repairRun = laned(
    ['2026-09-01', 'shipped', 'F'], ['2026-09-02', 'shipped', 'F'], ['2026-09-03', 'shipped', 'A']);
  eq(shippingStreaks(repairRun).current.days, 3, '自己修復も出荷なので連続出荷は伸びる');
  eq(publishingStreaks(repairRun).current.days, 1,
     '**レーンFでは連続公開は伸びない**（2026-09-03 の実物がこの形）');
  eq(publishingStreaks(laned(['2026-09-01', 'shipped', 'F'])).current.days, 0,
     'レーンFだけの日は公開ゼロ');
  eq(publishingStreaks(laned(['2026-09-01', 'shipped', null])).current.days, 0,
     '**lane が無い日（§6 の保守のみ）も公開ではない**');
  eq(publishingStreaks(laned(['2026-09-01', 'failed', 'E'])).current.days, 0,
     '公開レーンでも出荷していなければ数えない');
  for (const lane of PUBLISHING_LANES) {
    eq(publishingStreaks(laned(['2026-09-01', 'shipped', lane])).current.days, 1,
       `レーン${lane} は公開面に数える`);
  }
  const mixedDay = [
    { run_id: 'x', date_jst: '2026-09-01', outcome: 'shipped', lane: 'F' },
    { run_id: 'y', date_jst: '2026-09-01', outcome: 'shipped', lane: 'E' },
  ];
  eq(publishingStreaks(mixedDay).current.days, 1,
     '同じ日に自己修復と公開が並べば公開日（経路のどれかが出せばよい）');
  eq(lastPublishing(repairRun).date_jst, '2026-09-03', '最後の公開面の日を返す');
  eq(lastPublishing(repairRun).lane, 'A', 'そのレーンも返す');
  eq(lastPublishing(laned(['2026-09-01', 'shipped', 'F'])), null,
     '**公開が1度も無ければ null**（0日と「窓の中に無い」を混ぜない）');

  const iv = (kind) => [{ kind, who: 'owner', note: 'x' }];
  const touched = [
    { run_id: 'a', date_jst: '2026-08-11', outcome: 'shipped', interventions: [] },
    { run_id: 'b', date_jst: '2026-08-12', outcome: 'shipped', interventions: iv('infra') },
    { run_id: 'c', date_jst: '2026-08-13', outcome: 'shipped', interventions: [] },
  ];
  eq(shippingStreaks(touched).current.days, 3, '介入があっても出荷は出荷');
  eq(handsOffStreaks(touched).current.days, 1, '**介入のあった日で無介入連続は切れる**');
  eq(handsOffStreaks(touched).longest.days, 1, '最長も1（前後がつながらない）');
  const otherRouteTouched = [
    { run_id: 'a', date_jst: '2026-08-11', outcome: 'failed', interventions: iv('infra') },
    { run_id: 'b', date_jst: '2026-08-11', outcome: 'shipped', interventions: [] },
  ];
  eq(handsOffStreaks(otherRouteTouched).current.days, 0,
     '**出荷した行が無介入でも、同じ日に人が別の行を直したなら無介入ではない**（日単位で数える）');
  const abandoned = runsOf(['2026-08-11', 'shipped'], ['2026-08-12', 'failed'], ['2026-08-13', 'failed']);
  eq(handsOffStreaks(abandoned).current.days, 0,
     '**壊れたまま誰も触らない日は無介入に数えない**（放置で伸びる自律指標を作らない）');

  console.log(bad ? `\n${bad}/${n} 失敗` : `selftest: ${n}/${n} 通過`);
  if (bad) process.exit(1);
}

// --- CLI ---------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const has = (n) => argv.includes(`--${n}`);
  const val = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };

  if (has('selftest')) { selftest(); process.exit(0); }

  const doc = load();
  const problems = validate(doc);
  if (problems.length) {
    console.error('autopilot-runs.json is malformed:');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('\n壊れた台帳は「集計できない」ではなく「指標が黙って嘘になる」を意味する。');
    process.exit(1);
  }

  if (has('append')) {
    // **書く先を間違えていたら、書く前に止める。**（refusesMergedDayBranch の理由）
    if (!has('allow-merged-branch')) {
      let branch = null;
      const facts = { ancestor: null, sameContent: null };
      try {
        const { execFileSync } = await import('node:child_process');
        const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
        branch = git('rev-parse', '--abbrev-ref', 'HEAD');
        try {
          execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main'],
            { cwd: ROOT, stdio: 'ignore' });
          facts.ancestor = true;
        } catch (e) {
          // 終了コード1は「祖先ではない」。それ以外（origin/main が無い等）は判定不能。
          facts.ancestor = e.status === 1 ? false : null;
        }
        // squash マージは祖先にならないので、**変えたファイルの中身で見る**
        // （delete-branch.yml と同じ判定）。差分ファイルが0の回は判定不能のまま
        // ——claim コミットだけのブランチを「マージ済み」と読ませない。
        if (facts.ancestor === false) {
          const base = git('merge-base', 'origin/main', 'HEAD');
          const files = git('diff', '--name-only', base, 'HEAD').split('\n').filter(Boolean);
          if (files.length > 0) {
            const drift = git('diff', '--name-only', 'HEAD', 'origin/main', '--', ...files);
            facts.sameContent = drift === '';
          }
        }
      } catch { /* git が無い・リポジトリでない → 判定不能のまま */ }
      if (refusesMergedDayBranch(branch, facts)) {
        console.error(`${branch} は既に main へ入っている。**ここに台帳を積むと取り残しになる。**`);
        console.error('  閉じたPRのブランチへの push は次の検証が拾わない'
          + '（auto-merge は検証済みSHAだけをマージする設計の帰結）。');
        console.error('  main から切り直してから書くこと:');
        console.error('    git fetch origin main && git checkout -B claude/autopilot-ledger-$(TZ=Asia/Tokyo date +%Y%m%d) origin/main');
        console.error('  それでもここへ書く理由があるなら --allow-merged-branch（理由をPR本文に書くこと）。');
        process.exit(1);
      }
    }
    const run = {
      run_id: val('run-id'), date_jst: val('date'), route: val('route'),
      attempted: val('attempted', 'true') === 'true',
      outcome: val('outcome'),
      lane: val('lane', null), action: val('action', null),
      pr: val('pr') ? Number(val('pr')) : null,
      artifact: val('artifact', null),
      failure_reason: val('failure-reason', null),
      external_ref: val('external-ref', null),
      interventions: [],
      source: val('source', 'session'),
    };
    // 失敗の付帯情報。**種別が分からない回に種別を書かない**ため、
    // --failure-class は渡されたときだけ入れる。ここに推測を書くと
    // selfheal の「同じ failure_class を3回直したら人へ」という歯止めが
    // 別の種別として数えられて効かなくなる（直せない故障を毎日直し続ける）。
    if (val('failure-class')) run.failure_class = val('failure-class');
    if (val('failed-at')) run.failed_at = val('failed-at');
    if (val('detected-at')) run.detected_at = val('detected-at');
    if (val('detected-note')) run.detected_note = val('detected-note');
    // 種別を決められなかった失敗は、決められなかったことを台帳に残す。
    // 空欄は「未記入」と「該当なし」の区別がつかない。
    if (val('needs-triage') === 'true') run.needs_triage = true;
    if (doc.runs.some((r) => r.run_id === run.run_id)) {
      console.log(`skip: run_id ${run.run_id} already recorded`);
      process.exit(0);
    }
    doc.runs.push(run);
    doc.runs.sort((a, b) => (a.date_jst + a.route < b.date_jst + b.route ? -1 : 1));
    const after = validate(doc);
    if (after.length) {
      console.error('追記後の台帳が不正:');
      for (const p of after) console.error(`  - ${p}`);
      process.exit(1);
    }
    fs.writeFileSync(RUNS_PATH, JSON.stringify(doc, null, 2) + '\n');
    console.log(`appended ${run.run_id} (${run.outcome})`);
    process.exit(0);
  }

  // 費用の台帳は任意（この台帳は費用を持たない設計）。ただし
  // **「無い」と「読めない」は分ける** —— 壊れていると実費の行が丸ごと消え、
  // 0なのか未観測なのか読めないのかが、同じ見た目になる。
  let costDoc = null;
  let costUnreadable = null;
  try {
    costDoc = readLedger(COST_PATH,
      { why: '実費の行が消えるだけで、0とも未観測とも区別がつかなくなる' });
  } catch (e) {
    costUnreadable = e.message;
  }
  // 読めないこと自体が異常なので握りつぶさない（statusAgreement が problem として言う）。
  let statusDoc = null;
  try { statusDoc = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8')); } catch { /* statusAgreement が報告する */ }
  const s = summarize(doc, { since: val('since', null), costDoc, statusDoc });
  if (costUnreadable) { console.error(costUnreadable); process.exit(1); }

  /**
   * status JSON の `runs` に入る形。**`--json` と `--write-status` で同じものを使う。**
   * 別々に組むと、片方だけ直したときに公開されるほうがずれる
   * ——2026-09-02 に本番へ出た 40/27/18 は、まさに手で写した写しだった。
   */
  const runsBlock = {
    window: s.window,
    completion_rate: s.completion_rate === null ? null : Number(s.completion_rate.toFixed(4)),
    change_failure_rate: s.change_failure_rate === null ? null : Number(s.change_failure_rate.toFixed(4)),
    human_intervention_rate: s.human_intervention_rate === null ? null : Number(s.human_intervention_rate.toFixed(4)),
    intervention_by_kind: s.intervention_by_kind,
    artifact_autonomy_rate: s.artifact_autonomy_rate === null ? null : Number(s.artifact_autonomy_rate.toFixed(4)),
    shipping_day_rate: s.shipping_day_rate === null ? null : Number(s.shipping_day_rate.toFixed(4)),
    totals: s.totals, by_route: s.by_route,
    primary_ever_shipped: s.primary_ever_shipped,
    no_run_days: s.no_run_days,
    streaks: s.streaks,
    shipping_streaks: s.shipping_streaks,
    hands_off_streaks: s.hands_off_streaks,
    // **status JSON の `streak.consecutive_no_article_days` は手書きの欄。**
    // あれはセッションが自分で書く散文側（reason / verified / next と同じ列）で、
    // 台帳から導かれていない —— 日報にも autopilot-health にも出ているのに、
    // **書いた本人以外は確かめられない。**
    // ここに導出値を並べて置く。突き合わせる側が現れたときの正はこちら。
    publishing_streaks: s.publishing_streaks,
    last_publishing: s.last_publishing,
    intervention_count: s.interventions.length,
    timings: s.timings,
  };

  if (has('json')) {
    console.log(JSON.stringify(runsBlock, null, 2));
    process.exit(0);
  }

  // **`runs` ブロックだけを差し替える。**status JSON の他の欄（reason / verified /
  // owner_requests / next）はセッションが書く散文で、台帳から導けない。
  // 丸ごと生成する実装にすると、その日の判断がここで消える。
  if (has('write-status')) {
    if (!statusDoc) {
      console.error('data/autopilot-status.json が読めないので書き換えない'
        + ' — 空から作ると reason / verified / owner_requests が消える');
      process.exit(1);
    }
    statusDoc.runs = runsBlock;
    fs.writeFileSync(STATUS_PATH, `${JSON.stringify(statusDoc, null, 2)}\n`);
    console.log(`data/autopilot-status.json の runs を台帳の現在値で書き直した`
      + `（${runsBlock.totals.runs} 実行 / 着手 ${runsBlock.totals.attempted} / 出荷 ${runsBlock.totals.shipped}`
      + ` / ${runsBlock.window.days} 日）`);
    process.exit(0);
  }

  console.log(render(s, doc));
  if (has('check')) {
    // 形の検査（validate）はすでに上で通っている。ここで見るのは**書かれ続けているか**。
    // validate() に入れていないのは、--append が validate を先に通すため。
    // 陳腐化で validate が落ちると、それを直す唯一の手段（追記）まで塞がる。
    if (s.staleness.stale) {
      console.error(`\n台帳が ${s.staleness.days_behind ?? '?'} 日書かれていない（許容 ${s.staleness.max_days} 日）。`);
      console.error('**行の形が正しいことと、行が在ることは別。** 上の追記コマンドで埋めること。');
      process.exit(1);
    }
    // 台帳が書かれていても、日報が読む status JSON が古ければ出荷は無かったことになる。
    if (s.status_agreement.problems.length) {
      console.error('\n運転台帳と data/autopilot-status.json が食い違っている:');
      for (const p of s.status_agreement.problems) console.error(`  - ${p}`);
      console.error('\n**日報が読むのは status JSON のほう。** 台帳だけ正しくても報告は嘘になる。');
      process.exit(1);
    }
    console.log('\n台帳の形と整合に問題なし。');
  }
}
