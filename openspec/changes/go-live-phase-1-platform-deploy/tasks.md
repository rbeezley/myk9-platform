## 1. Artifact Setup

- [x] 1.1 Create OpenSpec proposal, design, spec, and task artifacts for Go Live Phase 1 platform/deploy verification.
- [x] 1.2 Validate the OpenSpec change after implementation artifacts are present.

## 2. Verifier Implementation

- [x] 2.1 Add a TypeScript Phase 1 verifier that reports deploy workflow, Vercel config, auth-email runbook, and kill-switch source readiness.
- [x] 2.2 Add package scripts for the verifier and focused tests.

## 3. Tests

- [x] 3.1 Add focused tests for deploy workflow source checks.
- [x] 3.2 Add focused tests for Vercel config, auth-email runbook, and kill-switch checks.
- [x] 3.3 Run the focused verifier tests.

## 4. Tracking And Evidence

- [x] 4.1 Update `docs/operations/go-live-runbook.md` Phase 1 with prepared verifier evidence while leaving operator/shared-system gates unchecked.
- [x] 4.2 Update `docs/operations/go-live-opsx-batches.md` with B1 status, commands, blockers, and morning checklist.
- [x] 4.3 Run the verifier locally and capture the current warning that `git.deploymentEnabled.main=false` remains gated.

## 5. Verification And PR

- [x] 5.1 Run `pnpm openspec validate --changes go-live-phase-1-platform-deploy`.
- [x] 5.2 Run `git diff --check`.
- [ ] 5.3 Commit, push, and open a PR citing `Tracked in openspec change: go-live-phase-1-platform-deploy`.
- [x] 5.4 Leave GitHub secrets/variables, Vercel env/config flips, Supabase Management API PATCH, and real production deploy verification as morning/operator gates.
