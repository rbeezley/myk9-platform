# Mobile Responsiveness Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the mobile layout defects found in the 2026-06-21 route sweep without adding new pages or duplicating existing workflows.

**Architecture:** Treat this as pattern remediation, not one-off page patching. Fix shared layout primitives first, then apply them to the affected public, secretary, and admin surfaces with route-level Playwright proof at `375x667`.

**Tech Stack:** TypeScript, React, Tailwind/shadcn UI, Vitest, Testing Library, Playwright, Vite.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: [ADDED] The work touches shared layout primitives (`ListControls`, `PrimaryTabs`, show shell patterns) and multiple role-specific operational routes, so each PR needs focused component tests plus app-level typecheck, lint, and mobile route replay before merge.

## Global Constraints

- Read `docs/INTENT.md` before UX-facing code changes and preserve role feelings: public/exhibitor trust, secretary "That was easy", admin operational confidence.
- Current phase is consolidate, don't duplicate: do not create new pages for these fixes; improve existing surfaces and shared primitives.
- [ADDED] Before code edits, create or enter a feature worktree/branch from the primary checkout; do not implement from `main`.
- [ADDED] Before each commit, run `git status --short` and `git diff --name-only --cached`; stage only files intentionally touched for that task.
- Keep files under 500 lines; extract focused components only when a touched file would become harder to reason about.
- Use TypeScript only.
- Use `src/test/utils/testUtils.tsx` for React tests.
- Mobile proof viewport is `375x667`.
- Every remediation PR must show: no page-level horizontal overflow, no internal clipping for the affected route, no owned 4xx/5xx network errors, and no new console errors.
- Durable finding IDs covered by this plan: `QA-MOBILE-LAYOUT-BREAK-028`, `QA-MOBILE-LAYOUT-BREAK-029`, `QA-MOBILE-LAYOUT-BREAK-030`, `QA-MOBILE-LAYOUT-BREAK-031`.
- [ADDED] These findings and the audit source are introduced by PR #888. If implementing from another branch before #888 merges, first cherry-pick or recreate `docs/qa/mobile-responsiveness-audit-2026-06-21.md` and the four `docs/qa/findings.md` entries, then verify the screenshot/artifact evidence still exists.
- [ADDED] Do not weaken auth/role checks while making mobile rows or action menus. A mobile card/action must expose only the same actions the desktop row exposes for the current role.
- [ADDED] Do not dual-render expensive table and card bodies for large datasets unless the hidden version is small and inert. Prefer conditional rendering from viewport state or CSS-only wrappers around already-rendered lightweight content.
- [ADDED] Rollback strategy: each task must land as its own PR/commit so a layout regression can be reverted independently. No database migrations, env var changes, or shared-system writes are part of this plan.

---

## [ADDED] Verification Preflight

Before implementing any task:

1. Confirm the route fixtures and credentials needed for the affected role are available in `.env.local` or the existing Playwright auth setup.
2. If a role cannot be authenticated locally, record the skipped route and do not close the related finding.
3. Start the app with `pnpm dev:show`.
4. Capture a baseline screenshot for each affected route at `375x667` before editing.
5. Stop any test run that hangs for more than 60 seconds and report the hanging command rather than retrying in a loop.

---

## File Structure

