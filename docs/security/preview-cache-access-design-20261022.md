# Preview cache verification: inactive local preparation

Status: local preparation only, 2026-10-22. No Access policy, token, GitHub
secret, Environment, workflow, CI run, or deployed site is changed by these
helpers. No real credential has been supplied to them. The existing cache check
still fails at Access and remains a release blocker.

## Evidence and scope

- Reviewed Web candidate: `69d7caabb73ba647a1961ef5d6fc8964141c08e1`, Draft PR
  [#2139](https://github.com/simplememofast/simplememo/pull/2139).
- Existing [cache run 39729896734](https://github.com/simplememofast/simplememo/actions/runs/39729896734)
  passed its 26 local regressions, then failed because
  `https://ded62be5.simplememo-596.pages.dev/` led to the Access login page.
  An HTTP 200 login response is not a successful cache measurement.
- The parent session's authorized, read-only browser inspection found the Access
  app `simplememo - Cloudflare Pages`, matching
  `*.simplememo-596.pages.dev` without a path restriction. Its only policy was
  `Allow Members - Cloudflare Pages`: Allow, one email Include, no Require or
  Exclude. No Service Auth policy was associated. The service-token inventory
  and GitHub secret settings were not inspected in that session.
- The separate `Block retired simplememo admin` app must retain its everyone
  Block policy. The new client never requests `/admin` or an API path.
- Prior GitHub secret-name lookup and artifact download returned Forbidden.
  These are not retried or accessed through another path in this preparation.

## Why credentials cannot be added to the current PR job

`.github/workflows/home-perf-cache.yml` executes the PR head's code. Repository
secrets plus an `if` checking the actor or PR author are insufficient: a
same-repository PR can modify the workflow and the credential-consuming script.
Fork filtering alone does not address that boundary. GitHub documents that PR
workflows use the PR merge revision and that executing untrusted code with
secrets is unsafe across privileged event types, including `workflow_run`.
[GitHub's security guidance](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target).

The prepared design uses trusted verifier code from `main`, a manually invoked
workflow, and a separately protected Environment restricted to `main` and owner
approval. The Environment's actual settings, not its name or a condition in YAML,
must enforce this restriction. No `pull_request_target` workflow is proposed.
[GitHub Environment protection](https://docs.github.com/actions/deployment/about-deployments/deploying-with-github-actions).

## Prepared boundaries

1. **Authorization data gate — `scripts/perf/cache_access_gate.cjs`.** Accepts
   only the designated `main` manual workflow in `simplememofast/simplememo`,
   first attempt, and the owner as actor and triggering actor. Trusted workflow,
   checkout, and dispatch SHAs must agree. A separately reviewed policy must
   approve PR 2139's exact head SHA and an unexpired deadline. The fetched PR must
   still be open, originate in this repository, target `main`, and match that
   reviewed SHA. A manually entered SHA alone is not approval.
2. **Deployment and manifest binding.** The check's independently verified
   Cloudflare App ID/slug, head SHA, successful conclusion, dashboard account,
   project, deployment UUID, and single immutable preview URL must agree. The
   provider ID is not learned from the check being validated. The reviewed
   manifest is bounded JSON data with a separately pinned SHA256, exact schema,
   content-hashed AVIF/WOFF2 paths, byte/count limits, and the approved head SHA.
   It is never imported as code or installed as a dependency. Missing policy,
   provider identity, or expiry fails closed; no production defaults exist.
3. **Credential transport — `scripts/perf/cache_access_http.cjs`.** A dedicated
   Node HTTPS client sends credentials only to the exact approved eight-hex
   preview origin and canonical allowlisted paths, with GET/HEAD only. It does
   not execute candidate HTML/JavaScript or start a browser/child process.
   Redirects, alternative origins, query strings, encoded paths and write
   methods are rejected. Requests have byte/time/count bounds, standard TLS
   validation, no retry, and no Cookie jar. No credentials are read from the
   environment by this library. Tests inject a loopback transport; there is no
   production option to disable TLS checks or permit localhost. Requests ask for
   the identity representation so existing hashes describe the original asset
   bytes; unsupported content encoding is a failure. Debug logging, preloads and
   active inspectors must be disabled before starting the trusted Node process,
   and the library rejects a detected unsafe runtime.
4. **Response contract — `scripts/perf/cache_access_contract.cjs`.** Preserve
   all existing hash/byte/status, single Cache-Control, MIME, CORS, nosniff,
   ETag, mutable/error, and conditional GET/HEAD 304 checks. Raw headers and
   response bodies are internal only. The returned proof uses fixed identifiers,
   numeric observations and comparison results; it contains no raw ETag, CSP,
   error message, URL, response body, or credentials. A failed or incomplete
   comparison cannot produce `verified: true`.

These modules are inactive libraries. They do not establish real Environment
protection, authenticate to GitHub, fetch an artifact, validate an actual token's
expiry, publish a check, or satisfy the failed existing CI run. A future caller
must obtain API/context inputs from trusted sources, verify expiry before each
credential-bearing run, and keep response objects private. The helper's injected
request function is trusted code, never a candidate/dispatch input.

This HTTP check proves response contracts, not browser rendering, browser-cache
reuse or CDN hit rate. Existing rendering and performance checks remain required.
An Access cookie in a raw response is recorded only as a presence boolean and is
never stored or replayed. Cloudflare's strict-service-token setting changes
whether successful authentication issues such a cookie; the setting has not
been read or changed here, and cookie presence alone is not hidden or treated as
proof of an authentication failure.
[Cloudflare strict service-token behavior](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/#strict-service-token-authentication).

## Remaining security decisions before activation

- Proposed encrypted Environment secret names are
  `CF_ACCESS_PREVIEW_CLIENT_ID` and `CF_ACCESS_PREVIEW_CLIENT_SECRET`. They map to
  Cloudflare's `CF-Access-Client-Id` and `CF-Access-Client-Secret` request headers.
  Values must never be put in a PR, command argument, report or chat. A 7-day
  service token is currently only a proposal, not an existing credential.
  [Cloudflare service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/).
- Adding Service Auth to the existing wildcard app grants access within that
  app's scope. A one-host allowlist in this client does **not** narrow the token's
  server-enforced privileges. Expiry limits duration, not host scope. The owner
  must approve the actual Access scope; a more narrowly scoped app/policy would
  be a separate security-setting change, not a silent alternative.
- Preview Functions/middleware are credential recipients. There is no verified
  guarantee here that Access strips both credential headers before origin code.
  The exact candidate's server code, build code and generated deployment must
  therefore receive owner review before probing. A trusted runner alone cannot
  make sending a credential to an arbitrary PR safe.
- The pending token/Service Auth/secret request does not implicitly authorize a
  new GitHub Environment, branch restrictions or required reviewer. Those
  settings need explicit authorization and readback. Do not put these credentials
  in repository-wide secrets as a fallback.
- Independently identify the official Cloudflare check's App ID/slug and confirm
  its dashboard URL format through an allowed read-only source before creating
  a trusted policy. Do not guess or turn off provider verification if it differs.
- Trusted workflow/helpers must first reach `main` through an ordinary reviewed
  bootstrap PR with all applicable checks passing. A manual workflow must exist
  on the default branch before dispatch. If an existing required check makes
  bootstrap circular, report that dependency; do not skip the check or merge the
  failing security candidate to obtain trusted code.
  [Manual workflow requirements](https://docs.github.com/actions/managing-workflow-runs/manually-running-a-workflow).
- The future connection between a trusted, exact-SHA proof and the existing cache
  check still needs implementation and review. Keep the original failed run
  visible. Do not replace it with an unrelated green check, change required-check
  rules, or grant check-write permission silently. No proof is valid for a
  subsequent candidate SHA or an expired approval.

## Verification record

Node `v24.22.1`, on the local preparation tree based on candidate
`69d7caabb73ba647a1961ef5d6fc8964141c08e1`:

```sh
node --test scripts/perf/cache_access*.test.cjs scripts/perf/cache_headers*.test.mjs
```

Result: **200 passed, 0 failed, 0 skipped**.

| Tests | Count | Coverage |
| --- | ---: | --- |
| Authorization gate | 16 | Fork/third-party PR, changed SHA, wrong workflow/ref/actor, rerun, expiry, provider spoofing, URL ambiguity and bounded inert manifest |
| HTTP transport | 28 | Two loopback origins, forbidden destination/path/method, redirects, Cookie non-replay, response/timeout/budget limits, ETag replay, header retention, credential reflection and diagnostic-runtime rejection |
| Response contract | 129 | Every original assertion, duplicate headers, mutation of each conditional GET/HEAD contract, malformed input, failed/incomplete response and safe receipts |
| Integration | 1 | All 33 actual assets (847,987 bytes total), existing asset middleware, gate, transport and full response contract; 43 loopback requests, including 6 conditionals |
| Existing cache regressions | 26 | Unmodified privacy, response policy, navigation and conditional-response tests |

JavaScript syntax checks and `git diff --check` also passed. Independent review
identified and corrected an ambiguous second deployment URL, Node's default raw
header-count truncation, and unsafe handling of malformed outer verifier input.
Each correction has a regression case. Final review also aligned the gate's
255-character asset-path bound with the contract and transport. Node test-worker inspector port metadata
is accepted only when it does not enable an inspector; active inspectors, debug
logging and preloads remain rejected.

Tests use synthetic credentials and local sockets only. No preview, Access
endpoint or GitHub endpoint is contacted. Production TLS handshakes, live Service
Auth, real Environment protection, credential setup and trusted-workflow/check
integration remain unverified. The existing failed CI check is unchanged.
