#!/usr/bin/env node
/**
 * 公開ページ /autopilot/ の数字が、台帳の現在値と一致することを検査する。
 *
 *   node scripts/check-autopilot-page.mjs           # 表示
 *   node scripts/check-autopilot-page.mjs --check        # 台帳の現在値（今日の日付で計算した自律スコア）と照合
 *   node scripts/check-autopilot-page.mjs --as-stamped   # 自律スコアだけ、ページに刻まれた計算日で計算して照合
 *   node scripts/check-autopilot-page.mjs --selftest
 *
 * 【なぜ要るか】
 * [2026-08-25] 棚卸しに13件足したところ、総合自動化率が 61.3% → 58.6%、
 * タスク数が 176 → 189 に動いた。**公開ページはどちらも古いまま**で、
 * それを落とす検査がどこにも無かった。
 *
 * このリポジトリは他のほぼ全ての数字に「台帳と実装がずれたら落ちる」検査を
 * 持っている（automation-rate --check / code-authorship --check /
 * autonomy-timeline --check …）。**一番人目に触れる公開ページだけが、
 * その網の外にあった。**
 *
 * 記者が最初にやるのは、ページの数字を1つ選んで「これはどう数えましたか」と
 * 聞くこと。**そのとき台帳を開いて違う数字が出てくるのが、いちばん悪い。**
 *
 * 【何を検査するか】
 * ページ本文に現れる「総合自動化率◯%」「AI関与率◯%」「◯タスク」と、
 * **領域別の表の全行**を台帳の現在値と突き合わせる。
 * **丸めの桁数まで含めて一致を求める。**
 *
 * [2026-08-26] 領域別の表を検査に足した。**この検査が見ていたのは見出しの4つだけ**で、
 * 13行の表は網の外にあった。実際に測ったら13行中9行がずれており、
 * ⑤AI予算は 86.7% と出ているのに台帳は 76.5%（10ポイント）。
 * **一番大きくずれていたのが、この検査を入れた当のページの中**だった。
 * 見出しだけ守ると、細かいほうがずれる —— 細かいほうが数が多いので、
 * 記者が1つ選んで聞いてくる確率もそちらのほうが高い。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize } from './automation-rate.mjs';
import { readLedger } from './lib/read-ledger.mjs';
import { activeStreaks, shippingStreaks, handsOffStreaks, load as loadRuns } from './autopilot-runs.mjs';
import { score as autonomyScore, loadContext as loadScoreContext } from './autonomy-score.mjs';
import { LEDGER as CODE_LEDGER, knownRates } from './code-authorship.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PAGE_PATH = path.join(ROOT, 'autopilot/index.html');
/**
 * 同じ網に入れる文書。**配信される本文だけ**を入れる。
 *
 * [2026-08-26] 配信本文が 58.6% のまま止まっていた（台帳は 61.1%）。
 * この検査は公開ページ1枚しか見ておらず、**実際に記者へ渡る本文が網の外**だった。
 * 一番人目に触れるのはページではなく配信本文である。
 *
 * **入れてはいけないもの**:
 *   - `pr-autopilot-2026-09-numbers.md` … 「使わない数字」を**わざと**載せている
 *   - `automation-rate-2026-08.md` … 日付つきの断面。当時の値のまま残すのが正しい
 */
// [2026-09-02] 配信稿を足した。`-body.md` は 08-22 に書いた叩き台で、**実際に
// 配信するのはこちら**（見出しが対句から月次の推移へ変わっている）。網に入って
// いない文書が記者へ渡る、という形を作らないために、出す本文は必ずここへ足す。
// [2026-09-03] **トップページを足した。**9/3 の配信本文はトップ（`/`）へリンクしており、
// 記者もユーザーもまずここへ着地する。同日、配信に合わせてトップへ
// 「AI実行率76.4% / 総合自動化率66.8% / 203タスク・13領域」を出したので、
// **サイトで一番読まれるページが網の外**という形を作らないために入れる。
// （/autopilot/ だけを見ていた時期に、配信本文が 58.6% のまま止まっていたのと同じ穴。）
export const EXTRA_PATHS = [
  path.join(ROOT, 'docs/pr-autopilot-2026-09-body.md'),
  path.join(ROOT, 'docs/pr-autopilot-2026-09-final.md'),
  path.join(ROOT, 'index.html'),
];
/**
 * **配信済みの記録は、いまの台帳に追従しない。**
 *
 * [2026-09-03] `-body.md` を網に入れた 09-02 の時点で、この検査は時限式になっていた ——
 * 配信本文は「本文は配信時のまま残します（配信時点の原稿を書き換えると『何を送ったか』の
 * 記録が消えます）」と自分で宣言しているのに、この検査は台帳の**現在値**と突き合わせる。
 * **台帳が1日進んだ瞬間に必ず落ちる。**実際 09-03、日次アクチュエータが台帳へ1行足した
 * だけで、連続稼働 16→17 の食い違いで PR がマージできなくなり、
 * **台帳が main に着地できない＝翌日の判断材料が古いまま**という自己閉塞になった。
 *
 * 【凍結してよい理由】この検査が生まれた事故は「**配信前の**原稿が 58.6% で止まっていた」
 * （08-26）で、危険なのは配信前の陳腐化である。送ってしまった文書はもう動かないので、
 * 現在値と違うことは欠陥ではなく**時点が違う**というだけ。
 *
 * 【それでも見えなくしない】凍結してもズレは毎回**印字する**（落とさないだけ）。
 * 黙って照合対象から外すと、このリポジトリが何度も踏んでいる
 * 「見ていないことを、一致していると読む」に戻る。
 *
 * 【凍結できない場所】**生きた公開面（.html）は凍結できない。**
 * サイトは書き換えられるので「もう動かない」が成り立たない。
 * 置いても凍結されず、置いたこと自体を落とす。
 */
export const FROZEN_RE = /<!--\s*numbers-frozen:\s*(\d{4}-\d{2}-\d{2})(?:\s+([^>]*?))?\s*-->/;

/** 凍結宣言を読む。**判定できない書き方は凍結ではなく問題として返す。** */
export function readFreeze(text, { allowed = false, today = null } = {}) {
  const m = String(text).match(FROZEN_RE);
  if (!m) return { frozen: false, problems: [] };
  const problems = [];
  if (!allowed) {
    problems.push('numbers-frozen は配信済みの記録（docs/ の .md）にだけ置ける'
      + ' — **生きた公開面は凍結できない。**サイトは書き換えられるので「もう動かない」が成り立たない');
  }
  if (today && m[1] > today) {
    problems.push(`numbers-frozen の日付が未来（${m[1]}）`
      + ' — **配信前の原稿は台帳に追従させる。**この検査が生まれたのは配信前の陳腐化である');
  }
  return { frozen: problems.length === 0, at: m[1], note: (m[2] ?? '').trim(), problems };
}

