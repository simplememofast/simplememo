# Lighthouse 12.8.2 and Chrome 155 compatibility

The mobile audit retains its twelve cold-browser samples, four categories,
default mobile simulation, production revision check and existing budgets.
The runtime wrapper changes browser startup and preserves violation reporting;
it does not change page content or suppress analytics.

## Why the two changes belong together

The launcher disables `RenderDocument`. Existing traces contain approximately
one-second frame activation-to-submission waits in this configuration. Removing
that single disabled feature restores Chrome's normal behavior, but an isolated
comparison also exposed false passes in four discouraged-API audits. That
renderer-only treatment was rejected. The full cause of every slow production
sample has not been established.

Chrome 155's inspector stores violation thresholds in a map whose default is
`-1`. Assigning that default removes the saved key; restoration can then omit
the reporting subscription. Lighthouse requests `discouragedAPIUse` with `-1`.
The narrow workaround changes this one reporting value to `-2`, which remains
below the zero-duration events used by all four relevant call sites and is
preserved in the map. This is a locally reviewed compatibility repair, not an
upstream release or a relaxation of a website budget.

Sources: [Lighthouse collector](https://github.com/GoogleChrome/lighthouse/blob/8dc40bb0e13a71b1c58aaf891810ac9360b86ac9/core/gather/gatherers/console-messages.js),
[Chrome inspector](https://github.com/chromium/chromium/blob/155.0.8059.39/third_party/blink/renderer/core/inspector/inspector_log_agent.cc),
[saved-map implementation](https://github.com/chromium/chromium/blob/155.0.8059.39/third_party/blink/renderer/core/inspector/inspector_session_state.h),
[violation reporting](https://github.com/chromium/chromium/blob/155.0.8059.39/third_party/blink/renderer/core/frame/performance_monitor.cc).

## Runtime boundaries

The wrapper requires the reviewed Lighthouse 12.8.2, chrome-launcher 1.2.2 and
Chrome 155.0.8059.39 combination. An unknown version or collector hash fails
instead of downloading another browser or silently continuing.

The workflow downloads the exact `chrome/linux64` artifact listed in the
[official version metadata](https://googlechromelabs.github.io/chrome-for-testing/155.0.8059.39.json)
(revision `1697595`) from
[Google's distribution](https://storage.googleapis.com/chrome-for-testing-public/155.0.8059.39/linux64/chrome-linux64.zip).
It verifies the archive before extraction and selects that executable with
`CHROME_PATH` for the production observation, Lighthouse and responsive checks.
The runtime has no system-browser fallback. The pinned values are:

- Archive SHA256: `55672d1f392fd3e7b7a08621b6e804e6bcb39d40cf155504abb74b3a021ea8ea`.
- Executable SHA256: `ed05e73a2cdf875326fcfa438b31c71a6a885a353610731dd52090dfc476f778`.
- Exact trimmed version output: `Google Chrome for Testing 155.0.8059.39`.

The SHA256 values were measured from the official HTTPS download on 2026-10-31;
the version metadata does not publish SHA256. The archive's MD5 matched Google's
`x-goog-hash` response and every ZIP member passed its CRC check. CfT has a
different product name from ordinary installed Google Chrome; the version guard
accepts only this exact CfT name and version, together with the pinned binary
hash. Local inspection on macOS cannot execute the Linux binary. The exact
candidate's Linux CI must confirm the actual output and complete the normal
twelve measurements before this change can be considered validated.

`browser-install.json` records the source, measured hashes and actual version
process output before the version assertion, including a mismatch or launch
failure. Each measurement likewise persists its browser/tool receipt before
version assertions. The running `/proc/<pid>/exe` must be the selected pinned
executable, and the existing argument and executable-stability checks still
apply. A changed archive, binary, product name or patch version fails closed.

Only the ephemeral installed collector is patched. Its original SHA256 is
`512cb67e34e30672ec872a4fc8f846904a5b77006426186c6bf7819993a1191a`.
The exact one-byte change, path/file identity and readback are verified. Cleanup
restores and reads back the original bytes; restoration failure fails the
measurement. Each capture owns a fresh profile and records normalized process
arguments. The ordinary CLI accepts only the existing four URLs and twelve
output names, with no arbitrary flag or audit override.

All other launcher flags remain intact. The Lighthouse CLI attaches only to
the verified local browser port. The raw reports and runtime receipts are
retained, including failures; there is no retry or sample-selection loop.

## Validation evidence

- [Renderer comparison](https://github.com/simplememofast/simplememo/actions/runs/40256203618): renderer restoration alone falsely passed four known negatives; rejected.
- [Reporting repair controls](https://github.com/simplememofast/simplememo/actions/runs/40258599204): both renderer configurations detected geolocation, notification, document.write and passive-listener negatives, with original source restoration verified.
- [Positive and performance controls](https://github.com/simplememofast/simplememo/actions/runs/40260341419): both positive controls passed; the performance controls failed their completion condition because the initial viewport change marked the early synthetic layout shift as recent input. This failed result is retained.
- [Corrected performance controls](https://github.com/simplememofast/simplememo/actions/runs/40261068000): both strict controls passed after moving the synthetic shift beyond the initial viewport interval. Independent trace review confirmed the final delayed-image LCP, post-FCP700ms tasks, non-input CLS0.212, complete markers, source hashes and restoration. Both reports breach the unchanged LCP/TBT/CLS budgets. Positive controls were not repeated in this two-capture run.

These fixed controls test specific detection failures. They do not substitute
for the exact candidate's normal CI, the approved cache verification or the
production deployment check. Later browser/tool updates require a fresh review
of the compatibility guard and these detection properties.
