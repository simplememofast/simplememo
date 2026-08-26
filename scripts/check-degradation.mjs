#!/usr/bin/env node
/**
 * 縮退運転 — **「代替がある」と書いてあることを、実際に動かして確かめる。**
 *
 *   node scripts/check-degradation.mjs          # 一覧
 *   node scripts/check-degradation.mjs --check  # CI
 *
 * 【なぜ作るか】
 * ベンダー台帳には「止まると何が起きるか」と「代替はあるか」が書いてある。
 * ところがそれは**文章**で、書いた時点では正しくても、経路が変われば黙って嘘になる。
 * 一番まずいのは「代替がある」と書いてあるものが実際には効かない場合で、
 * それは**その事業者が落ちた日に初めて分かる。**
 *
 * だからここでは、台帳が代替を名乗っている事業者について、
 * **その代替が本当に効くことを振る舞いで確かめる。**
 * 名乗っているのに確かめる手段（probe）が無いものは落とす —
 * **一度も動かしたことのない代替は、代替ではない。**
 *
 * 逆に `fallback: null`（代替なし）は落とさない。それは壊れているのではなく、
 * 単一障害点だと分かっていることで、分かっているほうが良い。
 * ただし **fallback_note が空なら落とす**（「考えていない」と「代替なし」は別）。
 *
 * 【代替と縮退を分ける】
 * この2つを混ぜると、resilience を過大に見積もる。
 *   - **代替（fallback）** … その事業者の役割を別のものが肩代わりする。実際には稀
 *   - **縮退（degradation）** … 肩代わりはしないが、被害の範囲を限る仕組み。
 *     回路遮断器・端末側 Outbox・故障時に走らない判定。落ちることは防げないが、
 *     **失われるか・後で戻せるかが変わる**
 * Resend が落ちてもメールは送れない（代替なし）。だが遮断器と死信があるので
 * 送信は失われず、復旧後に戻せる。これを「代替あり」と数えたら嘘になる。
 *
 * 【対象は台帳から取る。手で並べない】
 * 並べると、新しい事業者が黙って対象外になる。それはその事業者が落ちた日に
 * しか分からない。backup-d1.mjs が対象を保持台帳から取っているのと同じ理由。
 *
 * 【隣のリポジトリを見る probe（2026-08-24 に直した）】
 * 縮退の受け皿は、このリポジトリではなく隣にある —— 遮断器と死信は
 * simplememo-api、端末側 Outbox は simplememo-ios。ところが **CIのチェックアウトには
 * 隣が無い。**
 *
 * 最初の実装は `fs.existsSync('../simplememo-api/src/dlq.ts')` を直接見ていた。
 * 3リポジトリが揃うセッションでは通り、**CIでは「不足: 3」で必ず落ちた。**
 * 2026-08-22 以降このリポジトリのCIはずっと赤で、赤いので auto-merge が
 * 動かず、**サイトのデプロイが丸ごと止まっていた。**
 *
 * 検査の答えが「隣が置いてあるかどうか」で変わるなら、それは
 * 縮退運転を測っていない。逆向きの穴（隣が無いとき黙ってスキップ）も同じで、
 * そちらは**ずれたまま緑になる。**どちらもやらない。
 *
 * だから写しを置く（`data/crossrepo-probes.json`）。
 *   - 隣が見えるとき … **実物を見る。**写しは使わない
 *   - 隣が無いとき   … 写しで判定し、**写しで判定したと出力に書く**
 *   - 写しが無い／古い … 落とす。**古い写しは、無い検査と同じ**
 * イベント名の交差検査・段階公開のバケット契約と同じ形にしてある。
 *
 * 隣のファイルが消えていないことを**継続的に**見張るのは隣のCIの仕事で、
 * ここではない（dlq.ts を消せば simplememo-api の typecheck とテストが落ちる）。
 * ここが持っているのは「その契約を最後に確かめたのはいつか」。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, baseState, CODES } from './autopilot-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDORS = path.join(ROOT, 'data/vendor-register.json');
const SNAPSHOT = path.join(ROOT, 'data/crossrepo-probes.json');

/**
 * 写しの寿命。イベント名の交差検査と揃えてある。
 * 無期限にしないのは、**古い写しが「確かめた」の顔をするから。**
 */
