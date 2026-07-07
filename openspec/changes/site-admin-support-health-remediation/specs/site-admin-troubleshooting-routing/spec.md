## ADDED Requirements

### Requirement: Dashboard platform health summary routes to owner surfaces

The system SHALL render a compact platform-health summary on `/admin/dashboard` for site admins. The summary SHALL surface the latest health state/run age, open support-ticket risk, show-day-priority ticket risk when available, sync risk when available, and deleted-item recovery access. Each summary item SHALL link to the existing owner surface instead of duplicating that surface's workflow.

#### Scenario: Dashboard links health state to health board

- **WHEN** a site admin views the dashboard and a health snapshot signal is available
- **THEN** the platform-health summary shows the effective health state and run age with a link to `/admin/health`

#### Scenario: Dashboard links support risk to support inbox

- **WHEN** a site admin views the dashboard and support ticket counts are available
- **THEN** the platform-health summary shows open ticket risk and links to `/admin/support`

#### Scenario: Dashboard degrades honestly when a signal cannot load

- **WHEN** a dashboard platform-health signal fails to load or is unavailable
- **THEN** the affected summary item shows a degraded state with a link to the owner surface and does not show false healthy/status language

#### Scenario: Dashboard does not duplicate owner workflows

- **WHEN** a platform-health summary item represents support, sync, health, or deleted-item recovery
- **THEN** the dashboard renders a route to the existing owner surface and does not render the owner surface's table, repair form, or workflow controls inline

### Requirement: Support diagnostics provide investigation actions

The system SHALL convert recognized support-ticket diagnostics into operator actions. Recognized route, show, trial, class, entry, dog, user, sync, access, and recovery clues SHALL produce links to existing canonical or owner surfaces when a safe route exists. Raw identifiers SHALL remain copyable for escalation.

#### Scenario: Route diagnostic opens reported page

- **WHEN** a support ticket diagnostic contains a valid `route_path`
- **THEN** the support inbox offers an action to open that reported page

#### Scenario: Sync diagnostic routes to sync monitoring

- **WHEN** support ticket diagnostics indicate a sync issue
- **THEN** the support inbox offers an action to open `/admin/sync`

#### Scenario: Access diagnostic routes to permissions users

- **WHEN** support ticket diagnostics indicate a user or access issue
- **THEN** the support inbox offers an action to open `/admin/permissions/users` or the safest existing permissions owner surface

#### Scenario: Unknown diagnostics stay copyable

- **WHEN** support ticket diagnostics contain unrecognized fields or IDs without a canonical route
- **THEN** the support inbox shows the diagnostic value as copyable escalation context without inventing a destination

### Requirement: Support tickets suggest next checks

The system SHALL render a small next-checks area for a selected support ticket based on available diagnostics. Next checks SHALL guide the site admin to existing owner surfaces and SHALL preserve existing ticket status/reply actions.

#### Scenario: Route issue suggests reported route and health

- **WHEN** a support ticket includes a route issue diagnostic
- **THEN** the next-checks area includes the reported route and `/admin/health`

#### Scenario: Data missing issue suggests entity and deleted items

- **WHEN** diagnostics indicate missing data or a recoverable deleted entity
- **THEN** the next-checks area includes the relevant entity owner surface when safe and `/admin/deleted-items`

#### Scenario: Ticket without diagnostics has useful empty state

- **WHEN** a support ticket has no diagnostics
- **THEN** the support inbox shows a clear diagnostics empty state and still offers a copy-ticket-link or copy-escalation action

### Requirement: Access troubleshooting labels are trustworthy

The system SHALL not show unexplained `Unknown User` or `Unknown Role` labels for normal seeded/admin access data. If a user or role relationship truly cannot be resolved, the row SHALL explain the missing relationship and keep the raw ID copyable. Role-card permission/user counts and overview counts SHALL share the same definition or clearly label the difference.

#### Scenario: Resolved users and roles show human labels

- **WHEN** the permissions pages render normal seeded/admin user-role data
- **THEN** role and user rows show resolved human labels instead of unexplained unknown labels

#### Scenario: Missing relationship is explained

- **WHEN** a user-role row references a missing user or role relationship
- **THEN** the permissions UI explains which relationship is missing and provides the raw ID for escalation

#### Scenario: Role counts use a consistent definition

- **WHEN** a role card and permissions overview both show permission or user counts
- **THEN** the counts use the same definition or the UI labels each count's different definition plainly

### Requirement: RBAC test route is labeled debug-only

The system SHALL label `/admin/rbac-test` as debug-only wherever it is linked from production admin navigation or permissions pages.

#### Scenario: Permissions page links RBAC test as debug-only

- **WHEN** a site admin sees a link to `/admin/rbac-test`
- **THEN** the link text or nearby label identifies it as debug-only
