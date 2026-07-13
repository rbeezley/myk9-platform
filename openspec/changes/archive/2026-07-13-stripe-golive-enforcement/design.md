## Context

Card checkout already calls `create_online_paid_entry`, which locks the relevant judge-day and
uses `get_judge_day_capacity_live` before inserting a paid entry or waitlist row.
`submit_show_entries` is the separate SECURITY DEFINER boundary for check, cash, waived,
already-paid, and other non-card submissions. Its latest body includes ownership, handler, fee,
payment-method, and show-timezone entry-window guards, but no capacity decision.

The waitlist spine is also substantially present:

- `promote_waitlist_entry_internal` locks and rechecks class/judge capacity, creates a
  `pending-payment` entry, and stamps `offered_at`/`offer_expires_at`.
- `stripe-payment-link` creates tracked Stripe Checkout Sessions and the webhook reconciles them.
- `cron-waitlist-expiration` expires stale offers, cascades the next waiting row, and emails offers
  that the cron itself creates.
- My Shows/My Entries already contains `WaitListSection`, including offered state and withdrawal.

The missing behavior is coordination: both entry-write boundaries must share capacity semantics;
all promotion sources must notify; and the exhibitor must be able to pay or decline their own
offer from the existing entry surface. The UX must preserve the exhibitor intent “This respects my
time”: one obvious place, plain states, 44px targets, no card details inside myK9, and calm recovery.

### Verified Baseline And Drift From The Source Plan

[ADDED] The apply-time inventory against `main` at `4fa04090f` confirmed:

- The authoritative `submit_show_entries` source is
  `20260711190000_guard_submit_show_entries_entry_open.sql`; generated types expose its exact five
  arguments and JSON return, while the app currently casts the RPC because local generated typing
  and call-site inference are not fully aligned.
- `create_online_paid_entry` and `get_judge_day_capacity_live` still originate in
  `20260628202146_create_online_paid_entry_capacity_gate.sql`; the Stripe webhook is the production
  caller. The capacity RPC is absent from generated client types because it is service-role-only.
- The source plan described only judge-day enforcement. Current code also has
  `classes.max_entries` through `check_class_availability` and waitlist promotion, so the shared
  write-boundary decision must cover both limits.
- The active class/dog partial unique index already exists for `waiting`/`offered` rows, but the new
  shared helper must convert its conflict into an idempotent existing-row outcome.
- `cron-waitlist-expiration` is not under the root function tree named in the plan; it lives at
  `apps/myk9show/supabase/functions/cron-waitlist-expiration` and already coordinates expiration,
  promotion, tracked payment-link creation, and cron-only email.
- `stripe-payment-link` also lives in the nested myK9Show function tree. It already preserves
  authoritative fees, mode-scoped Connect accounts, redirect allowlisting, prior-link inspection,
  tracked link persistence, and webhook reconciliation; only organizer/internal callers are
  currently authorized.
- Secretary promotion calls the RPC and creates a Stripe link from
  `WaitlistManagementPage/useWaitlistManagementData.ts`, but does not share cron's email path.
- Exhibitor waitlist state is already read by `useMyWaitlistEntries` and rendered by
  `MyEntriesPage/modules/WaitListSection`; this disproves the source plan's need for a new payment
  page.
- Root-level push functions use `requirePushWebhookSecret`, chunk subscription reads, remove stale
  endpoints, and are invoked from Vault-backed `pg_net` triggers. The new dispatcher will reuse
  that pattern rather than the older announcement migration variants.
- The latest migration at inventory time is `20260712190000`; Phase A reserves
  `20260712200000` and `20260712200100` only after a collision re-check immediately before file
  creation.

Offline impact: normal remote submission and card checkout are online operations. The existing
secretary show-desk late-entry path remains replication-backed and local-first. This change does
not route offline show-day work through Stripe or a new direct PostgREST path; an authorized
show-desk submission keeps an explicit capacity-override path because the secretary must be able
to record what actually happened at the venue.

## Goals / Non-Goals

**Goals:**

- Prevent concurrent online/non-card submissions from silently overselling a judge-day.
- Preserve the mail-in reserve for self-service entry while allowing organizer-entered rows to use
  reserved physical capacity and allowing explicit show-desk overrides.
- Return idempotent per-selection outcomes without breaking older clients during rollout.
- Let an exhibitor pay or decline their own live offer from My Shows/My Entries.
- Notify once per promotion/reminder/expiry event regardless of whether cron or a secretary made
  the offer.
- Preserve existing Stripe reconciliation, waitlist cascade, and offline late-entry contracts.

**Non-Goals:**

