# UX Fixes — Shows Pages

**Date:** 2026-04-07
**Scope:** 4 confirmed fixes from the 15-issue UX audit in `docs/UX_FIXES_shows.md`

---

## Background

An AI-generated UX audit flagged 15 issues across `/shows`, `/shows/:id`, and `/shows/:id/register`. After verifying each against current code, 4 are confirmed real and worth fixing. The remaining 11 are false positives, already fixed, or too minor.

## Fixes

### 1. P1-02 — Default dog filter shows 0 results for new entrants

**File:** `apps/myk9show/src/components/shows/RegistrationWorkflow/DogSearchInterface.tsx`

**Problem:** Line 67 sets `quickFilter: 'registered'` as the default. The "registered" filter shows dogs already entered in this show — which is 0 for any first-time entrant. Users see "7 dogs" in the count but the list is empty because all their dogs are unregistered for this show.

**Fix:** Change default `quickFilter` from `'registered'` to `''` (no filter / all dogs). This shows every accessible dog immediately. The filter tabs remain available for narrowing.

Also update the reset function (line 299) which resets to `'registered'` — change to `''`.

### 2. P2-01 — "Register" button shown after entry already submitted

**File:** `apps/myk9show/src/pages/ShowDetailsPage.tsx`

**Problem:** Line 292 always uses `label: 'Register'` for the primary action. When a user already has entries for this show (indicated by the "Entry Submitted" badge), the button still says "Register" — conflicting signals that cause confusion about whether the entry was saved.

**Fix:** At line 291-293, where `entryStatus.canEnter` gates the primary action, add a second condition: when `hasUserEntries` is true (line 140), use `label: 'Manage Entry'` instead of `'Register'`. The `onClick` still navigates to `/shows/${showId}/register` — the wizard handles viewing/editing existing entries. When `!entryStatus.canEnter && hasUserEntries`, also show a "View Entry" button so users can still access their submission.

### 3. P2-03 — Currency formatting broken/inconsistent

**Files:**

- `apps/myk9show/src/components/shows/browse/ShowCardHorizontal.tsx` (lines 87-92)
- Show detail page fee display (find via grep for `preEntryFee` or `dayOfShowFee` rendering)

**Problem:** Show card renders fees as `<DollarSign icon> 10` (icon + space + number = "$ 10"). Show detail page renders fees as plain `10` with no currency symbol. Day-of-show fee renders as `"Day of show: 20"` with no symbol.

**Fix:** Create a shared `formatCurrency` utility (or use an existing one if present) that wraps `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })`. Replace the DollarSign icon + raw number pattern with the formatted string. Apply consistently to all fee displays: show card, show detail hero/info, and day-of-show fee.

Check if a `formatCurrency` utility already exists in `apps/myk9show/src/utils/` or `packages/core/src/` before creating a new one.

### 4. P3-04 — Empty states generic across dog filter tabs

**File:** `apps/myk9show/src/components/shows/RegistrationWorkflow/DogSelectionStepEnhanced.tsx`

**Problem:** Line 545 shows "Try adjusting your search terms or filters." regardless of which quick filter is active. Users on the "Registered" tab see a generic empty message instead of being directed to the "Unregistered" tab.

**Fix:** Pass the active `quickFilter` value into the empty state and render tab-specific messages:

- **All dogs (no filter):** "You don't have any dogs yet. Add a dog from your profile to get started."
- **Registered:** "None of your dogs are entered in this show yet. Clear the filter to see all your dogs."
- **Unregistered:** "All your dogs are already entered in this show."
- **Recent:** "No recently active dogs found. Clear the filter to see all your dogs."
- **Search with no results:** "No dogs match your search. Try a different name or breed."

---

## Closed Issues (11)

| #     | Issue                                 | Reason                                                               |
| ----- | ------------------------------------- | -------------------------------------------------------------------- |
| P1-01 | Dog list clipped off-screen           | Normal full-page scroll. Wizard is not a dialog.                     |
| P2-02 | "Open" vs "Accepting Entries"         | Minor terminology mismatch, low user impact                          |
| P2-04 | "TBD" / "Unknown Judge" labels        | Data-driven — correct behavior when no judge assigned                |
| P2-05 | Show name validation                  | Already has required marker + placeholder text                       |
| P3-01 | Sidebar nav no aria-labels            | Links have visible text content, not icon-only                       |
| P3-02 | Tab keyboard navigation               | Shadcn/Radix handles WAI-ARIA tab pattern correctly                  |
| P3-03 | All Shows/My Shows toggle duplication | MineToggle (ownership) and tabs (category) serve different purposes  |
| P3-05 | "Load Draft (5)" unexplained count    | Common UI pattern, minor                                             |
| P4-01 | Duplicate H1/H2                       | Likely only one heading visible; needs visual check but low priority |
| P4-02 | Date filter no presets                | Already has Upcoming/This Month/Next Month presets                   |
| P4-03 | "(Max: 1000 dogs)" prominent          | Minor subtitle noise, dynamic value already used                     |

## Testing

Each fix needs unit tests:

- **P1-02:** Test that `DogSearchInterface` renders with no active quick filter by default
- **P2-01:** Test that `ShowDetailsPage` renders "Manage Entry" when user has existing entries
- **P2-03:** Test that fee values are formatted with currency symbol (no DollarSign icon)
- **P3-04:** Test that each quick filter tab shows its specific empty state message
