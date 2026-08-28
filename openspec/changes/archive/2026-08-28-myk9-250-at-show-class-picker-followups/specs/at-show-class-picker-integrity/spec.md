## Purpose

Keep the existing At-Show class picker truthful, non-duplicative, and responsive during live ringside entry updates while preserving offline-first availability.

## ADDED Requirements

### Requirement: Judge-only assigned classes render once

When a signed-in judge-only account has a known assignment set, the At-Show class picker SHALL present each assigned class once in the **Your ring** list and SHALL omit redundant trial sections containing the same rows. Accounts with broader staff capabilities SHALL retain the full trial-grouped picker in addition to any assignment emphasis.

#### Scenario: Judge-only assignments are known

- **WHEN** a judge-only account opens a show with one or more known assigned classes
- **THEN** each assigned class appears exactly once in the picker under **Your ring**
- **AND** duplicate trial sections are not rendered

#### Scenario: Broader staff account also judges

- **WHEN** an account with secretary or steward capabilities also has judge assignments
- **THEN** the full trial-grouped picker remains available for show-wide coordination

### Requirement: Live entry refresh avoids duplicate full-table work

After the initial class-picker load, an entry-table notification SHALL update entry-derived class counts and next-up previews from the notification snapshot without initiating a second full entry-table read or re-reading unchanged trial and class rows.

#### Scenario: Score write notifies the picker

- **WHEN** a replicated entry write notifies an already-loaded At-Show class picker
- **THEN** the affected show view refreshes its entry-derived counts and next-up preview from the supplied local snapshot
- **AND** no additional full entry-table read or unchanged trial/class read is performed for that notification

### Requirement: Cold-offline empty-state claims use persisted scope evidence

When the At-Show class picker has no classes while offline, it SHALL use persisted show-scoped replication metadata to distinguish a hydrated zero-class show from an unprimed or incomplete device. Volatile process-local table status alone SHALL NOT prove that the device is unprimed.

#### Scenario: Hydrated show genuinely has no classes

- **WHEN** the device is offline, the relevant trial and class scopes are persistently hydrated, and those scopes contain zero classes
- **THEN** the picker reports that the show has no classes
- **AND** it does not claim that classes have not reached the device

#### Scenario: Hydration cannot be proven

- **WHEN** the device is offline, no class rows are available, and persisted scope metadata does not prove complete hydration
- **THEN** the picker conservatively reports that classes are not on the device yet

### Requirement: Deliberate scoring fail-open remains an availability decision

Unknown judge-assignment cache state at the picker and preflight layers SHALL remain fail-open for navigation availability; the existing scoring capability gates and server-authoritative write boundary SHALL remain the enforcement controls. This change SHALL NOT add a new warning or blocking surface for the already documented interaction.

#### Scenario: Cold-offline assignment state is unknown

- **WHEN** a judge reaches the picker or scoresheet with an unknown cold-offline assignment cache
- **THEN** navigation remains available under the existing fail-open behavior
- **AND** write authorization is still decided by the existing capability and server enforcement boundaries
