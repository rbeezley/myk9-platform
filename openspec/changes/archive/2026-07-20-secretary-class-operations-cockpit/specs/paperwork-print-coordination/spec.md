## ADDED Requirements

### Requirement: Paperwork Print requires explicit staff confirmation
The system SHALL create a Paperwork Print only after an authorized staff member explicitly confirms that the physical document printed.

#### Scenario: Report is opened or browser Print is invoked
- **WHEN** staff opens a report, generates or downloads a file, or invokes browser Print
- **THEN** the system does not create a Paperwork Print automatically
- **AND** offers a calm Mark printed or Not yet confirmation

#### Scenario: Paper was produced elsewhere
- **WHEN** authorized staff activates Record as printed for a scoped document
- **THEN** the system creates the same staff-confirmed Paperwork Print record
- **AND** identifies the acting staff member and time

### Requirement: Paperwork Print history is append-only and document-specific
The system SHALL create a separate record for every confirmed print or reprint, keyed by canonical report/document type and Report Scope, and SHALL show the latest valid covering record in normal cockpit state.

#### Scenario: Document is reprinted
- **WHEN** staff confirms a reprint of the same document and scope
- **THEN** a new history record is appended
- **AND** the cockpit shows the later actor and time without erasing the earlier record

#### Scenario: Different document types are printed
- **WHEN** a Class's check-in sheet and Result Labels are confirmed separately
- **THEN** each document type retains independent history and staleness
- **AND** no generic Class-paperwork timestamp replaces them

### Requirement: Mistaken confirmations are recoverable without history deletion
The system SHALL allow a Paperwork Print to be voided and SHALL preserve the mistaken record and correction metadata.

#### Scenario: Immediate Undo is activated
- **WHEN** staff activates Undo from the post-confirmation toast
- **THEN** the new record is marked void
- **AND** the cockpit falls back to the previous valid covering record or not confirmed

#### Scenario: Mistake is discovered later
- **WHEN** authorized staff marks a history record incorrect after the toast expires
- **THEN** the record stores who voided it, when, and the correction reason
- **AND** it no longer satisfies current print coverage

### Requirement: Paperwork Print works offline and preserves concurrent confirmations
The system SHALL save print confirmations and corrections locally through the established replication workflow and sync them later without last-write-wins loss.

#### Scenario: Secretary confirms while offline
- **WHEN** staff marks a document printed with no connectivity
- **THEN** the record saves on the device immediately
- **AND** shows calm pending-sync state until replay completes

#### Scenario: Two secretaries confirm the same document
- **WHEN** two devices create valid confirmations for overlapping scope before syncing
- **THEN** both append-only records survive synchronization
- **AND** no conflict dialog treats either confirmation as an overwrite

### Requirement: Only authorized report staff can confirm prints
The system SHALL require the existing Show/report management permission for creating or voiding Paperwork Prints.

#### Scenario: Co-secretary confirms a print
- **WHEN** a co-secretary with report access marks a document printed
- **THEN** the record is accepted and attributes that co-secretary

#### Scenario: User lacks report access
- **WHEN** an exhibitor or other user without access attempts to create or void a Paperwork Print
- **THEN** the operation is denied
- **AND** no shared print state changes

### Requirement: Broader-scope prints retain child coverage
The system SHALL store the included subjects and document fingerprints for Show- and Trial-scope prints so child Classes can derive coverage without creating duplicate Class records.

#### Scenario: Trial report batch covers several Classes
- **WHEN** staff confirms a Trial-scope print containing several Classes
- **THEN** one Paperwork Print stores the Trial scope and included Class coverage
- **AND** each included Class can display that it was printed as part of the Trial print

#### Scenario: One included Class later changes
- **WHEN** relevant data changes for one Class after a broader print
- **THEN** only that Class's derived coverage becomes stale
- **AND** the original broader print remains in history

#### Scenario: Class-only reprint follows a broader print
- **WHEN** staff confirms a Class-scope reprint
- **THEN** that record becomes the latest valid covering record for that Class/document
- **AND** sibling Class coverage from the broader print remains unchanged

### Requirement: Print staleness is document-specific
The system SHALL compare each valid Paperwork Print against only the recorded data relevant to its document type.

#### Scenario: Run order changes after score sheets print
- **WHEN** a covered Entry's run order or relevant lifecycle changes after score-sheet confirmation
- **THEN** the Class shows that the score sheets were printed but the Class changed afterward
- **AND** offers Review and reprint

#### Scenario: Result changes after Result Labels print
- **WHEN** a covered Entry's score, result status, placement, or relevant Class identity changes
- **THEN** the Result Labels show stale coverage
- **AND** unrelated payment or contact changes do not make them stale

#### Scenario: No relevant data changed
- **WHEN** data unrelated to a document changes after printing
- **THEN** that document's Paperwork Print remains current

### Requirement: Missing confirmation creates only a calm reminder
The system SHALL treat missing Paperwork Print evidence as not confirmed rather than proof the paper was not produced.

#### Scenario: Class starts within thirty minutes
- **WHEN** required preparation paperwork has no valid covering record
- **THEN** the cockpit may show a low-priority not confirmed printed reminder
- **AND** offers Print and Already printed actions

#### Scenario: Secretary continues without confirmation
- **WHEN** staff starts or scores the Class without a Paperwork Print
- **THEN** the system allows the work
- **AND** does not use print confirmation as a lifecycle gate
