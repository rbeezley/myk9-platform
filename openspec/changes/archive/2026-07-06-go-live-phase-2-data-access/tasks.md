## 1. Artifact Setup

- [x] 1.1 Create OpenSpec proposal, design, and spec artifacts for Go Live Phase 2 data/access verification.
- [x] 1.2 Validate the OpenSpec change after implementation artifacts are present.

## 2. Verifier Implementation

- [x] 2.1 Add a TypeScript Phase 2 verifier that reports local/source readiness without credentials.
- [x] 2.2 Add a read-only SQL checklist for staging/prod seed and access evidence.
- [x] 2.3 Add an optional verifier mode that executes the read-only SQL only when `--db-url` is supplied.
- [x] 2.4 Add a package script for the verifier.

## 3. Tests

- [x] 3.1 Add focused tests for header-only and populated judge CSV detection.
- [x] 3.2 Add focused tests for source-readiness check aggregation and SQL command construction.
- [x] 3.3 Run the focused verifier tests.

## 4. Tracking And Evidence

- [x] 4.1 Update `docs/operations/go-live-runbook.md` Phase 2 with prepared verifier evidence while leaving incomplete/operator-gated items unchecked.
- [x] 4.2 Update `docs/operations/go-live-opsx-batches.md` with B2 status, commands, blockers, and morning approval/operator checklist.
- [x] 4.3 Run the verifier locally and capture the header-only judge CSV blocker in the tracker.

## 5. Verification And PR

- [x] 5.1 Run `pnpm openspec validate --changes go-live-phase-2-data-access`.
- [x] 5.2 Run `git diff --check`.
- [x] 5.3 Commit, push, and open a PR citing `Tracked in openspec change: go-live-phase-2-data-access`.
- [x] 5.4 Leave real judge exports, DB writes, seed repairs, dashboard anonymous sign-in proof, and live cold-session walks as morning/operator gates.
