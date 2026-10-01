// Pure owner-memory candidate search. Never fetch, persist, log, or return source values.
// Official contracts and the caller's remaining obligations are in ACCOUNTING_CANDIDATES.md.
const SIDES = new Set(['income', 'expense']);
const ACCOUNTS = new Set(['bank_account', 'credit_card', 'wallet']);
const STATUSES = new Set([1, 2, 3, 4, 6]);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const money = value => Number.isSafeInteger(value) && value >= 0;
const add = (reasons, code) => { if (!reasons.includes(code)) reasons.push(code); };

function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || month < 1 || month > 12 || day < 1) return null;
  const stamp = Date.UTC(year, month - 1, day);
  const d = new Date(stamp);
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
    ? stamp / 86400000 : null;
}

function csvDate(value) {
  if (typeof value !== 'string') return null;
  return date(/^\d{4}\/\d{2}\/\d{2}$/.test(value) ? value.replaceAll('/', '-') : value);
}

function csvId(value) {
  // CSV cells are strings. Do not coerce unexpected types or rounded int64 values.
  if (typeof value !== 'string' || value.length > 19 || !/^[1-9]\d*$/.test(value)) return null;
  return BigInt(value) <= 9223372036854775807n ? value : null;
}

function csvPositive(value) {
  const id = csvId(value);
  return id && positive(Number(id)) ? Number(id) : null;
}

function windowScope(value) {
  if (!object(value)) return null;
  const from = date(value.from), through = date(value.through);
  if (from === null || through === null || from > through) return null;
  if (value.kind === 'rolling_28_days' && through - from === 27) return {from, through};
  if (value.kind === 'calendar_month') {
    const [year, month, day] = value.from.split('-').map(Number);
    const last = Date.UTC(year, month, 0) / 86400000;
    if (day === 1 && last === through) return {from, through};
  }
  return null;
}

function contextScope(context, arrays) {
  const gaps = [], blocking = [];
  const c = object(context) ? context : {};
  const window = windowScope(c.window);
  if (!window) blocking.push('window_invalid');
  if (!positive(c.company_id) || c.same_subject_confirmed !== true) blocking.push('subject_unconfirmed');
  if (!object(c.comparison) || c.comparison.confirmed !== true
    || c.comparison.currency !== 'JPY' || c.comparison.unit !== 'yen') blocking.push('comparison_unconfirmed');
  const sourceRanges = {};
  for (const name of ['wallet_txns', 'deals', 'journal']) {
    const s = object(c.sources) && object(c.sources[name]) ? c.sources[name] : {};
    if (!positive(s.company_id) || s.company_id !== c.company_id) add(blocking, 'source_subject_unconfirmed');
    const from = date(s.from), through = date(s.through);
    if (from !== null && through !== null && from <= through) sourceRanges[name] = {from, through};
    if (!window || from === null || through === null || from > window.from || through < window.through)
      add(gaps, `${name}_period_incomplete`);
    if (s[name === 'journal' ? 'all_rows_read' : 'all_pages_read'] !== true) add(gaps, `${name}_pagination_unconfirmed`);
    if (s.sync_current !== true) add(gaps, `${name}_sync_unconfirmed`);
    if (s.range_complete !== true) add(gaps, `${name}_range_unconfirmed`);
    if (!arrays[name]) add(gaps, `${name}_input_missing`);
    if (name === 'deals' && s.payment_scope_confirmed !== true) add(gaps, 'deals_payment_scope_unconfirmed');
    if (name === 'journal' && s.deal_reference_scope_confirmed !== true) add(gaps, 'journal_deal_scope_unconfirmed');
    if (name === 'journal' && s.format !== 'generic_v2') add(gaps, 'journal_format_unconfirmed');
  }
  return {window, sourceRanges, company: c.company_id, gaps, blocking,
    journalFormat: object(c.sources) && object(c.sources.journal) && c.sources.journal.format === 'generic_v2'};
}

