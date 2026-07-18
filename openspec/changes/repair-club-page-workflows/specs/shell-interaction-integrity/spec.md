## ADDED Requirements

### Requirement: Club-admin chrome uses validated live club context
The system SHALL construct the `My Club` navigation group from a role-scoped club that has been validated against the loaded live club set and SHALL NOT emit actionable club links from an unchecked, stale, or missing scope.

#### Scenario: Scoped club is validated
- **WHEN** a club administrator's scope matches a loaded live club
- **THEN** the shell SHALL label the context with that club's live name
- **AND** `Our Shows` and `Club Profile` SHALL link to the canonical existing routes using that validated club ID

#### Scenario: Scoped club is unresolved while clubs load
- **WHEN** club readiness has not settled
- **THEN** the shell SHALL keep the `My Club` destinations non-actionable
- **AND** it SHALL NOT construct a destination from the raw role scope

#### Scenario: Scoped club is invalid after clubs load
- **WHEN** club readiness settles and no live club matches the role scope
- **THEN** the shell SHALL omit the dead club destinations and expose plain-English access-configuration guidance on the existing destination page
- **AND** it SHALL NOT substitute another club or create a duplicate club-selection surface

#### Scenario: Live club scope cannot be verified
- **WHEN** the current-session club freshness check fails or times out
- **THEN** the shell SHALL keep `My Club` destinations non-actionable even when a matching cached club exists
- **AND** the existing destination page SHALL offer a retry without granting or substituting club context
