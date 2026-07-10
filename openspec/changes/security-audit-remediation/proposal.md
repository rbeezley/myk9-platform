## Why

The 2026-07-10 full security audit ([`docs/security-audit-2026-07-10.md`](../../../docs/security-audit-2026-07-10.md)) found no CRITICAL/HIGH issues but left a residual cluster: the SA-004 fix authorized _who may call_ the branded-email functions but not _who they may send to_, so an authenticated caller can still emit a DKIM-signed `@myk9show.com` email to an arbitrary recipient (SA-018/019/020). Closing these before launch removes the last domain-reputation/phishing vector, and the same change sweeps up defense-in-depth drift that reintroduced known-class gaps after the July 3 remediation (FORCE-RLS sweep regression, an un-REVOKE'd definer function, and hardening nits).

## What Changes

- **SA-018** — `send-email` `support_notification` derives the recipient (and cc) server-side from the ticket owner's email; body-supplied `to`/`cc` are ignored.
- **SA-019** — `send-email` `entry_decision` derives the recipient from the registration's exhibitor/person email; body-supplied `to` is ignored.
- **SA-020** — `send-results` adds a show-official authorization check (mirroring `send-targeted-message`'s `user_roles` query) and derives `secretaryEmail`/cc/reply-to from the show record rather than the request body.
- **SA-021** — New migration adds `FORCE ROW LEVEL SECURITY` to `support_tickets`, `support_ticket_messages`, `show_lifecycle_email_steps`, `show_lifecycle_email_jobs`, `show_lifecycle_email_attempts` (created after the SA-017 sweep).
- **SA-022** — Same migration `REVOKE ALL ON FUNCTION public.ensure_show_lifecycle_email_steps(uuid) FROM PUBLIC` (leaving the trigger the sole caller).
- **SA-027** — Lifecycle helper functions (`can_manage_show_lifecycle_email`, `ensure_show_lifecycle_email_steps*`) pinned to `SET search_path = ''` with fully-qualified references.
- **SA-023** — `resend-webhook` uses a constant-time signature comparison instead of `Array.includes`.
- **SA-026** — `OperatorAlertsSection` routes its error toast through `friendlyDbError` instead of raw `err.message`.
- **SA-009** — No code change. During implementation this was found to be a false positive: `AuthContext` already reloads full RBAC on a 60s `setInterval` (shipped 2026-07-03 in #1099, the prior audit's SA-009 fix), bounding client permission staleness to ≤60s. Dropped from scope; the audit report is corrected accordingly.

Non-goals: no `supabase db push` and no edge-function deploy in this change — the change ends at an open PR. Deploy/push is a separate, explicitly-confirmed step.

## Capabilities

### New Capabilities

- `email-fn-send-results-authz`: `send-results` must authorize the caller as a show official for the results' show and derive all address fields (destination, cc, reply-to) server-side from the show record, never from the request body.

### Modified Capabilities

- `email-fn-send-email-authz`: adds a requirement that the recipient (and cc) of a `send-email` message be derived from the referenced resource (ticket owner for `support_notification`, registration exhibitor for `entry_decision`), not from caller-supplied body fields. Existing caller-authorization and rate-limiting requirements are unchanged.

## Impact

- Edge functions: `supabase/functions/send-email/` (index.ts + authz.ts), `supabase/functions/send-results/index.ts`, `supabase/functions/resend-webhook/index.ts`.
- Migrations: one new `supabase/migrations/NNN_*.sql` (FORCE RLS + REVOKE + search_path hardening for lifecycle-email objects).
- Client: `apps/myk9show/src/pages/admin/OperatorAlertsSection.tsx` (SA-026 friendly error). SA-009 ships no code (already fixed in #1099).
- Tests: assertion-first unit tests for recipient derivation and the send-results role check; migration verified via `supabase db push --dry-run`-equivalent review (no live push).
- No schema data changes; no breaking API changes. Recipient-derivation is behavior-narrowing (body `to`/`cc` stop being honored for the two affected types) — acceptable pre-launch with no real users.
