## 1. Assertion-First Tests

- [x] 1.1 Add a transformer test that expects an unresolved selected class to be refused by name before persistence, run it red on `main`, and retain the failing output as evidence
- [x] 1.2 Add a clone-plus-organization-switch test that expects the change to be blocked while cloned classes remain and allowed after they are cleared; verify it fails before implementation

## 2. Integrity Guards

- [x] 2.1 Replace `Unknown` sentinel writes with registry-aware preflight validation over the complete selected class set; verify no persistence mutation starts on invalid input and focused tests pass
- [x] 2.2 Block incompatible cloned organization changes with calm guidance back to the existing Classes step, keep registry fields read-only in Class Management, and verify recovery/render tests pass
- [x] 2.3 Run and record the read-only live-data query for `Unknown` rows without mutating them; leave any repair as an explicit Richard-owned operator action

## 3. Verification and Delivery

- [x] 3.1 Run focused tests, app typecheck, OpenSpec validation, code-quality ratchet, and the full validation ladder; verify all required commands pass or document unrelated failures
- [ ] 3.2 Open and merge the reviewed PR with CI green, record the class-editor consolidation decision on MYK9-604, and archive the change only after evidence is complete
