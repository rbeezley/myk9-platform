## ADDED Requirements

### Requirement: Premium publishing completes or provides actionable recovery

The canonical publish flow SHALL publish one append-only versioned premium artifact and matching show experience state for a valid show, SHALL commit a validated Storage path and its exactly matching public URL atomically, SHALL reject completion of superseded attempts, SHALL be safe to retry after partial progress, and SHALL distinguish known correctable requirements from unknown failures without exposing technical payloads.

#### Scenario: Valid show publishes successfully

- **WHEN** an authorized organizer publishes a valid premium
- **THEN** the premium artifact and experience state are published and the user sees a clear success state

#### Scenario: Versioned path and URL are committed together

- **WHEN** an organizer completes a publish
- **THEN** the database persists the validated storage path and the exact URL derived for that path in one transaction; readers use the trusted path for the versioned artifact

#### Scenario: New published bytes remain immutable

- **WHEN** an organizer has published an artifact
- **THEN** organizer credentials cannot update or delete that object and the bucket rejects non-PDF or oversized uploads

#### Scenario: Legacy flat paths remain rollback-compatible during rollout

- **WHEN** the currently deployed or rollback app uses an exact `<show-id>.pdf` path
- **THEN** its temporary compatibility policies allow that legacy object shape to be inserted, updated, or deleted by an authorized organizer, and a later legacy publish invalidates any older versioned path so new-app readers show the latest premium

#### Scenario: Legacy upsert visibility stays show-scoped

- **WHEN** an authenticated manager or club-scoped secretary updates the legacy flat object for an authorized show
- **THEN** the database allows row visibility required for Storage upsert only for that exact legacy object, while anonymous users and organizers for other shows cannot enumerate it or versioned artifacts

#### Scenario: New app rolls out before the database

- **WHEN** the new app calls either publication RPC and it is absent from the old database schema, or reads the not-yet-added path column
- **THEN** it uses the legacy flat publisher only for a structured missing-function/schema-cache error, retries the read with legacy columns only for a structured missing-column error, and reads the legacy URL

#### Scenario: Versioned publication rolls out with the new database

- **WHEN** the new app stages a versioned PDF and commits it
- **THEN** one authorized RPC validates the exact allowed public origin plus object path and atomically stores path, URL, publish version, timestamp, and experience snapshot

#### Scenario: Legacy publisher supersedes versioned publication

- **WHEN** an old app publishes a new flat PDF after a versioned publication
- **THEN** the database clears the stale versioned path and version, invalidates in-flight attempts, and the new app displays the legacy URL for that latest publication

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

#### Scenario: Retry identity includes every output-affecting option

- **WHEN** the same show retries with the same validated premium and inkSaver setting
- **THEN** it may reuse that exact artifact and version, while changed premium or inkSaver receives a new artifact/version and cannot join a different in-flight intent

#### Scenario: Invalid persisted attempts are discarded

- **WHEN** a saved retry payload is corrupt or from an unsupported schema version
- **THEN** the coordinator discards it and starts a fresh attempt rather than reusing unvalidated bytes

#### Scenario: Known failure gives actionable header recovery

- **WHEN** publishing from the header fails because a known required field or configuration is missing
- **THEN** the header presents plain-English corrective guidance and an available retry without exposing raw technical details

#### Scenario: Unknown failure

- **WHEN** publishing fails for an unclassified reason
- **THEN** the UI offers a safe retry and logs technical evidence without exposing it to the organizer
