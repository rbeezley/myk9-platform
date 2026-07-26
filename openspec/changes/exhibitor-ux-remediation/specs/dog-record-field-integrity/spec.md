## ADDED Requirements

### Requirement: A dog is identified by its call name

The dog record SHALL identify a dog by its call name — the everyday name its owner uses. Surfaces that present a dog to its owner SHALL lead with the call name. The dog record SHALL NOT require the owner to supply a registered name in order to create or edit a dog.

#### Scenario: Creating a dog asks only for the call name

- **WHEN** an owner creates a dog
- **THEN** the form asks for the call name
- **AND** it does not require a registered name on the dog record itself

#### Scenario: Editing a dog does not require a registered name

- **WHEN** an owner opens the dog edit form
- **THEN** no registered-name field is presented as a required attribute of the dog record

#### Scenario: Owner-facing surfaces lead with the call name

- **WHEN** a dog is shown on the dog list, the dog record, or an entry summary
- **THEN** the call name is the primary identifier displayed

### Requirement: Adding a dog never requires a registration

Creating a dog SHALL NOT require a registration with any organization. An owner may add a dog and complete its registration later. Registration SHALL be enforced at the point of **entering a show**, not at the point of creating or editing a dog record.

#### Scenario: Dog created with no registration

- **WHEN** an owner creates a dog without adding any registration
- **THEN** the dog is created successfully
- **AND** the flow states that a registration can be added later

#### Scenario: Registration is enforced at entry time instead

- **WHEN** that same dog is later entered in a show
- **THEN** the registration requirement is evaluated by the entry flow for the sanctioning organization

#### Scenario: Editing a dog does not demand a registration

- **WHEN** an owner edits a dog that has no registration
- **THEN** the edit can be saved without adding one

### Requirement: A registered name belongs to a registration, not to the dog

A registered name SHALL be stored and edited as part of a registration with a specific organization, alongside that organization's registration number. A dog MAY hold registrations with several organizations, and those registered names MAY differ. No org-agnostic field SHALL be presented to the owner as "the dog's registered name".

#### Scenario: Registered name is captured with the registration

- **WHEN** an owner adds a registration for an organization
- **THEN** the registered name for that organization is captured with that registration

#### Scenario: Two organizations with different registered names

- **WHEN** a dog holds registrations with two organizations that record different registered names
- **THEN** each organization's surfaces display that organization's registered name
- **AND** neither value overwrites the other

#### Scenario: Organization-scoped display

- **WHEN** a surface concerns a specific organization's entry, paperwork, or submission
- **THEN** it displays the registered name recorded for that organization

#### Scenario: A dog with no registration is still usable

- **WHEN** a dog has no registration yet
- **THEN** the dog can still be created, viewed, and edited by its call name
- **AND** no fabricated registered name is stored or displayed for it

### Requirement: The app never asserts a breed the owner did not supply

Breed is a property of a registration with an organization. The system SHALL NOT store, display, or transmit a substitute breed value — including "Mixed Breed" or any other concrete breed — for a dog whose breed has not been supplied through a registration. Disclosing such a substitute does not satisfy this requirement: stating a breed the owner did not give is a claim about their dog, and the stored value can reach entry paperwork and organization submissions.

#### Scenario: Dog added without a registration

- **WHEN** an owner creates a dog and adds no registration
- **THEN** no breed value is stored for that dog
- **AND** no surface displays a concrete breed for it

#### Scenario: Breed arrives with the registration

- **WHEN** the owner later adds a registration that records a breed
- **THEN** that breed is displayed for the organization concerned

#### Scenario: Substitute breeds never reach paperwork

- **WHEN** an entry, entry blank, or organization submission is produced for a dog with no supplied breed
- **THEN** no substitute breed value is transmitted for that dog

### Requirement: Identity values are never fabricated from other fields

A stored identity value SHALL NOT be derived, copied, or inferred from an unrelated field in order to satisfy a storage constraint. Where a storage constraint cannot yet be removed, the placeholder it forces SHALL NOT be surfaced to the owner or transmitted as if it were supplied data.

#### Scenario: Registered name is not a copy of the call name

- **WHEN** a dog is created with a call name and no registration
- **THEN** no surface presents that call name to the owner as the dog's registered name

### Requirement: One stored value renders one way across all surfaces

Every surface displaying a dog attribute SHALL derive its display text — including its empty-state text — from one shared formatter, so a single stored value cannot render differently on the dog list, the dog record, and the entry-registration wizard.

#### Scenario: One value renders consistently

- **WHEN** the same dog's breed is viewed on the My Dogs list, its dog record, and the registration wizard's dog-selection step
- **THEN** all three render the same text for that value

#### Scenario: Empty state is distinguishable from a real value

- **WHEN** the shared formatter renders the empty state for an attribute
- **THEN** it reads as an absence of data rather than as a selectable domain value

### Requirement: Editing a dog preserves fields the owner did not change

Saving the dog edit form SHALL NOT alter, clear, or rewrite an attribute the owner did not modify.

#### Scenario: Untouched breed survives an unrelated edit

- **WHEN** an owner edits one field and saves
- **THEN** the dog's breed is unchanged, and renders identically before and after the save
