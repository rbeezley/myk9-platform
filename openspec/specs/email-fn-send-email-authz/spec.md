# email-fn-send-email-authz Specification

## Purpose
SA-004 remediation. The `send-email` edge function originates branded
`@myk9show.com` mail (entry-status notices, custom secretary messages). Before
this change it invoked Resend without authorizing the caller, so any party could
originate mail from the platform domain — a spam/phishing and domain-reputation
risk at launch. The function now requires an authenticated caller (`401` with no
JWT) who is a secretary/admin for the referenced show/registration (mirroring
`send-registration-email`'s role check), and applies per-user rate-limiting
(reusing the `check_login_rate_limit` RPC pattern) so a single caller cannot
originate unbounded volume. Deployed live 2026-07-04 (v58); verified `401` on an
unauthenticated call.

## Requirements
### Requirement: send-email requires show-official authorization
The system SHALL reject calls to the `send-email` edge function from a caller
who is not a secretary or admin for the referenced show/registration, and SHALL
NOT invoke the email provider on a denied call.

#### Scenario: Non-official caller is denied
- **WHEN** a user with no official role on the referenced show calls
  `send-email` for another address
- **THEN** the function returns a 403-class error and does not invoke the Resend
  send

#### Scenario: Show official can send
- **WHEN** a secretary or admin for the referenced show calls `send-email`
- **THEN** the function proceeds and invokes the Resend send

### Requirement: send-email is rate-limited per user
The system SHALL apply per-user rate-limiting to `send-email` so a single caller
cannot originate unbounded email volume.

#### Scenario: Caller exceeds the rate limit
- **WHEN** a caller invokes `send-email` more than the allowed number of times
  within the limiter's window
- **THEN** subsequent calls within the window are rejected

### Requirement: send-email recipient is derived from the referenced resource

The system SHALL determine the recipient (and any cc) of a `send-email` message
from the referenced resource, not from caller-supplied body fields, for message
types whose recipient is a specific known party. For `support_notification` the
recipient SHALL be the referenced support ticket's owner. For `entry_decision`
the recipient SHALL be the referenced registration's exhibitor/person email. The
function SHALL ignore body-supplied `to` and `cc` for these types.

#### Scenario: support_notification recipient is the ticket owner, not the body

- **WHEN** a caller invokes `send-email` with `type: 'support_notification'`, a
  valid `ticketId`, and a body `to` set to an unrelated third-party address
- **THEN** the email is sent to the ticket owner's email address and NOT to the
  body-supplied `to`

#### Scenario: entry_decision recipient is the registration exhibitor, not the body

- **WHEN** a show official invokes `send-email` with `type: 'entry_decision'`, a
  valid registration reference, and a body `to` set to an unrelated third-party
  address
- **THEN** the email is sent to the registration's exhibitor/person email and
  NOT to the body-supplied `to`

#### Scenario: Body cc is ignored for derived-recipient types

- **WHEN** a caller supplies a `cc` array in the body for a
  `support_notification` or `entry_decision` call
- **THEN** the function does not forward the caller-supplied `cc` to the email
  provider
