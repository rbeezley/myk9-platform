# Plan 001: Extract Basic Show Info section and mutation handlers out of ShowDetailsStep.tsx

> **Status:** Active <!-- [ADDED] myK9 plan-hygiene convention (CLAUDE.md): every plan is born tagged -->

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `docs/plan-show-details-step-extraction/README.md`.
>
> **Drift check (run first)**: `git diff --stat fb144d4d1..HEAD -- apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.sections.tsx apps/myk9show/src/components/shows/wizard/steps/__tests__/ShowDetailsStep.payment.test.tsx`
> <!-- [EXPANDED] added the payment test file to the drift check — it's quoted verbatim in
> "Current state" as the regression guard and is load-bearing for Step 2's verification;
> if it drifted, the quoted className assertions may no longer match. -->
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `fb144d4d1`, 2026-06-30

## Why this matters

`ShowDetailsStep.tsx` (486 LOC) is the show-creation-wizard's first step. It was flagged by a churn×size hotspot scan (47 commits in 6 months, second-highest LOC among untouched hotspots) as a file that keeps absorbing changes without ever having had a dedicated decomposition pass — unlike its sibling `ShowDetailsPage.tsx`, which was recently split across five PRs (#1032–#1036).

The file is not actually disorganized — it already delegates to four sibling modules (`ShowDetailsStep.types.ts`, `.helpers.ts`, `.sections.tsx`, `.FeeField.tsx`) plus three child components (`CloneFromShowCombobox`, `OfficialPicker`, `JudgesPicker`). What's left bulking it out is two distinct, separable concerns living inline in the same component:

1. **~185 lines of pure markup** for the "Basic Show Information" card (show name, organization, dates, fees, premium style, armband number, location) — lines 211–395 — that has no sibling extraction the way "Club Information" already does (`ClubSection`, in `ShowDetailsStep.sections.tsx`).
2. **Four async mutation handlers** (`handleCreateClub`, `handleCreateOfficialPerson`, `handleSaveJudgeCredentials`, `handleCreateNewJudge`, lines 128–198, ~70 lines) that call `createUser`/`updateUser`/`createJudgeQualification`/`createClub` directly — this is exactly the shape the repo already has a named convention for: a colocated `use<Name>Actions.ts` hook (see `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts`).

Pulling these two concerns out mirrors the file's own existing pattern (it already does this for `ClubSection`) rather than inventing a new structure, brings it from 486 to roughly 230 LOC, and gives `ShowDetailsStep.tsx` a single remaining job: own wizard-store-derived state (search terms, scoped clubs, auto-fill effects) and compose sections.

**No duplication with `ShowDetailsPage.tsx` was found.** That file is the post-creation show *viewer/manager* (tabs, stats, audience routing for an existing show); this file is the pre-creation wizard *step* that builds a draft `show` object in `wizardStore`. They share no logic or component — this is two different concerns on two different pages, not a "one concern, two places" situation, so no link-instead-of-duplicate fix applies here.

## Current state

- `apps/myk9show/src/store/wizardStore.ts` — `interface WizardState` (line 18) is **not exported**, and its `show` field (lines 25-46) is an inline anonymous object type with no exported name. The only existing internal reference to this shape is `WizardState['show']`, used in an unexported helper at line 288 (`function ensureShowDefaults<T extends { show: WizardState['show'] }>`). No file outside `wizardStore.ts` can currently name this type. <!-- [ADDED] discovered live by the Plan 001 executor run on 2026-06-30: it correctly hit the STOP condition in Step 1 rather than inventing a type, see docs/plan-show-details-step-extraction/README.md "Execution log" -->
- `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx` (486 lines) — the file being split.
- `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.sections.tsx` (193 lines) — already exports `ClubSection` (a `React.FC` taking primitive/callback props, no store access) using a shared style-constants block at the top:
  ```ts
  // file: ShowDetailsStep.sections.tsx, lines 13-18
  const CARD_CLASS = '';
  const OVERLAY_CLASS = 'hidden';
  const HEADING_CLASS = 'text-lg font-semibold mb-4 text-foreground';
  const CREATE_BTN_CLASS = 'w-full border-primary/20 text-primary hover:bg-primary/5';
  ```
  This is the exemplar for the new `BasicShowInfoSection` you will add to this same file in Step 1.
