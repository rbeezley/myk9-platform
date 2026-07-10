## ADDED Requirements

### Requirement: Account menu groups shared utilities by user task
The system SHALL organize the existing account menu into recognizable task groups without creating duplicate account, billing, support, assistant, or appearance surfaces.

#### Scenario: Free or shows-based trial user opens the account menu
- **WHEN** a signed-in user has no paid or early-adopter premium plan to manage
- **THEN** the account group SHALL contain Account and one `View plans` link to the existing pricing page
- **AND** the menu SHALL NOT also present a Subscription link

#### Scenario: Managed premium user opens the account menu
- **WHEN** a signed-in user has paid or early-adopter premium access
- **THEN** the account group SHALL contain Account and one `Plan & billing` link to the existing subscription page
- **AND** the menu SHALL NOT also present a Pricing link

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
