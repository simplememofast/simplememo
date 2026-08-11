/**
 * Query clusters — the split that makes the site's CTR readable.
 *
 * Site-wide CTR is an average of two businesses that behave nothing alike, and
 * reporting it as one number is why "CTR崩壊" stayed on the problem list for
 * three cycles without moving. On the 2026-05-09..08-08 export:
 *
 *   ★ brand + Obsidian + voice   12.3% of impressions → 48.2% of clicks (7.41%)
 *   ☆ rival names + generic + LINE 61.5% of impressions → 30.0% of clicks (0.92%)
 *
 * An 8× CTR difference between two halves of one average means any movement in
 * the average is uninterpretable: it could be the winning side growing or the
 * commodity side shrinking, and those call for opposite responses.
 *
 * Two design decisions worth stating, because both were wrong in the first cut:
 *
 *   1. **Assignment is mutually exclusive, first match wins.** Overlapping
 *      regexes let `obsidian logseq 比較` land in both "Obsidian" and "rival
 *      brands", so the shares summed past 100% and the two clusters each looked
 *      bigger than they were. PRIORITY below is the tiebreak, most specific
 *      first, and it is the whole contract — reordering it silently rewrites
 *      every share this file produces.
 *
 *   2. **`commodity` is a descriptive label, not a verdict on the pages.** A
 *      query is commodity because *this site cannot convert it* — a rival's
 *      navigational search resolves at the rival's own site whatever we rank —
 *      not because the page serving it is bad. `/blog/line-keep-alternative`
 *      is the site's largest AI-Overview surface while being its worst CTR.
 */

/**
 * Ordered, mutually exclusive. First pattern that matches a query wins, so the
 * order is the classification — see note 1 above before touching it.
 */
export const PRIORITY = [
  {
    key: 'brand',
    label: '自社ブランド',
    side: 'win',
    // Own-name searches. `captio` stays here: the app is the Captio successor
    // and those searchers arrive looking for this product by its former name.
    pattern: /シンプルメモ|simplememo|simple ?memo$|^captio|captio式|scaptio|captioo|memofast/i,
  },
  {
    key: 'obsidian',
    label: 'Obsidian連携',
    side: 'win',
    pattern: /obsidian|オブシディアン|logsq/i,
  },
  {
    key: 'voice',
    label: '音声/Watch/Siri',
    side: 'win',
    pattern: /音声|apple ?watch|アップルウォッチ|applewatch|siri|voice|録音|文字起こし|dictation|hands.?free/i,
  },
  {
    key: 'security',
    label: '暗号化/セキュリティ',
    side: 'other',
    pattern: /aes|gcm|暗号|e2ee|セキュリティ|安全性|galois/i,
  },
  {
    key: 'line-keep',
    label: 'LINE Keep終了',
    side: 'commodity',
    pattern: /line|ライン|keep ?メモ|キープメモ|keepメモ/i,
  },
  {
    key: 'meeting',
    label: '会議/議事録',
    side: 'other',
    pattern: /会議|議事|打ち合わせ|打合せ|ミーティング|meeting|アジェンダ/i,
  },
  {
    key: 'pkm',
    label: 'PKM/手法',
    side: 'other',
    pattern: /pkm|second.?brain|2nd brain|セカンドブレイン|zettel|fleeting|deep ?work|ディープ ?ワーク|アイゼンハワー|gtd|timebox|ジャーナリング|journal/i,
  },
  {
    key: 'mail',
    label: 'メール送信',
    side: 'other',
    pattern: /メール|mail|email|note to self|自分に|自分宛|inbox|outlook|gmail|icloud|relay/i,
  },
  {
    key: 'rival-brand',
    label: '他社ブランド比較',
    side: 'commodity',
    pattern: /notion|evernote|dynalist|capacities|capacitie|capasities|cpacities|joplin|craft|heptabase|anytype|tana|simplenote|upnote|standard ?notes|bear|day ?one|onenote|google ?keep|googlekeep|グーグルキープ|apple ?notes|drafts|roam|todoist|moca|stock|zoho|apptio/i,
  },
  {
    key: 'generic-memo',
    label: '汎用メモアプリ',
    side: 'commodity',
    pattern: /メモ|memo|note|ノート|日記|記録/i,
  },
];

export const UNCLASSIFIED = { key: 'other', label: 'その他', side: 'other' };

