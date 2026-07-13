# email-fn-send-results-authz Specification

## Purpose
TBD. Part of the security-audit-remediation change. The `send-results` edge
function sends results email on behalf of a show; before this change it lacked
show-official authorization and allowed caller-supplied override of the
cc/reply-to/destination address fields.

## Requirements
### Requirement: send-results requires show-official authorization

The system SHALL reject calls to the `send-results` edge function from a caller
who is not a show official (secretary/admin) for the show the results belong to,
and SHALL NOT invoke the email provider on a denied call. The authorization
check SHALL query the `user_roles` table for a qualifying role on the results'
show (mirroring `send-targeted-message`), not rely on JWT claims.

#### Scenario: Non-official caller is denied

- **WHEN** an authenticated user with no official role on the results' show
  calls `send-results`
- **THEN** the function returns a 403-class error and does not invoke the email
  provider

#### Scenario: Show official can send results

- **WHEN** a secretary or admin for the results' show calls `send-results`
- **THEN** the function proceeds and submits the results email

### Requirement: send-results address fields are server-derived

The system SHALL derive the cc and reply-to addresses of a `send-results`
message from the show/secretary record on the server, not from the request body.
The primary destination SHALL remain the fixed submission address. The function
SHALL ignore body-supplied cc, reply-to, and destination overrides.

#### Scenario: Secretary email comes from the show record

- **WHEN** a caller supplies a `secretaryEmail` (or cc / reply-to) in the request
  body
- **THEN** the function uses the show record's secretary email for cc/reply-to
  and ignores the body-supplied value

#### Scenario: Destination is not caller-overridable

- **WHEN** a caller attempts to set the destination address in the request body
- **THEN** the results email is sent only to the fixed submission address