- A new waitlist or payment page, dashboard, wizard, or in-app card form.
- Offline card payment or replacing the existing replicated show-desk late-entry implementation.
- Automatic handling of mail-in waitlist rows.
- Stripe live cutover, secret rotation, Connect onboarding, payout settings, or real-money smoke.
- Replacing the existing waitlist management page or lifecycle-email system.

## Decisions

### 1. Share class-plus-judge capacity calculation and lock identity, not the paid-entry RPC

[EXPANDED] Add a SECURITY DEFINER helper that accepts class, source, and whether an official
override is allowed. It acquires the exact existing class advisory lock
(`hashtext(p_class_id::text)`) plus the exact existing
`judgeday:<judge>:<date>` advisory locks in deterministic order, then checks both
`classes.max_entries` and every confirmed judge-day from the post-lock snapshot. It returns
`available`, `waitlisted`, or `denied` plus the class/show/trial facts needed by callers. Both
`create_online_paid_entry` and the latest `submit_show_entries` definition will call this helper.
The paid-entry RPC keeps its existing external return strings and Stripe behavior.

The class lock also serializes waitlist-position allocation. If the active class/dog unique key
already exists, the helper returns that existing active row as the idempotent waitlist outcome
rather than failing the whole submission.

Alternative: call `create_online_paid_entry` from non-card submission. Rejected because it also
writes paid online entries and Stripe identifiers, which is the wrong payment contract.

Alternative: duplicate the lock and capacity SQL in `submit_show_entries`. Rejected because the
two write paths would drift and could stop excluding each other.

### 2. Encode submission source inside each existing JSON entry payload

Each `p_entries` object gains `submission_source: 'self_service' | 'organizer' | 'show_desk'`.
This keeps the five-argument RPC signature stable: older servers ignore the new JSON key and older
clients can consume the old response. The server rejects `organizer` or `show_desk` from a caller
who is not a show official.

- `self_service` uses `capacity - confirmed - mail_in_reserved`.
- `organizer` uses physical `capacity - confirmed`; a full class becomes an idempotent `mail_in`
  waitlist row when allowed, otherwise `denied`.
- `show_desk` is allowed only for an official and records the entry even when the configured cap is
  full. The outcome includes `capacity_override: true` so the UI/telemetry can make the exception
  visible without blocking real show-day work.

Alternative: infer source from payment method. Rejected because cash/check can be either
self-service or organizer-entered and payment method is not provenance.

### 3. Keep batch submission transactional while allowing explicit per-selection outcomes

Unexpected validation or persistence errors roll back the entire RPC. Capacity itself is a
business outcome, so the RPC can create some entries, waitlist some selections, and deny others in
one committed submission. Its idempotency row stores the complete outcome result.

For rollout compatibility, the existing `entries` array continues to contain only created entry
pairs. A new `outcomes` array contains class/dog, outcome, created entry id or waitlist id, fee
cents, and override state. The client treats a missing `outcomes` array as the legacy all-created
response. Payment totals and armband assignment use created outcomes only; confirmation copy lists
waitlisted/denied selections plainly.

Alternative: fail the whole batch when any class is full. Rejected because it forces the exhibitor
to rebuild otherwise-valid selections and hides the usable waitlist result.

### 4. Put offer actions in the existing My Shows/My Entries waitlist section

`WaitListSection` gains the countdown, Complete payment, Decline, expired, and retry states. Email
and push link to `/exhibitor/entries?waitlistOffer=<waitlist-id>`, where the existing page focuses
and announces the matching row. The payment action requests a fresh Stripe-hosted Checkout Session
and redirects; no card fields are added.

Alternative: add `/entries/:entryId/complete-payment` and `WaitListPaymentPage`. Rejected because
My Shows/My Entries already owns the same entry and waitlist concern. A separate page would create
another state surface and another place to recover from errors.

### 5. Extend payment-link authorization narrowly for the offer owner

`stripe-payment-link` keeps secretary/club-admin/site-admin and internal-secret authorization. It
adds an exhibitor path only when every requested entry maps to an `offered` waitlist row owned by
the caller's exhibitor profile, the promoted entry is `pending-payment`/`pending`, and
`offer_expires_at` is still in the future. Mixed ownership, ordinary unpaid entries, expired rows,
and inactive entries fail closed.

The function keeps authoritative fee calculation, connected-account checks, one-open-link
replacement, allowed redirect origins, persisted `entry_payment_links`, and webhook reconciliation.

Alternative: make the cron-created Stripe URL the only claim path. Rejected because links expire
within 23 hours while offers can last longer, and it leaves no in-app recovery or decline action.

### 6. Decline through an authenticated Edge Function that reuses expiration logic

Add `decline-waitlist-offer` rather than exposing a broad client UPDATE. It verifies ownership,
loads the offered row, and reuses the shared waitlist-expiration reconciliation helper to expire
open Stripe sessions and transition the pending entry/offer. If Stripe reports the session paid,
the function returns a conflict and leaves webhook reconciliation in control. After a successful
decline, the existing cron cascade may offer the next spot within 15 minutes.

