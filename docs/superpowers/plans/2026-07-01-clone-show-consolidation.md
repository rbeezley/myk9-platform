# Clone Show Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Show Creation Wizard the only Clone Show workflow: pick a prior show, prefill the wizard, then review or change each field before creating the new show.

**Architecture:** Keep clone behavior inside `CloneFromShowCombobox`, backed by `useWizardStore`. Remove the older `CalendarPage` dialog path and its standalone clone components. Copy show settings plus trial/class structure into the wizard, but clear schedule and event-number fields that must be new for the cloned show.

**Tech Stack:** React, TypeScript, Zustand, React Query, Vitest, Testing Library, Playwright.

## Global Constraints

- Work in a feature worktree before editing app code.
- Do not add a new clone page, sheet, or modal.
- The wizard is the only Clone Show workflow.
- Cloning prefills non-date show settings, copies trial/class structure, and leaves show dates, entry-period dates, trial dates, and event numbers blank.
- The secretary must proceed through the normal wizard steps before creation.
- [ADDED] If prior shows fail to load, fresh show creation must remain available and the wizard must show plain-English non-blocking copy.
- [ADDED] Do not create or close a real staging/shared-system show during manual QA without explicit user confirmation.
- Use TypeScript only.
- Use `src/test/utils/testUtils.tsx` for React component tests.
- Keep files under 500 lines.
- Update `OPEN-TODOS.md` only when implementation begins or completes.

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: This removes a duplicate production UI path and changes a secretary setup flow inside one app, so focused unit/E2E coverage plus app typecheck is enough before PR.

---

## File Structure

- Modify: `apps/myk9show/src/components/shows/wizard/steps/CloneFromShowCombobox.tsx`
  - Responsibility: canonical source-show picker and wizard-store prefill behavior, including trial/class structure copy.
- Create: `apps/myk9show/src/components/shows/wizard/steps/__tests__/CloneFromShowCombobox.test.tsx`
  - Responsibility: unit coverage for copied fields, copied trial/class structure, blank schedule fields, judge copy, start-fresh behavior, empty candidate state, and failed candidate-load state.
- Modify: `apps/myk9show/src/pages/CalendarPage.tsx`
  - Responsibility: remove the duplicate standalone clone dialog entry point.
- Delete: `apps/myk9show/src/components/shows/cloning/ShowCloneDialog.tsx`
- Delete: `apps/myk9show/src/components/shows/cloning/ShowSelector.tsx`
- Delete: `apps/myk9show/src/components/shows/cloning/CloneReviewStep.tsx`
- Delete: `apps/myk9show/src/components/shows/cloning/index.ts`
- Modify: `apps/myk9show/src/test/e2e/secretary/show-creation-wizard.spec.ts`
  - Responsibility: browser coverage for wizard clone selection and next-step continuation.
- Modify: `apps/myk9show/src/test/e2e/entities/showsUI.spec.ts`
  - Responsibility: keep the create-wizard affordance assertion aligned with the canonical path.
- Modify: `OPEN-TODOS.md`
  - Responsibility: remove or mark the selected backlog item after the work is implemented and verified.

---

### Task 1: Lock Wizard Clone Behavior With Unit Tests

**Files:**
- Create: `apps/myk9show/src/components/shows/wizard/steps/__tests__/CloneFromShowCombobox.test.tsx`
- Modify: `apps/myk9show/src/components/shows/wizard/steps/CloneFromShowCombobox.tsx`

**Interfaces:**
- Consumes: `CloneFromShowCombobox({ clubId?: string })`
- Consumes: `useWizardStore()` actions `updateShowData(data)`, `addJudgeToShow(judgeId, details)`, `addTrial(trial)`, and `resetWizard()`
- Produces: verified behavior that selecting a show writes non-date fields, copies trial/class structure, clears `startDate`, `endDate`, `entryOpenDate`, `entryCloseDate`, cloned trial `dateTime`, and cloned trial `eventNumber`, and handles empty/error candidate states without blocking fresh entry

- [ ] **Step 1: Write the failing component tests** [EXPANDED]

