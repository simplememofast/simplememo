import test from 'node:test';
import assert from 'node:assert/strict';
import {findAccountingCandidates} from './accounting-candidates.mjs';

// All records below are fabricated fixtures. No financial source or network is used.
const fixture = () => ({
  context: {company_id: 7, same_subject_confirmed: true,
    window: {kind: 'calendar_month', from: '2030-06-01', through: '2030-06-30'},
    comparison: {confirmed: true, currency: 'JPY', unit: 'yen'},
    sources: {
      wallet_txns: {company_id: 7, from: '2030-06-01', through: '2030-06-30', all_pages_read: true, sync_current: true, range_complete: true},
      deals: {company_id: 7, from: '2030-06-01', through: '2030-06-30', all_pages_read: true, sync_current: true, range_complete: true, payment_scope_confirmed: true},
      journal: {company_id: 7, from: '2030-06-01', through: '2030-06-30', all_rows_read: true, sync_current: true, range_complete: true, deal_reference_scope_confirmed: true, format: 'generic_v2'},
    }},
  wallet_txns: [{id: 100, company_id: 7, date: '2030-06-09', amount: 31, due_amount: 0,
    entry_side: 'expense', walletable_type: 'bank_account', walletable_id: 11, status: 2}],
  deals: [{id: 200, company_id: 7, type: 'expense', issue_date: '2030-06-08',
    payments: [{id: 300, date: '2030-06-09', amount: 31, from_walletable_type: 'bank_account', from_walletable_id: 11}]}],
  journal_rows: [1, 2].map(line => ({'取引ID': '200', '口座振替ID': '', '振替伝票ID': '', '仕訳ID': '400',
    '取引日': '2030/06/08', '取引支払日': '2030/06/09', '仕訳行番号': String(line), '仕訳行数': '2'})),
});
const clone = value => structuredClone(value);
const one = input => findAccountingCandidates(input).wallets[0];
const reasons = report => new Set([...report.summary.gaps, ...report.wallets.flatMap(w => w.reasons)]);

test('exact bank/payment equality only proposes a candidate; journal deal ID is a separate direct relation', () => {
  const result = findAccountingCandidates(fixture());
  assert.deepEqual(result.wallets, [{wallet_index: 0, state: 'unique_candidate', candidates: [{deal_index: 0,
    payment_index: 0, journal: {state: 'linked_by_deal_id', row_indexes: [0, 1]}}], reasons: []}]);
  assert.equal(result.journals[0].state, 'deal_reference_present');
  assert.equal(result.summary.state, 'draft_candidates_only');
  assert.equal(result.summary.coverage, 'declared_complete');
  assert.equal(result.summary.full_completion_credit, 0);
  assert.equal(result.summary.counts.unique_candidate, 1);
  assert(!Object.hasOwn(result, 'confirmed_matches'));
});

test('candidate lookup requires every date, amount, direction, account type and account ID to agree', () => {
  for (const mutate of [
    i => {i.deals[0].payments[0].date = '2030-06-10';},
    i => {i.deals[0].payments[0].amount = 32;},
    i => {i.deals[0].type = 'income';},
    i => {i.deals[0].payments[0].from_walletable_type = 'credit_card';},
    i => {i.deals[0].payments[0].from_walletable_id = 12;},
  ]) {
    const i = fixture(); mutate(i);
    assert.equal(one(i).state, 'no_candidate');
    assert.deepEqual(one(i).candidates, []);
  }
});

test('one wallet to multiple payments and multiple wallets to one payment stay ambiguous on both sides', () => {
  const a = fixture();
  a.deals[0].payments.push({...a.deals[0].payments[0], id: 301});
  let result = findAccountingCandidates(a);
  assert.equal(result.wallets[0].state, 'ambiguous');
  assert.equal(result.wallets[0].candidates.length, 2);
  assert(reasons(result).has('deal_multiple_payment_rows'));
  assert.deepEqual(result.payments.map(p => p.wallet_indexes), [[0], [0]]);
  const b = fixture();
  b.wallet_txns.push({...b.wallet_txns[0], id: 101});
  result = findAccountingCandidates(b);
  assert(result.wallets.every(w => w.state === 'ambiguous'));
  assert.deepEqual(result.payments[0].wallet_indexes, [0, 1]);
});