- Modify `apps/myk9show/src/features/headline/landing/HeadlineLandingPage.tsx`: keep public heritage show detail readable on phones.
- Modify `apps/myk9show/src/features/headline/headline.css`: constrain `.hd-ticker` and countdown badges to wrap or shrink inside `375px`.
- Modify `apps/myk9show/src/pages/ShowDetailsPage.tsx`: verify public show detail container does not force desktop width around the landing page.
- Modify secretary show-shell/navigation components found from `rg "show-desk|setup|entry-management|reports"` during task execution: stack show identity and make tabs horizontally scrollable with visible touch targets.
- Modify `apps/myk9show/src/pages/secretary/ShowCreationWizardPage.tsx`: tighten wizard page padding/header/footer behavior on phones.
- Modify `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx`: replace mobile-hostile `grid-cols-2` blocks with `grid-cols-1 md:grid-cols-2`, and reduce card padding on phones.
- Modify `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.sections.tsx`: make club/picker subsections obey the same single-column mobile pattern.
- Modify `apps/myk9show/src/components/common/ListControls.tsx`: make search, filters, results, and view toggle wrap into a readable mobile toolbar while preserving the desktop compact row.
- Modify `apps/myk9show/src/components/common/PrimaryTabs.tsx`: ensure tab strips never overlap and expose horizontal scrolling predictably.
- Modify `apps/myk9show/src/pages/BrowsePeoplePage.tsx`: default People to cards on phones or force the existing cards mode below `md`.
- Modify `apps/myk9show/src/components/users/browse/PeopleTableView.tsx`: keep table export/column behavior for desktop while avoiding clipped mobile table content.
- Modify `apps/myk9show/src/pages/secretary/EntryManagementPage.tsx`: ensure page tabs, filters, and entry content use mobile card/list presentation.
- Modify `apps/myk9show/src/pages/secretary/ReportsPage/ReportControlsBar.tsx`: stack report controls on phones.
- Modify `apps/myk9show/src/pages/secretary/ReportsPage/ReportPreview.tsx`: wrap print preview in an explicit scroll/scale container with a clear visual affordance.
- Modify admin pages/components for `/admin/dashboard`, `/admin/templates`, `/admin/permissions`, `/admin/users`, `/admin/permissions/users`, `/admin/judges/analytics`, `/admin/alerts`, `/admin/sync`, `/admin/performance`: prefer shared header/action and tab fixes over bespoke per-page CSS.
- Test `apps/myk9show/src/test/components/common/ListControls.test.tsx`.
- Create test `apps/myk9show/src/test/components/common/PrimaryTabs.test.tsx` if it does not already exist.
- Test `apps/myk9show/src/test/components/wizard/ShowDetailsStep.helpers.test.tsx` if helpers change; otherwise add a render-focused test next to the existing wizard tests.
- Test `apps/myk9show/src/pages/__tests__/BrowsePeoplePage.test.tsx`.
- Test `apps/myk9show/src/pages/secretary/__tests__/EntryManagementPage.tabs.test.tsx`.
- Test `apps/myk9show/src/pages/secretary/ReportsPage/__tests__/ReportControlsBar.test.tsx`.
- Test `apps/myk9show/src/pages/secretary/ReportsPage/__tests__/ReportPreview.test.tsx`.
- Test affected admin page tests if present; create focused tests beside the page/component when none exist.

---

### Task 1: Shared Show Detail and Secretary Workbench Shell

**Finding:** `QA-MOBILE-LAYOUT-BREAK-028`

**Files:**

- Modify: `apps/myk9show/src/features/headline/landing/HeadlineLandingPage.tsx`
- Modify: `apps/myk9show/src/features/headline/headline.css`
- Modify: `apps/myk9show/src/pages/ShowDetailsPage.tsx`
- Modify: secretary show workbench shell/nav components found with `rg -n "show-desk|entry-management|reports|setup" apps/myk9show/src/pages apps/myk9show/src/features apps/myk9show/src/components`
- Test: `apps/myk9show/src/features/headline/landing/__tests__/HeadlineLandingPage.test.tsx`
- Test: `apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx`

**Interfaces:**

- Consumes: existing route params and show data loaders.
- Produces: responsive public show detail and secretary show shell that preserve the same route structure and tabs.

- [ ] **Step 1: Write focused failing checks for public show detail layout**

  Add assertions that the headline landing renders the countdown and show title inside a mobile-width container without introducing nowrap-only ticker content. Use Testing Library to verify the ticker content remains present after class changes.

  ```typescript
  it('renders heritage countdown content without requiring desktop-only layout', () => {
    render(<HeadlineLandingPage {...defaultHeritageProps} />);

    expect(screen.getByText(/entries close/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /trial/i })).toBeInTheDocument();
  });
  ```

