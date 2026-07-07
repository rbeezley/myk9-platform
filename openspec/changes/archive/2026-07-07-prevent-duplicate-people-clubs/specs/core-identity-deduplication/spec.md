## ADDED Requirements

### Requirement: Exact club identities are unique across live clubs

The system SHALL prevent two live clubs from sharing the same normalized exact club identity.

#### Scenario: Duplicate normalized club name is reused or rejected

- **WHEN** a user creates a club whose normalized name matches an existing live club
- **THEN** the system reuses the existing authorized club or rejects the insert without creating a second live club

#### Scenario: Club name comparison is normalized

- **WHEN** one club is named `Heartland Scent Work Club` and another create request uses `heartland  scent-work club`
- **THEN** the system treats both values as the same exact club identity

#### Scenario: Soft-deleted clubs do not block reuse

- **WHEN** a normalized club name exists only on a soft-deleted club
- **THEN** a live club can be created with that normalized name

### Requirement: Club creation is duplicate-aware

The system SHALL use a duplicate-aware club creation path for existing club creation surfaces.

#### Scenario: Existing exact club is returned

- **WHEN** a secretary creates a host club from the show wizard and a live club with the same normalized identity already exists
- **THEN** the wizard selects the existing club instead of inserting a duplicate club row

#### Scenario: Direct insert conflict remains user-friendly

- **WHEN** a club creation request encounters a database duplicate conflict
- **THEN** the user sees plain copy explaining that the club already exists, without raw database constraint names

### Requirement: Exact people identity uses email only

The system SHALL use non-deleted normalized email as the exact database-enforced people identity key.

#### Scenario: Duplicate person email is not inserted

- **WHEN** a person creation request uses an email already belonging to a non-deleted person
- **THEN** the system reuses the existing person where the flow supports reuse or rejects the insert without creating another people row

#### Scenario: Same person signup links existing row

- **WHEN** an unclaimed secretary-created person signs up with the same normalized email
- **THEN** the signup links the existing people row instead of creating a second person

#### Scenario: Matching name alone does not block person creation

- **WHEN** two different people share the same first and last name but do not share the same email
- **THEN** the system may suggest a likely match but MUST NOT block creation solely because the names match

### Requirement: Likely people and club duplicates are suggested in existing flows

The system SHALL suggest likely existing people or club records from loaded data before creating a duplicate when strong non-exact signals match.

#### Scenario: Likely person candidate is shown

- **WHEN** a user enters person details that match an existing loaded person by strong signals such as email, phone, full name, or address
- **THEN** the existing person is offered as a reuse option before creating a new person

#### Scenario: Likely club candidate is shown

- **WHEN** a user enters club details that match an existing loaded club by strong signals such as normalized name, website domain, email domain, or city/state
- **THEN** the existing club is offered as a reuse option before creating a new club

#### Scenario: Candidate suggestion requires confirmation

- **WHEN** a likely people or club candidate is shown
- **THEN** the system does not reuse the existing record or skip creation until the user confirms the existing record

#### Scenario: Weak matches do not block creation

- **WHEN** entered people or club details do not produce an exact identity conflict or strong likely match
- **THEN** the user can continue creating the new record

### Requirement: Duplicate prevention stays in existing people and club surfaces

The system SHALL surface duplicate prevention inside existing people and club creation workflows.

#### Scenario: No duplicate-management page is required

- **WHEN** a duplicate or likely match is detected while creating a person, exhibitor, official, judge, or club
- **THEN** the user can resolve the situation from the current creation flow without navigating to a duplicate-management page

#### Scenario: Mock duplicate sources are not used

- **WHEN** a duplicate warning appears in a production people or club creation surface
- **THEN** the warning is based on real loaded or queried data, not hard-coded mock records

#### Scenario: User-facing duplicate copy is calm and plain

- **WHEN** an exact duplicate or likely match is shown
- **THEN** the copy explains the existing record option without raw database error text or technical constraint names
