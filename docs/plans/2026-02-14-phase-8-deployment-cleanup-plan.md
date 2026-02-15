# Phase 8: Deployment & Cleanup — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy both monorepo apps to Vercel staging and reduce myK9Show's tsconfig exclusion list from 135 entries to under 50.

**Architecture:** Both apps deploy as Vite SPAs on Vercel, built via Turborepo. They share the unified `myk9-platform` Supabase backend. No custom domains in this phase — Vercel auto-generated staging URLs only.

**Tech Stack:** Vercel, Vite, Turborepo, Supabase, TypeScript strict mode

**Design doc:** `docs/plans/2026-02-14-phase-8-deployment-cleanup-design.md`

---

## Task 1: Update myK9Q vercel.json Build Command

**Files:**
- Modify: `apps/myk9q/vercel.json`

**Step 1: Add Turbo build command to vercel.json**

Add `buildCommand`, `outputDirectory`, and `framework` fields to match myK9Show's config:

```json
{
  "buildCommand": "cd ../.. && npx turbo build --filter=@myk9/q",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    ...existing...
  ],
  "headers": [
    ...existing...
  ]
}
```

**Step 2: Verify build works locally**

Run: `pnpm build:q`
Expected: Build succeeds, output in `apps/myk9q/dist/`

**Step 3: Commit**

```bash
git add apps/myk9q/vercel.json
git commit -m "chore(myk9q): add Turbo build command to vercel.json"
```

---

## Task 2: Create Vercel Projects (Manual — User Action)

This task is performed by the user in the Vercel dashboard. Claude assists by providing exact settings.

**myK9Show project:**
1. Go to vercel.com/new
2. Import `rbeezley/myk9-platform`
3. Settings:
   - Project Name: `myk9show`
   - Framework Preset: Vite
   - Root Directory: `apps/myk9show`
4. Environment Variables:
   - `VITE_SUPABASE_URL` = `https://sojmvhhwsjxmfistvzbe.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = (from Supabase dashboard → Project Settings → API → anon public key)
   - `VITE_APP_ENVIRONMENT` = `staging`
5. Click Deploy

**myK9Q monorepo project:**
1. Go to vercel.com/new
2. Import `rbeezley/myk9-platform`
3. Settings:
   - Project Name: `myk9q-monorepo`
   - Framework Preset: Vite
   - Root Directory: `apps/myk9q`
4. Environment Variables:
   - `VITE_SUPABASE_URL` = `https://sojmvhhwsjxmfistvzbe.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = (same key as above)
   - `VITE_ENVIRONMENT` = `staging`
5. Click Deploy

**Step: Verify both deployments succeed**

Check Vercel dashboard — both projects should show a successful build. Record the auto-generated staging URLs (e.g., `myk9show-xxxxx.vercel.app`, `myk9q-monorepo-xxxxx.vercel.app`).

---

## Task 3: Smoke Test Staging Deployments (Manual — User Action)

For each staging URL, verify:

| Check | How | Expected |
|-------|-----|----------|
| App loads | Open URL in browser | No blank page, UI renders |
| No JS errors | Open DevTools → Console | No red errors |
| Supabase connects | Try sign-up or sign-in | Auth flow works |
| SPA routing | Click between pages, then refresh | Page renders (not 404) |
| Service worker | DevTools → Application → Service Workers | SW registered |
| Security headers | DevTools → Network → Response Headers | CSP, X-Frame-Options present |

Report any failures. Fix code issues and push to `main` to trigger redeployment.

---

## Task 4: tsconfig Exclusion Audit — Batch 1: Sync & Conflict Services

Audit the sync, conflict, and realtime services. These are the largest exclusion group (~30 entries).

