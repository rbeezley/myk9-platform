## ADDED Requirements

### Requirement: Assignment scope labels are exact before revoke

The canonical role-assignments ledger SHALL name the exact club for every club-scoped assignment in visible and accessible text. Before revoking an assignment, the confirmation SHALL repeat the target user, role, and scope. Global, Show, and Club grants SHALL remain distinguishable, and unresolved scope relationships SHALL be labeled honestly with enough raw scope context for escalation.

#### Scenario: Club-scoped assignment names the exact club

- **WHEN** the assignments ledger renders a club-scoped role grant whose club relationship resolves
- **THEN** the Scope cell names that exact club in the link’s visible and accessible text
- **AND** Club, Show, and Global grants remain distinguishable

#### Scenario: Revoke confirmation repeats exact scope

- **WHEN** a site admin chooses Revoke for a club-scoped assignment
- **THEN** the confirmation repeats the target user, role, and exact club name before enabling the destructive action

#### Scenario: Missing club relationship is honest

- **WHEN** a club-scoped assignment references a club that cannot be resolved
- **THEN** the Scope cell identifies it as an unresolved club scope rather than presenting it as Global or inventing a club name
- **AND** the revoke confirmation repeats that unresolved club scope and its identifier
