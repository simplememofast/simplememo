/**
 * リンクゲートの**期限つき保留**。台帳は data/link-gate-deferrals.json。
 *
 * scripts/seo-check.js（[HUB]/[ORPHAN]）と scripts/check-content-graph.mjs
 * （[CHILD]/[CHILD-EN]）の**両方がこの1本を使う。**「何を・いつまで外すか」を
 * 2本が別々に解釈すると、片方だけが黙って緩む（リンクの拾い方を
 * seo-site.js の linkedPages 1本に寄せたのと同じ理由）。
 *
 * 【なぜ要るか】2026-10-14 に [ORPHAN]/[HUB]/[CHILD] を error にした日、
 * ゲートが要求するリンクの一部は**今は足してはいけない**ものだった:
 *   - 凍結中の実験（growth/experiments/experiments.json の running/frozen）が
 *     持つハブ /obsidian/・/obsidian/plugins/・/obsidian/sync/。日本語のハブを
 *     変えると、そこから生成される8言語のハブも変わる
 *   - #2031 で生成した日本語ページ7本。既存の日本語ページと意図が重なり、
 *     11/08 頃の統合判定まで日本語側からリンクを足さない
 * 規則を消す・警告へ戻す・件数の上限で通す、のどれもしない。**名指しで、
 * 理由と期限をつけて**外し、外したものも毎回警告として出す（黙らせない）。
 *
 * 【範囲】保留は `page` と、同じ翻訳グループ（data/i18n/pages.json）のうち
 * **生成された翻訳**（グループの `existing` に無い言語）に効く。手で書いている
 * 翻訳（例: 英語の /en/obsidian/）には効かない —— 凍結は日本語の元ページの話で、
 * 編集で直せる英語ページまで一緒に外す理由は無い。
 *
 * 【失効】until（Asia/Tokyo の暦日・当日を含む）を過ぎるか、名指しした実験が
 * **すべて**閉じる（OPEN_STATUSES の外へ出る）と失効する。失効した保留は何も
 * 外さず、`[DEFERRAL] <id> has lapsed` を1件足す —— 実験の判断を記録した PR に、
 * 待たせていたリンクを足す仕事がそのまま現れる。
 *
 * 【未使用】保留が名指しした規則が、その規則を持つ検査で1件も当たらなければ
 * error。リンクを足したのに残った行は、次に同じ場所が壊れたとき**黙って外す**
 * （data/guard-shapes.json と同じ「記録が実体と合わない」を止めるラチェット）。
 *
 * 【読めない台帳】ファイルが無い・JSON が壊れている・知らない実験・暦に無い
 * 日付・知らない kind/rule・id の重複は、**1件でもあれば何も外さない。**
 * 全部の指摘を error のまま出し、[DEFERRAL] で理由を足す。壊れた台帳を
 * 「保留なし」とも「全部保留」とも読まない（[ORPHAN] の cannot run と同じ）。
 */
const fs = require('fs');
const path = require('path');
const { pageKey } = require('./site-files');

const LEDGER_FILE = 'data/link-gate-deferrals.json';
const EXPERIMENTS_FILE = 'growth/experiments/experiments.json';

/**
 * growth/lib/ledger.mjs の OPEN_STATUSES の**写し**。seo-check.js は CommonJS で、
 * CI の Node 20 では ESM を同期で require できないので、ここに写している。
 * 正と揃っていることは check-content-graph.mjs の自己テストが毎回確かめる
 * （片方だけ直すと、同じ保留の失効が2本の検査で食い違う）。
 */
const OPEN_STATUSES = ['running', 'frozen'];

/** 規則 → それを出す検査。「1件も当たらない」は、その規則を持つ検査にしか判定できない。 */
const RULE_OWNER = { HUB: 'seo-check', ORPHAN: 'seo-check', CHILD: 'content-graph', 'CHILD-EN': 'content-graph' };

