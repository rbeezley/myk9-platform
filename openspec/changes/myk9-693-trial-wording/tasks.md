## 1. Behavior

- [x] 1.1 Add the authorized **Add a new trial** entry to the existing show Actions menu.
- [x] 1.2 Derive first/another and day-scoped next-trial wording from current show trials.

## 2. Testing

- [x] 2.1 Add focused tests for the Actions menu, day-scoped numbering (including custom names and date changes), latest trial snapshots, and zero/one/multiple/different-day trials.
- [x] 2.2 Run focused Vitest, relevant typecheck, changed-file lint, and code-quality ratchet.

## 3. Delivery

- [x] 3.1 Validate the OpenSpec artifacts and implementation against MYK9-693.
- [ ] 3.2 Commit, push, open a PR, resolve adversarial review findings, and verify required CI.

## Verification Evidence

- OpenSpec strict validation passed.
- Focused shuffled Vitest passed: 4 files, 46 tests.
- App/test TypeScript phases, changed-file lint, and code-quality ratchet passed.
- The broad shuffled suite was stopped at the repository 60-second limit; its only observed failures were five localhost-bind `EPERM` sandbox failures in `loadStaffPreflight.test.ts`. The same five tests passed 5/5 with the required localhost permission.
