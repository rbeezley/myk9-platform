# Proposal: money-path-hardening-remainder

## Why

The 2026-07-09 production-readiness verification ([docs/audits/production-readiness-claude-review-2026-07-09.html](../../../docs/audits/production-readiness-claude-review-2026-07-09.html)) confirmed that Phases 5 and 7 of [docs/plan-money-path-hardening.md](../../../docs/plan-money-path-hardening.md) are still live defects in the code: two MEDIUM webhook-trust gaps (MP-05, MP-07), a durable-alerting gap (MP-08), and four LOW hygiene items (MP-09, MP-11, MP-12, MP-13), plus one misdiagnosed-but-real timezone-validation gap (TZ-01). These are the last tracked code defects on the money path and lead Phase A of the path to a club pilot — closing them directly supports the fall 2026 launch gate (no open money-path defects before the technical dress rehearsal).

## What Changes

- **MP-05 — payment-status guard:** `stripe-webhook` `handleEntryPaymentCompleted` returns early when the freshly retrieved session's `payment_status !== 'paid'` (delayed-notification methods re-drive via `async_payment_succeeded`).
- **MP-07 — fresh retrieve on the link path:** `handleEntryPaymentRequestCompleted` retrieves the session from Stripe and uses `fresh.amount_total` / `fresh.payment_status` instead of trusting the webhook payload (removes the `$0 stripe_orders` corruption path).
- **MP-08 — durable operator alerts:** new `operator_alerts` table (name already reserved by migration comments); `alertAdmin` persists a row alongside the email; unresolved alerts surface on the **existing** `/admin/health` board with a resolve action. Also deletes the duplicated email-only `alertAdmin` copy in `cron-process-payouts`.
- **MP-12 — unmatched refunds alert:** the silent `console.log … ignoring` branch for `charge.refunded` events that match no `stripe_orders` row routes through the durable alert path with payment identifiers.
- **MP-09 — refund stamp guard:** per-entry refund stamp update guarded with `.eq('payment_status','paid').select('id')`; zero rows means already stamped — log, don't overwrite.
- **MP-11 — refund result detail:** `RefundAllEntriesCard` renders the per-entry `skipped[{entryId,reason}]` / `failed[{…,error}]` arrays the hook already returns, grouped by reason, instead of counts only.
- **MP-13 — exactly one confirmation email:** the webhook's `sendEntryConfirmationEmail` stamps `confirmation_email_sent_at / _message_id / _status` on the entry so the scheduled `send-confirmation-email` sender's `IS NULL` audience query no longer re-mails webhook-confirmed entries.
- **TZ-01 — timezone validation at the boundary:** `getTrialTimezone` validates the IANA name and falls back to `'America/New_York'` with an observable error signal instead of passing an invalid zone through (which today makes landing-page dates render blank via the downstream try/catch).

**Duplication check:** no new pages, sheets, or dialogs. MP-08 deliberately extends the existing `/admin/health` board (whose spec already says it was "intentionally shaped as the same family as the planned `operator_alerts` table so they can converge later") rather than adding a monitoring surface; MP-11 enriches an existing card.

**Non-goals:** no standalone alerting/monitoring page; no alert delivery channels beyond the existing email + the health board; no retry queue for failed emails; no rework of the Heritage confirmation flow beyond audience exclusion; no timezone picker UI or per-surface timezone rework; no changes to already-merged MP phases 1–4.

## Capabilities

### New Capabilities

- `stripe-webhook-trust`: the webhook processes entry payments only from freshly retrieved, `paid` Stripe sessions, and refund stamping is idempotent (MP-05, MP-07, MP-09).
- `operator-alerts`: payment/operational failures are durably persisted, queryable, resolvable by a site admin, and never silently dropped (MP-08, MP-12).
- `entry-confirmation-idempotency`: an entry receives exactly one confirmation email across the webhook and scheduled sender paths (MP-13).
- `refund-result-transparency`: bulk-refund outcomes are actionable per entry — every skipped/failed entry is identified with its reason (MP-11).
- `trial-timezone-validation`: trial timezone reads validate the IANA name and fail safe to the documented default, observably (TZ-01).

### Modified Capabilities

- `admin-system-health`: the `/admin/health` board additionally surfaces unresolved operator alerts (new requirement; the snapshot store itself is unchanged).

## Impact

- **Edge functions** (`apps/myk9show/supabase/functions/`): `stripe-webhook/index.ts`, `_shared/alertAdmin.ts`, `cron-process-payouts/index.ts`; root `supabase/functions/send-confirmation-email/index.ts` audience query unaffected but its selection semantics now hold. Redeploy required (`--no-verify-jwt`, correct workdir per repo rules).
- **Database**: one new migration for `operator_alerts` (explicit GRANTs + RLS mirroring `system_health_snapshots`: site-admin SELECT/UPDATE-resolve, service_role INSERT).
- **Frontend** (`apps/myk9show/src/`): `RefundAllEntriesCard.tsx`, `/admin/health` page additions, `features/registries/helpers.ts` (`getTrialTimezone`).
- **Deploy note**: merge is not deploy — migration push + function deploys are explicit follow-up steps and are called out in tasks.
