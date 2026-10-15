# show-lifecycle-emails Specification

## Purpose

Define the show lifecycle email sequence (entry receipt, decision, reminder, and results notices) surfaced through the existing secretary communication flow: automatic transactional receipts, secretary-reviewed batch sends, idempotent delivery tracking, and show-scoped authorization for every send path.

## Requirements

### Requirement: Lifecycle Emails Live In Existing Communication Surfaces

The system SHALL expose show lifecycle email status and review controls through the existing secretary communication flow rather than a standalone campaign app.

#### Scenario: Secretary opens scheduled emails for a show

- **WHEN** a secretary opens the show-scoped communication area for a managed show
- **THEN** the system shows Scheduled emails with lifecycle steps, readiness states, recipient counts, warning counts, and sent/skipped/failed counts

#### Scenario: Workbench links to scheduled emails

- **WHEN** a secretary follows a communication link from Show Setup or Show Workbench
- **THEN** the system opens the existing secretary communication surface with the selected show context applied

### Requirement: Online Entry Receipt Sends Automatically

The system SHALL send an entry-received transactional receipt automatically for exhibitor online submissions and SHALL keep that receipt status visible in lifecycle email history.

#### Scenario: Exhibitor submits online entry

- **WHEN** an exhibitor completes an online entry submission
- **THEN** the system sends an entry-received receipt without waiting for secretary review

#### Scenario: Secretary-created entry does not auto-send receipt

- **WHEN** a secretary creates a mail-in, walk-in, or on-behalf entry
- **THEN** the system does not use the automatic exhibitor receipt path for that entry

### Requirement: Entry Decision Emails Require Secretary Preview

The system SHALL prompt the secretary to preview and edit accepted and waitlisted emails at the entry-decision moment before sending.

#### Scenario: Secretary accepts an entry

- **WHEN** a secretary accepts an entry
- **THEN** the system opens an acceptance email preview with recipient, dog/class summary, payment status, armband when available, editable subject, editable body, secretary note, and exact exhibitor preview

#### Scenario: Secretary waitlists an entry

- **WHEN** a secretary waitlists an entry
- **THEN** the system opens a waitlist email preview with recipient, dog/class summary, editable subject, editable body, secretary note, and exact exhibitor preview

#### Scenario: Secretary chooses not now

- **WHEN** a secretary closes an accept/waitlist email prompt with Not now
- **THEN** the system keeps the email job ready in Scheduled emails and on the entry row

### Requirement: Decision Corrections Are Explicit

The system SHALL preserve sent decision email history and provide a correction-email path when a sent accept/waitlist decision later changes.

#### Scenario: Sent acceptance later changes

- **WHEN** an accepted entry has a sent acceptance email and the secretary changes the decision
- **THEN** the system shows the sent email status and offers a Prepare correction email action with a default correction draft

### Requirement: Reminder And Results Emails Require Send Now

The system SHALL prepare 2-week reminder, day-before reminder, and whole-show results-available email batches, and SHALL NOT send those batches until the secretary clicks Send now.

#### Scenario: Two-week reminder becomes ready

- **WHEN** a show is 14 days away in the show's timezone
- **THEN** the system marks the 2-week reminder batch ready for secretary review without sending it

#### Scenario: Day-before reminder becomes ready

- **WHEN** a show is 1 day away in the show's timezone
- **THEN** the system marks the day-before reminder batch ready for secretary review without sending it

#### Scenario: Results batch requires readiness confirmation

- **WHEN** the show end date has passed
- **THEN** the system makes the whole-show results batch available and requires the secretary to confirm results are ready before sending

### Requirement: Lifecycle Steps Are Default Enabled And Individually Configurable

The system SHALL enable lifecycle email steps by default for new shows and SHALL allow the secretary to disable each reviewed lifecycle step independently.

#### Scenario: New show has default lifecycle steps

- **WHEN** a new show is created
- **THEN** accepted, waitlisted, 2-week reminder, day-before reminder, and results-available reviewed lifecycle steps are enabled by default

#### Scenario: Secretary disables a reminder step

- **WHEN** a secretary disables the 2-week reminder step for a show
- **THEN** the system does not prepare new 2-week reminder recipient jobs for that show while the step remains disabled

#### Scenario: Secretary disables decision prompt

- **WHEN** a secretary disables the accepted email step for a show and later accepts an entry
- **THEN** the system suppresses the automatic post-decision prompt but keeps manual Send/Edit access available from the entry row or Scheduled emails

### Requirement: Secretary Can Edit Reviewed Emails

The system SHALL let the secretary edit reviewed email subject, message body, and secretary note before sending.

#### Scenario: Secretary edits a reviewed batch

- **WHEN** a secretary edits the subject, message body, or secretary note before sending a batch
- **THEN** the system sends the reviewed email using the edited values and stores the final rendered subject/body/note for audit

#### Scenario: Secretary skips a recipient

- **WHEN** a secretary skips a recipient during batch review
- **THEN** the system excludes that recipient from Send now and records the recipient as skipped

### Requirement: Preview Uses Resolved Values

The system SHALL show exact rendered previews with resolved show, entry, dog, class, armband, schedule, and result data before reviewed sends.

