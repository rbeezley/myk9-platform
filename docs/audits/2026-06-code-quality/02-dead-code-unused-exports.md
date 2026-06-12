# 02 Dead Code And Unused Exports

Finder: subagent `019eb9d2-1f4b-7133-b146-d2225ff61913`
Status: Phase 1 inventory complete; all candidates need Phase 2 verification before deletion.

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
| `apps/myk9show/src/lib/lazyLoading.ts` | P2 | No imports or external references to exported lazy-loading utilities; 341 self-contained lines. | finder candidate; Phase-2 pending liveness proof | Delete module after independent grep verification. | Similar names in `hooks/useLazyLoading.ts` and performance hooks are separate/live. |
| `apps/myk9show/src/hooks/queries/usePaginatedQueries.ts` | P2 | Only production reference is the candidate-dead `lib/lazyLoading.ts` preloader; exports otherwise tests-only. | finder candidate; Phase-2 pending liveness proof | Delete file and test after confirming no planned consumer. | 543-line old query optimization layer. |
| `apps/myk9show/src/hooks/queries/useOptimizedSearch.ts` | P2 | Only production reference is candidate-dead `lib/lazyLoading.ts`; symbols otherwise tests-only. | finder candidate; Phase-2 pending liveness proof | Delete or consolidate into live search hooks. | Live search appears in `hooks/useGlobalSearch.ts` and database query hooks. |
| Demo/test pages: `ScoringDemoPage.tsx`, `SyncDashboardDemoPage.tsx`, `OfflineTestPage.tsx`, `TestPanelPage.tsx`, `admin/PermissionTestPage.tsx`, `ShowTemplateTestPage.tsx` | P3 | No active route/import references; docs already mention deleting/hiding several. | candidate | Delete unreachable demo/test pages. | `RBACTestPage` and `TemplateTestingPage` were not flagged because both are routed. |
| `apps/myk9show/src/components/forms/OptimisticForm.tsx` | P3 | No imports/re-exports of form components; only self references. | candidate | Delete component file. | `useOptimisticForm` hook is separate/live. |
| Unused sync UI panels: `GlobalSyncStatusBar.tsx`, `QueueManagementPanel.tsx`, `SyncIntegrationSummary.tsx` | P3 | No consumers outside own files; not exported from `components/sync/index.ts`; 1,163 total lines. | candidate | Delete unused panels. | Main sync dashboard remains routed via `/admin/sync` to `SyncMonitoringPage`. |
| `apps/myk9show/src/config/performance-budget.ts` | P3 | No app imports; separate live budget logic exists in scripts and RUM constants. | candidate | Delete or consolidate if intended canonical source. | One docs mention only. |
| `supabase/functions/send-notification/index.ts` | P2 | No source caller/invoke found; overlaps current send-email/registration/results flows. | needs-human; Phase-2 pending deployed-usage verification | Check deployed function usage/logs/config, then delete or mark deprecated. | Source grep cannot prove external edge function usage. |

## Refuted

| Candidate | Reason |
| --- | --- |
| `useArmbandStore` | Dynamically loaded by `StoreProvider` and referenced in store dependency metadata. |
