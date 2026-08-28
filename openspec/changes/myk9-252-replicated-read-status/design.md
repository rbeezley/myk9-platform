## Context

See `proposal.md` for motivation and audit scope. `ReplicatedTableQueryManager.getAll()` currently owns the IndexedDB read, timeout race, logging, and `databaseManager` failure bookkeeping, then collapses failures to `[]`. `ReplicatedTable.getAll()` exposes that contract to all table subclasses. The Show Desk schedule is derived from both `trialStore.trials` and `trialStore.trialClasses`; each is initially loaded from a replicated table and later refreshed through subscriptions.

The offline-first constraint is important: expired rows are intentionally retained while offline, so a successful local read remains valid offline behavior. This change concerns local-read failure, not network availability or synchronization state.

## Goals / Non-Goals

**Goals:**

- Establish one reusable discriminated read result at the replication boundary.
- Preserve every legacy `getAll()` caller while allowing high-consequence consumers to migrate deliberately.
- Make the existing Show Desk truthful without adding a second schedule surface.
- Preserve the last confirmed schedule when a refresh fails.
- Keep secretary-facing recovery calm, inline, and one tap.

**Non-Goals:**

- Reclassify all 85 audited occurrences in this PR.
- Change subscriptions, TTL expiration, sync, mutations, or database recovery thresholds.
- Treat offline state as a read failure when IndexedDB remains readable.
- Add global replication UI or expose technical IndexedDB errors to the secretary.

## Decisions

### 1. Add a discriminated `getAllWithStatus()` result

`ReplicatedTableQueryManager` will expose a status-bearing method returning either `{ ok: true, rows, error: null }` or `{ ok: false, rows: [], error }`. The public `ReplicatedTable` forwards it and the result type is exported from `@myk9/replication`. The optional license scope remains supported.

The IndexedDB read and timeout race will live in one internal path used by both public methods. `getAll()` will adapt the result back to `rows`, retaining its current `[]` failure contract. This avoids double logging and double circuit-breaker accounting. The one existing `getAll()` override (`ReplicatedJudgeAssignmentsTable`, which redacts private fields) will also override the status method so the additive public API cannot bypass that privacy boundary.

`ReplicatedTableCacheManager` will consume the status-bearing read for initial subscription emission and later notifications. It will suppress listener callbacks on read failure instead of broadcasting a false empty snapshot, while allowing the query layer to retain responsibility for logging and circuit-breaker accounting. Successful empty snapshots still notify normally.

Alternatives considered:

- Make `getAll()` throw: rejected because dozens of production callers rely on it always resolving.
- Add process-global “last read error”: rejected because concurrent table reads would overwrite each other and consumers could not associate a failure with a specific request.
- Return only an `ok` boolean: rejected because consumers need diagnostics for logging and calm user-facing recovery.
- Leave subscription callbacks on the legacy array API: rejected because a failed notification could still erase the store snapshot immediately after a truthful explicit load failed.

### 2. Track Trial and Class read state independently

The Trial store will add separate `trialsReadStatus` and `trialClassesReadStatus` values, plain-language error strings, and `trialsHasConfirmedSnapshot` / `trialClassesHasConfirmedSnapshot` booleans. The booleans are required because a confirmed empty snapshot cannot be inferred from row count. Each load sets its own state to loading; success atomically replaces that dataset, records a confirmed snapshot, and marks it ready; failure retains existing data and marks only that read failed.

The existing `isLoading` and `error` fields remain for compatibility and mutation flows. Read availability is not folded into them because a Class read must not make a concurrent Trial mutation look failed, and Show Desk needs to know exactly which schedule dependency is unknown.

Alternatives considered:

- Reuse the existing shared `error`: rejected because it conflates reads and mutations and cannot prove whether Trials, Classes, or both were read.
- Store only `hasLoaded`: rejected because it cannot represent retry-in-progress or refresh failure after a prior success. Status plus confirmed-snapshot evidence is required.

### 3. Preserve snapshots and distinguish initial failure from refresh failure

A status read failure will never replace `trials` or `trialClasses`. Show Desk can therefore distinguish:

- no confirmed schedule plus failure: block downstream factual claims with the existing page-level inline state;
- a confirmed prior snapshot plus refresh failure: keep the usable offline-first snapshot visible and add a non-blocking inline warning;
- successful confirmed empty reads: allow the existing empty state.

The page will retry both loads together because its schedule requires both datasets. The retry stays on Show Desk; a link elsewhere cannot repair an unread local replica and would fragment the secretary workflow.

### 4. Test at the three contract boundaries

- Replication package tests prove discriminated success/failure, legacy fallback, and failure bookkeeping.
- Trial store tests prove assertion-first failure behavior, snapshot preservation, recovery, and independent states.
- Show Desk component tests prove misleading schedule/status claims are absent on initial failure and that retry is wired, while stale confirmed data remains visible during refresh failure.

## Risks / Trade-offs

- [Risk] Two public read APIs can be confused by future callers. → Document `getAll()` as compatibility-only for failure-insensitive reads and direct claim-making callers to `getAllWithStatus()`.
- [Risk] Suppressing a subscription callback on failure means listeners receive no update for that notification. → Preserve their last known snapshot and allow later successful mutations/refreshes to notify; absence is truthful while `[]` would be false data.
- [Risk] A refresh failure leaves older data visible. → Show Desk labels the refresh problem and retains the schedule because known local data is safer on show day than a false empty state.
- [Risk] Trial and Class retries can partially succeed. → Keep their states independent and continue pausing initial factual claims until both dependencies have a confirmed snapshot.

## Migration Plan

1. Add and test the additive package API with no consumer changes.
2. Migrate Trial/Class loads and add store state/tests.
3. Gate Show Desk claims and add retry/component tests.
4. Run package tests, focused myK9Show tests, package/app typechecks, and OpenSpec validation.

Rollback removes the migrated consumer usage and additive API; there is no persisted-data or server migration.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This changes the shared offline replication package, subscription failure semantics, and a secretary show-day truth surface with broad downstream call sites.
