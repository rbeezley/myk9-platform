## Why

The July 11 go-live review found launch monitoring that can fail silently, a local migration-history collision, a drifting FORCE-RLS invariant, six additional security hardening findings, and unresolved Supabase advisor and operator gates. Closing these gaps is required for fall 2026 launch readiness because show-day reliability depends on observable failures, deterministic database state, narrow privileges, and evidence-backed operator cutover.

## What Changes

- Repair daily health monitoring so successful delivery writes a snapshot, missed snapshots create a durable deduplicated operator alert, and an independent external heartbeat notifies a named human.
- Reconcile the duplicate `20260710160000` migration without regressing the later authoritative `soft_delete_person` function.
- Enforce FORCE RLS continuously, harden resend and push webhook authentication, fail closed on passcode-limiter failure, and rate-limit premium generation.
- Inventory and disposition every July 11 Supabase advisor result by exact object identity, then apply only evidence-backed privilege, search-path, storage-policy, or documented-exception changes.
- Remove the service-role-key push-webhook fallback after the dedicated secret is proven and rotated through an approved deployment.
- Update the existing go-live report, security audit, runbook, scorecard, and backlog with source, CI, deployment, and operator evidence.
- Keep all dashboard, live-money, secret, DNS, production-data, legal, browser, device, and real-user actions confirmation- or operator-gated.

## Capabilities

### New Capabilities

- `database-security-invariants`: Repository and live-catalog checks for FORCE RLS, function execution grants, search paths, and advisor accounting.
- `premium-generation-throttle`: Atomic per-user/per-show request accounting, fail-closed enforcement, and bounded retention before paid AI generation.
- `push-webhook-authentication`: Dedicated-secret-only constant-time authentication for all database-triggered push webhooks.
- `resend-webhook-verification`: Shared timing-safe Standard-Webhooks verification for Resend delivery events.

### Modified Capabilities

- `admin-system-health`: Daily health delivery and missed-snapshot detection become independently observable and alertable.
- `operator-alerts`: Health-check delivery failures create durable, deduplicated alerts on the existing admin surface.
- `ringside-passcode-throttle`: Limiter infrastructure errors fail closed before passcode validation and create a durable alert.
- `go-live-precondition-evidence`: Migration parity, advisor disposition, security remediation, and every non-done July 11 gate require explicit current evidence or a time-bounded accepted-risk record.

## Impact

Affected areas include Supabase migrations and catalog grants, `cron-health-check`, `validate-passcode`, `generate-premium`, `resend-webhook`, shared push-webhook authentication, myK9Show auth helpers, database/security verification scripts, and launch tracking documents. Database pushes, Edge Function deployments, secret rotation, external alert configuration, live Stripe work, production-data changes, DNS/Vercel changes, and operator evidence remain shared-system gates requiring confirmation.

This change adds no page, dialog, or parallel checklist. It reuses `/admin/health`, `operator_alerts`, the go-live runbook, and the existing launch scorecard; a link is not needed because no new surface is introduced.

Non-goals are rebuilding the deleted myK9Q app, changing payments architecture, creating a second launch dashboard, adding placeholder RLS policies, or marking external/operator gates complete from repository evidence alone.
