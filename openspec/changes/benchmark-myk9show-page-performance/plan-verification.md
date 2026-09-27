## Plan Verification

### Requirements Audit

| Requirement                                                                | Status      | Evidence                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attempt the public, exhibitor, secretary, judge/ringside, and admin matrix | **Covered** | All 17 routes and 120 two-navigation pairs were attempted. The [dated report](../../../docs/qa/perf-baseline-2026-09-27.md) has 240 unique slots: 228 measured and 12 blocked.                                                        |
| Measure mobile Fast/Slow 4G and secretary desktop profiles                 | **Covered** | The runner applied the specified CPU, network, and viewport settings; the report separates each profile and pass. The second pass is explicitly labeled same-context uncached, not warm-cache.                                        |
| Record labeled lab metrics, requests, backend timings, and chunks          | **Covered** | Per-attempt rows and medians are in the report. The largest observed request count was 358 with service workers blocked. JavaScript transferred includes modulepreload links. INP is unavailable without an interaction.              |
| Keep the benchmark repeatable and isolate browser failures                 | **Covered** | One command builds and runs the matrix through `qa:browser-session`. The manifest matches all 120 atomic pair JSON results exactly; no duplicate or missing slot was found.                                                           |
| Check field data without adding services                                   | **Covered** | The report records Vercel/Sentry access or configuration limits.                                                                                                                                                                      |
| Identify slow routes and update MYK9-844                                   | **Partial** | The report ranks measured routes and computes findings from samples. The Linear update awaits shared-system authorization.                                                                                                            |
| Avoid product fixes and shared-data mutations                              | **Covered** | Changes are confined to the diagnostic harness, OpenSpec, and report. HTTP writes were blocked except auth refresh and verified read-only RPCs; telemetry POSTs received local 204 responses, and WebSocket connections were blocked. |

### Interpretation

The report remains **provisional**. Admin Users displayed “Failed to load users” in all 12 slots for that route. Reports and Results loaded in every slot of the final run. An earlier superseded run (`2919a275-8fa3-4bcd-9ca4-3b9d2d95b738`) had transient “Loading show” timeouts on those routes; separate fresh-session rechecks and the final run loaded them. Those older samples are not mixed into the final 240-slot baseline (`1cce26e4-e164-42b4-b485-cb64787344eb`).

On slow 4G, Reports had a 19,413 ms median cold time across three measured runs, Show Day 19,369 ms, and Secretary Setup 18,694 ms. The 3.53 MB minified entry chunk transferred 1,123,153 bytes in all 114 measured cold attempts. The highest observed request count was 358. The common entry cost is a candidate for MYK9-844; this lab run alone does not establish that a specific import is the root cause. No blocked route is ranked as fast. Genuine warm-cache performance remains unmeasured under the read-only routing guard.

### Validation

- Production build and full `performance:baseline` command completed; the owned browser session closed.
- The saved manifest has 120 pair files and 240 unique attempts; 228 measured and 12 blocked. The report contains no auth tokens.
- Focused harness tests passed (23/23). App typecheck, code-quality ratchet, strict OpenSpec validation, and Prettier formatting passed. App lint passed with 11 existing warnings and no errors.
- The required shuffled app suite produced no useful progress for 30 seconds and was stopped under the repository's hung-runner rule.

### Remaining Gates

Update MYK9-844, create the PR, complete CI/review/merge, and archive this OpenSpec change after shared-system authorization.
