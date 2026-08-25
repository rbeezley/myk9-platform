## Why

The weekly Supabase audit found five launch-readiness gaps. Three have since been deployed and live-verified; this change closes the remaining repository and deployment drift without creating a parallel work queue or leaving source and hosted behavior inconsistent.

Original request:

> can you fix these?
>
> 1. P1 / High — MYK9-243: emergency-packet armband identity.
> 2. P2 / Medium — MYK9-161: health-check deployment drift.
> 3. P2 / Medium — MYK9-236: service-role grant contract drift.
> 4. P2 / Medium — SHD-2026-08-20-03: email-idempotency deployment closure.
> 5. P3 / Low: obsolete phase-2 cron assertion and missing `sms_proximity_sends.entry_id` index.

This supports fall 2026 launch readiness by keeping show-day paper identity, operational health signals, email delivery behavior, and database integrity checks trustworthy.

## What Changes

- Preserve the existing deployed closure proof for MYK9-243 and MYK9-236 rather than duplicating their fixes.
- Record fresh live proof that the MYK9-236 deployment also closed the recurring MYK9-161 ACL-checker drift.
- Verify and deploy the current per-logical-send email idempotency implementation for `send-waitlist-invite` and `cron-process-payouts`, then capture closure evidence.
- Correct the phase-2 read-only SQL assertion to use the canonical hosted cron job name.
- Add a migration creating a leading index for the `sms_proximity_sends.entry_id` foreign key and cover it with a migration contract test.
- Keep shared-system mutations—database push and Edge Function deployments—behind explicit approval.

No user-facing surface is added or duplicated. A link cannot solve these database, deployment, and verification defects; the existing pages and workflows remain unchanged.

Non-goals:

- No new health dashboard, email UI, packet UI, or SMS feature.
- No broad index cleanup or service-role privilege redesign beyond the already-merged MYK9-236 decision.
- No live payout, waitlist invitation, or production-recipient email smoke.
- No automatic Linear mutation without the finding-lifecycle approval gate.

## Capabilities

### New Capabilities

None. This is deployment, harness, and database-maintenance remediation for existing behavior.

### Modified Capabilities

None. Existing email, health, and SMS contracts already describe the intended behavior; this change brings verification and hosted state into alignment.

## Impact

- `scripts/go-live/phase-2-data-access.sql`
- `supabase/migrations/` and the database migration contract suite
- `supabase/functions/send-waitlist-invite` and its shared email helper
- `apps/myk9show/supabase/functions/cron-process-payouts` and its shared email helper
- Linked Supabase project `sojmvhhwsjxmfistvzbe` after explicit approval
- OpenSpec/PR evidence and the canonical Linear findings