function projectWallet(row, index, scope) {
  const reasons = [];
  const w = object(row) ? row : {};
  if (!positive(w.id)) add(reasons, 'wallet_id_invalid');
  if (!positive(w.company_id) || w.company_id !== scope.company) add(reasons, 'wallet_subject_mismatch');
  const day = date(w.date);
  if (day === null) add(reasons, 'wallet_date_invalid');
  else if (day < scope.window.from || day > scope.window.through) add(reasons, 'wallet_outside_window');
  if (!money(w.amount) || w.amount === 0) add(reasons, 'wallet_amount_invalid');
  if (!money(w.due_amount) || !money(w.amount) || w.due_amount > w.amount) add(reasons, 'wallet_due_amount_invalid');
  if (!SIDES.has(w.entry_side)) add(reasons, 'wallet_direction_invalid');
  if (!ACCOUNTS.has(w.walletable_type) || !positive(w.walletable_id)) add(reasons, 'wallet_account_invalid');
  if (!STATUSES.has(w.status)) add(reasons, 'wallet_status_invalid');
  else if ((w.status === 1 && w.due_amount !== w.amount) || (w.status === 2 && w.due_amount !== 0)
    || (w.status === 4 && !(w.due_amount > 0 && w.due_amount < w.amount))) add(reasons, 'wallet_status_amount_conflict');
  if (w.status === 3) add(reasons, 'wallet_ignored');
  if (w.status === 6) add(reasons, 'wallet_out_of_registration_scope');
  return {index, id: positive(w.id) ? w.id : null, valid: reasons.length === 0, reasons,
    partial: w.status === 4, waiting: w.status === 1,
    key: reasons.length ? null : [w.company_id, w.date, w.amount, w.entry_side, w.walletable_type, w.walletable_id].join('|')};
}

function projectPayments(deals, scope, gaps) {
  const payments = [], dealReport = [], dealIds = new Map(), paymentIds = new Map();
  deals.forEach((row, dealIndex) => {
    const d = object(row) ? row : {}, reasons = [];
    if (!positive(d.id)) add(reasons, 'deal_id_invalid');
    if (!positive(d.company_id) || d.company_id !== scope.company) add(reasons, 'deal_subject_mismatch');
    if (!SIDES.has(d.type)) add(reasons, 'deal_direction_invalid');
    if (d.renews !== undefined && !Array.isArray(d.renews)) add(reasons, 'deal_renewals_invalid');
    const renewal = Array.isArray(d.renews) && d.renews.length > 0;
    if (renewal) add(gaps, 'deal_renewal_payments_not_projected');
    const local = [];
    const report = {deal_index: dealIndex, state: reasons.length ? 'unusable' : 'projected',
      payment_indexes: [], reasons: [...reasons]};
    dealReport.push(report);
    for (const reason of reasons) add(gaps, reason);
    if (renewal) add(report.reasons, 'deal_renewal_payments_not_projected');
    if (positive(d.id)) {
      const previous = dealIds.get(d.id) || [];
      previous.push({payments: local, report}); dealIds.set(d.id, previous);
    }
    if (!Array.isArray(d.payments)) {
      const reason = d.payments === undefined ? 'deal_payments_absent' : 'deal_payments_invalid';
      add(gaps, reason); add(report.reasons, reason);
      if (d.payments !== undefined) report.state = 'unusable';
      else if (!reasons.length) report.state = 'no_payment_rows';
      return;
    }
    if (!d.payments.length) {
      add(gaps, 'deal_payment_rows_empty'); add(report.reasons, 'deal_payment_rows_empty');
      if (!reasons.length) report.state = 'no_payment_rows';
    }
    d.payments.forEach((row, paymentIndex) => {
      const p = object(row) ? row : {}, errors = [...reasons];
      if (!positive(p.id)) add(errors, 'payment_id_invalid');
      const day = date(p.date);
      if (day === null) add(errors, 'payment_date_invalid');
      if (!money(p.amount) || p.amount === 0) add(errors, 'payment_amount_invalid');
      if (!ACCOUNTS.has(p.from_walletable_type) || !positive(p.from_walletable_id)) add(errors, 'payment_account_invalid');
      const outside = day !== null && (day < scope.window.from || day > scope.window.through);
      const value = {deal_index: dealIndex, payment_index: paymentIndex, dealId: positive(d.id) ? String(d.id) : null,
        paymentId: positive(p.id) ? p.id : null, reasons: errors, warnings: [], outside,
        valid: errors.length === 0 && !outside,
        key: errors.length || outside ? null : [d.company_id, p.date, p.amount, d.type, p.from_walletable_type, p.from_walletable_id].join('|')};
      if (d.payments.length > 1) value.warnings.push('deal_multiple_payment_rows');
      if (renewal) value.warnings.push('deal_renewal_payments_not_projected');
      payments.push(value); local.push(value);
      report.payment_indexes.push(paymentIndex);
      if (value.paymentId !== null) {
        const previous = paymentIds.get(value.paymentId) || [];
        previous.push(value); paymentIds.set(value.paymentId, previous);
      }
    });
  });
  for (const groups of dealIds.values()) if (groups.length > 1) {
    add(gaps, 'duplicate_deal_id');
    for (const group of groups) {
      group.report.state = 'unusable'; add(group.report.reasons, 'duplicate_deal_id');
      for (const p of group.payments) {p.valid = false; add(p.reasons, 'duplicate_deal_id');}
    }
  }
  for (const group of paymentIds.values()) if (group.length > 1) {
    add(gaps, 'duplicate_payment_id');
    for (const p of group) {p.valid = false; add(p.reasons, 'duplicate_payment_id');}
  }
  return {payments, dealReport};
}

