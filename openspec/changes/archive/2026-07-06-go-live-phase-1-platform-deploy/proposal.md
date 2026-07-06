## Why

Go Live Runbook Phase 1 controls how fixes safely reach production: CI-gated deploys, auth email rate-limit posture, and realtime kill-switch readiness. Most remaining actions are dashboard/API gates, but the repo can still provide repeatable source evidence so morning approval is faster and less error-prone.

This supports fall 2026 launch readiness by making production-deploy and show-day rollback posture auditable before Phase 4 evidence walks. It does not duplicate an app surface; the change adds operational verification around existing workflows and runbooks.

## What Changes

- Add a Go Live Phase 1 source verifier for deploy workflow, Vercel config, auth-email runbook, and realtime kill-switch defaults.
- Add focused tests for the verifier.
- Update the Go Live Runbook and OpsX batch tracker with prepared evidence and remaining operator/shared-system gates.
- Keep GitHub secrets/variables, Vercel dashboard/env flips, Supabase Management API PATCHes, and real deploy validation approval/operator-gated.

Non-goals:

- Do not set GitHub secrets or repo variables.
- Do not change Vercel production deploy settings until the operator validates one CI-gated deploy.
- Do not PATCH Supabase Auth config or change Custom SMTP.
- Do not flip production env vars or deploy functions.
- Do not add user-facing UI.

## Capabilities

### New Capabilities

- `go-live-phase-1-platform-deploy-verification`: Covers repeatable source verification and operator-gate tracking for Phase 1 deploy pipeline, auth email, and kill-switch readiness.

### Modified Capabilities

- None.

## Impact

- Affected tooling: `scripts/go-live/` verifier and package scripts.
- Affected docs: `docs/operations/go-live-runbook.md`, `docs/operations/go-live-opsx-batches.md`, and this OpenSpec change.
- Affected systems: no shared-system mutation in this PR. GitHub, Vercel, and Supabase dashboard/API changes remain explicit gates.