export const SNAPSHOT_MAX_DAYS = 60;

export function ageDays(iso, today = new Date()) {
  if (!iso) return null;
  const t = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(t.getTime())) return null;
  return Math.floor((today - t) / 86_400_000);
}

function readSnapshot() {
  if (!fs.existsSync(SNAPSHOT)) return null;
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  } catch (e) {
    // 写しが壊れているのは「写しが無い」とは別。**無いなら作れと言えるが、
    // 壊れているのは気づかないと直らない。**
    throw new Error(`${SNAPSHOT} を読めない（${e.message}）`
      + ' — 壊れた写しを「写しが無い」と同じ扱いにしない');
  }
}

/**
 * 隣のリポジトリにあるファイルで縮退の受け皿を確かめる。
 *
 * 隣が見えるなら実物を見る。無いなら写しで判定し、**どちらで判定したかを
 * detail に必ず書く**（「確かめた」と「写しで通した」を混ぜない）。
 */
export function crossRepo(id, repo, files, opts = {}) {
  const { need = 'all', label = '', snapshot = readSnapshot(), today = new Date() } = opts;
  const base = path.join(ROOT, '..', repo);
  const enough = (present) => (need === 'all' ? present === files.length : present > 0);

  if (fs.existsSync(base)) {
    const present = files.filter((f) => fs.existsSync(path.join(base, f))).length;
    return {
      ok: enough(present),
      source: 'live',
      detail: enough(present)
        ? `${label}（隣を実際に見た）`
        : `不足: ${files.length - present}（隣を実際に見た）`,
    };
  }

  const snap = snapshot?.probes?.[id];
  if (!snap) {
    return {
      ok: false,
      source: 'none',
      detail: `隣（${repo}）が無く、写しも無い`
        + ' — `node scripts/check-degradation.mjs --sync` を3リポジトリの揃った場所で実行する',
    };
  }
  const age = ageDays(snapshot.synced_at, today);
  if (age === null || age > SNAPSHOT_MAX_DAYS) {
    return {
      ok: false,
      source: 'stale',
      detail: `写しが ${age === null ? '日付を読めない' : `${age}日前`}`
        + `（上限 ${SNAPSHOT_MAX_DAYS}日）— **古い写しは、無い検査と同じ**`,
    };
  }
  return {
    ok: enough(snap.present),
    source: 'snapshot',
    detail: enough(snap.present)
      ? `${label}（${snapshot.synced_at} の写し・${age}日前）`
      : `不足: ${files.length - snap.present}（${snapshot.synced_at} の写し）`,
  };
}

/** 写しに載せる交差検査の定義。**probe と同じ場所から引く。** */
export const CROSS_REPO = {
  circuit_breaker: {
    repo: 'simplememo-api',
    need: 'all',
    label: '遮断器 + 死信 + 保管',
    files: ['src/circuit-breaker.ts', 'src/dlq.ts', 'migrations/0018_email_dead_letters.sql'],
  },
  device_outbox: {
    repo: 'simplememo-ios',
    need: 'any',
    label: '端末側 Outbox',
    files: ['SimpleMemo/OutboxManager.swift', 'SimpleMemo/Outbox.swift'],
  },
};