Create `apps/myk9show/src/components/shows/wizard/steps/__tests__/CloneFromShowCombobox.test.tsx`:

```tsx
import { render, screen, within } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Show } from '@/types/show-types';

const mockUpdateShowData = vi.fn();
const mockAddJudgeToShow = vi.fn();
const mockAddTrial = vi.fn();
const mockResetWizard = vi.fn();
const mockShows: Show[] = [
  {
    id: 'show-1',
    name: 'Heartland Spring Trial',
    organization: 'UKC',
    startDate: '2026-05-15',
    endDate: '2026-05-16',
    location: 'Heartland Arena\nTulsa, OK',
    clubId: 'club-1',
    entryOpenDate: '2026-03-01',
    entryCloseDate: '2026-04-30',
    preEntryFee: '28',
    dayOfShowFee: '35',
    startingArmbandNumber: 250,
    acceptCheckPayments: true,
    acceptCashPayments: true,
    status: 'completed',
    assignedJudges: [
      { judgeId: 'judge-1', judgeName: 'Alex Judge', assignedClasses: ['class-1'] },
    ],
    trials: [
      {
        id: 'trial-1',
        name: 'Friday Trial 1',
        date: '2026-05-15',
        trialNumber: 'OLD-123',
        status: 'completed',
        trialType: 'Nosework',
        classes: [
          {
            id: 'class-1',
            templateId: 'tmpl-nosework',
            name: 'Novice Containers',
            level: 'Novice',
            element: 'Containers',
            entryFee: 28,
          },
        ],
      },
    ],
  } as unknown as Show,
];
let mockShowsQueryState: { data: Show[]; isLoading: boolean; isError: boolean } = {
  data: mockShows,
  isLoading: false,
  isError: false,
};

vi.mock('@/store/wizardStore', () => ({
  useWizardStore: vi.fn(() => ({
    updateShowData: mockUpdateShowData,
    addJudgeToShow: mockAddJudgeToShow,
    addTrial: mockAddTrial,
    resetWizard: mockResetWizard,
  })),
}));

vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowsQuery: vi.fn(() => mockShowsQueryState),
}));

vi.mock('@/store/userStore', () => ({
  useUserStore: vi.fn(() => ({
    people: [
      {
        id: 'judge-1',
        firstName: 'Alex',
        lastName: 'Judge',
        email: 'alex@example.com',
        phone: '555-0101',
        judgeQualifications: [{ organization: 'UKC' }],
      },
    ],
  })),
}));

vi.mock('@/hooks/useUserClubIds', () => ({
  useUserClubIds: vi.fn(() => new Set(['club-1'])),
}));

import { CloneFromShowCombobox } from '../CloneFromShowCombobox';

describe('CloneFromShowCombobox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShowsQueryState = { data: mockShows, isLoading: false, isError: false };
  });

  it('prefills non-date show fields and leaves all date fields blank', async () => {
    const user = userEvent.setup();
    render(<CloneFromShowCombobox />);

    await user.click(screen.getByRole('button', { name: /select a past show to clone/i }));
    const list = screen.getByText('Heartland Spring Trial').closest('[data-radix-popper-content-wrapper]')
      ?? document.body;
    await user.click(within(list as HTMLElement).getByText('Heartland Spring Trial'));

    expect(mockUpdateShowData).toHaveBeenCalledWith({
      name: 'Heartland Spring Trial',
      organization: 'UKC',
      location: 'Heartland Arena\nTulsa, OK',
      clubId: 'club-1',
      preEntryFee: 28,
      dayOfShowFee: 35,
      startingArmbandNumber: 250,
      acceptCheckPayments: true,
      acceptCashPayments: true,
      startDate: '',
      endDate: '',
      entryOpenDate: '',
      entryCloseDate: '',
    });
  });

  it('copies assigned judges when the person record is available', async () => {
    const user = userEvent.setup();
    render(<CloneFromShowCombobox />);

    await user.click(screen.getByRole('button', { name: /select a past show to clone/i }));
    await user.click(screen.getByText('Heartland Spring Trial'));

    expect(mockAddJudgeToShow).toHaveBeenCalledWith('judge-1', {
      name: 'Alex Judge',
      email: 'alex@example.com',
      phone: '555-0101',
      certifications: ['UKC'],
      notes: '',
    });
  });

  it('copies trial and class structure while clearing trial date and event number', async () => {
    const user = userEvent.setup();
    render(<CloneFromShowCombobox />);

    await user.click(screen.getByRole('button', { name: /select a past show to clone/i }));
    await user.click(screen.getByText('Heartland Spring Trial'));

    expect(mockAddTrial).toHaveBeenCalledWith({
      name: 'Friday Trial 1',
      dateTime: '',
      eventNumber: '',
      trialType: 'Nosework',
      classes: [
        {
          templateId: 'tmpl-nosework',
          customizations: {
            className: 'Novice Containers',
            element: 'Containers',
            level: 'Novice',
            entryFee: 28,
          },
          judgeId: 'judge-1',
        },
      ],
    });
  });

  it('start fresh clears copied fields and selected judges', async () => {
    const user = userEvent.setup();
    render(<CloneFromShowCombobox />);

    await user.click(screen.getByRole('button', { name: /select a past show to clone/i }));
    await user.click(screen.getByText('Heartland Spring Trial'));
    await user.click(screen.getByRole('button', { name: /start fresh/i }));

    expect(mockResetWizard).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when there are no prior shows to clone', () => {
    mockShowsQueryState = { data: [], isLoading: false, isError: false };

    render(<CloneFromShowCombobox />);

    expect(screen.queryByRole('button', { name: /select a past show to clone/i })).toBeNull();
  });

  it('shows a non-blocking plain-English message when prior shows fail to load', () => {
    mockShowsQueryState = { data: [], isLoading: false, isError: true };

    render(<CloneFromShowCombobox />);

    expect(screen.getByText(/we could not load previous shows/i)).toBeVisible();
    expect(screen.getByText(/you can still enter this show manually/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: /select a past show to clone/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the new test and confirm the current gaps**

Run:

```bash
cd apps/myk9show
npx vitest run src/components/shows/wizard/steps/__tests__/CloneFromShowCombobox.test.tsx
```

Expected: the new trial/class copy assertion and failed-load assertion fail before implementation. Existing show-field assertions may already pass.

- [ ] **Step 3: Make the minimal wizard clone fix** [EXPANDED]

In `apps/myk9show/src/components/shows/wizard/steps/CloneFromShowCombobox.tsx`, read all needed query fields and actions:

```tsx
const { data: allShows = [], isLoading, isError } = useShowsQuery();
```

```tsx
const { updateShowData, addJudgeToShow, addTrial, resetWizard } = useWizardStore();
```

Before the existing empty-candidate return, add the failed-load state:

```tsx
if (isError) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">We could not load previous shows.</p>
      <p>You can still enter this show manually.</p>
    </div>
  );
}
```

Ensure `handleSelect` writes every expected show field in one `updateShowData` call:

```tsx
updateShowData({
  name: show.name,
  organization: show.organization as 'AKC' | 'UKC' | 'Other',
  location: show.location || '',
  clubId: show.clubId || '',
  preEntryFee: parseFloat(show.preEntryFee) || 0,
  dayOfShowFee: parseFloat(show.dayOfShowFee || '0') || 0,
  startingArmbandNumber: show.startingArmbandNumber ?? 100,
  acceptCheckPayments: show.acceptCheckPayments ?? false,
  acceptCashPayments: show.acceptCashPayments ?? false,
  startDate: '',
  endDate: '',
  entryOpenDate: '',
  entryCloseDate: '',
});
```

Keep the existing judge-copy loop, then add trial/class structure copying:

```tsx
if (show.trials?.length) {
  for (const trial of show.trials) {
    addTrial({
      name: trial.name || 'Trial',
      dateTime: '',
      eventNumber: '',
      trialType: trial.trialType,
      classes: (trial.classes || []).map(cls => {
        const judgeId =
          (show.assignedJudges || []).find(judge => judge.assignedClasses?.includes(cls.id))
            ?.judgeId || undefined;

        return {
          templateId: (cls as { templateId?: string }).templateId || '',
          customizations: {
            className: cls.name,
            element: cls.element,
            level: cls.level,
            entryFee: cls.entryFee,
          },
          ...(judgeId ? { judgeId } : {}),
        };
      }),
    });
  }
}
```

Update `handleStartFresh` to reset the whole wizard draft so copied trials are cleared:

```tsx
const handleStartFresh = () => {
  setClonedShowName(null);
  resetWizard();
};
```

- [ ] **Step 4: Run the focused unit test**

Run:

```bash
cd apps/myk9show
npx vitest run src/components/shows/wizard/steps/__tests__/CloneFromShowCombobox.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/myk9show/src/components/shows/wizard/steps/CloneFromShowCombobox.tsx apps/myk9show/src/components/shows/wizard/steps/__tests__/CloneFromShowCombobox.test.tsx
git commit -m "test(show-wizard): cover clone prefill behavior"
```

---

### Task 2: Remove the Duplicate Calendar Clone Dialog

**Files:**
- Modify: `apps/myk9show/src/pages/CalendarPage.tsx`
- Delete: `apps/myk9show/src/components/shows/cloning/ShowCloneDialog.tsx`
- Delete: `apps/myk9show/src/components/shows/cloning/ShowSelector.tsx`
- Delete: `apps/myk9show/src/components/shows/cloning/CloneReviewStep.tsx`
- Delete: `apps/myk9show/src/components/shows/cloning/index.ts`

**Interfaces:**
- Consumes: existing `/secretary/create-show/wizard` route
- Produces: no standalone clone dialog import or UI path remains

- [ ] **Step 1: Remove the dialog from CalendarPage**

In `apps/myk9show/src/pages/CalendarPage.tsx`:

- Remove `useState` usage for `showCloneDialog`.
- Remove the `Copy` icon import.
- Remove `import { ShowCloneDialog } from '@/components/shows/cloning';`.
- Remove the `Clone Show` button that calls `setShowCloneDialog(true)`.
- Remove `<ShowCloneDialog open={showCloneDialog} onOpenChange={setShowCloneDialog} />`.

The header actions should keep `Browse All Shows` and `New Show`:

```tsx
<div className="flex gap-2">
  <Link to="/shows/browse">
    <Button variant="outline" size="sm">
      <Trophy className="h-4 w-4 mr-2" />
      Browse All Shows
    </Button>
  </Link>

  <PermissionGuard permission={PERMISSIONS.SHOW_CREATE}>
    <Button onClick={() => navigate('/secretary/create-show/wizard')} size="sm">
      <Plus className="h-4 w-4 mr-2" />
      New Show
    </Button>
  </PermissionGuard>
