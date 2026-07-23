## MODIFIED Requirements

### Requirement: Dog Details tab strip fits without Activity tab

The Dog Details page SHALL replace the peer strip of Registrations, Competitions, Title Progress, Statistics, Health, Training, and Pedigree with three top-level concerns—Overview, Career, and Records. Overview SHALL be selected by default and SHALL contain identity, registrations, and the single Activity section. Career SHALL contain Competitions, Title Progress, and Statistics as secondary views. Records SHALL contain Health Records, Training Journal, and Pedigree as secondary views.

#### Scenario: Default Overview

- **WHEN** an exhibitor opens a dog detail URL without section state
- **THEN** Overview SHALL be selected
- **AND** registrations and one Activity section SHALL render without a separate Activity tab

#### Scenario: Premium feature grouping

- **WHEN** an exhibitor opens Career
- **THEN** Competitions, Title Progress, and Statistics SHALL be available as secondary views
- **AND** the top-level navigation SHALL remain Overview, Career, and Records

#### Scenario: Premium record grouping

- **WHEN** an exhibitor opens Records
- **THEN** Health Records, Training Journal, and Pedigree SHALL be available as secondary views
- **AND** the top-level navigation SHALL remain Overview, Career, and Records

#### Scenario: Top-level navigation fits audited viewports

- **WHEN** Dog Details renders at 390x844 phone, 834x1112 tablet portrait, tablet landscape, or 1280x800 desktop viewport
- **THEN** Overview, Career, and Records SHALL remain visible, readable, and operable without clipped labels
- **AND** secondary navigation SHALL adapt to the available content-container width

#### Scenario: Legacy dog-detail tab link

- **WHEN** an exhibitor opens a legacy URL for registrations, competitions, title progress, statistics, health, training, or pedigree
- **THEN** the app SHALL map it to the corresponding Overview, Career, or Records secondary view
- **AND** Back, Forward, refresh, and copied deep links SHALL preserve the selected concern

## ADDED Requirements

### Requirement: Premium locks preserve the free dog workspace

Premium gating SHALL occur at the affected Career or Records secondary view without hiding free Overview or Competitions content and without rendering a repeated Premium teaser in the Dog Details sidebar.

#### Scenario: Free user opens Career

- **WHEN** a free exhibitor opens Career
- **THEN** Competitions SHALL remain usable
- **AND** Title Progress and Statistics SHALL expose one consistent locked-view treatment

#### Scenario: Free user opens Records

- **WHEN** a free exhibitor opens Records
- **THEN** Health, Training, and Pedigree SHALL be discoverable through one coherent Records treatment
- **AND** existing owned records SHALL remain readable, exportable, and deletable in a read-only downgrade state
- **AND** adding or editing SHALL present one consistent account-Premium upgrade path
- **AND** the sidebar SHALL NOT repeat a competing Title Progress upgrade card

#### Scenario: User upgrades and returns

- **WHEN** a user follows an upgrade action from a locked secondary view and later returns with Premium access
- **THEN** the original dog and secondary view SHALL be restored

## REMOVED Requirements

### Requirement: Upgrade teaser navigates to pricing

**Reason**: The Title Progress sidebar teaser duplicates Career's canonical locked-view treatment and conflicts with the consolidated Dog Details hierarchy.

**Migration**: Route upgrade actions from the locked Title Progress or Statistics secondary view to `/pricing-page`, preserving the dog and secondary-view return state.
