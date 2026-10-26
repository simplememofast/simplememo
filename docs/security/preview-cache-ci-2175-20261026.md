# Fixed PR2175 cache-verification preparation

This preparation transfers the client-side authorization target from PR2164 to **PR2175 only**. It does not activate arbitrary PR input or a multi-PR allowlist. PR2164 and its original branch/history remain preserved. PR2175 is a new integration of source head `f0981974cee2ee40d09a06cbe91a3a0851fa29bd`, with the original attribution and identity mismatch recorded in its integration commit.

The owner approved this new-PR handoff and the transfer to that actual new PR at **2026-10-26T04:44:16Z**. The existing overall deadline remains **2026-10-26T10:00:00Z**. Each credential-bearing run still requires the owner's GitHub Environment approval, binds one final reviewed head to one immutable preview, and expires at the earlier of one hour after run creation or that overall deadline. No previous PR2164 approval or proof is acceptance evidence for PR2175.

## Unchanged security boundary

The trusted producer and validators are loaded from the current immutable main SHA. The candidate supplies no credentials or trusted implementation. Existing Environment `preview-cache-ci` remains main-only with the existing owner reviewer, and the existing secret references remain unchanged. No new token, secret, access grant, Access policy, token lifetime, protection change or billing operation is part of this preparation.

Authenticated requests remain GET/HEAD only, for `/`, `/en/`, the manifest, the enumerated AVIF/WOFF2 assets and the fixed missing-asset negative control. The transport retains the no-redirect/no-cookie-replay restrictions and the existing 4MiB response, 40MiB total and 300-request limits. Admin/API paths remain outside the target.

At **2026-10-26T04:49:31Z**, a fresh GitHub metadata read confirmed the same Environment ID, exactly the main branch policy, the same owner reviewer, prevent-self-review=false, and the same two existing secret names and October22 update timestamps. No values were read. Admin bypass disabled remains the previously recorded settings readback; this REST response did not expose a new bypass field. The configuration's complete earlier `observedAt=2026-10-26T00:22:15Z` and `authorizationNotAfter=2026-10-26T10:00:00Z` are therefore preserved rather than relabelled as a complete new settings observation.

The old exact-target run40266754654 successfully authenticated and verified PR2164 on October26 after actual owner approval. This is historical evidence that the existing credential path worked at that time, not proof of PR2175, future validity or secret-value equality. Its trusted main later changed, so it is no longer a valid release proof. The token's dashboard expiry still has an unconfirmed display timezone; no exact UTC token expiry is newly claimed.

## Implementation and validation boundary

The producer and five trusted helper modules are fixed to PR2175. Related tests must accept that one target and reject old2164, retaining the existing wrong-PR, context, source, expiry, reviewer, deployment and manifest negative cases. The pure HTTP and response-contract limits remain unchanged.

Because these perf-script changes trigger normal PageSpeed CI, this preparation also incorporates the already reviewed six-file measurement runtime repair from71af2116, via the preserved integration source `db1ffa41588c9ae2d6f22ec6270475b8d135396a`. The only source normalization is removal of a trailing blank line. Runtime SHA256: `6a13234a2e67100d18839c1fe3d48d874ba5e77ed4a4c93fd3c1b790e1775e66`. The ordinary twelve samples, four audit categories, tool versions and existing budgets remain in force. Page/asset/receiver output is not changed by these six files. This does not claim that every historical performance fluctuation has the same cause.

The candidate-side `home-perf-cache.yml` and `cache_headers_approved.test.mjs` remain on main's existing binding in this bootstrap. They are connected to2175 only after this preparation passes normal CI/review and is merged into main. The final candidate must then incorporate current main, pass its own identity and normal CI checks, and resolve a fresh final-head preview/manifest. Only then may the exact-target producer run be created and presented for the owner's run-specific Environment approval.

Fresh successful proof must match PR2175's final head, manifest digest, deployment, current main and deadline before candidate cache acceptance and normal merge. Candidate/main movement or expiry requires re-evaluation; no automatic repeated dispatch or green-result selection is authorized. Token/Environment-secret cleanup remains the owner's separately recorded responsibility; this preparation does not delete them.

Local preparation validation: all308cache regressions passed with zero skips, including the newly explicit old2164 proof rejection cases. Focused authorization/runtime tests138/138 passed. The credential scope/revocation inventory and its five self-tests passed; both changed workflows parsed successfully and the whitespace check passed. These are local synthetic/loopback results, not new authenticated preview results or remote CI acceptance. Candidate-side wiring is still intentionally unchanged in this bootstrap.
