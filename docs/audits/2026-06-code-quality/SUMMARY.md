# Code-Quality Audit Summary

Status: Phase 1 inventory drafted from subagent findings; Phase 2 verification is not complete.

Phase 3 human gate: no fix wave is approved by this file. Before any Wave A-D implementation starts, the finder-confirmed lists below require human approval and every P1/P2 item requires independent Phase 2 verification, even when the row says "finder-confirmed." Fix-list approval is also not approval for shared-system mutations; confirm separately before PR creation/comments/merge, Supabase pushes, function deploys, external-service writes, or any push to `main`.

## Finder-Confirmed Inventory

| Severity | Area | Finding | Evidence | Proposed Fix | Verification |
| --- | --- | --- | --- | --- | --- |
| P1 | Duplication / schema typing | Generated Supabase type files are divergent, not just duplicated. | Four generated files differ in line count/hash and expose different DB surfaces. | Pick one canonical package-owned generated file, regenerate once, make app imports consume/re-export it, delete stale copies or type-only re-export them, and fix generation docs/scripts. | Finder-confirmed; Phase-2 pending. |
| P1 | Tests / fee calculation | `calculateCartTotals` has no direct unit test despite fee rounding contract. | No test imports found; comment calls out 350-cent half-cent rounding. | Add focused `cartStore.helpers.test.ts` and verify authoritative server fee location. | Finder-confirmed static; Phase-2 pending. |
| P1 | Tests / scoring validation | `ScoreValidatorService` is complex and untested directly. | 475 lines, exported service, many branch-heavy business rules; no test references. | Add unit tests for scoring validation, real-time validation, custom rules, timestamps, and Q/NQ consistency. | Finder-confirmed static; Phase-2 pending. |
| P1 | Tests / placement math | `PlacementCalculatorService.helpers.ts` has untested tie/placement helpers. | 13 exported helpers and no direct tests for placement/tie logic. | Add table-driven sorting, tie-breaker, placement-gap, and serialization tests. | Finder-confirmed static; Phase-2 pending. |
| P1 | TODO triage / judge flow | `/judge/check-in` has hardcoded empty ring assignments. | Routed page can show false empty state. | Wire real query or add launch-blocking backlog item. | Finder-confirmed; Phase-2 pending. |
| P2 | Replication bypass | Secretary Entry Management reads/writes bypass replication. | Direct `entries` reads/updates in `entries/secretary.ts` drive secretary table and status changes. | Add replication-backed secretary entry adapter and mutation path. | Finder-confirmed; Phase-2 pending. |
| P2 | Replication bypass | Armband assignment reads/writes bypass replication. | Direct entry lookup, armband upsert, and entry armband sync in `armbands/secretary.ts`. | Use replicated entries/armbands and queue entry updates. | Finder-confirmed; Phase-2 pending. |
| P2 | Replication bypass | Day-of scratch/move-up reads bypass replication. | Direct reads in `day-of-operations/scratch.ts` and `move-up.ts` feed show-day tabs. | Build from replicated entries/classes/dogs and split online refund metadata. | Finder-confirmed; Phase-2 pending; partial needs-human. |
| P2 | Replication bypass | Show-day report/exhibitor/class-entry reads bypass replication. | Direct reads in `useCheckInReport`, `useShowDayData`, and `useClassEntries`. | Add replication-backed show-day data adapters. | Finder-confirmed; Phase-2 pending. |
| P2 | Oversized files | Offline/replication core files mix queueing, OCC, backup, sync, conflict, and UI orchestration. | `MutationManager`, `ReplicatedTable`, `ReplicationSyncProvider`, and helpers exceed 500 lines with multiple concerns. | Extract pure queue/OCC/backup/conflict helpers with focused tests. | Finder-confirmed cluster; Phase-2 pending file:line narrowing. |
| P2 | Oversized files | Scoring service/components mix validation, sync, conflict UI, save confirmation, and calculations. | Scoring files exceed 500 lines in launch-critical flow. | Extract scoring math, save dialogs, and conflict helpers with behavior tests. | Finder-confirmed cluster; Phase-2 pending file:line narrowing. |
| P2 | Oversized files | Show Map structure/action files are oversized and INTENT-sensitive. | Row rendering, keyboard focus, recommendations, and attention logic are colocated with `// INTENT:` comments. | Extract render cells/pure action helpers only. | Finder-confirmed cluster; Phase-2 pending file:line narrowing. |
| P2 | Duplication | Replication/PostgREST read-shape control flow repeats across entries/classes/dogs/trials reads. | Repeated replicated read, manual join mapping, sorting parity, and fallback shape assembly. | Extract narrow shared helpers and parity tests. | Finder-confirmed; Phase-2 pending. |
| P2 | Duplication | Magazine/Gazette email renderers duplicate transactional helper/data contracts. | Deno builders and React templates duplicate escaping, run tables, CTA/contact/signoff patterns. | Extract shared helpers/data type and add preview-vs-production sync tests. | Finder-confirmed; Phase-2 pending. |
| P2 | Type escapes | `AuditService` uses `any` because `audit_entry` is missing from generated types. | `audit_entry` exists in migrations but not generated types. | Regenerate/canonicalize types and type audit rows. | Finder-confirmed; Phase-2 pending; ties to P1 type-file consolidation. |
| P2 | Type escapes / schema drift | `entryService.ts` writes `{ status }` to `entries`, which has no `status` column. | Generated entries type has `entry_status`, `check_in_status`, `is_in_ring`. | Delete if dead or route to replicated entry/check-in update. | Finder-confirmed; Phase-2 pending. |
| P2 | Type escapes | Several show visibility, secretary, judge, and settings hooks use stale `as any` casts despite generated types. | Visibility tables, secretary tasks, judge views/assignments exist in generated types. | Remove casts with generated row/return types. | Finder-confirmed; Phase-2 pending. |
| P2 | TODO triage | Nationals/Regular discriminator is hardcoded in passcode/function placement paths. | Function and migration TODOs both point to `Regular`/`v_is_nationals=false`. | Add consolidated OPEN-TODOS item or migration-backed fix. | Finder-confirmed; Phase-2 pending; migration changes need separate approval. |
| P2 | TODO triage | Dog creation plus child registration sync is not atomic. | `useDogStoreCompat` TODO notes partial state possible. | Add backlog item for `create_dog_with_children` RPC. | Finder-confirmed; Phase-2 pending. |
| P2 | Config/env | Live code reads operator env vars missing from `.env.example`. | Missing Stripe price IDs, premium styles flag, public URL, unified ringside flag, show-presence overrides. | Add operator-facing vars or move smoke-test-only vars to test docs. | Needs-human; Phase-2 pending; Vercel envs not inspected. |
| P2 | Tests | Bulk result-entry helper logic is duplicated and untested. | Two helper files export overlapping time/validation functions; no tests. | Consolidate to one helper, then test time/validation edge cases. | Finder-confirmed; Phase-2 pending. |
| P2 | Tests | Show creation validation/transformer logic lacks direct tests. | Branchy validation/transformer modules have little or no direct behavioral coverage. | Add pure unit tests with deterministic UUID/date mocks. | Finder-confirmed; Phase-2 pending. |
| P2 | Tests | `EntryValidator.validateEntry` has partial coverage only. | Existing test covers `validateCompetitionData`, not full entry validation. | Add full-context validation tests for fees/deadlines/show state/restrictions. | Finder-confirmed partial; Phase-2 pending. |
| P2 | Tests | Conflict-surfacing flag semantics are not directly pinned. | Algorithms have tests, but env/default/configure/reset behavior lacks direct unit tests. | Add focused flag/config tests. | Finder-confirmed lower-confidence; Phase-2 pending. |