/**
 * 隣が見えるときに、**写しが実物と食い違っていないか**を確かめる。
 *
 * [2026-08-26] 写しは `sha256_12` と `bytes` をファイルごとに記録している。
 * ところが判定は `present`（在る本数）しか読んでいなかった。
 * **記録して読まない値は、記録していないのと同じ。**
 *
 * 効くのは片側だけである。CIのチェックアウトには隣が無いので、
 * **食い違いを見つけられる場所は3リポジトリの揃ったここしかない。**
 * ここで黙ると、CIは最大60日、実物と違う写しを「確かめた」として使い続ける。
 * 60日の上限が守るのは古さであって、正しさではない。
 *
 * 存在のずれは落とす —— 写しの `present` が嘘になり、CIは作り話を検査する。
 * 中身のずれは落とさず報告する —— 判定は存在で決まるので、隣を1行直すたびに
 * サイトのCIが赤くなると `--sync` が機械的な儀式になる。
 * **「写しが古い」と「写しが違う」を混ぜない。**
 */
export function snapshotDrift(id, spec, snapshot, root = ROOT) {
  const base = path.join(root, '..', spec.repo);
  if (!fs.existsSync(base)) return null; // 比べる相手がいない
  const snap = snapshot?.probes?.[id];
  if (!snap) return { missing: true, existence: [], content: [] };

  const existence = [];
  const content = [];
  const byPath = new Map((snap.files || []).map((f) => [f.path, f]));
  for (const rel of spec.files) {
    const abs = path.join(base, rel);
    const live = fs.existsSync(abs);
    const rec = byPath.get(rel);
    if (!rec) { existence.push(`${rel}: 写しに載っていない`); continue; }
    if (live !== rec.exists) {
      existence.push(`${rel}: 実物は${live ? '在る' : '無い'}が、写しは${rec.exists ? '在る' : '無い'}`);
      continue;
    }
    if (!live) continue;
    const buf = fs.readFileSync(abs);
    const sha = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
    if (buf.length !== rec.bytes || sha !== rec.sha256_12) {
      content.push(`${rel}: 写し ${rec.bytes}b/${rec.sha256_12} → 実物 ${buf.length}b/${sha}`);
    }
  }
  return { missing: false, existence, content };
}

/**
 * 代替の効きを確かめる実験。**文言ではなく振る舞い。**
 * 各 probe は { ok, detail } を返す。
 */
export const PROBES = {
  /** GitHub API に到達できない日は、走らずに落ちる（静かに寝ない）。 */
  gate_fails_closed_on_api: () => {
    const r = decide(baseState({ githubApiReachable: false }));
    return {
      ok: r.code === CODES.FAIL_API && !r.run,
      detail: `githubApiReachable:false → ${r.code}（run=${r.run}）`,
    };
  },
  /** 副系（CCR）が主系とは別経路として実在する。 */
  dual_lane: () => {
    const runbook = path.join(ROOT, 'docs/obsidian/AUTOPILOT_RUNBOOK.md');
    const wf = path.join(ROOT, '.github/workflows/obsidian-autopilot.yml');
    const stop = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/emergency-stop.json'), 'utf8'));
    const routes = Object.keys(stop.agents || {}).filter((k) => k.startsWith('ccr-'));
    return {
      ok: fs.existsSync(runbook) && fs.existsSync(wf) && routes.length >= 1,
      detail: `主系ワークフロー + 手順書 + 副系 ${routes.length}経路（${routes.join(',')}）`,
    };
  },
  /** モデルが落ちたら縮退先へ、全滅なら走らない。 */
  model_fallback: () => {
    const degraded = decide(baseState({ modelsAvailable: ['haiku'], preferredModel: 'opus' }));
    const none = decide(baseState({ modelsAvailable: [] }));
    return {
      ok: degraded.code === CODES.DEGRADE_MODEL && degraded.run
        && none.code === CODES.FAIL_NO_MODEL && !none.run,
      detail: `縮退 → ${degraded.code}（run=${degraded.run}） / 全滅 → ${none.code}（run=${none.run}）`,
    };
  },
  /** 外部到達が塞がれた日は、一次情報の要るレーンを選ばない。 */
  egress_degrade: () => {
    const r = decide(baseState({ egressBlocked: true }));
    return {
      ok: r.code === CODES.DEGRADE_EGRESS && r.run,
      detail: `egressBlocked:true → ${r.code}（run=${r.run}・走るが選べるレーンが減る）`,
    };
  },
  /**
   * メール送信は回路遮断器と死信で受ける（送信先が落ちても呼び続けない）。
   * 受け皿は simplememo-api にあるので、隣が無いCIでは写しで判定する。
   */
  circuit_breaker: () => crossRepo('circuit_breaker', CROSS_REPO.circuit_breaker.repo,
    CROSS_REPO.circuit_breaker.files, CROSS_REPO.circuit_breaker),
  /**
   * 端末側 Outbox が貯めて復旧後に再送する。
   * 受け皿は simplememo-ios にあるので、隣が無いCIでは写しで判定する。
   */
  device_outbox: () => crossRepo('device_outbox', CROSS_REPO.device_outbox.repo,
    CROSS_REPO.device_outbox.files, CROSS_REPO.device_outbox),
};

