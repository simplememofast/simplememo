# Private resource observations from existing native runs

The original Codex scheduler observer already opens the registered `obsidian`
and `obsidian-2` run transcripts read-only. Its public output remains unchanged:
no prompts, outputs, usage counters, costs or private paths enter
`data/routine-runs.json`.

The same observer now offers `--resource-report`. The existing Company daily
`collect` invokes it locally and stores the result under the private Company
state directory as `data/native-resource-usage.json` (0600). No new scheduler,
model request, paid query, credential or public cost ledger is introduced.
`autonomy-status` shows its aggregate coverage; existing private Daily/Weekly/
Monthly reviews include it. Counter changes alone do not create notifications.

Each row retains the original scheduled turn identity and termination state,
including failures. Only that original turn's token-count events are inspected;
later manual follow-ups cannot add to or replace its usage. Take the last valid
monotonic **cumulative** counters, never the sum of snapshots. The first snapshot
must establish a zero starting baseline by matching the initial per-response
counters. An inherited baseline, reset, invalid cumulative arithmetic, absent
source or missing sample remains unknown. Private schema v2 fingerprints the
entire original-turn prefix even when counters are absent or invalid. A legacy
private v1 observation may be upgraded without changing its original lifecycle
or previously observed counters; new producer reports must use v2.

Native context-compaction events can expose a later `last_token_usage` with only
`total_tokens` populated. That field is neither summed nor used after the initial
baseline. The independent `total_token_usage` counters still require consistent
arithmetic and monotonicity. Cached input and reasoning remain their reported
subtotals; they are not added to input/output again.

This measures host-reported counters **through the last observed sample**.
It does not establish complete model accounting, child-model coverage, billing,
API pricing, or actual invoice cost. Dollar costs and cost per shipped improvement
remain null. All original formal autonomy formulas and denominators are unchanged.
Unknown rows remain listed, and aggregate counters are explicitly limited to
observed rows. They are not a complete cost numerator when any source is unknown.

A changed closed original run, disappeared source, failed refresh or invalid
payload cannot overwrite retained evidence. The independent health record marks
that refresh unavailable. Open original turns can accumulate monotonic counters;
their later closure does not imply a successful business outcome. Evidence becomes
stale after 36 hours without refresh. A 256-run/64-MiB-per-transcript boundary fails
explicitly rather than sampling the registered population.
The private path reads at most the byte limit plus one before parsing; the
existing public observer's read and output behavior remain unchanged.

Validation uses synthetic lifecycle/usage fixtures plus read-only real registered
run logs. Confirm that the public ledger is byte-identical before and after the
private collection. Do not publish private usage values in PR bodies or static
assets. Revert the code through the usual reviewed deployment route if necessary;
retain private observations and original failure history. The original daily
collector remains the owner of subsequent refreshes.
