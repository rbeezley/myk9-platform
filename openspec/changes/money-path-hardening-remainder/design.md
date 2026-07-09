# Design: money-path-hardening-remainder

## Context

Phases 1–4 of `docs/plan-money-path-hardening.md` (MP-01/02/03/04/06/10/14) are merged and deployed. This change implements the remainder — Phase 5 (MP-05, MP-07), Phase 6 (MP-08), Phase 7 (MP-09, MP-11, MP-12, MP-13) — plus TZ-01, all re-verified live in the code on 2026-07-09 (`docs/audits/production-readiness-claude-review-2026-07-09.html`).

Current state, verified:
- `stripe-webhook/index.ts` `handleEntryPaymentCompleted` fresh-retrieves at `:507` but does not check `payment_status`; `handleEntryPaymentRequestCompleted` trusts payload `amount_total`/`payment_status`.
- `_shared/alertAdmin.ts:10-35` is email-only (Resend POST); `cron-process-payouts/index.ts:78` carries a duplicate copy. No `operator_alerts` table exists — only forward-references in migration `20260704120000_create_system_health_snapshots.sql` and `_shared/systemHealthChecks.ts:141`.
- Unmatched `charge.refunded` (`stripe-webhook/index.ts:282-284`) is `console.log` + return.
- Webhook `sendEntryConfirmationEmail` (`:1701-1830`) never stamps `confirmation_email_*`; scheduled `send-confirmation-email/index.ts:427-439` selects `confirmation_email_sent_at IS NULL` → double send.
- `RefundAllEntriesCard.tsx:165-185` shows counts only although `useShowRefundAll.ts:15-25` returns per-entry `skipped`/`failed` arrays.
- `features/registries/helpers.ts:119-121` `getTrialTimezone` returns `trial?.timezone || 'America/New_York'` unvalidated; invalid zones make landing-page dates render blank via `dateFormat.ts` try/catch.

Constraints: pre-launch (no users), consolidation phase — extend existing surfaces, don't add pages. None of the touched flows are offline-replicated (all are server-side edge functions or admin/secretary online-only React Query surfaces), so no `@myk9/replication` impact; the entry `confirmation_email_*` columns are written only by service-role edge functions, not client mutation paths.

## Goals / Non-Goals

**Goals:** close every remaining tracked money-path code defect; make payment/ops failures durable, queryable, and resolvable in-app; guarantee exactly-one confirmation email; make bulk-refund output actionable; make timezone reads fail safe and observable.

**Non-Goals:** no new admin page (extend `/admin/health`); no alert delivery channels beyond email + board; no generic retry/queue infrastructure; no Heritage confirmation redesign; no timezone UI; no changes to merged MP phases 1–4.

## Decisions