export function validate(doc, probes = PROBES, opts = {}) {
  const { crossRepoSpecs = CROSS_REPO, snapshot = readSnapshot() } = opts;
  const problems = [];
  const rows = [];
  const used = new Set();
  /** probe id → 'live' | 'snapshot' | …。**何で判定したかを出力に出すため。** */
  const sources = {};

  const run = (id, label, vendorId) => {
    used.add(id);
    const probe = probes[id];
    if (!probe) {
      problems.push(`${vendorId}: probe "${id}" が実装されていない`);
      return { ok: false, detail: `未実装 (${id})` };
    }
    const r = probe();
    if (r.source) sources[id] = r.source;
    if (!r.ok) problems.push(`${vendorId}: ${label}が効かない — ${r.detail}`);
    return r;
  };

  for (const v of doc.vendors || []) {
    if (!v.breaks_if_down) {
      problems.push(`${v.id}: breaks_if_down が空 — 落ちたとき何が止まるか分からない`);
    }

    // 代替と縮退は**両立する。**片方を見たら終わりにしない
    // （GitHub は副系という代替を持ちつつ、API到達不能時の縮退も持っている）。
    let fallbackResult = null;
    if (v.fallback) {
      if (!v.fallback_probe) {
        problems.push(`${v.id}: 代替（${v.fallback}）を名乗っているのに fallback_probe が無い`
          + ' — **一度も動かしたことのない代替は、代替ではない**');
        fallbackResult = { ok: false, detail: v.fallback, unverified: true };
      } else {
        fallbackResult = run(v.fallback_probe, '代替', v.id);
      }
    } else if (!v.fallback_note) {
      // 代替なし。理由の無い「代替なし」は落とす。
      problems.push(`${v.id}: 代替が無いのに fallback_note が空`
        + ' — 「代替なし」と「考えていない」は別。単一障害点なら、そう書く');
    }

    const degradations = (v.degradation_probes || []).map((id) => run(id, '縮退', v.id));

    const all = [...(fallbackResult ? [fallbackResult] : []), ...degradations];
    const detail = all.length ? all.map((r) => r.detail).join(' / ') : (v.breaks_if_down || '—');
    let state;
    if (fallbackResult?.unverified) state = 'unverified';
    else if (all.some((r) => !r.ok)) state = 'broken';
    else if (fallbackResult) state = 'fallback';
    else if (degradations.length) state = 'degraded';
    else state = 'spof';
    rows.push({ id: v.id, state, detail });
  }

  // **誰にも使われていない probe は、覆っているように見える死んだコード。**
  for (const id of Object.keys(probes)) {
    if (!used.has(id)) {
      problems.push(`probe "${id}" をどの事業者も参照していない`
        + ' — 使われない実験は、覆っているように見えるだけで何も守っていない');
    }
  }

  // 隣が見えるなら、**CIが使う写しが実物と合っているか**をここで確かめる。
  // ここが唯一その比較ができる場所（CIには隣が無い）。
  const drifts = [];
  for (const [id, spec] of Object.entries(crossRepoSpecs)) {
    const d = snapshotDrift(id, spec, snapshot);
    if (!d) continue;
    if (d.missing) {
      problems.push(`${id}: 隣は見えているが、写しに項目が無い`
        + ' — **この状態は隣の無いCIでだけ落ちる。**`--sync` して写しを作る');
      continue;
    }
    for (const e of d.existence) {
      problems.push(`${id}: 写しが実物とずれている（${e}）`
        + ' — **CIはこの写しで判定する。**`--sync` して更新する');
    }
    if (d.content.length) drifts.push({ id, content: d.content });
  }

  return { problems, rows, sources, drifts };
}

