# AppsFlyer contract and implementation review

Reviewed by Codex on 2026-09-07. This supplements the existing terms comparison; it does not establish account acceptance, complete vendor approval, or earn execution credit.

## DPA

Read all 12 pages, sections 1–13 and Schedules 1–5 of the [February 2023 DPA](https://www.appsflyer.com/gatedpdfs/Data-Processing-Addendum-February2023-DPA.pdf), linked from the [official DPA page](https://www.appsflyer.com/legal/dpa/). Download SHA-256: `7ac47ec707108efaa2a7c425679063d7681a2f3d9e6ce91671c5c04d1d510190`.

The customer controls lawful collection and instructions; AppsFlyer processes the specified data. Subprocessor changes require subscribing to notices, with ten days for objections. Unresolved objections can terminate affected services. Incident notice is without undue delay, without a fixed hourly deadline. Assistance and additional audits can incur customer costs. Bulk deletion or requests exceeding API limits may require **at least 90 days** and additional fees; this is not a maximum deletion deadline. Termination deletion has retention exceptions. Cross-border clauses and security commitments do not establish actual account configuration. Schedule 1 restricts directly identifying customer IDs.

Visually inspected rendered pages 7, 10 and 11. Supplier signatures show 2023-02-01; this is not cryptographic validation or customer execution. UK Table 4 shows alternative parties without a visible selection. External SCC and incorporated UK mandatory text were not read. No agreement was signed or submitted.

## Subprocessors and service levels

Read the complete [subprocessor list](https://www.appsflyer.com/legal/subprocessors/): AWS and Google hosting in the EU, affiliated support across countries, Databricks processing and Zendesk support in the EU. OpenAI, Gemini and Anthropic entries describe elective, opt-in generative AI services. Their listing does not prove SimpleMemo opted in. The page invites notice subscriptions; account subscription status remains unverified. Google's nested list was reviewed separately; AWS's nested list was not reviewed here.

Read the complete [SLA](https://www.appsflyer.com/legal/sla/), including both tables: link serving 99.9%, API/reporting 99%; respective credit bands are 2% and 5%. Credits concern the package's monthly value, apply to the next period, and are capped at 10%. Outstanding payments disqualify credits; maintenance and specified external/customer causes are excluded. Applicability and monetary recovery under the observed Welcome plan remain unverified. This is not a promise that analytics reports have no latency or data loss.

## Implementation and exit limits

Inspected iOS source at `origin/main` commit `3e1b3718ff6f9e3a485d6f4783744ab0571b6e29`. `AppsFlyerBridge.payload` permits selected event names, enumerated categories and validated purchase amount/currency. That builder does not copy arbitrary properties or memo text. This is a source inspection, not captured network traffic or an assessment of every SDK-generated field.

`AppDelegate` assigns the generated, Keychain-persisted UUID as customer user ID. It is a pseudonymous join key; calling it anonymous does not establish anonymization. `SceneDelegate` starts the SDK on foreground activation independently of `FeatureFlags.appsFlyerEventEnabled`. That local flag only gates bridge events, so setting it false does not establish complete SDK shutdown. Keychain persistence also means the comment asserting deletion upon uninstall is not a verified retention guarantee.

An exit procedure still needs SDK-wide shutdown behavior, identifier-aware deletion, necessary report export and verification of retained data. No account settings, runtime flags or deletion requests were changed. Existing historical human review fields remain intact.
