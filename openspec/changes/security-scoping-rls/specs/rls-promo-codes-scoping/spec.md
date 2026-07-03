## ADDED Requirements

### Requirement: Promo code creation is scoped to show officials
The system SHALL allow `INSERT` on `promo_codes` only for users who manage the
row's show/trial (the same predicate as the accepted `promo_codes` UPDATE policy),
not merely any authenticated user.

#### Scenario: Show official creates a promo code for their own show
- **WHEN** a secretary or admin for show A inserts a `promo_codes` row scoped to
  show A
- **THEN** the insert succeeds

#### Scenario: Unrelated authenticated user cannot create a promo code
- **WHEN** an exhibitor with no official role on show A inserts a `promo_codes`
  row scoped to show A
- **THEN** the insert is denied by RLS

### Requirement: Promo code catalog is not readable by non-officials
The system SHALL NOT allow any authenticated user to `SELECT` the full
`promo_codes` catalog for a show they do not manage. Code validation for
exhibitors SHALL occur through a mechanism that returns only match/no-match and
discount, never the underlying row set.

#### Scenario: Exhibitor cannot enumerate another show's promo codes
- **WHEN** an exhibitor with no official role on show A queries `promo_codes`
  scoped to show A
- **THEN** zero rows are returned (or the query path used by exhibitors is a
  validate-only RPC that never exposes the catalog)

#### Scenario: Show official can read their own show's promo codes
- **WHEN** a secretary or admin for show A queries `promo_codes` scoped to show A
- **THEN** the full set of that show's promo codes is returned