/** 隣が揃っている場所で写しを更新する。**手で書かない。** */
export function sync(today = new Date()) {
  const probes = {};
  const missingRepos = [];
  for (const [id, spec] of Object.entries(CROSS_REPO)) {
    const base = path.join(ROOT, '..', spec.repo);
    if (!fs.existsSync(base)) { missingRepos.push(spec.repo); continue; }
    const files = spec.files.map((f) => {
      const abs = path.join(base, f);
      if (!fs.existsSync(abs)) return { path: f, exists: false };
      const buf = fs.readFileSync(abs);
      return {
        path: f,
        exists: true,
        bytes: buf.length,
        sha256_12: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12),
      };
    });
    probes[id] = {
      repo: spec.repo,
      need: spec.need,
      label: spec.label,
      files,
      present: files.filter((f) => f.exists).length,
    };
  }
  if (missingRepos.length) {
    return { ok: false, missingRepos };
  }
  const doc = {
    $comment: [
      '隣のリポジトリにある「縮退の受け皿」を最後に確かめた記録。**手で書かない。**',
      '  node scripts/check-degradation.mjs --sync',
      '',
      'なぜ写しを置くか: CIのチェックアウトには隣のリポジトリが無い。',
      '直接 existsSync で見に行くと、**3リポジトリの揃ったセッションでは通り、',
      'CIでは必ず落ちる** — 2026-08-22〜24 に実際そうなり、サイトのCIが赤で',
      '固定され、auto-merge が動かずデプロイが止まった。',
      '',
      '逆に「隣が無ければスキップ」にすると、**ずれたまま緑になる。**',
      'どちらもやらないために、写しで判定して写しだと出力に書く。',
      '',
      `写しの寿命は ${SNAPSHOT_MAX_DAYS}日。**古い写しは、無い検査と同じ。**`,
      'ファイルが消えていないことを継続的に見張るのは隣のCIの仕事で、ここではない。',
    ],
    synced_at: today.toISOString().slice(0, 10),
    max_age_days: SNAPSHOT_MAX_DAYS,
    probes,
  };
  fs.writeFileSync(SNAPSHOT, `${JSON.stringify(doc, null, 2)}\n`);
  return { ok: true, doc };
}

// ── 自己テスト（**この検査が落ちることを確かめる**） ─────────────────
//
// ここが守っているのは「代替がある」という**文章**を振る舞いに突き合わせること。
// 突き合わせが効かなくなると、台帳は自分で自分を保証する紙になる。
//
// 特に見ているのは**写しの扱い**で、この検査には非対称がある ——
// CIには隣のリポジトリが無いので写しで判定し、隣が揃うこの場所では実物を見る。
// つまり **写しが間違っていることを検出できる場所はここしかない。**
const OK_VENDOR = {
  id: 'v', breaks_if_down: '止まると困る',
  fallback: '代替あり', fallback_probe: 'always_ok', degradation_probes: [],
};
const STUB = { always_ok: () => ({ ok: true, detail: 'ok' }) };
const vdoc = (over = {}) => ({ vendors: [{ ...OK_VENDOR, ...over }] });
const NO_CROSS = { crossRepoSpecs: {}, snapshot: null };
const val = (doc, probes = STUB, opts = NO_CROSS) => validate(doc, probes, opts).problems;
const hit = (problems, needle) => problems.some((x) => x.includes(needle));

