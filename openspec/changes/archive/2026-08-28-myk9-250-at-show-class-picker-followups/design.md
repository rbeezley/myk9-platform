## Context

See `proposal.md` for motivation. The existing picker loads replication-backed trials, classes, and entries, then subscribes to all three tables. Entry subscriptions already receive a complete local snapshot, but the hook discards it and invalidates the query, causing a second entry-table scan plus unchanged trial/class reads. Replication notifications are leading-edge debounced, so measurement must distinguish notification coalescing from the cost of each delivered notification.

The page also treats process-local `idle` sync status as evidence that an offline device is unprimed. Persisted per-scope replication metadata already exists and is used by Offline Readiness; it is the durable evidence appropriate for a genuinely empty scope.

## Goals / Non-Goals

**Goals:**

- Make **Your ring** the sole list for judge-only accounts with known assignments, preserving the Judge intent of invisible technology and minimal scrolling.
- Measure the current entry-refresh path at a realistic show-sized snapshot before optimizing it.
- Reuse notification snapshots to refresh entry-derived class facts without redundant IndexedDB and class/trial reads.
- Use persisted replication metadata to make the rare offline zero-class state truthful.

**Non-Goals:**

- Changing authorization, RLS, RPCs, assignment semantics, mutation queuing, or sync transport.
- Adding a warning, page, dialog, or alternate picker.
- Optimizing the replication subscription's own snapshot production; that is shared infrastructure outside this PR.

## Decisions

### 1. Render trial sections only when they add information

For `isJudgeOnly && !assignmentsUnknown`, render **Your ring** and omit `groupedByTrial`. The same assigned set currently feeds both, so the second section has no additional navigation value. Broader staff accounts keep trial sections because their show-wide coordination responsibility differs.

Alternative considered: omit **Your ring** and keep trial sections. Rejected because it loses the assignment-first ordering and pinned scan path shipped for judges.

### 2. Use the entries subscription snapshot as the refresh input

Add a pure adapter that reapplies an entries snapshot to already-loaded groups, updating counts and next-up previews while preserving trial/class identity and ordering. Subscribe to entries with `emitCurrent: false`; when query data exists, write the derived result into the query cache. If notification arrives before data exists, fall back to invalidation.

Alternative considered: debounce invalidation more aggressively. Rejected because the replication subscription already debounces notifications and every delivered invalidation still repeats full-table and class/trial reads.

### 3. Benchmark and retain deterministic regression evidence

Before changing the hook, run a focused fixture of 5,000 locally cached entries across multiple shows and at least 48 classes through the current delivered-notification path. Record elapsed time plus repeated entry/trial/class read counts in `benchmark-evidence.md`; compare one initial load with ten sequential delivered notifications so debounce coalescing cannot hide the per-notification cost. The lasting test will assert the architectural invariant—no repeated entry/trial/class read—rather than a wall-clock threshold that would be flaky in CI.

### 4. Derive empty-scope truth from replication metadata

When offline and class groups are empty, query the same persisted expected-row metadata used by offline readiness. A trial scope is trustworthy only when the trial metadata has a known expected count and every returned trial's class metadata has a known expected count satisfied by the local class count. Until that probe resolves or if it fails, retain the conservative “not on this device” message.

Alternative considered: accept the false copy because a zero-class show is rare. Rejected because the durable evidence already exists and the copy can be corrected without changing replication behavior.

### 5. Accept the stacked fail-opens without new UI

Record item (4) as accepted. Both fail-opens preserve show-day availability, while route/capability checks and `ringside_update_entry()` remain the real enforcement. A warning would add noise and a new state without resolving the offline identity uncertainty.

## Risks / Trade-offs

- [A subscription snapshot covers every locally cached show] → Filter by `showId` before deriving the cached query result and keep a deterministic focused test.
- [A notification can race the initial query] → Use cache update only when groups exist; otherwise invalidate once.
- [Persisted metadata may be missing or incomplete] → Fail conservatively to the current device-not-primed copy; never infer hydration from row count alone.
- [Pure entry refresh can drift from initial mapping] → Share the same entry-count and next-up derivation helper between initial fetch and snapshot refresh.

## Migration Plan

No data migration is required. Deploy as a client-only change. Rollback is the single implementation commit; persisted replication data and authorization behavior are unchanged.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: The code change is app-local, but it modifies offline replication-backed show-day reads and live ringside refresh behavior, so focused tests must be supplemented by app typecheck/lint, OpenSpec verification, CI, and review.
