# Renderer diagnostic negative fixture

This is a reduction of the official Lighthouse v12.8.2 `dbw_tester.html`,
commit `8dc40bb0e13a71b1c58aaf891810ac9360b86ac9`:
https://github.com/GoogleChrome/lighthouse/blob/8dc40bb0e13a71b1c58aaf891810ac9360b86ac9/cli/test/fixtures/dobetterweb/dbw_tester.html

Apache-2.0 license and copyright are retained. The reduction keeps the four
known negative cases for geolocation, notifications, document.write and passive
listeners, removes unrelated resources, and adds a completion marker. It has no
external resources and must be served only on loopback for this experiment.
Do not approve its permission requests. No returned location is inspected.

The expected final Lighthouse scores and item counts come from the same commit's
`cli/test/smokehouse/test-definitions/dobetterweb.js`. Missing audits, runtime
errors or missing violations cannot pass. Baseline must first detect all four
cases. If the restored-renderer condition misses one, reject that condition.
This fixture supports only these four regression checks; it is not a complete
Lighthouse compatibility claim or a replacement for the website's normal gates.
