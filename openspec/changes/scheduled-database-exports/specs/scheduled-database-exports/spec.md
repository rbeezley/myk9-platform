## ADDED Requirements

### Requirement: Complete encrypted export

The export command MUST create a PostgreSQL custom-format dump and a globals export with
provider-managed role passwords excluded, encrypt both with authenticated encryption before
upload, and write a manifest containing the source project identifier, conservative snapshot
start/completion times, object keys, tool versions, sizes, and SHA-256 digests. It MUST fail
closed when a required dump section, compatible pinned client, or encryption key is unavailable.
The export is database recovery material, not a complete Supabase project reconstruction:
provider encryption-root/Vault keys, Storage object bytes, and managed-role password hashes are
outside its scope and MUST have separate recovery procedures.

#### Scenario: Successful export package

- **WHEN** the source database is reachable and the configured export role can read the required schemas
- **THEN** the command produces encrypted payloads and a non-sensitive manifest whose digests match the local ciphertext

#### Scenario: Missing privilege or key

- **WHEN** the database export or encryption precondition fails
- **THEN** the command exits non-zero, reports the failed precondition without secret values, and does not upload a success manifest

### Requirement: Independent private object upload

The scheduled job MUST upload encrypted payloads and the manifest to a private S3-compatible
bucket using credentials supplied through the CI secret store. It MUST verify the remote object
exists and matches the local digest before reporting success, and MUST NOT use GitHub artifacts as
the sole retention boundary.

#### Scenario: Verified upload

- **WHEN** all objects upload and remote metadata matches their local digests
- **THEN** the job records a successful export and exits zero

#### Scenario: Upload or verification failure

- **WHEN** an upload fails, the object is absent, or its digest cannot be verified
- **THEN** the job exits non-zero and the scheduled failure reporter can alert the operator

### Requirement: Cadence and stale detection

The workflow MUST attempt nightly exports Monday through Thursday and hourly exports Friday
through Sunday in UTC. A verification mode MUST fail when the newest successful manifest is older
than the configured cadence plus grace period and MUST identify the last successful timestamp.

#### Scenario: Weekend cadence

- **WHEN** the UTC day is Friday, Saturday, or Sunday
- **THEN** the workflow's scheduled attempt is hourly

#### Scenario: Stale or missing manifest

- **WHEN** no successful manifest exists or its age exceeds the allowed interval
- **THEN** verification exits non-zero with the expected and observed timestamps

### Requirement: Retention and restore gate

The system MUST support an explicit retention policy for encrypted payloads and manifests and the
runbook MUST require a successful restore into a disposable isolated destination before live
activation. Retention deletion MUST be separately reviewable and MUST never target the Supabase
source project.

#### Scenario: Retention selection

- **WHEN** an operator runs retention planning or an approved lifecycle rule evaluates objects
- **THEN** only objects older than the documented policy are selected, with a dry-run listing before deletion

#### Scenario: Isolated restore

- **WHEN** an export is selected for rehearsal
- **THEN** the operator decrypts it, restores it into a disposable destination, verifies core rows/policies/Auth metadata, and records the evidence without writing to the source

### Requirement: Honest data-loss boundary

The runbook MUST state that exports exclude Supabase Storage object bytes and cannot protect writes
made after the last successful export, delayed/failed jobs, or mutations still unsynced on a tablet.

#### Scenario: Between-export or offline mutation

- **WHEN** a failure occurs after a score is recorded but before a successful export or while a tablet is offline
- **THEN** the operator treats the score as potentially unrecovered and follows an independent score reconciliation procedure