1. **`operator_alerts` as a sibling of `system_health_snapshots`, surfaced on `/admin/health`.**
   The health-board spec explicitly anticipates this convergence ("intentionally shaped as the same family as the planned `operator_alerts` table"). Mirror its RLS/GRANT shape (`is_site_admin()` SELECT; `service_role` INSERT) plus admin UPDATE limited to resolution fields. Alternative — a standalone `/admin/alerts` page — rejected per the consolidation rule (one concern, one page; the operator's "is anything wrong?" question already lives at `/admin/health`).
   Resolution write: a narrow RLS UPDATE policy permitting site admins to set `resolved_at`/`resolved_by` (enforced via a `WITH CHECK` that other columns are unchanged is awkward in RLS — instead use a small SECURITY DEFINER RPC `resolve_operator_alert(alert_id)` following the established restore-RPC pattern from #790). RPC over direct UPDATE keeps the policy simple and auditable.

2. **`alertAdmin`: persist-then-email, insert failure never blocks email and vice versa.**
   Insert first (durability is the point), email second; wrap each in its own try/catch. Uses the function's existing service-role Supabase client. Delete the `cron-process-payouts` local copy and import the shared helper — one implementation, per DRY. Alternative — email-first — rejected: the email is the lossy channel we're compensating for.

3. **MP-05/MP-07 via one shared "fresh session" pattern.**
   `handleEntryPaymentRequestCompleted` adopts the cart path's existing fresh-retrieve idiom (already at `:507`), then both handlers guard `fresh.payment_status !== 'paid'` → log + return 200 (Stripe re-drives via `async_payment_succeeded`, which must route to the same completion logic). We do NOT pin `payment_method_types: ['card']` — the guard makes delayed methods safe, and pinning would silently narrow payment options (product decision, out of scope).

4. **MP-13: stamp from the webhook path using the scheduled sender's semantics.**
   After the webhook's confirmation send succeeds, update the affected entries' `confirmation_email_sent_at/_message_id/_status='sent'`. Chosen over "exclude online receipts from the scheduled audience" because stamping makes the send-state columns a truthful single record of *any* confirmation send — the audience query then needs no special-casing and future senders inherit correctness. Failed webhook sends leave status unstamped so the scheduled sender acts as the retry path (a deliberate feature).

5. **MP-11: render existing data, no API change.**
   `RefundAllEntriesCard` groups `skipped` by `reason` and lists `failed` with entry ids + error, inside the existing card (collapsible sections if long). No new hook/endpoint — the arrays already cross the wire. Preserves secretary INTENT (calm control): detail appears only when nonzero.

6. **TZ-01: validate in `getTrialTimezone` with `Intl.DateTimeFormat` probe.**
   `try { new Intl.DateTimeFormat('en-US', { timeZone: tz }) } catch { fallback }` — cheap, standards-based, no dependency. Memoize invalid-value reporting (module-level `Set`) so Sentry isn't spammed per render. Report via the existing Sentry client. Alternative — validating at write time only — rejected: bad rows already possible; boundary read validation covers both.

## Risks / Trade-offs

- [Webhook now does an extra DB write (stamp) inside payment handling] → stamp is fire-and-forget after send; failure logs + leaves scheduled-sender retry intact; webhook still ACKs Stripe.
- [MP-05 guard could strand a session if `async_payment_succeeded` isn't wired to the completion logic] → task explicitly asserts the async event routes to the same handler; assertion-first test covers it.
- [New migration on a live staging DB] → follow migration rules: `supabase migration list` first, explicit GRANTs (Oct-2026 Data API rule), run `migration-auditor` agent before push; push is a confirmed, separate step (merge ≠ deploy).
- [Resolve-RPC adds a SECURITY DEFINER surface] → claim-gated via `is_site_admin()`; verify live with the rolled-back-txn psql pattern.
- [Two email senders share send-state semantics implicitly] → the `entry-confirmation-idempotency` spec pins the contract; integration test asserts exactly one send across both paths.
- [ADDED] [Stripe re-delivers webhook events, so alert-raising branches would create duplicate alerts] → `operator_alerts` carries a `dedupe_key` with a partial unique index on `(source, dedupe_key) WHERE resolved_at IS NULL`; the unmatched-refund branch keys on the Stripe event id. Resolved alerts do not block a genuine recurrence from alerting again. (The webhook has per-handler idempotency latches but no global event-id guard — verified at `stripe-webhook/index.ts:271,708,752`.)

## Migration Plan

1. Migration `NNN_create_operator_alerts.sql` (table + GRANTs + RLS + resolve RPC) — push to staging after review.
2. Deploy edge functions: `stripe-webhook`, `cron-process-payouts` (from `apps/myk9show/supabase/functions` with `--workdir`), `--no-verify-jwt` per repo rules. `send-confirmation-email` is unchanged.
3. Frontend ships with the normal Vercel deploy from `main`.
4. Rollback: functions redeploy from previous commit; the new table is additive (no drop needed); UI changes are additive.

## Open Questions

- None blocking. If Stripe checkout for entries should also pin `payment_method_types`, raise as a separate product decision.