/**
 * kind ごとに意味を持つ規則。hub は**親として**（[HUB] のハブ・[CHILD] の親）、
 * page は**子・孤立ページとして**（[HUB] の子・[ORPHAN] のページ）当たる。
 * 意味の無い組み合わせ（hub の ORPHAN など）は「当たらない行」ではなく書き間違いとして落とす。
 */
const KIND_RULES = { hub: ['HUB', 'CHILD', 'CHILD-EN'], page: ['HUB', 'ORPHAN'] };

/** 項目のキーは全部必須で、これ以外は書き間違いとして落とす（綴りを誤った項目を黙って読み飛ばさない）。 */
const ENTRY_KEYS = ['id', 'kind', 'page', 'rules', 'experiments', 'until', 'reason', 'added'];
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Asia/Tokyo の暦日。scripts/lib/jst.mjs の todayJst と同じ定義の写し（あちらは ESM。
 * 一致は check-content-graph.mjs の自己テストが確かめる）。CI のランナーは UTC で、
 * toISOString().slice(0, 10) のままだと JST の 0〜9時に前日を返し、期限が1日延びる。
 */
function todayTokyo(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' で、暦に実在する日か（2026-11-31 を Date が 12-01 へ繰り上げるのを弾く）。 */
function isCalendarDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * 実物の台帳2つ（保留・実験）と今日の日付。**投げない** —— 読めなかったことは
 * `problems` に入れて返し、settleLinkFindings が「何も外さない＋[DEFERRAL]」にする。
 * 投げると、呼び出し側の try/catch 次第で「保留なし」にも「検査ごと素通り」にも化ける。
 *
 * 自己テストはこれを通さず、同じ形の `{ ledger, experiments, today }` を直接渡す
 * （実物の時計・実物のファイルに依存しない）。
 */
function readLinkDeferrals(rootDir, { today = todayTokyo() } = {}) {
  const problems = [];
  const read = (rel) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(rootDir, rel), 'utf8'));
    } catch (e) {
      problems.push(`${rel} is unreadable (${e.message})`);
      return undefined;
    }
  };
  const ledger = read(LEDGER_FILE);
  const experimentsDoc = read(EXPERIMENTS_FILE);
  return { ledger, experiments: experimentsDoc?.experiments, today, problems };
}

/**
 * 台帳を検証し、各保留の範囲（ページキーの集合）と失効の有無を決める。
 * `problems` が1件でもあれば `entries` は空 —— 何も外さない。
 */
