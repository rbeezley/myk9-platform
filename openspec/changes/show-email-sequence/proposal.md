## Why

Fall 2026 launch readiness depends on secretaries communicating clearly without rebuilding the same emails for every show. Exhibitors also need immediate reassurance that online entries were received, while secretaries need reviewed, editable messages for decisions, reminders, and results.

This change consolidates lifecycle email work into the existing Message Center and entry-management flows. It avoids a standalone campaign app while making show communication calmer, more reliable, and easier to audit.

This does not duplicate an existing surface. Message Center already owns show communication history, and Entry Management already owns entry decisions. A link alone is not enough because the missing capability is shared lifecycle email status, preview, edit, send, and delivery tracking across those existing surfaces.

## What Changes

- Add show-scoped Scheduled emails to the existing secretary communications surface.
- Keep online entry-received receipts automatic for exhibitor self-service submissions.
- Prompt the secretary to preview/edit accepted and waitlisted emails immediately after the entry decision.
- Prepare 2-week reminder, day-before reminder, and whole-show results-available batches for secretary review.
- Let the secretary edit subject/body, add a secretary note, skip recipients, and send reviewed batches.
- Track ready, sent, failed, skipped, dismissed, and delivery states per recipient.
- Reuse `email_log`, Resend webhook status, and existing email delivery patterns where possible.
- Add a correction-email path when a sent accept/waitlist decision later changes.
- Preserve existing fast paths until replacement behavior is proven.

Non-goals:

- No standalone email campaign app.
- No global template library in V1.
- No arbitrary custom campaign builder.
- No automatic reminder/results sending without secretary review.
- No per-class results email in V1.
- No in-app conversation message for every lifecycle email in V1.

## Capabilities

### New Capabilities

- `show-lifecycle-emails`: Show-scoped lifecycle email preparation, preview, secretary review, sending, and delivery history.

### Modified Capabilities

None.

## Impact

- Affects myK9Show Message Center, secretary messages, Entry Management, email status surfaces, and show-workbench/setup deep links.
- Adds database schema for lifecycle email steps/jobs/attempts, RLS policies, indexes, and status queries.
- Adds or adapts edge functions for reviewed lifecycle email rendering and delivery through Resend.
- Reuses `email_log` and `resend-webhook` for delivery tracking.
- Adds tests for timezone scheduling, preview rendering, secretary edits/notes, authorization, idempotency, partial failures, and retry paths.
- Requires full validation because the implementation touches entry decisions, email delivery, migrations, edge functions, authorization, and scheduled/background jobs.
