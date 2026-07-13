## Summary

- persist one durable, retryable notification event per waitlist offer cycle and lifecycle event
- notify offers from every committed promotion source through one dedicated-secret dispatcher
- send email and Web Push independently with current-cycle/payment revalidation and channel state
- add fair halfway-reminder, expiry-notice, and bounded retry batches after critical expiry/cascade work

Tracked in openspec change: stripe-golive-enforcement

## Duplication check

This does not add a page or duplicate an existing workflow. Email and push deep-link to the existing
My Shows / My Entries waitlist surface with the matching offer selected.

## Verification

- `pnpm openspec validate stripe-golive-enforcement --type change --strict --no-interactive`
- focused Vitest through the myK9Show config: 6 files, 47 tests passed
- `pnpm typecheck`
- `pnpm lint`
- local PostgreSQL fixture → migration → lease/retry/grant/fairness assertions → rollback passed,
  including 16 due reminders queued across 15/1 batches
- independent security/database review: approved after three fix-and-review loops
- full myK9Show suite was stopped at the repository-mandated 60-second ceiling after hanging at
  startup; it emitted no failing test output before termination

## Required deployment order

1. Deploy `push-trigger-waitlist` with `--no-verify-jwt`.
2. Apply migration `20260713010000_waitlist_notification_events.sql`.
3. Deploy the updated `cron-waitlist-expiration`.

Each shared-system step requires explicit approval. The order prevents the trigger or cron from
targeting a missing dispatcher and preserves the legacy delivery path until the durable path exists.

## Rollback

Disable `trg_waitlist_offer_notification`, redeploy the previous cron, then run
`scripts/qa/rollback-waitlist-notification-events.sql`. Do not remove the durable ledger until the
prior delivery path is restored.
