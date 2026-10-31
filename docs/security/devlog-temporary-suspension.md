# Devlog temporary suspension

The owner approved this temporary suspension on 2026-10-31. It affects Devlog
article generation, publication and public-feed monitoring, not the SimpleMemo
application or website.

Both `devlog-syndication.yml` and `devlog-syndication-platform.yml` deliberately
fail with `PRIVATE_HANDOFF_REQUIRED`. All modes, including dry-run and force,
stop before checkout, model execution, secret injection, feed reads or artifact
upload. The parent watcher is also stopped. No secret registration is required
to integrate this stop; registering a secret does not restart it.

## Why

Public GitHub Actions artifacts are not private inter-job transport. Reducing
retention does not prevent initial exposure. Raw generated articles and model
error text must not be exported to public artifacts, annotations or summaries.
Moving the model and credentials onto one runner is not an acceptable workaround.

The deterministic script also rejects unsupported denylist serialization,
normalizes identifier representations, masks matched values, withholds unchecked
or raw error diagnostics, and keeps CLI dry-run offline and metadata-only.
Unknown named HTML entities block conservatively; this is screening, not a full
browser-rendering implementation. Tests use fictional identities only.

## Verification and limits

Run `node --test scripts/ci-security.test.mjs` and
`node scripts/devlog-syndication.mjs --selftest`. The security suite includes
positive dry-runs on all four platforms (success, exact metadata, no fetch),
missing/malformed-list send locks, encoded matches, safe failures, and explicit
suspension contracts for both workflows. No live post or real identity is needed.

The standalone CLI context, verify, watch and gate without explicit
`--identity-missing` can still read public services. The stop jobs do not invoke
them. Updating a Draft PR runs normal repository validation and may create a
preview or repository bookkeeping; it does not activate this suspension on main.
Historical artifacts, logs, forks and commits are not erased by this change.

## Conditions for a separate restart change

1. Implement a private, bounded, integrity-checked handoff between isolated model
   and credentialed runners; no raw public artifact transport or shared runner.
2. Validate usable secret configuration before permitting generation. Keep the
   real values outside source, artifacts, logs and model context.
3. Review rendered payloads, errors, summaries and every external request path.
4. Restore and test the isolated-job, data-only import and credential-routing
   contracts removed with the old workflow, alongside synthetic regressions.
5. Obtain separate owner approval to restart. Maintain Draft until required
   settings and exact-final-commit validation have been checked. Do not treat
   registering a secret or passing offline tests as restart authorization.

This document supersedes older operational instructions about one-day raw
artifacts or registering a secret to make the existing pipeline ready. Keep
historical records as history, not proof of current safe operation.
