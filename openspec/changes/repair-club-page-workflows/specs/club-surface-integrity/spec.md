## ADDED Requirements

### Requirement: Public club routes bootstrap from the replicated club source
The system SHALL use the replication-backed club store to make public club browse and detail routes ready for authenticated users and guests without enabling broad anonymous synchronization or introducing a direct club-data read.

#### Scenario: Guest opens the club directory with an empty cache
- **WHEN** an online guest opens `/clubs` and the local replicated club cache is empty
- **THEN** the system SHALL run one table-specific public club synchronization and reload the local cache
- **AND** the directory SHALL render the public clubs returned by that synchronization

#### Scenario: Concurrent public routes request club readiness
- **WHEN** more than one mounted consumer requests club readiness before the first request settles
- **THEN** the system SHALL deduplicate the in-flight remote club synchronization
- **AND** each consumer SHALL evaluate its own route requirement from the state reloaded after that synchronization

#### Scenario: Online session starts with a populated cache
- **WHEN** an online user opens a club route before any successful club sync has completed in the current client session
- **THEN** the system SHALL perform one table-specific club refresh even when the local cache is populated
- **AND** public browse MAY show cached clubs while that refresh settles

#### Scenario: Offline guest has cached clubs
- **WHEN** an offline guest opens a public club route with clubs in the local cache
- **THEN** the system SHALL render the cached clubs without requiring network access

#### Scenario: Club synchronization fails with no cache
- **WHEN** public club synchronization fails and no cached club can satisfy the route
- **THEN** the system SHALL stop the loading state and show a plain-English unavailable message with a retry action
- **AND** the system SHALL NOT synchronize unrelated replicated tables

#### Scenario: Club synchronization fails with a populated cache
- **WHEN** public club synchronization fails after cached clubs have loaded
- **THEN** the system SHALL preserve and render the cached clubs
- **AND** the failure SHALL NOT erase the usable local state

#### Scenario: Club synchronization exceeds the readiness timeout
- **WHEN** the table-specific club synchronization does not settle within the configured 15-second network timeout
- **THEN** the system SHALL stop blocking the caller and preserve any cached clubs
- **AND** an empty-cache caller SHALL receive the unavailable state with retry while the system prevents parallel duplicate syncs

#### Scenario: Successful synchronization returns no clubs
- **WHEN** the public club synchronization succeeds with an empty club result
- **THEN** the directory SHALL render its normal no-clubs empty state
- **AND** the system SHALL NOT present the result as a network failure

### Requirement: Public club detail routes terminate truthfully
The system SHALL distinguish loading, available, unavailable, and not-found outcomes on the existing `/clubs/:id` route.

#### Scenario: Guest opens a valid club detail URL
- **WHEN** a guest opens `/clubs/:id` for a club returned by the public club readiness operation
- **THEN** the system SHALL render that club on the requested URL
- **AND** it SHALL NOT redirect the guest to `/clubs`

#### Scenario: Requested club is absent from a populated cache
- **WHEN** an online guest requests a club ID that is absent from a cache containing other clubs
- **THEN** the system SHALL perform one table-specific club synchronization before choosing a terminal route state
- **AND** it SHALL render the club if that synchronized result contains the requested ID

#### Scenario: Requested club does not exist
- **WHEN** club readiness settles successfully and the requested club ID is absent
- **THEN** the system SHALL render an in-page club-not-found state with a link to `/clubs`
- **AND** it SHALL NOT show an endless skeleton or malformed placeholder content

#### Scenario: Requested club cannot be checked
- **WHEN** club readiness fails with no usable cache
- **THEN** the system SHALL render the unavailable state rather than claiming the club does not exist

### Requirement: Club profile controls activate canonical tab state
The system SHALL make the existing club profile tab triggers and statistic cards update the same URL-synchronized tab state using normal pointer and keyboard activation.

#### Scenario: User activates a profile tab
- **WHEN** a user activates an available club profile tab with a pointer or keyboard
- **THEN** the matching tab SHALL become selected and its panel SHALL render
- **AND** the `tab` search parameter SHALL contain the matching tab ID

#### Scenario: User activates a statistic card
- **WHEN** a user activates a club statistic card that maps to a profile tab
- **THEN** the matching tab SHALL become selected and its panel SHALL render
- **AND** the tab region SHALL be brought into view without creating a second tab state

#### Scenario: Keyboard user reaches a statistic card
- **WHEN** a keyboard user focuses a statistic card that maps to a profile tab and activates it with Enter or Space
- **THEN** the card SHALL expose button semantics and a visible focus state
- **AND** the matching URL-synchronized tab SHALL activate

#### Scenario: URL contains an unavailable tab
- **WHEN** the `tab` search parameter names a tab the current user cannot access or that is not defined
- **THEN** the system SHALL normalize to the default available tab
- **AND** it SHALL NOT render a blank panel

