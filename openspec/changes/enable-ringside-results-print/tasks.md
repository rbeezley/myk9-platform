## 1. Regression and implementation

- [x] 1.1 Add an assertion-first page/header-shim render test on the default Pending tab proving Results Sheet is enabled when `classInfo.completedEntries` is greater than zero; cover zero completed entries and combined A/B context.
- [x] 1.2 Gate Results Sheet availability from the canonical class-level completed count rather than the active tab's filtered rows, without changing other print actions.

## 2. Verification and delivery

- [x] 2.1 Run focused package tests, relevant build/typecheck, and `pnpm qa:code-quality-ratchet` if an existing file grows.
- [ ] 2.2 Validate the OpenSpec change and complete at least two adversarial Luna review lenses, addressing all findings.
- [ ] 2.3 Open the MYK9-674 pull request, wait for required CI, and merge only with separate authorization.
