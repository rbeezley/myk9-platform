# secretary-show-workbench-guidance Specification

## Purpose

Capture secretary-facing Setup and Show Desk guidance so readiness states,
signals, schedule routes, section navigation, and tool copy stay aligned with
their resolving destinations.

## Requirements

### Requirement: Setup readiness reports one premium state

The system SHALL classify the show premium list into one visible readiness state
across Setup readiness, Publish readiness, and the show-level premium card.

#### Scenario: Premium is not published

- **WHEN** a secretary opens Setup for a show with no published premium PDF
- **THEN** Setup readiness and Publish readiness describe the premium as not published
- **AND** the action to fix it lands on a visible publish action

#### Scenario: Premium is published and current

- **WHEN** a secretary opens Setup for a show whose premium PDF is published and current with show data
- **THEN** Setup readiness counts the premium as ready
- **AND** Publish readiness and the premium card do not describe it as missing or stale

#### Scenario: Premium is published but stale

- **WHEN** a secretary opens Setup for a show whose show data changed after the premium PDF was published
- **THEN** Setup readiness and Publish readiness describe the premium as published but needing republish
- **AND** the action to fix it lands on a visible republish action instead of only a download action

### Requirement: Show Desk signals land on resolving destinations

The system SHALL show pending signals and next-best actions only when their
destination can inspect or clear the named condition.

#### Scenario: Pending closeout signal has a resolvable target

- **WHEN** Show Desk displays a result or class closeout pending signal
- **THEN** activating the signal lands on the relevant closeout, Results & Check-In, or class context that explains the pending item
- **AND** it does not leave the secretary on an empty Show Map filter state

#### Scenario: Pending signal is suppressed without a target

- **WHEN** the system cannot identify a target for a pending signal
- **THEN** Show Desk does not render that signal as an actionable chip
- **AND** the secretary is not asked to tap a signal that cannot lead to the fix

#### Scenario: Print check-in recommendation requires entries

- **WHEN** Show Desk evaluates a `Print Check-In Sheet` next-best action for a class with zero entries
- **THEN** it does not present `Start` as a recommended print action
- **AND** it either chooses another useful action or explains that there are no entries to print yet

### Requirement: Setup schedule rows disclose their destination

The system SHALL make Setup schedule row actions match their visible and
accessible destination.

#### Scenario: Schedule row opens trial details

- **WHEN** a schedule row opens trial details
- **THEN** the row label or helper text indicates that it opens the trial
- **AND** its accessible name does not imply the secretary is opening class-level setup

#### Scenario: Schedule row opens class details

- **WHEN** a schedule row is labeled and presented as a class-level action
- **THEN** activating it opens the relevant class-level page or setup context
- **AND** the secretary can return to the show Setup route without losing context

### Requirement: Show management sections remain discoverable on touch widths

The system SHALL expose all canonical show management sections on mobile and
tablet touch widths without relying only on hidden horizontal scrolling.

#### Scenario: Mobile section navigation exposes all sections

- **WHEN** a secretary opens Setup or Show Desk on a mobile viewport
- **THEN** all sections from `SHOW_MANAGEMENT_SECTIONS` are reachable through the section navigation control
- **AND** the active section is visible or named without requiring the user to discover off-screen tabs

#### Scenario: Section navigation remains canonical

- **WHEN** a secretary changes sections from the narrow-width navigation control
- **THEN** the app navigates to the existing `/shows/:showId/:section` route
- **AND** it does not create duplicate page content or a second owner workflow

### Requirement: Show Desk tool copy matches available tools

The system SHALL keep Show Desk Tools summary copy aligned with the visible tool
sections.

#### Scenario: Tools summary names available work

- **WHEN** a secretary opens the Show Desk Tools drawer
- **THEN** the summary names only work that is available in the drawer or clearly reachable from it
- **AND** messaging language is used only when a visible tool or action routes to secretary messaging
