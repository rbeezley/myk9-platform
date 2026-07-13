## 1. Freeze and Pin Existing Contracts

- [x] 1.1 Inventory existing coverage for all ten Plan 007 invariants and record which cases already have a public-API assertion.
- [x] 1.2 Add only the missing `MutationManager` public-API pinning tests for sequence seeding/order, OCC no-resurrection, deferred upload, backups, duplicate-key success, Web Locks fallback, and lifecycle event details; deliberately break and restore an invariant when needed to prove a new assertion bites.
- [x] 1.3 Add or confirm `ReplicatedTable` public-API pins for dirty-row protection and forward-only/no-op reconciliation without editing existing behavior expectations.
- [x] 1.4 Run `pnpm --filter @myk9/replication build`, `cd packages/replication && pnpm test`, `pnpm typecheck`, `pnpm lint`, and `cd apps/myk9show && pnpm test`; stop if any existing test needs editing, then obtain root-agent diff acceptance and commit the green Phase 0 checkpoint. Full myK9Show produced no output for 60 seconds and was stopped per repository rules; user approved substituting 17 focused replication-consumer files (453 tests), all green on 2026-07-12.

## 2. Extract Pure Mutation Modules

- [x] 2.1 Move `executeMutation`, duplicate-primary-key classification, and `MutationExecutionResult` verbatim into internal `mutation-execute.ts`, parameterizing only the Supabase client and logger dependencies.
- [x] 2.2 Move replicated-row synchronization and identifier-remap helpers verbatim into internal `mutation-row-sync.ts`, passing the database explicitly and preserving transaction boundaries and comments.
- [x] 2.3 Delegate from `MutationManager` without changing any public signature, package export, event contract, or existing test.
- [x] 2.4 Run the complete five-command phase gate, obtain root-agent diff acceptance against the frozen contracts, and commit the green Phase 1 checkpoint. Used the user-approved 17-file focused myK9Show replication-consumer substitute (453 tests) for the known hanging full-app suite.

## 3. Extract Mutation Queue Persistence

- [x] 3.1 Create internal `MutationQueueStore` with the sequence counter/seed state and the frozen queue persistence, lookup, retry/discard, reconciliation, clear, and clean-cache-eviction methods.
- [x] 3.2 Preserve facade orchestration order exactly: capacity check, persist, synchronous backup attempt with swallowed auxiliary errors, queued-event dispatch, and conditional upload scheduling.
- [x] 3.3 Delegate the existing public queue-store methods from `MutationManager` with byte-identical signatures and unchanged behavior comments.
- [x] 3.4 Run the complete five-command phase gate, obtain root-agent diff acceptance against the frozen contracts, and commit the green Phase 2 checkpoint. Used the user-approved 17-file focused myK9Show replication-consumer substitute (453 tests) for the known hanging full-app suite.

## 4. Extract Mutation Upload Orchestration

- [x] 4.1 Create internal `MutationUploadRunner` with upload/backoff timers, upload serialization state, scheduling, Web Locks wrapper, upload pass, and retry backoff; extract unchanged queue-overflow, upload-complete, and sync-failure event construction/dispatch plus adjacent upload-result summary logging into internal `mutation-upload-events.ts` so every new module remains below 500 lines.
- [x] 4.2 Inject the Supabase client, logger, retry settings, queue store, and facade-owned backup callback; do not introduce a collaborator-to-facade import cycle.
- [x] 4.3 Delegate upload methods and timer cleanup from `MutationManager`, preserving OCC re-read-before-put, retry behavior, event names/details, and all incident-history comments.
- [x] 4.4 Run the complete five-command phase gate, obtain root-agent diff acceptance against the frozen contracts, and commit the green Phase 3 checkpoint. Used the user-approved 17-file focused myK9Show replication-consumer substitute (453 tests) for the known hanging full-app suite.

## 5. Extract ReplicatedTable Query and Row-Lock Seams

- [x] 5.1 Create internal `ReplicatedTableQueryManager<T>` using the established constructor-injection pattern and move `queryByField`, `queryIndex`, `getAll`, and `getAllLocalIds` with timeout, failure-recording, and fallback behavior unchanged.
- [x] 5.2 Create internal `RowLockRegistry` owning the row-lock map and expose `withRowLock(id, fn)`; update `optimisticUpdate` to use it without changing lock semantics.
- [x] 5.3 Keep CRUD, conflict lifecycle, mutation glue, protected hooks, and app-side `Replicated*Table` subclasses unchanged.
- [x] 5.4 Run the complete five-command phase gate, obtain root-agent diff acceptance against the frozen contracts, and commit the green Phase 4 checkpoint. Used the user-approved 17-file focused myK9Show replication-consumer substitute (453 tests) for the known hanging full-app suite.

## 6. Verify the Decomposition

- [x] 6.1 Compare `MutationManager` public signatures, `ReplicatedTable` public/protected signatures, package barrel exports, and the four lifecycle event contracts against the pre-change source. Signature-line diff and barrel diff against `80aad6d2e` were empty; all four event names and detail shapes match their original blocks.
- [x] 6.2 Verify moved incident-history comments and spot-check `nextSequenceNumber` and the OCC rejection path against their original ordering and transaction semantics. Both blocks retain their comments and statement order; only collaborator/class references changed.
- [x] 6.3 Confirm every new production module is below 500 lines, `MutationManager.ts` is 500 lines or fewer, and `ReplicatedTable.ts` is 1,000 lines or fewer without extracting backup/restore or conflict orchestration; record the verified measurements and why the original planning estimates were revised. Verified: facade 494, base class 959, new modules 498/310/213/166/156/65/40 lines; artifact amendment records the stale-estimate rationale.
- [x] 6.4 Run the final complete five-command gate and `pnpm openspec validate replication-core-split --type change --strict --no-interactive`; record exact pass counts, stop and report any suite that hangs beyond the repository limit, and document any repository-known skipped checks. Green: replication build; 31 files/443 package tests; 26/26 typecheck tasks; 14/14 lint tasks; approved substitute 17 files/453 myK9Show consumer tests; strict OpenSpec validation. The full myK9Show suite remains skipped because it previously produced no output for 60 seconds and the user approved the focused substitute.

## 7. Tracking, Review, and Merge Gate

- [x] 7.1 Update `OPEN-TODOS.md`, Plan 007 status, and `docs/improve-audit-2026-07-11/README.md` only after implementation verification proves the work complete.
- [x] 7.2 Review the complete diff for spec compliance, scope, offline durability, file size, TypeScript correctness, and unchanged consumer contracts; resolve all critical/high findings and straightforward medium findings. Independent spec and standards reviews found no behavior or contract defect; corrected the Plan status, and recorded the Plan-approved exception for the pre-existing oversized template base class.
- [ ] 7.3 Commit remaining verified tracking changes, push the feature branch, and open a PR containing `Tracked in openspec change: replication-core-split` plus the full test evidence.
- [ ] 7.4 Require CI success and completed review before merge; merge only with user approval, then archive the OpenSpec change and perform branch/worktree cleanup.