test('split payments are not summed or netted into the bank amount', () => {
  const i = fixture(); i.deals[0].payments[0].amount = 15;
  i.deals[0].payments.push({...i.deals[0].payments[0], id: 301, amount: 16});
  const result = findAccountingCandidates(i);
  assert.equal(result.wallets[0].state, 'no_candidate');
  assert(reasons(result).has('deal_multiple_payment_rows'));
  assert.equal(result.summary.full_completion_credit, 0);
});

test('partial registration, registration waiting and ignored records are distinct from unpaid claims', () => {
  const partial = fixture(); partial.wallet_txns[0].status = 4; partial.wallet_txns[0].due_amount = 5;
  const result = findAccountingCandidates(partial);
  assert.equal(result.wallets[0].state, 'partial_registration');
  assert.equal(result.wallets[0].candidates.length, 1);
  assert(reasons(result).has('wallet_partially_registered'));
  const waiting = fixture(); waiting.wallet_txns[0].status = 1; waiting.wallet_txns[0].due_amount = 31;
  assert(reasons(findAccountingCandidates(waiting)).has('wallet_registration_waiting'));
  for (const status of [3, 6]) {
    const i = fixture(); i.wallet_txns[0].status = status;
    assert.equal(one(i).state, 'unusable');
  }
  assert(!JSON.stringify(result).includes('unpaid'));
});

test('renews and missing payments retain evidence gaps rather than treating the deal as completed or unpaid', () => {
  const i = fixture(); i.deals[0].renews = [{id: 500, details: []}];
  const result = findAccountingCandidates(i);
  assert.equal(result.wallets[0].state, 'unique_candidate');
  assert(reasons(result).has('deal_renewal_payments_not_projected'));
  assert.equal(result.summary.coverage, 'incomplete_or_unknown');
  delete i.deals[0].payments;
  assert(reasons(findAccountingCandidates(i)).has('deal_payments_absent'));
  assert.equal(one(i).state, 'no_candidate');
});

test('invalid deals with empty payments remain visible by row and fixed reasons, even without any wallet or journal rows', () => {
  for (const [mutate, gap] of [
    [d => {d.company_id = 8;}, 'deal_subject_mismatch'],
    [d => {d.id = 'invalid';}, 'deal_id_invalid'],
    [d => {d.type = 'invalid';}, 'deal_direction_invalid'],
    [d => {d.renews = 'invalid';}, 'deal_renewals_invalid'],
  ]) {
    const i = fixture(); i.wallet_txns = []; i.journal_rows = []; i.deals[0].payments = []; mutate(i.deals[0]);
    const result = findAccountingCandidates(i);
    assert.equal(result.summary.coverage, 'incomplete_or_unknown');
    assert.equal(result.summary.counts.deal_rows, 1);
    assert.equal(result.summary.counts.unusable_deal_rows, 1);
    assert.equal(result.deals[0].state, 'unusable');
    assert.deepEqual(result.deals[0].payment_indexes, []);
    assert(reasons(result).has(gap));
    assert(result.deals[0].reasons.includes(gap));
  }
  const valid = fixture(); valid.deals[0].payments = [];
  const result = findAccountingCandidates(valid);
  assert.equal(result.deals[0].state, 'no_payment_rows');
  assert(reasons(result).has('deal_payment_rows_empty'));
  assert.equal(result.summary.full_completion_credit, 0);
});

