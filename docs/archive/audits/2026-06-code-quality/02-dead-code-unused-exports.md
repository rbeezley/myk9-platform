# 02 Dead Code And Unused Exports

Finder: subagent `019eb9d2-1f4b-7133-b146-d2225ff61913`
Status: Phase 1 inventory complete; initial Phase 2 liveness verification recorded in `09-phase-2-verification.md`.

## Tooling

`knip` was unavailable:

```text
pnpm exec knip --version
ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "knip" not found

npx --no-install knip --version
npx canceled due to missing packages: ["knip@6.16.1"]
```

Fallback: targeted `rg` across `apps`, `packages`, `supabase/functions`, and docs; route/App/registry checks for page candidates; `wc -l` for candidate files.

## Findings

| Symbol/File | Severity | Evidence | Verification | Proposed Fix | Notes |
| --- | --- | --- | --- | --- | --- |
| `apps/myk9show/src/lib/lazyLoading.ts` | P2 | No imports or external references to exported lazy-loading utilities; 341 self-contained lines. | Phase-2 confirmed dead | Delete module in Wave A. | Similar names in `hooks/useLazyLoading.ts` and performance hooks are separate/live. |
| `apps/myk9show/src/hooks/queries/usePaginatedQueries.ts` | P2 | Only production reference is the candidate-dead `lib/lazyLoading.ts` preloader; exports otherwise tests-only. | Phase-2 confirmed tests-only through dead preloader | Delete file and test in Wave A. | 543-line old query optimization layer. |
| `apps/myk9show/src/hooks/queries/useOptimizedSearch.ts` | P2 | Only production reference is candidate-dead `lib/lazyLoading.ts`; symbols otherwise tests-only. | Phase-2 confirmed tests-only through dead preloader | Delete or consolidate into live search hooks. | Live search appears in `hooks/useGlobalSearch.ts` and database query hooks. |
| `apps/myk9show/src/services/entryService.ts` / `markInRing` | P2 | `markInRing` has no direct app caller found; type/schema audit also found it writes `{ status }` to nonexistent `entries.status`. | Phase-2 confirmed dead/schema-drift | Delete file/function in Wave A; future in-ring work should use a replication-backed adapter. | Cross-reference: type-escape/schema-drift audit. |
| Demo/test pages: `ScoringDemoPage.tsx`, `SyncDashboardDemoPage.tsx`, `OfflineTestPage.tsx`, `TestPanelPage.tsx`, `admin/PermissionTestPage.tsx`, `ShowTemplateTestPage.tsx` | P3 | No active route/import references; docs already mention deleting/hiding several. | Phase-2 confirmed unreachable | Delete unreachable demo/test pages. | `RBACTestPage` and `TemplateTestingPage` were not flagged because both are routed. |
| `apps/myk9show/src/components/forms/OptimisticForm.tsx` | P3 | No imports/re-exports of form components; only self references. | Phase-2 confirmed unused wrapper | Delete component file. | `useOptimisticForm` hook is separate/live. |
| Unused sync UI panels: `GlobalSyncStatusBar.tsx`, `QueueManagementPanel.tsx`, `SyncIntegrationSummary.tsx` | P3 | No consumers outside own files; not exported from `components/sync/index.ts`; 1,163 total lines. | Phase-2 confirmed unused | Delete unused panels. | Main sync dashboard remains routed via `/admin/sync` to `SyncMonitoringPage`. |
| `apps/myk9show/src/config/performance-budget.ts` | P3 | No app imports; separate live budget logic exists in scripts and RUM constants. | Phase-2 confirmed dead | Delete or consolidate if intended canonical source. | One docs mention only. |
| `supabase/functions/send-notification/index.ts` | P2 | No source caller/invoke found; overlaps current send-email/registration/results flows. | needs-human deployed-usage verification | Check deployed function usage/logs/config, then delete or mark deprecated. | Source grep cannot prove external edge function usage. |

## Refuted

| Candidate | Reason |
| --- | --- |
| `useArmbandStore` | Dynamically loaded by `StoreProvider` and referenced in store dependency metadata. |
