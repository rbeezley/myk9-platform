# exhibitor-show-day-access Specification

## Purpose
Entered exhibitors reaching show-day surfaces get exhibitor-relevant guidance in exhibitor voice — never a worker-passcode dead end, staff jargon, or staff-only controls — while staff surfaces keep their existing behavior.
## Requirements
### Requirement: Show day path never dead-ends entered exhibitors in worker jargon
When a signed-in exhibitor with entries in a show reaches the show's at-show gate without ringside access, the gate SHALL present exhibitor-voiced guidance and links to the exhibitor's own show-day information (their entries and check-in on My Shows), with the worker-passcode path presented as secondary. Gate copy for non-workers SHALL NOT assume the visitor was given a passcode.

#### Scenario: Entered exhibitor taps Show day
- **WHEN** an exhibitor with entries in a show navigates from the Show day nav item to that show and lacks ringside access
- **THEN** the page explains, in exhibitor language, where their check-in and show-day details live, and links there — the passcode prompt is available but not the primary message

#### Scenario: Visitor with no entries and no access
- **WHEN** a user with neither entries nor ringside access opens the at-show gate
- **THEN** the copy explains both audiences' paths (exhibitors → their entries; show workers → passcode) without assuming either

### Requirement: Check-in dialog speaks in exhibitor voice for exhibitors
When the check-in dialog is opened by an exhibitor for their own entry, status labels and descriptions SHALL be first-person exhibitor voice, staff-only statuses (Conflict, Pulled) SHALL NOT be selectable, and the identifying number SHALL be labeled with its actual type (confirmation number vs armband number). Staff surfaces retain the existing staff voice and full status set.

#### Scenario: Exhibitor updates own check-in
- **WHEN** an exhibitor opens check-in for their entry
- **THEN** the selectable statuses are limited to self-service ones (e.g. not checked in / checked in / at gate) with first-person labels, and no third-person "Exhibitor has…" copy is shown

#### Scenario: Identifier labeled correctly
- **WHEN** the check-in dialog header shows the entry's identifying number
- **THEN** the label matches the value's actual type and no dangling "#" placeholder renders when a number is absent

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

