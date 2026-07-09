# entry-confirmation-idempotency

## ADDED Requirements

### Requirement: Webhook confirmation send stamps the entry send-state
When `stripe-webhook` sends an entry confirmation email (`sendEntryConfirmationEmail`), it SHALL stamp the affected entries' `confirmation_email_sent_at`, `confirmation_email_message_id`, and `confirmation_email_status = 'sent'` fields as part of the send flow (on delivery acceptance), using the same send-state semantics as the scheduled sender.

#### Scenario: Online payment confirmation stamps entries
- **WHEN** the webhook successfully sends a confirmation email for a paid online entry
- **THEN** that entry row's `confirmation_email_sent_at` is set and `confirmation_email_status` is `'sent'`

#### Scenario: Failed webhook send leaves entry eligible
- **WHEN** the webhook's confirmation send fails
- **THEN** the entry's `confirmation_email_status` is not `'sent'`, leaving it eligible for the scheduled sender

### Requirement: An entry receives exactly one confirmation email across paths
Across the webhook path and the scheduled `send-confirmation-email` sender, an entry SHALL receive at most one confirmation email. The scheduled sender's audience query (`confirmation_email_sent_at IS NULL AND confirmation_email_status IN ('pending','failed')`) SHALL therefore exclude entries already confirmed by the webhook path.

#### Scenario: Scheduled sender skips webhook-confirmed entries
- **WHEN** the scheduled confirmation sender runs after the webhook has stamped an entry
- **THEN** that entry is not selected and no second confirmation email is sent

#### Scenario: Retry does not duplicate
- **WHEN** either send path is retried for an entry whose send already succeeded
- **THEN** no additional email is delivered (send-state stamp plus a stable idempotency key on the retried path)
