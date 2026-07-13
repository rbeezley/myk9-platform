# replication-core-contract-preservation Specification

## Purpose

Preserve the replication package's public contracts, durability guarantees, lifecycle events, and failure semantics while its internal orchestration is decomposed into smaller collaborators.

## Requirements

### Requirement: Replication consumers retain the same API contracts

The replication package SHALL preserve every existing `MutationManager` public signature, every existing `ReplicatedTable` public and protected signature, and the existing `packages/replication/src/index.ts` export surface. New decomposition modules MUST remain internal to the package barrel.

#### Scenario: Existing application consumers compile after decomposition

- **WHEN** myK9Show and its `Replicated*Table` subclasses build against the decomposed replication package
- **THEN** they compile without consumer edits, renamed members, or new imports

#### Scenario: Package exports are compared before and after

- **WHEN** the package barrel is reviewed after the extraction
- **THEN** its exported names and paths are unchanged and none of the new internal collaborators are exported

### Requirement: Mutation ordering and deferred-upload behavior remain stable

The replication core SHALL seed mutation sequence numbers from persisted metadata and the maximum stored sequence, then increment them synchronously without an asynchronous gap. A mutation queued with immediate upload disabled SHALL remain persisted without scheduling upload until upload is explicitly requested.

#### Scenario: Same-tick mutations race

- **WHEN** two mutation queue calls run concurrently in the same tick
- **THEN** they receive distinct strictly increasing sequence numbers and upload oldest-first

#### Scenario: Sequence metadata is absent after reload

- **WHEN** a new manager starts with persisted mutations but without the sequence metadata record
- **THEN** its next mutation sequence is greater than the maximum persisted mutation sequence

#### Scenario: Upload scheduling is deferred

- **WHEN** a mutation is queued with immediate upload disabled
- **THEN** no upload starts until a later explicit upload request

### Requirement: Concurrent upload and row reconciliation preserve durable state

The replication core SHALL serialize cross-tab uploads when Web Locks are available, retain a working fallback when they are unavailable, and MUST NOT resurrect a mutation that another uploader deleted. Dirty local rows and forward-only server-version tokens MUST remain protected by the existing atomic transaction boundaries.

#### Scenario: OCC-rejected mutation was concurrently deleted

- **WHEN** an upload receives an OCC rejection after another tab has deleted the same stored mutation
- **THEN** the rejected upload does not write the mutation back into the queue

#### Scenario: Web Locks are unavailable

- **WHEN** `navigator.locks` is undefined
- **THEN** pending mutation upload still runs through the established fallback path

#### Scenario: Clean server data targets a dirty row

- **WHEN** a clean server write attempts to update a locally dirty row
- **THEN** the row's data and dirty state remain unchanged

#### Scenario: Remote version does not advance

- **WHEN** reconciliation receives a lower remote version, or equal data with no version advance
- **THEN** the local version never regresses and the equal no-advance case performs no write

### Requirement: Queue backup and execution outcomes remain stable

The replication core SHALL keep queue backups synchronous with queue operations, include failed mutations in backups, swallow auxiliary backup-storage failures after primary persistence succeeds, and continue treating an INSERT duplicate-key response with SQLSTATE `23505` as successful idempotent completion.

#### Scenario: Queue contains failed mutations

- **WHEN** a new mutation is queued while failed mutations already exist
- **THEN** the resulting backup contains both the new pending mutation and the existing failed mutations

#### Scenario: Failed mutation is discarded

- **WHEN** a failed mutation is explicitly discarded
- **THEN** the next backup no longer contains that mutation

#### Scenario: Auxiliary backup storage is full

- **WHEN** primary IndexedDB persistence succeeds but the synchronous localStorage backup throws
- **THEN** queueing still succeeds, the backup error is logged, and the persisted mutation remains eligible for upload

#### Scenario: Retried INSERT reports a duplicate primary key

- **WHEN** an INSERT upload receives SQLSTATE `23505` for its client-generated identifier
- **THEN** the upload is treated as successful and the pending mutation is deleted

### Requirement: Replication lifecycle events remain compatible

The replication core SHALL preserve the window event names `replication:queue-overflow`, `replication:mutation-queued`, `replication:upload-complete`, and `replication:sync-failed` and their existing detail shapes.

#### Scenario: Upload fails permanently

- **WHEN** an upload pass produces failed mutations
- **THEN** `replication:sync-failed` is dispatched with the existing `detail.count` contract

#### Scenario: Upload succeeds

- **WHEN** an upload pass completes successfully
- **THEN** `replication:upload-complete` is dispatched with the existing `detail.tables` contract

### Requirement: Replicated table queries and row locks retain their failure semantics

The replication core SHALL preserve query initialization, timeout and abort behavior, database failure reset/recording behavior, local fallback behavior, and per-row optimistic-update serialization when those responsibilities move into internal collaborators.

#### Scenario: Query initialization or IndexedDB access fails

- **WHEN** a replicated-table query cannot initialize, times out, aborts, or encounters an IndexedDB failure
- **THEN** it follows the same fallback, error propagation, and database failure-recording behavior as before decomposition

#### Scenario: Concurrent optimistic updates target one row

- **WHEN** multiple optimistic updates target the same row concurrently
- **THEN** the row-lock registry serializes those callbacks in the same order and releases the lock after success or failure

### Requirement: Internal decomposition is behavior-preserving and reviewable

The implementation SHALL move incident-history comments with their behavior, keep each new production module below 500 lines, keep `MutationManager.ts` at 500 lines or fewer and `ReplicatedTable.ts` at 1,000 lines or fewer, and SHALL stop if an existing behavior test requires modification to pass. These verified ceilings reflect the approved cohesive boundaries; further reduction MUST NOT widen this change into backup/restore or conflict-lifecycle extraction.

#### Scenario: An existing test fails after extraction

- **WHEN** an extraction phase causes an existing test to require an assertion, fixture, or expectation change
- **THEN** that phase is treated as a behavior change, reverted, and reported rather than accommodated

#### Scenario: Final source shape is reviewed

- **WHEN** implementation verification runs
- **THEN** all new production modules are below 500 lines, the two facade/base-class size targets are met, and spot checks confirm load-bearing comments moved with their code
