# Fix 3 Potential Source Bugs — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 3 bugs discovered during test cleanup: broken trial-limit enforcement, ambiguous waitlist response, and missing label accessibility.

**Architecture:** Pure bugfixes in existing files. No new files. No architectural changes.

**Tech Stack:** TypeScript, React, Vitest

**Design doc:** `docs/plans/2026-02-18-fix-potential-bugs-design.md`

---

### Task 1: Fix `isEntryInTrial` — Trial Limits Never Enforced

**Files:**

- Modify: `apps/myk9show/src/services/entries/EntryLimitChecker.ts:577-586`
- Modify: `apps/myk9show/src/test/services/entries/entryLimitChecker.test.ts`

**Step 1: Update test expectations to assert correct trial enforcement**

In `entryLimitChecker.test.ts`, find the test "should enforce trial-level per-dog limits" (around line 366). The test currently asserts the bug behavior (`isAllowed: true`). Change it to assert correct behavior.

Replace lines 366-410 with:

```typescript
it('should enforce trial-level per-dog limits', () => {
  mockTrial.maxEntriesPerDog = 2;
  // Populate trial.classes so isEntryInTrial can match
  mockTrial.classes = [
    { id: 'class-0', name: 'Class 0' } as Class,
    { id: 'class-1', name: 'Class 1' } as Class,
    { id: mockClass.id, name: mockClass.name } as Class,
  ];

  // Dog already has 2 entries in this trial's classes
  mockEntries = Array.from({ length: 2 }, (_, i) => ({
    id: `entry-${i}`,
    showId: mockShow.id,
    classId: `class-${i}`,
    dogId: mockDog.id,
    status: 'confirmed',
    registrationData: {
      submittedAt: new Date().toISOString(),
      handler: 'Handler',
      entryFee: 25.0,
      paymentStatus: 'paid',
    },
    statusHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })) as ShowEntry[];

  testContext.existingEntries = mockEntries;

  const entryData: ShowEntryInput = {
    showId: mockShow.id,
    classId: mockClass.id,
    dogId: mockDog.id,
    registrationData: {
      submittedAt: new Date().toISOString(),
      handler: 'Handler',
      entryFee: 25.0,
      paymentStatus: 'pending',
    },
  };

  const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

  expect(result.isAllowed).toBe(false);
  expect(result.errors.some(e => e.code === 'DOG_TRIAL_LIMIT_EXCEEDED')).toBe(true);
});
```

Similarly update "should enforce trial total entry limits" (around line 455) — replace the assertion block:

```typescript
it('should enforce trial total entry limits', () => {
  mockTrial.maxTotalEntries = 3;
  // Populate trial.classes so isEntryInTrial can match
  mockTrial.classes = [{ id: mockClass.id, name: mockClass.name } as Class];

  // Trial already has 3 entries
  mockEntries = Array.from({ length: 3 }, (_, i) => ({
    id: `entry-${i}`,
    showId: mockShow.id,
    classId: mockClass.id,
    dogId: `dog-${i}`,
    status: 'confirmed',
    registrationData: {
      submittedAt: new Date().toISOString(),
      handler: `Handler ${i}`,
      entryFee: 25.0,
      paymentStatus: 'paid',
    },
    statusHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })) as ShowEntry[];

  testContext.existingEntries = mockEntries;

  const entryData: ShowEntryInput = {
    showId: mockShow.id,
    classId: mockClass.id,
    dogId: 'new-dog',
    registrationData: {
      submittedAt: new Date().toISOString(),
      handler: 'New Handler',
      entryFee: 25.0,
      paymentStatus: 'pending',
    },
  };

  const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

  expect(result.isAllowed).toBe(false);
  expect(result.errors.some(e => e.code === 'TRIAL_FULL')).toBe(true);
});
```

Update "should not warn about trial-level handler limits" (around line 588) — rename and fix:

