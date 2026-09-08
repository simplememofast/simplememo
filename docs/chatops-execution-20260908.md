# Verified ChatOps release execution

On 2026-09-08 Codex used the owner's standing authorization to start the real 5.8.52 TestFlight distribution through issue35. The command was posted once; no separate dispatch or duplicate release was used.

- [Command comment5578707772](https://github.com/simplememofast/simplememo-ios/issues/35#issuecomment-5578707772): `SIMPLEMEMO_RELEASE 5.8.52 TESTFLIGHT`, 03:34:13 UTC.
- [Successful workflow34183973142](https://github.com/simplememofast/simplememo-ios/actions/runs/34183973142).
- Immutable `v5.8.52`: `4d87e9d10b5a0f90f6fba567bb84aa16cddda926`, containing reviewed app PR436 and readback PR439. Exact source CI was successful before the command.
- Cloud run `7fb1645d-87c2-4d77-83a5-5d1a172f5dc9`, build1275, SUCCEEDED. Watch build and iOS archive passed.
- ASC build `54a1089e-c600-4c14-8a41-1f0d24257865`: VALID, matching the version and successful Cloud run.
- Private artifact `testflight-receipt-v5.8.52` (artifact10040107087) confirms group membership by ASC GET at03:47:55 UTC. A separate local GET confirmed membership and IN_BETA_TESTING after completion. The artifact contains no tester identities or credentials.

PR434 replaced the obsolete version pin with strict command parsing, while retaining repository/issue/author checks and the existing source, version, CI and App Store scope validation. PR439 requires successful group readback after attachment. A comment author's account name is not evidence of a human approval; this run was posted by the AI session under explicit standing delegation.

This transfers only the existing ChatOps release-start task to `ai_executes_gated`. It does not prove App Review submission/publication, physical device QA, billing recovery or product outcome. The earlier dry run and the already distributed 5.8.51 are not additional executions credited here. Workflow and artifact links require repository access.
