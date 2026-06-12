# 09 Phase 2 Verification

Status: source-level Phase 2 verification complete for the initial P1/P2 queue. No fix wave is approved by this file.

Date: 2026-06-12

Method: four read-only verification tracks plus targeted main-agent checks. Verification used `rg`, route/import scans, direct file inspection, type-file line/hash checks, and liveness checks across `apps`, `packages`, `supabase`, and audit docs. Deployed Supabase function usage, Vercel environment values, and product decisions were not inspected.

## Confirmed P1 Items

| Finding | Phase 2 Result | Evidence | Next Step |
| --- | --- | --- | --- |
| Generated Supabase type files diverge | Confirmed | Four generated files differ in size and content: `packages/supabase/src/database.types.ts`, `packages/supabase/src/types/database.types.ts`, `packages/supabase/src/types.ts`, and `apps/myk9show/src/types/supabase.ts`. Package exports `packages/supabase/src/types/database.types.ts`; the app client imports `apps/myk9show/src/types/supabase.ts`. | Make one package-owned canonical generated type source, re-export/consume it from the app, delete or type-only re-export stale copies, and fix generation docs/scripts. |
| `calculateCartTotals` lacks direct unit tests | Confirmed, with path correction | No direct test imports for `calculateCartTotals`, `PLATFORM_FEE_PERCENT`, or `cartStore.helpers`. The server fee helper does exist at `apps/myk9show/supabase/functions/_shared/platformFee.ts`; the missing path was the root `supabase/functions/_shared/platformFee.ts`. | Add focused helper tests for empty cart, multi-item subtotal, the 350-cent boundary, label percent, and parity with the server helper. |
| `ScoreValidatorService` lacks direct unit tests | Confirmed | `apps/myk9show/src/services/scoring/ScoreValidatorService.ts` exports a branch-heavy validator and singleton; test scans found no direct references to `ScoreValidatorService`, `scoreValidatorService`, `validateRealTime`, or `validateScores`. | Add direct unit tests before refactor: required/range rules, real-time mode, custom rules, timestamp validation, judge ID validation, and Q/NQ consistency. |
| `PlacementCalculatorService.helpers` lacks direct unit tests | Confirmed | `apps/myk9show/src/services/scoring/PlacementCalculatorService.helpers.ts` exports placement/tie/sort/serialization helpers consumed by `PlacementCalculatorService.ts`; no direct helper tests found. | Add table-driven tests for sorting by format, ties, tie resolution, placement shifts/gaps, empty calculation, and serialize/deserialize date behavior. |
| `/judge/check-in` false empty state | Confirmed | Live route exists in `apps/myk9show/src/routes/judgeRoutes.tsx`; `JudgeCheckInDashboard.tsx` initializes `ringAssignments` to `[]` with a TODO and can render "No Ring Assignments" from that hardcoded state. | Wire a real judge/ring assignment query or add a launch-blocking backlog item. |

## Confirmed P2 Items

| Area | Finding | Phase 2 Result | Next Step |
| --- | --- | --- | --- |
| Replication bypass | Secretary Entry Management read path | Confirmed | Add replication-backed secretary entry read adapter. |
| Replication bypass | Secretary status and bulk status writes | Confirmed | Replace with replicated entry mutations while preserving audit logging and armband patch behavior. |
| Replication bypass | Armband assignment reads/writes | Confirmed | Use replicated armbands plus replicated entry updates. |
| Replication bypass | Day-of scratch and move-up list reads | Confirmed | Build views from replicated entries/classes/dogs. |
| Replication bypass | Secretary check-in report read | Confirmed | Add replicated report adapter using entries/classes/trials/armbands. |
| Replication bypass | Exhibitor show-day data reads | Confirmed | Add replication-backed show-day adapter and consider avoiding duplicate global hook instances. |
| Oversized files | Replication core cluster | Confirmed | Extract pure queue ordering, backoff, backup, and conflict helpers with tests. |
| Oversized files | Scoring service/component cluster | Confirmed | Start with service sync/conflict/persistence helpers and tests. |
| Oversized files | Show Map cluster | Confirmed | Extract render cells and pure action helpers only; preserve `// INTENT:` comments and behavior. |
| Duplication | Replication/PostgREST read-shape duplication | Confirmed | Extract narrow map-loader/sort/fallback parity helpers; avoid a broad ORM. |
| Duplication | Magazine/Gazette email duplication | Confirmed, refined | Extract shared Deno-safe helpers/data contract; add preview-vs-production parity/golden tests. |
| Type escapes | `AuditService` `audit_entry` casts | Confirmed with caveat | Verify `audit_entry` exists in the current DB before typing; then resolve through canonical type generation. |
| Type escapes | Visibility/settings/secretary/judge stale casts | Confirmed | Remove casts using generated row/return types after type canonicalization. |
| Schema drift/dead code | `entryService.ts` writes nonexistent `entries.status` | Confirmed dead/schema-drift | Delete in Wave A rather than repair; future in-ring behavior should use a replication-backed adapter. |
| TODO triage | Nationals/Regular discriminator hardcoded | Confirmed | Track launch backlog or add real discriminator via approved migration path. |
| TODO triage | Dog creation plus child registration is non-atomic | Confirmed | Backlog RPC/mutation work before relying on partial failure recovery. |
| Test gaps | Bulk result-entry helper duplication/coverage | Confirmed | Consolidate one helper and test time/fault/qualification edge cases. |
| Test gaps | Show creation validation/transformer direct coverage | Confirmed | Add pure unit tests with deterministic UUID/date mocks. |
| Test gaps | `EntryValidator.validateEntry` partial coverage | Confirmed | Add full-context tests for fees, deadlines, show state, and restrictions. |
| Test gaps | Conflict-surfacing flag semantics | Confirmed, refined | Add flag/config tests for defaults, env false override, configure/reset behavior, and stale comment cleanup. |

