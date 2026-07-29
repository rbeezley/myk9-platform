# Verification Report: repair-load-rehearsal-harness

## Summary

| Dimension    | Status                                                                            |
| ------------ | --------------------------------------------------------------------------------- |
| Completeness | 30/39 tasks complete; all 8 requirements have implementation evidence             |
| Correctness  | 8/8 requirements covered; 4 still require the distributed remote runtime evidence |
| Coherence    | Implementation follows the remote-only, consolidated, free-runner design          |

## Requirement mapping

| Requirement                          | Evidence                                                                                    | Status                |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------- |
| Phase 4 capacity checklist           | `docs/operations/go-live-runbook.md`                                                        | G9 result pending     |
| Playwright discovery                 | `playwright.load.config.ts`; `loadDiscovery.contract.test.ts`; `.github/workflows/ci.yml`   | Covered               |
| Approved-target fail-closed behavior | `loadTarget.ts`; `loadAppTarget.ts`; target tests                                           | Covered               |
| Real Normal show-day workload        | `loadScenario.ts`; `loadBrowserRunner.ts`; `loadShard.ts`; assignment/shard tests           | Runtime proof pending |
| Scenario-specific complete budget    | `loadEvaluation.ts`; evaluator tests                                                        | Covered               |
| Workload/client/platform evidence    | `loadMetrics.ts`; `loadPlatformSampler.ts`; `loadShardAggregation.ts`; aggregation tests    | Runtime proof pending |
| Deterministic canonical seed         | `supabase/seed-demo.sql`; seed/lifecycle contracts; two approved remote `514/504/0` reseeds | Covered               |
| Safe recurring validation            | `.github/workflows/ci.yml`; `.github/workflows/load-rehearsal.yml`; workflow contract tests | Covered statically    |

## Critical issues

No critical implementation defect was found. These execution and shipping tasks remain incomplete
and prevent archive:

1. **8.2 — Distributed preflight not recorded.** After the implementation workflow merges to the
   default branch, configure the protected GitHub environment and required secrets, then verify
   target identity, fixture, telemetry, tier, and cap in the manual workflow.
2. **8.3 — Full Normal rehearsal not run.** Run the four synchronized shards and preserve every
   required workload, conflict, queue, persistence, database, and platform metric.
3. **8.3a — Aggregate runtime proof missing.** Require four matching 25-session artifacts and one
   exact global G9 evaluation.
4. **8.4 — G9 decision not recorded.** Keep G9 open unless every Normal dimension passes.
5. **8.5 — Workflow restoration evidence missing.** Confirm the always-run cleanup finishes with
   `514|504|0`.
6. **9.1 — Independent high-risk review pending.** OpenSpec implementation verification is
   complete; repository-required independent review remains.
7. **9.2 — Change not committed or proposed.** Commit, push, and open the MYK9-109 implementation
   PR after approval; GitHub requires this workflow on the default branch before dispatch.
8. **9.3 — Merge/tracking pending.** Merge the implementation only with approval, keep Linear/G9
   open, and close them only after the subsequent evidence gate passes.
9. **9.4 — OpenSpec archive/branch cleanup pending.** Archive and clean the worktree only after
   merge.

## Warnings

- The `load-rehearsal` GitHub environment and the two missing repository secrets
  (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`) are not configured yet. The workflow fails
  closed until they are installed.
- The five-session remote smoke passed, but both prior single-Mac 100-session attempts saturated
  the local generator. They are not Supabase capacity evidence. Only the four-runner aggregate may
  decide G9.
- GitHub's always-run cleanup covers normal failure and cancellation. If GitHub prevents that job
  from starting, the operator must run the documented canonical reseed/postcondition before
  leaving the load window.

## Suggestions

- None. Remaining work is explicit shared-system execution, independent review, and shipping.

## Final assessment

No critical source issue remains. Nine required execution/shipping tasks are still open, so do not
archive, merge, close MYK9-109, or close G9 yet.
