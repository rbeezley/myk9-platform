## 1. Artifact Setup

- [x] 1.1 Create OpenSpec proposal, design, spec, and task artifacts for Go Live Phase 4 evidence pass.
- [x] 1.2 Validate the OpenSpec change after implementation artifacts are present.

## 2. Verifier And Checklist

- [x] 2.1 Add a TypeScript Phase 4 evidence verifier.
- [x] 2.2 Add an operator-facing Phase 4 evidence checklist.
- [x] 2.3 Add package scripts for the verifier and focused tests.

## 3. Tests

- [x] 3.1 Add focused tests for checklist coverage and live-evidence blocker detection.
- [x] 3.2 Run the focused verifier tests.

## 4. Tracking And Evidence

- [x] 4.1 Update `docs/operations/go-live-runbook.md` Phase 4 with prepared checklist evidence while leaving live/operator gates unchecked.
- [x] 4.2 Update `docs/operations/go-live-opsx-batches.md` with B4 status, commands, blockers, and morning checklist.
- [x] 4.3 Run the verifier locally and capture the live-evidence blockers in the tracker.

## 5. Verification And PR

- [x] 5.1 Run `pnpm openspec validate --changes go-live-phase-4-evidence-pass`.
- [x] 5.2 Run `git diff --check`.
- [ ] 5.3 Commit, push, and open a PR citing `Tracked in openspec change: go-live-phase-4-evidence-pass`.
- [x] 5.4 Leave staging walks, offline rehearsal, hardware print testing, real-user testing, and scorecard Green flips as morning/operator gates.
