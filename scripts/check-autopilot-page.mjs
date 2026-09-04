#!/usr/bin/env node
/**
 * 公開ページ /autopilot/ の数字が、台帳の現在値と一致することを検査する。
 *
 *   node scripts/check-autopilot-page.mjs           # 表示
 *   node scripts/check-autopilot-page.mjs --check   # CI
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
      const got = c.label === 'タスク数' ? h[1] : `${h[1]}%`;
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
  };
  t('一致すれば通る',
    compare('総合自動化率58.6%、AI関与率87.7%。189タスク・13領域', live).problems.length === 0);
  t('古い率を落とす',
    compare('総合自動化率61.3%', live).problems.some((p) => p.includes('総合自動化率')));
  t('古いタスク数を落とす',
    compare('176タスク・13領域', live).problems.some((p) => p.includes('タスク数')));

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

  if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗`); return 1; }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());

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
  // 自律スコアと失敗の層。**読めなかったら null のまま渡す** ——
  // compare 側が「ページに出ているのに正が無い」で落とす。ここで 0 を捏造すると、
  // 計算できない日にページの数字が「合っている」ことになる。
  let autonomy = null, failureStages = null;
  try { autonomy = autonomyScore(loadScoreContext()); }
  catch (e) { console.error(`自律スコアが計算できない（${e.message}）— §5 は照合できない`); }
  try {
    failureStages = {};
    for (const r of loadRuns().runs || []) {
      if (r.outcome === 'shipped' || !r.failure_stage) continue;
      failureStages[r.failure_stage] = (failureStages[r.failure_stage] ?? 0) + 1;
    }
  } catch (e) { failureStages = null; console.error(`失敗の層が数えられない（${e.message}）`); }
  const live = { ...summary.overall, by_area: summary.by_area, counts_total: doc.tasks.length,
    lane_b: appReleases?.summary ?? null, streaks, code_rates: codeDoc ? knownRates(codeDoc) : null,
    autonomy_score: autonomy, failure_stages: failureStages };
  const targets = [PAGE_PATH, ...EXTRA_PATHS].filter((f) => fs.existsSync(f));
  const problems = [];
  const found = [];
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const drifted = [];
  for (const f of targets) {
    const label = path.relative(ROOT, f);
    const text = fs.readFileSync(f, 'utf8');
    // **凍結してよいのは docs/ の .md（配信済みの記録）だけ。**
    // .html は生きた公開面なので、宣言を置いたこと自体が問題になる。
    const r = classifyFile(text, { allowed: f.endsWith('.md'), today, live });
    problems.push(...r.problems.map((x) => `${label}: ${x}`));
    // **落とさないが、見えなくもしない。**ズレは毎回印字する。
    if (r.frozen) drifted.push({ label, at: r.at, note: r.note, lines: r.drift });
    found.push(...r.found.map((x) => ({ ...x, frozen: r.frozen, file: label })));
    // **一覧に入れたのに1つも照合していない、を落とす。**
    // 表記が変わって正規表現に当たらなくなると、検査は黙って通る ——
    // それは「一致した」ではなく「見ていない」。網に入れた文書には
    // 少なくとも1つ照合対象があることを求める（PAGE_PATH も同じ）。
    if (r.found.length === 0) {
      problems.push(`${label}: 突き合わせられる数字が1つも見つからない`
        + ' — **表記が変わって検査が素通りしている可能性。**'
        + '網から外すなら EXTRA_PATHS から消すこと（黙って通さない）');
    }
  }

  console.log(`公開ページ /autopilot/ と配信本文 × 台帳 — 突き合わせた数字 ${found.length} 件`);
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
  if (process.argv.includes('--check')) console.log('\n公開ページの数字は台帳の現在値と一致。');
}
