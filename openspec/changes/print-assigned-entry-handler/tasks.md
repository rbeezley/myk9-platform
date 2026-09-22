## 1. Assertion-First Coverage

- [x] 1.1 Add a real-shape print mapping test where assigned handler differs from owner, assert handler precedence first, and verify the test is red on `main`
- [x] 1.2 Add or extend fallback coverage for an entry with no assigned handler and verify the owner's name remains printed

## 2. Handler Projection

- [x] 2.1 Implement the typed assigned-handler-first projection in the canonical print mapping path and verify check-in sheet and run-order tests pass
- [x] 2.2 Audit `print-templates.tsx`, `print-types.ts`, the AKC entry form, and gazette `OwnerHandlerSection`; fix and pin any duplicate owner-as-handler assumption or record why each is already correct

## 3. Verification and Delivery

- [x] 3.1 Run the focused suite, app typecheck, repository lint, changed-file formatting check, and code-quality ratchet; verify all pass or document unrelated failures
  - Task 7 evidence (2026-09-20): the complete touched-test suite passed in one command (`18` files, `168` tests). App typecheck, repository lint, `pnpm format:check:changed`, and the code-quality ratchet passed. The stale unused import exposed by lint was removed, and the secretary replication test received only mechanical Prettier formatting. Review-tier classified the branch as `adversarial` because the task evidence reports are in the diff.
- [ ] 3.2 Run the shuffled app suite and validate the OpenSpec change
  - The active change artifacts have been restored; `pnpm openspec validate print-assigned-entry-handler --type change --json` passes. The shuffled app suite started with seed `1790114133288`, produced no useful test result for 30 seconds, and was interrupted with exit `130`; it was not a passing run.
- [ ] 3.3 Open and merge the reviewed PR with CI green, update MYK9-603 with audit/test evidence, and archive the change

## 4. Structural correction after whole-branch review

- [x] 4.1 Remove the redundant at-show identity migration after review proved those screens have no production handler-identity reader; preserve the established replica-backed queue reads
- [x] 4.2 Run the focused at-show suite after rollback (68 files, 562 tests passed)
- [x] 4.3 Route the actual Reports check-in print mapper through canonical handler identity and test the printed output with a real projection fixture
- [ ] 4.4 Remove task scratch reports from the tracked diff, rerun focused tests and one shuffled app suite, and complete two-lens fallback adversarial review on the final branch
- [x] 4.5 Make Reports respond to deferred handler-person hydration, including the initial read and owner fallback; focused tests passed (23 tests)
- [x] 4.6 Resolve ID-only assigned handlers on the AKC entry form without borrowing a sibling entry's junior identity; focused tests passed (10 tests)
- [ ] 4.7 Rebuild the scheduled emergency packet RPC with assigned-person/owner precedence and behavioral SQL coverage; contract tests passed, behavioral DB fixture awaits CI