### Requirement: Club-admin context is validated before use
The system SHALL treat a club-admin role scope as actionable only after its club ID is matched to a loaded live club and SHALL NOT grant access or choose another club when validation fails.

#### Scenario: Club-admin scope matches a live club
- **WHEN** a club administrator's scoped club ID matches a loaded live club
- **THEN** the shell and existing club-admin pages SHALL use that club's ID and name consistently
- **AND** `My Club` links SHALL target the canonical existing routes for that club

#### Scenario: Club data is still loading
- **WHEN** a scoped club administrator opens the shell before club readiness settles
- **THEN** club-scoped navigation SHALL remain non-actionable until validation completes
- **AND** the shell SHALL NOT emit URLs from the unchecked scope ID

#### Scenario: Club-admin cache has not been refreshed this session
- **WHEN** an online scoped club administrator has cached club data but no successful club sync has completed in the current client session
- **THEN** club-scoped navigation SHALL remain non-actionable until the one-session freshness check settles
- **AND** only the refreshed live club set SHALL validate the scope

#### Scenario: Club-admin freshness check fails
- **WHEN** the online freshness check rejects or reaches the readiness timeout
- **THEN** cached club metadata SHALL NOT validate club-admin context
- **AND** the existing club-admin destination SHALL show retryable plain-English access-verification guidance

#### Scenario: Club-admin scope is stale or missing
- **WHEN** club readiness settles and the scoped club ID does not match a live club
- **THEN** the shell SHALL omit dead `My Club` links and direct club-admin pages SHALL show plain-English access-configuration guidance
- **AND** the system SHALL NOT fall back to the first available club

### Requirement: Payment pre-flight controls respond to real activation
The system SHALL preserve the existing treasurer pre-flight checklist and make each visible checklist control complete its stated local or external action under normal pointer and keyboard activation.

#### Scenario: Treasurer opens the pre-flight checklist
- **WHEN** a treasurer activates `Connect payment account`
- **THEN** the four-item preparation checklist SHALL become visible
- **AND** the system SHALL NOT call Stripe onboarding

#### Scenario: Treasurer postpones setup
- **WHEN** a treasurer activates `Not now` in the checklist
- **THEN** the checklist SHALL close and the `Connect payment account` action SHALL return
- **AND** the system SHALL NOT call Stripe onboarding

#### Scenario: Treasurer continues to Stripe
- **WHEN** a treasurer activates `Continue to Stripe`
- **THEN** the system SHALL invoke the existing onboarding operation once and use its returned destination
- **AND** the pre-flight copy and required preparation step SHALL remain intact

#### Scenario: Stripe onboarding cannot start
- **WHEN** the existing onboarding operation rejects
- **THEN** the card SHALL stay on the current page and show a plain-English retryable error
- **AND** a retry SHALL remain protected from duplicate in-flight requests

### Requirement: Contact actions have real destinations
The system SHALL render club email, phone, and website actions only when the corresponding normalized contact value is present.

#### Scenario: Club has no phone number
- **WHEN** a club profile has no usable phone value
- **THEN** `Call Club` and other clickable phone actions SHALL be absent
- **AND** the UI SHALL NOT construct a `tel:` destination from an empty or undefined value

#### Scenario: Club has a usable contact value
- **WHEN** a club profile has a non-empty email, phone, or website value
- **THEN** the corresponding action SHALL use the appropriate `mailto:`, `tel:`, or normalized web destination

#### Scenario: Club website uses an unsupported scheme
- **WHEN** a club website value uses a scheme other than `http:` or `https:`
- **THEN** the system SHALL omit the clickable website action
- **AND** it SHALL NOT execute or navigate to that value

#### Scenario: Club has no header actions
- **WHEN** a club has no usable contact values and the current user has no permitted administrative action
- **THEN** the header SHALL omit the empty options menu trigger

### Requirement: Club surface regressions are verified
The system SHALL retain automated and recorded browser evidence for the five audited club failures.

#### Scenario: Component verification runs
- **WHEN** the repair is ready for review
- **THEN** focused component tests SHALL cover replicated readiness success and failure, validated club context, URL-synchronized profile tabs and statistic cards, payment pointer and keyboard activation, and missing contact values

#### Scenario: Browser verification runs
- **WHEN** the repair is ready for review
- **THEN** clean Chromium Playwright coverage SHALL exercise guest browse/detail and authenticated club profile, navigation, and payment checklist paths
- **AND** the re-walk SHALL include desktop and 375px viewports

#### Scenario: Tracking evidence is completed
- **WHEN** all acceptance scenarios pass
- **THEN** `docs/qa/club-pages-audit-2026-07-18.md` and the five linked `docs/qa/findings.md` records SHALL include closure evidence
- **AND** the implementation issue SHALL remain open until that evidence gate is satisfied
