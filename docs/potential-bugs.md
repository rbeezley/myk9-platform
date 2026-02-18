# Potential Bugs Found During Test Cleanup

Discovered during the fix-or-delete pass on 441 skipped myK9Show tests (2026-02-18).
These are cases where the test expectation made more sense than the actual source behavior.

## 1. `EntryLimitChecker.isEntryInTrial()` — Trial Limits Never Enforced

**File:** `apps/myk9show/src/services/entries/EntryLimitChecker.ts`

The `isEntryInTrial()` method checks `entry.classId.includes(trial.id)`, which always returns `false` when classId and trialId are unrelated strings (e.g., `"class-1".includes("trial-1")` is false). This means all trial-level limit checks are silently bypassed:

- Per-dog trial limits
- Total trial entry limits
- Handler limits per trial
- "Trial nearly full" warnings

**Impact:** Users could exceed trial capacity without any warning or enforcement.

## 2. `EntryLimitChecker.checkClassCapacity()` — Ambiguous Waitlist Response

**File:** `apps/myk9show/src/services/entries/EntryLimitChecker.ts`

When `allowWaitlist=true` and the class is full, the method returns `{ isAllowed: true }` with a `CLASS_FULL_WAITLIST` warning. This makes it impossible for callers to distinguish "confirmed entry allowed" from "waitlisted entry — you'll be on the waitlist."

**Impact:** UI may not show correct messaging about waitlist status.

## 3. `AddDogDialog` — Labels Missing `htmlFor` Association

**File:** `apps/myk9show/src/components/dogs/AddDogDialog.tsx`

Label components in AddDogDialog lack `htmlFor` attributes, meaning inputs are not programmatically associated with their labels. This fails accessibility requirements — screen readers cannot associate labels with their form controls, and clicking labels doesn't focus the corresponding input.

**Impact:** Accessibility (a11y) issue — screen reader users may struggle with the form.

## 4. `useTransitionPrefetch` — Untestable Logging

**File:** `apps/myk9show/src/hooks/animations/usePageTransition.ts`

The hook uses `logger.debug()` for prefetch logging instead of `console.log`. This means tests cannot spy on prefetch events via `console.log`, making prefetch behavior untestable without mocking the logger. Minor issue — affects test observability, not end-user behavior.
