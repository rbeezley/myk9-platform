## 1. Artifact Setup

- [x] 1.1 Create OpenSpec proposal, design, spec, and task artifacts for Go Live Phase 3 Stripe cutover preflight.
- [x] 1.2 Validate the OpenSpec change after implementation artifacts are present.

## 2. Preflight Implementation

- [x] 2.1 Add a TypeScript Phase 3 preflight that reports MP-04/source, runbook, function, and live-money gate readiness.
- [x] 2.2 Add a read-only SQL checklist for post-approval Stripe cutover database evidence.
- [x] 2.3 Add package scripts for the preflight and focused tests.

## 3. Tests

- [x] 3.1 Add focused tests for MP-04 blocker detection and runbook coverage checks.
- [x] 3.2 Run the focused preflight tests.

## 4. Tracking And Evidence

- [x] 4.1 Update `docs/operations/go-live-runbook.md` Phase 3 with prepared preflight evidence while leaving live-money gates unchecked.
- [x] 4.2 Update `docs/operations/go-live-opsx-batches.md` with B3 status, commands, blockers, and morning checklist.
- [x] 4.3 Run the preflight locally and capture the MP-04 blocker in the tracker.

## 5. Verification And PR

- [x] 5.1 Run `pnpm openspec validate --changes go-live-phase-3-stripe-cutover`.
- [x] 5.2 Run `git diff --check`.
- [x] 5.3 Commit, push, and open a PR citing `Tracked in openspec change: go-live-phase-3-stripe-cutover`.
- [x] 5.4 Leave Stripe live mode, webhook creation, secret rotation, ID purge, payout settings, cron smoke, real payment/refund smoke, founding-member grants, and treasurer onboarding as morning/operator gates.
