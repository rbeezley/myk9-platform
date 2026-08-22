## MODIFIED Requirements

### Requirement: Responsive shell primitives keep actions usable
The system SHALL keep shared chrome and primary actions visible, non-overlapping, and large enough to use on mobile and tablet viewports.

#### Scenario: Shared app chrome renders on touch viewport
- **WHEN** the app header, nav, notification bell, theme toggle, AskQ trigger, account trigger, view toggle, or ringside card action renders on a touch viewport
- **THEN** each interactive target SHALL be at least 44px by 44px

#### Scenario: Tab or toolbar strip overflows
- **WHEN** a tab or toolbar strip does not fit its container
- **THEN** it SHALL provide horizontal scrolling or an equivalent visible affordance
- **AND** labels SHALL NOT clip mid-word without a way to access the full option

#### Scenario: Data table exceeds available width
- **WHEN** a table in a constrained container exceeds the viewport or card width
- **THEN** it SHALL provide a clear horizontal scroll region or responsive alternate layout
- **AND** primary row actions SHALL remain reachable

#### Scenario: Workbench hero title is long
- **WHEN** a show or workbench hero title exceeds available width
- **THEN** the layout SHALL keep surrounding actions visible
- **AND** the full title SHALL remain available through title text, tooltip, or equivalent accessible disclosure

#### Scenario: Toast appears on a small viewport
- **WHEN** a toast is displayed on mobile or tablet
- **THEN** it SHALL dock to a safe area that does not cover the primary action needed to continue the task

#### Scenario: Known responsive singletons render
- **WHEN** Manage Classes, Results Control, ringside entry cards, Copy Link/Headline, Show Desk, or My Entries render at 375px or 768px widths
- **THEN** primary actions SHALL NOT be clipped, overlapped, or smaller than the touch-target minimum

#### Scenario: Site-admin page renders beside the persistent sidebar
- **WHEN** Permissions or Sync Monitoring renders with the persistent admin sidebar at a viewport from 768px through 1023px
- **THEN** the page title and description SHALL remain readable without near-vertical word wrapping
- **AND** the complete action group SHALL remain visible without horizontal clipping
- **AND** each action SHALL expose a keyboard-reachable target at least 44px high

#### Scenario: Site-admin constrained layout crosses its controls
- **WHEN** the same Permissions or Sync Monitoring page renders at 1024×768 or below the persistent-sidebar breakpoint
- **THEN** its established landscape-desktop or mobile-shell behavior SHALL remain usable
- **AND** the responsive repair SHALL NOT create a second header, route, or duplicate action