function compileLinkDeferrals({ ledger, experiments, registry, today, problems: readProblems = [] }) {
  const problems = [...readProblems];
  if (problems.length) return { problems, entries: [] };
  if (!isCalendarDate(today)) problems.push(`today ${JSON.stringify(today)} is not a YYYY-MM-DD calendar date`);
  if (!Array.isArray(experiments)) {
    problems.push(`${EXPERIMENTS_FILE} has no experiments array — cannot tell whether an experiment behind a deferral is still open`);
  }
  if (!Array.isArray(ledger?.deferrals)) {
    problems.push(`${LEDGER_FILE} has no "deferrals" array — an unreadable ledger is not "nothing deferred"`);
  }
  if (!Array.isArray(registry?.pages)) {
    problems.push('data/i18n/pages.json has no pages array — generated translations cannot be told from hand-maintained ones');
  }
  if (problems.length) return { problems, entries: [] };

  const statusOf = new Map(experiments.map((e) => [e?.id, e?.status]));
  const groupOf = new Map();
  for (const group of registry.pages) {
    for (const file of Object.values(group?.pages || {})) groupOf.set(pageKey(`/${file}`), group);
  }

  const seen = new Set();
  const entries = [];
  ledger.deferrals.forEach((d, i) => {
    const at = `deferral #${i}${typeof d?.id === 'string' ? ` (${d.id})` : ''}`;
    if (!d || typeof d !== 'object' || Array.isArray(d)) {
      problems.push(`${at} is not an object`);
      return;
    }
    const before = problems.length;
    for (const key of Object.keys(d)) {
      if (!ENTRY_KEYS.includes(key)) problems.push(`${at}: unknown key "${key}" (allowed: ${ENTRY_KEYS.join('/')})`);
    }
    if (typeof d.id !== 'string' || !KEBAB.test(d.id)) problems.push(`${at}: id must be a kebab-case string`);
    else if (seen.has(d.id)) problems.push(`${at}: duplicate id`);
    else seen.add(d.id);
    const kindKnown = typeof d.kind === 'string' && Object.hasOwn(KIND_RULES, d.kind);
    if (!kindKnown) problems.push(`${at}: kind ${JSON.stringify(d.kind)} is not one of ${Object.keys(KIND_RULES).join('/')}`);
    if (typeof d.page !== 'string' || !d.page.startsWith('/')) problems.push(`${at}: page must be a URL path starting with /`);
    if (!Array.isArray(d.rules) || !d.rules.length) {
      problems.push(`${at}: rules must be a non-empty array`);
    } else {
      for (const rule of d.rules) {
        if (typeof rule !== 'string' || !Object.hasOwn(RULE_OWNER, rule)) {
          problems.push(`${at}: unknown rule ${JSON.stringify(rule)} (${Object.keys(RULE_OWNER).join('/')})`);
        } else if (kindKnown && !KIND_RULES[d.kind].includes(rule)) {
          problems.push(`${at}: rule ${rule} means nothing for kind ${d.kind} (${KIND_RULES[d.kind].join('/')})`);
        }
      }
      if (new Set(d.rules).size !== d.rules.length) problems.push(`${at}: rules lists the same rule twice`);
    }
    if (!Array.isArray(d.experiments)) {
      problems.push(`${at}: experiments must be an array (write [] when no experiment holds the links)`);
    } else {
      for (const id of d.experiments) {
        if (!statusOf.has(id)) problems.push(`${at}: unknown experiment ${JSON.stringify(id)} (not in ${EXPERIMENTS_FILE})`);
      }
    }
    if (!isCalendarDate(d.until)) problems.push(`${at}: until ${JSON.stringify(d.until)} is not a YYYY-MM-DD calendar date`);
    if (!isCalendarDate(d.added)) problems.push(`${at}: added ${JSON.stringify(d.added)} is not a YYYY-MM-DD calendar date`);
    else if (isCalendarDate(d.until) && d.until < d.added) problems.push(`${at}: until ${d.until} precedes added ${d.added}`);
    if (typeof d.reason !== 'string' || !d.reason.trim()) {
      problems.push(`${at}: reason is empty — a deferral nobody can explain cannot be reviewed`);
    }
    if (problems.length > before) return;

    // 範囲: page 自身と、同じグループの生成された翻訳。手で書く翻訳は入れない。
    const covered = new Set([pageKey(d.page)]);
    const group = groupOf.get(pageKey(d.page));
    if (group) {
      if (!group.existing || typeof group.existing !== 'object' || !group.pages || typeof group.pages !== 'object') {
        problems.push(`${at}: the data/i18n/pages.json group of ${d.page} has no "existing"/"pages" map — generated translations cannot be told from hand-maintained ones`);
        return;
      }
      for (const [locale, file] of Object.entries(group.pages)) {
        if (!Object.hasOwn(group.existing, locale)) covered.add(pageKey(`/${file}`));
      }
    }

    // 失効: 期限切れか、名指しした実験がすべて閉じた。空の experiments は期限だけで決まる。
    const lapsed = [];
    if (today > d.until) lapsed.push(`until ${d.until} has passed (today ${today}, Asia/Tokyo)`);
    if (d.experiments.length && !d.experiments.some((id) => OPEN_STATUSES.includes(statusOf.get(id)))) {
      lapsed.push(`every experiment it waits on is closed: ${d.experiments.map((id) => `${id}=${statusOf.get(id)}`).join(', ')}`);
    }
    entries.push({
      id: d.id, kind: d.kind, rules: new Set(d.rules), until: d.until, reason: d.reason.trim(),
      covered, lapsed: lapsed.join('; '),
    });
  });
  return problems.length ? { problems, entries: [] } : { problems, entries };
}

