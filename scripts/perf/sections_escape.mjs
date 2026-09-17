import assert from 'node:assert/strict';
// Browser-computed states, not a textual approximation of CSS specificity.
export function assertSectionStates(rows, expected, label) {
  assert(['auto','visible'].includes(expected), 'Unknown section state');
  assert(Array.isArray(rows) && rows.length > 0, label + ': no sections checked');
  for (const row of rows) {
    assert(row && typeof row === 'object', label + ': invalid section snapshot');
    assert.equal(row.visibility, expected, label + ': section must compute ' + expected);
  }
}