- [ ] **Step 2: Run the focused headline test and confirm it fails or captures current behavior**

  Run:

  ```bash
  cd apps/myk9show && pnpm exec vitest run src/features/headline/landing/__tests__/HeadlineLandingPage.test.tsx
  ```

  Expected: existing tests pass; new test anchors the content that must survive the responsive CSS change.

- [ ] **Step 3: Fix `.hd-ticker` and public show detail containers**

  In `headline.css`, make the ticker wrap or grid-stack on phones. The key shape should be:

  ```css
  @media (max-width: 640px) {
    .hd-ticker {
      width: 100%;
      max-width: 100%;
      grid-template-columns: 1fr;
      justify-items: stretch;
      overflow-wrap: anywhere;
    }

    .hd-ticker .b {
      min-width: 0;
      width: 100%;
      justify-content: center;
    }
  }
  ```

  Keep desktop behavior visually equivalent.

- [ ] **Step 4: Fix secretary show shell/header/tabs as one shared surface**

  Locate the shared workbench/header/navigation wrapper used by `/shows/:showId/setup`, `/show-desk`, `/entry-management`, and `/reports`. Apply this mobile pattern:

  ```tsx
  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
    <div className="min-w-0">
      <h1 className="break-words text-xl font-semibold md:text-2xl">{showName}</h1>
      <div className="mt-2 flex flex-wrap gap-2">{statusChips}</div>
    </div>
    <div className="flex w-full flex-wrap gap-2 md:w-auto md:justify-end">{actions}</div>
  </div>
  ```

  Tabs should use the same scrollable, non-overlapping behavior planned for `PrimaryTabs` in Task 4.

- [ ] **Step 5: Run focused tests**

  Run:

  ```bash
  cd apps/myk9show && pnpm exec vitest run src/features/headline/landing/__tests__/HeadlineLandingPage.test.tsx src/test/pages/ShowDetailsPage.test.tsx
  ```

  Expected: PASS.

- [ ] **Step 6: Verify routes at phone width**

  Run Playwright at `375x667` for:

  - `/shows/:showId`
  - `/shows/:showId/setup`
  - `/shows/:showId/show-desk`
  - `/shows/:showId/entry-management`
  - `/shows/:showId/reports`

  In the browser console, evaluate:

  ```typescript
  document.documentElement.scrollWidth <= window.innerWidth;
  ```

  Expected: `true` for public show detail; manual screenshot check shows no clipped show title, status chips, or section tabs on all listed routes.

- [ ] **Step 7: Commit**

  Review any additional shell/header/nav files changed by this task with `git diff --name-only`; stage those exact paths individually. Do not stage broad directories.

  ```bash
  git status --short
  git add apps/myk9show/src/features/headline/landing/HeadlineLandingPage.tsx apps/myk9show/src/features/headline/headline.css apps/myk9show/src/pages/ShowDetailsPage.tsx
  git diff --name-only --cached
  git commit -m "fix(show): improve mobile show shell layout"
  ```

---

### Task 2: Secretary Create Show Wizard Mobile Layout

