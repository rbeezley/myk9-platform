# shell-interaction-integrity Specification

## Purpose
The application shell must preserve role context, release overlays cleanly, keep
shared controls accessible, and remain usable across responsive breakpoints.
These requirements guard the chrome and interaction primitives that every role
depends on during core workflows.
## Requirements
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

#### Scenario: Site-admin page renders beside the persistent sidebar
- **WHEN** Permissions or Sync Monitoring renders with the persistent admin sidebar at a viewport from 768px through 1023px
- **THEN** the page title and description SHALL remain readable without near-vertical word wrapping
- **AND** the complete action group SHALL remain visible without horizontal clipping
- **AND** each action SHALL expose a keyboard-reachable target at least 44px high

#### Scenario: Site-admin constrained layout crosses its controls
- **WHEN** the same Permissions or Sync Monitoring page renders at 1024×768 or below the persistent-sidebar breakpoint
- **THEN** its established landscape-desktop or mobile-shell behavior SHALL remain usable
- **AND** the responsive repair SHALL NOT create a second header, route, or duplicate action

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

### Requirement: Account menu groups shared utilities by user task
The system SHALL organize the existing account menu into recognizable task groups without creating duplicate account, billing, support, assistant, or appearance surfaces.

#### Scenario: User opens the account menu
- **WHEN** a signed-in user wants to inspect their current plan or billing
- **THEN** the account group SHALL contain Account and one `Plan & billing` link to the existing subscription page
- **AND** the subscription page SHALL remain the single place to inspect the current plan or continue to pricing when no active subscription exists

#### Scenario: User looks for assistance
- **WHEN** a signed-in user scans the account menu
- **THEN** `AskQ` and `Help & Guides` SHALL appear together as assistance actions
- **AND** AskQ SHALL open the existing assistant panel rather than a new surface

#### Scenario: User looks for appearance and product information
- **WHEN** a signed-in user scans the account menu
- **THEN** the mode-switch action and About SHALL appear together after the assistance group
- **AND** the mode-switch label SHALL concisely name the mode the action will activate

#### Scenario: User looks for sign out
- **WHEN** the account menu renders its session action
- **THEN** Sign out SHALL appear in the final separated group
- **AND** it SHALL use neutral default emphasis with destructive emphasis reserved for hover or focus

### Requirement: Shared shell presents recognizable AskQ access
The system SHALL use one consistent speech-bubble mark containing a `Q` for AskQ access while preserving descriptive accessible names and responsive reachability.

#### Scenario: Desktop header renders AskQ
- **WHEN** the AskQ icon-only button renders in the desktop header
- **THEN** it SHALL use the shared AskQ mark
- **AND** its accessible name SHALL remain `AskQ Assistant`

#### Scenario: Compact header hides standalone AskQ
- **WHEN** the standalone AskQ button is hidden at compact widths
- **THEN** the same existing AskQ action SHALL remain available as a labeled `AskQ` item in the account menu

### Requirement: Account menu summarizes save state calmly and truthfully
The system SHALL present one account-menu save-state message derived from real network and global replication state instead of separate connectivity and synchronization claims.

#### Scenario: Changes are settled online
- **WHEN** the client is online and global sync state is synced
- **THEN** the account menu SHALL show `All changes saved`

#### Scenario: Changes are pending online
- **WHEN** the client is online and global sync state is pending
- **THEN** the account menu SHALL show `Saving changes...`

#### Scenario: Client is offline
- **WHEN** the client is offline
- **THEN** the account menu SHALL show `Offline — changes saved here`
- **AND** it SHALL NOT claim that changes are synced to the server

#### Scenario: Global sync reports an error
- **WHEN** the client is online and global sync state is error
- **THEN** the account menu SHALL show `Some changes need attention`
- **AND** it SHALL NOT show `All changes saved`
