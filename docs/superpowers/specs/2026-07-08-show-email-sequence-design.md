# Show Email Sequence Design

Date: 2026-07-08

## Problem

Secretaries need lifecycle emails that reduce repeated manual work without turning myK9Show into a separate campaign tool. Exhibitors also need timely reassurance: online entries should produce immediate receipts, entry decisions should be clear, and pre-show reminders should tell them what to expect.

The risk is duplicated communication surfaces. myK9Show already has Message Center, secretary message history, entry-management email actions, Resend email functions, `email_log`, and delivery webhooks. This design consolidates lifecycle email control into the existing communication flow instead of adding a standalone campaign app.

## Goals

- Keep the Message Center / secretary communications area as the owner of show communication history and scheduled email control.
- Send online entry receipts automatically when exhibitors submit entries.
- Prompt the secretary to review and send accepted/waitlisted emails at the decision moment.
- Prepare 2-week, day-before, and post-show results batches for secretary review.
- Let secretaries edit the message and add their own notes before sending reviewed emails.
- Show exact merged previews before reviewed sends.
- Track recipient status, delivery status, skips, and failures.
- Keep V1 focused on launch-critical lifecycle emails, not general marketing automation.

## Non-Goals

- No new standalone campaign app.
- No global template library in V1.
- No arbitrary custom campaign builder in V1.
- No automatic reminder/results sends without a secretary clicking Send now.
- No per-class results email in V1, though the model should not block it later.

## Duplication Answer

This does not justify a new page family or app. Scheduled emails belong in the existing secretary communications surface because secretaries already use Message Center for show messages and communication history. Show Setup and the Show Workbench may deep-link into the show-scoped email section, but they should not reimplement review, preview, or delivery history.

## V1 Email Steps

| Step | Trigger | Send behavior | Review model |
| --- | --- | --- | --- |
| Entry received | Exhibitor submits online entry | Automatic transactional email | Status/history visible in communications |
| Accepted | Secretary accepts entry | Prompt immediately | Preview/edit before send |
| Waitlisted | Secretary waitlists entry | Prompt immediately | Preview/edit before send |
| 2-week reminder | Show is 14 days away in show timezone | Prepared batch | Secretary reviews and clicks Send now |
| Day-before reminder | Show is 1 day away in show timezone | Prepared batch | Secretary reviews and clicks Send now |
| Results available | Show is complete/results are ready | Prepared whole-show batch | Secretary reviews and clicks Send now |

## User Experience

### Message Center Surface

Add a show-scoped Scheduled emails section to the existing secretary communications area. The section should be reachable from Message Center and `/secretary/messages?showId=<id>`. Show Setup and Show Workbench can link to it with the selected show prefilled.

Each email step should show:

- step name
- readiness state
- due date or trigger
- recipient count
- warning count
- sent/skipped/failed counts
- primary action when available

Use plain state names:

- Ready to review
- Sent
- Needs attention
- Not due yet
- Skipped
- Failed

### Entry Received

Entry received remains a transactional receipt. It should send automatically after online submission/payment completion, using the existing registration-confirmation sender where possible. The communications surface should show whether the receipt was sent, delivered, bounced, or failed.

### Accept / Waitlist Prompt

After a secretary accepts or waitlists an entry, open a preview/edit dialog.

The dialog should show:

- recipient name and email
- dog and class summary
- payment status
- armband number when available
- subject
- editable message body
- Secretary note field
- exact preview as the exhibitor will receive it

Actions:

- Send email
- Not now
- Save changes

If the secretary chooses Not now, the email remains visible as ready in the Scheduled emails section and on the entry row.

### Batch Review

For 2-week, day-before, and results batches, the review flow should start at the batch level.

The batch review should show:

- total eligible recipients
- recipients missing email addresses
- recipients with missing optional data, such as armband or class details
- recipients already sent
- recipients skipped by the secretary
- shared subject and message body
- Secretary note field
- selected recipient's exact preview

The secretary can edit the shared message and note for that batch. V1 should save edits for the current batch only. Reusable show defaults can wait until secretaries prove they need them.

The primary action should be concrete, such as Send 36 emails.

### Missing Data

Missing data should not expose raw merge tokens. If a value is missing, the preview should omit that sentence or use plain fallback copy. The review screen should also show a warning, such as Armband missing for 1 exhibitor.

## Message Creation

Each email starts from a default lifecycle template. The system resolves show, entry, dog, class, armband, schedule, and result data before the secretary reviews it.

Secretaries should see exact subject and body text, not raw merge fields. They can edit:

- subject
- message body
- Secretary note

The system should store the final subject/body used for each send so future audits show what the exhibitor received.

## Data Model

Add or adapt tables to represent:

- show email steps
- per-show template overrides
- per-recipient email jobs
- send attempts
- link to `email_log`

Suggested job statuses:

- `ready`
- `sent`
- `failed`
- `skipped`
- `dismissed`

Suggested step types:

- `entry_received`
- `entry_accepted`
- `entry_waitlisted`
- `two_week_reminder`
- `day_before_reminder`
- `results_available`

Each recipient job should store:

- show id
- step type
- recipient person/user id when available
- recipient email
- related entry/enrollment/class/result scope when applicable
- rendered subject
- rendered body
- secretary note
- status
- due time
- sent time
- error message
- idempotency key
- `email_log.id` when sent

## Delivery

Use Resend through edge functions. Reuse existing delivery patterns:

- `email_log` records each send.
- `resend-webhook` updates delivery status.
- idempotency keys prevent duplicate delivery.
- edge functions enforce secretary/admin authorization for reviewed sends.

Entry received may continue using the existing registration-confirmation function if it matches the receipt contract. Accept/waitlist and batch sends may use a new lifecycle-email function if the existing sender cannot represent the decision/reminder/result payload cleanly.

## Scheduling

The system should calculate due batches in the show's timezone. It should prepare batches before or at the due date, but it must not send reminder/results batches automatically.

For V1, a periodic job can mark due batches as ready. The secretary still clicks Send now.

Acceptance and waitlist emails are not cron-driven. They are prompted from Entry Management after the decision action.

The results batch should not depend on a separate show-closeout feature. V1 should make the results batch available after the show end date, then require the secretary to confirm results are ready before reviewing and sending. A later version may prepare per-class results emails when individual classes are released.

## Authorization

Only users who can manage the show may review, edit, skip, or send lifecycle emails for that show. Exhibitors may see delivered emails only through their inbox/email client and existing message history surfaces if later connected.

## Offline Behavior

Online email delivery requires connectivity and Resend. Core show-day operations must not block on email. If the secretary is offline, accept/waitlist should still update entry status through the established offline-safe path, and the email prompt should clearly show that email can be sent when the app is back online.

## Error Handling

Use plain language:

- Could not send 2 emails. Review the failed recipients.
- This exhibitor does not have an email address.
- This batch is ready, but the email service is not configured.

Failures should be retryable per recipient and per batch.

## History

V1 should use `email_log` plus lifecycle email job records as the delivery audit trail. It does not need to create in-app conversation messages for each lifecycle email. The communications surface should still display lifecycle email history so the secretary can answer, "Did we send that?"

## Testing

Required tests:

- schedule calculation uses the show timezone
- 2-week and day-before batches become ready on the correct local date
- reminder/results batches do not send without Send now
- accept/waitlist opens preview/edit after the status change
- Not now leaves a ready email job
- secretary edits subject/body/note before send
- missing merge data produces warnings and safe fallback copy
- idempotency key prevents duplicate delivery
- failed sends are retryable
- unauthorized users cannot send show lifecycle emails