</div>
```

- [ ] **Step 2: Delete the standalone clone component folder contents**

Delete these files after confirming no imports remain:

```bash
git rm apps/myk9show/src/components/shows/cloning/ShowCloneDialog.tsx
git rm apps/myk9show/src/components/shows/cloning/ShowSelector.tsx
git rm apps/myk9show/src/components/shows/cloning/CloneReviewStep.tsx
git rm apps/myk9show/src/components/shows/cloning/index.ts
```

- [ ] **Step 3: Confirm no duplicate clone surface remains**

Run:

```bash
rg -n "ShowCloneDialog|components/shows/cloning|Clone Existing Show|Review Cloned Show" apps/myk9show/src
```

Expected: no matches.

Run:

```bash
rg -n "Clone Show" apps/myk9show/src/pages apps/myk9show/src/components
```

Expected: no Calendar Page dialog button remains. Matches in docs or old archives are acceptable outside `apps/myk9show/src`.

- [ ] **Step 4: Run typecheck for removed imports**

Run:

```bash
pnpm typecheck
```

Expected: no TypeScript errors from removed imports or unused symbols.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/myk9show/src/pages/CalendarPage.tsx apps/myk9show/src/components/shows/cloning
git commit -m "refactor(shows): consolidate clone flow into wizard"
```

