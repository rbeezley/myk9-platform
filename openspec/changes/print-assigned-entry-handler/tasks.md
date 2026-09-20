## 1. Assertion-First Coverage

- [x] 1.1 Add a real-shape print mapping test where assigned handler differs from owner, assert handler precedence first, and verify the test is red on `main`
- [x] 1.2 Add or extend fallback coverage for an entry with no assigned handler and verify the owner's name remains printed

## 2. Handler Projection

- [x] 2.1 Implement the typed assigned-handler-first projection in the canonical print mapping path and verify check-in sheet and run-order tests pass
- [x] 2.2 Audit `print-templates.tsx`, `print-types.ts`, the AKC entry form, and gazette `OwnerHandlerSection`; fix and pin any duplicate owner-as-handler assumption or record why each is already correct

## 3. Verification and Delivery

- [x] 3.1 Run focused tests, shuffled app tests for touched files, app typecheck, OpenSpec validation, and code-quality ratchet; verify all pass or document unrelated failures
  - Task 7 evidence (2026-09-20): the complete touched-test suite passed in one command (`18` files, `168` tests). The shuffled app suite started with seed `1789927667745`, emitted no useful output for 30 seconds after startup, and was interrupted with exit `130` per the verification brief. App typecheck, repository lint, and the code-quality ratchet passed; lint initially exposed and then cleared a stale unused import in the touched Your Ring test. `pnpm format:check:changed` remains blocked by the existing formatting warning in `apps/myk9show/src/services/database/entries/secretary.replication.test.ts`. Review-tier classified the branch as `adversarial` because the task evidence reports are in the diff.
- [ ] 3.2 Open and merge the reviewed PR with CI green, update MYK9-603 with audit/test evidence, and archive the change
