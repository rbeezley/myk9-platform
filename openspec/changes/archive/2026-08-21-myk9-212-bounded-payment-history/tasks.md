## 1. Bounded-query coverage

- [x] 1.1 Add focused tests for local-year UTC boundaries, invalid years, and stable year classification.
- [x] 1.2 Add hook tests proving every Stripe-order read uses a bounded range, continues across pages, and uses stable timestamp-plus-ID ordering.
- [x] 1.3 Add hook tests proving entry details, refund lookups, and owning-order lookups are chunked without losing refund rows.
- [x] 1.4 Add page tests proving selected years reach the server query while the all-time default and existing year selector remain honest.

## 2. Complete bounded retrieval

- [x] 2.1 Add a local-calendar-year query-range helper shared with the existing display-year contract.
- [x] 2.2 Page all-time and selected-year Stripe-order reads with a stable secondary order and no silent cap.
- [x] 2.3 Page refund-entry discovery, union older owning orders, and chunk all entry-ID follow-up reads.
- [x] 2.4 Keep the existing My Payments surface and populate its year choices from bounded date metadata when server-year scope is active.

## 3. Verification and delivery

- [x] 3.1 Run the focused payment-year, payment-hook, and My Payments page tests.
  - Verification: 75/75 focused assertions passed after merging current `main`, including selected-year metadata failure and Retry coverage.
- [x] 3.2 Run the full monorepo typecheck and lint because this changes a money-path data query.
  - Verification: `pnpm typecheck` completed 26/26 tasks and `pnpm lint` completed 14/14 tasks.
- [x] 3.3 Validate and verify `myk9-212-bounded-payment-history`, resolving critical findings.
  - Verification: OpenSpec validation passed. All four requirements map to bounded range/chunk code and focused tests; the implementation preserves the canonical page and follows the online-only design. No implementation-critical findings remain. PR/CI and post-merge tracking/archive remain required before closure.
- [x] 3.4 Open the MYK9-212 implementation PR; obtain independent review, required CI, and merge approval. (PR #1737; merge `78d2e0ec6ac35e4b7c1630ee2bad85d5c602a773`.)
- [x] 3.5 After merge, update MYK9-212 and the batch plan, sync/archive the OpenSpec change, and clean up its branch/worktree. (Linear moved to Done with verification and merge evidence; archive and cleanup complete in this maintenance change.)
