## Why

Go Live Runbook Phase 3 is the live-money cutover. It must not run until the MP-04 mode-scoping code is merged/deployed and the operator has completed Stripe dashboard, secret, purge, payout, cron, and real-payment smoke gates. The repo can still prepare a repeatable preflight so the morning checklist is exact.

This supports fall 2026 launch readiness by preventing an accidental half-live Stripe state and by making the live-money gate explicit. It does not add product UI or duplicate an app surface.

## What Changes

- Add a Phase 3 Stripe cutover preflight verifier that reports local source/readiness gates without touching Stripe, Supabase secrets, or the database.
- Add read-only SQL for post-approval database/cutover evidence.
- Add focused tests for the verifier.
- Update Go Live tracking docs with the expected MP-04 blocker and operator checklist.

Non-goals:

- Do not toggle Stripe live mode, create webhooks, rotate secrets, purge IDs, run live payments, grant founding members, or change payout settings.
- Do not generate live keys or write to Supabase/Stripe.
- Do not mark Phase 3 runbook items complete without live operator evidence.

## Capabilities

### New Capabilities

- `go-live-phase-3-stripe-cutover-preflight`: Covers repeatable preflight and evidence tracking for Stripe live-mode cutover readiness.

### Modified Capabilities

- None.

## Impact

- Affected tooling: `scripts/go-live/` Stripe cutover preflight and package scripts.
- Affected docs: `docs/operations/go-live-runbook.md`, `docs/operations/go-live-opsx-batches.md`, and this OpenSpec change.
- Affected systems: no shared-system mutation in this PR. All live-money actions remain explicit approval/operator gates.
