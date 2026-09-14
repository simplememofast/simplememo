import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ROOT } from './company-metrics.mjs';

const REPORT = 'data/ai-visibility-probe.json';
const VALIDATOR = 'scripts/codex-ai-visibility-probe.py';
const WARNING = 'Small fixed sample; different model series are not comparable and missing mentions do not identify a cause.';
// Import the original validator only. No collector, login, weekly reservation,
// model call or retry is invoked. Validate the exact retained bytes via stdin.
const BRIDGE = `import datetime as dt, importlib.util, json, sys
spec = importlib.util.spec_from_file_location('company_probe', sys.argv[1])
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
payload = json.load(sys.stdin)
try:
    probe.validate_report(json.loads(payload['report']), healthy=True,
                          at=dt.datetime.fromisoformat(payload['at'].replace('Z', '+00:00')))
except Exception:
    print('invalid')
else:
    print('verified')
`;

// Historical comparisons validate the original bytes at their observation time;
// selection still uses companyAio's current eight-day freshness gate below.
export function validateAioBytes(raw, { at, run = execFileSync } = {}) {
  const bytes = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
  const probe = JSON.parse(bytes);
  const result = run('python3', ['-B', '-c', BRIDGE, path.join(ROOT, VALIDATOR)], {
    input: JSON.stringify({ report: bytes, at: new Date(at).toISOString() }), encoding: 'utf8',
    timeout: 10000, maxBuffer: 65536, stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
  if (result !== 'verified') throw new Error('Original AIO report validation failed');
  return probe;
}

export function companyAio({ root = ROOT, now = new Date(), run = execFileSync } = {}) {
  let sha256 = null, checkedAt = null;
  const unavailable = reason => ({
    series: null, observed_at: null, status: 'unavailable', valid_questions: null,
    unaided_valid_questions: null, unaided_mention_rate: null, unaided_own_site_citation_rate: null,
    observations: [], warning: WARNING, failures: [reason],
    decision_input: { state: 'unavailable', actionable: false, reason, file: REPORT,
      sha256, validator: VALIDATOR, checked_at: checkedAt },
  });
  let bytes, probe;
  try {
    checkedAt = now.toISOString();
    const raw = fs.readFileSync(path.join(root, REPORT));
    sha256 = createHash('sha256').update(raw).digest('hex');
    // Match Python read_text/json.loads: reject invalid UTF-8 and retain a BOM
    // so it cannot silently become different, admissible JSON.
    bytes = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
    probe = JSON.parse(bytes);
  } catch { return unavailable('probe_read_or_json_failed'); }
  let result;
  try {
    result = run('python3', ['-B', '-c', BRIDGE, path.join(ROOT, VALIDATOR)], {
      input: JSON.stringify({ report: bytes, at: checkedAt }), encoding: 'utf8',
      timeout: 10000, maxBuffer: 65536, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch { return unavailable('probe_validator_unavailable'); }
  if (result !== 'verified') return unavailable('existing_probe_health_validation_failed');
  return {
    series: probe.series, observed_at: probe.observed_at, status: probe.status,
    valid_questions: probe.valid_questions, unaided_valid_questions: probe.unaided_valid_questions,
    unaided_mention_rate: probe.unaided_mention_rate, unaided_own_site_citation_rate: probe.unaided_own_site_citation_rate,
    observations: probe.observations.map(q => ({ question_id: q.question_id, question: q.question,
      status: q.status, mention: q.mention ?? null, own_site_citation: q.own_site_citation ?? null,
      cited_urls: q.cited_urls ?? [], transcript_sha256: q.transcript_sha256 ?? null })),
    warning: WARNING, failures: [],
    decision_input: { state: 'ready', actionable: true, file: REPORT, sha256,
      validator: VALIDATOR, checked_at: checkedAt },
  };
}
