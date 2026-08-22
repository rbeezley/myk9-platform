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

The replication core SHALL serialize cross-tab uploads when Web Locks are available, retain a working fallback when they are unavailable, and MUST NOT resurrect a mutation that another uploader deleted. If an upload is requested while a same-tab pass is already running, the runner MUST schedule a follow-up pass after the active pass exits so mutations queued after its pending snapshot are not stranded. Dirty local rows and forward-only server-version tokens MUST remain protected by the existing atomic transaction boundaries.

#### Scenario: Mutation arrives after the active upload snapshot
- **WHEN** an upload pass is running, a new mutation is queued after that pass captured its pending snapshot, and the new mutation's upload attempt overlaps the active pass
- **THEN** the active pass completes and one follow-up pass uploads the new mutation without requiring an unrelated sync trigger

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

### Requirement: Durable mutations are isolated by authenticated owner

The replication core SHALL persist the originating authenticated user id on every newly queued mutation and SHALL only execute, retry, expose for failure review, or discard a mutation for that same authenticated identity. The system MUST preserve mutations belonging to another identity without attempting them so shared-device account changes cannot replay one user's writes under another user's authority.

#### Scenario: Authenticated user queues an offline mutation

- **WHEN** an authenticated user queues a mutation while online or offline
- **THEN** the durable IndexedDB row records that user's auth id before queueing reports success, and every successfully written local backup preserves that id

#### Scenario: No authenticated owner is available at enqueue time

- **WHEN** application code attempts to queue a mutation without an authenticated user id
- **THEN** queueing fails before a pending mutation is persisted or success is reported

#### Scenario: A different user signs in on the same device

- **WHEN** a queued mutation belongs to user A and the active Supabase session belongs to user B
- **THEN** the upload pass does not execute, retry, dead-letter, discard, or otherwise modify user A's mutation

#### Scenario: Mixed-owner queue drains for the active user

- **WHEN** a durable queue contains independent mutations for users A and B and user B is authenticated
- **THEN** user B's mutations remain eligible to upload while user A's mutations remain held durably

#### Scenario: Current-owner mutation depends on a held mutation

- **WHEN** a current-owner mutation depends on a foreign-owner or legacy mutation that cannot execute
- **THEN** the dependent mutation also remains held and cannot leapfrog its unresolved prerequisite

#### Scenario: Auth identity changes during an upload pass

- **WHEN** the active authenticated identity changes after an upload pass starts but before another queued mutation executes
- **THEN** the runner re-evaluates ownership and does not execute the remaining mutation under the changed identity

#### Scenario: Auth identity resolution fails

- **WHEN** the system cannot reliably resolve the active authenticated identity during enqueue, upload, retry, review, or discard
- **THEN** the operation fails closed without modifying or executing any queued or failed mutation

#### Scenario: Original owner returns

- **WHEN** a held mutation belongs to user A and user A later becomes the active authenticated identity
- **THEN** the mutation becomes eligible for the established upload, dependency, retry, and conflict-resolution flow

#### Scenario: Legacy mutation has no owner metadata

- **WHEN** an upload or failure-review path encounters a mutation persisted by an older client without an authenticated owner id
- **THEN** the mutation is preserved but is not adopted, uploaded, retried, exposed for another user's review, or discarded automatically

#### Scenario: Owner-bound queue is backed up and restored

- **WHEN** pending or failed mutations are serialized to local backup and later restored after IndexedDB recovery
- **THEN** their authenticated owner ids are preserved and the same identity-isolation rules continue to apply

#### Scenario: Backup contains malformed owner metadata

- **WHEN** a backup mutation has an authenticated owner field that is present but is not a non-empty string
- **THEN** that malformed row is rejected from restore rather than treated as a valid owner-bound or legacy mutation

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
