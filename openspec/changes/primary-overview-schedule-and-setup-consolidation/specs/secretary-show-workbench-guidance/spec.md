## MODIFIED Requirements

### Requirement: Setup schedule rows disclose their destination

The system SHALL make schedule row actions match their visible and accessible destination, including when the schedule is presented on Overview after Setup is removed from visible navigation.

#### Scenario: Overview schedule row opens class details

- **WHEN** a viewer activates a class or element row from the Overview schedule
- **THEN** the row label or helper text identifies whether it opens the class or the trial
- **AND** the accessible name does not imply that the user is opening a Setup workflow

#### Scenario: Manager schedule editing is explicit

- **WHEN** an authorized manager sees an editable start-time row on Overview
- **THEN** the editor is labeled as changing the scheduled or expected start time
- **AND** activating the class identity still opens the existing class/trial owner surface

#### Scenario: Legacy Setup deep link remains safe

- **WHEN** a user opens `/shows/:showId/setup` from an existing bookmark or readiness message
- **THEN** the route redirects to the canonical Overview surface
- **AND** the user is not left on a missing page or an empty Setup shell

## ADDED Requirements

### Requirement: Setup capabilities remain discoverable after navigation consolidation

The system SHALL remove Setup from visible peer navigation without deleting the underlying judges, venue, officials, or schedule capabilities.

#### Scenario: Secretary opens management navigation

- **WHEN** a secretary views show management navigation on desktop or touch width
- **THEN** Setup is not presented as a peer section
- **AND** Overview, Show Desk, Entry Management, Reports, Results, and Submit Results remain reachable through their existing routes

#### Scenario: Existing readiness link targets Setup

- **WHEN** a readiness link still targets a Setup URL during migration
- **THEN** the compatibility route lands on Overview or its relevant show-details anchor
- **AND** the readiness action does not dead-end
