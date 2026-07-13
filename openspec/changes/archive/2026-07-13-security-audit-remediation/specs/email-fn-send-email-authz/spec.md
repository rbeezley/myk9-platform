## ADDED Requirements

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
