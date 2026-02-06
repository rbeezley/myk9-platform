# ADR-004: Offline-First Architecture with IndexedDB

## Status
Accepted

## Date
2026-01-02

## Context

myK9Q is a scoring application used by judges at dog shows. These events frequently take place in venues with unreliable or nonexistent internet connectivity -- fairgrounds, outdoor fields, and convention centers with overloaded Wi-Fi. Judges must be able to score entries continuously regardless of network conditions. Any data loss or scoring interruption is unacceptable.

This means the app must:
- Function fully offline with zero degradation in core scoring workflows
- Cache all relevant data locally before going offline
- Track changes made offline and sync them when connectivity returns
- Handle conflicts when the same data was modified on multiple devices

Options for local storage:
- **localStorage** -- 5-10MB limit, synchronous API, no structured queries; inadequate for the data volume
- **SQLite (via WASM)** -- Powerful but adds significant bundle size and complexity
- **IndexedDB** -- Browser-native, asynchronous, supports structured data and indexes, generous storage limits (hundreds of MB)

We chose IndexedDB, accessed through the `idb` library for a clean promise-based API.

## Decision

We built the **`@myk9/replication` package** -- an offline-first replication layer using IndexedDB as the local store and Supabase as the remote backend.

The core abstraction is the `ReplicatedTable<T>` base class, which provides:
- **Offline-first data access** -- reads always hit the local IndexedDB cache first
- **Automatic cache management** with configurable TTL per table
- **Optimistic updates** with version tracking -- local state updates immediately, sync happens in the background
- **Subscription-based reactive updates** -- components receive live data changes
- **LRU/LFU cache eviction** to manage memory within IndexedDB limits
- **Conflict resolution** via version comparison on sync
- **Batch operations** for efficient bulk data loading

Each domain table (classes, entries, scores, etc.) extends `ReplicatedTable` and adds table-specific query methods. Usage is straightforward:
```typescript
import { replicatedClassesTable } from '@myk9/replication';
await replicatedClassesTable.updateClassStatus(classId, status);
```

The system separates concerns with extracted managers:
- `ReplicatedTableCacheManager` -- handles TTL, eviction, and cache statistics
- `ReplicatedTableBatchManager` -- handles bulk operations and transaction tracking
- `DatabaseManager` -- manages the IndexedDB connection lifecycle

Dependencies are injected (logger, TTL config) to keep the replication layer testable and decoupled from app-specific concerns.

## Consequences

### Positive
- Judges can score an entire show day without any internet connection
- Sub-millisecond reads from local cache provide a responsive UI even on low-end devices
- Optimistic updates make the app feel instant -- no spinner waiting for server confirmation
- The `ReplicatedTable` abstraction is generic and reusable across all domain tables
- IndexedDB storage limits are generous enough for months of show data

### Negative
- IndexedDB API complexity is hidden by `idb` but still surfaces in edge cases (transaction scoping, upgrade handling)
- Conflict resolution adds complexity -- version tracking and merge logic must be tested thoroughly
- Browser IndexedDB implementations vary slightly; occasional issues on older Safari versions
- The replication layer is the most complex shared package and currently has low test coverage (tracked as DEBT-015)

### Neutral
- myK9Show does not currently use offline-first patterns (it assumes connectivity) but could adopt `@myk9/replication` in the future
- The `idb` library (v8) is the only runtime dependency of `@myk9/replication`
- Slow queries (exceeding a configurable threshold) are logged for performance monitoring
