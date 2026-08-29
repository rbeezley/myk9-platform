## Purpose

Keep secretary self check-in, result release, and registry submission in the existing surface that matches each task's show-day or closeout moment.

## ADDED Requirements

### Requirement: Self check-in is owned by Show Desk

The system SHALL expose show-, trial-, class-, and selected-class bulk self check-in settings from the existing Show Desk Tools surface and SHALL NOT duplicate those controls on the Results page.

#### Scenario: Secretary configures self check-in during show day

- **WHEN** an authorized secretary opens Self check-in from Show Desk Tools
- **THEN** the secretary can change the show default and trial or class overrides
- **AND** the secretary can select classes and enable or disable self check-in for the valid selection in bulk
- **AND** the controls reflect the established show → trial → class inheritance cascade

#### Scenario: Self check-in settings cannot be read

- **WHEN** the self check-in settings read fails or has not produced data
- **THEN** the Self check-in tool settles into a truthful unavailable or loading state
- **AND** the rest of Show Desk remains usable
- **AND** the system does not present fallback defaults as confirmed saved values

### Requirement: Results owns result verification and release

The existing Results route SHALL contain result readiness, visibility presets, class selection, release, and unrelease work without self check-in switches, bulk check-in actions, or self check-in labels.

#### Scenario: Secretary opens Results

- **WHEN** a secretary navigates to the existing Results route
- **THEN** the page is labeled “Results”
- **AND** it presents result verification, visibility, and release work
- **AND** it retains a clear path to Submit Results

### Requirement: Closeout remains sequenced without a duplicate hub

Show Desk closeout SHALL remain the single hub for Results, Reports, and Submit Results, and the system SHALL preserve Results and Submit Results as distinct existing routes.

#### Scenario: Secretary starts closeout from Show Desk

- **WHEN** a secretary opens the Show closeout tool
- **THEN** the hub offers Results, Reports, and Submit Results in closeout order
- **AND** no additional closeout page, dialog, sheet, or fourth entry point is introduced