## Dead-Code Liveness Results

| Candidate | Phase 2 Result | Evidence | Next Step |
| --- | --- | --- | --- |
| `apps/myk9show/src/lib/lazyLoading.ts` | Confirmed dead | Exact import sweep found no `@/lib/lazyLoading` imports; hits were audit docs and unrelated live files with similar names. | Delete in Wave A. |
| `apps/myk9show/src/hooks/queries/usePaginatedQueries.ts` | Confirmed tests-only through dead preloader | Exact sweep found only `src/lib/lazyLoading.ts` dynamic imports and direct tests. | Delete module and direct tests in Wave A. |
| `apps/myk9show/src/hooks/queries/useOptimizedSearch.ts` | Confirmed tests-only through dead preloader | Exact sweep found only `src/lib/lazyLoading.ts` dynamic imports and direct tests; live search uses other hooks/utilities. | Delete or explicitly replace with live search hooks if product need appears. |
| `apps/myk9show/src/services/entryService.ts` / `markInRing` | Confirmed dead/schema-drift | No app source caller found; file writes `entries.status`, which is not in generated entry update types; file is excluded from app tsconfig. | Delete in Wave A. |
| Demo/test pages listed in `02-dead-code-unused-exports.md` | Confirmed unreachable | Route checks found no active routes/imports. Live `RBACTestPage` and `TemplateTestingPage` remain routed and were not flagged. | Delete unreachable demo/test pages. |
| `components/forms/OptimisticForm.tsx` | Confirmed unused wrapper | No imports/re-exports of wrapper components; separate `useOptimisticForm` hook is live. | Delete wrapper only; keep live hook. |
| Sync panels: `GlobalSyncStatusBar`, `QueueManagementPanel`, `SyncIntegrationSummary` | Confirmed unused | No consumers outside own files/audit docs; not exported from `components/sync/index.ts`; routed `/admin/sync` uses `SyncMonitoringPage`. | Delete unused panels; keep routed sync monitoring page. |
| `config/performance-budget.ts` | Confirmed dead | No app imports; live budget logic exists in script/RUM constants. | Delete or consolidate docs to the live script/RUM constants. |

## Refuted Or Reclassified

| Candidate | Phase 2 Result | Reason | Follow-Up |
| --- | --- | --- | --- |
| Legacy move-up processor direct path | Refuted as live bypass | Direct path exists, but production caller scan found current UI uses replicated show-map/request helpers. | Keep excluded from replication bypass wave; consider dead-code deletion after broader liveness pass. |
| `useClassEntries` direct read | Refuted as live bypass | Direct read exists, but production import scan found only `components/shows/EntryList.tsx` and no production caller for that component. | Move to dead-code queue; replicate only if a live route is found. |
| Magazine/Gazette tests | Refined | Direct edge tests exist; the real gap is shared contract/parity between preview templates and production Deno builders. | Add parity/golden tests instead of filing as "no tests." |

## Still Needs Human Or Deployed-System Verification

| Finding | Why Source Verification Is Insufficient | Required Decision |
| --- | --- | --- |
| `supabase/functions/send-notification` | Source/config sweep found no invoke/caller, but edge functions can be called externally or remain deployed. | Check deployed Supabase function usage/logs/config before deleting or deprecating. |
| Pull Management processed pulls | Pull state is show-day relevant, but refund/accounting metadata is online-ish. | Decide whether to split local pull status from refund/accounting metadata. |
| `packages/ringside` class-status hook | Current myK9Show `/at-show` uses replicated host actions, but the package hook is public/exported and may have external consumers. | Decide whether the hook remains a public/live contract. If yes, inject `RingsideReplication`; if no, deprecate/delete. |
| Missing env vars in `apps/myk9show/.env.example` | Some missing vars are operator-facing; some may be smoke-test or kill-switch values. Vercel envs were not inspected. | Decide operator-facing vs test-only docs, then update app env example/docs. |
| `audit_entry` typing | Local migrations mention `audit_entry`, but generated app types do not include it. | Verify current DB schema before adding a typed table contract. |

## Recommended Implementation Order

1. Wave A: safe delete-first cleanup for Phase-2-confirmed dead code.
2. Wave B: P1 tests and type canonicalization prep, especially fee/scoring/placement/judge check-in.
3. Wave C: replication bypass fixes for secretary and show-day reliability.
4. Wave D: lower-risk refactors and config/test cleanup after the critical paths are covered.

Each wave should have a small implementation plan, targeted tests, and a separate approval gate before shared-system writes or PR creation.
