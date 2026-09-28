# Spec Delta

## Purpose

Keeps the site-admin decision to authorize a club visible until it is complete, so access approval cannot be mistaken for permission to publish a show.

## ADDED Requirements

### Requirement: Pending club authorization remains discoverable

The system SHALL show site admins live, unauthorized clubs on the existing admin onboarding surface, including clubs without a club access request. The list SHALL be derived from current server authorization state after navigation or reload.

#### Scenario: Approved request still needs authorization

- **WHEN** a site admin approves a club access request and the resulting club remains unauthorized
- **THEN** the onboarding surface shows that club as pending authorization immediately and after a reload

#### Scenario: Club was created outside access requests

- **WHEN** a live club has no authorization and no matching access-request row
- **THEN** the same pending list shows the club and a way to authorize it

#### Scenario: Club is authorized or deleted

- **WHEN** a club is authorized or deleted
- **THEN** it is absent from the pending authorization list after refresh

### Requirement: Authorization is a deliberate site-admin action

The system SHALL keep club access approval separate from publication authorization. The pending authorization action SHALL name the exact club and explain that authorizing permits public listing and show publication. Authorization SHALL use the existing site-admin-only server authorization boundary.

#### Scenario: Admin authorizes a pending club

- **WHEN** a site admin confirms authorization for a named club
- **THEN** the server records that club as authorized and the pending list removes it after a successful refresh

#### Scenario: Admin cancels authorization

- **WHEN** a site admin dismisses the confirmation
- **THEN** the club remains unauthorized and visible in the pending list

#### Scenario: Another admin already authorized the club

- **WHEN** the selected club was authorized in another session before confirmation
- **THEN** the action completes idempotently and the refreshed list removes the club

### Requirement: Pending state and failures are truthful

The system SHALL distinguish loading, an empty pending list, and an unavailable authorization check. A failed authorization SHALL retain the club in view with a retry path and SHALL not claim success.

#### Scenario: Pending list cannot load

- **WHEN** the server read fails
- **THEN** the onboarding surface shows an error and retry control rather than saying all clubs are ready

#### Scenario: Authorization write fails

- **WHEN** the server rejects or cannot complete authorization
- **THEN** the onboarding surface reports the failure and retains the club for retry
