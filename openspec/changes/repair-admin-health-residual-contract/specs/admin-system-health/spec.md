## ADDED Requirements

### Requirement: Complete daily ACL freshness

All three scheduled ACL checks SHALL use a 48-hour stale window. Continuous runs SHALL preserve the prior daily verdict and measurement timestamp. Unknown legacy checks SHALL retain the 26-hour fallback.

#### Scenario: Public schema ACL carried forward

- **WHEN** a continuous snapshot carries a prior public-schema ACL result
- **THEN** its verdict and measurement timestamp remain unchanged and its stale window is 48 hours

#### Scenario: Coverage metadata completeness

- **WHEN** a coverage surface defines a scheduled check key
- **THEN** that key has cadence metadata; surfaces without a check key do not invent scheduled checks

### Requirement: Explicit accessible remediation destinations

Both admin health and dashboard recovery actions SHALL distinguish validated internal routes from approved HTTPS external URLs. Internal navigation SHALL avoid reload. External destinations SHALL open in a new tab with noreferrer and an accessible indication. Absolute or protocol-relative values SHALL be rejected as internal routes.

#### Scenario: ACL runbook recovery

- **WHEN** a site administrator follows an ACL recovery action on either surface
- **THEN** the existing public GitHub operator runbook opens at its exact HTTPS address in a new tab with an accessible indication

#### Scenario: Invalid destination mixing

- **WHEN** an absolute or protocol-relative URL is supplied as an internal route
- **THEN** construction rejects it before rendering