- `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts` — exemplar for a colocated `use<Name>Actions.ts` hook: a `useCallback`-wrapped set of async handlers, no JSX, imports its own service calls. Match its shape (hook returning an object of named callbacks), not its specific domain logic.
- `apps/myk9show/src/components/shows/wizard/steps/__tests__/ShowDetailsStep.payment.test.tsx` — existing test. It renders `<ShowDetailsStep />` (no props beyond the mocked stores) and asserts on **exact className strings** of DOM nodes inside the Basic Show Information grid and the Show Officials grid (lines 110–127 of that test file):
  ```tsx
  // file: __tests__/ShowDetailsStep.payment.test.tsx, lines 110-127
  const basicGrid = screen.getByLabelText(/show name/i).closest('[class*="grid"]');
  expect(basicGrid?.className).toContain('grid-cols-1');
  expect(basicGrid?.className).toContain('md:grid-cols-2');

  const showDatesGroup = screen.getByText(/show dates/i).closest('div');
  expect(showDatesGroup?.className).toContain('md:col-span-2');
  ```
  This test must keep passing **unmodified** — it is the regression guard that the extraction produced the exact same rendered DOM. Do not edit this test file as part of this plan; if it fails, that means the extraction changed markup, which is a STOP condition (see below), not something to "fix" by editing the test's expectations.
- Current handler block to extract (`ShowDetailsStep.tsx:128-198`):
  ```tsx
  const handleCreateClub = async (data: CreateClubData): Promise<void> => {
    const result = await createClub({ name: data.name, email: data.email });
    if (result.error) throw result.error;
    await loadClubs();
    updateShowData({ clubId: result.data!.id });
    logger.debug('Club created and selected', 'wizard', { clubName: data.name });
  };

  const handleCreateOfficialPerson = async (data: {
    firstName: string;
    lastName: string;
    email: string;
  }): Promise<string> => {
    const result = await createUser({
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
    });
    if (result.error) throw result.error;
    await loadPeople();
    return result.data!.id;
  };

  const handleSaveJudgeCredentials = async (
    personId: string,
    data: { organization: string; judgeNumber: string; email: string }
  ): Promise<void> => {
    if (!data.judgeNumber.trim()) throw new Error('Judge number is required');
    await createJudgeQualification({
      person_id: personId,
      organization: data.organization,
      qualification_level: 'General',
      disciplines: [],
      judge_number: data.judgeNumber,
      date_obtained: new Date().toISOString().split('T')[0],
      is_active: true,
    });
    const person = people.find(p => p.id === personId);
    if (data.email && !person?.email) {
      await updateUser(personId, { email: data.email });
    }
    await loadPeople();
  };

  const handleCreateNewJudge = async (data: {
    firstName: string;
    lastName: string;
    organization: string;
    judgeNumber: string;
    email: string;
  }): Promise<string> => {
    if (!data.judgeNumber.trim()) throw new Error('Judge number is required');
    const result = await createUser({
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
    });
    if (result.error) throw result.error;
    const personId = result.data!.id;
    await createJudgeQualification({ /* same shape as above */ });
    await loadPeople();
    return personId;
  };
  ```
  All four depend only on `people` (read) and `loadClubs`/`loadPeople`/`updateShowData` (from `useClubStore`/`useUserStore`/`useWizardStore`) plus the three `@/services/database/*` calls already imported at the top of the file. None depend on local component state (`clubSearchTerm`, `showClubSearch`) — they are safe to lift into a standalone hook with no prop drilling beyond what the hook itself pulls from the stores.
- Current markup block to extract (`ShowDetailsStep.tsx:211-395`, the "Basic Show Information" `<div>` — name, organization, dates, fees, premium style, armband, location). It reads `show`, `dateRangeValid`, `entryDatesValid` and calls `updateShowData`; it does not read any other local state.

## Commands you will need

