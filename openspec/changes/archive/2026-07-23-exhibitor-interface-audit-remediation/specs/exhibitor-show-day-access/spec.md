# Delta: exhibitor-show-day-access

## ADDED Requirements

### Requirement: Exhibitor navigation labels ringside plainly

The exhibitor sidebar item linking to `/at-show` SHALL be labeled "Ringside", matching the staff sidebar's existing label for the same surface.

#### Scenario: Sidebar shows Ringside

- **WHEN** an exhibitor-only user views the sidebar
- **THEN** the at-show navigation item reads "Ringside" (not "Show day") and links to `/at-show`

### Requirement: Authenticated users are never asked for a passcode

An authenticated user navigating to ringside from in-app navigation SHALL NOT be shown the passcode entry form. Authenticated users with a grant, staff role, or an entry for the show SHALL pass the access gate as today; authenticated users without any of these SHALL see a signed-in explanatory state (e.g., "Ringside isn't open yet" or no-live-show guidance) instead of the passcode prompt. The passcode form SHALL remain available to anonymous visitors and to the explicit `?passcode=1` flow. The gate SHALL wait for RBAC role resolution before deciding, so staff never flash the restricted state.

#### Scenario: Authenticated exhibitor without entry sees guidance, not passcode

- **WHEN** a signed-in exhibitor with no entry, grant, or staff role opens `/at-show/:showId` from the sidebar
- **THEN** they see the signed-in explanatory state and no passcode input is rendered

#### Scenario: Anonymous passcode path unchanged

- **WHEN** an anonymous visitor opens the ringside passcode flow
- **THEN** the passcode entry form renders exactly as before this change

#### Scenario: Staff bypass not flashed away by slow RBAC

- **WHEN** a signed-in secretary opens `/at-show/:showId` while RBAC roles are still loading
- **THEN** the gate shows a loading state and then admits them, never rendering the passcode or restricted state in between
