# dog-identity-deduplication Specification

## Purpose
Dog records use registry organization and number as an exact identity signal
when those values are present. Duplicate prevention happens in the database and
inside the existing Add Dog and Dog Details surfaces, so users can reuse or fix
records without a separate duplicate-management workflow.

## Requirements
### Requirement: Exact registry identities are unique across live dogs

The system SHALL prevent the same non-empty normalized organization and registration number from being attached to more than one live dog.

#### Scenario: Duplicate registry number is rejected

- **WHEN** a dog registration is saved with the same normalized organization and registration number as another live dog
- **THEN** the save fails or returns the existing dog instead of creating a second live dog

#### Scenario: Same dog keeps one registration per organization

- **WHEN** a dog already has a registration for an organization and the user saves another registration for that organization
- **THEN** the existing per-dog registration is updated instead of creating a second same-organization row for that dog

#### Scenario: Soft-deleted dogs do not block reuse

- **WHEN** a registration number exists only on a soft-deleted dog
- **THEN** a live dog can save that normalized organization and registration number

### Requirement: Registry identity comparison is normalized

The system SHALL compare registry identities using normalized organization and registration number values while preserving the user's original display value.

#### Scenario: Case and separator variants match

- **WHEN** one dog has AKC registration number `DN-12345678` and another save uses organization `akc` with number `dn 12345678`
- **THEN** the system treats both values as the same exact registry identity

#### Scenario: Display value remains intact

- **WHEN** a registration number is saved with user-entered formatting
- **THEN** the stored display registration number remains available for forms, reports, and exports

### Requirement: Dog creation with registrations is duplicate-aware

The system SHALL make atomic dog creation with registrations check exact registry identities before inserting a new dog row.

#### Scenario: Existing exact registry is reused

- **WHEN** a user creates a dog with a registration that already belongs to a live dog visible to the operation
- **THEN** the operation identifies the existing dog and does not create a second dog row

#### Scenario: Registration insert conflict rolls back new dog

- **WHEN** a registration conflict is detected after the local dog row was optimistically added
- **THEN** the new local dog is rolled back and the user sees a plain duplicate-dog message

### Requirement: Cross-organization duplicate candidates are suggested

The system SHALL suggest likely existing dog records before creating a second dog when the entered dog details strongly match an existing dog under another organization.

#### Scenario: Strong same-dog candidate is shown

- **WHEN** a user enters a UKC registration for a dog whose owner, registered name or call name, breed, sex, and date of birth strongly match an existing AKC dog
- **THEN** the existing dog is offered as the destination for the new UKC registration

#### Scenario: Candidate suggestion requires confirmation

- **WHEN** a likely same-dog candidate is shown
- **THEN** the system does not attach the new registration or skip dog creation until the user confirms the existing dog

#### Scenario: Weak matches do not block creation

- **WHEN** entered dog details do not produce an exact registry or strong same-dog match
- **THEN** the user can continue creating a new dog

### Requirement: Duplicate prevention stays in existing dog surfaces

The system SHALL surface duplicate prevention and same-dog matching inside existing Add Dog and Dog Details registration workflows.

#### Scenario: No duplicate-management page is required

- **WHEN** a duplicate or candidate match is detected while creating a dog or adding a registration
- **THEN** the user can resolve the situation from the current Add Dog or Dog Details registration flow

#### Scenario: User-facing duplicate copy is calm and plain

- **WHEN** an exact duplicate or likely match is shown
- **THEN** the copy explains the existing dog option without raw database error text or technical constraint names
