## Purpose

Ensure secretaries can reliably configure cloned shows and add classes through the existing canonical setup surfaces without hidden state or browser-only failures.

## ADDED Requirements

### Requirement: Cloned classes remain reachable

The show-creation Classes step SHALL display every selected cloned class, including renamed or non-template definitions, and SHALL allow each class to be found and deselected.

#### Scenario: Retained non-template class is searched and removed

- **WHEN** a cloned draft contains a selected class that is absent from the current template and the secretary searches for it
- **THEN** the Classes step shows that retained class and allows it to be deselected while preserving other class customizations
- **AND** Review updates its class and judge-assignment counts to exclude the removed class

### Requirement: Create Classes template selection is operable

The existing Create Classes route SHALL allow a template card to be selected without a browser runtime error, by pointer or keyboard, and SHALL expose its selected state to assistive technology.

#### Scenario: Secretary advances from template to class selection

- **WHEN** a secretary selects a compatible template by pointer, Enter, or Space and continues
- **THEN** the chosen template remains selected with a programmatic selected state
- **AND** the route advances to Choose Classes without a runtime error

#### Scenario: Secretary completes the pre-persistence flow

- **WHEN** the secretary selects at least one class and supplies required values
- **THEN** the existing route reaches its review step without introducing an alternate template source or class-creation surface
