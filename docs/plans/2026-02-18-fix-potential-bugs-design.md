# Fix 3 Potential Source Bugs

Discovered during test cleanup (2026-02-18). Documented in `docs/potential-bugs.md`.

## Bug #1: `isEntryInTrial()` — Trial Limits Never Enforced

**File:** `apps/myk9show/src/services/entries/EntryLimitChecker.ts`

**Root cause:** `entry.classId.includes(trial.id)` performs string substring matching between unrelated UUIDs. Always returns `false`.

**Impact:** All trial-level limit checks silently bypassed: per-dog trial limits, total trial entry limits, handler limits per trial, "trial nearly full" warnings.

**Data model:** `ShowEntry` has `classId` (no `trialId`). `Trial` has `classes?: Class[]`. The correct way to check if an entry belongs to a trial is to check if its `classId` matches any class in the trial's `classes` array.

**Fix:** Replace both `isEntryInTrial` and `isEntryDataInTrial`:

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

## Bug #2: `checkClassCapacity()` — Ambiguous Waitlist Response

**File:** `apps/myk9show/src/services/entries/EntryLimitChecker.ts`

**Root cause:** When `allowWaitlist=true` and the class is full, `isAllowed: true` is returned with a `CLASS_FULL_WAITLIST` warning. Callers cannot distinguish "confirmed entry" from "waitlisted entry" without inspecting warnings.

**Fix:** Add `isWaitlisted: boolean` to `EntryLimitCheckResult`:

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

Return values:

- Class has room: `isAllowed: true, isWaitlisted: false`
- Class full + waitlist allowed: `isAllowed: true, isWaitlisted: true, waitlistPosition: N`
- Class full + no waitlist: `isAllowed: false, isWaitlisted: false`

Backward-compatible: existing callers checking only `isAllowed` continue to work.

## Bug #3: `AddDogDialog` — Labels Missing `htmlFor`

**File:** `apps/myk9show/src/components/dogs/AddDogDialog.tsx`

**Root cause:** 7 `<Label>` components lack `htmlFor` attributes; corresponding `<Input>`/`<Select>` elements lack `id` attributes.

**Fix:** Add `id` to each form control and `htmlFor` to each `<Label>`:

| Field         | id                  | htmlFor             |
| ------------- | ------------------- | ------------------- |
| Call Name     | `add-dog-call-name` | `add-dog-call-name` |
| Gender        | `add-dog-gender`    | `add-dog-gender`    |
| Date of Birth | `add-dog-dob`       | `add-dog-dob`       |
| Color         | `add-dog-color`     | `add-dog-color`     |
| Owner         | `add-dog-owner`     | `add-dog-owner`     |
| Height        | `add-dog-height`    | `add-dog-height`    |
| Weight        | `add-dog-weight`    | `add-dog-weight`    |
| Microchip     | `add-dog-microchip` | `add-dog-microchip` |

Note: The Checkbox at line 534 already correctly has `id="spayedNeutered"` and `htmlFor="spayedNeutered"`.

## Bug #4: `useTransitionPrefetch` — Closed (Not a Bug)

Using `logger.debug()` is the correct pattern. Tests should mock the logger if needed. Remove from `docs/potential-bugs.md`.

## Testing

- Update `entryLimitChecker.test.ts`: verify trial limits now enforce correctly with `trial.classes` populated
- Update tests referencing `EntryLimitCheckResult` to include `isWaitlisted`
- Update `AddDogDialog` tests to verify `htmlFor`/`id` associations
