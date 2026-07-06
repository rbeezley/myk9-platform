## Why

Go Live Runbook Phase 4 is the final evidence pass before launch-day checks. The remaining items require staging walks, offline rehearsal, venue hardware, and real non-technical users, so the repo should prepare a clear evidence checklist and verifier without marking operator-gated items complete.

This supports fall 2026 launch readiness by making show-day reliability, offline-first behavior, reports/forms, real-user testing, and scorecard close-out easy to execute and review. It does not add product UI.

## What Changes

- Add a Phase 4 evidence-pass verifier for source/checklist readiness.
- Add focused tests for the verifier.
- Add an operator-facing evidence checklist document for Phase 4 walks.
- Update the Go Live Runbook and OpsX tracker with prepared evidence and remaining gates.

Non-goals:

- Do not run staging browser walks, hardware print tests, or real-user tests without operator participation.
- Do not mark scorecard rows Green without evidence.
- Do not add new app surfaces.

## Capabilities

### New Capabilities

- `go-live-phase-4-evidence-pass-verification`: Covers repeatable preparation and tracking for Phase 4 launch evidence.

### Modified Capabilities

- None.

## Impact

- Affected tooling: `scripts/go-live/` evidence verifier and package scripts.
- Affected docs: `docs/operations/go-live-phase-4-evidence-checklist.md`, `docs/operations/go-live-runbook.md`, `docs/operations/go-live-opsx-batches.md`, and this OpenSpec change.
- Affected systems: no shared-system mutation. Staging, hardware, and real-user evidence remain operator/QA gates.
