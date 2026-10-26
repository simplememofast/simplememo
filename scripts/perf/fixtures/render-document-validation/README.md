# Isolated measurement controls

Synthetic diagnostics, not production content or candidate acceptance evidence.
The fixed four-capture experiment compares the launcher default and restored
RenderDocument behavior for one ordinary page and one intentionally slow page.
No public-site measurement is performed by the validation-controls mode.

The local server binds 127.0.0.1:8766, serves fixed paths, and stops after
250 seconds. Its limits are 64 requests and 1 MiB of response bodies. The driver
has a 230-second limit. No retries or alternative samples are selected.

The positive page uses none of the four discouraged APIs. The performance
negative page delays a real image response by four seconds, moves content after
observed FCP, and creates one bounded 700 ms main-thread task. Both fixture
validity and rejection by the existing metric budgets must be demonstrated.
Observed and simulated metrics are recorded separately; missing evidence is
not a passing control.

The image is an unchanged copy of the existing project asset
`assets/home-perf/voice-airpods-pro-bright-1536-600-d31cc9b57999.avif`:
18,304 bytes, SHA256
`d31cc9b57999fa8f50eb24bb0d6213747bf1f269425f7d37b1c37aa931cf70fe`.
This is not a third-party download or an assertion of a separate open license.

The HTML and Node server are new synthetic controls. Design references:
[Lighthouse delayed-LCP fixture](https://github.com/GoogleChrome/lighthouse/blob/8dc40bb0e13a71b1c58aaf891810ac9360b86ac9/cli/test/fixtures/delayed-lcp.html)
and [Lighthouse timing summary](https://github.com/GoogleChrome/lighthouse/blob/8dc40bb0e13a71b1c58aaf891810ac9360b86ac9/core/computed/metrics/timing-summary.js).
