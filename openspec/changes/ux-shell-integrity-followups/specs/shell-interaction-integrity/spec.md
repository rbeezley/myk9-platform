## ADDED Requirements

### Requirement: Overlay teardown integrity
The system SHALL ensure shared overlays and portals do not intercept input after they are dismissed.

#### Scenario: Dropdown menu is dismissed
- **WHEN** a user opens a row actions dropdown and dismisses it with Escape or an outside click
- **THEN** the next click on a visible page control SHALL reach that control
- **AND** the dismissed menu SHALL NOT leave an inert backdrop, portal, or focus trap that blocks interaction

#### Scenario: High-risk overlay primitives are swept
- **WHEN** dropdowns, popovers, searchable popovers, selects, sheets, dialogs, and alert dialogs are reviewed for this change
- **THEN** each primitive SHALL either use teardown behavior that releases pointer/focus capture on close or be documented as intentionally modal
- **AND** intentionally modal primitives SHALL restore normal page interaction after close

#### Scenario: ResizeObserver noise is benign
- **WHEN** an overlay close emits known benign ResizeObserver loop noise
- **THEN** monitoring SHALL suppress that benign message without hiding unrelated runtime errors

### Requirement: Operational pages preserve show workbench context
The system SHALL keep show-specific operational pages inside the existing show workbench context instead of sending users to broken-out surfaces.

#### Scenario: Manage Classes opens from a show
- **WHEN** a secretary opens Manage Classes for a show
- **THEN** the page SHALL render with the show's workbench header, section tabs, and show-scoped breadcrumb context
- **AND** the page SHALL NOT rely on `navigate(-1)` as the primary way back to the show

#### Scenario: Manage Classes links to waitlist work
- **WHEN** a secretary chooses a waitlist link from Manage Classes
- **THEN** the system SHALL deep-link to the same show's Entry Management Waitlist tab with the relevant trial context
- **AND** the system SHALL NOT route to a global or duplicate waitlist surface

#### Scenario: Move-ups and pulls remain canonical peers
- **WHEN** a secretary needs Move-ups or Pulls from Entry Management
- **THEN** those queues SHALL be available as top-level Entry Management peers
- **AND** legacy exception-tab URLs SHALL normalize to the canonical peer route or state

### Requirement: Shared controls are labeled and honest
The system SHALL make primary and icon-only controls understandable to touch users, keyboard users, and assistive technology.

#### Scenario: Icon-only control is rendered
- **WHEN** an icon-only button, menu trigger, dismiss control, undo control, or row action is visible
- **THEN** it SHALL have an accessible name that describes the action
- **AND** it SHALL NOT rely only on a `title` attribute or hover tooltip

#### Scenario: Disabled primary action is rendered
- **WHEN** a primary action is disabled in a swept shell or workflow surface
- **THEN** the UI SHALL show an adjacent plain-English reason for the disabled state
- **AND** the reason SHALL describe the user action or condition needed to proceed

#### Scenario: Public and structural metadata is rendered
- **WHEN** a public show page, progress indicator, pagination select, status dot, or bulk checkbox is rendered
- **THEN** the element SHALL expose a truthful accessible name or document title appropriate to its purpose

#### Scenario: Dead control is found
- **WHEN** a visible control in the swept files has no handler or cannot complete its implied action
- **THEN** the control MUST be wired to the canonical existing action or removed from the UI

### Requirement: Chrome is scoped by role and route
The system SHALL show shared navigation, search, labels, and utilities that match the user's role and current workflow.

#### Scenario: Exhibitor uses command search
- **WHEN** an exhibitor opens command search
- **THEN** the results and actions SHALL exclude secretary/admin-only actions such as adding users
- **AND** available actions SHALL route to exhibitor-appropriate existing surfaces

#### Scenario: Staff uses command search
- **WHEN** a secretary or admin opens command search
- **THEN** staff-authorized actions SHALL remain available according to existing role permissions

#### Scenario: Exhibitor views show-day navigation
- **WHEN** an exhibitor sees show-day navigation labels
- **THEN** the UI SHALL use exhibitor-facing language such as "Show day"
- **AND** it SHALL NOT expose staff-only ringside tools such as ArmbandLookup

#### Scenario: Staff views show-day navigation
- **WHEN** secretary or steward staff see operational show-day navigation
- **THEN** the UI MAY use staff-facing labels such as "Ringside"
- **AND** staff-only tools SHALL remain available when permitted

#### Scenario: Mobile Browse Shows loads for an exhibitor
- **WHEN** Browse Shows renders on a mobile viewport for an exhibitor
- **THEN** it SHALL default to simple cards
- **AND** table controls such as columns, CSV export, compact mode, and reset SHALL appear only after the user enters an explicit table mode

#### Scenario: Profile and account destinations are shown
- **WHEN** the shell links to profile or account settings
- **THEN** there SHALL be one primary profile/account destination
- **AND** advanced or destructive settings SHALL be grouped under clearly labeled advanced settings with warning copy

### Requirement: Contrast-safe shell tokens and chips
The system SHALL provide token and chip color pairs that meet accessibility contrast requirements across supported themes.

#### Scenario: Dark theme token pair is used
- **WHEN** primary, warning, info, muted, or chip tint token pairs are rendered in dark theme
- **THEN** the foreground/background contrast SHALL meet WCAG AA for the text size used
- **AND** token-level tests SHALL pin the expected contrast ratios

#### Scenario: Chip or badge component is rendered
- **WHEN** a status chip, badge, or pill renders in light or dark theme
- **THEN** it SHALL preserve a visible surface and readable foreground
- **AND** it SHALL NOT silently drop its background or rely on low-contrast text

#### Scenario: Heritage or public show page is rendered
- **WHEN** a public or heritage show page renders in light or dark theme
- **THEN** serious or critical axe contrast violations SHALL be zero for the matrix-covered content

#### Scenario: Fixed-light surface is retained
- **WHEN** a printable, TV-display, credit-card, home, or heritage surface intentionally uses fixed-light styling
- **THEN** that intent SHALL be documented or guarded
- **AND** adjacent dark-mode usage SHALL NOT inherit unreadable literal colors

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

### Requirement: Shell integrity verification
The system SHALL include focused automated checks that prevent known shell regressions from returning.

#### Scenario: Component tests run
- **WHEN** the shell integrity implementation is complete
- **THEN** component tests SHALL cover workbench shell rendering, role-filtered command search or chrome, mobile Browse Shows table-mode gating, and relevant primitive semantics

#### Scenario: Playwright regressions run
- **WHEN** the shell integrity implementation is complete
- **THEN** Playwright coverage SHALL verify overlay teardown and ringside exit paths

#### Scenario: Accessibility and matrix checks run
- **WHEN** the shell integrity implementation is complete
- **THEN** the verification pass SHALL include axe or runtime checks for unlabeled controls, serious/critical contrast issues, clipped primary actions, and sub-44px shared chrome

#### Scenario: Tracking docs are updated
- **WHEN** a shell integrity package is completed
- **THEN** `docs/plan-ux-walk-remediation-2026-07.md` or the relevant tracking doc SHALL be updated to reflect the completed work and remaining scope