test('payment IDs are snapshot identity only, with no continuity claim or values in the result', () => {
  const a = fixture(), b = fixture(); b.deals[0].payments[0].id = 999;
  assert.deepEqual(findAccountingCandidates(a), findAccountingCandidates(b));
  const duplicate = fixture(); duplicate.deals[0].payments.push(clone(duplicate.deals[0].payments[0]));
  const result = findAccountingCandidates(duplicate);
  assert.equal(result.wallets[0].state, 'no_candidate');
  assert(result.payments.every(p => p.state === 'unusable'));
  assert(reasons(result).has('duplicate_payment_id'));
});

test('duplicate wallet and deal IDs cannot produce candidate matches, including a duplicate without payments', () => {
  const a = fixture(); a.wallet_txns.push(clone(a.wallet_txns[0]));
  assert(findAccountingCandidates(a).wallets.every(w => w.state === 'unusable'));
  const b = fixture(); b.deals.push({id: 200, company_id: 7, type: 'expense'});
  const result = findAccountingCandidates(b);
  assert.equal(result.wallets[0].state, 'no_candidate');
  assert(reasons(result).has('duplicate_deal_id'));
});

test('comparison requires explicit currency and unit, with no JPY inference from missing API fields', () => {
  for (const mutate of [
    i => {delete i.context.comparison;},
    i => {i.context.comparison.confirmed = false;},
    i => {delete i.context.comparison.currency;},
    i => {i.context.comparison.currency = 'USD';},
    i => {i.context.comparison.unit = 'cents';},
  ]) {
    const i = fixture(); mutate(i); const result = findAccountingCandidates(i);
    assert.equal(result.summary.state, 'input_unusable');
    assert.equal(result.wallets[0].state, 'unusable');
    assert.deepEqual(result.wallets[0].candidates, []);
    assert(reasons(result).has('comparison_unconfirmed'));
  }
});

test('subject assertions and source scope are mandatory; per-record subject mismatch suppresses association', () => {
  for (const mutate of [
    i => {i.context.same_subject_confirmed = false;},
    i => {i.context.sources.deals.company_id = 8;},
    i => {delete i.context.sources.journal.company_id;},
  ]) {
    const i = fixture(); mutate(i);
    assert.equal(findAccountingCandidates(i).summary.state, 'input_unusable');
  }
  const wallet = fixture(); wallet.wallet_txns[0].company_id = 8;
  assert.equal(one(wallet).state, 'unusable');
  const deal = fixture(); deal.deals[0].company_id = 8;
  const result = findAccountingCandidates(deal);
  assert.equal(result.wallets[0].state, 'no_candidate');
  assert.equal(result.payments[0].journal.state, 'not_projected');
});

test('strict dates and typed safe integers reject impossible dates, floating amounts and int64 rounding', () => {
  for (const mutate of [
    i => {i.wallet_txns[0].date = '2030-06-31';},
    i => {i.wallet_txns[0].date = '2030-6-09';},
    i => {i.wallet_txns[0].amount = '31';},
    i => {i.wallet_txns[0].amount = 31.2;},
    i => {i.wallet_txns[0].amount = -31;},
    i => {i.wallet_txns[0].id = Number.MAX_SAFE_INTEGER + 1;},
    i => {i.wallet_txns[0].walletable_id = '11';},
    i => {i.wallet_txns[0].due_amount = 1;},
  ]) {
    const i = fixture(); mutate(i); assert.equal(one(i).state, 'unusable');
  }
  for (const mutate of [
    i => {i.deals[0].payments[0].amount = '31';},
    i => {i.deals[0].payments[0].date = '2030-02-29';},
    i => {i.deals[0].payments[0].from_walletable_type = 'private_account_item';},
    i => {i.deals[0].payments[0].id = '300';},
  ]) {
    const i = fixture(); mutate(i); assert.equal(one(i).state, 'no_candidate');
  }
});

