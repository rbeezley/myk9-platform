## MODIFIED Requirements

### Requirement: Operational pages preserve show workbench context

The system SHALL keep show-specific operational pages inside the existing show workbench context instead of sending users to broken-out surfaces.

#### Scenario: Manage Classes opens from a show

- **WHEN** a secretary opens Manage Classes for a show
- **THEN** the page SHALL render with the show's workbench header, section tabs, and show-scoped breadcrumb context
- **AND** the page SHALL NOT rely on `navigate(-1)` as the primary way back to the show

#### Scenario: Manage Classes links to waitlist work

- **WHEN** a secretary chooses a waitlist link from Manage Classes
- **THEN** the system SHALL deep-link to the same show's Entry Management Exceptions peer with Waitlist selected and any supported trial context
- **AND** the system SHALL NOT route to a global or duplicate waitlist surface

#### Scenario: Entry exceptions use one canonical peer

- **WHEN** a secretary needs Move-ups, Pulls/Scratches, or Waitlist from Entry Management
- **THEN** those queues SHALL be available under one top-level `Exceptions` peer with accessible internal navigation
- **AND** each choice SHALL reuse its existing canonical management component rather than a duplicate registration queue

#### Scenario: Legacy exception URL is opened

- **WHEN** a secretary opens a legacy Move-up, Pull/Scratch, Waitlist, `attention`, `entryTab`, or peer-tab URL
- **THEN** it SHALL normalize to the matching canonical Exceptions state
- **AND** the secretary SHALL NOT land on a dead or unexplained empty surface
