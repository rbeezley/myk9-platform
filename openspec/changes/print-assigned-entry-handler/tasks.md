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
  - Limitation: the shuffled app suite started with seed `1789927667745`, emitted no useful output for 30 seconds after startup, and was interrupted with exit `130`; it was not a passing run. The isolated branch lacks the active change's `.openspec.yaml`, proposal, design, and spec artifacts. `pnpm openspec validate print-assigned-entry-handler --type change --json` was attempted and exited `1` because the change had no delta specs.
- [ ] 3.3 Open and merge the reviewed PR with CI green, update MYK9-603 with audit/test evidence, and archive the change
