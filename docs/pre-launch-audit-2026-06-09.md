# Pre-Launch Critical Issues Audit — 2026-06-09

Four parallel review passes (security/RLS, payments, offline/replication, incomplete features). All Critical/High findings below were spot-verified against the working tree at `main` (worktree `hardcore-brahmagupta-b452a7`).

## Status update — 2026-06-09 (same day)

Stripe is **not yet implemented**, so findings #1, #2, #3, #8 are deferred until the
Stripe integration work happens — they remain the checklist for that effort.

Fixed in this session (branch `claude/hardcore-brahmagupta-b452a7`):

- **#4 (partially)** — Permanently failed mutations now persist in a new
  `failed_mutations` IDB store (DB v6) with Retry/Discard surfaced via persistent
  toast + re-surface on sign-in; the localStorage mutation backup is written
  synchronously on queue (1s debounce window removed).
- **#5** — Bulk show status-change and delete now call `updateShow` / `deleteShow`
  for real, report partial failures, and the status options were corrected to
  DB-valid values (the old `active`/`archived` options violated
  `shows_status_check`).
- **#6** — Armband claim/update failures are collected into
  `result.armbandFailures` and surfaced to the user instead of `.catch(() => {})`.

Corrections to the original findings:

- **#4 OCC / #11 conflict clobbering** — The audit understated shipped work:
  Phase 4 conflict surfacing is **enabled** (`features.showConflictSurfacing: true`
  since 2026-06-08, PRs #602–#604, #606, #609, #611). OCC rejection feeds the live
  conflict-detection path (row held dirty → download loop diffs against `baseData`
  → persistent toast → mutation-hold until resolved). The remaining edge is rows
  cached without `baseData`; not a launch blocker.
- The "conflict surfacing ships dark" note below is stale — the kill-switch
  comment in `conflictSurfacingFlag.ts` predates the flag flip.

## Launch blockers (Critical)

### 1. Registration submits with a fake payment reference

`apps/myk9show/src/features/registration/submitShowRegistration.ts:196`

When `paymentMethod === 'credit_card'`, the flow calls
`confirmRegistration(registrationId, 'MOCK-PAYMENT-REF', paymentDetails)`.
The credit-card option is selectable in `PaymentMethodSelector.tsx` (shows a
"coming soon" notice but remains a valid choice), so an exhibitor can submit a
confirmed entry recorded against a token that traces to no payment.

**Fix:** Either wire the real Stripe checkout reference through, or remove
`credit_card` from the accepted payment methods until it is. Don't ship the
mock token.

### 2. Stripe webhook has no idempotency — duplicate deliveries create duplicate paid entries

`apps/myk9show/supabase/functions/stripe-webhook/index.ts:112-224`,
`supabase/migrations/005_myk9show_specific.sql:302`

- No processed-event tracking and no `UNIQUE` constraint on
  `stripe_orders.stripe_checkout_session_id` (verified absent; only
  `stripe_payment_intent_id` is unique). Stripe retries webhooks routinely —
  each retry re-runs the entry-creation loop and re-inserts orders.
- The entry-creation loop `continue`s past per-item insert failures, then still
  marks the cart submitted and writes `stripe_orders` with whatever subset of
  `entry_ids` succeeded.
- The handler returns `{ received: true }` even when DB writes fail, so Stripe
  never retries a genuinely failed processing run.

**Fix:** Add a `UNIQUE` constraint on `stripe_checkout_session_id`, check it (or
a processed-events table keyed on `event.id`) before processing, make the
entry-creation pass all-or-nothing, and return non-2xx on processing failure so
Stripe retries.

### 3. Checkout trusts client-side prices

`apps/myk9show/supabase/functions/stripe-checkout/index.ts:322,349`

Stripe line items use `item.entry_fee_cents` straight from the cart row the
client created; the platform fee is derived from that same subtotal. A tampered
cart row checks out at an arbitrary price.

**Fix:** In the edge function, re-derive entry fees from the show/class fee
configuration server-side and reject mismatches.

### 4. Offline scoring data-loss windows in the replication layer

`packages/replication/src/MutationManager.ts`

- **Failed mutations are deleted** (`~line 455-467`): a mutation that exhausts
  retries or hits a non-retryable error (RLS, constraint, expired auth) is
  removed from the queue with only a transient toast. Offline scores become
  unrecoverable with no persistent record.
- **Backup debounce gap** (`BACKUP_DEBOUNCE_MS = 1000`, ~line 784-829): the
  localStorage mutation backup is debounced 1s; a reload inside that window
  leaves queued scores only in IndexedDB (vulnerable to eviction).
- **OCC rejection loops silently** (~line 428-447): a concurrent-write
  rejection re-queues the mutation for blind retry instead of surfacing a
  conflict.

**Fix:** Persist failed mutations to a reviewable store instead of deleting;
write the backup synchronously on queue; mark rows `syncStatus: 'conflict'` on
OCC rejection.

### 5. Bulk show actions fake success

`apps/myk9show/src/components/shows/browse/ShowBulkActionsBar.tsx:83,152`

Bulk status-change and bulk delete are `setTimeout(resolve, 800)` stubs that
toast success without writing anything. Reachable from the shows browse page.

**Fix:** Implement the mutations or remove the actions from the UI.

## High — fix before or immediately at launch

| # | Finding | Location |
|---|---------|----------|
| 6 | Armband assignment failures swallowed: `.catch(() => {})` on the armband update during entry submission — confirmed entries can silently lack ring numbers | `submitShowRegistration.ts:254` |
| 7 | RLS from migration 006 used `USING (true)` writes on `people`/`dogs`/`entries`; migration 023 + `20260604004045` tightened parts (stripe tables, entries UPDATE) but entries SELECT/INSERT lineage needs verification against the **live** DB (`pg_policies`), not just migration files | `supabase/migrations/006_rls_policies.sql:103-156` |
| 8 | No `charge.refunded` / dispute webhook handling; `PaymentService.processRefund()` returns a mock ID — Stripe-dashboard refunds never reflect in the app | `stripe-webhook/index.ts`, `PaymentService.ts:171-183` |
| 9 | Registration confirmation email is a "coming soon" toast (clipboard fallback) | `ConfirmationStep.tsx:153-173` |
| 10 | Waitlist offer sends no notification to the exhibitor (Phase 6 TODO) | `useWaitlistManagementPage/useWaitlistManagementData.ts:150-156` |
| 11 | Entries-table `resolveConflict` is row-level last-write-wins when local isn't pending — concurrent online/offline scoring of the same entry can clobber a judge's score without surfacing a conflict | `ReplicatedEntriesTable.ts:389-394` |

## Medium / notes

- **ImpersonationService 2FA is format-only** (`ImpersonationService.ts:325-335`) — any 6-digit string passes. Mitigating factor: no UI consumer of the service was found, so it appears unreachable. Recommend deleting or hard-disabling the service rather than shipping it dormant.
- Judge dashboard renders with hardcoded empty assignments (`JudgeDashboard.tsx:43`).
- Admin data Import tab is a "coming soon" placeholder; Venue WiFi card save is disabled pending its mutation (known open item).
- Webhook handler swallows confirmation-email failures with no retry (`stripe-webhook/index.ts:348-351`).
- `push-trigger-announcement` falls back to the service-role key as webhook bearer if `PUSH_WEBHOOK_SECRET` is unset — confirm the Vault secret is set in prod.
- The "missing GRANTs" finding from the security pass applies to **new** tables post-Oct-2026 Supabase behavior; legacy tables (migrations 001–005) predate it. The actionable item is #7 (verify live RLS), not blanket grant migrations.

## What checked out clean

- Stripe webhook signature verification is correct.
- No direct Supabase writes bypassing `@myk9/replication` in show-day flows.
- Mutation queue persists/restores across reload (modulo the 1s debounce gap).
- Mutation ordering (topological sort) and RLS-silent-rejection detection in the replication layer are sound.
- No hardcoded secrets found in source.

## Suggested remediation order

1. **Payments first** (#1, #2, #3 — plus #8 if refunds will be offered): these corrupt money/entry state and are exploitable.
2. **Replication data-loss** (#4, #11): show-day trust depends on offline scores surviving.
3. **Fake-success UI** (#5, #6, #9, #10): silent failures that erode trust at launch.
4. **Live-DB RLS verification** (#7): one `pg_policies` query pass against the linked project to confirm migration 023+ policies are what's actually active.