**Files:**
- Modify: `apps/myk9show/tsconfig.app.json`
- Potentially delete: Multiple files under `src/services/sync/`, `src/services/conflict/`, `src/services/realtime/`, `src/components/sync/`, `src/components/conflict/`
- Potentially delete: Related hooks (`useBackgroundSync.ts`, `useFieldLevelSync.ts`, `useRegistrationConflicts.ts`, `useConflictResolution.ts`, `useOptimisticUpdates.ts`)

**Step 1: Check for consumers of each excluded file**

For each file, search the codebase for imports. Use `grep` for the filename (without extension) across `src/`. Exclude the file itself and test files from results.

**Decision criteria:**
- **No imports found → Delete** the file
- **Has imports from other excluded files only → Delete** the entire chain if none are imported by non-excluded code
- **Has imports from non-excluded files → Keep excluded** (document reason) or **Fix and un-exclude** if errors are minor

**Step 2: Delete dead files**

Remove files with no consumers. Run `pnpm typecheck` after each batch deletion to verify no breakage.

**Step 3: Update tsconfig.app.json**

Remove deleted files from the exclude list. Keep entries for files that remain.

**Step 4: Run quality gate**

Run: `pnpm typecheck && pnpm lint`
Expected: Both pass clean.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore(myk9show): audit sync/conflict exclusions — delete dead code, reduce exclude list"
```

---

## Task 5: tsconfig Exclusion Audit — Batch 2: Performance & Monitoring

Audit performance monitoring, analytics, and deployment services (~20 entries).

**Files to audit:**
- `src/services/monitoring/ErrorTracker.ts`
- `src/services/monitoring/PerformanceBudgetService.ts`
- `src/services/performance/integrator/PerformanceIntegrator.ts`
- `src/services/performance/RealUserMonitoring.ts`
- `src/services/performance/realtimePerformanceMonitor.ts`
- `src/services/performance/uiPerformanceManager.ts`
- `src/services/performance/PerformanceIntegrator.ts`
- `src/services/performance/syncPerformanceOptimizer.ts`
- `src/services/performance/performanceIntegrationCoordinator.ts`
- `src/services/performance/integrator/PerformanceMonitoring.ts`
- `src/services/performance/integrator/index.ts`
- `src/services/deployment/CDNService.ts`
- `src/services/deployment/FeatureFlagService.ts`
- `src/services/deployment/ProductionMonitoringService.ts`
- `src/services/deployment/index.ts`
- `src/components/analytics/MonitoringDashboard.tsx`
- `src/components/analytics/AnalyticsDashboard.tsx`
- `src/components/analytics/UserActivityMonitor.tsx`
- `src/components/deployment/DeploymentDashboard.tsx`
- `src/components/deployment/CDNDashboard.tsx`
- `src/components/performance/ShowDetailsPerformanceMonitor.tsx`
- `src/components/performance/PerformanceMonitoringDashboard.tsx`
- `src/components/admin/PerformanceDashboard.tsx`
- `src/components/admin/LoadTestDashboard.tsx`
- `src/components/common/SearchPerformanceMonitor.tsx`
- `src/hooks/usePerformanceMonitoring.ts`
- `src/hooks/usePerformanceOptimization.ts`
- `src/hooks/optimized/usePerformanceMonitor.ts`
- `src/hooks/useCDN.ts`
- `src/utils/realtimeOptimization.ts`
- `src/utils/storage-benchmarking.ts`
- `src/utils/dev-cache-bypass.ts`

**Same process as Task 4:** Check consumers → delete dead files → update tsconfig → quality gate → commit.

```bash
git commit -m "chore(myk9show): audit performance/monitoring exclusions — delete dead code"
```

---

## Task 6: tsconfig Exclusion Audit — Batch 3: Components & UI

Audit excluded UI components (~25 entries).

**Files to audit:**
- `src/components/admin/permissions/BulkPermissionOperations.tsx`
- `src/components/admin/UserImpersonationDialog.tsx`
- `src/components/admin/DataLifecycleManagement.tsx`
- `src/components/alerts/AlertToast.tsx`
- `src/components/base/BulkActionsBar.tsx`
- `src/components/base/EntitySidebar.tsx`
- `src/components/common/LazyComponents.tsx`
- `src/components/common/StoreLoadingBoundary.tsx`
- `src/components/common/UnifiedSidebar.tsx`
- `src/components/common/ErrorBoundary.tsx`
- `src/components/dogs/enhanced/PaginatedDogsList.tsx`
- `src/components/dogs/enhanced/VirtualDogsList.tsx`
- `src/components/users/VirtualizedUserTable.tsx`
- `src/components/users/enhanced/**/*`
- `src/components/shows/VirtualizedEntryList.tsx`
- `src/components/shows/EnhancedEmptyStates.tsx`
- `src/components/shows/RegistrationWorkflow/DogSelectionStepEnhanced.tsx`
- `src/components/shows/RegistrationWorkflow/**/*`
- `src/components/classes/VirtualizedClassEntriesTable.tsx`
- `src/components/scoring/JudgeSyncDashboard.tsx`
- `src/components/scoring/OfflineScoringModeIndicator.tsx`
- `src/components/scoring/RealtimeScoringInterface.tsx`
- `src/components/scoring/format-specific/ConformationScoresheet.tsx`
- `src/components/templates/secretary/OrganizationSelector.tsx`
- `src/components/trials/TrialDetail/TrialClassesCards.tsx`
- `src/components/clubs/ClubDetails.tsx`
- `src/components/optimistic/**/*`
- `src/components/providers/ShowDataProvider.tsx`

**Same process:** Check consumers → delete dead → update tsconfig → quality gate → commit.

```bash
git commit -m "chore(myk9show): audit component exclusions — delete dead code"
```

---

## Task 7: tsconfig Exclusion Audit — Batch 4: Hooks, Services, Stores & Utils

Audit remaining excluded files (~30 entries).

**Files to audit:**
- Hooks: `useRBAC.ts`, `useRealTimeUpdates.ts`, `useSearchWorker.ts`, `usePushNotifications.ts`, `useRealtimeScoring.ts`, `useOptimisticUI.ts`, `useOptimisticRegistration.ts`, `useExistingEntries.ts`, `useDraftPersistence.ts`, `useBatchMutations.ts`, `useSimplifiedHooks.ts`, `useFormState.ts`, `usePageTransition.ts`, `useScoresheetCore.ts`, `useEntryNavigationHelpers.ts`, `useEntryNavigation.ts`
- Query hooks: `useTrialsDatabase.ts`, `useShowManagementDatabase.ts`, `useJudgeDatabase.ts`, `useSearchDatabase.ts`
- Services: `NotificationService.ts`, `entryService.ts`, `mockDataService.ts`, `error/GlobalErrorHandler.ts`, `error/ErrorClassificationService.ts`, `compression/CompressionService.ts`, `compression/CompressionIntegration.ts`, `database/connection.ts`, `database/storage-adapter-factory.ts`, `database/queries/judgeQueries.ts`, `database/queries/searchQueries.ts`, `database/queries/showManagementQueries.ts`, `database/queries/classQueries.ts`, `database/queries/judgeAssignmentQueries.ts`, `database/queries/index.ts`, `data-scoping/role-profiles.ts`, `mappers/searchMappers.ts`, `entries/OfflineEntryCreator.ts`
- Stores: `offlineScoringStore.ts` (appears twice — line 69 and 177), `compositions/StoreComposition.ts`
- Pages: `admin/permissions/SecurityDashboardPage.tsx`, `BrowseShowsPage.tsx`, `scoring/hooks/*`
- Context: `EnhancedAuthProvider.tsx`
- Providers: `StoreProvider.tsx`
- Routes: `utils/SuspenseWrapper.tsx`
- Utils: `encryption.ts`, `designTokens.ts`, `optimisticHelpers.ts`, `networkUtils.ts`
- Lib: (none remaining)

**Same process:** Check consumers → delete dead → update tsconfig → quality gate → commit.

```bash
git commit -m "chore(myk9show): audit remaining exclusions — hooks, services, stores, utils"
```

---

## Task 8: Exclusion Audit Summary & Documentation

After Tasks 4-7, compile the audit results.

**Files:**
- Modify: `apps/myk9show/tsconfig.app.json` (final cleanup of exclude list)
- Modify: `docs/DEFERRED-WORK.md` (update Section 1 with results)

**Step 1: Clean up tsconfig exclude list**

Remove any duplicate entries (e.g., `offlineScoringStore.ts` appears on lines 69 and 177). Remove entries for files that were deleted. Verify the remaining list has documented reasons.

**Step 2: Update DEFERRED-WORK.md**

Update Section 1 (Type/Schema Mismatches) with:
- How many files were deleted
- How many were un-excluded (fixed)
- How many remain excluded and why
- New total exclusion count

**Step 3: Run final quality gate**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: All pass clean.

**Step 4: Commit**

```bash
git add apps/myk9show/tsconfig.app.json docs/DEFERRED-WORK.md
git commit -m "docs: update exclusion audit results and deferred work tracking"
```

---

## Task 9: Update Project Documentation

**Files:**
- Modify: `docs/MIGRATION-PLAN.md` (lines 7-18: update Phase 7 and Phase 8 status)
- Modify: `docs/VERCEL-SETUP.md` (update with actual project names and staging URLs)
- Modify: `CLAUDE.md` (migration status checklist — mark Phase 7 complete, Phase 8 complete)

**Step 1: Update MIGRATION-PLAN.md**

Change Phase 7 status from "In Progress" to "Complete" with date. Change Phase 8 from "Pending" to "Complete" with date. Add summary of what was deployed.

**Step 2: Update VERCEL-SETUP.md**

Add the myK9Q monorepo section with actual project name (`myk9q-monorepo`), staging URL, and env vars. Update myK9Show section with staging URL if available.

**Step 3: Update CLAUDE.md migration checklist**

```markdown
- [x] Phase 7: Testing & Validation
- [x] Phase 8: Deployment & Cleanup
```

**Step 4: Commit**

```bash
git add docs/MIGRATION-PLAN.md docs/VERCEL-SETUP.md CLAUDE.md
git commit -m "docs: mark Phase 7 and Phase 8 complete, update deployment docs"
```

---

## Task 10: Final Cleanup

**Files:**
- Delete: `whats-next.md` (stale handoff doc, untracked)
- Modify: `MEMORY.md` (update current phase)

**Step 1: Delete stale files**

```bash
rm whats-next.md
```

**Step 2: Update MEMORY.md**

Update current phase to "Phase 8: Complete" and record what was accomplished.

**Step 3: Final verification**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: All pass clean.

**Step 4: Commit and push**

```bash
git add -A
git commit -m "chore: Phase 8 complete — cleanup stale files, update memory"
git push
```

---

## Task Summary

| Task | Type | Description |
|------|------|-------------|
| 1 | Code | Update myK9Q vercel.json with Turbo build |
| 2 | Manual | Create Vercel projects in dashboard |
| 3 | Manual | Smoke test staging deployments |
| 4 | Code | Exclusion audit: sync & conflict (~30 files) |
| 5 | Code | Exclusion audit: performance & monitoring (~30 files) |
| 6 | Code | Exclusion audit: components & UI (~25 files) |
| 7 | Code | Exclusion audit: hooks, services, stores, utils (~30 files) |
| 8 | Docs | Exclusion audit summary & documentation |
| 9 | Docs | Update migration plan, Vercel setup, CLAUDE.md |
| 10 | Cleanup | Delete stale files, update memory, final push |

**Parallelizable:** Tasks 4, 5, 6, 7 can run as parallel subagents since they audit independent file groups. Task 8 depends on all four completing.