Alternative: direct client updates to `waitlist_entries` and `entries`. Rejected because two-table
state plus Stripe session expiry is not safely client-atomic.

### 7. One event dispatcher owns email and push delivery

[EXPANDED] Add a small notification-event ledger keyed by waitlist row, offer cycle (`offered_at`),
and event type (`offered`, `reminder`, `expired`). Each row records pending/processing/sent/failed,
attempt count, timestamps, and a redacted last error. A database trigger on transition to `offered`
upserts the offered event and invokes a secret-authenticated waitlist notification function; this
covers secretary and cron promotions. The function claims one event row, sends the existing
waitlist email shape and push subscriptions with the My Entries deep link, then records sent or
failed state. Failed/stale-processing rows remain retryable without creating a second event.

The cron upserts reminder/expiry events before invoking the same dispatcher, so retries converge
on the unique ledger row. Direct offer email code is removed from cron after the trigger path is
live. Provider responses that are ambiguous after accepting a message are logged explicitly; the
ledger prevents normal scheduler/HTTP retries from duplicating delivery, while acknowledging that
no external email provider can provide perfect exactly-once delivery without its own idempotency
contract.

The trigger uses the existing Vault `edge_function_base_url` and dedicated `push_webhook_secret`
pattern; no service-role bearer is accepted as a substitute. Delivery failure is logged and
retryable without rolling back the capacity/promotion transaction.

Alternative: notify from `useWaitListMutations`. Rejected because cron and other server promotion
paths would remain silent.

### 8. Validation profile

- Risk: high
- Validation: full
- Rationale: the change spans payment authorization, Stripe reconciliation, a SECURITY DEFINER
  entry RPC, concurrency locks, waitlist lifecycle, Edge Functions, and exhibitor UI.

## Risks / Trade-offs

- Shared advisory-lock identity drifts between callers → centralize key construction in one SQL
  helper and pin the literal/behavior with source and rolled-back concurrency tests.
- Two-entry batches acquire locks in different orders → gather and lock judge/date keys in stable
  order before capacity decisions.
- A decline races a completed Stripe payment → inspect/expire the session, fail closed on paid, and
  retain webhook refund/reconciliation as the final safety net.
- New server response reaches an old client → preserve the legacy `entries` array and add outcomes
  alongside it; deploy the tolerant client before the migration.
- Old server reaches a new client → treat missing outcomes as all-created legacy success.
- Notification trigger succeeds but delivery fails → persist per-event claim state with explicit
  failure logging and a retry path; never roll back a valid promotion because email/push is down.
- Mail-in reserve semantics are mislabeled by the client → authorize source server-side and cover
  each source/caller matrix in tests.
- Show-desk overrides hide over-capacity operations → return and log `capacity_override` while
  preserving the secretary's ability to record actual venue decisions.
- Adding more controls makes the waitlist row noisy → show actions only for `offered`, keep one
  primary action, plain status text, 44px targets, and mobile component tests.
- Per-entry capacity checks add query cost to a batch → lock unique class/judge-day keys once,
  reuse post-lock facts within the RPC where practical, and compare representative batch query
  plans/timing before deployment.

## Migration Plan

1. Deploy the backward-compatible client UI/result parser and Edge Functions first; keep new paths
   dormant where schema support is absent. The existing nested
   `apps/myk9show/supabase/functions/cron-waitlist-expiration` remains in place; do not silently
   relocate it while adding the new root-level dispatcher/decline functions.
2. Dry-run the migration and run source tests plus a rolled-back live database matrix for
   self-service, organizer, show-desk override, idempotency, and concurrent last-spot submissions.
3. After explicit approval, push the migration and verify function grants, trigger ownership,
   helper bodies, indexes, and response shapes.
4. After explicit approval, deploy the changed/new Edge Functions and run secret/auth failure
   smokes without charging a card.
5. Run a Stripe test-mode offer → payment and offer → decline/expiry smoke. Live-mode payment,
   payout, and refund evidence remains a separate operator gate.

Rollback:

- Disable the notification trigger first, then redeploy the prior Edge Functions if delivery is
  faulty.
- Restore the previous five-argument `submit_show_entries` body and prior
  `create_online_paid_entry` body from pinned migrations while retaining additive notification
  columns; do not drop columns during emergency rollback.
- The tolerant client accepts legacy results, so server rollback does not require an immediate
  client rollback.
- Open sessions remain governed by persisted `entry_payment_links` and existing webhook logic.

## Open Questions

- None blocking artifact verification. Exact migration version and component extraction boundaries
  are implementation details to resolve from the branch's current file sizes.
