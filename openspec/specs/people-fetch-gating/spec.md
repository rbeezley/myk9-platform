# people-fetch-gating Specification

## Purpose
SA-008 defense-in-depth (half 1). The myK9Show people directory is bulk-loaded
via `useUserStore.loadUsers()` (`getAllUsers()` against the `people` table). Only
management surfaces (owner pickers, user management, judge assignment, club
membership) consume it. Gating the fetch so a plain-exhibitor session never loads
it removes the client's blind reliance on the `people_select` RLS policy staying
strict, and avoids shipping the directory to the largest, least-privileged user
population. The gate is applied at every load site — the login initializer and
the registration `HandlerSelectionDialog` — and the persisted `userStore` is
purged for a resolved non-management session (robust to async IndexedDB
rehydration) so a role downgrade on a shared browser cannot retain the directory.

## Requirements
### Requirement: Exhibitor sessions do not fetch the people directory
The system SHALL NOT call `loadUsers()` (or its underlying `people` query) for a
signed-in session with no admin or secretary role.

#### Scenario: Exhibitor session never triggers the people fetch
- **WHEN** a user with only an exhibitor role signs in and the app initializes
- **THEN** `loadUsers()` / the `people` query is not called

### Requirement: Admin and secretary surfaces still populate the people directory
The system SHALL populate the people directory for admin/secretary surfaces that
require it (owner pickers, user management, judge assignment).

#### Scenario: Admin session populates the people directory on demand
- **WHEN** an admin or secretary user navigates to a surface that requires the
  people directory
- **THEN** `loadUsers()` / the `people` query is called and the directory
  populates
