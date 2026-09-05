/**
 * Mutually exclusive query topics, not conversion or AI-source attribution.
 * Apply the same classifier version to both comparison windows. Only visible
 * query rows are classified; anonymized demand stays outside these shares.
 */
export const QUERY_CLASSIFIER_VERSION = '2026-09-05-v2';

export const PRIORITY = [
  {
    key: 'brand',
    label: '自社指名（識別可能）',
    side: 'win',
    pattern: /\bsimplememofast(?:\.com)?\b|obsidian\s*連携\s*シンプルメモ|simple\s*memo\s*[-–—]?\s*for\s*obsidian/i,
  },
  {
    key: 'brand-legacy',
    label: '旧自社名（明示表記）',
    side: 'win',
    pattern: /captio\s*式\s*シンプルメモ/i,
  },
  {
    key: 'captio-alternative',
    label: 'Captio・乗換',
    side: 'other',
    pattern: /captio|scaptio/i,
  },
  {
    key: 'obsidian',
    label: 'Obsidian連携',
    side: 'win',
    pattern: /obsidian|オブシディアン/i,
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
    pattern: /\bline\b|ライン|keep ?メモ|キープメモ|keepメモ/i,
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
    pattern: /notion|evernote|logseq|logsq|dynalist|capacities|capacitie|capasities|cpacities|joplin|craft|heptabase|anytype|tana|simplenote|upnote|standard ?notes|bear|day ?one|onenote|google ?keep|googlekeep|グーグルキープ|apple ?notes|drafts|roam|todoist|moca|stock|zoho|apptio/i,
  },
  {
    key: 'ambiguous-brand',
    label: '名前が曖昧（指名未確定）',
    side: 'other',
    pattern: /シンプルメモ|\bsimple\s*memo\b/i,
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
  const normalized = String(query).normalize('NFKC').trim();
  for (const c of PRIORITY) if (c.pattern.test(normalized)) return c;
  return UNCLASSIFIED;
}

/** Linguistic feature only. People and AI can both issue natural-language queries. */
const CONVERSATIONAL = /(ですか|ますか|でしょうか|教えて|ください|どれ|何です|どちら|するには|優れて|[?？])/;
const MIN_CONVERSATIONAL_LENGTH = 12;

export function isConversational(query) {
  if (!query || query.length < MIN_CONVERSATIONAL_LENGTH) return false;
  return CONVERSATIONAL.test(query);
}

const emptyTotals = () => ({ clicks: 0, impressions: 0, queries: 0, weightedPosition: 0, positionImpressions: 0 });

function finish(t) {
  return {
    queries: t.queries,
    clicks: t.clicks,
    impressions: t.impressions,
    ctr: t.impressions ? t.clicks / t.impressions : null,
    position: t.positionImpressions ? t.weightedPosition / t.positionImpressions : null,
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
      if (Number.isFinite(r.position) && r.position > 0) {
        t.weightedPosition += r.position * r.impressions;
        t.positionImpressions += r.impressions;
      }
    }
    if (isConversational(r.query)) {
      conversational.queries += 1;
      conversational.clicks += r.clicks || 0;
      conversational.impressions += r.impressions;
      if (Number.isFinite(r.position) && r.position > 0) {
        conversational.weightedPosition += r.position * r.impressions;
        conversational.positionImpressions += r.impressions;
      }
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
    classificationVersion: QUERY_CLASSIFIER_VERSION,
    aggregation: 'available-queries',
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

/** Natural-language query rows, ordered by observed impressions. Source is unknown. */
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
