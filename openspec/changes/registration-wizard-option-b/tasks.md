## 1. Deletions (separate commit)

- [x] 1.1 Delete `PaymentReconciliation.tsx` and `src/test/components/phase3-5-payment-components.test.tsx`; verify `grep -rn PaymentReconciliation apps/myk9show/src` is empty and `pnpm typecheck` passes
- [x] 1.2 Delete `OfflineClassSelectionStep.tsx`, `hooks/useOfflineEntryCreation.ts`, and lines 30-38 of `services/entries/index.ts` (the hook and component re-exports); verify no importer remains and `pnpm typecheck` passes
- [x] 1.3 Remove `secretary_existing` from `WORKFLOW_CONFIGS` and the `WorkflowMode` union; verify `pnpm typecheck` passes and `registrationSecretaryMobile.test.ts` / `registrationStepsMobile.test.ts` no longer reference deleted files (remove those assertions)

## 2. Stepper

- [x] 2.1 Write the failing geometry test in `src/test/e2e/registration/wizardVisualQA.spec.ts`: widths [390, 1024, 1100, 1280, 1440] × variants [exhibitor route, secretary route] × every step title → exactly one line rect and no intra-word split; include the known-answer probe that proves the harness detects a 2-line element; run it and confirm it fails on current `main` at 1024
- [x] 2.2 Rewrite `HorizontalProgressIndicator.tsx` as the numbered rail (single title, truncate, no pill, no description, connector as a pseudo-element, `aria-current` + name suffixes + progressbar preserved); verify the existing indicator unit tests plus new tests for truncation and a11y names pass
- [x] 2.3 Update `ALL_STEP_DEFINITIONS` titles (`Select dogs`, `Select classes`, `Handlers`, `Payment`, `Receipt` — keep the INTENT comment) and drop `description` from both wizards' step types; verify `pnpm typecheck` and the show-creation wizard renders in `show-creation-wizard-detailed.spec.ts`
- [x] 2.4 Re-run 2.1 and confirm it passes at every width in both variants

## 3. Entries panel

- [x] 3.1 Write `EntriesPanel.helpers.ts` with `groupCartByDogAndDay` and its unit test using the real cart-item id shape (dogId:classId, trial day from the class's trial) — assertion-first, red then green
- [x] 3.2 Build `EntriesPanel.tsx` (desktop aside: per-dog, per-day rows, entry-fee total, "no classes yet", pre-payment service-fee note; payment variant adds subtotal / service fee / total due via `calculatePlatformFeeCents`) and a unit test that the payment-variant total equals `PaymentSummaryCard`'s for the same inputs
- [x] 3.3 Add the `aside` slot to `RegistrationWizardShell` and mount the panel from `RegistrationWizardPage` on every step except `confirmation`; verify `RegistrationWizardShell.test.tsx` passes and both files stay under 500 lines
- [x] 3.4 Remove `DogCartSummary` and `OverallCartSummary` from `ClassSelectionStep` and their tests; re-point any `data-testid` used by `wizardVisualQA.spec.ts`; verify the class-step tests pass and the total appears once (spec scenario "Only one place shows the total")
- [x] 3.5 Retire `PaymentSummaryCard` in favour of the panel on the payment step, moving the fee-line list (with remove) into the panel; verify the `PaymentStep/__tests__` totals tests pass unchanged
- [x] 3.6 Phone bottom bar: below `md` the panel renders fixed at the bottom with count/total, Details disclosure, and the `WizardNavigation` buttons; content gets bottom padding from a CSS variable; verify at 390 in `wizardVisualQA.spec.ts` that the last chip is not overlapped and that Details expands the list

## 4. Payment fixes and cart expiry

- [x] 4.1 `commitLabels.test.ts`: assert the check label reads `Submit — bring check to show` (red), then change `commitLabels.ts` (green)
- [x] 4.2 Replace the `Check` icon on the check option in `PaymentMethodSelector.tsx` with `FileText`; verify the selector test renders no check-mark glyph for an unselected check option
- [x] 4.3 Wrap the fee-line remove in `RegistrationSummary` / the panel with the existing confirm primitive naming the class; add tests for cancel (unchanged) and confirm (line removed)
- [x] 4.4 Add `CartExpiryNotice` reading `cartStore.expirationWarning` into the panel with `role="status"`; unit test the warning and expired states by seeding the store

## 5. Verification

- [ ] 5.1 Run the targeted suites shuffled: `pnpm vitest run --sequence.shuffle` for the wizard, indicator, cart and payment tests, six times because the panel reads a module-scope store; record EXIT codes to `.logs/`
- [ ] 5.2 `pnpm typecheck`, `pnpm lint`, and `pnpm qa:code-quality-ratchet` from the worktree; fix any file over 500 lines by extracting a sibling module
- [ ] 5.3 `pnpm test:e2e -- wizardVisualQA` plus a manual walk at 390 and 1440 on the exhibitor route and 1024 on the secretary route; attach screenshots of both wizards' steppers to the PR
- [ ] 5.4 Verify the commit boundary by test: `submitPaymentStep` is still invoked only from the Payment step's commit control and `entryCloseGuard`'s recovery route test still passes

## 6. Ship

- [ ] 6.1 Open the PR per `.github/pull_request_template.md` with MYK9-483, the checked ACs, screenshots, non-goals and the three follow-up issues to file (reload resume, judge-day "Full" reason, `in_progress` class entry)
- [ ] 6.2 Run `pnpm qa:codex-review` (`--base origin/main`) and post the review-gate comment; `bash scripts/qa/watch-pr-checks.sh <pr>` returns 0
- [ ] 6.3 Merge with `gh pr merge --squash` from the main repo directory; confirm a green production build on `main`; comment on MYK9-483 with what changed, checks run, PR link, and tick the remaining ACs; then `/opsx:archive`
