## ADDED Requirements

### Requirement: Show workbench header stays readable on touch widths

The system SHALL keep the canonical Setup and Show Desk header's show identity, visible badge, published-state control, and overflow action separately readable and usable at tablet and mobile widths.

#### Scenario: Tablet header with date cover and published state

- **WHEN** a secretary opens Setup or Show Desk at a tablet-width viewport for a published show with a date cover and header actions
- **THEN** the show title does not overlap the published-state control or overflow action
- **AND** each control remains visible and reachable without horizontal scrolling

#### Scenario: Desktop header retains its compact composition

- **WHEN** a secretary opens the same header at a desktop-width viewport
- **THEN** the title and header actions remain in the existing right-aligned desktop composition
- **AND** the responsive fix does not create a second header or duplicate any action