const SNAP_SPEC = CROSS_REPO.circuit_breaker;
const liveSnapshot = () => JSON.parse(JSON.stringify(readSnapshot()));

const SCENARIOS = [
  ['実データが検査を通る', () => {
    const doc = JSON.parse(fs.readFileSync(VENDORS, 'utf8'));
    const { problems } = validate(doc);
    if (problems.length) throw new Error(problems[0]);
  }],
  ['**代替を名乗るのに probe が無ければ落ちる**（一度も動かしたことのない代替は代替ではない）', () => {
    const p = val(vdoc({ fallback_probe: null }));
    if (!hit(p, 'fallback_probe が無い')) throw new Error(JSON.stringify(p));
  }],
  ['**代替も理由も無ければ落ちる**（「代替なし」と「考えていない」は別）', () => {
    const p = val(vdoc({ fallback: null, fallback_probe: null, fallback_note: null }));
    if (!hit(p, 'fallback_note が空')) throw new Error(JSON.stringify(p));
  }],
  ['単一障害点は落とさない（分かっていることは壊れていることではない）', () => {
    // probe 集合も空にする。**代替を持たない事業者しか居ないなら、使われる probe も無い**
    // ——ここで STUB を渡すと「誰も参照しない probe」で落ちる（実際に踏んだ）。
    const p = val(vdoc({ fallback: null, fallback_probe: null, fallback_note: '代替なし。理由はこれ' }), {});
    if (p.length) throw new Error(JSON.stringify(p));
  }],
  ['breaks_if_down が空なら落ちる', () => {
    const p = val(vdoc({ breaks_if_down: '' }));
    if (!hit(p, 'breaks_if_down が空')) throw new Error(JSON.stringify(p));
  }],
  ['**probe が未実装なら落ちる**（名前だけの代替を通さない）', () => {
    const p = val(vdoc({ fallback_probe: 'そんな probe は無い' }));
    if (!hit(p, '実装されていない')) throw new Error(JSON.stringify(p));
  }],
  ['**誰も参照しない probe は落ちる**（覆っているように見えるだけの死んだコード）', () => {
    const p = val(vdoc(), { ...STUB, 誰も使わない: () => ({ ok: true, detail: '' }) });
    if (!hit(p, 'どの事業者も参照していない')) throw new Error(JSON.stringify(p));
  }],
  ['**probe が false を返せば落ちる**（常に通る検査は何も見ていない）', () => {
    const p = val(vdoc(), { always_ok: () => ({ ok: false, detail: '効かない' }) });
    if (!hit(p, '代替が効かない')) throw new Error(JSON.stringify(p));
  }],
  ['**写しが実物と存在でずれたら落ちる**（CIはこの写しで判定する）', () => {
    const snap = liveSnapshot();
    snap.probes.circuit_breaker.files[0].exists = false;
    const d = snapshotDrift('circuit_breaker', SNAP_SPEC, snap);
    if (!d || !d.existence.length) throw new Error('存在のずれを検出しなかった');
    const p = validate(vdoc(), STUB, { crossRepoSpecs: { circuit_breaker: SNAP_SPEC }, snapshot: snap });
    if (!hit(p.problems, '写しが実物とずれている')) throw new Error(JSON.stringify(p.problems));
  }],
  ['**写しに項目が無ければ落ちる**（隣が見えているのに、CIでだけ落ちる状態）', () => {
    const p = validate(vdoc(), STUB,
      { crossRepoSpecs: { circuit_breaker: SNAP_SPEC }, snapshot: { probes: {} } });
    if (!hit(p.problems, '写しに項目が無い')) throw new Error(JSON.stringify(p.problems));
  }],
  ['**中身のずれは落とさず報告する**（判定は存在で決まる。--sync を儀式にしない）', () => {
    const snap = liveSnapshot();
    snap.probes.circuit_breaker.files[0].sha256_12 = '000000000000';
    const d = snapshotDrift('circuit_breaker', SNAP_SPEC, snap);
    if (!d.content.length) throw new Error('中身のずれを検出しなかった');
    if (d.existence.length) throw new Error('中身のずれを存在のずれとして数えた');
    const r = validate(vdoc(), STUB, { crossRepoSpecs: { circuit_breaker: SNAP_SPEC }, snapshot: snap });
    if (r.problems.length) throw new Error(`中身のずれで落ちた: ${r.problems[0]}`);
    if (!r.drifts.length) throw new Error('報告もされない（**黙って通すのは駄目**）');
  }],
  ['写しが実物と合っていれば何も言わない（常に鳴る検査も何も見ていない）', () => {
    const d = snapshotDrift('circuit_breaker', SNAP_SPEC, liveSnapshot());
    if (d.missing || d.existence.length || d.content.length) throw new Error(JSON.stringify(d));
  }],
  ['隣が無いときは突き合わせない（比べる相手がいない）', () => {
    const d = snapshotDrift('x', { repo: 'そんなリポジトリは無い', files: ['a'] }, liveSnapshot());
    if (d !== null) throw new Error('隣が無いのに比べた');
  }],
  ['**隣も写しも無ければ落ちる**（判定できなかったを異常なしと呼ばない）', () => {
    const r = crossRepo('x', 'そんなリポジトリは無い', ['a'], { snapshot: null });
    if (r.ok || r.source !== 'none') throw new Error(JSON.stringify(r));
  }],
  ['**写しが上限より古ければ落ちる**（古い写しは、無い検査と同じ）', () => {
    const old = { synced_at: '2020-01-01', probes: { x: { present: 1 } } };
    const r = crossRepo('x', 'そんなリポジトリは無い', ['a'],
      { snapshot: old, today: new Date('2026-08-26T00:00:00Z') });
    if (r.ok || r.source !== 'stale') throw new Error(JSON.stringify(r));
  }],
  ['上限内の写しは通り、**写しで判定したと書く**（確かめたと混ぜない）', () => {
    const fresh = { synced_at: '2026-08-24', probes: { x: { present: 1 } } };
    const r = crossRepo('x', 'そんなリポジトリは無い', ['a'],
      { snapshot: fresh, today: new Date('2026-08-26T00:00:00Z'), need: 'all', label: 'L' });
    if (!r.ok || r.source !== 'snapshot') throw new Error(JSON.stringify(r));
    if (!r.detail.includes('写し')) throw new Error(`写しだと書いていない: ${r.detail}`);
  }],
  ['**写しでも本数が足りなければ落ちる**（写しは判定を甘くしない）', () => {
    const fresh = { synced_at: '2026-08-24', probes: { x: { present: 1 } } };
    const r = crossRepo('x', 'そんなリポジトリは無い', ['a', 'b'],
      { snapshot: fresh, today: new Date('2026-08-26T00:00:00Z'), need: 'all' });
    if (r.ok) throw new Error('不足なのに通った');
  }],
  ['ageDays: 読めない日付は null（0日前にしない）', () => {
    if (ageDays('だめな日付') !== null) throw new Error('null にならない');
    if (ageDays('2026-08-20', new Date('2026-08-26T00:00:00Z')) !== 6) throw new Error('日数が合わない');
  }],
];