| Purpose   | Command                                                                                       | Expected on success |
|-----------|--------------------------------------------------------------------------------------------------|----------------------|
| Typecheck | `pnpm typecheck` (run from repo root)                                                          | exit 0, no errors    |
| Lint      | `pnpm lint`                                                                                     | exit 0               |
| Tests     | `cd apps/myk9show && npx vitest run src/components/shows/wizard/steps/__tests__/ShowDetailsStep.payment.test.tsx` | all pass, 0 failures |
| Full app tests (final gate only) | `cd apps/myk9show && pnpm test`                                       | exit 0, no new failures |

## Scope

**In scope** (the only files you should modify or create):
- `apps/myk9show/src/test/components/wizard/wizardThemingA11y.test.ts` (modify — line 92 only; see Step 6 below) <!-- [ADDED] unblocks the STOP condition the run-2 executor correctly hit on the final pnpm test gate -->
- `apps/myk9show/src/store/wizardStore.ts` (modify — add exactly one new named type export; see Step 0 below. Do not touch anything else in this file.) <!-- [ADDED] unblocks the STOP condition the first executor run correctly hit -->
- `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx` (modify — remove extracted code, compose new pieces)
- `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.sections.tsx` (modify — add `BasicShowInfoSection` export alongside existing `ClubSection`)
- `apps/myk9show/src/components/shows/wizard/steps/useShowDetailsStepActions.ts` (create — the new mutation-handler hook)
- `apps/myk9show/src/components/shows/wizard/steps/__tests__/useShowDetailsStepActions.test.ts` (create — new unit tests)

**Out of scope** (do NOT touch, even though they look related):
- `apps/myk9show/src/components/shows/wizard/steps/__tests__/ShowDetailsStep.payment.test.tsx` — must keep passing unmodified; do not edit its assertions to make a different DOM shape pass.
- `apps/myk9show/src/pages/ShowDetailsPage.tsx` and its `ShowDetails/*` components — confirmed unrelated concern (post-creation show viewer, not the creation wizard). No changes needed there.
- `ShowDetailsStep.helpers.ts`, `ShowDetailsStep.types.ts`, `ShowDetailsStep.FeeField.tsx`, `CloneFromShowCombobox.tsx`, `OfficialPicker.tsx`, `JudgesPicker.tsx` — already appropriately scoped; do not refactor them as part of this plan.
- The `useEffect` auto-fill/auto-select logic (club auto-select, secretary auto-fill, club/people loading) — leave these in `ShowDetailsStep.tsx`; they are wizard-lifecycle concerns, not section markup or mutation handlers, and moving them is out of scope.

## Git workflow

- Branch: create a feature branch per repo convention (see recent `git log --oneline -10` for examples, e.g. `refactor/show-details-step-extraction`).
- Commit per step below; message style follows Conventional Commits as used throughout this repo, e.g.: `refactor(show-wizard): extract ShowDetailsStep Basic Info section`.
- Do NOT push or open a PR unless the operator instructed it.
- **Recovery if you must stop mid-plan** <!-- [ADDED] rollback/recovery gap surfaced by /verify-plan -->:
  committing after each verified step (above) means the branch is never more than
  one step's work away from a known-good state. If a STOP condition fires:
  1. Do **not** `git reset --hard` past your last successful commit — that
     commit is the recovery point a human will want to inspect.
  2. Leave the failing step's changes **uncommitted** (or `git stash` them with
     a note in your report) rather than discarding them — the diff itself is
     useful evidence for whoever picks this up.
  3. In your report, state which step failed, the exact verification command
     output, and the last commit SHA that was green.

## Steps

### Step 0: Export a named type for `wizardStore`'s `show` field <!-- [ADDED] -->

`apps/myk9show/src/store/wizardStore.ts:18` declares `interface WizardState` without `export`, and its `show` field (lines 25-46) is an inline anonymous object — there is currently no name anything outside this file can use to reference that shape. Step 1 below needs one.

Add, directly above `interface WizardState` (around line 17), a single new exported type alias:

```ts
export type ShowDraft = WizardState['show'];
```

