## Context

myK9Show is pre-launch, and fall 2026 readiness prioritizes secretary/show-day reliability. `docs/INTENT.md` frames the trial secretary experience as "That was easy" and warns against extra surfaces, notification overload, and stressful error language.

The current communication system already has the right centers of gravity:

- Message Center owns show communication and compose entry points.
- `/secretary/messages?showId=...` owns secretary communication history.
- Entry Management owns accept, waitlist, and resend-confirmation actions.
- `send-registration-email`, `send-email`, `send-confirmation-email`, `email_log`, and `resend-webhook` already provide email delivery and delivery-status patterns.

The missing capability is not another campaign app. The missing capability is lifecycle email preparation, review, edit, send, and delivery history across the existing communication and entry-decision surfaces.

Core entry decisions must keep their established mutation/offline behavior. Email delivery is online-only and must never block entry status changes or show-day work.

## Goals / Non-Goals

**Goals:**

- Add show-scoped Scheduled emails inside the existing secretary communication flow.
- Keep online exhibitor entry-received receipts automatic.
- Prompt secretaries to preview/edit accepted and waitlisted emails immediately after entry decisions.
- Prepare 2-week reminder, day-before reminder, and whole-show results-available batches for secretary review.
- Enable lifecycle steps by default for new shows while allowing the secretary to disable each reviewed step independently.
- Let secretaries edit subject/body, add a secretary note, skip recipients, and send reviewed emails.
- Store final rendered content, per-recipient status, delivery status, skips, failures, and correction history.
- Reuse `email_log`, Resend webhook status, and existing edge-function delivery patterns where possible.

**Non-Goals:**

- Do not create a standalone email campaign app.
- Do not build a global template library in V1.
- Do not build arbitrary campaign automation.
- Do not automatically send reminder/results emails without secretary review.
- Do not send per-class results emails in V1.
- Do not create an in-app conversation message for every lifecycle email in V1.

## Decisions

### Use Message Center As The Consolidated Surface

Add a Scheduled emails section to the existing secretary communications area and deep-link to it from Show Setup or Show Workbench when useful.

Alternative considered: a new campaign page. Rejected because the project is consolidating surfaces before launch, and a new app-like page would duplicate Message Center and secretary message history.

### Keep Entry Received Transactional

Online exhibitor submissions send the entry-received receipt automatically, using the existing registration-confirmation sender if it satisfies the receipt contract. Secretary-created mail-in or walk-in entries do not use this automatic path because the secretary is already acting on behalf of the exhibitor.

Alternative considered: hold all entry emails for secretary review. Rejected because exhibitors entering online need immediate proof that their submission was received.

### Prompt Accept/Waitlist Emails At The Decision Moment

After Accept or Waitlist, open a preview/edit dialog. The dialog shows recipient, dog/class summary, payment status, armband when available, subject, editable body, secretary note, and exact preview. The secretary can send, choose Not now, or save changes.

Alternative considered: auto-send after accept/waitlist. Rejected because secretaries may catch a wrong decision immediately and need a deliberate checkpoint.

### Prepare Reminder And Results Batches

2-week reminder, day-before reminder, and whole-show results-available emails appear as prepared batches. They remain unsent until the secretary reviews and clicks Send now. The results batch becomes available after the show end date and requires the secretary to confirm results are ready before reviewing.

Alternative considered: automatic scheduled sends. Rejected because secretaries should control exhibitor-facing communication, especially around schedule changes and results readiness.

### Default Enablement With Per-Step Disable

New shows start with lifecycle steps enabled so secretaries do not need to discover setup before reminders become useful. Reviewed steps can be disabled independently from Scheduled emails. Disabled reminder/results steps do not prepare new recipient jobs until re-enabled; disabled accept/waitlist steps suppress the post-decision prompt but keep manual Send/Edit actions available from the entry row and Scheduled emails.

Alternative considered: require explicit opt-in for every show. Rejected because the feature exists to reduce repeated secretary setup, and reviewed sends already protect against surprise delivery.

### Store Rendered Content And Link Delivery History

Lifecycle email jobs store rendered subject/body, secretary note, recipient status, idempotency key, and `email_log.id` when sent. `email_log` and `resend-webhook` remain the delivery audit trail, while lifecycle jobs answer, "What was ready, skipped, sent, or failed for this show?"

Alternative considered: only store templates and regenerate previews later. Rejected because audits and correction flows need to know exactly what the exhibitor received.

### Use Server-Side Rendering And Authorization

The server resolves merge data, validates show/recipient scope, escapes or sanitizes editable content, and sends through authorized edge functions. The client can request a preview or send a reviewed job, but it cannot choose arbitrary recipients or override delivery scope.

Alternative considered: render and send from the browser. Rejected because it creates spoofing, authorization, and sanitization risk.

## Risks / Trade-offs

- Resend succeeds but local status update fails -> Use stable idempotency keys and reconcile from `email_log` / Resend message id before retrying.
- Batch send partially fails -> Record per-recipient outcomes and retry only failed recipients.
- Reminder batch fetches too much data -> Load summaries first, fetch recipient previews on batch open, and use bounded queries with indexes.
- Secretary changes a decision after sending -> Do not retract email; show sent status and offer a correction email draft.
- Missing merge data creates awkward copy -> Omit optional sentences or use plain fallback copy, and show warnings before send.
- Email delivery unavailable while secretary is offline -> Entry status changes still save; reviewed email actions show that delivery can happen when online.
- RLS accidentally exposes cross-show email status -> Add migration/RLS tests for show manager access and cross-show denial.

## Migration Plan

Roll out in slices:

1. Add lifecycle-email schema, RLS, indexes, and read-only status queries.
2. Surface lifecycle email summaries without changing send behavior.
3. Add accept/waitlist preview/send prompts.
4. Add reminder/results batch preparation.
5. Add reviewed batch delivery through Send now.

Backfill is optional. Existing `email_log` rows remain valid, and existing registration-confirmation delivery must keep working throughout the rollout.

Rollback strategy:

- Schema additions are additive.
- UI entry points can be reverted without breaking existing Message Center or Entry Management behavior.
- Existing registration-confirmation and manual resend paths remain available until lifecycle sending is proven.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: Implementation touches entry decisions, email delivery, database migrations, edge functions, authorization, and scheduled/background jobs.

## Open Questions

None for V1 planning. Exact table/function names should be selected during implementation after inventorying generated Supabase types and current email call sites.
