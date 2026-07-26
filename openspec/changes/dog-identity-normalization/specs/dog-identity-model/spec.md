## ADDED Requirements

### Requirement: A dog is identified by its call name

The dog record SHALL carry the dog's call name as its required identifier. No other name field on the dog record SHALL be required, and no field on the dog record SHALL be presented or documented as the dog's registered name.

#### Scenario: Call name is required

- **WHEN** a dog record is created
- **THEN** a call name is required
- **AND** no registered-name value is required on the dog record

#### Scenario: Legacy name column is not a registered name

- **WHEN** the dog record is read
- **THEN** no consumer treats a legacy dog-level name column as an organization's registered name

### Requirement: Registered name, breed, and variety belong to a registration

Registered name, breed, and variety SHALL be stored on the registration for a specific organization. The dog record SHALL NOT store any of them. A dog MAY hold registrations with several organizations, and their values MAY differ.

#### Scenario: Registration carries the identity attributes

- **WHEN** a registration is created for an organization
- **THEN** the registered name, breed, and variety recorded for that organization are stored on that registration

#### Scenario: Values may differ between organizations

- **WHEN** a dog holds registrations with two organizations recording different registered names or breeds
- **THEN** both values are retained independently
- **AND** neither overwrites the other

#### Scenario: Dog record holds none of them

- **WHEN** the dog record is inspected
- **THEN** it holds no breed, registered name, or variety

### Requirement: A dog may exist without a registration

Creating a dog SHALL NOT require a registration. A dog without a registration SHALL be a valid, fully usable record, identified by its call name.

#### Scenario: Dog created before registering

- **WHEN** an owner creates a dog and adds no registration
- **THEN** the dog is created successfully
- **AND** it can be viewed, edited, and searched by call name

#### Scenario: Registration completed later

- **WHEN** the owner later adds a registration for that dog
- **THEN** the registered name, breed, and variety recorded on it become available for that organization

### Requirement: No substitute value is stored, displayed, or transmitted

The system SHALL NOT store, display, or transmit a substitute value for an identity attribute the owner has not supplied. This includes any concrete breed such as "Mixed Breed" for a dog with no registration. Disclosing a substitute does not satisfy this requirement, because the stored value can reach entry paperwork and organization submissions.

#### Scenario: Unregistered dog has no breed

- **WHEN** a dog has no registration
- **THEN** no breed value is stored for it
- **AND** every surface renders an empty state rather than a concrete breed

#### Scenario: Substitute values never reach paperwork

- **WHEN** an entry, entry blank, or organization submission is produced for a dog with no supplied breed
- **THEN** no substitute breed is transmitted

#### Scenario: Call name is not reused as a registered name

- **WHEN** a dog is created with a call name and no registration
- **THEN** no registered name is stored or displayed for that dog

### Requirement: Organization-scoped surfaces resolve from that organization's registration

A surface concerning a specific organization — entry paperwork, submissions, and registry-specific views — SHALL resolve registered name, breed, and variety from the registration for **that** organization. It SHALL NOT fall back to another organization's registration.

#### Scenario: Paperwork uses the sanctioning organization

- **WHEN** paperwork is produced for a show sanctioned by an organization
- **THEN** the dog's registered name, breed, and registration number are taken from the registration for that organization

#### Scenario: No cross-organization fallback

- **WHEN** a dog holds a registration with a different organization but none with the sanctioning organization
- **THEN** the other organization's values are not substituted

### Requirement: Registration numbers on official output come from the registration

Any output carrying a registration number — organization submissions, entry blanks, and dog search — SHALL read it from the registration for the relevant organization.

#### Scenario: Submission carries a real registration number

- **WHEN** a submission is generated for a dog registered with the sanctioning organization
- **THEN** the registration number from that registration appears in the output

#### Scenario: Search matches on registration number

- **WHEN** a user searches by a registration number held on any of a dog's registrations
- **THEN** that dog is returned

#### Scenario: Unregistered dog is reported, not silently blank

- **WHEN** output is requested for a dog with no registration for the sanctioning organization
- **THEN** the absence is surfaced to the operator rather than emitted as a silently blank field

### Requirement: Generic surfaces resolve from the dog's primary registration

A surface with no organization in context — the dog list, dog search results, and entry summaries — SHALL resolve breed and registered name from the dog's primary registration. Exactly one registration per dog MAY be primary; where none is marked, the earliest-created registration SHALL be treated as primary. Where the dog has no registration, these surfaces SHALL render an empty state.

#### Scenario: Dog with one registration

- **WHEN** a dog with a single registration is listed
- **THEN** that registration's breed and registered name are shown

#### Scenario: Dog with several registrations

- **WHEN** a dog holds registrations with several organizations
- **THEN** the primary registration's values are shown
- **AND** the displayed value does not change between loads while the primary is unchanged

#### Scenario: Adding a second registration does not change the display

- **WHEN** a second registration is added to a dog that already has a primary
- **THEN** the generic surfaces continue to show the primary registration's values

#### Scenario: Dog with no registration

- **WHEN** a dog with no registration is listed
- **THEN** an empty state is rendered for breed and registered name