const JOURNAL_FIELDS = ['取引ID', '口座振替ID', '振替伝票ID', '仕訳ID', '取引日', '取引支払日', '仕訳行番号', '仕訳行数'];

function projectJournals(rows, scope, gaps) {
  const groups = new Map(), invalid = [], byDeal = new Map(), report = [];
  rows.forEach((row, index) => {
    const j = object(row) ? row : {}, reasons = [];
    if (!scope.journalFormat) add(reasons, 'journal_format_unconfirmed');
    if (JOURNAL_FIELDS.some(field => typeof j[field] !== 'string')) add(reasons, 'journal_headers_or_types_invalid');
    const id = csvId(j['仕訳ID']), line = csvPositive(j['仕訳行番号']), total = csvPositive(j['仕訳行数']);
    if (!id || !line || !total || line > total) add(reasons, 'journal_identity_or_line_invalid');
    const day = csvDate(j['取引日']), paymentDate = j['取引支払日'];
    if (day === null || (paymentDate !== '' && csvDate(paymentDate) === null)) add(reasons, 'journal_date_invalid');
    const range = scope.sourceRanges.journal;
    if (day !== null && range && (day < range.from || day > range.through)) add(reasons, 'journal_outside_source_period');
    const foreign = ['取引ID', '口座振替ID', '振替伝票ID'].map(field => j[field]);
    if (foreign.some(value => value !== '' && !csvId(value))) add(reasons, 'journal_reference_invalid');
    if (foreign.filter(value => value !== '').length !== 1) add(reasons, 'journal_reference_kind_unconfirmed');
    const value = {index, id, line, total, day, paymentDay: paymentDate === '' ? null : csvDate(paymentDate), dealId: csvId(j['取引ID']),
      reference: foreign.join('|'), reasons};
    if (!id) invalid.push(value);
    else {const group = groups.get(id) || []; group.push(value); groups.set(id, group);}
  });
  for (const group of [...groups.values(), ...invalid.map(value => [value])]) {
    const reasons = [];
    for (const row of group) for (const reason of row.reasons) add(reasons, reason);
    const first = group[0];
    if (group.some(row => row.total !== first.total || row.reference !== first.reference
      || row.day !== first.day || row.paymentDay !== first.paymentDay)) add(reasons, 'journal_group_conflict');
    if (group.length !== first.total || new Set(group.map(row => row.line)).size !== group.length)
      add(reasons, 'journal_rows_incomplete');
    const state = reasons.length ? 'unusable' : first.dealId ? 'deal_reference_present' : 'other_journal_kind';
    const result = {row_indexes: group.map(row => row.index), state, reasons};
    report.push(result);
    for (const reason of reasons) add(gaps, reason);
    // A malformed group must not hide an otherwise recognizable deal reference.
    for (const dealId of new Set(group.map(row => row.dealId).filter(Boolean))) {
      const list = byDeal.get(dealId) || [];
      list.push(result); byDeal.set(dealId, list);
    }
  }
  return {byDeal, report};
}

function journalReference(payment, journals) {
  if (payment.reasons.length) return {state: 'not_projected', row_indexes: []};
  const groups = journals.byDeal.get(payment.dealId) || [];
  if (!groups.length) return {state: 'not_observed', row_indexes: []};
  return {state: groups.every(group => group.state === 'deal_reference_present') ? 'linked_by_deal_id' : 'incomplete_or_invalid',
    row_indexes: groups.flatMap(group => group.row_indexes)};
}

