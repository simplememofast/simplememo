# Human blockers and source limits

Updated 2026-09-13. These do not suspend independent implementation or available-source operation.

| Scope blocked | Evidence / reason | Minimum human action | Permission | Work unlocked |
|---|---|---|---|---|
| Complete current ChatGPT Tasks inventory | Available in-app browser is signed out. Historical email proves a Reddit task was paused, not the current full account inventory | Make the existing authenticated ChatGPT Tasks session accessible | Read existing task settings/history | Verify remaining ChatGPT report owners and overlap; no new posting authority |
| GCP Cloud Scheduler / BigQuery Scheduled Queries control-plane inventory | No local authenticated GCP browser/CLI session; existing CI BigQuery credential works for fixed aggregate reads | Provide existing read-only scheduler/transfer-config access or expose the authenticated console | Scheduler/transfer metadata read only | Complete remote scheduler inventory and rule out undiscovered duplicates |

Other limits currently need investigation or observation, not a new user permission:

- Documented native `simplememo-ai` weekly visibility reservation and `simplememo` funnel owner were absent from the inspected local scheduler records. A rendered automation card alone does not prove persistence. Resolve current native ownership before adding either reservation.
- ASC Analytics is partial and crash reports are `not_received`. Provider absence is not zero crashes or zero traffic. Existing scheduled collectors remain canonical.
- Apple Search Ads has no discovered existing configured connection. The user restricted this integration to existing usage, so do not provision it.
- The worker `vfu_regular` has recurring counted errors, while `last_error` is null. A current 24-hour aggregate confirms the counter but not the root cause. Investigate the existing dispatch/suppression/token path; do not replay customer sends or broadly change credentials.
- Existing Obsidian recovery verification requires its next natural scheduled run. An installation Goal/manual run is not a substitute for that other task's acceptance condition.
- Historical manual decisions, verification and reporting are not all separately instrumented. Keep unknown values null; do not infer H0 from a successful process or an empty legacy interventions array.

Private per-source evidence and any later blockers belong in `~/.config/simplememo/company-os/`. Public documentation must never contain credentials or raw customer/account records.
