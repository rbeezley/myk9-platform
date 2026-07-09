# Tasks: money-path-hardening-remainder

## 1. Webhook trust (MP-05, MP-07, MP-09)

- [x] 1.1 Write assertion-first failing tests for `handleEntryPaymentCompleted`: fresh session with `payment_status: 'unpaid'` → no entry update, no `stripe_orders` insert; `async_payment_succeeded` with `paid` → full processing (run red first)
- [x] 1.2 Add the `freshSession.payment_status !== 'paid'` early return after the fresh retrieve (`stripe-webhook/index.ts:507`) and confirm `checkout.session.async_payment_succeeded` routes to the same completion logic (wire it if not)
- [x] 1.3 Write assertion-first failing test for `handleEntryPaymentRequestCompleted`: payload `amount_total: 0` with fresh session reporting the true amount → order/entry writes use the fresh amount; fresh `payment_status !== 'paid'` → skipped
- [x] 1.4 Refactor `handleEntryPaymentRequestCompleted` to retrieve the session fresh at the top and use `fresh.amount_total` / `fresh.payment_status` throughout
- [x] 1.5 Write failing concurrency test for the per-entry refund stamp (already-refunded entry → zero-row update, no overwrite, log), then add the `.eq('payment_status','paid').select('id')` guard (MP-09)

## 2. Durable operator alerts (MP-08, MP-12)

- [ ] 2.1 Run `supabase migration list`, then create migration `NNN_create_operator_alerts.sql`: table per spec (id, created_at, source, severity CHECK, title, detail jsonb, dedupe_key, resolved_at, resolved_by), index on `created_at desc`, partial unique index on `(source, dedupe_key) WHERE resolved_at IS NULL` [ADDED — dedupe under Stripe re-delivery], explicit GRANTs (authenticated SELECT, service_role INSERT — no anon), RLS via `is_site_admin()`, and SECURITY DEFINER RPC `resolve_operator_alert(alert_id)` gated by `is_site_admin()`
- [ ] 2.2 Run the `migration-auditor` agent on the new migration and fix findings
- [ ] 2.3 Rework `_shared/alertAdmin.ts`: insert `operator_alerts` row first (own try/catch), then existing email attempt (own try/catch); missing `RESEND_API_KEY` no longer short-circuits persistence; add unit tests for both failure orders
- [ ] 2.4 Delete the duplicate `alertAdmin` in `cron-process-payouts/index.ts` and import the shared helper
- [ ] 2.5 Write assertion-first failing webhook test: unmatched `charge.refunded` → exactly one `alertAdmin` call with payment intent id, charge id, and amount; then replace the `console.log … ignoring` branch (`stripe-webhook/index.ts:282-284`) with the alert call, passing the Stripe event id as `dedupe_key` (MP-12)
- [ ] 2.5b [ADDED] Test alert dedupe: same `charge.refunded` event delivered twice → exactly one unresolved `operator_alerts` row (upsert/ignore on the partial unique index); resolved-then-recurred condition creates a fresh row
- [ ] 2.6 Add unresolved-alerts section to the existing `/admin/health` page: React Query read of `operator_alerts` (newest first, unresolved only), source/severity/title/detail/age display, resolve action calling the RPC, explicit all-clear empty state; component tests for populated, resolve, and empty states

## 3. Confirmation email idempotency (MP-13)

- [ ] 3.1 Write failing integration-style test: webhook confirmation send followed by the scheduled sender's audience query → entry not selected (exactly one email); include the retry case (stamped entry → no resend)
- [ ] 3.2 Stamp `confirmation_email_sent_at / _message_id / _status='sent'` on affected entries in `sendEntryConfirmationEmail` after successful send (`stripe-webhook/index.ts:1701-1830`); failed send leaves fields unstamped so the scheduled sender retries. [EXPANDED] For multi-entry sessions, stamp every entry the sent email covered; a stamp write failure logs and does not fail the webhook (worst case is the pre-existing duplicate, not a lost payment)

## 4. Refund result transparency (MP-11)

- [x] 4.1 Write failing component test for `RefundAllEntriesCard`: result with 1 refunded / 1 skipped (reason) / 1 failed (error) → each skipped entry shown with reason, each failed intent shown with entry ids + error; clean run shows no empty detail sections
- [x] 4.2 Render grouped skipped/failed detail from the existing `useShowRefundAll` result arrays in the card (no API changes)

## 5. Trial timezone validation (TZ-01)

- [x] 5.1 Write failing unit tests for `getTrialTimezone`: invalid zone → `'America/New_York'`; valid zone passes through; null/empty → default; error signal emitted once per invalid value
- [x] 5.2 Implement the `Intl.DateTimeFormat` probe validation + memoized Sentry report in `features/registries/helpers.ts`
- [x] 5.3 Add DST-boundary formatting tests for the landing `dateFormat` helpers using a valid zone (spring-forward and fall-back dates render device-independently)

## 6. Verification, PR, and deploy

- [ ] 6.1 Run the full verification matching the blast radius: `pnpm typecheck`, `pnpm lint`, `cd apps/myk9show && pnpm test` (webhook/edge tests, RefundAllEntriesCard, registries helpers, health page), plus any edge-function test suites touched
- [ ] 6.2 Open PR from this worktree branch; run `/review` and Codex review (`codex review --commit <SHA>`) — user-visible behavior + payment path qualifies for the Codex gate; fix findings
- [ ] 6.3 Merge from the main repo directory after green CI; then confirm-and-execute the deploy steps (merge ≠ deploy): `supabase db push` for the operator_alerts migration, `supabase functions deploy stripe-webhook cron-process-payouts --no-verify-jwt` from the correct workdir
- [ ] 6.4 Verify live on staging: unmatched-refund test event produces a visible, resolvable alert on `/admin/health`; resolve RPC gated (rolled-back psql txn check)
- [ ] 6.5 Update tracking docs: mark Phases 5–7 complete in `docs/plan-money-path-hardening.md` (flip status when fully shipped), check off the corresponding OPEN-TODOS items, and note completion in the launch scorecard's money-path evidence
