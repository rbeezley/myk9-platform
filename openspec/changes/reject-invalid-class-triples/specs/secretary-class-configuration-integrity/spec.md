## ADDED Requirements

### Requirement: Persisted classes have a resolved registry triple

The show setup workflow SHALL refuse to persist a selected class whose registry element, level, or required section cannot be resolved, and SHALL identify the invalid class to the secretary.

#### Scenario: Selected class lacks registry metadata
- **WHEN** a selected class is missing a required registry value
- **THEN** the wizard does not create any class row using a textual sentinel such as `Unknown`
- **AND** the secretary sees which class must be corrected or removed

### Requirement: Organization changes cannot retain foreign-registry classes

The cloned-show workflow SHALL prevent an organization change from leaving selected classes whose registry triple belongs to the previous organization.

#### Scenario: Cloned draft contains selected classes
- **WHEN** a secretary attempts to change the organization on a cloned draft that still contains cloned classes
- **THEN** the change is blocked with guidance to return to the existing Classes step and remove or replace them

#### Scenario: Cloned classes have been cleared
- **WHEN** no cloned class remains selected
- **THEN** the secretary can change the organization and choose classes from the new registry's existing template flow