/** この保留がこの指摘に当たるか。kind ごとに「どちら側のページで当たるか」が違う。 */
function covers(deferral, finding) {
  if (!deferral.rules.has(finding.rule)) return false;
  if (deferral.kind === 'hub') return finding.rule !== 'ORPHAN' && deferral.covered.has(pageKey(finding.parent));
  if (finding.rule === 'ORPHAN') return deferral.covered.has(pageKey(finding.page));
  return finding.rule === 'HUB' && deferral.covered.has(pageKey(finding.child));
}

/**
 * 1本の検査の指摘を、保留台帳に通す。
 *
 * @param {Array<{rule: string, message: string, page?: string, parent?: string, child?: string}>} findings
 *        ORPHAN は page、HUB / CHILD / CHILD-EN は parent と child を持つ
 * @param {object} options
 * @param {'seo-check'|'content-graph'} options.owner  呼び出し側の検査（未使用の判定に使う）
 * @param {object} options.registry   data/i18n/pages.json の中身
 * @param {object} options.deferrals  readLinkDeferrals() の戻り値、または同じ形の差し込み
 * @returns {{errors: string[], deferred: string[], counts: Object<string, number>}}
 *          errors は外さなかった指摘（元の順）と [DEFERRAL]。deferred は警告として出す行。
 */
function settleLinkFindings(findings, { owner, registry, deferrals }) {
  if (!Object.values(RULE_OWNER).includes(owner)) throw new Error(`link-deferrals: unknown owner ${JSON.stringify(owner)}`);
  for (const f of findings) {
    // 呼び出し側の配線の誤り。黙って error のまま流すと、未使用の判定が狂う。
    if (RULE_OWNER[f.rule] !== owner) throw new Error(`link-deferrals: ${owner} does not own [${f.rule}]`);
  }
  const { problems, entries } = compileLinkDeferrals({ ...deferrals, registry });
  if (problems.length) {
    return {
      errors: [
        ...findings.map((f) => f.message),
        ...problems.map((p) => `[DEFERRAL] ${p} — the deferral ledger cannot be applied, so nothing is deferred`),
      ],
      deferred: [],
      counts: {},
    };
  }

  const errors = [];
  const deferred = [];
  const counts = {};
  const used = new Set();
  const lapsedHit = new Set();
  for (const f of findings) {
    const hits = entries.filter((d) => covers(d, f));
    for (const d of hits) {
      used.add(`${d.id}\t${f.rule}`);
      if (d.lapsed) lapsedHit.add(d.id);
    }
    // 外すのは**効いている**保留だけ。失効した保留しか当たらない指摘は error のまま。
    const holder = hits.find((d) => !d.lapsed);
    if (!holder) {
      errors.push(f.message);
      continue;
    }
    deferred.push(`[DEFERRED] ${f.message} — deferral ${holder.id} until ${holder.until}: ${holder.reason}`);
    counts[holder.id] = (counts[holder.id] || 0) + 1;
  }
  for (const d of entries) {
    if (lapsedHit.has(d.id)) {
      errors.push(`[DEFERRAL] ${d.id} has lapsed (${d.lapsed}): add the deferred links or renew the entry with new evidence`);
    }
    for (const rule of d.rules) {
      if (RULE_OWNER[rule] === owner && !used.has(`${d.id}\t${rule}`)) {
        errors.push(`[DEFERRAL] ${d.id} rule ${rule} matches nothing — remove it`);
      }
    }
  }
  return { errors, deferred, counts };
}

module.exports = {
  LEDGER_FILE, EXPERIMENTS_FILE, OPEN_STATUSES, RULE_OWNER, KIND_RULES,
  todayTokyo, isCalendarDate, readLinkDeferrals, compileLinkDeferrals, settleLinkFindings,
};
