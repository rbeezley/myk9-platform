## 1. Assertion-first coverage

- [x] 1.1 Add a failing RoleManager assertion that the assignment query requests club identity and maps the exact club name onto its row. (Red: query selected only role data.)
- [x] 1.2 Add failing ledger assertions that a club-scoped row names its exact club in visible/accessibility text and remains searchable by that name, while Global and Show rows remain explicitly distinguishable. (Red: link remained “Club profile” and search retained all rows.)
- [x] 1.3 Add a failing interaction assertion that revoke confirmation repeats the target user, role, and exact club scope, plus an unresolved-club fallback assertion. (Red: confirmation omitted scope.)

## 2. Focused implementation

- [x] 2.1 Extend the existing assignment read and `UserRole` view model with the joined club identity without adding a second query or surface.
- [x] 2.2 Derive one exact scope descriptor for table access, visible/accessibility text, and pending revoke context while preserving Global and Show distinctions.
- [x] 2.3 Expand the existing revoke confirmation to repeat user, role, and scope without changing revoke authorization or mutation behavior.

## 3. Local verification

- [x] 3.1 Run the focused RoleManager and RoleAssignmentsPanel tests and record the green result. (26/26 passed.)
- [x] 3.2 Run `pnpm --filter @myk9/show typecheck`, `pnpm --filter @myk9/show lint`, `git diff --check`, and OpenSpec validation. (All exited 0; OpenSpec valid.)
- [x] 3.3 Verify implementation completeness, correctness, and coherence against all OpenSpec artifacts; fix critical findings and straightforward warnings. (All three scenarios mapped to focused tests; no local implementation findings remain.)
- [x] 3.4 Commit the locally verified change on its dedicated feature branch without pushing or mutating Linear. (The normal command hook was blocked by an unrelated primary-checkout MYK9-228 dependency failure; the already-green staged tree was recorded directly through Git plumbing.)

## 4. Delivery and closure gates

- [ ] 4.1 With shared-system approval, push the branch, open a PR linked to MYK9-163, pass independent review and CI, and merge.
- [ ] 4.2 After merge, replay `/admin/permissions?tab=assignments` and its revoke confirmation as a site admin at 1440×900 and 768×1024; record visible/accessibility scope evidence in the private ledger.
- [ ] 4.3 Post PR, checks, hosted browser evidence, risks, and acceptance results to MYK9-163; move it to Done only if every closure checkbox passes.
- [ ] 4.4 Update `docs/plan-linear-backlog-batches.md`, rerun MYK9-57’s shared permissions-page closure replay, sync/archive the OpenSpec change, and perform branch/worktree cleanup.
