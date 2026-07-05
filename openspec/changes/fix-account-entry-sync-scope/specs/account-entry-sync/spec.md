## ADDED Requirements

### Requirement: Account-level entry reads reconcile empty local replicas

The system SHALL verify the authenticated online entry-results view when an account-level exhibitor entry read finds no matching rows in the local entries replica.

#### Scenario: Online account read with cold local replica

- **WHEN** the signed-in exhibitor opens My Shows and the local entries replica contains no matching entries
- **THEN** the system SHALL read the authenticated entry-results view scoped to the exhibitor's own entries

#### Scenario: Online view has entries missing from local replica

- **WHEN** the authenticated entry-results view returns own entries that are absent from the local replica
- **THEN** the My Shows read result SHALL use those online rows instead of rendering an empty entries result

#### Scenario: Online view unavailable

- **WHEN** the local entries replica is empty and the authenticated entry-results view cannot be reached
- **THEN** the system SHALL return the local empty result without surfacing a blocking error

### Requirement: Sync scope terminology is explicit

The myK9Show replication provider SHALL describe its optional sync input as a sync scope rather than a license key.

#### Scenario: Global account sync has no scope

- **WHEN** the global replication provider runs from account-level myK9Show pages
- **THEN** the provider SHALL pass an empty sync scope to tables that support unscoped sync and SHALL NOT imply that a myK9Show license key is required