---

### Task 3: Add Browser Coverage and Close the Todo

**Files:**
- Modify: `apps/myk9show/src/test/e2e/secretary/show-creation-wizard.spec.ts`
- Modify: `apps/myk9show/src/test/e2e/entities/showsUI.spec.ts`
- Modify: `OPEN-TODOS.md`

**Interfaces:**
- Consumes: wizard clone behavior from Task 1
- Produces: Playwright coverage proving the user-facing flow is the wizard path, plus a documented QA gate for the cloned show appearing in the normal secretary workflow

- [ ] **Step 1: Add a wizard clone E2E test** [EXPANDED]

In `apps/myk9show/src/test/e2e/secretary/show-creation-wizard.spec.ts`, add this test inside `test.describe('Trial Secretary - Show Creation Wizard', () => { ... })`:

```ts
test('secretary can clone a previous show into the wizard and continue reviewing fields', async ({
  page,
}) => {
  await signInAsSecretary(page, '/secretary/create-show/wizard');

  const cloneTrigger = page.getByRole('button', { name: 'Select a past show to clone' });
  await expect(cloneTrigger).toBeVisible({ timeout: 15000 });
  await cloneTrigger.click();

  const search = page.getByPlaceholder('Search shows...');
  await expect(search).toBeVisible();

  const firstShow = page.locator('button').filter({ hasText: /AKC|UKC|ASCA|NACSW/i }).first();
  await expect(firstShow).toBeVisible();
  const sourceName = (await firstShow.locator('span').first().textContent())?.trim();
  expect(sourceName).toBeTruthy();
  await firstShow.click();

  await expect(page.getByText(sourceName!, { exact: true })).toBeVisible();
  await expect(page.getByLabel(/Show Name/i)).toHaveValue(sourceName!);
  await expect(page.locator('#show-dates')).toContainText(/select show start and end dates/i);
  await expect(page.locator('#show-entry-period')).toContainText(/select entry open and close dates/i);
  await expect(page.getByRole('button', { name: /^Next$/ })).toBeDisabled();
});
```