This is a forward reference (TypeScript allows referencing `WizardState` before its declaration in the same module) — do not reorder or duplicate the interface. Do not export `WizardState` itself, and do not change anything else in this file: no other field, no other interface, no logic.

**Verify**: `pnpm typecheck` → exit 0.
**Verify**: `grep -n "export type ShowDraft" apps/myk9show/src/store/wizardStore.ts` → exactly one match.
**Verify**: `git -C . diff --stat -- apps/myk9show/src/store/wizardStore.ts` → exactly one file, and the diff (`git diff -- apps/myk9show/src/store/wizardStore.ts`) shows only the one added line (plus whatever blank-line/import adjustment is mechanically required) — no other lines touched.

### Step 1: Extract `BasicShowInfoSection` into `ShowDetailsStep.sections.tsx`

Add a new exported component to `ShowDetailsStep.sections.tsx`, following the exact shape of the existing `ClubSection` (props interface + `React.FC`, using the file's shared `HEADING_CLASS` constant). It must render **byte-identical markup** to `ShowDetailsStep.tsx:211-395` (the same JSX, just moved) — do not "clean up" classNames or structure, since `ShowDetailsStep.payment.test.tsx` asserts on the exact className strings.

Props interface (name it `BasicShowInfoSectionProps`):
```ts
interface BasicShowInfoSectionProps {
  show: ShowDraft; // import from '@/store/wizardStore' — added in Step 0 of this plan
  dateRangeValid: boolean;
  entryDatesValid: boolean;
  onUpdate: (patch: Partial<ShowDraft>) => void; // maps to updateShowData
}
```
`ShowDraft` must come from Step 0's new export in `@/store/wizardStore` — do not invent or duplicate a type. (Step 0 must be complete and verified before this step.)

Move into this component, verbatim:
- The full "Basic Show Information" `<div>` block (`ShowDetailsStep.tsx:211-395`), including the `PREMIUM_STYLE_OPTIONS`/`PREMIUM_STYLE_LABEL_BY_VALUE`/`getPremiumStyleLabel` helpers (`ShowDetailsStep.tsx:46-57`) — move these three module-scope declarations to `ShowDetailsStep.sections.tsx` since they are only used by this section.
- All imports this block needs that aren't already imported in `ShowDetailsStep.sections.tsx`: `Input`, `Textarea`, `Select`/`SelectContent`/`SelectItem`/`SelectTrigger`/`SelectValue`, `DateRangePicker`, `HelpCircle`, `Tooltip`/`TooltipContent`/`TooltipProvider`/`TooltipTrigger`, `ORGANIZATIONS` (from `./ShowDetailsStep.types`), `FeeField` (from `./ShowDetailsStep.FeeField`), `getPremiumStyleOptions`/`resolvePremiumStyle`/`PremiumStyle` (from `@/types/premium-types`).

**Verify**: `pnpm typecheck` → exit 0 (this will fail until Step 2 also updates `ShowDetailsStep.tsx` to use the new export — if a transient error about an unused export appears, that's expected until Step 2; do not treat that alone as a STOP condition for this step, but resolve it by completing Step 2 immediately after).

### Step 2: Replace inline markup in `ShowDetailsStep.tsx` with `<BasicShowInfoSection />`

In `ShowDetailsStep.tsx`:
- Remove the moved JSX block and the three module-scope premium-style helpers (now living in `.sections.tsx`).
- Remove now-unused imports (`Input`, `Textarea`, `Select*`, `DateRangePicker`, `HelpCircle`, `Tooltip*`, `ORGANIZATIONS`, `FeeField`, `getPremiumStyleOptions`/`resolvePremiumStyle`/`PremiumStyle` — keep any of these only if still used elsewhere in the file; check before deleting).
- Import `BasicShowInfoSection` from `./ShowDetailsStep.sections` (it will sit alongside the existing `ClubSection` import).
- Render it in place of the removed block:
  ```tsx
  <BasicShowInfoSection
    show={show}
    dateRangeValid={dateRangeValid}
    entryDatesValid={entryDatesValid}
    onUpdate={updateShowData}
  />
  ```

**Verify**: `pnpm typecheck` → exit 0.
**Verify**: `cd apps/myk9show && npx vitest run src/components/shows/wizard/steps/__tests__/ShowDetailsStep.payment.test.tsx` → all pass (this is the DOM-shape regression guard — if it fails, the extracted markup diverged from the original; treat as a STOP condition, do not edit the test).

### Step 3: Create `useShowDetailsStepActions.ts`

Create `apps/myk9show/src/components/shows/wizard/steps/useShowDetailsStepActions.ts`. Follow the shape of `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts` (a hook returning an object of `useCallback`-wrapped async functions; no JSX in this file).

Move `handleCreateClub`, `handleCreateOfficialPerson`, `handleSaveJudgeCredentials`, `handleCreateNewJudge` (current `ShowDetailsStep.tsx:128-198`) into this hook verbatim (same logic, same error handling — do not change behavior). The hook signature:

```ts
export function useShowDetailsStepActions() {
  const { loadClubs } = useClubStore();
  const { people, loadPeople } = useUserStore();
  const { updateShowData } = useWizardStore();

  const handleCreateClub = useCallback(async (data: CreateClubData): Promise<void> => { /* moved body */ }, [loadClubs, updateShowData]);
  const handleCreateOfficialPerson = useCallback(async (data: { firstName: string; lastName: string; email: string }): Promise<string> => { /* moved body */ }, [loadPeople]);
  const handleSaveJudgeCredentials = useCallback(async (personId: string, data: { organization: string; judgeNumber: string; email: string }): Promise<void> => { /* moved body, still reads `people` */ }, [people, loadPeople]);
  const handleCreateNewJudge = useCallback(async (data: { firstName: string; lastName: string; organization: string; judgeNumber: string; email: string }): Promise<string> => { /* moved body */ }, [loadPeople]);

  return { handleCreateClub, handleCreateOfficialPerson, handleSaveJudgeCredentials, handleCreateNewJudge };
}
```

Move the corresponding imports too: `createUser`, `updateUser` (from `@/services/database/users`), `createJudgeQualification` (from `@/services/database/judges`), `createClub` (from `@/services/database/clubs`), `CreateClubData` (from `./ShowDetailsStep.sections`), `logger` (from `@/services/LoggingService`) — only if still used; `handleCreateClub` calls `logger.debug`, check whether `logger` is still needed in `ShowDetailsStep.tsx` itself (it is — `logger.debug('ShowDetailsStep component loaded', 'wizard')` at the top stays) so keep the import there too, and add it fresh to the new hook file.

**Verify**: `pnpm typecheck` → exit 0 (will fail until Step 4 wires the hook back in — proceed immediately to Step 4).

### Step 4: Wire the hook into `ShowDetailsStep.tsx`

In `ShowDetailsStep.tsx`:
- Remove the four moved handler functions and their now-unused direct imports (`createUser`, `updateUser`, `createJudgeQualification`, `createClub` — keep `createClub`'s sibling `CreateClubData` type import only if still referenced directly; it likely isn't once the hook owns it).
- Import and call the new hook: `const { handleCreateClub, handleCreateOfficialPerson, handleSaveJudgeCredentials, handleCreateNewJudge } = useShowDetailsStepActions();`
- Confirm `people` is still imported/used directly in `ShowDetailsStep.tsx` for the `selectedJudges` memo and `OfficialPicker`/`JudgesPicker` props (`people={people}`) — it is, so the `useUserStore()` destructure stays in `ShowDetailsStep.tsx` too (the hook has its own independent `useUserStore()` call; this is an accepted minor duplication of store access, not of logic — Zustand selector hooks are cheap and idiomatic to call from multiple places in this codebase, see `useShowCreationWizardActions.ts` doing the same alongside its owning page).

**Verify**: `pnpm typecheck` → exit 0.
**Verify**: `pnpm lint` → exit 0.
**Verify**: `wc -l apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx` → expect roughly 220–250 lines (down from 486).
**Verify**: `cd apps/myk9show && npx vitest run src/components/shows/wizard/steps/__tests__/ShowDetailsStep.payment.test.tsx` → all pass.

### Step 5: Write unit tests for `useShowDetailsStepActions`

Create `apps/myk9show/src/components/shows/wizard/steps/__tests__/useShowDetailsStepActions.test.ts`. Use `@testing-library/react`'s `renderHook` (check an existing hook test in the repo for the exact import/setup pattern, e.g. search `renderHook` under `apps/myk9show/src/hooks/__tests__/` for a model) and mock `@/services/database/users`, `@/services/database/judges`, `@/services/database/clubs`, `@/store/clubStore`, `@/store/userStore`, `@/store/wizardStore` the same way `ShowDetailsStep.payment.test.tsx` mocks the stores.

Cover:
- `handleCreateClub`: calls `createClub` with `{ name, email }`, throws on `result.error`, calls `loadClubs()` and `updateShowData({ clubId })` on success.
- `handleCreateOfficialPerson`: calls `createUser`, throws on error, calls `loadPeople()`, returns the new id.
- `handleSaveJudgeCredentials`: throws `'Judge number is required'` when `judgeNumber` is blank/whitespace; calls `createJudgeQualification` with the right shape; calls `updateUser` only when the person has no existing email and one was provided; always calls `loadPeople()`.
- `handleCreateNewJudge`: throws on blank judge number before calling `createUser`; calls `createUser` then `createJudgeQualification`; returns the new person id.

**Verify**: `cd apps/myk9show && npx vitest run src/components/shows/wizard/steps/__tests__/useShowDetailsStepActions.test.ts` → all pass, all four handlers covered.

### Step 6: Re-point the pinned-string a11y guard at its markup's new home <!-- [ADDED] -->

`apps/myk9show/src/test/components/wizard/wizardThemingA11y.test.ts` is a source-text regression test (`fs.readFileSync`-based, not a render test) that pins exact className literals across several wizard files — it was not in this plan's original file inventory, so Steps 1-2 correctly moved the "Basic Show Information" validation-error markup without knowing this test existed. Line 92 currently reads:

```ts
expect(showDetailsStep).toContain('text-sm text-destructive mt-1');
```

`showDetailsStep` (line 17 of that file) is `read(path.join(stepsDir, 'ShowDetailsStep.tsx'))`. After Steps 1-2, that exact className string (the "Start date must be before end date" / "Entry open date must be before close date" paragraphs) no longer lives in `ShowDetailsStep.tsx` — it moved to `ShowDetailsStep.sections.tsx` along with the rest of the Basic Show Information block, and this test was never told.

This file already has the exact precedent for this situation, a few lines above (lines 21-28): when the validation-banner markup was extracted out of `ShowCreationWizardPage` into a sibling component, a comment explains it and a new `read()` was added:

```ts
// The validation-banner disclosure was extracted out of ShowCreationWizardPage
// into its own sibling component; the a11y guard follows the markup to its new
// home. The pinned aria string-literals stay byte-identical.
const validationBanner = read(
  path.join(
    __dirname,
    '../../../pages/secretary/ShowCreationWizard/WizardValidationBanner.tsx'
  )
);
```

Do the same here:

1. Add a new `read()` near line 17-18 (alongside `showDetailsStep`):
   ```ts
   const basicShowInfoSection = read(path.join(stepsDir, 'ShowDetailsStep.sections.tsx'));
   ```
2. Change line 92 to assert against the new variable instead:
   ```ts
   expect(basicShowInfoSection).toContain('text-sm text-destructive mt-1');
   ```
3. Leave line 91 (`expect(showDetailsStep).not.toContain('text-red-500')`) untouched — it's a negative assertion against the file as a whole and is unaffected by the move.
4. Touch only these two lines plus the one new `const` line. Do not edit any other assertion in this file.

**Verify**: `cd apps/myk9show && npx vitest run src/test/components/wizard/wizardThemingA11y.test.ts` → all pass.
**Verify**: `git diff -- apps/myk9show/src/test/components/wizard/wizardThemingA11y.test.ts` → shows only the one added `const` line and the one changed assertion target — no other lines touched.

## Test plan

- New file: `useShowDetailsStepActions.test.ts` (Step 5) — unit tests for the four extracted handlers, modeled after the mocking pattern in `ShowDetailsStep.payment.test.tsx` (lines 1–57) for store mocks, and any existing `renderHook`-based hook test in `apps/myk9show/src/hooks/__tests__/` for hook-testing structure.
- Existing file `ShowDetailsStep.payment.test.tsx` is the regression guard for the markup extraction (Step 1–2) — it must pass unmodified.
- Final verification: `cd apps/myk9show && pnpm test` → exit 0, no new failures anywhere (confirms nothing else imports the moved symbols by relative path in a way that broke).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `cd apps/myk9show && npx vitest run src/components/shows/wizard/steps/__tests__/ShowDetailsStep.payment.test.tsx` — all pass, unmodified file
- [ ] `cd apps/myk9show && npx vitest run src/components/shows/wizard/steps/__tests__/useShowDetailsStepActions.test.ts` — all pass, covers all 4 handlers
- [ ] `cd apps/myk9show && pnpm test` exits 0
- [ ] `wc -l apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx` reports a value under 260
- [ ] `grep -n "handleCreateClub\|handleCreateOfficialPerson\|handleSaveJudgeCredentials\|handleCreateNewJudge" apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx` returns no function *definitions* in this file (only the destructured call to `useShowDetailsStepActions()` and the JSX prop usages)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `docs/plan-show-details-step-extraction/README.md` status row updated, and (per CLAUDE.md) the plan's `> **Status:**` line flipped to `Complete` and the file `git mv`'d into `docs/archive/plan-show-details-step-extraction/` once merged <!-- [ADDED] plan-hygiene close-out step -->
- [ ] `docs/README.md` row for this plan removed once archived <!-- [ADDED] plan-hygiene close-out step -->

## STOP conditions

Stop and report back (do not improvise) if:

- The code at `ShowDetailsStep.tsx:211-395` or `:128-198`, or `wizardStore.ts:18-46`, doesn't match the excerpts in "Current state" (the file has drifted since this plan was written — re-run the drift check command at the top of this plan).
- `ShowDetailsStep.payment.test.tsx` fails after Step 2 and the cause is a genuine markup/className difference (not a flaky/unrelated failure) — this means the extraction changed rendered output, which this plan explicitly must not do.
- Step 0's `git diff` on `wizardStore.ts` shows more than the one added export line — STOP rather than let an unrelated change ride along.
- Any of the four handlers turn out to be referenced from a file other than `ShowDetailsStep.tsx` (e.g. via re-export) — this plan assumes they are private to this component.
- A step's verification fails twice after a reasonable fix attempt. Follow the recovery procedure in "Git workflow" above before reporting.

## Maintenance notes

- If a future change adds a fifth "create X inline" handler to this wizard step (e.g. inline steward creation), it belongs in `useShowDetailsStepActions.ts`, not back in `ShowDetailsStep.tsx` — keep the convention this plan establishes.
- `BasicShowInfoSection` and `ClubSection` now share the `HEADING_CLASS`/style constants in `ShowDetailsStep.sections.tsx` — if a future design pass changes section heading styling, it only needs to change in one place.
- This plan does not touch the `useEffect` auto-fill/auto-select block or the search-term `useState` pair left in `ShowDetailsStep.tsx` — if those grow further, a follow-up plan extracting them into a `useShowDetailsStepClubAutoSelect`-style hook would be the natural next step, but two extractions in one pass is enough for one review.
- A reviewer should scrutinize: that `useCallback` dependency arrays in the new hook are correct (stale closures on `people` in `handleSaveJudgeCredentials` would silently use an outdated person list — write the corresponding test in Step 5 with a *changing* `people` list across renders, not just a static mock, so this would actually be caught), and that no behavior changed in error handling (all four handlers must still throw the same errors under the same conditions).
- This is a pure refactor with no behavior change, no new endpoints, no schema/migration, and no deploy/env steps — operational and security review surface for this PR should be limited to "did the DOM/behavior actually stay identical," not broader system risk.
