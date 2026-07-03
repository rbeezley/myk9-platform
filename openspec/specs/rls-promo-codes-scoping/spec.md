# rls-promo-codes-scoping Specification

## Purpose
TBD - created by archiving change security-scoping-rls. Update Purpose after archive.
## Requirements
### Requirement: Promo code mutations are scoped to show managers
The system SHALL allow `INSERT`, `UPDATE`, and `DELETE` on `promo_codes` only for
users who manage the row's show/trial — a **club manager** of that show (club
admin, club secretary, or site admin) per `can_manage_show` / `can_manage_trial`,
not merely any authenticated user and not any secretary of an unrelated club.
Authorization is deliberately CLUB-scoped (SA-002 authz decision, Option A):
show-scoped-only officials are not admitted to financial config. On `INSERT` the
row SHALL additionally be attributed to the acting user (`created_by = auth.uid()`)
so a manager cannot spoof who created financial config. The `usage_count`
increment during checkout is exempted only through the `increment_promo_usage`
SECURITY DEFINER RPC, never through direct table access.

#### Scenario: Club manager creates a promo code for their own show
- **WHEN** a club secretary or admin for show A inserts a `promo_codes` row scoped
  to show A
- **THEN** the insert succeeds

#### Scenario: Unrelated authenticated user cannot create a promo code
- **WHEN** an exhibitor with no managing role on show A inserts a `promo_codes`
  row scoped to show A
- **THEN** the insert is denied by RLS

#### Scenario: Secretary of an unrelated club cannot edit or delete a promo code
- **WHEN** a secretary of club B (with no managing role on show A) updates or
  deletes a `promo_codes` row scoped to show A
- **THEN** the mutation is denied by RLS

#### Scenario: Manager cannot spoof the creator of a promo code
- **WHEN** a club manager of show A inserts a `promo_codes` row scoped to show A
  with a `created_by` that is not their own `auth.uid()`
- **THEN** the insert is denied by RLS

### Requirement: Promo code catalog is not readable by non-managers
The system SHALL NOT allow any authenticated user to `SELECT` the full
`promo_codes` catalog for a show they do not manage (per `can_manage_show` /
`can_manage_trial`). Code validation for exhibitors SHALL occur through a
mechanism that returns only match/no-match and discount, never the underlying
row set.

#### Scenario: Exhibitor cannot enumerate another show's promo codes
- **WHEN** an exhibitor with no managing role on show A queries `promo_codes`
  scoped to show A
- **THEN** zero rows are returned (or the query path used by exhibitors is a
  validate-only RPC that never exposes the catalog)

#### Scenario: Club manager can read their own show's promo codes
- **WHEN** a club secretary or admin for show A queries `promo_codes` scoped to
  show A
- **THEN** the full set of that show's promo codes is returned

