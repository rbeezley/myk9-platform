## ADDED Requirements

### Requirement: Show Desk Tools owns self check-in configuration

The system SHALL place the existing self check-in configuration hierarchy in Show Desk Tools because it is show-day coordination work, while keeping the schedule and other Show Desk tools available when that configuration cannot load.

#### Scenario: Self check-in tool is available

- **WHEN** an authorized secretary opens Show Desk Tools
- **THEN** a Self check-in section explains and exposes the show default, trial and class overrides, and selected-class bulk actions
- **AND** each interactive control meets the established touch-target and accessible-name requirements

#### Scenario: Self check-in tool is unavailable

- **WHEN** settings data for the Self check-in section fails to load
- **THEN** that section explains the failure and offers retry
- **AND** Show Desk schedule, People at show, and other tool sections remain available
