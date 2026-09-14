## MODIFIED Requirements

### Requirement: Dog Details tab strip fits without Activity tab

The Dog Details page SHALL replace the peer strip of Registrations, Competitions, Title Progress, Statistics, Health, Training, and Pedigree with three top-level concerns—Overview, Career, and Records. Overview SHALL be selected by default. The identity rail SHALL be the sole default registration summary and empty state, with its add action always available and the existing edit/delete management controls revealed on demand for registered dogs. Activity SHALL be the first substantive Overview section. Premium Overview MAY show a compact count of titles in progress and earned, while Career SHALL own individual title tracks and progress bars. Career SHALL contain Competitions, Title Progress, and Statistics as secondary views. Records SHALL contain Health Records, Training Journal, and Pedigree as secondary views.

#### Scenario: Default Overview

- **WHEN** an exhibitor opens a dog detail URL without section state
- **THEN** Overview SHALL be selected
- **AND** the rail SHALL show the sole registration summary or empty state
- **AND** one Activity section SHALL render first in Overview without a separate Activity tab

#### Scenario: Activity rendered below tabs

- **WHEN** an exhibitor opens a dog's detail page
- **THEN** the top-level navigation SHALL omit Activity, Overview SHALL be selected by default, and the activity feed SHALL appear as the first Overview section

#### Scenario: Registration management from the identity rail

- **WHEN** an exhibitor selects Manage registrations for a registered dog
- **THEN** the existing registration edit and delete controls SHALL become available without creating another page
- **AND** the rail SHALL remain the only default registration summary
- **AND** the revealed state SHALL be carried in the URL as `tab=registrations`, so Back closes it and a copied link reopens it

#### Scenario: Returning to Overview keeps an open management view

- **WHEN** an exhibitor opens the add-registration panel while registration management is revealed
- **THEN** saving or closing SHALL return to the management view rather than a bare Overview

#### Scenario: Add registration deep link

- **WHEN** an exhibitor opens a dog URL with `addRegistration=true` or selects Add registration in the rail
- **THEN** the existing add panel SHALL open on Overview without showing a second registration empty state

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
- **AND** existing owned records SHALL remain readable and deletable in a read-only downgrade state
- **AND** existing Health or Training export/report actions SHALL remain available where already supported
- **AND** adding or editing SHALL present one consistent account-Premium upgrade path
- **AND** the sidebar SHALL NOT repeat a competing Title Progress upgrade card

#### Scenario: User upgrades and returns

- **WHEN** a user follows an upgrade action from a locked secondary view and later returns with Premium access
- **THEN** the original dog and secondary view SHALL be restored

## REMOVED Requirements

### Requirement: Upgrade teaser navigates to pricing

**Reason**: The Title Progress sidebar teaser duplicates Career's canonical locked-view treatment and conflicts with the consolidated Dog Details hierarchy.

**Migration**: Route upgrade actions from the locked Title Progress or Statistics secondary view to `/pricing-page`, preserving the dog and secondary-view return state.
