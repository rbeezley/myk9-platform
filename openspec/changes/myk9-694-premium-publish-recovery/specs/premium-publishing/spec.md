## ADDED Requirements

### Requirement: Premium publishing completes or provides actionable recovery

The canonical publish flow SHALL publish one append-only versioned premium artifact and matching show experience state for a valid show, SHALL use a trusted storage path rather than a caller-supplied URL, SHALL reject completion of superseded attempts, SHALL be safe to retry after partial progress, and SHALL distinguish known correctable requirements from unknown failures without exposing technical payloads.

#### Scenario: Valid show publishes successfully

- **WHEN** an authorized organizer publishes a valid premium
- **THEN** the premium artifact and experience state are published and the user sees a clear success state

#### Scenario: Published artifact identity is trusted

- **WHEN** an organizer completes a publish
- **THEN** the database persists the validated storage path and consumers derive the public URL from trusted Supabase configuration

#### Scenario: New published bytes remain immutable

- **WHEN** an organizer has published an artifact
- **THEN** organizer credentials cannot update or delete that object and the bucket rejects non-PDF or oversized uploads

#### Scenario: Legacy flat paths remain rollback-compatible during rollout

- **WHEN** the currently deployed or rollback app uses an exact `<show-id>.pdf` path
- **THEN** its temporary compatibility policies allow that legacy object shape to be inserted, updated, or deleted by an authorized organizer, and a later legacy publish invalidates any older versioned path so new-app readers show the latest premium

#### Scenario: Required data or configuration is missing

- **WHEN** a known required field or configuration prevents publishing
- **THEN** the UI identifies the specific correction and does not claim success

#### Scenario: Retry follows partial progress

- **WHEN** an earlier attempt uploaded the stable PDF but a later metadata step failed
- **THEN** retry converges on one artifact and complete show state without duplicate published data

#### Scenario: A stale attempt finishes after a newer attempt

- **WHEN** an older publish attempt resumes after the show has begun or completed a newer attempt
- **THEN** the server rejects the older completion without changing the last-good published state

#### Scenario: Every publish surface shares recovery state

- **WHEN** publishing starts from any existing premium action or editor surface
- **THEN** it uses the same per-show attempt coordinator, duplicate-submit latch, and retry identity

#### Scenario: Unknown failure

- **WHEN** publishing fails for an unclassified reason
- **THEN** the UI offers a safe retry and logs technical evidence without exposing it to the organizer
