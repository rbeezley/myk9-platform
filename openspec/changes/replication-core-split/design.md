## Context

`packages/replication/src/MutationManager.ts` and `packages/replication/src/core/ReplicatedTable.ts` coordinate offline-first persistence for show-day data. Both classes already use extracted helpers and collaborators, but still combine several independently testable responsibilities. Plan 007 completed the code-level investigation and froze the API surface, incident-derived invariants, extraction boundaries, and phase gates.

The active app consumes the package through `sharedMutationManager.ts` and roughly ten `Replicated*Table` subclasses. Those consumers, the package barrel, and all existing persistence and event contracts must remain unchanged. This is not UX-facing work and does not introduce pages, components, hooks, or a new mutation/query layer; it decomposes the existing replication implementation behind its current interfaces.

## Goals / Non-Goals

**Goals:**

- Reduce `MutationManager` to a facade over focused internal modules.
- Extract query and row-lock responsibilities from `ReplicatedTable` without breaking its template-method inheritance model.
- Pin reliability behavior through public APIs before moving implementation blocks.
- Preserve offline durability, mutation ordering, cross-tab serialization, conflict handling, transaction boundaries, and application event contracts.
- Keep every new production module below 500 lines and keep the resulting classes cohesive.

**Non-Goals:**

- Change any public or protected signature, package export, event name, or event payload.
- Change mutation, upload, retry, backup, conflict, row-reconciliation, or query behavior.
- Extract `ReplicatedTable`'s conflict lifecycle or edit app-side table subclasses.
- Add UI, storage mechanisms, dependencies, migrations, or opportunistic cleanup.
- Force `ReplicatedTable` below 500 lines; the expected cohesive result remains approximately 780 lines.

## Decisions

### Preserve `MutationManager` as the public facade

The constructor will create internal `MutationQueueStore` and `MutationUploadRunner` collaborators, mirroring the proven cache-manager and batch-manager pattern already used by `ReplicatedTable`. Public methods delegate one-to-one and retain byte-identical signatures. Backup orchestration stays on the facade to avoid a collaborator-to-facade import cycle; the upload runner receives a backup callback.

Alternative considered: replace `MutationManager` at call sites with several exported services. Rejected because it would expand the package API, alter the single production instantiation, and spread orchestration into app code.

### Extract pure behavior before stateful collaborators

`mutation-execute.ts` will own mutation execution and duplicate-key classification as parameterized pure functions. `mutation-row-sync.ts` will own replicated-row synchronization helpers that take the database explicitly. These move first because they have no lifecycle state and make later collaborator moves smaller.

Alternative considered: extract stateful upload code first. Rejected because it creates a larger first diff and makes failures harder to localize.

### Give each collaborator only its own mutable state

`MutationQueueStore` owns the sequence counter and seed promise. `MutationUploadRunner` owns upload/backoff timers and upload-in-progress state. Dependencies are constructor-injected rather than reached through the facade. Queue orchestration order remains on the facade: capacity check, persistence, synchronous backup attempt, queued event, and optional schedule.

`mutation-upload-events.ts` owns only the existing queue-overflow, upload-complete, and sync-failure event construction/dispatch plus the adjacent upload-result summary filtering/logging. This approved internal boundary keeps `MutationUploadRunner` below the repository's 500-line ceiling without moving timer state, changing event contracts, or introducing another stateful collaborator.

Alternative considered: a shared mutable context object. Rejected because it obscures ownership and makes lifecycle cleanup less explicit.

Alternative considered: allow a 518-line corrected runner or split scheduling into another stateful collaborator. Both were rejected: exceeding the file ceiling violates repository policy, while a scheduler collaborator would fragment timer ownership. Keeping all upload-event dispatch and its adjacent result summary in one stateless helper is the smallest behavior-preserving boundary.

### Keep `ReplicatedTable` as the template-method base class

`ReplicatedTableQueryManager<T>` will receive the table name, logger, initialization callback, expiry callback, and local `getAll` fallback. `RowLockRegistry` will own the lock map and expose `withRowLock(id, fn)`. CRUD and conflict lifecycle orchestration stay in `ReplicatedTable` because they cross existing collaborators and protected hooks.

Alternative considered: split conflict orchestration into another manager. Rejected because it would add indirection across the class's core responsibility and exceed the plan's behavior-preserving scope.

### Use characterization-first, risk-ascending phases

Phase 0 adds or identifies public-API tests for ten frozen invariants. Later phases move code verbatim in increasing statefulness: pure helpers, queue store, upload runner, then table query and row locks. Existing behavioral comments move with their implementation blocks. Every phase runs the same full gate and receives a checkpoint commit.

Alternative considered: one mechanical extraction commit. Rejected because the durability-critical blast radius would make regression localization and review weaker.

## Risks / Trade-offs

- **Moved code accidentally changes sequencing or transaction scope** → pin the invariant first, move blocks verbatim with comments, and stop if an existing test must be edited.
- **Collaborator wiring introduces cycles or stale callbacks** → inject concrete dependencies and a facade-owned backup callback; do not import the facade from collaborators.
- **Tests pass while a pin does not exercise the claimed invariant** → use assertion-first tests and deliberately break/restore an invariant when the existing harness does not prove the assertion bites.
- **Smaller files create excessive indirection** → use only the boundaries already proven in-package and retain CRUD/conflict orchestration in `ReplicatedTable`.
- **Full gates are expensive** → retain them because offline replication is high risk; stop rather than loop if a suite hangs beyond the repository limit.

## Migration Plan

1. Add or confirm the ten pinning cases against the unchanged implementation.
2. Extract pure mutation modules and pass the full gate.
3. Extract `MutationQueueStore` and pass the full gate.
4. Extract `MutationUploadRunner` plus the approved internal upload-event helper and pass the full gate.
5. Extract `ReplicatedTableQueryManager` and `RowLockRegistry` and pass the full gate.
6. Verify source sizes, unchanged exports/signatures/events, moved comments, and all tests.
7. Merge through the normal PR and CI path; no runtime data migration or deployment action is required.

Rollback is a normal code revert of the affected commit or phase. There is no schema or persisted-data transformation.

## Open Questions

None. Plan 007 freezes the implementation boundaries and stop conditions.
