# Secretary Show-Day UX Consolidation Implementation Plan

**Status:** Draft plan created 2026-06-05; verified and expanded 2026-06-05. PR 1 implemented 2026-06-05. PR 2 implemented locally 2026-06-05; PR pending.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce secretary show-day cognitive load by routing secretaries into the existing canonical surfaces instead of duplicating operational UI.

**Architecture:** Preserve the post-collapse model from `docs/plan-show-map-workbench-collapse.md`: the Secretary Dashboard is the cross-show home, `/secretary/shows/:showId?phase=show-desk` is the single-show operational hub, and dedicated pages own bulk/specialized workflows. The first PR is deep-link only; larger consolidation work is isolated into later PRs so no secretary capability disappears.

**Tech Stack:** React, TypeScript, React Router, Zustand stores, Vitest, Testing Library, existing myK9Show custom test render utilities.

---

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: The plan changes secretary navigation and show-context selection in show-day workflows. It does not require migrations, shared-system writes, or new UI surfaces.

## Source Audit

This plan comes from the 2026-06-05 UX Consolidation Reviewer audit of myK9Show secretary/show-day workflows. It also carries forward these existing plans and constraints:

- `docs/INTENT.md` — Trial Secretary target feeling: "That was easy"; show-day work should be calm one-tap operations, not unnecessary navigation.
- `docs/goals/fall-2026-launch-readiness.md` — secretary/show-day reliability is the highest priority.
- `docs/plan-show-map-workbench-collapse.md` — Show Desk is the single-show operational hub; dashboard remains cross-show.
- `docs/plan-dashboard-refocus.md` — dashboard per-show work should become navigation/framing, not duplicate operation.
- `docs/plan-phase-d-late-entry-workflow.md` — late-entry flow shipped, but the plan still flags `createDayOfEntry` as a legacy online-only direct write path.

## Scope And Duplication Check

**Does this duplicate an existing page?** The current product has several fragmentation points:

| Finding                                | Duplication answer                                                                                                    | Decision                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Workbench closeout links               | No direct UI duplication, but show context is fragmented because the target pages rely on global selected show state. | Link with explicit `showId`.                                                 |
| Dashboard attention items              | No direct duplicate UI, but operational attention lands on public show detail instead of the secretary workbench.     | Link into the correct workbench phase.                                       |
| Pending-review links                   | No duplicate UI; existing links correctly avoid reimplementing Entry Management, but are too broad.                   | Add URL filter support and deep-link to the filtered view.                   |
| Late-entry dialog                      | Yes. `DayOfEntryDialog` duplicates the secretary registration workflow and maintains a separate direct write path.    | Consolidate in a later PR after preserving the fast entry point.             |
| Legacy day-of/check-in/run-order pages | Yes. Routes redirect, but old full tabbed pages and metadata still exist.                                             | Delete only after late-entry replacement removes the last active dependency. |
| Waitlist redirect                      | No. This is the model to preserve.                                                                                    | Keep.                                                                        |
| Show Desk tools sheet                  | No broad issue. It consolidates tools intentionally.                                                                  | Keep, with late-entry exception handled separately.                          |

## Failure And Rollback Notes

- **Invalid query params:** New `showId` and `entryTab` query params must be ignored calmly when invalid. They must not crash pages, select a nonexistent show, or erase an already valid selected show.
- **Route-state preservation:** New URL filters must preserve existing `trial`, `class`, and waitlist page-level `tab` params unless the user explicitly clears filters.
- **Rollback:** Each PR is independently revertable with `git revert`. PR 1 is link/query-state only and can roll back without data changes. PR 2 must not delete `DayOfEntryDialog` or `createDayOfEntry` until the canonical late-entry path is verified. PR 3 must happen last so legacy deletion can be reverted without losing active capability.
- **Shared systems:** No Supabase migrations, function deploys, or shared DB writes are part of this plan.

## File Structure

### PR 1 — Deep-Link Fixes

