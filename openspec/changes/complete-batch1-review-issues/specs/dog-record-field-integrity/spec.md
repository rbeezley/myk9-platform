## ADDED Requirements

### Requirement: Registration date survives every registration save contract

The single registration form SHALL preserve an optional registration calendar date when creating a dog online, creating it offline for later sync, and editing registrations on Dog Details. Omission SHALL remain empty; saving SHALL not change an untouched status or organization identity.

#### Scenario: Create and reload

- **WHEN** a user enters a registration date while creating a dog
- **THEN** the same calendar date is present after save, sync and reload

#### Scenario: Optional and invalid date

- **WHEN** a registration date is omitted
- **THEN** dog creation succeeds without inventing a date
- **AND** an invalid date that reaches storage fails the atomic creation rather than partially saving
