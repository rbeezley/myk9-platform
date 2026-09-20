## 1. Behavior

- [x] 1.1 Pair the late-entry URL hint with the non-exhibitor workflow role before disabling capacity checks.
- [x] 1.2 Preserve organizer late-entry behavior and all unrelated entry-close logic.

## 2. Testing

- [x] 2.1 Add a named unit test proving an exhibitor with `?source=show-desk&entryMode=late` still gets the capacity check, plus organizer coverage.
- [x] 2.2 Run focused Vitest, relevant typecheck, changed-file lint, and code-quality ratchet.

## 3. Delivery

- [x] 3.1 Validate the OpenSpec artifacts and implementation against MYK9-670.
- [ ] 3.2 Commit, push, open a PR, resolve adversarial review findings, and verify required CI.