if (process.argv.includes('--selftest')) {
  let failed = 0;
  for (const [name, fn] of SCENARIOS) {
    try { fn(); console.log(`  ok   ${name}`); }
    catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
  }
  console.log(`\n  自己テスト ${SCENARIOS.length} 件中 ${failed} 件失敗`);
  process.exit(failed === 0 ? 0 : 1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--sync')) {
    const r = sync();
    if (!r.ok) {
      console.error(`隣のリポジトリが無い: ${r.missingRepos.join(', ')}`);
      console.error('  **3リポジトリが揃った場所で実行すること。**'
        + '揃っていない場所で書くと、無いものを「無かった」として固めてしまう。');
      process.exit(1);
    }
    const n = Object.values(r.doc.probes).reduce((a, p) => a + p.files.length, 0);
    console.log(`写しを更新した: ${Object.keys(r.doc.probes).length}件の交差検査 / ${n}ファイル`
      + ` → data/crossrepo-probes.json（${r.doc.synced_at}）`);
    process.exit(0);
  }

  const doc = JSON.parse(fs.readFileSync(VENDORS, 'utf8'));
  const { problems, rows, sources, drifts } = validate(doc);
  const n = (s) => rows.filter((r) => r.state === s).length;

  console.log('縮退運転 — **「代替がある」を実際に動かして確かめる**\n');
  console.log(`  事業者 ${rows.length}件: 代替 ${n('fallback')} / 縮退のみ ${n('degraded')}`
    + ` / 単一障害点 ${n('spof')} / 未検証 ${n('unverified')} / 効かない ${n('broken')}\n`);
  const mark = {
    fallback: '✓ 代替あり', degraded: '△ 縮退のみ', spof: '— 単一障害点',
    unverified: '? 未検証', broken: '✗ 効かない',
  };
  for (const r of rows) {
    console.log(`  ${mark[r.state].padEnd(14)} ${r.id.padEnd(14)} ${r.detail}`);
  }
  console.log('');
  console.log('  **△ は「落ちない」ではない。**肩代わりはしないが、失われずに後で戻せる。');
  console.log('  **単一障害点は落とさない。**分かっていることは壊れていることではない。');
  console.log('  落とすのは、代替を名乗っているのに動かして確かめられないとき。');
  console.log('');
  console.log('  ここで確かめていないこと: **実際にその事業者を落として試したことは無い。**');
  console.log('  確かめているのは、こちら側の受け方（判定・遮断器・別経路の実在）だけ。');

  // **何で判定したかを混ぜない。**隣を見た probe と、写しで通した probe は別物。
  const cross = Object.keys(CROSS_REPO).filter((id) => sources[id]);
  if (cross.length) {
    const snap = readSnapshot();
    console.log('');
    console.log('  隣のリポジトリを見る検査:');
    for (const id of cross) {
      const where = { live: '**隣を実際に見た**', snapshot: '写しで判定（隣が無い）' }[sources[id]]
        ?? sources[id];
      console.log(`    ${id.padEnd(18)} ${where}`);
    }
    if (snap?.synced_at && cross.some((id) => sources[id] === 'snapshot')) {
      console.log(`    写しは ${snap.synced_at} 時点（上限 ${SNAPSHOT_MAX_DAYS}日）。`
        + '3リポジトリが揃った場所で --sync して更新する');
    }
  }

  // **中身のずれは落とさないが、黙らない。**判定は存在で決まるので赤くはしない。
  if (drifts?.length) {
    console.log('');
    console.log('  写しと実物で中身がずれている（判定は存在で決まるので落とさない）:');
    for (const d of drifts) {
      for (const line of d.content) console.log(`    ${d.id.padEnd(18)} ${line}`);
    }
    console.log('    → `--sync` すると、確かめた時点の記録が実物に揃う');
  }

  if (problems.length) {
    console.error('\n縮退運転: 問題');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    // **「確かめた」と「写しで通した」を同じ文で締めない。**
    const bySnapshot = Object.keys(CROSS_REPO).filter((id) => sources[id] === 'snapshot');
    if (bySnapshot.length) {
      console.log(`\n代替を名乗るものはすべて通った（うち ${bySnapshot.length}件は写しでの判定）。`);
    } else {
      console.log('\n代替を名乗るものは、すべて動かして確かめてある。');
    }
  }
}
