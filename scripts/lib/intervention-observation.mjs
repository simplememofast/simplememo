// Recorded fields only. An empty array is a recorded zero, not proof that all
// human activity was observed or that the run had a native scheduled origin.
export const INTERVENTION_KINDS = ['artifact', 'infra', 'substitute', 'bootstrap', 'request'];

const validEvent = event => event !== null && typeof event === 'object' && !Array.isArray(event)
  && INTERVENTION_KINDS.includes(event.kind)
  && (event.note === undefined || typeof event.note === 'string');

export function interventionObservation(row) {
  const value = row?.interventions;
  const unknown = (reason, events = [], invalidEntries = 0) => ({
    state: 'unknown', reason, events, invalid_entries: invalidEntries,
  });
  if (value === undefined) return unknown('field_missing');
  if (value === null) return unknown('not_observed');
  if (!Array.isArray(value)) return unknown('invalid_type');
  const events = value.filter(validEvent);
  if (events.length !== value.length) return unknown('invalid_event', events, value.length - events.length);
  return { state: events.length ? 'recorded_positive' : 'recorded_zero', reason: null, events, invalid_entries: 0 };
}

export function interventionSummary(rows) {
  const observations = rows.map(interventionObservation);
  const unknown = observations.filter(o => o.state === 'unknown');
  return {
    scope: 'recorded_intervention_fields; not complete human-activity or native-origin proof',
    total_runs: rows.length,
    recorded_zero_runs: observations.filter(o => o.state === 'recorded_zero').length,
    recorded_positive_runs: observations.filter(o => o.state === 'recorded_positive').length,
    unknown_runs: unknown.length,
    unknown_by_reason: Object.fromEntries([...new Set(unknown.map(o => o.reason))]
      .map(reason => [reason, unknown.filter(o => o.reason === reason).length])),
    recorded_event_count: observations.reduce((n, o) => n + o.events.length, 0),
    complete_recorded_fields: unknown.length === 0,
    actual_zero_touch_proven: null,
  };
}

export function parseInterventionsJson(value) {
  if (value === null || value === undefined) return null;
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new Error('--interventions-json must be a JSON array'); }
  if (interventionObservation({ interventions: parsed }).state === 'unknown') {
    throw new Error('--interventions-json requires an explicit array of recorded intervention events (or [] for recorded zero)');
  }
  return parsed;
}
