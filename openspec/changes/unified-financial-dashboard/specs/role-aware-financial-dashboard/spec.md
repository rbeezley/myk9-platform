# role-aware-financial-dashboard

## ADDED Requirements

### Requirement: Scope options and defaults are role-derived

The financial experience SHALL expose only scopes the signed-in role is authorized to
view and SHALL choose a predictable default scope for that role.

#### Scenario: Site admin opens financial oversight

- **WHEN** a site admin opens the canonical financial experience
- **THEN** platform scope is the default and the admin can select authorized clubs and shows

#### Scenario: Club admin opens financial oversight

- **WHEN** a club admin opens the canonical financial experience
- **THEN** their club is the default and only their club and managed shows are selectable

#### Scenario: Secretary opens financial oversight

- **WHEN** a secretary opens the financial experience with a managed show context
- **THEN** that show is the default and no unrelated club or platform totals are exposed

### Requirement: Existing financial surfaces are enriched before consolidation

The system SHALL add reconciliation information to the existing club Payments and
site-admin Payouts surfaces before redirecting them to a canonical route, and SHALL
avoid creating parallel club or site financial pages during the migration.

#### Scenario: Club treasurer reconciles a show transfer

- **WHEN** a club treasurer views existing club payment and payout history
- **THEN** the surface shows per-show net, a copyable Stripe transfer id, settlement
  state, charge-verification badges, and a Stripe link-out when applicable

#### Scenario: Site admin reviews platform income

- **WHEN** a site admin views existing payout oversight
- **THEN** the surface shows online collected totals, gross platform fees, net platform
  income, outstanding transfer liability, and actionable mismatches

### Requirement: Show closeout remains available and consistent

The system SHALL preserve the existing show Financial Report as the secretary's
printable closeout surface and SHALL prove parity for overlapping totals before changing
its data source.

#### Scenario: Secretary prints show closeout

- **WHEN** a secretary prints the Financial Report for a show
- **THEN** the report retains its existing closeout fields, filters, payment-method
  breakdown, and waitlist separation

#### Scenario: Shared service replaces the report's source

- **WHEN** the shared service is wired beneath the printable report
- **THEN** parity tests prove the same show produces the same existing report totals
  for the overlapping current-entry dataset

### Requirement: Canonical route consolidates financial entry points

After the shared service and enriched surfaces are proven, the system SHALL provide a
role-aware `/financial` route and SHALL redirect legacy financial entry points without
breaking supported deep links or onboarding return paths.

#### Scenario: Legacy payout link is opened

- **WHEN** an authorized user opens a legacy financial route after consolidation
- **THEN** the user lands on `/financial` with the correct role-derived scope and context

#### Scenario: Club onboarding returns from Stripe

- **WHEN** a club admin returns from Stripe Connect onboarding
- **THEN** the existing onboarding return path still lands on the intended club payment
  or financial context without losing authorization

### Requirement: Financial oversight does not block offline show-day workflows

The system SHALL keep financial reconciliation outside ringside scoring and show-day
mutations, and SHALL present an explicit unavailable or stale state when online Stripe
proof cannot be loaded.

#### Scenario: User is offline while viewing financial oversight

- **WHEN** the financial view cannot reach its online reconciliation source
- **THEN** it explains that Stripe proof is unavailable or stale and does not claim
  verified reconciliation

#### Scenario: Show-day scoring loses connectivity

- **WHEN** a judge or steward loses connectivity during `/at-show`
- **THEN** scoring and show-day replication continue through their existing offline path
  without depending on the financial dashboard

### Requirement: Exhibitor payment workflow remains singular

The system SHALL leave `/exhibitor/payments` as the exhibitor payment surface and SHALL
not add a second exhibitor financial dashboard or duplicate checkout workflow.

#### Scenario: Exhibitor needs to pay an outstanding balance

- **WHEN** an exhibitor opens their payment experience
- **THEN** the existing payment surface continues to link to the established cart or
  checkout handoff rather than routing through a new financial dashboard
