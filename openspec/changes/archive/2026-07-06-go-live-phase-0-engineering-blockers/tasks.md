## 1. Batch Setup And Artifact Verification

- [x] 1.1 Create B0 OpenSpec proposal, design, specs, and tasks for Go Live Runbook items 0.4,
      0.5, and 0.7.
- [x] 1.2 Run `pnpm openspec validate --changes go-live-phase-0-engineering-blockers` and patch
      artifact issues before implementation.
- [x] 1.3 Record the original autonomous batch request and approval boundaries in the artifacts.

## 2. Runbook 0.5 Money-Path Hardening

- [x] 2.1 Inspect the current Stripe webhook payment-link implementation and existing tests for
      duplicate delivery coverage.
- [x] 2.2 Add an assertion-first MP-03 test proving duplicate `checkout.session.completed` delivery
      for the same link/session does not call `stripe.refunds.create` and leaves entries paid.
- [x] 2.3 Implement MP-03 same-intent no-op behavior and checked link-close
      persistence.
- [x] 2.4 Run focused Stripe webhook tests for MP-03 and update `docs/plan-money-path-hardening.md`
      with PR/evidence status.
- [x] 2.5 Prepare MP-04 mode-scoped Stripe ID migration/function work if it fits safely in this PR;
      otherwise document it as the next B0 PR under the same OpenSpec change.
- [x] 2.6 For any migration work, run a dry-run only and list the real `supabase db push` approval
      gate without executing it.

## 3. Runbook 0.4 Edge-Function Drift

- [x] 3.1 Run the repo edge-function inventory/drift command and capture deployed-only, repo-only,
      repo-ahead, and deployed-ahead findings.
- [x] 3.2 Run or prepare byte-level download/diff evidence for functions that are candidates for
      deployment.
- [x] 3.3 Document confirmation-gated deploy commands and smoke checks for repo-ahead functions.
- [x] 3.4 Keep runbook 0.4 unchecked until required deploys are approved, executed, and smoke-checked.

## 4. Runbook 0.7 Scorecard And Yellow Evidence

- [x] 4.1 Reconcile motion-consistency and July UX remediation evidence against the scorecard and
      runbook.
- [x] 4.2 Record remaining Yellow evidence gates that cannot be closed by local repo work.
- [x] 4.3 Update tracking docs only for evidence that is complete, and leave operator gates explicit.

## 5. Verification, Review, And PR

- [x] 5.1 Run focused tests for changed TypeScript, edge-function, or migration files.
- [x] 5.2 Run relevant typecheck/lint/OpenSpec validation for the touched areas unless blocked by a
      known hang or unrelated failure.
- [x] 5.3 Run required second-opinion review for payment/RLS/migration changes before merge.
- [x] 5.4 Commit, push the feature branch, and open an implementation PR with `Tracked in openspec
      change: go-live-phase-0-engineering-blockers`.
- [x] 5.5 Leave a morning approval checklist for any blocked shared-system mutations, deploys, merges,
      or operator evidence gates.

## 6. Archive After Merge

- [x] 6.1 After every required B0 implementation PR is merged or explicitly deferred, verify merge
      state with `gh pr view --json state`.
- [x] 6.2 Archive the OpenSpec change and sync specs only after merge/evidence gates are satisfied.
- [x] 6.3 Clean up the feature branch and worktree after archive.