/**
 * 1ファイルぶんの判定。**呼び出し側に分岐を持たせない。**
 *
 * [2026-09-03] 最初は main() の中で `if (fz.frozen)` を書いていた。変異試験で
 * **「凍結なら compare を呼ばない」に書き換えてもテストが1件も落ちなかった** ——
 * つまり「ズレは印字する」という設計上いちばん大事な約束が、テストに覆われて
 * いなかった。`compare()` 単体しか見ていなかったのが原因。ここへ切り出して、
 * **凍結してもズレが drift に出ることを固定する。**
 */
export function classifyFile(text, { allowed = false, today = null, live }) {
  const fz = readFreeze(text, { allowed, today });
  const r = compare(text, live);
  return {
    problems: [...fz.problems, ...(fz.frozen ? [] : r.problems)],
    drift: fz.frozen ? r.problems : [],
    found: r.found,
    frozen: fz.frozen, at: fz.at ?? null, note: fz.note ?? '',
  };
}

/**
 * ページに刻まれた自律スコアの計算日（`<span data-decision-date>`）を読む。
 *
 * 【2026-10-27 提案、同日オーナー承認（docs/routine-ci-scope.md）】
 * 自律スコアは 28 日の滑る窓で数えるので、**台帳が1行も変わらなくても、暦が進むだけで
 * 今日の計算値はページから離れていく。**日次の Act が止まると約2日で全 PR が落ちていた
 * （2026-10-17〜19 の詰まりと同じ型）。--as-stamped はスコアを「ページが自分で名乗る計算日」
 * で計算し直して照合する。台帳と照合することはやめない。やめるのは時計を入力にすることだけ。
 *
 * **読めない刻みは、読めたことにしない。**ページにスコアが出ているのに刻みが無い、
 * 刻みどうしが食い違う、日付として読めない、未来の日付 —— どれも問題として返す。
 */
