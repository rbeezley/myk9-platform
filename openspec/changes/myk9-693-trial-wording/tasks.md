## 1. Behavior

- [x] 1.1 Add the authorized **Add a new trial** entry to the existing show Actions menu.
- [x] 1.2 Derive first/another and day-scoped next-trial wording from current show trials.
- [x] 1.3 Replace stored generated names with an explicit `nameOverride`; derive generated labels from current same-show trials and draft ordering.
- [x] 1.4 Use one effective-name helper for the wizard field, duplicate validation, preview/transform, and save payloads; allow clearing an override to restore the suggested name.
- [x] 1.5 Version and migrate persisted wizard drafts, preserving custom labels and recognizing only exact legacy generated weekday labels.
- [x] 1.6 Create one wizard-level view context from current drafts and the current same-show persisted snapshot; include id-keyed effective names, persisted count, and show-level trial presence.
- [x] 1.7 Require that context in validation, step content, and save actions; use it for card headings, validation messages, add-trial copy, class/review labels, and saved names.

## 2. Testing

- [x] 2.1 Add focused tests for migration, custom-name override/reset, generated date moves, add/remove/reorder, different days, save payloads, local timezone boundaries, and current snapshots.
- [ ] 2.2 Run focused Vitest, relevant typecheck, changed-file lint, code-quality ratchet, and shuffled app suite.
- [x] 2.3 Add UI coverage that the field, card heading, and validation banner share the same effective name, and that trials on any existing show day select “Add Another Trial” copy.

## 3. Delivery

- [x] 3.1 Validate the OpenSpec artifacts and implementation against MYK9-693.
- [ ] 3.2 Commit, push, open a PR, resolve adversarial review findings, and verify required CI.

## Verification Evidence

- Structural design and tasks were updated before implementation; implementation tasks 1.3–1.5 and focused test task 2.1 are complete.
- Adversarial review found divergent validation/card labels and day-scoped first/another copy; the required page-created `WizardTrialView` is the structural correction and is recorded above before implementation.
- This correction updates the evidence: focused shuffled Vitest passed 12 files / 88 tests, app-source and test-source TypeScript checks passed, targeted ESLint passed, and the code-quality ratchet and changed-file formatting check passed.
- Focused shuffled Vitest passed: 9 files, 72 tests. App-source TypeScript check, targeted ESLint, changed-file formatting check, and code-quality ratchet passed.
- The full shuffled app suite was stopped after more than 30 seconds without useful output, per repository guidance. Before stalling it reported five failures in untouched `src/test/load/loadStaffPreflight.test.ts` and two failures in untouched `src/test/config/devServerWatch.test.ts`; it did not produce a final summary. The app-wide `pnpm typecheck` reached E2E typecheck but that phase failed to create the tsx IPC socket (`EPERM`) in the sandbox. App-source `tsc --noEmit --project tsconfig.app.json --incremental false` passed separately.
- Task 2.2 remains open pending a clean full shuffled suite and broader CI verification. Task 3.2 remains open pending review and required CI.