function finish(wallets, deals, payments, journals, gaps, unusable = false) {
  const states = {unique_candidate: 0, ambiguous: 0, no_candidate: 0, partial_registration: 0, unusable: 0};
  const reasons = {};
  for (const row of [...wallets, ...deals, ...payments, ...journals]) {
    for (const reason of row.reasons) reasons[reason] = (reasons[reason] || 0) + 1;
  }
  for (const row of wallets) states[row.state]++;
  return {mode: 'owner_memory_draft', wallets, deals, payments, journals,
    summary: {state: unusable ? 'input_unusable' : 'draft_candidates_only', full_completion_credit: 0,
      coverage: gaps.length ? 'incomplete_or_unknown' : 'declared_complete',
      counts: {wallet_rows: wallets.length, deal_rows: deals.length, unusable_deal_rows: deals.filter(d => d.state === 'unusable').length,
        payment_rows: payments.length, journal_groups: journals.length, ...states},
      reason_counts: reasons, gaps}};
}

/**
 * Accept official read results only inside the already-authorized private owner.
 * Return array indexes, fixed states/reasons, and counts; never raw projections.
 * Completeness metadata is a caller declaration, not verified runtime evidence.
 */
export function findAccountingCandidates(input = {}) {
  const i = object(input) ? input : {};
  const arrays = {wallet_txns: Array.isArray(i.wallet_txns), deals: Array.isArray(i.deals), journal: Array.isArray(i.journal_rows)};
  const wallets = arrays.wallet_txns ? i.wallet_txns : [], deals = arrays.deals ? i.deals : [], rows = arrays.journal ? i.journal_rows : [];
  const scope = contextScope(i.context, arrays), gaps = [...scope.blocking, ...scope.gaps];
  if (scope.blocking.length) return finish(wallets.map((_, index) => ({wallet_index: index, state: 'unusable',
    candidates: [], reasons: ['input_scope_unconfirmed']})), deals.map((_, index) => ({deal_index: index, state: 'unusable',
    payment_indexes: [], reasons: ['input_scope_unconfirmed']})), [], [], gaps, true);

  const ws = wallets.map((row, index) => projectWallet(row, index, scope));
  const walletIds = new Map();
  for (const w of ws) if (w.id !== null) {const group = walletIds.get(w.id) || []; group.push(w); walletIds.set(w.id, group);}
  for (const group of walletIds.values()) if (group.length > 1) {
    add(gaps, 'duplicate_wallet_id');
    for (const w of group) {w.valid = false; add(w.reasons, 'duplicate_wallet_id');}
  }
  const {payments: ps, dealReport} = projectPayments(deals, scope, gaps);
  const journals = projectJournals(rows, scope, gaps), byKey = new Map();
  for (const p of ps) if (p.valid) {const group = byKey.get(p.key) || []; group.push(p); byKey.set(p.key, group);}
  const reverse = new Map();
  for (const w of ws) if (w.valid) for (const p of byKey.get(w.key) || []) {
    const matches = reverse.get(p) || []; matches.push(w.index); reverse.set(p, matches);
  }
  const walletReport = ws.map(w => {
    const candidates = w.valid ? byKey.get(w.key) || [] : [], reasons = [...w.reasons];
    let state = w.valid ? 'no_candidate' : 'unusable';
    if (candidates.length) state = candidates.length === 1 && reverse.get(candidates[0]).length === 1 ? 'unique_candidate' : 'ambiguous';
    if (w.valid && w.partial) {state = 'partial_registration'; add(reasons, 'wallet_partially_registered');}
    if (w.valid && w.waiting) add(reasons, 'wallet_registration_waiting');
    if (state === 'ambiguous') add(reasons, 'candidate_relationship_ambiguous');
    if (state === 'no_candidate') add(reasons, 'no_exact_candidate_observed');
    for (const p of candidates) for (const reason of p.warnings) add(reasons, reason);
    for (const p of candidates) if (journalReference(p, journals).state !== 'linked_by_deal_id') add(reasons, 'deal_journal_reference_unconfirmed');
    return {wallet_index: w.index, state, candidates: candidates.map(p => ({deal_index: p.deal_index,
      payment_index: p.payment_index, journal: journalReference(p, journals)})), reasons};
  });
  const paymentReport = ps.map(p => ({deal_index: p.deal_index, payment_index: p.payment_index,
    state: p.reasons.length ? 'unusable' : p.outside ? 'outside_window' : 'projected',
    wallet_indexes: reverse.get(p) || [], journal: journalReference(p, journals),
    reasons: [...p.reasons, ...p.warnings]}));
  for (const row of [...walletReport, ...paymentReport]) for (const reason of row.reasons) add(gaps, reason);
  return finish(walletReport, dealReport, paymentReport, journals.report, gaps);
}