export const DECISION_STAMP_RE = /<span data-decision-date>([^<]*)<\/span>/g;
// 形が合っていても存在しない日（2026-13-01）は日付ではない。例外にせず false を返す。
const isIsoDate = (d) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = Date.parse(`${d}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d;
};

/** 自律スコア（合計か成分の行）が出ているか。**時計で動く数字はこれだけ。** */
const showsScore = (html) => /<span data-score-total>/.test(html) || /<tr data-score="/.test(html);

export function readDecisionStamp(html, { today }) {
  const stamps = [...String(html).matchAll(DECISION_STAMP_RE)].map((m) => m[1].trim());
  const problems = [];
  if (!stamps.length) {
    if (showsScore(String(html))) problems.push('自律スコアが出ているのに計算日（data-decision-date）が無い'
      + ' — **いつの値かを名乗らない数字は、時点を決めて照合できない**');
    return { stamp: null, problems };
  }
  const distinct = [...new Set(stamps)];
  if (distinct.length > 1) {
    problems.push(`計算日（data-decision-date）が食い違う: ${distinct.join(' / ')}`
      + ' — **1枚のページに2つの時点を置かない**');
    return { stamp: null, problems };
  }
  const stamp = distinct[0];
  if (!isIsoDate(stamp)) {
    problems.push(`計算日（data-decision-date）が日付として読めない: ${stamp}`);
    return { stamp: null, problems };
  }
  if (!isIsoDate(today)) throw new Error('today must be a YYYY-MM-DD date');
  if (stamp > today) {
    problems.push(`計算日（data-decision-date）が未来: ${stamp}（今日 ${today}）`
      + ' — **まだ来ていない日の値は照合できない**');
    return { stamp: null, problems };
  }
  return { stamp, problems };
}

/**
 * 引数から照合のモードを決める。**--check が両方あれば --check（厳しいほう）。**
 * --as-stamped は --check で始めない（check-authority は文字列の部分一致で必須の
 * 検査を探すので、紛らわしい名前にしない）。
 *   check      … 自律スコアを今日の日付で計算して照合する（鮮度も見る）
 *   as-stamped … 自律スコアをページに刻まれた計算日で計算して照合する（鮮度は見ない）
 *   show       … 表示だけ。数字は今日の日付で計算する（--check と同じ）
 */
export function pageCheckMode(argv) {
  if (argv.includes('--check')) return 'check';
  if (argv.includes('--as-stamped')) return 'as-stamped';
  return 'show';
}

/**
 * 照合の本体。**main() はファイルと台帳を読んでこれを呼ぶだけにする。**
 *
 * [2026-10-27] 最初の版は「どの日で自律スコアを計算するか」を main() に書いていた。
 * レビューの変異試験で、**--check も刻みの日で計算する／刻みを読まずに今日で計算する／
 * 刻みの問題を捨てる**のどれに書き換えても、自己テストもスコープのテストも1件も落ちなかった
 * （自己テストは readDecisionStamp() の読み取りしか見ていなかった）。前の2つは、
 * 鮮度の門を黙って時点照合に変える形と、全 PR の時計による詰まりを黙って戻す形である。
 * ここへ切り出して、日付の選び方と問題の行き先を自己テストで固定する。
 *
 *   pages    … [{ label, text, allowed, primary }]。primary は計算日を刻む /autopilot/。
 *              allowed は numbers-frozen を置ける配信済みの記録（docs/ の .md）。
 *   baseLive … 自律スコア以外の正。**時計を読まない**（率・タスク数・Lane B・連続・著者率・失敗の層）。
 *   scoreAt  … scoreAt(day) がその日を「今日」として計算した自律スコアを返す。
 *              例外は「計算できない」として null のまま compare に渡す（0 を捏造しない）。
 *
 * **時計で動く数字（自律スコアと計算日）は primary にだけ置ける。**ほかの照合対象は
 * 計算日を持たず、鮮度の範囲（routine-ci-scope.mjs の AUTOPILOT_PAGE_PATHS）の外に
 * ある。そこへ点数を置くと、古くなっても PR では誰も見ない。置いたこと自体を落とす。
 */
export function checkPages({ mode, today, pages, baseLive, scoreAt }) {
  if (!['check', 'as-stamped', 'show'].includes(mode)) throw new Error(`unknown mode: ${mode}`);
  if (!isIsoDate(today)) throw new Error('today must be a YYYY-MM-DD date');
  const problems = [];
  const primary = pages.find((p) => p.primary) ?? null;
  let scoreDay = today;
  if (mode === 'as-stamped' && primary) {
    const st = readDecisionStamp(primary.text, { today });
    problems.push(...st.problems.map((x) => `${primary.label}: ${x}`));
    // 刻みが読めないときは今日で計算する（＝ --check と同じ厳しさ）。問題は別に落とす。
    if (st.stamp) scoreDay = st.stamp;
  }
  for (const p of pages) {
    if (p.primary) continue;
    // 属性の名前だけで見る（書き方を変えた点数が照合の正規表現を外れても、ここでは外れない）。
    if (/data-score-total|data-score=|data-decision-date/.test(p.text)) {
      problems.push(`${p.label}: 自律スコアか計算日（data-score / data-score-total / data-decision-date）がある`
        + ` — **時計で動く数字は、計算日を刻む ${primary?.label ?? 'autopilot/index.html'} にだけ置ける。**`
        + 'ほかの照合対象は計算日を持たず鮮度の範囲の外にあるので、ここに置いた点数は古くなっても PR で見えない');
    }
  }
  let autonomy = null, scoreError = null;
  try { autonomy = scoreAt(scoreDay); } catch (e) { scoreError = e.message; }
  const live = { ...baseLive, autonomy_score: autonomy };
  const found = [], drifted = [];
  for (const p of pages) {
    // **凍結してよいのは docs/ の .md（配信済みの記録）だけ。**
    // .html は生きた公開面なので、宣言を置いたこと自体が問題になる。
    const r = classifyFile(p.text, { allowed: p.allowed, today, live });
    problems.push(...r.problems.map((x) => `${p.label}: ${x}`));
    // **落とさないが、見えなくもしない。**ズレは毎回印字する。
    if (r.frozen) drifted.push({ label: p.label, at: r.at, note: r.note, lines: r.drift });
    found.push(...r.found.map((x) => ({ ...x, frozen: r.frozen, file: p.label })));
    // **一覧に入れたのに1つも照合していない、を落とす。**
    // 表記が変わって正規表現に当たらなくなると、検査は黙って通る ——
    // それは「一致した」ではなく「見ていない」。網に入れた文書には
    // 少なくとも1つ照合対象があることを求める（PAGE_PATH も同じ）。
    if (r.found.length === 0) {
      problems.push(`${p.label}: 突き合わせられる数字が1つも見つからない`
        + ' — **表記が変わって検査が素通りしている可能性。**'
        + '網から外すなら EXTRA_PATHS から消すこと（黙って通さない）');
    }
  }
  return { problems, found, drifted, scoreDay, scoreError };
}

export const COVERAGE_PATH = path.join(ROOT, 'data/automation-coverage.json');
/**
 * Lane B（アプリ本体）の台帳。[2026-09-02] ページ §2 と配信本文が
 * 「同期間に App Store へ並んだ版は7」と書き始めたので、同じ網に入れる。
 * 無ければ Lane B の数字は検査しない（出す義務までは課さない）が、
 * **ページに出ていて台帳が無い**のは落とす（下の compare）。
 */
export const APP_RELEASES_PATH = path.join(ROOT, 'data/app-releases.json');

const pct = (x) => `${(x * 100).toFixed(1)}%`;

/**
 * ページから読み取れた数字と、台帳の現在値を突き合わせる。
 * **ページに出ていない指標は検査しない** — 出す義務までは課さない
 * （出したなら合っていること、だけを課す）。
 */
export function compare(html, live) {
  const problems = [];
  const found = [];

  const checks = [
    // 飾り（`<b>` / `** | **` / 空白）をまたぐ。**数字は挟まないので取り違えない。**
    { label: '総合自動化率', re: /総合自動化率[^\d%]{0,12}([\d.]+)%/g, want: pct(live.overall_automation_rate) },
    { label: 'AI関与率', re: /AI関与率[^\d%]{0,12}([\d.]+)%/g, want: pct(live.ai_involvement_rate) },
    { label: 'AI実行率', re: /AI実行率[^\d%]{0,12}([\d.]+)%/g, want: pct(live.ai_execution_rate) },
    { label: 'カバー率', re: /カバー率[^\d%]{0,12}([\d.]+)%/g, want: pct(live.coverage_rate) },
    { label: 'タスク数', re: /(\d+)\s*タスク・13領域/g, want: String(live.counts_total) },
    { label: '実施中タスク数', re: /実施中\s*(\d+)\s*タスク/g, want: String(live.doing) },
    { label: '未着手タスク数', re: /未着手\s*(\d+)\s*件/g, want: String(live.counts?.nobody) },
    { label: '集計対象タスク数', re: /集計対象\s*(\d+)\s*タスク/g, want: String(live.defined) },
    // 配信本文の見出し。**記者がいちばん引用する2か所。**
    { label: '自律度の到達点', re: /自律度は[\d.]+%→([\d.]+)%/g, want: pct(live.overall_automation_rate) },
    { label: '見出しの率', re: /「([\d.]+)%」は、いちばん厳しい/g, want: pct(live.overall_automation_rate) },
  ];

  // Lane B（アプリ本体）。ページ §2 と配信本文の「版の数」「コード差分の率」を台帳の summary に当てる。
  // 台帳が無いとき、ページに Lane B の数字が出ていれば**落とす**（出しているのに正が無い）。
  const lb = live.lane_b ?? null;
  const laneB = [
    { label: 'Lane B タグを切った版', re: /タグを切った版は[^\d]{0,12}(\d+)/g, key: 'tags' },
    { label: 'Lane B App Storeに並んだ版', re: /App Storeに並んだ版は[^\d]{0,12}(\d+)/g, key: 'store_ready' },
    { label: 'Lane B App Storeに並んだ版（本文）', re: /アプリ本体は[^\d]{0,8}(\d+)版[^\d\n]{0,4}がApp Storeに並/g, key: 'store_ready' },
    { label: 'Lane B 実機確認の記録がある版', re: /実機確認の記録がある版は[^\d]{0,12}(\d+)/g, key: 'device_verified_same_sha' },
    { label: 'Lane B 公開時刻を幅で持てた版', re: /幅として持てた版が[^\d]{0,12}(\d+)/g, key: 'release_time_bounded' },
    { label: 'Lane B コード差分 AI著者率（コミット）', re: /コード差分は、コミットで[^\d%]{0,8}([\d.]+)%/g, key: 'code_ai_commit_rate_pct', pct: true },
    { label: 'Lane B コード差分 AI著者率（変更行）', re: /コミットで[^\d%]{0,8}[\d.]+%[^\d%\n]{0,8}、変更行で[^\d%]{0,8}([\d.]+)%/g, key: 'code_ai_line_rate_pct', pct: true },
  ];
  for (const c of laneB) {
    const hits = [...html.matchAll(c.re)];
    if (!hits.length) continue;
    if (!lb) {
      problems.push(`${c.label}: ページに出ているが data/app-releases.json が無い`
        + ' — **正の無い数字を公開面に置かない。**3リポジトリの揃った場所で `node scripts/app-releases.mjs --write`');
      continue;
    }
    const want = c.pct ? `${Number(lb[c.key]).toFixed(1)}%` : String(lb[c.key]);
    for (const h of hits) {
      const got = c.pct ? `${h[1]}%` : h[1];
      found.push({ label: c.label, got, want });
      if (got !== want) {
        problems.push(`${c.label}: ページは ${got}、台帳（data/app-releases.json summary）は ${want}`
          + ' — **Lane B の数字が台帳より古い。**--write で台帳を直してからページを直す');
      }
    }
  }

  // 連続稼働。[2026-09-02] 定義を autopilot-runs.mjs の activeStreaks() に置いた。
  // ページと本文が「連続稼働は現在N日」「最長もM日」と書くなら、その定義の値であること。
  const sk = live.streaks ?? null;
  const streakChecks = [
    { label: '連続稼働（現在）', re: /連続稼働は現在[^\d\n]{0,6}(\d+)[^\d\n]{0,4}日/g, key: 'current' },
    { label: '連続稼働（最長）', re: /最長も[^\d\n]{0,6}(\d+)[^\d\n]{0,4}日/g, key: 'longest' },
    // [2026-09-03] **稼働だけを公開面に置かない。**稼働の定義（no_run の行がある日だけ停止）は
    // 正しいが、その定義では失敗し続けても連続は伸びる。実際いまページに出ている16日は
    // 08-29〜08-31 の出荷ゼロ3日をまたいでいる。切れるほうの数字も同じ強さで照合する
    // —— 照合しないままページに書くと「正の無い数字を公開面に置かない」に反する。
    { label: '連続出荷（現在）', re: /連続出荷は現在[^\d\n]{0,6}(\d+)[^\d\n]{0,4}日/g, key: 'ship_current' },
    { label: '連続出荷（最長）', re: /連続出荷の最長は[^\d\n]{0,6}(\d+)[^\d\n]{0,4}日/g, key: 'ship_longest' },
  ];
  for (const c of streakChecks) {
    const hits = [...html.matchAll(c.re)];
    if (!hits.length) continue;
    if (!sk) {
      problems.push(`${c.label}: ページに出ているが運転台帳から連続稼働を計算できない — 正の無い数字を公開面に置かない`);
      continue;
    }
    for (const h of hits) {
      const got = h[1], want = String(sk[c.key]);
      found.push({ label: c.label, got, want });
      if (got !== want) {
        problems.push(`${c.label}: ページは ${got} 日、台帳の定義（activeStreaks）では ${want} 日`
          + ' — **「連続」は定義で数える。**skipped_gate を稼働と読んだ日数を書かない');
      }
    }
  }

  // コード著者率。[2026-09-02] 原稿が「同期間の99.5%」と書きながら 8/11〜8/21 の値を引いていた。
  // **ページ・本文に出る「コミット◯%」「変更行◯%」は、台帳（見出しか windows[]）か
  // Lane B の台帳のどれかの値でなければならない。**窓の無い率は check-pr-facts が別に落とす。
  if (live.code_rates) {
    const okC = new Set(live.code_rates.map((r) => `${Number(r.commits).toFixed(1)}%`));
    const okL = new Set(live.code_rates.map((r) => `${Number(r.lines).toFixed(1)}%`));
    if (lb) { okC.add(`${Number(lb.code_ai_commit_rate_pct).toFixed(1)}%`); okL.add(`${Number(lb.code_ai_line_rate_pct).toFixed(1)}%`); }
    for (const [label, re, ok] of [
      ['コード著者率（コミット）', /コミット(?:の|で)?[^\d%\n]{0,6}([\d.]+)%/g, okC],
      ['コード著者率（変更行）', /変更行(?:の|で)?[^\d%\n]{0,6}([\d.]+)%/g, okL],
    ]) {
      for (const h of html.matchAll(re)) {
        const got = `${h[1]}%`;
        // 合っていれば「どの窓に当たったか」ではなく値そのものを want に出す（表示の一致判定のため）
        found.push({ label, got, want: ok.has(got) ? got : [...ok].join(' | ') });
        if (!ok.has(got)) {
          problems.push(`${label}: ${got} はどの台帳の窓にも無い（台帳: ${[...ok].join(' / ')}）`
            + ' — **台帳に無い率を書かない。**別の窓なら `node scripts/code-authorship.mjs --write-window --from … --to …` で先に台帳へ');
        }
      }
    }
  }

  // 自律スコア。[2026-09-04] §5 として公開面に出したので、同じ網に入れる。
  //
  // **この節は「作った日」に公開している。**だから照合を先に置く ——
  // 正の無い数字を公開面に置かない、というのはこのファイルが在る理由そのもので、
  // 新しい節を例外にすると、いちばん新しい数字だけが網の外に出る。
  //
  // 行は `data-score` / `data-stage` 属性で結び付ける。見出しの文言で結ぶと、
  // **言い回しを変えた日に照合が黙って消える**（2026-08-26 に5回踏んだ形）。
  const asc = live.autonomy_score ?? null;
  const scoreRows = [...html.matchAll(
    /<tr data-score="(vdc|umr|ra|ep|tuc)">.*?<td class="num">(?:<b>)?([\d.]+)(?:<\/b>)?<\/td><td class="num">(\d+)<\/td>/g)];
  const totalHits = [...html.matchAll(/<span data-score-total>([\d.]+)<\/span>/g)];
  if ((scoreRows.length || totalHits.length) && !asc) {
    problems.push('自律スコアがページに出ているが、台帳から計算できない'
      + ' — **正の無い数字を公開面に置かない。**`node scripts/autonomy-score.mjs --check`');
  } else if (asc) {
    for (const h of totalHits) {
      const got = h[1], want = asc.total.toFixed(1);
      found.push({ label: '自律スコア（合計）', got, want });
      if (got !== want) {
        problems.push(`自律スコア（合計）: ページは ${got}、台帳の現在値は ${want}`
          + ' — **点数だけ直して成分を置き去りにしない。**両方 scripts/autonomy-score.mjs が正');
      }
    }
    for (const [, id, pts, max] of scoreRows) {
      const c = asc.components[id];
      for (const [label, got, want] of [
        [`自律スコア ${id}（得点）`, pts, c.points.toFixed(1)],
        [`自律スコア ${id}（配点）`, max, String(c.max)],
      ]) {
        found.push({ label, got, want });
        if (got !== want) {
          problems.push(`${label}: ページは ${got}、台帳の現在値は ${want}`
            + ' — 配点は data/autonomy-score.json（人間の持ち分）が正');
        }
      }
    }
  }

  // 失敗の層。**「選び方を間違えたのか、作り方を間違えたのか」の内訳そのもの。**
  const stageRows = [...html.matchAll(/<tr data-stage="(eligibility|execution|cost|absent)">.*?<td class="num">(?:<b>)?(\d+)(?:<\/b>)?<\/td>/g)];
  if (stageRows.length && !live.failure_stages) {
    problems.push('失敗の層がページに出ているが、運転台帳から数えられない — 正の無い数字を公開面に置かない');
  } else {
    for (const [, stage, got] of stageRows) {
      const want = String(live.failure_stages?.[stage] ?? 0);
      found.push({ label: `失敗の層（${stage}）`, got, want });
      if (got !== want) {
        problems.push(`失敗の層（${stage}）: ページは ${got} 件、運転台帳では ${want} 件`
          + ' — **層の内訳は data/autopilot-runs.json の failure_stage が正**');
      }
    }
  }

  // 領域別の表。**行ごとに突き合わせる。**
  // 「表があること」は求めない（無ければ検査しない）が、**あるなら全行合っていること。**
  for (const m of html.matchAll(
    /<tr><td>([^<]+)<\/td><td class="num">(?:<b>)?([\d.]+)%(?:<\/b>)?<\/td><td class="num">(?:<b>)?([\d.]+)%(?:<\/b>)?<\/td><\/tr>/g
  )) {
    const [, area, overall, involve] = m;
    const t = live.by_area?.[area];
    if (!t) {
      problems.push(`領域別の表に台帳に無い領域 ${area} がある`
        + ' — 領域名を変えたなら台帳とページの両方を直すこと');
      continue;
    }
    for (const [label, got, want] of [
      [`${area} 総合`, `${overall}%`, pct(t.overall_automation_rate)],
      [`${area} 関与`, `${involve}%`, pct(t.ai_involvement_rate)],
    ]) {
      found.push({ label, got, want });
      if (got !== want) {
        problems.push(`${label}: ページは ${got}、台帳の現在値は ${want}`
          + ' — **領域別の表が台帳より古い。**見出しだけ直して表を置き去りにしない');
      }
    }
  }

  for (const c of checks) {
    const hits = [...html.matchAll(c.re)];
    if (!hits.length) continue;
    for (const h of hits) {
      const got = c.label.endsWith('タスク数') ? h[1] : `${h[1]}%`;
      found.push({ label: c.label, got, want: c.want });
      if (got !== c.want) {
        problems.push(`${c.label}: ページは ${got}、台帳の現在値は ${c.want}`
          + ' — **公開ページが台帳より古い。**数字を直すか、台帳を直すか、どちらかを同じコミットに含めること');
      }
    }
  }
  return { problems, found };
}

function selftest() {
  let total = 0; const failures = [];
  const t = (name, cond) => { total += 1; if (!cond) failures.push(name);
    console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`); };
  const live = {
    overall_automation_rate: 0.5860215053763441,
    ai_involvement_rate: 0.8774193548387097,
    ai_execution_rate: 0.7032258064516129,
    counts_total: 189,
    doing: 155, defined: 186, counts: { nobody: 31 },
  };
  t('一致すれば通る',
    compare('総合自動化率58.6%、AI関与率87.7%。189タスク・13領域', live).problems.length === 0);
  t('古い率を落とす',
    compare('総合自動化率61.3%', live).problems.some((p) => p.includes('総合自動化率')));
  t('古いタスク数を落とす',
    compare('176タスク・13領域', live).problems.some((p) => p.includes('タスク数')));
  t('分母と未着手数が一致すれば通る', compare('実施中155タスク・集計対象186タスク・未着手31件', live).problems.length === 0);
  t('率が正しくても古い実施中数を落とす', compare('AI実行率70.3%・実施中154タスク', live).problems.some(p => p.includes('実施中タスク数')));
  t('古い未着手数を落とす', compare('未着手32件', live).problems.some(p => p.includes('未着手タスク数')));
  t('全棚卸し数を分母と誤記すると落とす', compare('集計対象189タスク', live).problems.some(p => p.includes('集計対象タスク数')));

  // --- 自律スコア（§5）。**落ちることを両側で確かめる。** ---
  const asc = {
    autonomy_score: { total: 35.5, components: {
      vdc: { points: 0, max: 30 }, umr: { points: 19.7, max: 25 },
      ra: { points: 2.7, max: 20 }, ep: { points: 4.7, max: 15 }, tuc: { points: 8.4, max: 10 } } },
    failure_stages: { eligibility: 12, execution: 6, cost: 3, absent: 2 },
  };
  const scoreRow = (id, pts, max) => `<tr data-score="${id}"><td>x</td><td class="num"><b>${pts}</b></td><td class="num">${max}</td><td>y</td></tr>`;
  const stageRow = (id, n) => `<tr data-stage="${id}"><td>x</td><td class="num"><b>${n}</b></td><td>y</td></tr>`;
  t('自律スコアが合っていれば通る',
    compare(`<span data-score-total>35.5</span>${scoreRow('umr', '19.7', 25)}`, asc).problems.length === 0);
  t('**古い合計点を落とす**',
    compare('<span data-score-total>40.0</span>', asc).problems.some((p) => p.includes('自律スコア（合計）')));
  t('**成分の得点がずれたら落とす**（合計だけ直して成分を置き去りにしない）',
    compare(scoreRow('umr', '25.0', 25), asc).problems.some((p) => p.includes('umr（得点）')));
  t('**配点を書き換えたら落とす**（配点は人間の持ち分）',
    compare(scoreRow('vdc', '0.0', 10), asc).problems.some((p) => p.includes('vdc（配点）')));
  t('**正が計算できないのにページに出ていたら落とす**',
    compare('<span data-score-total>35.5</span>', { autonomy_score: null })
      .problems.some((p) => p.includes('計算できない')));
  t('ページに出ていなければ検査しない（出す義務までは課さない）',
    compare('自律スコアの話はしていない', { autonomy_score: null }).problems.length === 0);
  t('失敗の層が合っていれば通る',
    compare(stageRow('eligibility', 12) + stageRow('cost', 3), asc).problems.length === 0);
  t('**層の件数がずれたら落とす**',
    compare(stageRow('eligibility', 9), asc).problems.some((p) => p.includes('eligibility')));
  t('**台帳に無い層は 0 件として落とす**（黙って合わせない）',
    compare(stageRow('absent', 2), { failure_stages: { eligibility: 12 } })
      .problems.some((p) => p.includes('absent')));
  t('<b> をまたいでも読める',
    compare('<b>総合自動化率58.6%、AI関与率87.7%。</b>', live).problems.length === 0);
  t('出ていない指標は検査しない（出す義務までは課さない）',
    compare('自律運営の話だけ書いたページ', live).found.length === 0);
  t('丸めの桁がずれたら落ちる（58.6 と 59 を同じにしない）',
    compare('総合自動化率59.0%', live).problems.length === 1);

  // 領域別の表 — **見出しだけ守ると細かいほうがずれる**
  const withAreas = { ...live, by_area: {
    '⑨ マネタイズ': { overall_automation_rate: 0.2222222, ai_involvement_rate: 0.8333333 },
  } };
  const row = (a, o, i) => `<tr><td>${a}</td><td class="num">${o}</td><td class="num">${i}</td></tr>`;
  t('領域別の行が一致すれば通る',
    compare(row('⑨ マネタイズ', '22.2%', '83.3%'), withAreas).problems.length === 0);
  t('**領域別の行がずれたら落ちる**',
    compare(row('⑨ マネタイズ', '12.5%', '80.0%'), withAreas).problems.length === 2);
  t('領域別の <b> 強調をまたいでも読める',
    compare(row('⑨ マネタイズ', '<b>22.2%</b>', '83.3%'), withAreas).problems.length === 0);
  t('台帳に無い領域名は落とす（領域を消したまま表に残る、を防ぐ）',
    compare(row('⑭ 存在しない領域', '10.0%', '20.0%'), withAreas).problems.length === 1);
  t('表が無ければ検査しない（出す義務までは課さない）',
    compare('表の無いページ', withAreas).found.length === 0);

  // 配信本文の書き方（Markdown の表・見出し）でも読める
  const md = { ...live, coverage_rate: 0.8580645161290322 };
  t('Markdown の表をまたいで読める',
    compare('| **総合自動化率** | **58.6%** | 分母 |', md).problems.length === 0);
  t('Markdown の表のずれを落とす',
    compare('| **総合自動化率** | **59.9%** | 分母 |', md).problems.length === 1);
  t('配信本文の見出しを読む',
    compare('### ■ 「58.6%」は、いちばん厳しい数え方をした結果です', md).problems.length === 0);
  t('**配信本文の到達点を読む**（記者がいちばん引用する行）',
    compare('自律度は1.6%→58.6%へ', md).problems.length === 0
    && compare('自律度は1.6%→60.0%へ', md).problems.length === 1);
  t('カバー率も突き合わせる',
    compare('| カバー率 | 85.8% |', md).problems.length === 0
    && compare('| カバー率 | 87.3% |', md).problems.length === 1);

  // Lane B（アプリ本体）— ページ §2 と配信本文
  const lb = { ...md, lane_b: { tags: 14, store_ready: 7, device_verified_same_sha: 2, release_time_bounded: 2,
    code_ai_commit_rate_pct: 56.3, code_ai_line_rate_pct: 38.3 } };
  t('Lane B の版数が一致すれば通る',
    compare('タグを切った版は<b>14</b>、うちApp Storeに並んだ版は<b>7</b>', lb).problems.length === 0);
  t('**Lane B の版数がずれたら落ちる**',
    compare('うちApp Storeに並んだ版は<b>8</b>', lb).problems.length === 1);
  t('配信本文の「アプリ本体は7版」を読む',
    compare('**同じ期間にアプリ本体は7版がApp Storeに並びました**', lb).problems.length === 0
    && compare('アプリ本体は**6版**がApp Storeに並びました', lb).problems.length === 1);
  t('Lane B のコード差分の率を2つとも読む',
    compare('各版のコード差分は、コミットで<b>56.3%</b>、変更行で<b>38.3%</b>がAI著者', lb).found.length === 2
    && compare('コード差分は、コミットで<b>56.3%</b>、変更行で<b>40.0%</b>がAI著者', lb).problems.length === 1);
  t('**台帳が無いのにページに Lane B の数字があれば落ちる**（正の無い数字を置かない）',
    compare('うちApp Storeに並んだ版は<b>7</b>', md).problems.length === 1);
  t('Lane B の数字が無ければ台帳が無くても通る（出す義務までは課さない）',
    compare('自律運営の話だけ書いたページ', md).problems.length === 0);

  // 連続稼働 — 定義の値と違えば落ちる
  const sk = { ...md, streaks: { current: 16, longest: 16 } };
  t('連続稼働が定義の値と一致すれば通る',
    compare('連続稼働は現在<b>16</b>日（8月18日〜9月2日）で、最長も<b>16</b>日です', sk).problems.length === 0);
  t('**連続稼働がずれたら落ちる**（23日連続の復活を止める）',
    compare('連続稼働は現在<b>23</b>日', sk).problems.length === 1);
  t('Markdown の強調でも読む',
    compare('連続稼働は現在**16**日（8月18日〜9月2日）で、最長も**16**日', sk).found.length === 2);
  t('**台帳から計算できないのにページに連続稼働があれば落ちる**',
    compare('連続稼働は現在<b>16</b>日', md).problems.length === 1);

  // 連続出荷 — **稼働と同じ強さで照合する。**片方だけ照合すると、
  // 照合されないほうが台帳から離れても誰も気づかない。
  const sk2 = { ...md, streaks: { current: 16, longest: 16, ship_current: 2, ship_longest: 6 } };
  t('連続出荷が定義の値と一致すれば通る',
    compare('連続出荷は現在<b>2</b>日で、連続出荷の最長は<b>6</b>日', sk2).problems.length === 0);
  t('**連続出荷がずれたら落ちる**', 
    compare('連続出荷は現在<b>9</b>日', sk2).problems.length === 1);
  t('**台帳から計算できないのにページに連続出荷があれば落ちる**',
    compare('連続出荷は現在<b>2</b>日', md).problems.length === 1);
  t('稼働だけ合っていても出荷がずれていれば落ちる',
    compare('連続稼働は現在<b>16</b>日で、最長も<b>16</b>日。連続出荷は現在<b>5</b>日', sk2).problems.length === 1);

  // 配信済みの凍結 — **落とさないことと、見えなくすることは別。**
  const FZ = '<!-- numbers-frozen: 2026-09-03 配信済み -->';
  t('配信済みの記録は凍結を宣言できる',
    readFreeze(FZ, { allowed: true, today: '2026-09-03' }).frozen === true);
  t('宣言の日付と注記を読む',
    readFreeze(FZ, { allowed: true, today: '2026-09-03' }).at === '2026-09-03'
    && readFreeze(FZ, { allowed: true, today: '2026-09-03' }).note === '配信済み');
  t('**生きた公開面（.html）は凍結できない**',
    readFreeze(FZ, { allowed: false, today: '2026-09-03' }).frozen === false
    && readFreeze(FZ, { allowed: false, today: '2026-09-03' }).problems.length === 1);
  t('**未来の日付では凍結できない**（配信前の原稿を先に黙らせない）',
    readFreeze('<!-- numbers-frozen: 2026-12-31 -->', { allowed: true, today: '2026-09-03' }).frozen === false);
  t('宣言が無ければ凍結しない',
    readFreeze('ふつうの本文', { allowed: true, today: '2026-09-03' }).frozen === false);
  t('**凍結しても照合そのものは走る**（ズレを印字するために要る）',
    compare(`${FZ}\n連続出荷は現在<b>9</b>日`, sk2).problems.length === 1);
  t('凍結の宣言があっても、数字が1つも無ければ found は空のまま',
    compare(FZ, sk2).found.length === 0);
  const cf = (text, allowed) => classifyFile(text, { allowed, today: '2026-09-03', live: sk2 });
  t('**凍結してもズレは drift に出る**（照合ごと飛ばすと、この行が 0 になる）',
    cf(`${FZ}\n連続出荷は現在<b>9</b>日`, true).drift.length === 1);
  t('凍結したズレは problems には入らない（落とさない）',
    cf(`${FZ}\n連続出荷は現在<b>9</b>日`, true).problems.length === 0);
  t('**凍結していなければズレは problems に入る**（落とす）',
    cf('連続出荷は現在<b>9</b>日', true).problems.length === 1
    && cf('連続出荷は現在<b>9</b>日', true).drift.length === 0);
  t('**凍結できない場所では、宣言が問題になったうえでズレも落ちる**',
    cf(`${FZ}\n連続出荷は現在<b>9</b>日`, false).problems.length === 2);
  t('**凍結しても found は減らない**（何を見たかの記録を消さない）',
    cf(`${FZ}\n連続出荷は現在<b>9</b>日`, true).found.length === 1);

  // コード著者率 — 台帳のどの窓にも無い率は落ちる
  const cr = { ...md, code_rates: [{ commits: 99.5, lines: 94.2 }, { commits: 81.9, lines: 70.9 }],
    lane_b: { tags: 14, store_ready: 7, device_verified_same_sha: 2, release_time_bounded: 2, code_ai_commit_rate_pct: 56.3, code_ai_line_rate_pct: 38.3 } };
  t('見出しの窓の率は通る',
    compare('コミットの**99.5%**、変更行の**94.2%**がAI著者', cr).problems.length === 0);
  t('windows[] の率も通る',
    compare('コミット**81.9%**・変更行**70.9%**', cr).problems.length === 0);
  t('Lane B の率も通る（コード差分は別台帳）',
    compare('コード差分は、コミットで<b>56.3%</b>、変更行で<b>38.3%</b>', cr).problems.length === 0);
  t('**どの台帳にも無い率は落ちる**（98.8% は再現できなかった旧値）',
    compare('変更行の**98.8%**がAI著者', cr).problems.some((p) => p.includes('コード著者率')));
  t('範囲表記（87〜100%）は率として読まない',
    compare('月次ではコミットの87〜100%が続いています', cr).problems.length === 0);

  // 計算日の刻み（--as-stamped）— 読めない刻みを読めたことにしない
  const stampPage = (d1, d2 = d1) => `<p><span data-decision-date>${d1}</span>時点</p>`
    + `<b>自律スコアは<span data-score-total>43.7</span>点（<span data-decision-date>${d2}</span>時点）</b>`;
  t('刻みが1つの日付にそろっていれば、その日で計算する',
    readDecisionStamp(stampPage('2026-10-26'), { today: '2026-10-27' }).stamp === '2026-10-26');
  t('**今日の刻みも読める**（Act が今朝書いたページ）',
    readDecisionStamp(stampPage('2026-10-27'), { today: '2026-10-27' }).problems.length === 0);
  t('**スコアが出ているのに刻みが無いと落ちる**',
    readDecisionStamp('<span data-score-total>43.7</span>', { today: '2026-10-27' }).problems.length === 1);
  t('スコアも刻みも無いページは問題にしない（照合する数字が無い）',
    readDecisionStamp('自律スコアの話はしていない', { today: '2026-10-27' }).problems.length === 0);
  t('**刻みどうしが食い違うと落ちる**',
    readDecisionStamp(stampPage('2026-10-26', '2026-10-27'), { today: '2026-10-27' }).problems.some((p) => p.includes('食い違う')));
  t('**日付として読めない刻みは落ちる**（2026-13-01 も）',
    readDecisionStamp(stampPage('2026-13-01'), { today: '2026-10-27' }).problems.some((p) => p.includes('読めない'))
    && readDecisionStamp(stampPage('10/26'), { today: '2026-10-27' }).stamp === null);
  t('**未来の刻みは落ちる**（まだ来ていない日の値は照合できない）',
    readDecisionStamp(stampPage('2026-10-28'), { today: '2026-10-27' }).problems.some((p) => p.includes('未来')));
  t('刻みが読めないときは stamp を返さない（呼び出し側は今日で計算する）',
    readDecisionStamp(stampPage('2026-10-26', '2026-10-27'), { today: '2026-10-27' }).stamp === null);

  // --- 照合の本体（checkPages）— **どの日で計算するか、刻みの問題がどこへ行くか** ---
  // [2026-10-27] 上の8件は刻みの読み取りしか見ておらず、レビューの変異試験で
  // 「--check も刻みの日で計算する」「刻みを読まずに今日で計算する」「刻みの問題を捨てる」
  // のどれに書き換えても1件も落ちなかった。ここでは日ごとに違う点数を返す正を渡し、
  // **どの日の点数で照合したか**を結果で確かめる。
  t('モード: --as-stamped だけなら as-stamped、--check があれば check（厳しいほう）、無ければ show',
    pageCheckMode(['node', 'x', '--as-stamped']) === 'as-stamped'
    && pageCheckMode(['node', 'x', '--as-stamped', '--check']) === 'check'
    && pageCheckMode(['node', 'x', '--check']) === 'check'
    && pageCheckMode(['node', 'x']) === 'show');
  const S = '2026-10-24', D = '2026-10-27', OTHER = '2026-10-23';
  const comps = (vdc, umr, ra, ep, tuc) => ({ vdc: { points: vdc, max: 30 }, umr: { points: umr, max: 25 },
    ra: { points: ra, max: 20 }, ep: { points: ep, max: 15 }, tuc: { points: tuc, max: 10 } });
  const byDay = {
    [OTHER]: { total: 44.9, components: comps(0, 20.1, 6.0, 9.4, 9.4) },
    [S]: { total: 43.7, components: comps(0, 19.7, 6.0, 8.6, 9.4) },
    [D]: { total: 41.2, components: comps(0, 19.7, 4.0, 8.1, 9.4) },
  };
  const asked = [];
  const scoreAt = (day) => {
    asked.push(day);
    if (!byDay[day]) throw new Error(`fixture has no score for ${day}`);
    return byDay[day];
  };
  const page = (s, stamps) => stamps.map((d) => `<p><span data-decision-date>${d}</span>時点</p>`).join('')
    + `<b>自律スコアは<span data-score-total>${s.total.toFixed(1)}</span>点</b>`
    + Object.entries(s.components).map(([id, c]) => scoreRow(id, c.points.toFixed(1), c.max)).join('');
  const check = (mode, today, text, extra = []) => {
    asked.length = 0;
    const r = checkPages({ mode, today, baseLive: live, scoreAt,
      pages: [{ label: 'autopilot/index.html', text, allowed: false, primary: true }, ...extra] });
    return { ...r, asked: asked.join(',') };
  };
  const stale = page(byDay[S], [S, S]);
  const fresh = page(byDay[D], [D, D]);
  t('**古いが正しいページは as-stamped で通る**（刻みの日 S の点数で照合し、今日 D では計算しない）',
    (() => { const r = check('as-stamped', D, stale);
      return r.problems.length === 0 && r.scoreDay === S && r.asked === S; })());
  t('**時計が30日進んでも、古いが正しいページは as-stamped で通る**（時計を入力にしない）',
    check('as-stamped', '2026-11-26', stale).problems.length === 0);
  t('**同じ古いページは check で落ちる**（今日 D の点数で照合する。鮮度の門を時点照合に変えない）',
    (() => { const r = check('check', D, stale);
      return r.scoreDay === D && r.asked === D && r.problems.some((p) => p.includes('自律スコア（合計）'))
        && r.problems.some((p) => p.includes('ra（得点）')); })());
  t('表示だけ（show）も今日の点数で照合する',
    (() => { const r = check('show', D, stale); return r.scoreDay === D && r.problems.length > 0; })());
  t('今日の値のページは as-stamped でも check でも通る',
    check('as-stamped', D, fresh).problems.length === 0 && check('check', D, fresh).problems.length === 0);
  t('**刻みの日の台帳と1か所でも違えば as-stamped で落ちる**（成分を1つだけ直したページ）',
    (() => { const r = check('as-stamped', D, stale.replace('<b>6.0</b>', '<b>5.0</b>'));
      return r.scoreDay === S && r.problems.length === 1 && r.problems[0].includes('ra（得点）'); })());
  t('**刻みだけ別の日に動かすと落ちる**（S の点数に OTHER の刻み — OTHER で計算すると合わない）',
    (() => { const r = check('as-stamped', D, page(byDay[S], [OTHER, OTHER]));
      return r.scoreDay === OTHER && r.problems.some((p) => p.includes('自律スコア（合計）')); })());
  // 刻みが壊れたページには、**今日の値**を載せておく。こうすると、刻みの問題が結果に
  // 届かない変異（問題を捨てる）だけがこの4件を通してしまう。
  for (const [name, stamps, word] of [
    ['無い', [], '無い'], ['日付でない', ['garbled', 'garbled'], '読めない'],
    ['食い違う', [S, D], '食い違う'], ['未来の', ['2026-10-28', '2026-10-28'], '未来']]) {
    t(`**刻みが${name}ページは、数字が今日の値でも as-stamped で落ちる**（読めない刻みを読めたことにしない）`,
      (() => { const r = check('as-stamped', D, page(byDay[D], stamps));
        return r.scoreDay === D && r.problems.length === 1
          && r.problems[0].startsWith('autopilot/index.html: ') && r.problems[0].includes(word); })());
  }
  t('**正が計算できない日の刻みは落ちる**（0 を捏造して合わせない）',
    (() => { const r = check('as-stamped', D, page(byDay[S], ['2026-10-22', '2026-10-22']));
      return String(r.scoreError).includes('fixture has no score for 2026-10-22')
        && r.problems.some((p) => p.includes('計算できない')); })());
  const other = (text) => [{ label: 'index.html', text, allowed: false, primary: false }];
  t('**/autopilot/ 以外に自律スコアを置くと落ちる**（計算日も鮮度の範囲も無い場所に、時計で動く数字を置かない）',
    ['as-stamped', 'check'].every((mode) => check(mode, D, fresh,
      other('総合自動化率58.6%<span data-score-total>41.2</span>')).problems
      .some((p) => p.startsWith('index.html: ') && p.includes('autopilot/index.html にだけ置ける'))));
  t('**/autopilot/ 以外に成分の行や計算日だけを置いても落ちる**',
    check('as-stamped', D, fresh, other(`総合自動化率58.6%${scoreRow('umr', '19.7', 25)}`)).problems.length === 1
    && check('as-stamped', D, fresh, other(`総合自動化率58.6%（<span data-decision-date>${D}</span>時点）`)).problems.length === 1);
  t('**/autopilot/ 以外では、書き方を変えた点数や計算日も落ちる**（照合の正規表現を外れても見逃さない）',
    check('as-stamped', D, fresh, other('総合自動化率58.6%<span class="x" data-score-total>41.2</span>')).problems.length === 1
    && check('check', D, fresh, other('総合自動化率58.6%<time data-decision-date="2026-10-27">')).problems.length === 1);
  t('/autopilot/ 以外の、時計を読まない数字はそのまま照合する',
    check('as-stamped', D, fresh, other('総合自動化率58.6%')).problems.length === 0
    && check('as-stamped', D, fresh, other('総合自動化率61.3%')).problems.length === 1);
  t('今日が日付でなければ例外（黙って何かの日で計算しない）',
    (() => { try { check('as-stamped', 'today', fresh); return false; } catch { return true; } })());

  if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗`); return 1; }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());
  const mode = pageCheckMode(process.argv);
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

  const doc = JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8'));
  const summary = summarize(doc);
  const appReleases = readLedger(APP_RELEASES_PATH, { onMissing: null, why: 'Lane B の数字が突き合わせられない' });
  let streaks = null;
  try {
    const runsRows = loadRuns().runs;
    const st = activeStreaks(runsRows);
    const sh = shippingStreaks(runsRows);
    const ho = handsOffStreaks(runsRows);
    streaks = {
      current: st.current.days, longest: st.longest.days,
      ship_current: sh.current.days, ship_longest: sh.longest.days,
      hands_off_current: ho.current.days, hands_off_longest: ho.longest.days,
    };
  } catch (e) {
    console.error(`運転台帳が読めない（${e.message}）— 連続稼働は照合できない`);
  }
  const codeDoc = readLedger(CODE_LEDGER, { onMissing: null, why: 'コード著者率が突き合わせられない' });
  // 失敗の層。**読めなかったら null のまま渡す** —— compare 側が「ページに出ているのに
  // 正が無い」で落とす。ここで 0 を捏造すると、計算できない日にページの数字が「合っている」ことになる。
  let failureStages = null;
  try {
    failureStages = {};
    for (const r of loadRuns().runs || []) {
      if (r.outcome === 'shipped' || !r.failure_stage) continue;
      failureStages[r.failure_stage] = (failureStages[r.failure_stage] ?? 0) + 1;
    }
  } catch (e) { failureStages = null; console.error(`失敗の層が数えられない（${e.message}）`); }
  const baseLive = { ...summary.overall, by_area: summary.by_area, counts_total: doc.tasks.length,
    lane_b: appReleases?.summary ?? null, streaks, code_rates: codeDoc ? knownRates(codeDoc) : null,
    failure_stages: failureStages };
  const targets = [PAGE_PATH, ...EXTRA_PATHS].filter((f) => fs.existsSync(f));
  const pages = targets.map((f) => ({ label: path.relative(ROOT, f), text: fs.readFileSync(f, 'utf8'),
    allowed: f.endsWith('.md'), primary: f === PAGE_PATH }));
  // 自律スコアは**渡された日を「今日」として**計算する。どの日を渡すかは checkPages() が決める。
  const r = checkPages({ mode, today, pages, baseLive,
    scoreAt: (day) => autonomyScore(loadScoreContext({ today: day })) });
  if (r.scoreError) console.error(`自律スコアが計算できない（${r.scoreError}）— §5 は照合できない`);
  const { problems, found, drifted, scoreDay } = r;

  console.log(`公開ページ /autopilot/ と配信本文 × 台帳 — 突き合わせた数字 ${found.length} 件`);
  console.log(mode === 'as-stamped'
    ? `  自律スコアは、ページの計算日 ${scoreDay} で計算して照合した。**ページが今日の値かどうか（鮮度）はこの実行では判定していない — 健全とは言わない。**`
    : `  自律スコアは、今日（${today}）の台帳の値で照合した。`);
  console.log(`  対象: ${targets.map((f) => path.relative(ROOT, f)).join(' / ')}\n`);
  for (const f of found) {
    const mark = f.got === f.want ? '一致' : (f.frozen ? '時点差' : '不一致');
    console.log(`  ${mark}  ${f.label}: ページ ${f.got} / 台帳 ${f.want}`);
  }
  for (const d of drifted) {
    console.log(`\n  凍結: ${d.label}（numbers-frozen ${d.at}${d.note ? ' ' + d.note : ''}）`);
    if (!d.lines.length) {
      console.log('    台帳の現在値と一致している（凍結しているが、いまはズレていない）');
    } else {
      console.log(`    **配信時点の数字なので落とさない。**現在値とのズレ ${d.lines.length}件:`);
      for (const l of d.lines) console.log(`      - ${l}`);
    }
  }
  if (!found.length) {
    console.log('  ページに台帳由来の数字が1つも見つからなかった。');
    console.log('  **数字を消したなら正しい。**書き方を変えたなら、この検査の正規表現を直すこと。');
  }

  if (problems.length) {
    console.error('\n公開ページ: 台帳と食い違い');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (mode === 'check') console.log('\n公開ページの数字は台帳の現在値と一致。');
  else if (mode === 'as-stamped') console.log(`\n公開ページの数字は、計算日 ${scoreDay} の台帳の値と一致（鮮度は判定していない）。`);
}
