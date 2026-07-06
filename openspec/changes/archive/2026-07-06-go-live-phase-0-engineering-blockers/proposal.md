## Why

Original request: "Start opsx:ship batch mode for all open Go Live Runbook items in Phases 0-4.
Work autonomously through agent-owned code/docs/test/OpenSpec tasks, prepare PRs, dry-runs, and
evidence. Do not merge PRs or mutate shared systems without explicit approval. Keep tracking docs
updated and leave a morning approval checklist for blocked gates."

Go Live Runbook Phase 0 is the ordered precondition gate for the fall 2026 launch. The remaining
agent-owned blockers need one OpenSpec paper trail so Codex can work through code, tests, dry-runs,
and evidence overnight without creating a separate apply/archive cycle for every runbook checkbox.

This change supports launch readiness by closing the money-path HIGH findings that gate Stripe live
cutover, refreshing edge-function drift evidence before deploy approval, and keeping scorecard
evidence honest for the final Phase 4 user and venue checks.

## What Changes

- Create one B0 batch change for Go Live Runbook items 0.4, 0.5, and 0.7.
- Harden the payment-link duplicate webhook path so repeated `checkout.session.completed` events for
  the same link/session are idempotent and never refund a valid already-paid charge.
- Prepare the mode-scoped Stripe ID work that prevents test-mode customers/accounts from being reused
  after the live-mode cutover.
- Refresh edge-function drift evidence and list deploy commands that remain confirmation-gated.
- Update runbook and batch tracking docs only when an item is backed by merged code, dry-run output,
  staging/runtime evidence, or an explicit blocked-gate note.
- Non-goals: no new user-facing pages or duplicated workflow surfaces; no real function deploys,
  database pushes, dashboard changes, Stripe live-mode actions, or PR merges without explicit approval.

## Capabilities

### New Capabilities

- `go-live-precondition-evidence`: Tracks Phase 0 precondition evidence, drift findings, blocked
  approval gates, and scorecard/runbook completion rules.

### Modified Capabilities

- `entry-payment-integrity`: Add idempotent payment-link duplicate delivery behavior and mode-scoped
  Stripe customer/account requirements needed before live cutover.

## Impact

- Affected code: Supabase Stripe edge functions, Stripe webhook tests, Stripe checkout/portal/connect
  helpers, and any migrations required for mode-scoped Stripe identifiers.
- Affected docs: `docs/operations/go-live-runbook.md`, `docs/operations/go-live-opsx-batches.md`,
  `docs/plan-money-path-hardening.md`, and scorecard docs when evidence changes.
- Affected systems: Supabase edge-function deployment and database migration remain approval-gated;
  Stripe live cutover remains operator-gated.
- Duplication check: this change does not introduce new UX surfaces. It tightens existing payment and
  operations flows, then links evidence back to the existing runbook, batch tracker, and scorecard.
