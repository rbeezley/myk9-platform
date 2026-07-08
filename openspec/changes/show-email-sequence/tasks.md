## 1. Schema And Contracts

- [x] 1.1 Inventory existing email call sites, Message Center/secretary messages surfaces, Entry Management accept/waitlist paths, `email_log`, `resend-webhook`, and generated Supabase types before naming tables/functions.
- [x] 1.2 Add migration tests or SQL assertions for lifecycle email tables, RLS, indexes, idempotency-key uniqueness, and show-manager access boundaries.
- [x] 1.3 Add additive lifecycle email schema for steps/jobs/attempts with statuses for ready, sent, failed, skipped, and dismissed.
- [x] 1.4 Add indexes for due jobs by show/status, jobs by step/status, idempotency key lookup, and `email_log.id` lookup.
- [ ] 1.5 Verify schema locally with migration validation and focused RLS tests before any shared DB push.

## 2. Lifecycle Email Core

- [x] 2.1 Add TypeScript domain types and helpers for lifecycle step types, job statuses, idempotency keys, and recipient scope.
- [x] 2.2 Add schedule calculation utilities for 2-week and day-before reminders using the show's timezone.
- [x] 2.3 Add server-side render/preview helpers that resolve show, entry, dog, class, armband, schedule, and result data into exact subject/body previews.
- [x] 2.4 Escape or sanitize editable subject/body/note content before HTML rendering.
- [x] 2.5 Add focused tests for timezone scheduling, missing-data fallback copy, rendered preview output, sanitization, and idempotency key stability.

## 3. Read Models And Existing Receipt Status

- [x] 3.1 Add lifecycle email summary query/read helpers for show-scoped Scheduled emails.
- [x] 3.2 Surface automatic online entry-received receipt history from existing registration-confirmation/email-log data where related ids are available.
- [x] 3.3 Ensure secretary-created mail-in/walk-in entries do not use the automatic exhibitor receipt path.
- [x] 3.4 Add default-enabled lifecycle step settings and per-step enable/disable read/update helpers.
- [x] 3.5 Add tests for summary counts, warning counts, sent/skipped/failed states, automatic receipt visibility, default enablement, and step disable behavior.

## 4. Entry Decision Preview And Send

- [x] 4.1 Add tests proving Accept opens an acceptance preview/edit prompt after the entry decision is saved.
- [x] 4.2 Add tests proving Waitlist opens a waitlist preview/edit prompt after the entry decision is saved.
- [x] 4.3 Implement a reusable lifecycle email preview/edit dialog with subject, message body, secretary note, recipient summary, and exact preview.
- [x] 4.4 Wire Accept/Waitlist prompts into Entry Management without blocking the entry status mutation.
- [ ] 4.5 Persist Not now as a ready email job visible from Scheduled emails and the entry row.
- [ ] 4.6 Add correction-email action when a sent accept/waitlist decision later changes.
- [x] 4.7 Verify entry-decision email behavior with focused component/hook tests.

## 5. Reviewed Batch Preparation

- [x] 5.1 Add prepared-batch generation for 2-week reminder, day-before reminder, and whole-show results-available steps.
- [x] 5.2 Ensure reminder/results batches never send automatically and require Send now.
- [x] 5.3 Make results batch available after show end date and require secretary confirmation that results are ready before review/send.
- [x] 5.4 Add batch review UI inside the existing Message Center / secretary communications surface.
- [x] 5.5 Add recipient skip, missing-email warnings, missing optional data warnings, and exact selected-recipient preview.
- [x] 5.6 Add per-step enable/disable controls for reviewed lifecycle emails.
- [x] 5.7 Add tests for due-state generation, no-auto-send behavior, batch review UI, skips, warnings, results-ready confirmation, and disabled-step behavior.

## 6. Delivery And Retry

- [x] 6.1 Add or adapt an authorized lifecycle email edge function for preview/send operations with server-side show/recipient validation.
- [x] 6.2 Persist rendered subject/body/note before delivery and link successful sends to `email_log`.
- [x] 6.3 Send reviewed lifecycle emails through Resend with stable idempotency keys.
- [x] 6.4 Record per-recipient partial success/failure outcomes and retry only failed recipients.
- [x] 6.5 Reconcile uncertain retries from idempotency key, `email_log`, and Resend message id without duplicate delivery.
- [x] 6.6 Add tests for authorization denial, successful send, partial failure, retry, unavailable email service, and delivery-status updates.

## 7. Navigation, Copy, And Offline Behavior

- [x] 7.1 Add deep links from Show Setup or Show Workbench to the show-scoped Scheduled emails section without adding a new standalone campaign page.
- [x] 7.2 Add calm copy for offline/unavailable email delivery so entry decisions remain saved and email can be sent when online.
- [x] 7.3 Ensure Message Center loads lifecycle summaries first and fetches full recipient previews only when a batch opens.
- [x] 7.4 Add accessibility coverage for dialog controls, batch recipient lists, warnings, and primary Send now actions.

## 8. Verification, Tracking, And Ship Gate

- [x] 8.1 Run `pnpm openspec validate --changes show-email-sequence`.
- [x] 8.2 Run focused lifecycle email unit/component/edge-function tests.
- [x] 8.3 Run relevant myK9Show typecheck and lint commands.
- [x] 8.4 Run migration dry-run / database validation evidence before asking to push any DB changes.
- [ ] 8.5 Run implementation verification with the OpenSpec verify-change process and fix critical findings.
- [ ] 8.6 Update `OPEN-TODOS.md` / tracking docs when the implementation slice is complete.
- [ ] 8.7 Commit implementation changes and open a PR with `Tracked in openspec change: show-email-sequence` in the body.
- [ ] 8.8 Wait for CI/review and merge before archiving the OpenSpec change.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This touches entry decisions, email delivery, database migrations, edge functions, authorization, and scheduled/background jobs, so it needs focused tests, type/lint checks, OpenSpec verification, CI, review, and merge evidence before archive.