This test intentionally stops before show creation. It proves clone is a prefill-and-review flow, not a silent create action.

- [ ] **Step 2: Add a non-mutating review-step continuation check** [ADDED]

Add this second test to the same file. It fills the schedule fields after cloning and verifies the secretary can leave Step 1 for trial review without creating a show:

```ts
test('secretary can set new dates after cloning and continue to trial review', async ({ page }) => {
  await signInAsSecretary(page, '/secretary/create-show/wizard');

  const cloneTrigger = page.getByRole('button', { name: 'Select a past show to clone' });
  await expect(cloneTrigger).toBeVisible({ timeout: 15000 });
  await cloneTrigger.click();

  const firstShow = page.locator('button').filter({ hasText: /AKC|UKC|ASCA|NACSW/i }).first();
  await expect(firstShow).toBeVisible();
  await firstShow.click();

  const dates = currentMonthWizardDates();
  await selectRange(page, page.getByRole('button', { name: /Show Dates/i }), {
    start: dates.show.start.pick,
    end: dates.show.end.pick,
  });
  await selectRange(page, page.getByRole('button', { name: /Entry Period/i }), {
    start: dates.entry.start.pick,
    end: dates.entry.end.pick,
  });

  const chairmanTrigger = page.getByRole('button', { name: /Show Chairman/i });
  await chairmanTrigger.click();
  const firstChairman = page.getByText(/Suggested|All People/).locator('xpath=..').locator('button').first();
  await expect(firstChairman).toBeVisible();
  await firstChairman.click();

  await page.getByRole('button', { name: /^Next$/ }).click();
  await expect(page.getByText('Step 2 of 4', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Trial/i })).toBeVisible();
});
```

- [ ] **Step 3: Keep existing Shows UI coverage aligned**

In `apps/myk9show/src/test/e2e/entities/showsUI.spec.ts`, keep this assertion in the `New Show button opens the wizard at step 1` test:

```ts
await expect(page.getByRole('button', { name: 'Select a past show to clone' })).toBeVisible();
```

