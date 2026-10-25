# PR2164 preview cache verification preparation

The owner explicitly approved reusing the existing preview credential for PR2164's final reviewed SHA and one immutable preview on2026-10-25. New tokens, secret registration, permission expansion and Access policy changes are outside that approval. The owner must still approve each particular Environment run; this approval is not delegated to an agent.

## Stage1 scope

The existing trusted-main producer, gate, context, workflow wrapper, proof verifier and consumer are bound to PR2164 instead of2139. Old2139 requests/proofs have explicit negative cases. No arbitrary PR input or broader allowlist is introduced. HTTP transport and response contract are unchanged: exact reviewed deployment/manifest, GET/HEAD paths,4MiB response/40MiB total/300request defaults, no redirects/cookie replay/admin/API requests, one-hour run deadline, current-main binding, latest-proof preference and explicit failure/cancel/skip rejection remain.

The ordinary candidate cache workflow and its approved-proof wiring test are intentionally excluded from this bootstrap. They will be updated on PR2164 only after trusted code is merged to main through all applicable ordinary checks. The pre-existing path filters leave this bootstrap outside the unauthenticated preview cache check; no trigger, gate or branch rule is altered to achieve that separation. Security regressions and PageSpeed still run.

Because scripts/perf changes trigger PageSpeed, this bootstrap also carries the already reviewed PR2164 PageSpeed fix: Brotli1.2.1, actual FontTools decoder assertions and the same verified official action commits. This avoids deliberately rerunning vulnerable Brotli1.2.0 while preparing the credential path. No asset output changes are included. The github-script annotated tag is likewise replaced with its already verified commit SHA in the producer.

## Fresh readback and remaining blocker

At2026-10-25T10:23:27Z, the GitHub API and current settings UI confirmed Environment preview-cache-ci ID25004037265, only main branch and no tags, one required reviewer simplememofast, prevent-self-review=false, admin bypass disabled, and the two existing Environment secret names CF_ACCESS_PREVIEW_CLIENT_ID and CF_ACCESS_PREVIEW_CLIENT_SECRET. Values were neither read nor displayed; no setting was changed.

Cloudflare opened its sign-in page. The existing token's current expiry/validity and Service Auth association have not yet been freshly inspected. The committed configuration therefore retains its old, expired2026-10-23T08:44:02Z deadline. This preparation does not enable a real credential request. Token readback and an independently justified short deadline must be recorded before this draft becomes an activation-ready bootstrap. An absent/invalid token stops work; it does not authorize replacement or policy changes.

## Validation and next stage

Local synthetic authorization/context/workflow/proof/consumer and unchanged candidate integration tests:251 passed. Loopback-only transport/integration tests:29 passed. No external authentication request was made. The producer wiring tests also passed after reusing the verified action commit. Both changed workflow documents parse, and git diff --check passes.

After fresh token readback and full ordinary bootstrap CI/review, merge the trusted preparation. Then integrate current main into PR2164, connect its two candidate-side proof files, review the final SHA/immutable preview/recipient code, and request the specific owner Environment approval. Only a valid successful exact-SHA proof may satisfy the existing cache check. Subsequent candidate or main movement invalidates the corresponding assumptions and requires re-evaluation. Do not merge PR2164 or claim deployment while that check remains failed.

Observed hosted runner2.338.0 still embeds Node24.21.0; provider rollout to2.338.1/24.22.1 remains unresolved. setup-node24.22.1 patches script execution, not that internal Action runtime.
