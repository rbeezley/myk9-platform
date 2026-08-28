## 1. Provider and Client Alignment

- [x] 1.1 Add a failing regression test that proves routed content must resolve the configured application client and that no nested application provider shadows it; verify the focused test fails before implementation
- [x] 1.2 Remove the private client/provider from `App` and move startup prefetch ownership to `QueryProvider`; verify the provider regression test passes
- [x] 1.3 Change Data Settings, class start-time editing, and trial-management dialogs to use the contextual client; verify focused component tests observe clear/invalidation on the injected active client
- [x] 1.4 Correct `useReportData` documentation to identify the active configured default and verify its focused tests still pass

## 2. Failure Monitoring

- [x] 2.1 Add a routed-query test that executes a real opted-in rejection and asserts monitored failure capture receives the error and query key
- [x] 2.2 Add coverage that an unmarked rejected query does not use the opt-in capture path, then verify both monitoring scenarios pass
- [x] 2.3 Isolate provider tests by clearing the singleton cache, restoring capture mocks, and cleaning startup timers between cases; verify the tests pass repeatedly without leaked state

## 3. Verification and Delivery

- [x] 3.1 Run focused query-provider, cache-consumer, and report-data tests; record passing commands
- [x] 3.2 Run the myK9Show TypeScript check and the relevant app build or broader test gate; record any unrelated failure plainly
- [x] 3.3 Validate the OpenSpec change, review the diff for scope and intent preservation, and complete implementation verification
- [ ] 3.4 Open the implementation PR with MYK9-249 acceptance criteria, testing evidence, risks, non-goals, and `Tracked in openspec change: myk9-249-query-client`; verify CI/review/merge gates before archive
- [ ] 3.5 After merge, update MYK9-249 with the implementation summary and evidence, move it to Done, archive the OpenSpec change, and complete branch/worktree cleanup

## Validation Profile

- Risk: high
- Validation: full
- Rationale: the configured query client is a shared application utility with broad routed call sites, so focused behavior tests must be backed by app typecheck/build and CI before merge.
