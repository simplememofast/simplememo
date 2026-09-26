# One scheduled-run recovery from the September 20 repair-limit stop

This procedure is **inactive**. The original September 20 `actions` run remains
`attempted: true / no_artifact`, and the three repair attempts and limit remain
unchanged. The merged bounded-support fix is PR #1506, but no later natural run
has proved that the business path now succeeds. A code merge alone is not that
proof.

The ordinary `--contain --dry-run` result is still a stop. A reviewed permit at
`data/actions-recovery-permit.json` can admit **one scheduled workflow run
number, first attempt, on one JST date between 07:20 and 09:30**. It applies
only to `Obsidian Autopilot` on `main` in this repository and only to the
unchanged September 20 `no_artifact` row. Another escalated failure, a changed
repair limit, a missing PR #1506 merge ancestor or failing bounded-support
regression test, an explicit emergency stop,
a manual dispatch, a rerun, a different workflow run number, or an expired
window keeps the route stopped. `--contain` without `--dry-run` always retains
its existing ability to trip the stop.

## Human activation, after reviewing the complete draft

1. Re-read the original run result and row, the three historical repairs, PR
   #1506 and its current tests, the latest main SHA, the explicit emergency
   stop, and today's primary run. Confirm that an `actions` fallback is still
   needed. Do not count PR #1504's observation publication as a business
   treatment.
2. Review the recovery code and its negative tests as a draft PR. Record the
   actual GitHub review URL and time. **These two fields are audit hints, not a
   technical proof of a human decision.** The current GitHub account is also
   used by automation, and this repository has no branch review protection;
   neither CI nor the auto-merge workflow distinguishes the person from AI.
   Do not treat a syntactically valid URL, green CI, or a ready PR as approval.
3. By the evening before the chosen 07:30 JST slot, determine the next
   `Obsidian Autopilot` `GITHUB_RUN_NUMBER` from GitHub's actual workflow run
   history. Copy the template to `data/actions-recovery-permit.json`, set
   `status` to `active`, and fill the chosen JST date, exact run number,
   review URL and time. Classify the new file in
   `data/publication-policy.json` as not served by the site and regenerate its
   middleware block with `node scripts/check-publication.mjs --write`; the
   repository itself is public, so review every field before adding it. Leave
   enough time for review, CI and merge. If another
   workflow run takes that number first, the permit fails closed; never edit
   the number after a run starts to chase it.
4. Keep that activation PR draft while reviewing the exact file and original
   guard conditions. **Activation still needs an independently witnessed human
   decision**; this repository currently cannot enforce one in CI. Until that
   control exists and the person actually takes the final action, do not mark
   the activation PR ready or merge it. Do not use `force`, alter the three-repair
   limit, reclassify the historical row, or bypass the shared claim, budget,
   experiment, publication, and identity checks. Never use `owner-session` as
   an alias for this stopped `actions` path.
5. Observe the actual scheduled run, its gate result, one claimed candidate,
   target-SHA CI, merge, production delivery, and app-acquisition measurement.
   A failed or missed slot does not license a retry. A successful process alone
   does not resolve the original `no_artifact`; the original owner must judge
   repair evidence separately. The permit expires after the fixed slot.

The human reviewer owns the decision to activate this stop exception. The
draft code and inactive template never activate it. [GitHub's variable
reference](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)
defines `GITHUB_RUN_NUMBER` as unique per workflow run and
`GITHUB_RUN_ATTEMPT` as increasing on reruns.