```typescript
it('should warn about trial-level handler limits when approaching max', () => {
  mockTrial.maxEntriesPerHandler = 2;
  // Populate trial.classes so isEntryInTrial can match
  mockTrial.classes = [
    { id: 'other-class', name: 'Other Class' } as Class,
    { id: mockClass.id, name: mockClass.name } as Class,
  ];

  // Handler already has 2 entries in trial classes (at limit)
  mockEntries = [
    {
      id: 'existing-entry-1',
      showId: mockShow.id,
      classId: 'other-class',
      dogId: 'existing-dog-1',
      status: 'confirmed',
      registrationData: {
        submittedAt: new Date().toISOString(),
        handler: 'Test Handler',
        handlerId: 'handler-001',
        entryFee: 25.0,
        paymentStatus: 'paid',
      },
      statusHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'existing-entry-2',
      showId: mockShow.id,
      classId: mockClass.id,
      dogId: 'existing-dog-2',
      status: 'confirmed',
      registrationData: {
        submittedAt: new Date().toISOString(),
        handler: 'Test Handler',
        handlerId: 'handler-001',
        entryFee: 25.0,
        paymentStatus: 'paid',
      },
      statusHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ] as ShowEntry[];

  testContext.existingEntries = mockEntries;

  const entryData: ShowEntryInput = {
    showId: mockShow.id,
    classId: mockClass.id,
    dogId: 'new-dog',
    registrationData: {
      submittedAt: new Date().toISOString(),
      handler: 'Test Handler',
      handlerId: 'handler-001',
      entryFee: 25.0,
      paymentStatus: 'pending',
    },
  };

  const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

  expect(result.warnings.some(w => w.code === 'HANDLER_TRIAL_LIMIT_APPROACHING')).toBe(true);
});
```

Update "should not warn about trial nearly full" (around line 863) — rename and fix:

```typescript
it('should warn when trial is nearly full', () => {
  mockTrial.maxTotalEntries = 10;
  // Populate trial.classes so isEntryInTrial can match
  mockTrial.classes = [{ id: mockClass.id, name: mockClass.name } as Class];

  // Fill trial to 90% capacity (9 entries)
  mockEntries = Array.from({ length: 9 }, (_, i) => ({
    id: `entry-${i}`,
    showId: mockShow.id,
    classId: mockClass.id,
    dogId: `dog-${i}`,
    status: 'confirmed',
    registrationData: {
      submittedAt: new Date().toISOString(),
      handler: `Handler ${i}`,
      entryFee: 25.0,
      paymentStatus: 'paid',
    },
    statusHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })) as ShowEntry[];

  testContext.existingEntries = mockEntries;

  const entryData: ShowEntryInput = {
    showId: mockShow.id,
    classId: mockClass.id,
    dogId: 'new-dog',
    registrationData: {
      submittedAt: new Date().toISOString(),
      handler: 'New Handler',
      entryFee: 25.0,
      paymentStatus: 'pending',
    },
  };

  const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

  expect(result.warnings.some(w => w.code === 'TRIAL_NEARLY_FULL')).toBe(true);
});
```

