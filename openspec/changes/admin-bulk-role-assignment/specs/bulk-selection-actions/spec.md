# bulk-selection-actions — delta for admin-bulk-role-assignment

## ADDED Requirements

### Requirement: Admin bulk role assignment is canonical, scope-aware, and honest

The admin Users surface SHALL offer bulk role assignment (add, remove, replace) whose role
options come from the same canonical role vocabulary as the single-user role editor —
never a hardcoded list — and whose club-scoped roles require an explicit club selection
that is passed to the RBAC service. Per-user results SHALL be reported through the honest
partial-failure summary: a service-level refusal or error fails or skips that user
visibly, never reporting success for work that did not happen.

#### Scenario: Role options match the canonical vocabulary

- **WHEN** an admin opens the bulk role dialog
- **THEN** the selectable roles are exactly the shared manageable-role list used by the
  single-user role editor
- **AND** no role name outside the canonical `roles` table can be dispatched

#### Scenario: Club-scoped roles require a club

- **WHEN** an admin selects a club-scoped role (secretary, club admin) in the bulk dialog
- **THEN** the dialog requires at least one club before submitting
- **AND** each grant is dispatched with that club's scope

#### Scenario: Service refusal is not silent success

- **WHEN** the RBAC service refuses or fails a role grant for one user in a batch
- **THEN** that user is reported as failed or skipped in the batch summary
- **AND** the summary never claims full success when any user's roles were not applied

#### Scenario: Replace validates before it revokes

- **WHEN** an admin runs Replace with a target role set
- **THEN** the target roles are validated against the canonical role table before any
  existing role is revoked
- **AND** locked always-assigned roles are preserved
- **AND** a failure during a user's replace leaves that user reported as failed rather
  than silently half-applied