#### Scenario: Preview has all required data

- **WHEN** a lifecycle email preview is generated for a recipient with complete data
- **THEN** the preview shows the exact subject and body the exhibitor will receive

#### Scenario: Optional merge data is missing

- **WHEN** optional data such as armband or class detail is missing
- **THEN** the preview omits that optional sentence or uses plain fallback copy and shows a warning before send

### Requirement: Lifecycle Sends Are Authorized And Scoped

The system SHALL authorize reviewed lifecycle email preview, edit, skip, and send actions by show-management permission and SHALL validate delivery scope server-side.

#### Scenario: Show manager sends lifecycle email

- **WHEN** a user who can manage a show sends a reviewed lifecycle email for that show
- **THEN** the system allows the send and records the delivery attempt

#### Scenario: Cross-show send is denied

- **WHEN** a user without permission for a show attempts to preview, edit, skip, or send lifecycle email for that show
- **THEN** the system denies the action without exposing recipient data

### Requirement: Lifecycle Email Content Is Safe To Render

The system SHALL escape or sanitize editable email content before rendering HTML email.

#### Scenario: Secretary note contains markup

- **WHEN** a secretary note contains HTML-like text
- **THEN** the rendered email treats that text as safe content and does not execute or inject markup

### Requirement: Delivery Is Idempotent And Auditable

The system SHALL use stable idempotency keys and SHALL link lifecycle email jobs to delivery audit records.

#### Scenario: Send is retried after uncertain delivery

- **WHEN** a reviewed lifecycle email send is retried after a network or status-update failure
- **THEN** the system uses the same idempotency key and does not deliver a duplicate email

#### Scenario: Delivery webhook updates status

- **WHEN** Resend reports delivered, bounced, complained, or failed status for a lifecycle email
- **THEN** the system reflects the delivery status in lifecycle email history through the linked delivery record

### Requirement: Partial Batch Failures Are Recoverable

The system SHALL record per-recipient results for batch sends and SHALL allow retrying failed recipients without resending successful recipients.

#### Scenario: Some recipients fail

- **WHEN** a batch send succeeds for some recipients and fails for others
- **THEN** the system shows sent and failed counts separately and offers retry for failed recipients only

### Requirement: Batch Preparation Scales

The system SHALL prepare and review lifecycle email batches using bounded data access and SHALL avoid N+1 recipient lookups.

#### Scenario: Secretary opens a large batch

- **WHEN** a secretary opens a lifecycle email batch with many eligible recipients
- **THEN** the system loads batch summary first and fetches recipient preview data through bounded, indexed queries

### Requirement: Email Delivery Does Not Block Entry Decisions

The system SHALL allow entry status changes to complete even when email delivery is unavailable.

#### Scenario: Secretary is offline after accepting an entry

- **WHEN** a secretary accepts an entry while email delivery is unavailable
- **THEN** the entry decision remains saved and the email prompt clearly indicates the email can be sent when online

### Requirement: Focused Verification Covers Lifecycle Email Risk

The implementation SHALL include tests for scheduling, preview rendering, secretary edits, authorization, sanitization, idempotency, partial failure, retry, correction, and unchanged automatic receipt behavior.

#### Scenario: Verification suite runs

- **WHEN** the focused lifecycle email tests run
- **THEN** they cover the reviewed email path, automatic entry receipt path, batch path, security path, and failure handling path

### Requirement: Registration number needed email

The system SHALL provide a "Registration number needed" lifecycle step. It SHALL be enabled by default for new and existing shows and SHALL be configurable with the other steps. It follows the secretary-reviewed send pattern:

- the secretary sends it from the "Registration number needed" Exceptions row, after a preview of the email to the exhibitor;
- the email names the dog, the show and the trial registry, says the entry is held pending the number, and explains how to provide it;
- it is never prepared or sent for an entry that is no longer awaiting a number.

#### Scenario: First email from the Exceptions row

- **WHEN** the secretary chooses "Email exhibitor" on a "Registration number needed" row that has no earlier email
- **THEN** a previewed email for that entry is prepared and sent on confirmation, and the row's button becomes "Send reminder"

#### Scenario: Reminder from the Exceptions row

- **WHEN** the secretary chooses "Send reminder" on a row that already has an email
- **THEN** a new previewed email for that entry is prepared and sent on confirmation, and its delivery is recorded in lifecycle email history

#### Scenario: A retried send is the same email

- **WHEN** the secretary presses Send again in the same preview because the first response never arrived
- **THEN** no second email is delivered: an email already sent answers as sent, and one still waiting or failed is sent as itself

#### Scenario: No email address on file

- **WHEN** the entry's exhibitor has no email address
- **THEN** no email is prepared, and the row reads "No email on file. Contact by phone."

#### Scenario: Number arrives before sending

- **WHEN** the dog's registration is added before the secretary presses Send
- **THEN** the server skips the send and nothing is emailed, and the secretary is told the number is on file

#### Scenario: Send on demand only

- **WHEN** the club views Scheduled emails
- **THEN** the step has an on/off toggle but no batch review or batch send

#### Scenario: Disabled step sends nothing

- **WHEN** the step is disabled for the show
- **THEN** the row offers no email button
