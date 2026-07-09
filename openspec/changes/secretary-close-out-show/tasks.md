## 1. Inventory And Helper Design

- [x] 1.1 Confirm existing Show Desk closeout, Reports, Results Control, and Submit Results surfaces remain the canonical closeout path.
- [x] 1.2 Add pure helper logic for closeout readiness/blocker copy and cascade target selection.

## 2. Close Out Show Implementation

- [x] 2.1 Add a Show Desk closeout action component that renders ready/concern/closed/failure states.
- [x] 2.2 Wire the action into `ShowWorkbenchShowDeskPage` using existing show, trial, class, entry, submission, and incident state.
- [x] 2.3 Cascade closeout through replicated show, trial, and class update APIs, filtering already completed/cancelled rows.

## 3. Tests And Verification

- [x] 3.1 Add unit tests for closeout readiness and cascade target helper behavior.
- [x] 3.2 Add component/page tests proving the Close Out Show action renders, confirms with concerns, calls replicated mutations, and handles failures.
- [x] 3.3 Run focused Vitest coverage for the changed closeout files.
- [x] 3.4 Run TypeScript/typecheck or a narrower compile check if the implementation touches shared types.
- [x] 3.5 Run `pnpm openspec validate --changes secretary-close-out-show`.

## 4. Tracking And Shipping

- [x] 4.1 Update secretary responsibility coverage and verification plan docs with S8.4 implementation evidence.
- [x] 4.2 Commit the implementation and OpenSpec artifacts.
- [ ] 4.3 Push the branch, create a PR, and include `Tracked in openspec change: secretary-close-out-show`.
- [ ] 4.4 Review/CI/merge before archive; do not archive this change until the implementation PR is merged.