/** The cluster descriptor a query falls into. Never returns null. */
export function clusterOf(query) {
  if (!query) return UNCLASSIFIED;
  for (const c of PRIORITY) if (c.pattern.test(query)) return c;
  return UNCLASSIFIED;
}

/**
 * Conversational queries — the fingerprint of AI Mode's query fan-out.
 *
 * These are not typed by people. A fan-out query is a complete sentence with
 * polite verb endings, often a year qualifier, and it ends in a question mark
 * or a 「〜を教えてください。」 imperative. On the 2026-08 export there were 27
 * of them: 343 impressions, average position 6.8, **zero clicks**.
 *
 * Zero clicks is the expected outcome, not a failure — a fan-out query is
 * issued by the model, not by a person who could click. That is exactly why
 * they need a detector of their own: every click-based detector in this repo
 * scores them as dead weight and would have them deprioritised, when ranking
 * 6.8 on them means the model is reading this site to compose its answer.
 *
 * The length floor keeps ordinary short questions (`pkmとは`, `メモ とは`) out;
 * those are human searches that happen to end in a question particle.
 */
const CONVERSATIONAL = /(ですか|ますか|でしょうか|教えて|ください|どれ|何です|どちら|するには|優れて|[?？])/;
const MIN_CONVERSATIONAL_LENGTH = 12;

export function isConversational(query) {
  if (!query || query.length < MIN_CONVERSATIONAL_LENGTH) return false;
  return CONVERSATIONAL.test(query);
}

const emptyTotals = () => ({ clicks: 0, impressions: 0, queries: 0, weightedPosition: 0 });

function finish(t) {
  return {
    queries: t.queries,
    clicks: t.clicks,
    impressions: t.impressions,
    ctr: t.impressions ? t.clicks / t.impressions : null,
    position: t.impressions ? t.weightedPosition / t.impressions : null,
  };
}

/**
 * Roll query rows up by cluster and by side.
 *
 * Position is impression-weighted; a flat mean would let a single 4-impression
 * row at position 1 drag a cluster's average as hard as a 2,000-impression row.
 */
export function summarizeClusters(queryRows) {
  const byCluster = new Map();
  const bySide = new Map([['win', emptyTotals()], ['commodity', emptyTotals()], ['other', emptyTotals()]]);
  const site = emptyTotals();
  const conversational = emptyTotals();

  for (const r of queryRows) {
    if (!r.query || !r.impressions) continue;
    const c = clusterOf(r.query);
    if (!byCluster.has(c.key)) byCluster.set(c.key, { ...c, ...emptyTotals() });

    for (const t of [byCluster.get(c.key), bySide.get(c.side), site]) {
      t.queries += 1;
      t.clicks += r.clicks || 0;
      t.impressions += r.impressions;
      t.weightedPosition += (r.position ?? 0) * r.impressions;
    }
    if (isConversational(r.query)) {
      conversational.queries += 1;
      conversational.clicks += r.clicks || 0;
      conversational.impressions += r.impressions;
      conversational.weightedPosition += (r.position ?? 0) * r.impressions;
    }
  }

  const clusters = PRIORITY.concat([UNCLASSIFIED])
    .filter((c) => byCluster.has(c.key))
    .map((c) => {
      const t = byCluster.get(c.key);
      return {
        key: c.key,
        label: c.label,
        side: c.side,
        ...finish(t),
        impressionShare: site.impressions ? t.impressions / site.impressions : null,
        clickShare: site.clicks ? t.clicks / site.clicks : null,
      };
    })
    .sort((a, b) => b.impressions - a.impressions);

  return {
    clusters,
    sides: Object.fromEntries([...bySide].map(([k, t]) => [k, {
      ...finish(t),
      impressionShare: site.impressions ? t.impressions / site.impressions : null,
      clickShare: site.clicks ? t.clicks / site.clicks : null,
    }])),
    site: finish(site),
    conversational: finish(conversational),
  };
}

/** Conversational rows themselves, worst-ranked last — the AIO working list. */
export function conversationalQueries(queryRows) {
  return queryRows
    .filter((r) => r.query && r.impressions && isConversational(r.query))
    .map((r) => ({
      query: r.query,
      impressions: r.impressions,
      clicks: r.clicks || 0,
      position: r.position ?? null,
    }))
    .sort((a, b) => b.impressions - a.impressions);
}
