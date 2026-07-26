## MODIFIED Requirements

### Requirement: Cross-organization duplicate candidates are suggested

The system SHALL suggest likely existing dog records before creating a second dog when the entered dog details strongly match an existing dog under another organization. Matching SHALL read registered name, breed, and registration number from the **registration** for the relevant organization, and the call name, sex, and date of birth from the dog record. Matching SHALL NOT read a dog-level registered name or breed, and SHALL NOT read the retired flat registry columns.

#### Scenario: Strong same-dog candidate is shown

- **WHEN** a user enters a UKC registration for a dog whose owner, registered name or call name, breed, sex, and date of birth strongly match an existing AKC dog
- **THEN** the existing dog is offered as the destination for the new UKC registration

#### Scenario: Candidate suggestion requires confirmation

- **WHEN** a likely same-dog candidate is shown
- **THEN** the system does not attach the new registration or skip dog creation until the user confirms the existing dog

#### Scenario: Weak matches do not block creation

- **WHEN** entered dog details do not produce an exact registry or strong same-dog match
- **THEN** the user can continue creating a new dog

#### Scenario: Matching sources registration-scoped values

- **WHEN** duplicate candidates are evaluated for a dog that holds registrations with more than one organization
- **THEN** each organization's registered name and breed are compared from that organization's registration
- **AND** no dog-level breed or registered-name value participates in the comparison

#### Scenario: Dogs without registrations still match on dog-level attributes

- **WHEN** a candidate dog has no registration
- **THEN** matching proceeds on call name, owner, sex, and date of birth
- **AND** the absence of a breed or registered name does not by itself count as a mismatch