| File                                                                 | Responsibility                                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`            | Pass the current workbench show id into closeout links.                           |
| `apps/myk9show/src/pages/secretary/ResultsControlPage/index.tsx`     | Accept `?showId=` and select that show before falling back to global store state. |
| `apps/myk9show/src/pages/secretary/ResultsSubmissionPage/index.tsx`  | Accept `?showId=` and select that show before falling back to global store state. |
| `apps/myk9show/src/hooks/useMyShows.ts`                              | Build secretary workbench hrefs for operational attention items.                  |
| `apps/myk9show/src/hooks/useEntryManagementFilters.ts`               | Read and sync an entry-status URL filter for pending-review deep links.           |
| `apps/myk9show/src/features/show-map/ShowDeskPanel.tsx`              | Link pending-review action to the filtered Entry Management route.                |
| `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/index.tsx` | Link pending-review dashboard attention to filtered Entry Management route.       |
| Existing tests listed in each task                                   | Lock in route/query behavior.                                                     |

### PR 2 — Late-Entry Consolidation

| File                                                                         | Responsibility                                                                                                              |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `apps/myk9show/src/features/show-workbench/WorkbenchLateEntryAction.tsx`     | Replace the standalone dialog launch with a canonical registration deep link or shared registration-backed late-entry mode. |
| `apps/myk9show/src/pages/RegistrationWizardPage.tsx`                         | Read late-entry/source query params if the chosen implementation is a wizard mode.                                          |
| `apps/myk9show/src/components/shows/RegistrationWorkflow/*`                  | Reuse existing secretary dog search, class selection, handler assignment, and payment override behavior.                    |
| `apps/myk9show/src/pages/secretary/DayOfOperationsPage/DayOfEntryDialog.tsx` | Remove only after the replacement path covers existing behavior.                                                            |
| `apps/myk9show/src/services/database/day-of-operations/entries.ts`           | Remove or quarantine `createDayOfEntry` after no active UI uses it.                                                         |

### PR 3 — Legacy Surface Cleanup

| File                                                              | Responsibility                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------- |
| `apps/myk9show/src/pages/secretary/DayOfOperationsPage/index.tsx` | Delete after PR 2 removes the active dialog dependency. |
| `apps/myk9show/src/pages/secretary/RunOrderPage/RunOrderPage.tsx` | Delete if no non-test route imports remain.             |
| `apps/myk9show/src/routes/secretaryRoutes.tsx`                    | Remove or simplify redirected legacy route entries.     |
| `apps/myk9show/src/routes/routeRegistry.ts`                       | Remove stale route metadata for deleted surfaces.       |
| `apps/myk9show/src/store/navigationStore.ts`                      | Remove stale titles for deleted surfaces.               |
| `apps/myk9show/src/features/admin-help/data/pageDirectory.ts`     | Remove or reclassify deleted legacy pages.              |

---

## PR 1: Deep-Link Fixes

### Task 1: Preserve Show Context In Closeout Links

**Duplication answer:** No direct duplicate UI. This is fragmented navigation: the workbench knows the active show but sends secretaries to pages that may use a different globally selected show.

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`
- Modify: `apps/myk9show/src/pages/secretary/ResultsControlPage/index.tsx`
- Modify: `apps/myk9show/src/pages/secretary/ResultsSubmissionPage/index.tsx`
- Test: `apps/myk9show/src/test/pages/secretary/ShowWorkbenchPage.test.tsx`
- Test: `apps/myk9show/src/pages/secretary/__tests__/ResultsControlPage.test.tsx`
- Test: `apps/myk9show/src/pages/secretary/__tests__/ResultsSubmissionPage.test.tsx`

- [ ] **Step 1: Write failing tests for closeout hrefs**

Add assertions to the workbench test that the closeout links carry the current show id:

```ts
expect(screen.getByRole('link', { name: /Results Control/i })).toHaveAttribute(
  'href',
  '/secretary/results-control?showId=show-1'
);
expect(screen.getByRole('link', { name: /Reports/i })).toHaveAttribute(
  'href',
  '/secretary/reports?showId=show-1'
);
expect(screen.getByRole('link', { name: /Submit Results/i })).toHaveAttribute(
  'href',
  '/secretary/results-submission?showId=show-1'
);
```

- [ ] **Step 2: Write failing tests for query-param show selection**

In `ResultsControlPage.test.tsx`, mount with `/secretary/results-control?showId=show-2`, seed `useShowStore` with at least `show-1` and `show-2`, and assert `selectShow('show-2')` is called when the query id exists.

In `ResultsSubmissionPage.test.tsx`, repeat the same route setup for `/secretary/results-submission?showId=show-2`.

Add invalid-param coverage in both test files:

```ts
expect(selectShow).not.toHaveBeenCalledWith('missing-show');
```

When `selectedShowId` already points at a valid show and `?showId=missing-show` is present, the page must keep the selected show instead of falling back to the first show.

Expected failure before implementation: neither page reads or validates `showId` from search params.

- [ ] **Step 3: Implement workbench hrefs**

In `ShowWorkbenchPage.tsx`, derive the closeout query string from the current show:

```tsx
const closeoutShowQuery = `?showId=${encodeURIComponent(currentShow.id)}`;
```

Update the three closeout links:

```tsx
<Link to={`/secretary/results-control${closeoutShowQuery}`}>
<Link to={`/secretary/reports${closeoutShowQuery}`}>
<Link to={`/secretary/results-submission${closeoutShowQuery}`}>
```

- [ ] **Step 4: Implement Results Control query selection**

In `ResultsControlPage/index.tsx`, import `useSearchParams` from `react-router-dom`, read `showId`, and apply it before the existing first-show fallback:

```tsx
const [searchParams] = useSearchParams();
const routeShowId = searchParams.get('showId');
const routeShowExists = Boolean(routeShowId && shows.some(show => show.id === routeShowId));

useEffect(() => {
  if (routeShowId && routeShowExists) {
    if (selectedShowId !== routeShowId) {
      selectShow(routeShowId);
    }
    return;
  }

  if (!selectedShowId && shows.length > 0) {
    selectShow(shows[0].id);
  }
}, [routeShowExists, routeShowId, selectedShowId, shows, selectShow]);
```

Do not add an error banner for an invalid `showId` in this PR. Invalid deep links should degrade to the existing selected-show behavior; adding a new recovery UI would be new surface area.

- [ ] **Step 5: Implement Results Submission query selection**

Apply the same `useSearchParams` pattern in `ResultsSubmissionPage/index.tsx`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --dir apps/myk9show exec vitest run src/test/pages/secretary/ShowWorkbenchPage.test.tsx src/pages/secretary/__tests__/ResultsControlPage.test.tsx src/pages/secretary/__tests__/ResultsSubmissionPage.test.tsx
```

Expected: all three focused test files pass.

### Task 2: Route Dashboard Attention To The Correct Secretary Surface

**Duplication answer:** No direct duplicate UI. This is a cross-show dashboard item that should link to existing operational homes instead of sending secretaries to public show detail.

**Files:**

- Modify: `apps/myk9show/src/hooks/useMyShows.ts`
- Test: `apps/myk9show/src/hooks/useMyShows.test.ts`
- Test: `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/__tests__/AttentionNeededStrip.test.tsx`

- [ ] **Step 1: Write failing href tests**

In `useMyShows.test.ts`, assert:

```ts
expect(todayAttention.href).toBe('/secretary/shows/show-today?phase=show-desk');
expect(draftAttention.href).toBe('/secretary/shows/show-draft?phase=setup');
expect(closingSoonAttention.href).toBe('/secretary/shows/show-upcoming?phase=setup');
```

Expected failure before implementation: attention hrefs are `/shows/:showId`.

- [ ] **Step 2: Implement phase-aware hrefs**

In `useMyShows.ts`, replace the single public `href` with phase-specific existing secretary routes:

```ts
const showDeskHref = `/secretary/shows/${show.id}?phase=show-desk`;
const setupHref = `/secretary/shows/${show.id}?phase=setup`;
```

Use `showDeskHref` for `phase === 'today'`. Use `setupHref` for `phase === 'draft'` and entry-close attention.

- [ ] **Step 3: Lock dashboard strip as navigation-only**

If `AttentionNeededStrip.test.tsx` already asserts link rendering, add one assertion that an attention item with a secretary workbench href renders that href unchanged.

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm --dir apps/myk9show exec vitest run src/hooks/useMyShows.test.ts src/pages/secretary/SecretaryDashboardPage/__tests__/AttentionNeededStrip.test.tsx
```

Expected: both focused test files pass.

### Task 3: Add Pending-Review Deep Links Into Entry Management

**Duplication answer:** No direct duplicate UI. The app already links to Entry Management rather than reimplementing approval UI, but the link lands too broadly.

**Files:**

- Modify: `apps/myk9show/src/hooks/useEntryManagementFilters.ts`
- Modify: `apps/myk9show/src/features/show-map/ShowDeskPanel.tsx`
- Modify: `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/index.tsx`
- Test: `apps/myk9show/src/test/hooks/useEntryManagementFilters.test.ts`
- Test: `apps/myk9show/src/features/show-map/__tests__/ShowDeskPanel.test.tsx`
- Test: `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/__tests__/SecretaryDashboardPage.test.tsx`

- [ ] **Step 1: Write failing filter initialization tests**

In `useEntryManagementFilters.test.ts`, add:

```ts
const { result } = renderHook(() => useEntryManagementFilters({ entries, tabCounts }), {
  wrapper: createWrapper('/?entryTab=pending'),
});

expect(result.current.selectedTab).toBe('pending');
expect(result.current.filteredEntries.map(entry => entry.id)).toEqual(['pending-entry']);
```

Also assert an unsupported value falls back to `all`:

```ts
expect(result.current.selectedTab).toBe('all');
```

Use `entryTab` instead of `tab` so this does not collide with the page-level `?tab=waitlist` route state.

Add URL-state edge coverage:

```ts
act(() => result.current.setSelectedTab('accepted'));
expect(result.current.selectedTab).toBe('accepted');

act(() => result.current.clearFilters());
expect(result.current.selectedTab).toBe('all');
expect(result.current.trialFilter).toBeNull();
expect(result.current.classFilter).toBeNull();
```

Also assert `clearFilters` removes `entryTab` while preserving unrelated query params that Entry Management does not own, such as `tab=waitlist`.

- [ ] **Step 2: Implement URL-backed selected tab**

In `useEntryManagementFilters.ts`, define the allowed tabs:

```ts
const ENTRY_TABS = ['all', 'pending', 'accepted', 'waitlist', 'issues'] as const;
type EntryTab = (typeof ENTRY_TABS)[number];

function isEntryTab(value: string | null): value is EntryTab {
  return ENTRY_TABS.includes(value as EntryTab);
}
```

Initialize and sync selected tab from `entryTab`:

```ts
const routeEntryTab = searchParams.get('entryTab');
const resolvedEntryTab = isEntryTab(routeEntryTab) ? routeEntryTab : 'all';
const [selectedTab, setSelectedTabState] = useState<EntryTab>(resolvedEntryTab);

useEffect(() => {
  setSelectedTabState(resolvedEntryTab);
}, [resolvedEntryTab]);
```

Wrap `setSelectedTab` so user tab changes update the URL:

```ts
const setSelectedTab = useCallback(
  (tab: string) => {
    const nextTab = isEntryTab(tab) ? tab : 'all';
    setSelectedTabState(nextTab);
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (nextTab === 'all') {
          next.delete('entryTab');
        } else {
          next.set('entryTab', nextTab);
        }
        return next;
      },
      { replace: true }
    );
  },
  [setSearchParams]
);
```

Keep the return type as `selectedTab: string` and `setSelectedTab: (tab: string) => void` unless call sites already accept a narrower type.

- [ ] **Step 3: Update clear-filters behavior**

In `clearFilters`, also reset `selectedTab` and delete `entryTab`:

```ts
setSelectedTabState('all');
setSearchParams(
  prev => {
    const next = new URLSearchParams(prev);
    next.delete('trial');
    next.delete('class');
    next.delete('entryTab');
    return next;
  },
  { replace: true }
);
```

- [ ] **Step 4: Update pending-review links**

In `ShowDeskPanel.tsx`, change:

```ts
navigateTo(`/secretary/entries/${show.id}`);
```

to:

```ts
navigateTo(`/secretary/entries/${show.id}?entryTab=pending`);
```

In `SecretaryDashboardPage/index.tsx`, change the pending-review attention href from:

```ts
href: `/secretary/entries/${showId}`,
```

to:

```ts
href: `/secretary/entries/${showId}?entryTab=pending`,
```

- [ ] **Step 5: Add link assertions**

In `ShowDeskPanel.test.tsx`, assert the pending-review action navigates to `/secretary/entries/show-1?entryTab=pending`.

In `SecretaryDashboardPage.test.tsx`, assert pending-entry attention links to `/secretary/entries/show-1?entryTab=pending`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --dir apps/myk9show exec vitest run src/test/hooks/useEntryManagementFilters.test.ts src/features/show-map/__tests__/ShowDeskPanel.test.tsx src/pages/secretary/SecretaryDashboardPage/__tests__/SecretaryDashboardPage.test.tsx
```

Expected: all focused test files pass.

### PR 1 Final Verification

- [ ] Run focused deep-link test batch:

```bash
pnpm --dir apps/myk9show exec vitest run src/test/pages/secretary/ShowWorkbenchPage.test.tsx src/pages/secretary/__tests__/ResultsControlPage.test.tsx src/pages/secretary/__tests__/ResultsSubmissionPage.test.tsx src/hooks/useMyShows.test.ts src/test/hooks/useEntryManagementFilters.test.ts src/features/show-map/__tests__/ShowDeskPanel.test.tsx src/pages/secretary/SecretaryDashboardPage/__tests__/SecretaryDashboardPage.test.tsx src/pages/secretary/SecretaryDashboardPage/__tests__/AttentionNeededStrip.test.tsx
```

- [ ] Run app typecheck:

```bash
pnpm --filter @myk9/show typecheck
```

- [ ] Run lint if the focused changes touch lint-sensitive imports or route helpers:

```bash
pnpm --filter @myk9/show lint
```

- [ ] Update this plan's PR 1 status with the PR number after merge.

---

## PR 2: Late-Entry Consolidation

### Task 4: Replace Standalone Late Entry With Canonical Registration

**Duplication answer:** Yes. `DayOfEntryDialog` duplicates dog search/create, class selection, handler/payment handling, and entry creation that already exist in secretary registration.

**Recommendation:** Consolidate. Keep the fast "Late entry" button in Show Desk, but make it enter the canonical secretary registration path with late-entry context.

**Files:**

- Modify: `apps/myk9show/src/features/show-workbench/WorkbenchLateEntryAction.tsx`
- Modify: `apps/myk9show/src/pages/RegistrationWizardPage.tsx`
- Modify as needed: `apps/myk9show/src/components/shows/RegistrationWorkflow/RegistrationWorkflow.constants.tsx`
- Modify as needed: `apps/myk9show/src/components/shows/RegistrationWorkflow/WorkflowStepContent.tsx`
- Test: `apps/myk9show/src/features/show-workbench/__tests__/WorkbenchLateEntryAction.test.tsx`
- Test: `apps/myk9show/src/pages/__tests__/RegistrationWizardPage.workflowMode.test.tsx`
- Test: existing registration workflow tests around dog selection, class selection, and payment override

- [x] **Step 1: Choose the consolidation shape before coding**

Use this acceptance rule:

```text
The Show Desk Late Entry affordance may be a shortcut, but the entry creation path must be owned by the registration workflow or a shared registration-backed service. It must not continue to own a separate full form and separate direct write path.
```

Preferred route shape:

```text
/secretary/register/:showId?source=show-desk&entryMode=late
```

- [x] **Step 2: Write failing navigation test**

Update `WorkbenchLateEntryAction.test.tsx` so clicking the Late Entry action expects navigation to:

```ts
expect(mockNavigate).toHaveBeenCalledWith(
  '/secretary/register/show-1?source=show-desk&entryMode=late'
);
```

Expected failure before implementation: the component opens `DayOfEntryDialog`.

- [x] **Step 3: Write failing wizard-mode test**

In `RegistrationWizardPage.workflowMode.test.tsx`, mount a secretary at `/secretary/register/show-1?source=show-desk&entryMode=late` and assert:

```ts
expect(screen.getByText(/Late entry/i)).toBeInTheDocument();
expect(WORKFLOW_CONFIGS.secretary_new.features.paymentOverride).toBe(true);
expect(WORKFLOW_CONFIGS.secretary_new.features.createNew).toBe(true);
expect(WORKFLOW_CONFIGS.secretary_new.features.advancedSearch).toBe(true);
```

If the wizard should not show new visible copy, replace the text assertion with a test that the mode is passed to `WorkflowStepContent`.

- [x] **Step 4: Replace the dialog launch**

In `WorkbenchLateEntryAction.tsx`, remove the `DayOfEntryDialog` import and dialog state. Navigate to the canonical route:

```tsx
const lateEntryHref = `/secretary/register/${showId}?source=show-desk&entryMode=late`;
```

Keep existing disabled/loading behavior for capacity if the button still depends on class availability. If the registration workflow owns capacity checks, remove only the redundant capacity fetch from this component.

- [x] **Step 5: Apply late-entry context in the wizard**

In `RegistrationWizardPage.tsx`, read `entryMode` and `source` from search params. Preserve the existing `secretary_new` workflow config for secretary users. Use late-entry context only for framing/back-link behavior or any existing wizard mode props; do not fork a new form.

- [x] **Step 6: Run focused tests**

Run:

```bash
pnpm --dir apps/myk9show exec vitest run src/features/show-workbench/__tests__/WorkbenchLateEntryAction.test.tsx src/pages/__tests__/RegistrationWizardPage.workflowMode.test.tsx
```

Expected: focused tests pass.

**Selected implementation:** The Show Desk "Late entry" affordance now deep-links to `/secretary/register/:showId?source=show-desk&entryMode=late`. `RegistrationWizardPage` treats those params as context only: it preserves `secretary_new` workflow behavior, labels the shortcut as "Late entry", and returns to `/secretary/shows/:showId?phase=show-desk` after completion. `DayOfEntryDialog` and `createDayOfEntry` remain in place for rollback and PR 3 cleanup gating, but no active Show Desk late-entry path calls them.

### PR 2 Final Verification

- [x] Run the existing late-entry walk tests and update/remove assertions that expect `createDayOfEntry` if the UI no longer calls it:

```bash
pnpm --dir apps/myk9show exec vitest run src/features/show-workbench/__tests__/WorkbenchLateEntryAction.walk.test.tsx src/pages/secretary/DayOfOperationsPage/__tests__/DayOfEntryDialog.test.tsx
```

- [x] Run focused registration workflow tests touched by the late-entry route:

```bash
pnpm --dir apps/myk9show exec vitest run src/pages/__tests__/RegistrationWizardPage.workflowMode.test.tsx src/components/shows/RegistrationWorkflow/__tests__/ClassSelectionStep.test.tsx
```

- [x] Run app typecheck:

```bash
pnpm --filter @myk9/show typecheck
```

- [x] Run app lint:

```bash
pnpm --dir apps/myk9show lint
```

- [x] Run git whitespace check:

```bash
git diff --check
```

- [x] Update this plan's PR 2 status with the selected implementation.
- [ ] Update this plan's PR 2 status with the PR number after opening the PR.

---

## PR 3: Delete Or Quarantine Legacy Duplicated Surfaces

### Task 5: Remove Legacy Day-Of, Check-In, And Run-Order Surfaces

**Duplication answer:** Yes. The routes redirect into the workbench, but old full tabbed pages and metadata remain. After PR 2, they should not own active secretary workflows.

**Files:**

- Modify/delete: `apps/myk9show/src/pages/secretary/DayOfOperationsPage/index.tsx`
- Modify/delete: `apps/myk9show/src/pages/secretary/RunOrderPage/RunOrderPage.tsx`
- Modify: `apps/myk9show/src/routes/secretaryRoutes.tsx`
- Modify: `apps/myk9show/src/routes/routeRegistry.ts`
- Modify: `apps/myk9show/src/store/navigationStore.ts`
- Modify: `apps/myk9show/src/features/admin-help/data/pageDirectory.ts`
- Delete/update tests that only assert legacy pages render

- [ ] **Step 1: Prove no active imports remain**

Run:

```bash
rg -n "DayOfOperationsPage|DayOfEntryDialog|RunOrderPage|/secretary/day-of|/secretary/check-in|/secretary/run-order" apps/myk9show/src
```

Expected before deletion: only redirects, stale registries/help metadata, tests, and files targeted by this task remain. If an active non-legacy import remains, stop and either move that behavior into Show Desk or remove the import in a separate step.

- [ ] **Step 2: Keep route regression tests concrete**

Use the existing route-level test file `apps/myk9show/src/test/routes/secretaryShowPhaseRedirects.test.tsx`. Keep these concrete expectations rather than introducing a new redirect helper:

```ts
renderSecretaryRoutes('/secretary/day-of');
expect(await screen.findByTestId('show-workbench')).toHaveTextContent(
  '/secretary/shows/show-1?phase=show-desk'
);

renderSecretaryRoutes('/secretary/check-in');
expect(await screen.findByTestId('show-workbench')).toHaveTextContent(
  '/secretary/shows/show-1?phase=show-desk'
);

renderSecretaryRoutes('/secretary/run-order');
expect(await screen.findByTestId('show-workbench')).toHaveTextContent(
  '/secretary/shows/show-1?phase=setup'
);
```

These tests already exist today; PR 3 should preserve or update them as the route modules are simplified.

- [ ] **Step 3: Delete or quarantine dead page modules**

Delete the legacy page modules only when Step 1 proves no active imports remain. If route lazy imports require a component target, replace the legacy import with the existing redirect component rather than retaining the old page.

Delete or rewrite tests that directly mount removed pages, including:

- `apps/myk9show/src/pages/secretary/DayOfOperationsPage/__tests__/DayOfOperationsPage.tabs.test.tsx`
- `apps/myk9show/src/pages/secretary/RunOrderPage/__tests__/RunOrderHeader.test.tsx`

Do not keep tests whose only purpose is proving deleted duplicate UI still renders.

- [ ] **Step 4: Remove stale metadata**

Remove stale references from `routeRegistry.ts`, `navigationStore.ts`, and `pageDirectory.ts`. If admin help needs an entry, point it at `/secretary/shows/:showId?phase=show-desk` or `/secretary/shows/:showId?phase=setup` instead of the deleted route.

- [ ] **Step 5: Run cleanup verification**

Run:

```bash
rg -n "DayOfOperationsPage|DayOfEntryDialog|RunOrderPage|/secretary/day-of|/secretary/check-in|/secretary/run-order" apps/myk9show/src
```

Expected after deletion: only intentional redirect tests or redirect route definitions remain.

### PR 3 Final Verification

- [ ] Run focused route/admin-help tests touched by the cleanup.
- [ ] Run app typecheck:

```bash
pnpm --filter @myk9/show typecheck
```

- [ ] Run lint:

```bash
pnpm --filter @myk9/show lint
```

- [ ] Update this plan's PR 3 status and any relevant tracking document after merge.

---

## Out Of Scope

- No new secretary pages, tabs, sheets, or cards.
- No visual redesign of Show Desk, Entry Management, Results Control, or Registration Wizard.
- No Supabase migrations or shared-system writes.
- No removal of the Waitlist redirect pattern.
- No changes to myK9Q.

## Completion Criteria

- Safe deep-link PR is shipped first and independently releasable.
- Late-entry no longer maintains a separate full form/write path from secretary registration.
- Legacy duplicated page modules and stale route/help metadata are deleted or explicitly documented as retained blockers.
- Focused tests pass for every touched route/hook/component.
- `pnpm --filter @myk9/show typecheck` passes for each implementation PR.
- Tracking docs reflect shipped PR numbers and any deferred risks.

## Plan Verification — 2026-06-05

| Requirement                                             | Status                      | Evidence                                                                                                                               |
| ------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Reduce duplicate/fragmented secretary show-day surfaces | **Covered**                 | `Scope And Duplication Check` lists each finding and decision; PR 1-3 tasks map to link, consolidate, and delete work.                 |
| Prefer deep links over reimplemented UI                 | **Covered**                 | PR 1 is explicitly "deep-link only"; Tasks 1-3 route to Results Control, Results Submission, Reports, Show Desk, and Entry Management. |
| Preserve one concern, one page                          | **Covered**                 | Architecture states dashboard is cross-show, Show Desk is single-show operational hub, and dedicated pages own bulk workflows.         |
| Preserve `docs/INTENT.md` secretary feeling             | **Covered**                 | Source Audit cites `docs/INTENT.md`; Failure And Rollback Notes reject invalid-param banners/new recovery UI in PR 1.                  |
| Include explicit duplication answers                    | **Covered**                 | `Scope And Duplication Check` plus each task's duplication answer.                                                                     |
| Include testing phase                                   | **Covered**                 | Each PR has focused tests and final verification; completion criteria require focused tests and typecheck.                             |
| Handle invalid route/query input                        | **Covered after expansion** | Failure And Rollback Notes and Task 1 invalid `showId` tests; Task 3 invalid `entryTab` fallback.                                      |
| Avoid query-param collisions                            | **Covered after expansion** | Task 3 uses `entryTab` instead of page-level `tab` and adds preservation/clear-filter coverage.                                        |
| Keep rollback safe                                      | **Covered after expansion** | Failure And Rollback Notes define independent PR rollback and PR 2 deletion gate.                                                      |
| Avoid shared-system writes                              | **Covered**                 | Validation Profile and Out Of Scope state no migrations or shared-system writes.                                                       |

**Coverage:** 94/100.

Remaining risk is mostly in PR 2: the late-entry consolidation still requires implementation discovery inside the registration workflow before exact component-level edits are final. The plan gates deletion until replacement behavior is verified, so this is not blocking for PR 1.
