# Release gate tests after activation

The self-tests previously required production policy to be disabled and release history to be empty. Those assumptions would turn a valid activation or first receipt into a failing code check. Disabled-policy decisions now use explicit disabled fixtures; the real ledger still undergoes schema validation, and a recorded-history fixture is valid.

Only self-test scenarios changed. Submission/release decisions, material freshness and required evidence are unchanged. The public fingerprint and iOS mirror were updated after reviewing that diff. Operational enabled/dry_run/enforce values are preserved.

Validation:47 decision scenarios and22 material scenarios pass on the actual current ledger and on an isolated copied ledger with enabled=true, dry_run=false and one release record. The test runner checks that scenarios actually ran, not merely process exit0. This is an activation prerequisite, not an autonomous submission or execution-rate increment.
