# offline-scoring-durability Specification

## Purpose
A judge's offline score must be durably persisted before success is shown, never silently dropped by recovery/retry/eviction, uploaded in the order it was made, and reported through truthful, attributable sync status.

## Requirements
### Requirement: A queued score is durably persisted before success is shown

The scoring submit path SHALL confirm the score is written to the durable mutation queue (IndexedDB plus the synchronous localStorage backup) before it transitions the scoresheet to a completed/success state or navigates away. If the write to the queue throws, or the queue returns no mutation id, the system SHALL surface a blocking error and MUST NOT show a success state.

#### Scenario: Queue write fails on submit
- **WHEN** a judge submits a score and the durable queue write throws (e.g. queue overflow at the 1000-mutation cap, IndexedDB write failure, or the entry is missing from the local cache)
- **THEN** the scoresheet does not transition to completed, does not navigate away, and shows a blocking error telling the judge the score was not saved

#### Scenario: Queue returns no mutation id
- **WHEN** the queue call returns a `null` mutation id (e.g. no MutationManager is wired)
- **THEN** the submit is treated as a failure and surfaces a blocking error rather than reporting success

#### Scenario: Successful queue write
- **WHEN** a judge submits a score and the queue write resolves with a mutation id
- **THEN** the score is present in both IndexedDB and the localStorage backup, and only then does the UI report success

### Requirement: No silent drop through recovery, retry, or eviction

The system SHALL NOT destroy an unsynced or dead-lettered score as a side effect of internal recovery, error classification, or storage reclamation.

#### Scenario: Circuit-breaker recovery
- **WHEN** the replication circuit breaker trips and the database is deleted and recreated
- **THEN** pending and failed mutations are snapshotted before deletion and restored after the database re-opens, so no queued or dead-lettered score is lost

#### Scenario: Unknown error during upload
- **WHEN** a mutation upload fails with an error that is not affirmatively classified as permanent (e.g. `AbortError`, a statement-timeout code, an unrecognized 5xx body)
- **THEN** the mutation is retried within its full retry budget rather than dead-lettered on the first attempt

#### Scenario: Permanent error during upload
- **WHEN** a mutation upload fails with an affirmatively permanent error (RLS denial, 4xx validation, constraint violation)
- **THEN** the mutation dead-letters to the reviewable failed store and is not retried indefinitely

#### Scenario: Quota eviction under storage pressure
- **WHEN** storage reclamation runs to relieve quota pressure
- **THEN** it never evicts a dirty (unsynced) row or a pending/failed mutation

### Requirement: Concurrent access does not clobber an unsynced score

Read paths that update row metadata SHALL NOT overwrite a concurrent dirty write. Rapid successive edits to the same row SHALL upload in the order they were made.

#### Scenario: Access-tracking races a score save
- **WHEN** a row read updates access-tracking metadata while a concurrent score save marks the same row dirty
- **THEN** the dirty flag and the new score value are preserved (the metadata update does not put back a stale clean copy of the row)

#### Scenario: Two rapid edits to the same entry
- **WHEN** a judge enters a value and corrects it within the same millisecond
- **THEN** the two mutations carry a monotonic sequence and upload oldest-first, so the correction is the final server value and cannot be reverted by a re-stamped stale payload

#### Scenario: Second tab uploading concurrently
- **WHEN** two browser tabs attempt to upload the pending queue at the same time
- **THEN** a cross-tab lock serializes upload, and an OCC-rejected mutation is not re-inserted after it was deleted (no zombie mutation)

### Requirement: Persistence is requested and failures to persist are surfaced

The app SHALL request persistent storage so the browser does not silently evict unsynced scores, and SHALL NOT fail a durably-queued score because an auxiliary write (localStorage backup) failed.

#### Scenario: Request persistent storage
- **WHEN** the app starts and when a judge enters the at-show scoring surface
- **THEN** the app requests `navigator.storage.persist()` and, on iOS Safari where persistence is not granted and unsynced work exists, nudges the user to Add to Home Screen

#### Scenario: Backup write fails but queue write succeeded
- **WHEN** the IndexedDB queue write succeeds but the localStorage backup write throws (e.g. localStorage full)
- **THEN** the submit still reports success (the backup failure is logged, not fatal) and the score remains queued for upload

### Requirement: Sync status shown to the user is truthful and attributable

Surfaces that report sync state SHALL reflect real replication state, and the scoring surface SHALL show the count of unsynced scores whenever any are pending.

#### Scenario: Sync status panels reflect real state
- **WHEN** a user views the account menu or sync-status panel
- **THEN** the displayed status, pending count, and last-sync time come from real replication state, never randomized placeholder values

#### Scenario: Pending scores while idle
- **WHEN** scores are queued but no sync is actively in progress (offline, or in retry backoff)
- **THEN** the ringside header shows the number of scores waiting to sync and the last successful sync time, so a judge can tell whether it is safe to close the iPad

#### Scenario: A queued score fails permanently
- **WHEN** a queued score dead-letters
- **THEN** the judge is notified with enough context to identify which entry failed, with retry and discard options, re-surfaced on next sign-in

#### Scenario: Queue overflow
- **WHEN** the mutation queue reaches capacity and rejects a new score
- **THEN** a listener surfaces a visible overflow warning rather than failing silently

### Requirement: Full score detail is persisted to the server

The scoring submit path SHALL persist the complete score detail collected by the scoresheet, not only summary fields.

#### Scenario: Multi-area scent work score
- **WHEN** a judge submits a scent work score with per-area times, correct/incorrect counts, points, and an NQ reason
- **THEN** all of those fields are written through the mutation queue to their whitelisted server columns, not retained only in local session state