test('only a complete calendar month or inclusive 28-day window is admitted', () => {
  const valid = fixture(); valid.context.window = {kind: 'rolling_28_days', from: '2030-06-01', through: '2030-06-28'};
  assert.equal(one(valid).state, 'unique_candidate');
  for (const window of [
    {kind: 'calendar_month', from: '2030-06-02', through: '2030-06-30'},
    {kind: 'calendar_month', from: '2030-06-01', through: '2030-06-29'},
    {kind: 'rolling_28_days', from: '2030-06-01', through: '2030-06-29'},
    {kind: 'rolling_28_days', from: '2030-06-30', through: '2030-06-01'},
    {kind: 'calendar_month', from: '2030-02-01', through: '2030-02-29'},
  ]) {
    const i = fixture(); i.context.window = window;
    assert.equal(findAccountingCandidates(i).summary.state, 'input_unusable');
  }
});

test('partial pages, stale sync, shortened source period and unknown range remain explicit', () => {
  for (const [source, field, value, gap] of [
    ['wallet_txns', 'all_pages_read', false, 'wallet_txns_pagination_unconfirmed'],
    ['deals', 'sync_current', false, 'deals_sync_unconfirmed'],
    ['journal', 'from', '2030-06-08', 'journal_period_incomplete'],
    ['deals', 'range_complete', null, 'deals_range_unconfirmed'],
    ['deals', 'payment_scope_confirmed', false, 'deals_payment_scope_unconfirmed'],
    ['journal', 'deal_reference_scope_confirmed', false, 'journal_deal_scope_unconfirmed'],
  ]) {
    const i = fixture(); i.context.sources[source][field] = value;
    const result = findAccountingCandidates(i);
    assert.equal(result.wallets[0].state, 'unique_candidate');
    assert.equal(result.summary.coverage, 'incomplete_or_unknown');
    assert(reasons(result).has(gap));
    assert.equal(result.summary.full_completion_credit, 0);
  }
});

test('prior issue deals and earlier journals can be searched if their source scope is explicitly supplied', () => {
  const i = fixture(); i.deals[0].issue_date = '2030-05-10';
  i.context.sources.journal.from = '2030-05-01';
  i.journal_rows.forEach(j => {j['取引日'] = '2030/05/10';});
  assert.equal(one(i).candidates[0].journal.state, 'linked_by_deal_id');
  const outside = fixture(); outside.wallet_txns[0].date = '2030-05-31';
  assert.equal(one(outside).state, 'unusable');
  const p = fixture(); p.deals[0].payments[0].date = '2030-07-01';
  assert.equal(findAccountingCandidates(p).payments[0].state, 'outside_window');
});

test('missing, duplicated or contradictory journal lines cannot be presented as a complete direct reference', () => {
  for (const mutate of [
    i => {i.journal_rows.pop();},
    i => {i.journal_rows[1]['仕訳行番号'] = '1';},
    i => {i.journal_rows[1]['仕訳行数'] = '3';},
    i => {i.journal_rows[1]['取引ID'] = '201';},
    i => {i.journal_rows[1]['取引日'] = '2030/06/10';},
    i => {i.journal_rows[1]['仕訳行番号'] = 2;},
    i => {delete i.journal_rows[1]['仕訳ID'];},
  ]) {
    const i = fixture(); mutate(i); const result = findAccountingCandidates(i);
    assert.equal(result.wallets[0].state, 'unique_candidate');
    assert.equal(result.wallets[0].candidates[0].journal.state, 'incomplete_or_invalid');
    assert.equal(result.summary.full_completion_credit, 0);
  }
});

test('multiple complete journals for one deal are preserved rather than forced into a one-to-one mapping', () => {
  const i = fixture();
  i.journal_rows.push({...i.journal_rows[0], '仕訳ID': '401', '仕訳行番号': '1', '仕訳行数': '1'});
  assert.deepEqual(one(i).candidates[0].journal, {state: 'linked_by_deal_id', row_indexes: [0, 1, 2]});
});