**Finding:** `QA-MOBILE-LAYOUT-BREAK-029`

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/ShowCreationWizardPage.tsx`
- Modify: `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx`
- Modify: `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.sections.tsx`
- Modify if needed: `apps/myk9show/src/components/shows/wizard/steps/OfficialPicker.tsx`
- Modify if needed: `apps/myk9show/src/components/shows/wizard/steps/JudgesPicker.tsx`
- Test: add render tests beside existing wizard tests.

**Interfaces:**

- Consumes: existing wizard store and picker APIs.
- Produces: step 1 layout that uses one readable field/control per row below `md`, with desktop two-column grouping preserved at `md+`.

- [ ] **Step 1: Write a render test for mobile-safe field grouping**

  Add a test that renders `ShowDetailsStep` with seeded wizard state and asserts the required fields still render after class changes.

  ```typescript
  it('renders all step one controls for a single-column mobile layout', () => {
    render(<ShowDetailsStep />);

    expect(screen.getByLabelText(/show name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/organization/i)).toBeInTheDocument();
    expect(screen.getByText(/show dates/i)).toBeInTheDocument();
    expect(screen.getByText(/entry period/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/pre-entry fee/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/day-of-show fee/i)).toBeInTheDocument();
    expect(screen.getByText(/show officials/i)).toBeInTheDocument();
    expect(screen.getByText(/show judges/i)).toBeInTheDocument();
  });
  ```

- [ ] **Step 2: Run the focused wizard tests**

  Run:

  ```bash
  cd apps/myk9show && pnpm exec vitest run src/components/shows/wizard/steps/__tests__ src/pages/secretary/__tests__/ShowCreationWizardPage.success.test.tsx
  ```

  Expected: PASS before visual work, or fail only because the new test needs existing mocks updated.

- [ ] **Step 3: Replace two-column mobile grids**

  In `ShowDetailsStep.tsx`, change direct mobile-hostile grids:

  ```tsx
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
  ```

  Replace `col-span-2` with:

  ```tsx
  <div className="space-y-2 md:col-span-2">
  ```

  Reduce card padding:

  ```tsx
  <div className="group relative rounded-2xl border border-border bg-gradient-to-br from-card to-card/80 p-4 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-lg md:p-6">
  ```

- [ ] **Step 4: Make picker sections single-column on phones**

  In `ShowDetailsStep.sections.tsx`, `OfficialPicker.tsx`, and `JudgesPicker.tsx`, replace any `grid-cols-2`, fixed widths, or side-by-side button rows with `grid-cols-1 md:grid-cols-2`, `w-full md:w-auto`, and stacked mobile actions.

- [ ] **Step 5: Tighten wizard page chrome**

  In `ShowCreationWizardPage.tsx`, reduce phone padding around `WizardHeader`, `HorizontalProgressIndicator`, `WizardStepContent`, and `WizardNavigation` using `px-4 md:px-6`, `gap-4 md:gap-6`, and stacked footer actions.

- [ ] **Step 6: Run focused tests**

  Run:

  ```bash
  cd apps/myk9show && pnpm exec vitest run src/components/shows/wizard/steps/__tests__ src/pages/secretary/__tests__/ShowCreationWizardPage.success.test.tsx
  ```

  Expected: PASS.

- [ ] **Step 7: Verify routes at phone width**

  Replay:

  - `/secretary/create-show`
  - `/secretary/create-show/wizard`

  Expected: no clipped labels, no overlapping picker controls, no page-level horizontal overflow, and one readable form control per row on step 1.

- [ ] **Step 8: Commit**

  Review any picker or test files changed by this task with `git diff --name-only`; stage those exact paths individually. Do not stage the whole steps directory if unrelated files changed.

  ```bash
  git status --short
  git add apps/myk9show/src/pages/secretary/ShowCreationWizardPage.tsx apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.sections.tsx
  git diff --name-only --cached
  git commit -m "fix(secretary): make show wizard mobile readable"
  ```

---

### Task 3: Mobile Rows for Dense Management Tables

**Finding:** `QA-MOBILE-LAYOUT-BREAK-030`

**Files:**

- Modify: `apps/myk9show/src/pages/BrowsePeoplePage.tsx`
- Modify: `apps/myk9show/src/components/users/browse/PeopleTableView.tsx`
- Modify: `apps/myk9show/src/pages/secretary/EntryManagementPage.tsx`
- Modify: entry management row/list components under `apps/myk9show/src/components/entries/management`
- Modify: `apps/myk9show/src/pages/secretary/ReportsPage/ReportControlsBar.tsx`
- Modify: `apps/myk9show/src/pages/secretary/ReportsPage/ReportPreview.tsx`
- Modify: admin user, permission-user, and judge analytics table components found with `rg -n "Admin Users|permissions/users|Judge Analytics|DataTable" apps/myk9show/src/pages/admin apps/myk9show/src/components/admin`
- Test: affected page/component tests listed in File Structure.

**Interfaces:**

- Consumes: existing `DataTable`, `PeopleGridView`, entry management views, and report preview data.
- Produces: mobile card/list rows or explicit scroll containers with clear affordances. Desktop tables remain available at `md+`.

- [ ] **Step 1: Write People mobile fallback test**

  In `BrowsePeoplePage.test.tsx`, add a test that verifies cards can be the phone default without removing the existing table mode.

  ```typescript
  it('keeps a card presentation available for mobile people browsing', async () => {
    render(<BrowsePeoplePage />);

    expect(await screen.findByRole('button', { name: /cards/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /table/i })).toBeInTheDocument();
  });
  ```

- [ ] **Step 2: Make People prefer cards below `md`**

  Use a small responsive hook or CSS-only dual render. Preferred minimal code:

  ```tsx
  <div className={viewMode === 'table' ? 'hidden md:block' : undefined}>
    {viewMode === 'table' ? (
      <PeopleTableView people={filteredPeople} />
    ) : (
      <PeopleGridView people={filteredPeople} />
    )}
  </div>;
  {
    viewMode === 'table' && (
      <div className="md:hidden">
        <PeopleGridView people={filteredPeople} />
      </div>
    );
  }
  ```

  [EXPANDED] This preserves the user's table preference on desktop while avoiding clipped phone columns. If `filteredPeople` can be large enough that dual rendering becomes expensive, replace this with a `useMediaQuery('(max-width: 767px)')` branch and render only the active presentation.

- [ ] **Step 3: Apply the same principle to Entry Management**

  In `EntryManagementPage.tsx` and its child views, default phone width to an existing card/list representation. If a table remains necessary, wrap it:

  ```tsx
  <div
    className="overflow-x-auto rounded-lg border border-border"
    aria-label="Entry table scroll area"
  >
    <div className="min-w-[720px]">{table}</div>
  </div>
  ```

  Prefer card/list rows for check-in, payment, decision, and armband actions.

- [ ] **Step 4: Make report preview intentionally scrollable/scaled**

  In `ReportPreview.tsx`, wrap print-sized previews:

  ```tsx
  <div
    className="max-w-full overflow-x-auto rounded-lg border border-border bg-muted/20 p-2"
    aria-label="Report preview scroll area"
  >
    <div className="min-w-[720px] origin-top-left">{preview}</div>
  </div>
  ```

  Keep print output unchanged.

- [ ] **Step 5: Apply mobile row fallback to admin dense tables**

  For `/admin/users`, `/admin/permissions/users`, and `/admin/judges/analytics`, either:

  - render compact cards under `md`, or
  - use the explicit scroll container above when the table is comparison-heavy.

  Cards must include the row's primary identity, status/role badges, and primary action.

- [ ] **Step 5a: Confirm mobile cards preserve permissions**

  [ADDED] For every card action added under `md`, verify it reuses the same permission checks as the desktop action. Do not add mobile-only shortcuts for export, delete, role edit, payment, refund, or entry-status changes unless the desktop route already exposes that action to the same role.

- [ ] **Step 6: Run focused tests**

  Run:

  ```bash
  cd apps/myk9show && pnpm exec vitest run src/pages/__tests__/BrowsePeoplePage.test.tsx src/pages/secretary/__tests__/EntryManagementPage.tabs.test.tsx src/pages/secretary/ReportsPage/__tests__/ReportControlsBar.test.tsx src/pages/secretary/ReportsPage/__tests__/ReportPreview.test.tsx
  ```

  Expected: PASS.

- [ ] **Step 7: Verify routes at phone width**

  Replay:

  - `/people`
  - `/shows/:showId/entry-management`
  - `/shows/:showId/reports`
  - `/admin/users`
  - `/admin/permissions/users`
  - `/admin/judges/analytics`

  Expected: no hidden important row actions, no clipped email/name/status text, and any unavoidable table overflow has a visible scroll container.

- [ ] **Step 8: Commit**

  Review any entry-management, admin table, and test files changed by this task with `git diff --name-only`; stage those exact paths individually. Do not stage `pages/admin` or `components/admin` as directories.

  ```bash
  git status --short
  git add apps/myk9show/src/pages/BrowsePeoplePage.tsx apps/myk9show/src/components/users/browse/PeopleTableView.tsx apps/myk9show/src/pages/secretary/EntryManagementPage.tsx apps/myk9show/src/pages/secretary/ReportsPage/ReportControlsBar.tsx apps/myk9show/src/pages/secretary/ReportsPage/ReportPreview.tsx
  git diff --name-only --cached
  git commit -m "fix(layout): add mobile rows for dense management pages"
  ```

---

### Task 4: Action Bars, Tabs, and Browse Shows Toolbar Polish

**Finding:** `QA-MOBILE-LAYOUT-BREAK-031`

**Files:**

- Modify: `apps/myk9show/src/components/common/ListControls.tsx`
- Modify: `apps/myk9show/src/components/common/PrimaryTabs.tsx`
- Modify: admin page header/action components for dashboard, templates, and permissions.
- Modify: admin monitoring tabs used by alerts, sync, and performance routes.
- Modify: public Browse Shows page/table toolbar components found with `rg -n "ListControls|Browse Shows|shows" apps/myk9show/src/pages apps/myk9show/src/components/common`
- Test: `apps/myk9show/src/test/components/common/ListControls.test.tsx`
- Test: `apps/myk9show/src/test/components/common/PrimaryTabs.test.tsx`

**Interfaces:**

- Consumes: existing `ListControlsProps` and `PrimaryTabDef`.
- Produces: shared responsive toolbar/tabs behavior with no prop API break.

- [ ] **Step 1: Add ListControls mobile class regression test**

  ```typescript
  it('uses wrapping mobile-safe layout for search filters and view controls', () => {
    render(<ListControls {...defaultProps} />);

    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cards/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /table/i })).toBeInTheDocument();
  });
  ```

- [ ] **Step 2: Confirm the PrimaryTabs overlap still reproduces**

  `PrimaryTabs` already uses `overflow-x-auto` on `TabsList` and `whitespace-nowrap` on triggers. Before changing it, replay `/admin/alerts`, `/admin/sync`, and `/admin/performance` at `375x667` and confirm whether the overlap is caused by `PrimaryTabs` itself, a parent container, or a route-specific tab implementation. If the current branch no longer reproduces overlap, leave `PrimaryTabs` untouched and document that `QA-MOBILE-LAYOUT-BREAK-031` is limited to action bars or Browse Shows controls.

- [ ] **Step 3: Add PrimaryTabs regression test if the overlap reproduces in PrimaryTabs**

  ```typescript
  it('renders long tab labels as non-overlapping scrollable triggers', () => {
    render(
      <PrimaryTabs
        tabs={[
          { id: 'alerts', label: 'Alert Monitoring' },
          { id: 'sync', label: 'Sync Monitoring' },
          { id: 'performance', label: 'Performance Dashboard' },
        ]}
        value="alerts"
        onValueChange={vi.fn()}
      />
    );

    expect(screen.getByRole('tab', { name: /alert monitoring/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /sync monitoring/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /performance dashboard/i })).toBeInTheDocument();
  });
  ```

- [ ] **Step 4: Make `ListControls` phone-first**

  Update the INTENT comment instead of preserving the stale width warning. PR #791 fixed the duplicate `@tailwind utilities` ordering issue that made `w-full sm:w-NN` unsafe, so the comment should now preserve only the product intent: compact desktop search, full-width mobile search, and room for filters.

  Suggested comment shape:

  ```tsx
  /**
   * INTENT: search stays compact on desktop so filter chips get room to breathe,
   * but uses full width on phones so the toolbar does not clip. PR #791 fixed
   * the old Tailwind emission-order issue that made `w-full sm:w-NN` unsafe.
   */
  ```

  Then change mobile width:

  ```tsx
  <SearchBar
    size="sm"
    value={search}
    onChange={onSearchChange}
    placeholder={searchPlaceholder}
    className="w-full shrink-0 sm:w-52"
  />
  ```

  Change the row and toggle:

  ```tsx
  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
  ...
  <ViewToggle className="w-full sm:ml-auto sm:w-auto" ... />
  ```

- [ ] **Step 5: Harden `PrimaryTabs` only if Step 2 proves the shared primitive is the source**

  Ensure the list and triggers cannot overlap:

  ```tsx
  <TabsList className="flex w-full max-w-full overflow-x-auto no-scrollbar border-b border-border bg-transparent p-0 gap-0">
  ```

  Keep triggers:

  ```tsx
  <TabsTrigger className="inline-flex min-w-max items-center gap-1.5 whitespace-nowrap ...">
  ```

- [ ] **Step 6: Stack admin header actions on mobile**

  For dashboard/templates/permissions headers, use:

  ```tsx
  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
    <div className="min-w-0">{titleAndDescription}</div>
    <div className="flex w-full flex-wrap gap-2 md:w-auto md:justify-end">{actions}</div>
  </div>
  ```

- [ ] **Step 7: Run focused tests**

  Run:

  ```bash
  cd apps/myk9show && pnpm exec vitest run src/test/components/common/ListControls.test.tsx src/test/components/common/PrimaryTabs.test.tsx
  ```

  Expected: PASS.

- [ ] **Step 8: Verify routes at phone width**

  Replay:

  - `/admin/dashboard`
  - `/admin/templates`
  - `/admin/permissions`
  - `/admin/alerts`
  - `/admin/sync`
  - `/admin/performance`
  - `/shows`

  Expected: action bars wrap/stack, tab labels do not overlap, and Browse Shows toolbar controls remain visible.

- [ ] **Step 9: Commit**

  Review any admin header/tab and Browse Shows files changed by this task with `git diff --name-only`; stage those exact paths individually. Do not stage broad page/component directories.

  ```bash
  git status --short
  git add apps/myk9show/src/components/common/ListControls.tsx apps/myk9show/src/components/common/PrimaryTabs.tsx apps/myk9show/src/test/components/common/ListControls.test.tsx apps/myk9show/src/test/components/common/PrimaryTabs.test.tsx
  git diff --name-only --cached
  git commit -m "fix(layout): improve mobile actions and tabs"
  ```

---

### Task 5: Final Mobile Audit Closure

**Findings:** `QA-MOBILE-LAYOUT-BREAK-028`, `QA-MOBILE-LAYOUT-BREAK-029`, `QA-MOBILE-LAYOUT-BREAK-030`, `QA-MOBILE-LAYOUT-BREAK-031`

**Files:**

- Modify: `docs/qa/findings.md`
- Modify: `OPEN-TODOS.md`
- Optional modify: `docs/qa/mobile-responsiveness-audit-2026-06-21.md` if final evidence paths should be appended.

**Interfaces:**

- Consumes: screenshots, Playwright results, unit test output, and route proof from Tasks 1-4.
- Produces: durable closure evidence for each finding.

- [ ] **Step 1: Run full focused verification**

  Run:

  ```bash
  cd apps/myk9show && pnpm exec vitest run src/features/headline/landing/__tests__/HeadlineLandingPage.test.tsx src/test/pages/ShowDetailsPage.test.tsx src/components/shows/wizard/steps/__tests__ src/pages/secretary/__tests__/ShowCreationWizardPage.success.test.tsx src/pages/__tests__/BrowsePeoplePage.test.tsx src/pages/secretary/__tests__/EntryManagementPage.tabs.test.tsx src/pages/secretary/ReportsPage/__tests__/ReportControlsBar.test.tsx src/pages/secretary/ReportsPage/__tests__/ReportPreview.test.tsx src/test/components/common/ListControls.test.tsx src/test/components/common/PrimaryTabs.test.tsx
  ```

  Expected: PASS.

- [ ] **Step 2: Run app validation**

  Run:

  ```bash
  pnpm typecheck
  pnpm lint
  ```

  Expected: both commands PASS. [EXPANDED] If lint or typecheck fails from unrelated pre-existing work, capture the exact failing files and confirm they are outside the touched diff before proceeding.

- [ ] **Step 3: Run the mobile route replay**

  Replay all routes listed in the four findings at `375x667`.

  Required assertion for every route:

  ```typescript
  document.documentElement.scrollWidth <= window.innerWidth;
  ```

  Required manual screenshot checks:

  - show shell/header/tabs are readable
  - wizard step 1 fields do not collide
  - management rows show primary data/actions
  - admin actions/tabs do not overlap
  - Browse Shows toolbar does not clip

  [ADDED] Also capture console errors and owned network failures for every replayed route. A route with new console errors, owned 4xx/5xx responses, or missing role authentication cannot close its finding.

- [ ] **Step 4: Update QA findings**

  For each finding, change:

  ```markdown
  - **Status:** open
  ```

  to `fixed` status using the actual merged PR number and merge date from the implementation run. Add a `Resolution` line that cites the focused Vitest command, `pnpm typecheck`, `pnpm lint`, and the mobile Playwright replay artifact path captured in Step 3. Then move the finding from `Open Findings` to `Closed Findings` in the same change, per `docs/qa/findings.md`'s lifecycle. Do not leave example PR numbers, dates, or artifact paths in the committed findings.

- [ ] **Step 5: Update `OPEN-TODOS.md`**

  Remove the completed Mobile Responsiveness Audit items or move them into a completed section with PR links.

- [ ] **Step 6: Validate docs**

  Run:

  ```bash
  git diff --check -- OPEN-TODOS.md docs/qa/findings.md docs/qa/mobile-responsiveness-audit-2026-06-21.md
  pnpm exec prettier --check docs/qa/findings.md docs/qa/mobile-responsiveness-audit-2026-06-21.md
  ```

  Expected: both commands pass. Do not require whole-file Prettier for `OPEN-TODOS.md` if unrelated pre-existing style would churn the file.

- [ ] **Step 7: Commit**

  ```bash
  git status --short
  git add docs/qa/findings.md OPEN-TODOS.md docs/qa/mobile-responsiveness-audit-2026-06-21.md
  git diff --name-only --cached
  git commit -m "docs: close mobile responsiveness audit findings"
  ```

---

## Execution Order

1. Task 4 can be done first if the team wants quick shared wins; it lowers risk for Task 1 and Task 3.
2. Task 1 should land before Task 3 if secretary workbench screenshots are the highest priority.
3. Task 2 is independent and can run in parallel with Task 1.
4. Task 3 should be split into two PRs if the admin table surfaces are larger than expected: secretary/people first, admin second.
5. Task 5 closes the loop after all remediation PRs merge.

## Self-Review

- Spec coverage: all four audit findings map to a task, and Task 5 handles durable closure.
- Duplication check: no new page or duplicate workflow is proposed; the plan uses existing surfaces and shared primitives.
- Placeholder scan: all tasks include concrete files, commands, and expected proof.
- Type consistency: no new public TypeScript interfaces are required; `ListControlsProps` and `PrimaryTabDef` remain compatible.
