## 1. Behavior

- [x] 1.1 Add the authorized **Add a new trial** entry to the existing show Actions menu.
- [x] 1.2 Derive first/another and day-scoped next-trial wording from current show trials.
- [ ] 1.3 Replace stored generated names with an explicit `nameOverride`; derive generated labels from current same-show trials and draft ordering.
- [ ] 1.4 Use one effective-name helper for the wizard field, duplicate validation, preview/transform, and save payloads; allow clearing an override to restore the suggested name.
- [ ] 1.5 Version and migrate persisted wizard drafts, preserving custom labels and recognizing only exact legacy generated weekday labels.

## 2. Testing

- [ ] 2.1 Add focused tests for migration, custom-name override/reset, generated date moves, add/remove/reorder, different days, save payloads, local timezone boundaries, and current snapshots.
- [ ] 2.2 Run focused Vitest, relevant typecheck, changed-file lint, code-quality ratchet, and shuffled app suite.

## 3. Delivery

- [x] 3.1 Validate the OpenSpec artifacts and implementation against MYK9-693.
- [ ] 3.2 Commit, push, open a PR, resolve adversarial review findings, and verify required CI.

## Verification Evidence

- OpenSpec strict validation passed.
- Focused shuffled Vitest passed: 4 files, 46 tests.
- App/test TypeScript phases, changed-file lint, and code-quality ratchet passed.
- The broad shuffled suite was stopped at the repository 60-second limit; its only observed failures were five localhost-bind `EPERM` sandbox failures in `loadStaffPreflight.test.ts`. The same five tests passed 5/5 with the required localhost permission.
