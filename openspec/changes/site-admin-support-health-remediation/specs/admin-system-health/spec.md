## ADDED Requirements

### Requirement: Degraded health checks expose owner and next action

The system SHALL attach remediation metadata to health checks rendered on `/admin/health`. For every failed, warning, stale, unknown, or incomplete check, the page SHALL show a plain-English owner surface or runbook destination and a next-action link. Known sync checks SHALL route to `/admin/sync`; support checks SHALL route to `/admin/support`; deleted/recovery checks SHALL route to `/admin/deleted-items`; permission/access checks SHALL route to `/admin/permissions`; payout/payment checks SHALL route to `/admin/payouts`; migration, deploy, scheduler, or manual checks SHALL route to the relevant operations runbook when no app owner surface exists.

#### Scenario: Failed sync check links to sync monitoring

- **WHEN** `/admin/health` renders a failed, warning, stale, unknown, or incomplete sync-related check
- **THEN** the check row shows `/admin/sync` as the owner action

#### Scenario: Failed payout check links to payout owner

- **WHEN** `/admin/health` renders a failed, warning, stale, unknown, or incomplete payout-related check
- **THEN** the check row shows `/admin/payouts` or the relevant operations runbook as the owner action

#### Scenario: Unknown check still has a safe fallback

- **WHEN** `/admin/health` renders a degraded check key with no known metadata
- **THEN** the check row explains that ownership is incomplete and links to the operations runbook or health details instead of rendering without a next step

### Requirement: Coverage incomplete is distinct from failed checks

The system SHALL represent health checks that are not evaluated by the current health runner as a distinct coverage-incomplete state. Coverage-incomplete items SHALL not be hidden inside generic detail text and SHALL include the owner or runbook action needed to complete coverage.

#### Scenario: Incomplete check is visible

- **WHEN** the health model marks a check as not evaluated or coverage-incomplete
- **THEN** `/admin/health` renders it as a visible incomplete state with explanatory text and a next action

#### Scenario: Incomplete state is not presented as healthy

- **WHEN** a health snapshot is otherwise healthy but has incomplete coverage
- **THEN** the page does not present the incomplete check as `ok` or omit it from the operator view

### Requirement: Recent run history is understandable without hover

The system SHALL render recent health run history with visible text or an expandable details area so a site admin can understand run status and timing without relying on hover-only dots.

#### Scenario: Recent runs show status and timing text

- **WHEN** `/admin/health` renders recent run history
- **THEN** each listed recent run exposes status and timing information as visible text or in a touch-accessible expandable detail

#### Scenario: All-green state remains glanceable

- **WHEN** all recent health runs and checks are healthy
- **THEN** the health page remains compact and easy to scan while still exposing non-hover run history
