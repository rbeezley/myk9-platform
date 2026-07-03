## ADDED Requirements

### Requirement: user_roles SELECT is scoped to self or site admin
The system SHALL allow `SELECT` on `user_roles` only for the row's own user or a
site admin, not for any authenticated user regardless of ownership.

#### Scenario: User reads their own role rows
- **WHEN** an authenticated user queries `user_roles` filtered to their own
  `auth_user_id`
- **THEN** their own rows are returned

#### Scenario: Non-admin cannot read another user's role rows
- **WHEN** an authenticated non-admin user queries `user_roles` for a different
  user's `auth_user_id`
- **THEN** zero rows are returned

#### Scenario: Site admin reads all role rows
- **WHEN** a site admin queries `user_roles`
- **THEN** all rows are returned

### Requirement: permission_audit_log SELECT is site-admin only
The system SHALL allow `SELECT` on `permission_audit_log` only for site admins.

#### Scenario: Non-admin cannot read the audit log
- **WHEN** an authenticated non-admin user queries `permission_audit_log`
- **THEN** zero rows are returned

#### Scenario: Site admin reads the audit log
- **WHEN** a site admin queries `permission_audit_log`
- **THEN** all rows are returned

### Requirement: RBAC catalog reads do not regress current-user resolution
The system SHALL continue to let any authenticated user resolve their own
current roles and permissions after `user_roles`/`roles`/`permissions`/
`role_permissions` SELECT policies are scoped.

#### Scenario: Authenticated user still resolves their own roles after scoping
- **WHEN** a normal authenticated user's session initializes after the SELECT
  policies are scoped
- **THEN** their own roles and permissions resolve correctly (no lockout
  regression), proven by the existing AuthContext/RBAC test suite staying green
