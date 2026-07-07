## ADDED Requirements

### Requirement: Support ticket persistence

The system SHALL persist a support ticket in the database when a user escalates, recording the author, a short subject/body, a status, and a creation time. Ticket status SHALL be one of `open`, `waiting` (awaiting the customer), or `resolved`.

#### Scenario: Ticket created on escalation
- **WHEN** a user submits the escalation form with a one-sentence description
- **THEN** a ticket row is created with status `open`, owned by that user, and the operator is notified

#### Scenario: Status transitions
- **WHEN** the operator or a customer reply changes the ticket state
- **THEN** the ticket status moves among `open`, `waiting`, and `resolved` and the change is persisted

### Requirement: Auto-captured diagnostic bundle

Each ticket SHALL carry a diagnostic bundle captured automatically at creation time, containing at least: user id and role, the current route, any in-context show / trial / entry ids, the app version, online/offline connectivity plus replication watermark state, and the most recent client errors. The user SHALL NOT be required to enter any of this technical state.

#### Scenario: Bundle attached without user effort
- **WHEN** a ticket is created
- **THEN** the diagnostic bundle is captured and stored with the ticket, populated from app state rather than user input

#### Scenario: Missing context degrades gracefully
- **WHEN** some diagnostic field is unavailable (e.g. no show in context)
- **THEN** the bundle records that field as absent and ticket creation still succeeds

### Requirement: In-app threaded reply

The system SHALL provide back-and-forth replies between the customer and operator as an in-app thread attached to the ticket. Because the existing show-scoped messaging tables cannot represent show-independent tickets, the thread MAY use a dedicated support-message store; it SHALL reuse the existing push and email notification infrastructure rather than introduce a new notification system. Replies SHALL be visible to both the ticket owner and site admins in the thread.

#### Scenario: Operator reply reaches customer in-app
- **WHEN** the operator posts a reply to a ticket
- **THEN** the reply is appended to the ticket thread and the customer can read it inside the app

#### Scenario: Customer reply continues the thread
- **WHEN** the ticket owner posts a reply from the app
- **THEN** the message is appended to the same thread and the operator is notified

### Requirement: Notifications without inbound email

The system SHALL notify the operator when a ticket is created and notify the customer when a reply is posted, using the existing web-push infrastructure and Resend email. Notification emails SHALL link back into the app; the system SHALL NOT ingest inbound email replies.

#### Scenario: Operator notified on new ticket
- **WHEN** a ticket is created
- **THEN** the operator receives a push and/or email notification linking to the ticket in the operator inbox

#### Scenario: Customer notified on reply
- **WHEN** the operator replies
- **THEN** the customer receives a push and/or email notification whose email links back into the in-app thread, not a reply-by-email address

#### Scenario: Inbound email is not processed
- **WHEN** a customer replies to a notification email
- **THEN** that email is not ingested as a ticket message (the supported path is the in-app thread)

### Requirement: Ticket access control

Support tickets and their threads SHALL be readable and writable only by the ticket owner and site admins, enforced by row-level security. The backing table SHALL have explicit GRANTs consistent with that scoping and SHALL NOT be readable by anon.

#### Scenario: Owner sees only own tickets
- **WHEN** a non-admin user queries tickets
- **THEN** they can read and reply to only their own tickets and no others

#### Scenario: Site admin sees all tickets
- **WHEN** a site admin queries tickets
- **THEN** they can read every ticket and its thread

#### Scenario: Anonymous denied
- **WHEN** an anonymous/unauthenticated request targets the tickets table
- **THEN** access is denied

### Requirement: Show-day priority flag

A ticket SHALL be markable as show-day priority, and such tickets SHALL surface connectivity/replication diagnostic state prominently for fast triage.

#### Scenario: Secretary show-day ticket flagged
- **WHEN** a secretary raises a ticket while in a show-day context
- **THEN** the ticket carries a show-day priority flag and its connectivity/replication state is highlighted for the operator
