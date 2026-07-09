# operator-alerts Specification

## Purpose
Durable, queryable, resolvable operator alerts: every alertAdmin() call persists an operator_alerts row (persist-then-email, dedupe under event re-delivery via the (source, dedupe_key) partial unique index), surfaced on /admin/health with a site-admin-gated resolve RPC. Introduced by money-path-hardening-remainder (MP-08/MP-12) so payment/ops failures are never lost to a missing RESEND_API_KEY or email outage.
## Requirements
### Requirement: Operator alerts are durably persisted
The system SHALL persist operator alerts in a `public.operator_alerts` table with at least: `id` (uuid PK), `created_at` (timestamptz default now), `source` (text, not null — the emitting function), `severity` (text, constrained to `'info' | 'warn' | 'error'`), `title` (text, not null), `detail` (jsonb — structured context such as payment identifiers), `resolved_at` (timestamptz, nullable), and `resolved_by` (uuid, nullable). The table SHALL carry explicit GRANTs and RLS: `service_role` MAY INSERT; `authenticated` users for whom `is_site_admin()` is true MAY SELECT and UPDATE (resolve); `anon` SHALL have no access.

#### Scenario: Service-role insert succeeds
- **WHEN** an edge function running as `service_role` inserts an alert row
- **THEN** the row is persisted and visible to site admins

#### Scenario: Non-admin cannot read alerts
- **WHEN** an `authenticated` user for whom `is_site_admin()` is false queries `operator_alerts`
- **THEN** RLS returns zero rows

#### Scenario: Anonymous access is denied
- **WHEN** an `anon` client attempts to read `operator_alerts`
- **THEN** the request is rejected (no grant)

### Requirement: alertAdmin persists before emailing and never silently drops
The shared `alertAdmin` helper SHALL insert an `operator_alerts` row for every invocation, then attempt the existing email delivery. A missing `RESEND_API_KEY` or an email delivery failure SHALL NOT prevent the row insert; an insert failure SHALL still attempt the email and log the persistence error. There SHALL be exactly one implementation of `alertAdmin` shared by all edge functions (the duplicate copy in `cron-process-payouts` is removed).

#### Scenario: Email delivery unavailable
- **WHEN** `alertAdmin` is invoked and `RESEND_API_KEY` is unset
- **THEN** the `operator_alerts` row is still inserted

#### Scenario: Payout cron uses the shared helper
- **WHEN** `cron-process-payouts` raises an operator alert
- **THEN** it goes through the shared `alertAdmin` implementation and produces a persisted row

### Requirement: Unmatched refund events raise a durable alert
When `stripe-webhook` receives a `charge.refunded` event whose payment intent matches no `stripe_orders` row, the system SHALL raise an operator alert containing the payment intent id, charge id, and refunded amount, instead of only logging.

#### Scenario: Out-of-order refund is surfaced
- **WHEN** a `charge.refunded` event arrives for a payment intent with no matching order row
- **THEN** exactly one `operator_alerts` row is created with the payment identifiers, and the webhook still returns success to Stripe

### Requirement: Alert creation is deduplicated under event re-delivery
`alertAdmin` SHALL accept an optional `dedupe_key` (persisted on the row with a partial unique index on `(source, dedupe_key)` for unresolved rows). Callers reacting to retryable external events (Stripe webhook re-deliveries, cron re-runs) SHALL pass a stable key (e.g. the Stripe event id or payment intent id) so re-delivery does not create duplicate unresolved alerts.

#### Scenario: Stripe re-delivers an unmatched refund event
- **WHEN** the same `charge.refunded` event is delivered twice for an unmatched payment intent
- **THEN** exactly one unresolved `operator_alerts` row exists for it

#### Scenario: Recurrence after resolution alerts again
- **WHEN** an alert with a given dedupe key has been resolved and the same condition occurs again
- **THEN** a new unresolved alert row is created

### Requirement: Alerts are resolvable by a site admin
A site admin SHALL be able to mark an alert resolved, recording `resolved_at` and `resolved_by`. Resolution SHALL not delete the row.

#### Scenario: Admin resolves an alert
- **WHEN** a site admin resolves an unresolved alert
- **THEN** the row's `resolved_at` and `resolved_by` are set and the alert leaves the unresolved view
