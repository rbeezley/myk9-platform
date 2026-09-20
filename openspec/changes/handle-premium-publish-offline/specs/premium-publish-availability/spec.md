## Purpose

Make premium publishing availability truthful and role-scoped so managers understand loading/offline conditions while exhibitors trigger no unnecessary publish-state read.

## ADDED Requirements

### Requirement: Premium publish actions distinguish loading and offline states

Every existing premium publish control SHALL use one shared derivation that distinguishes an initial loading read from a network-paused offline read and exposes the same disabled reason in visible copy.

#### Scenario: Publish-state query is paused offline

- **WHEN** an authorized manager views a premium publish action while offline and its query is paused
- **THEN** the action is disabled
- **AND** visible copy says `You're offline — publishing needs a connection`

#### Scenario: Publish-state query is loading online

- **WHEN** the initial publish-state read is pending while online
- **THEN** the action is disabled with a visible loading affordance rather than only a hover title

### Requirement: Publish-state reads are permission-gated

The system SHALL request premium publish state only after the current viewer's resolved show-management scope authorizes publishing.

#### Scenario: Exhibitor opens a show route

- **WHEN** a signed-in exhibitor who cannot manage the show opens any route under that show
- **THEN** no premium publish-state request is issued

#### Scenario: Management scope is unresolved

- **WHEN** the viewer's show-management scope has not resolved
- **THEN** the publish-state request remains disabled until authorization resolves true