Remove all `// POTENTIAL-BUG:` comments from the test file (they were markers for the bugs we're now fixing).

**Step 2: Run test to verify failures**

Run: `cd apps/myk9show && pnpm vitest run src/test/services/entries/entryLimitChecker.test.ts`
Expected: 4 tests FAIL (trial enforcement doesn't work yet)

**Step 3: Fix `isEntryInTrial` and `isEntryDataInTrial` in source**

In `EntryLimitChecker.ts`, replace lines 577-586:

```typescript
  private static isEntryInTrial(entry: ShowEntry, trial: Trial): boolean {
    if (!trial.classes) return false;
    return trial.classes.some(c => c.id === entry.classId);
  }

  private static isEntryDataInTrial(entryData: ShowEntryInput, trial: Trial): boolean {
    if (!trial.classes) return false;
    return trial.classes.some(c => c.id === entryData.classId);
  }
```

**Step 4: Run test to verify passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/services/entries/entryLimitChecker.test.ts`
Expected: ALL tests PASS

**Step 5: Commit**

```bash
git add apps/myk9show/src/services/entries/EntryLimitChecker.ts apps/myk9show/src/test/services/entries/entryLimitChecker.test.ts
git commit -m "fix: enforce trial-level entry limits via trial.classes lookup

isEntryInTrial() was using classId.includes(trialId) which always
returned false. Now checks trial.classes array for membership."
```

---

### Task 2: Add `isWaitlisted` to `EntryLimitCheckResult`

**Files:**

- Modify: `apps/myk9show/src/services/entries/EntryLimitChecker.ts:21-28, 80-87, 216`
- Modify: `apps/myk9show/src/hooks/useOfflineEntryCreation.ts` (early returns)
- Modify: `apps/myk9show/src/test/services/entries/entryLimitChecker.test.ts`

**Step 1: Add test assertions for `isWaitlisted`**

In `entryLimitChecker.test.ts`, add `isWaitlisted` assertions to 3 existing tests:

In "should allow entry when class has available capacity" (line ~87-93), add:

```typescript
expect(result.isWaitlisted).toBe(false);
```

In "should reject entry when class is full and waitlist not allowed" (line ~129-135), add:

```typescript
expect(result.isWaitlisted).toBe(false);
```

In "should allow waitlist when class is full but waitlist enabled" (line ~175-182), add:

```typescript
expect(result.isWaitlisted).toBe(true);
```

**Step 2: Run test to verify failures**

Run: `cd apps/myk9show && pnpm vitest run src/test/services/entries/entryLimitChecker.test.ts`
Expected: 3 tests FAIL (`isWaitlisted` not yet on result type)

**Step 3: Add `isWaitlisted` to interface and implementation**

In `EntryLimitChecker.ts`, add `isWaitlisted` to the `EntryLimitCheckResult` interface (after line 22):

```typescript
export interface EntryLimitCheckResult {
  isAllowed: boolean;
  isWaitlisted: boolean;
  errors: EntryLimitError[];
  warnings: EntryLimitError[];
  currentCount?: number | undefined;
  maxAllowed?: number | undefined;
  waitlistPosition?: number | undefined;
}
```

In `checkEntryLimits` return (around line 80-87), compute `isWaitlisted`:

```typescript
const isWaitlisted = warnings.some(w => w.code === 'CLASS_FULL_WAITLIST');

return {
  isAllowed: errors.length === 0,
  isWaitlisted,
  errors,
  warnings,
  currentCount: capacityCheck.currentCount,
  maxAllowed: capacityCheck.maxAllowed,
  waitlistPosition: capacityCheck.waitlistPosition,
};
```

In `useOfflineEntryCreation.ts`, add `isWaitlisted: false` to both early-return objects (around lines 237-243 and 256-263):

```typescript
      return {
        isAllowed: false,
        isWaitlisted: false,
        errors: [{ ... }],
        warnings: [],
      };
```

**Step 4: Run test + typecheck to verify**

Run: `cd apps/myk9show && pnpm vitest run src/test/services/entries/entryLimitChecker.test.ts`
Expected: ALL tests PASS

Run: `pnpm typecheck`
Expected: 0 errors

**Step 5: Commit**

```bash
git add apps/myk9show/src/services/entries/EntryLimitChecker.ts apps/myk9show/src/hooks/useOfflineEntryCreation.ts apps/myk9show/src/test/services/entries/entryLimitChecker.test.ts
git commit -m "fix: add isWaitlisted flag to EntryLimitCheckResult

Callers can now distinguish confirmed vs waitlisted entries without
inspecting warnings array."
```

---

### Task 3: Fix `AddDogDialog` Label Accessibility

**Files:**

- Modify: `apps/myk9show/src/components/dogs/AddDogDialog.tsx`
- Modify: `apps/myk9show/src/test/components/dogs/AddDogDialog.test.tsx`

**Step 1: Add accessibility test assertions**

In `AddDogDialog.test.tsx`, add a new test in the Accessibility describe block:

```typescript
    it('should associate labels with form controls via htmlFor', () => {
      render(<AddDogDialog {...defaultProps} />);
      // Labels with htmlFor should find their associated input
      expect(screen.getByLabelText(/call name/i)).toBeInTheDocument();
    });
```

Also update existing tests that use placeholder-based queries or `document.querySelector` to use `getByLabelText` instead. Specifically:

- Replace `screen.getByPlaceholderText('Everyday name')` with `screen.getByLabelText(/call name/i)` where used for the call name input
- Replace `document.querySelector('input[type="date"]')` with `screen.getByLabelText(/date of birth/i)`
- Remove all `// POTENTIAL-BUG:` comments from the test file

**Step 2: Run test to verify failures**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/dogs/AddDogDialog.test.tsx`
Expected: Tests using `getByLabelText` FAIL (labels not associated yet)

**Step 3: Add `htmlFor` and `id` to AddDogDialog**

In `AddDogDialog.tsx`, add `htmlFor` to each `<Label>` and `id` to each form control:

Line 335: `<Label>Call Name` → `<Label htmlFor="add-dog-call-name">Call Name`
Line 337: `<Input` → `<Input id="add-dog-call-name"`

Line 349: `<Label>Gender` → `<Label htmlFor="add-dog-gender">Gender`
Line 354: `<SelectTrigger` → `<SelectTrigger id="add-dog-gender"`

Line 368: `<Label>Date of Birth` → `<Label htmlFor="add-dog-dob">Date of Birth`
Line 370: `<Input` (type="date") → `<Input id="add-dog-dob"`

Line 386: `<Label>Color` → `<Label htmlFor="add-dog-color">Color`
Line 388: `<Input` → `<Input id="add-dog-color"`

Line 398: `<Label>Owner` (secretary section) → `<Label htmlFor="add-dog-owner">Owner`
Line 403: `<SelectTrigger` → `<SelectTrigger id="add-dog-owner"`

Line 498: `<Label>Height` → `<Label htmlFor="add-dog-height">Height`
Line 500: `<Input` → `<Input id="add-dog-height"`

Line 509: `<Label>Weight` → `<Label htmlFor="add-dog-weight">Weight`
Line 511: `<Input` → `<Input id="add-dog-weight"`

Line 522: `<Label>Microchip` → `<Label htmlFor="add-dog-microchip">Microchip`
Line 524: `<Input` → `<Input id="add-dog-microchip"`

**Step 4: Run test to verify passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/dogs/AddDogDialog.test.tsx`
Expected: ALL tests PASS

**Step 5: Commit**

```bash
git add apps/myk9show/src/components/dogs/AddDogDialog.tsx apps/myk9show/src/test/components/dogs/AddDogDialog.test.tsx
git commit -m "fix(a11y): associate labels with form controls in AddDogDialog

Added htmlFor to all Label components and id to all form controls.
Screen readers can now associate labels with their inputs."
```

---

### Task 4: Update `docs/potential-bugs.md` and Run Full Suite

**Files:**

- Modify: `docs/potential-bugs.md`

**Step 1: Update the bugs doc**

Replace `docs/potential-bugs.md` contents to mark bugs 1-3 as fixed and bug 4 as closed:

```markdown
# Potential Bugs Found During Test Cleanup

Discovered during the fix-or-delete pass on 441 skipped myK9Show tests (2026-02-18).

## Status: All Resolved (2026-02-18)

| #   | Bug                                                  | Resolution                                  |
| --- | ---------------------------------------------------- | ------------------------------------------- |
| 1   | `isEntryInTrial()` — trial limits never enforced     | Fixed: now checks `trial.classes` array     |
| 2   | `checkClassCapacity()` — ambiguous waitlist response | Fixed: added `isWaitlisted` to result       |
| 3   | `AddDogDialog` — labels missing `htmlFor`            | Fixed: added `htmlFor`/`id` to all controls |
| 4   | `useTransitionPrefetch` — untestable logging         | Closed: `logger.debug()` is correct pattern |
```

**Step 2: Run full test suite**

Run: `cd apps/myk9show && pnpm vitest run`
Expected: ALL tests PASS, 0 failures, 0 skips

**Step 3: Run quality gates**

Run: `pnpm typecheck && pnpm lint`
Expected: 0 errors

**Step 4: Commit**

```bash
git add docs/potential-bugs.md
git commit -m "docs: mark all potential bugs as resolved"
```
