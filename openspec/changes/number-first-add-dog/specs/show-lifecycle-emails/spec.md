# Spec Delta

## ADDED Requirements

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