## Phase 2 Verification Queue

| Severity | Area | Candidate | Evidence | Required Verification |
| --- | --- | --- | --- | --- |
| P2 | Dead code | `lazyLoading.ts`, `usePaginatedQueries.ts`, and `useOptimizedSearch.ts` appear dead or tests-only. | No production imports except candidate-dead preloader; `knip` unavailable, fallback `rg` used. | Prove liveness absence across apps, packages, docs, route registries, dynamic imports, and tests before Wave A deletion. |
| P2 | Dead code | `supabase/functions/send-notification` has no source caller and overlaps current send flows. | No invoke/source caller found. | Check Supabase deployed usage/logs/config before deletion or deprecation. This is a shared-system investigation, not a deletion approval. |
| P3 | Dead code | Demo/test pages, optimistic form wrapper, unused sync UI panels, performance-budget config. | Source grep found no active route/import references. | Verify route registries and dynamic imports before deletion. |

## Needs Human

| Severity | Area | Finding | Evidence | Question |
| --- | --- | --- | --- | --- |
| P2 | Replication bypass | Pull Management processed pulls mix show-day local state with online refund/accounting metadata. | `scratch.ts:91` direct read is show-day adjacent, but refund fields are online-ish. | Should the fix split local pull state from refund/accounting metadata? |
| P2 | Replication bypass | `packages/ringside` class-status hook writes directly to classes. | Package is exported, but myK9Show `/at-show` may use host replicated actions. | Is this hook still a public/live contract that must be replicated? |
| P3 | Flags | Completed show-presence/live-sync/conflict-surfacing kill switches remain checked. | Flags are true by default but can still force off. | Remove flags pre-launch, or keep them as documented operational kill switches? |
| P2 | Config/env | Missing env vars from `.env.example`. | Some are operator-facing; some may be smoke-test-only. | Which belong in operator setup docs versus test docs? |

## Refuted / Not Filed

| Area | Candidate | Reason |
| --- | --- | --- |
| Duplication | `judges/reads.ts` as same read-shape duplication cluster | It is large, but mostly qualification/certification/assignment operations, not the replicated-read/fallback sibling pattern. |
| Duplication | Empty state/stat-card cluster | Most stat usage imports shared UI; local empty states are often role/surface-specific. |
| Replication bypass | Legacy move-up/scratch direct paths | No live caller found; superseded by replicated helpers. |
| Config | `phase3-5:payment:*` scripts | Referenced files/scripts exist. |
| Config | `VITE_VAPID_PUBLIC_KEY` | Set in example, read in app, documented for push. |
| Dead code | `useArmbandStore` | Dynamically loaded by `StoreProvider` and referenced in store dependency metadata. |

## Out-of-Scope Handoffs

| Area | Evidence | Route |
| --- | --- | --- |
| Security/migration | Any future migration for Nationals discriminator or generated type canonicalization must follow DB migration safety rules. | `migration-auditor` / explicit DB confirmation if migration is required. |
| External edge function usage | `send-notification` liveness cannot be proven by source grep. | Check Supabase deployed usage/logs before deletion. |

## Baseline Delta

| Metric | Before | After | Notes |
| --- | --- | --- | --- |
| Files > 500 lines | 181 raw / approx. 177 real on 2026-06-10 | 182 raw / 178 real in 2026-06-12 finder run | Drift is from rerunning the literal Phase 1a pattern; use the 2026-06-12 count for this audit run. |
| `as any` casts | 32 | TBD | Recount after fix waves. |
| TODO/FIXME/HACK markers | 24 | TBD | Recount after fix waves. |
