## Why

`ReplicatedTable.getAll()` currently converts every IndexedDB or timeout failure into `[]`, so callers cannot distinguish a confirmed empty table from an unreadable replica. This directly undermines fall 2026 show-day reliability: Show Desk can announce that work has not started or no classes exist when the secretary's device simply failed to read its local data.

The pre-change audit found 85 `getAll()` occurrences across 36 non-test TypeScript files under myK9Show and the replication package. Many are compatibility-sensitive internal filters or lookup helpers; this slice establishes an additive truthful contract and migrates the highest-priority class schedule claim without changing all legacy callers at once.

## What Changes

- Add an additive replicated-table read API that returns rows together with explicit success/failure status and the original error while preserving `getAll()`'s current empty-array fallback.
- Ensure successful and failed status reads preserve the existing database circuit-breaker reset/recording behavior and offline IndexedDB semantics.
- Migrate both replicated reads that feed the Show Desk schedule, starting with `trialStore.loadTrialClasses`, so failed Trial or Class reads do not replace previously loaded data with empty state.
- Track Trial/Class read availability separately from mutation errors and make Show Desk pause factual schedule/status claims when no complete schedule snapshot could be read, with a retry action.
- Add focused package, store, and Show Desk tests for confirmed empty reads, failed reads, stale-data preservation, and retry behavior.
- Document the caller audit and leave broader caller migration as explicit follow-up scope.

This change does not duplicate an existing page or workflow. It adds no new page, dialog, sheet, or owner surface; the read-failure state appears in the existing Show Desk where the misleading claims are currently made, so a link cannot solve the truthfulness defect.

### Non-goals

- Changing or removing the compatibility behavior of `getAll()`.
- Migrating all audited callers in one wide-blast-radius PR.
- Adding a new replication dashboard, global error center, or alternate class-management surface.
- Changing replication writes, synchronization, TTL rules, or server APIs.

## Capabilities

### New Capabilities

- `replicated-read-truthfulness`: Defines the additive status-bearing replicated read contract and the Show Desk class-schedule behavior when local class data cannot be read.

### Modified Capabilities

None.

## Impact

- `packages/replication`: public `ReplicatedTable` query API and focused unit coverage.
- `apps/myk9show/src/store/trialStore.ts` and its types/tests: truthful Trial/Class load state and stale snapshot preservation.
- Existing Show Desk page/tests: calm unavailable state and retry without adding surface area.
- No database migration, network API, dependency, or shared-system mutation is required.