Remove any future assertion that expects a Calendar Page `Clone Show` dialog button.

- [ ] **Step 4: Run focused E2E coverage**

Run:

```bash
cd apps/myk9show
pnpm test:e2e -- src/test/e2e/secretary/show-creation-wizard.spec.ts --project=chromium
```

Expected: secretary wizard E2E file passes. If the runner hangs for more than 60 seconds without useful output, stop and report the hang.

- [ ] **Step 5: Run focused unit and type checks**

Run:

```bash
cd apps/myk9show
npx vitest run src/components/shows/wizard/steps/__tests__/CloneFromShowCombobox.test.tsx
```

Expected: pass.

Run:

```bash
pnpm typecheck
```

Expected: pass.

- [ ] **Step 6: Run the manual cloned-show appearance gate** [ADDED]

After focused tests pass, run one manual QA pass in a local/test environment. Do not run this against staging or production without explicit user confirmation because it creates a show.

Manual QA script:

1. Start the app with `pnpm dev:show`.
2. Sign in as the secretary test user.
3. Open `/secretary/create-show/wizard`.
4. Select a prior show from "Select a past show to clone."
5. Confirm show settings are prefilled and show dates/entry dates are blank.
6. Confirm copied trials/classes appear in the wizard review path.
7. Fill new dates and any required missing fields.
8. Create the show.
9. Confirm the cloned show appears in the normal secretary show list/workflow.
10. Confirm the Calendar Page does not expose a separate clone dialog.

Evidence to record in the PR:

```md
Manual QA:
- Wizard clone selected source show: <source show name>
- New cloned show appeared in secretary workflow: yes
- Separate Calendar clone dialog absent: yes
- Environment: local/test, not staging/prod
```

- [ ] **Step 7: Update OPEN-TODOS.md**

In `OPEN-TODOS.md`, change:

```md
- [ ] **Test Clone Show feature** — Manual verification that the existing Clone Show flow still works end-to-end after show-detail/dashboard consolidation: open the clone dialog, clone a representative show, confirm trials/classes/settings copied as expected, and verify the cloned show appears in the secretary workflow without duplicating any existing surface.
```

To:

```md
- [x] ~~**Test Clone Show feature**~~ — **DONE 2026-07-01.** Consolidated Clone Show into the Show Creation Wizard as the single workflow. The old Calendar Page clone dialog was removed. Wizard clone now behaves as prefill-and-review: select a previous show, copy settings plus trial/class structure, clear schedule/event-number fields that must be new, and create only after the secretary steps through the wizard. Verified with focused unit coverage, secretary wizard E2E coverage, and `pnpm typecheck`.
```

- [ ] **Step 8: Commit Task 3**

```bash
git add apps/myk9show/src/test/e2e/secretary/show-creation-wizard.spec.ts apps/myk9show/src/test/e2e/entities/showsUI.spec.ts OPEN-TODOS.md
git commit -m "test(show-wizard): verify clone consolidation"
```

---

## Final Verification

- [ ] Run:

```bash
pnpm typecheck
```

Expected: pass.

- [ ] Run:

```bash
cd apps/myk9show
npx vitest run src/components/shows/wizard/steps/__tests__/CloneFromShowCombobox.test.tsx
```

Expected: pass.

- [ ] Run:

```bash
cd apps/myk9show
pnpm test:e2e -- src/test/e2e/secretary/show-creation-wizard.spec.ts --project=chromium
```

Expected: pass or a clearly reported pre-existing infrastructure hang after 60 seconds.

- [ ] Confirm no duplicate clone UI remains:

```bash
rg -n "ShowCloneDialog|components/shows/cloning|Clone Existing Show|Review Cloned Show" apps/myk9show/src
```

Expected: no matches.

- [ ] [ADDED] Confirm manual QA evidence is present in the PR or final handoff:

```md
Manual QA:
- Wizard clone selected source show: <source show name>
- New cloned show appeared in secretary workflow: yes
- Separate Calendar clone dialog absent: yes
- Environment: local/test, not staging/prod
```
