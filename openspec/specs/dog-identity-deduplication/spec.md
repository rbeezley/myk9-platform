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

### Requirement: Add Dog starts with the registry identity

The Add Dog form SHALL ask for registry organization and registration number before any other dog detail. It SHALL look up that identity before the user continues, using normalized comparison. While offline it SHALL check the dogs available on the device. While online it SHALL also check the server.

#### Scenario: An existing dog is found first

- **WHEN** a secretary enters a registry and number that belong to a live dog
- **THEN** the form shows that dog by call name and offers to use it before asking for any other detail, and choosing it creates no new dog

#### Scenario: No match continues with the number filled in

- **WHEN** the entered registry identity matches no live dog
- **THEN** the form continues to the dog's details with that registration already recorded as the dog's first registration

#### Scenario: Offline lookup uses what the device holds

- **WHEN** the device is offline
- **THEN** the lookup checks the dogs on the device, does not wait on the network, and lets the user continue when there is no local match

### Requirement: A foreign-owner match reveals nothing

When the entered registry identity belongs to a live dog the user cannot see, the system SHALL tell the user only that the number is already registered to another dog and to contact the show secretary. The server lookup SHALL return whether the identity is taken and nothing else: no dog, owner or registration details.

#### Scenario: Exhibitor enters another owner's number

- **WHEN** an exhibitor enters a registry and number that belong to a dog owned by someone else
- **THEN** the form says the number is already registered to another dog and to contact the show secretary, shows no name, owner or details, and does not create the dog

#### Scenario: Lookup response carries no identity data

- **WHEN** any caller asks the server whether a registry identity is taken
- **THEN** the response is a yes or no answer only

### Requirement: Only secretaries may add a dog with no registration

The Add Dog form SHALL offer "No registration number yet" only to users who manage shows (secretary, club admin, site admin). That path skips the lookup and creates a dog with no registration. Exhibitors SHALL always start with a registration.

#### Scenario: Secretary skips the number

- **WHEN** a secretary chooses "No registration number yet"
- **THEN** the form continues to the dog's details with no registration recorded

#### Scenario: Exhibitor has no skip

- **WHEN** an exhibitor opens Add Dog
- **THEN** no "No registration number yet" option is shown, and the registration step must be completed to continue
