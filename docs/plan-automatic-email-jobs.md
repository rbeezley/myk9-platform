# Automatic email jobs: one durable queue the server sends by itself

> **Status:** Active

Owner decision (2026-11-17): one shared automatic-send mechanism, not one queue per feature.
It serves MYK9-2124 (date or venue changed), MYK9-2126 (secretary edits an entry) and
MYK9-2088 (stranded confirmation claims), and later the MYK9-2113 reminder.

## What exists, and why we extend it

`show_lifecycle_email_jobs` is already the durable job row the issues ask for:

- `status` (`ready`, `sent`, `failed`, `skipped`, `dismissed`), `due_at`, `idempotency_key`;
- a lease: `claimed_until` and `attempt_id` (MYK9-1212), with every try recorded in
  `show_lifecycle_email_attempts` (`resend_message_id`, `status`, `error_message`);
- `email_log_id`, so a sent job already appears in Delivery history.

What it lacks is a sender that runs without a secretary's click. Today only
`registration_number_needed` uses the lease, through its own claim RPC.

So we do **not** add a table (consolidation rule). We add:

1. `auto_send boolean NOT NULL DEFAULT false` on the job. `false` keeps every existing
   step exactly as it is: the secretary reviews and sends.
2. A generic claim, `claim_due_auto_email_jobs(p_limit, p_stale_before)`: picks `ready`,
   `auto_send` jobs whose `due_at <= now()` and whose lease is free or expired,
   `FOR UPDATE SKIP LOCKED`, mints a fresh `attempt_id`, sets `claimed_until`.
3. A drain action in `send-lifecycle-email`, called by one pg_cron job with the cron secret
   (the same auth pattern as `exhibitor-reminder-emails`). For each claimed job it renders,
   sends through Resend with the job's idempotency key, records the attempt and `email_log`
   (with `show_id`), and marks the job `sent`. A job whose last attempt already has a
   `resend_message_id` is marked sent without a second send (reconciliation). Repeated
   failures end at `failed`, which stays visible.

## Phases (one PR each; each adds a migration, so none is batched)

### Phase 1: the drain, and date or venue changes (MYK9-2124)

- Step type `show_changed`, recipient scope `show_recipient`, `auto_send = true`.
- Producer: triggers on `trials` (date) and `shows` (venue name, address, city). Only for a
  published show. For each person with a live entry (owner and handler, the rule
  MYK9-2076 uses), upsert one `ready` job and push its `due_at` to `now() + 5 minutes`.
  A partial unique index on `(show_id, recipient_person_id)` for unsent `show_changed`
  jobs makes several edits in one sitting a single email.
- The body is rendered **at send time** from the current dates and address, so the email
  always carries the latest values.
- Delivery history lists `show_changed` like the other show emails.

### Phase 2: confirmation emails move onto the job row (MYK9-2088)

`send-confirmation-email`'s claim-then-send stamp becomes a job with a lease, so an
interrupted send is retried and a provider-accepted send is reconciled. The historical
`confirmation_email_sent_at` marker stays, and is now written when the job succeeds.

As built (MYK9-2088): job step type `entry_confirmation` (jobs CHECK only; the secretary's
switch stays the `accepted` step, and the job's `step_id` points at it). A job is a **ticket** for
one exhibitor group in one show (`batch_key` is the run's own group key, `enrollment_id` her
registration, `recipient_person_id` the handler of a handler-only group; one ready ticket per
group, unique on `show_id, batch_key`). It stores no entry set and no text. When it is sent, the
worker re-runs the run's own gather for that group (confirmed, unmarked, outside the quiet period,
still in the group), works out the address and body from current data, and records what it is about
to send (entry ids with acceptance generations, address, body, provider key) on the attempt row
(`payload`, status `started`) before calling the provider. A `started` attempt is replayed from that
record; a `sent` one is reconciled from it. Entries still in the quiet period defer the ticket
(not a failure); nothing qualifying skips it; no usable address ends it `failed` with a
`missing_recipient` attempt, which Delivery history lists once. The Resend key is the covered
entries' key plus the address. Every marker write goes through `mark_entry_confirmation`, one
UPDATE fenced by generation. `claim_due_auto_email_jobs` takes `p_step_types` (a two-argument
wrapper stays for the rollout window), so each drain claims only what it can render; the
confirmation drain lives in `send-confirmation-email` (it owns the heritage renderers) and every
scheduled run drains first, which is the recovery.

## Phase 3: the secretary's entry edits (MYK9-2126)

Step type `entry_changed`, debounced the same way, after the Undo window.

## Testing (every phase)

- Edge-function unit tests for the drain: claim, send, interrupted-after-claim retry,
  provider-accepted reconcile, concurrent drain, failure ending at `failed`.
- A behavioral SQL test for the producer and the claim: date change, venue change,
  unpublished show, two quick edits making one job, lease expiry.
- After merge: `db push` (dry run first, ACL checks), deploy `send-lifecycle-email`, then
  change a test show's venue and watch one email reach Delivery history.
