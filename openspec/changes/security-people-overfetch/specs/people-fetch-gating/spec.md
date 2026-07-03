## ADDED Requirements

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
