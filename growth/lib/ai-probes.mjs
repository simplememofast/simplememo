// Inputs are manually verified observations, not regex guesses from answers.
// Failed / unperformed observations stay visible without becoming zero mentions.
export function summarizeAiProbes(input) {
  if (input?.schema_version !== 2 || !Array.isArray(input.observations)) throw new Error('Expected schema_version=2 and observations array');
  const groups = new Map(), seen = new Set();
  for (const row of input.observations) {
    for (const field of ['date', 'question_set', 'question_id', 'service', 'model', 'language', 'login_state']) {
      if (typeof row[field] !== 'string' || !row[field].trim()) throw new Error(`Missing ${field}`);
    }
    if (!['brand', 'nonbrand'].includes(row.question_type) || typeof row.search_enabled !== 'boolean'
      || !Number.isInteger(row.repetition) || row.repetition < 1
      || !['ok', 'missing', 'error'].includes(row.status)) throw new Error('Invalid observation conditions');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date))
      || new Date(row.date).toISOString().slice(0, 10) !== row.date) throw new Error('Invalid date');
    const conditions = Object.fromEntries(['date', 'question_set', 'question_type', 'service', 'model', 'search_enabled', 'language', 'login_state'].map(k => [k, row[k]]));
    const key = JSON.stringify(conditions);
    const identity = JSON.stringify([key, row.question_id, row.repetition]);
    if (seen.has(identity)) throw new Error('Duplicate question/repetition under the same conditions');
    seen.add(identity);
    if (!groups.has(key)) groups.set(key, { ...conditions, planned: 0, completed: 0, missing: 0, errors: 0,
      mentions: 0, linked_citations: 0, wrong_claims: 0, questions: new Set() });
    const group = groups.get(key);
    group.planned++;
    group.questions.add(row.question_id);
    if (row.status !== 'ok') { group[row.status === 'error' ? 'errors' : 'missing']++; continue; }
    for (const field of ['mentioned', 'linked_citation', 'wrong_claim']) {
      if (typeof row[field] !== 'boolean') throw new Error(`Completed observation needs boolean ${field}`);
    }
    if (!row.evidence_ref) throw new Error('Completed observation needs a private evidence_ref');
    group.completed++;
    group.mentions += Number(row.mentioned);
    group.linked_citations += Number(row.linked_citation);
    group.wrong_claims += Number(row.wrong_claim);
  }
  return { schema_version: 2, denominator: 'completed observations within identical conditions and question type',
    note: '反復回答は独立したユーザー標本ではない。条件・質問セット・実施範囲の異なる率を直接比較しない。',
    groups: [...groups.values()].map(g => ({ ...g, questions: [...g.questions].sort(),
      mention_rate: g.completed ? g.mentions / g.completed : null,
      citation_rate: g.completed ? g.linked_citations / g.completed : null,
      wrong_claim_rate: g.completed ? g.wrong_claims / g.completed : null })) };
}
