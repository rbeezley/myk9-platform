## ADDED Requirements

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