test('transfer/manual journal IDs, management numbers and internal numbers are never guessed to be deal IDs', () => {
  for (const foreign of ['口座振替ID', '振替伝票ID']) {
    const i = fixture(); i.journal_rows.forEach(j => {j['取引ID'] = ''; j[foreign] = '200'; j['管理番号'] = '200'; j['仕訳番号'] = '200';});
    const result = findAccountingCandidates(i);
    assert.equal(result.journals[0].state, 'other_journal_kind');
    assert.equal(result.wallets[0].candidates[0].journal.state, 'not_observed');
  }
  const conflicting = fixture(); conflicting.journal_rows[0]['口座振替ID'] = '200';
  assert.equal(one(conflicting).candidates[0].journal.state, 'incomplete_or_invalid');
});

test('unconfirmed CSV format and renamed/malformed header cells fail closed without positional inference', () => {
  const old = fixture(); old.context.sources.journal.format = 'generic';
  assert.equal(one(old).candidates[0].journal.state, 'incomplete_or_invalid');
  const renamed = fixture(); renamed.journal_rows.forEach(j => {j.renamed_id = j['取引ID']; delete j['取引ID'];});
  assert.equal(one(renamed).candidates[0].journal.state, 'not_observed');
  const large = fixture(); large.journal_rows[0]['仕訳ID'] = '9223372036854775808';
  assert.equal(one(large).candidates[0].journal.state, 'incomplete_or_invalid');
});

test('all arbitrary fields and source values stay inside input, with index-only correspondence output', () => {
  const marker = 'SYNTHETIC_CONTENT_MUST_NOT_RETURN';
  const i = fixture();
  i.context.private_original = marker; i.context.sources.wallet_txns.account_name = marker;
  i.wallet_txns[0].description = marker; i.wallet_txns[0].balance = marker;
  i.deals[0].partner_name = marker; i.deals[0].receipts = [{original: marker}];
  i.deals[0].payments[0].tag_ids = [marker];
  i.journal_rows[0]['借方備考'] = marker; i.journal_rows[0]['ファイル番号'] = marker;
  const result = findAccountingCandidates(i), text = JSON.stringify(result);
  for (const forbidden of [marker, '2030', 'bank_account', 'company_id', 'walletable_id', 'amount', 'description']) {
    // Fixed reason names can contain "amount" in invalid cases; this valid report contains no such reasons.
    assert(!text.includes(forbidden));
  }
  assert.deepEqual(Object.keys(result.wallets[0].candidates[0]), ['deal_index', 'payment_index', 'journal']);
  assert.deepEqual(Object.keys(result.summary), ['state', 'full_completion_credit', 'coverage', 'counts', 'reason_counts', 'gaps']);
  assert(!Object.keys(result).some(key => /projection|source|raw/.test(key)));
});

test('malformed required values do not echo free text or error payloads', () => {
  const marker = 'SYNTHETIC_MALFORMED_PRIVATE_CONTENT';
  const i = fixture(); i.wallet_txns[0].date = marker; i.deals[0].payments[0].amount = marker;
  i.journal_rows[0]['取引ID'] = marker; i.context.sources.deals.from = marker;
  const result = findAccountingCandidates(i);
  assert(!JSON.stringify(result).includes(marker));
  assert(reasons(result).has('wallet_date_invalid'));
  assert(reasons(result).has('payment_amount_invalid'));
  assert(reasons(result).has('journal_reference_invalid'));
  assert.equal(result.summary.full_completion_credit, 0);
});

test('source input is never mutated, including frozen nested records, and missing input does not count as success', () => {
  const i = fixture(), before = clone(i);
  const freeze = value => {if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);} return value;};
  freeze(i); findAccountingCandidates(i); assert.deepEqual(i, before);
  for (const malformed of [undefined, null, 'SYNTHETIC', {}, {context: i.context}]) {
    const result = findAccountingCandidates(malformed);
    assert.equal(result.summary.full_completion_credit, 0);
    assert.equal(result.summary.counts.unique_candidate, 0);
    assert.equal(result.summary.coverage, 'incomplete_or_unknown');
  }
});
