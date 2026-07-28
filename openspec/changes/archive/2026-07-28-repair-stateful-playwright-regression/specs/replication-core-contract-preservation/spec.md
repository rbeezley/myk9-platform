## MODIFIED Requirements

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
