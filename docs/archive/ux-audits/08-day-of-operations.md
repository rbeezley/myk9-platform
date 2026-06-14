# UX Audit: Day-of Operations

**Date:** 2026-04-04
**Auditor:** Claude
**Sources:** Code review of DayOfOperationsPage and sub-components
**Role context:** Secretary — "That was easy"

---

## Pass 1: Mental Model Alignment

> Does this page match how a secretary thinks about show-day chaos? On show day, the secretary needs to scratch dogs (handler no-shows), process move-ups (dog just qualified and wants to jump a level), and add walk-in entries. INTENT says these should feel like "calm one-tap operations."

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Severity | Notes                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | **Three-tab organization matches the mental model.** The tabs are "Day-of Entries," "Move-Ups," and "Scratches" — exactly the three things a secretary deals with on show morning. Tab labels use dog-show terminology, not software jargon.                                                                                                                                                                                                                                          | Pass     | Good alignment with INTENT: "use dog show terminology, not technical terminology."                                                                                                                                                |
| 1.2 | **Scratches and move-ups are NOT one-tap operations.** The INTENT document explicitly says: "Scratches, move-ups, and changes are calm one-tap operations, not multi-step wizards." The current flow is: (1) navigate to correct tab, (2) find the entry in a table, (3) click Scratch/Move Up button, (4) interact with a confirmation dialog, (5) click Confirm. That is a minimum of 4 taps for a scratch and 5 taps for a move-up (which also requires selecting a target class). | High     | This directly violates the stated INTENT. See Pass 6 for detailed tap-count analysis.                                                                                                                                             |
| 1.3 | **Show selector adds friction before anything else.** Before the secretary can do any work, they must select a show from a dropdown. On show day, there is typically one active show. The system should auto-select today's show or the only active show.                                                                                                                                                                                                                             | Medium   | The hook does auto-select the first show in the list (`data[0].id`), which partially addresses this — but "first show" is not necessarily "today's show." The query `getSecretaryShows` returns all shows, not filtered to today. |
| 1.4 | **No search/filter in scratch or move-up tables.** On a busy show day with 100+ entries, the secretary needs to find a specific dog fast — by armband number, call name, or handler. The tables use DataTable which may support search, but no search UI is explicitly wired.                                                                                                                                                                                                         | Medium   | A secretary running to the table to scratch dog #47 should be able to type "47" and see it instantly. Scanning a long table under pressure violates "That was easy."                                                              |
| 1.5 | **The page title "Day-of Operations" is correct domain language.** Secretaries know this phrase. The subtitle "Manage walk-in entries, move-ups, and scratches" further clarifies scope.                                                                                                                                                                                                                                                                                              | Pass     | Clear, no jargon.                                                                                                                                                                                                                 |

---

## Pass 2: Information Architecture

> Is the layout calm and scannable? Can the secretary see what matters at a glance?

| #   | Finding                                                                                                                                                                                                                                                                                      | Severity | Notes                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | **Tabbed layout hides two of three workflows at all times.** Scratches are the most urgent show-day action, but if the secretary is on the "Day-of Entries" tab (the default), they must switch tabs to scratch. There is no dashboard view showing counts or alerts across all three areas. | Medium   | Consider a summary header above the tabs showing counts: "3 pending scratches, 2 move-up eligible, 5 classes with open spots." This would let the secretary see the full picture without tab-switching. |
| 2.2 | **Default tab is "Day-of Entries" but the most common show-day action is scratching.** Walk-in entries are relatively rare; scratches happen constantly. The default tab should be the most-used workflow.                                                                                   | Medium   | Default to "scratches" tab, or better, show a unified dashboard view.                                                                                                                                   |
| 2.3 | **ScratchEntriesTable shows armband, dog name, call name, handler, class, check-in status, and a Scratch button.** This is the right information — armband is first (how secretaries identify entries), dog name is prominent, class context is present.                                     | Pass     | Good column priority.                                                                                                                                                                                   |
| 2.4 | **MoveUpEntriesTable shows the same columns plus "Current Class."** The handler column is hidden on medium screens (`responsiveHide: 'md'`), which is appropriate — armband is the primary identifier.                                                                                       | Pass     | Responsive hiding is thoughtful.                                                                                                                                                                        |
| 2.5 | **ClassAvailabilityTable shows class, limit, accepted, available, and status.** The "Open"/"Full" badge is a good visual shortcut.                                                                                                                                                           | Pass     | Clean capacity overview.                                                                                                                                                                                |
| 2.6 | **The Show Selector card takes significant vertical space.** It has its own Card with CardHeader ("Select Show") and CardContent wrapping a single dropdown. This is a lot of chrome for one control. On mobile, this pushes the actual work area below the fold.                            | Low      | Consider making the show selector a compact inline element in the page header instead of a full card.                                                                                                   |

---

## Pass 3: Affordance Clarity

> Are the Scratch/Move Up buttons obvious? Are touch targets adequate?

| #   | Finding                                                                                                                                                                                                                                               | Severity | Notes                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | **Scratch button uses `size="sm"` with `variant="destructive"`.** The red color signals danger/irreversibility, which is appropriate. However, `size="sm"` produces a small touch target that may violate the 44x44px minimum on mobile.              | Medium   | INTENT guardrails: "Large touch targets — minimum 44x44px, prefer 48x48px on tablet views." A `size="sm"` button is typically ~32px tall. On a hectic show day, the secretary is tapping quickly — small targets cause mis-taps. |
| 3.2 | **Move Up button uses `size="sm"` with default variant.** Same touch target size concern as 3.1.                                                                                                                                                      | Medium   | Same recommendation: increase to at least `size="default"` or add explicit min-height.                                                                                                                                           |
| 3.3 | **"Add Day-of Entry" button is appropriately sized** — default size, primary variant, positioned at the top-right of the ClassAvailabilityTable card header. Clear CTA.                                                                               | Pass     | Good placement and size.                                                                                                                                                                                                         |
| 3.4 | **Refresh button in the page header is `variant="outline"`.** It shows a spinning icon when loading. Clear affordance.                                                                                                                                | Pass     | Good feedback during loading.                                                                                                                                                                                                    |
| 3.5 | **ScratchDialog has a prominent red "Confirm Scratch" button** and an AlertCircle icon in the header. The destructive intent is visually clear.                                                                                                       | Pass     | Clear visual communication of the action's weight.                                                                                                                                                                               |
| 3.6 | **MoveUpDialog requires selecting a target class from a dropdown before the action button enables.** The disabled state on "Process Move-Up" when no class is selected is correct, but there is no visual hint explaining WHY the button is disabled. | Low      | Add helper text like "Select a target class to continue" or use a tooltip on the disabled button.                                                                                                                                |
| 3.7 | **DayOfEntryDialog dog search requires clicking a separate Search button.** The search does trigger on Enter key (`onKeyDown`), but a separate button for search is dated UX. Debounced auto-search as you type would be faster.                      | Low      | Not blocking, but "That was easy" would favor auto-search over manual trigger.                                                                                                                                                   |

---

## Pass 4: Cognitive Load

> Is the secretary seeing only what they need? Are dialogs minimal?

| #   | Finding                                                                                                                                                                                                                                                         | Severity | Notes                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | **ScratchDialog shows an optional "Reason" textarea.** This is reasonable — sometimes secretaries note "handler injury" or "bitch in season." But on show day, requiring (or even suggesting) a reason adds cognitive load to what should be an instant action. | Low      | The field is optional, which is good. But its presence on screen still creates decision fatigue ("should I write something?"). Consider hiding it behind a "Add reason" link that expands.                       |
| 4.2 | **MoveUpDialog shows entry summary, target class dropdown, and optional reason textarea.** Three pieces of UI in the dialog. The target class selection is necessary (you must pick where to move), but the optional reason field again adds visual weight.     | Low      | Same as 4.1 — consider collapsing the optional reason.                                                                                                                                                           |
| 4.3 | **DayOfEntryDialog is a multi-field form** — dog search, handler name, class selection (checkbox list), payment method, jump height, and notes. This is inherently complex because walk-in entries require this information.                                    | Pass     | Walk-in entries are genuinely multi-step. The form is organized and uses smart defaults (payment defaults to "cash," handler auto-fills from dog owner). This is acceptable complexity for an infrequent action. |
| 4.4 | **ScratchDialog description says "Day-of scratches are not eligible for refunds."** This is useful policy information presented at the right moment.                                                                                                            | Pass     | Contextual help without being preachy.                                                                                                                                                                           |
| 4.5 | **No undo for scratches.** Once confirmed, there is no visible way to un-scratch an entry from this page. The toast says "Entry scratched successfully" but offers no undo action.                                                                              | Medium   | INTENT says the secretary's target feeling is "I can handle this." A mistake with no undo creates anxiety. Consider adding an "Undo" action to the success toast (Sonner supports action buttons on toasts).     |
| 4.6 | **Error messages use `getUserFriendlyError()`.** This utility presumably converts technical errors to plain English.                                                                                                                                            | Pass     | Aligns with INTENT: "Error messages in plain English."                                                                                                                                                           |

---

## Pass 5: State Coverage

> What if there are no shows? No entries to scratch? Network failure mid-operation?

| #   | Finding                                                                                                                                                                                                                                                                                                 | Severity | Notes                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | **No shows state:** If `shows` is empty, the select dropdown renders with no options. The page shows a "Select Show" card with an empty dropdown and nothing below it. There is no empty state message like "No shows found" or "You have no upcoming shows."                                           | Medium   | A secretary arriving at this page with no shows sees a confusing empty dropdown. Should show a helpful message: "No shows assigned to you. Contact your club admin if this looks wrong."                                   |
| 5.2 | **No entries to scratch:** The ScratchEntriesTable shows "No entries available to scratch" via the DataTable `emptyState` prop.                                                                                                                                                                         | Pass     | Clean empty state.                                                                                                                                                                                                         |
| 5.3 | **No move-up eligible entries:** The MoveUpEntriesTable shows "No entries available for move-up."                                                                                                                                                                                                       | Pass     | Clean empty state.                                                                                                                                                                                                         |
| 5.4 | **No classes with open spots:** The ClassAvailabilityTable shows "No classes found." The DayOfEntryDialog's class list shows "No classes with available spots."                                                                                                                                         | Pass     | Both the table and dialog handle this case.                                                                                                                                                                                |
| 5.5 | **Network error during data load:** The `loadData` function has a `try/finally` but no `catch`. Errors propagate as unhandled promise rejections. The `finally` block clears `isLoading`, so the spinner stops, but no error is displayed to the user — the page just shows empty tables.               | High     | A network failure on show day is disastrous if the secretary doesn't know it happened. They might think there are no scratches when in fact the data simply failed to load. Add error handling with a visible error state. |
| 5.6 | **Network error during scratch/move-up:** Both dialogs use `getUserFriendlyError(error)` and show toasts on failure. The dialog stays open so the user can retry.                                                                                                                                       | Pass     | Good error recovery — the user doesn't lose their place.                                                                                                                                                                   |
| 5.7 | **Loading state:** The Refresh button shows a spinning icon when `isLoading` is true, and is disabled during loading. However, there is no loading indicator on the tables themselves — they show stale data (or empty state) with no indication that fresh data is incoming.                           | Low      | Consider a subtle loading overlay or skeleton on the active tab content during refresh.                                                                                                                                    |
| 5.8 | **Show load failure:** The `loadShows` effect silently ignores errors (no catch block). If the secretary's shows fail to load, the dropdown is empty with no explanation.                                                                                                                               | Medium   | Same concern as 5.5 — silent failure on show day is dangerous.                                                                                                                                                             |
| 5.9 | **Data is manually refreshed, not polled.** The page loads data once on show selection and then only when the user clicks Refresh or after a dialog action succeeds. There is no polling for changes from other users (e.g., another secretary scratching entries, or entries being created elsewhere). | Medium   | On show day, multiple people may be making changes. Stale data leads to confusion ("I thought I scratched that dog?"). Consider a 30-60 second polling interval, or at minimum, a visible "last updated" timestamp.        |

---

## Pass 6: Flow Integrity — Tap Count Analysis

> INTENT target: scratches and move-ups should be 1-tap operations. Walk through each flow and count taps.

### Scratch Flow (current)

| Step | Action                                                          | Tap #      |
| ---- | --------------------------------------------------------------- | ---------- |
| 1    | Navigate to "Scratches" tab (if not already there)              | 1          |
| 2    | Locate entry in the table (scanning, possibly scrolling/paging) | 0 (visual) |
| 3    | Click "Scratch" button on the entry row                         | 2          |
| 4    | ScratchDialog opens — review entry info                         | 0 (visual) |
| 5    | (Optionally type a reason)                                      | 0-N        |
| 6    | Click "Confirm Scratch"                                         | 3          |

**Total taps: 3 minimum** (if already on Scratches tab). 4 taps from another tab. INTENT target is 1 tap.

The confirmation dialog is the primary offender. INTENT explicitly lists "Confirmation dialogs for routine actions" as an anti-pattern for the Secretary role. A scratch is a routine show-day action, not a rare destructive operation.

### Move-Up Flow (current)

| Step | Action                                            | Tap #      |
| ---- | ------------------------------------------------- | ---------- |
| 1    | Navigate to "Move-Ups" tab (if not already there) | 1          |
| 2    | Locate entry in the table                         | 0 (visual) |
| 3    | Click "Move Up" button on the entry row           | 2          |
| 4    | MoveUpDialog opens — review entry info            | 0 (visual) |
| 5    | Select target class from dropdown                 | 3          |
| 6    | (Optionally type a reason)                        | 0-N        |
| 7    | Click "Process Move-Up"                           | 4          |

**Total taps: 4 minimum** (if already on Move-Ups tab). 5 from another tab. INTENT target is 1 tap.

Move-ups inherently require selecting a target class, so truly 1 tap is impossible. But the dialog adds unnecessary ceremony. The target class selection could be inline (dropdown in the table row), reducing the flow to 2-3 taps.

### Day-of Entry Flow (current)

| Step | Action                                                   | Tap # |
| ---- | -------------------------------------------------------- | ----- |
| 1    | Click "Add Day-of Entry" on the Class Availability table | 1     |
| 2    | Type dog name, click Search (or press Enter)             | 2     |
| 3    | Select dog from results                                  | 3     |
| 4    | Enter/confirm handler name                               | 4     |
| 5    | Check class(es)                                          | 5+    |
| 6    | Select payment method                                    | 6     |
| 7    | Click "Create Entry"                                     | 7     |

**Total taps: 7 minimum.** Walk-in entries are inherently complex (you need to identify the dog, pick classes, and record payment), so this is acceptable. Smart defaults help (handler auto-fills, payment defaults to "cash").

| #   | Finding                                                                                                                                                                                                                                  | Severity | Notes                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6.1 | **Scratch flow is 3-4 taps; INTENT target is 1.** The confirmation dialog is the main blocker. INTENT explicitly says "Confirmation dialogs for routine actions" is an anti-pattern for the Secretary role.                              | High     | Remove the ScratchDialog. Make the "Scratch" button in the table row execute immediately with a success toast that includes an "Undo" action (time-limited, e.g., 5 seconds). This achieves 1-tap scratch with a safety net.                                             |
| 6.2 | **Move-up flow is 4-5 taps; INTENT target is 1.** Target class selection is inherently required, but the dialog wrapper adds friction.                                                                                                   | High     | Replace MoveUpDialog with an inline dropdown in the table row. Clicking "Move Up" could expand the row to show a class picker, and selecting a class immediately processes the move-up. This reduces to 2 taps (Move Up -> select class), with an undo toast for safety. |
| 6.3 | **Tab switching adds a tap to every operation.** If the secretary needs to scratch a dog, they must first be on the Scratches tab. The tab creates a mandatory extra tap for any action not on the currently-visible tab.                | Medium   | Consider a unified view with inline actions per entry, or at minimum a search bar that works across all tabs. A secretary who hears "scratch dog #47" should be able to type "47" and act immediately, regardless of active tab.                                         |
| 6.4 | **After a successful scratch or move-up, the dialog closes and `loadData()` refetches all data.** This is correct behavior but causes the entire table to reload, potentially losing scroll position and making the secretary re-orient. | Low      | Optimistic update (remove the entry from the local list immediately) would feel more responsive than a full reload.                                                                                                                                                      |
| 6.5 | **Walk-in entry flow (7 taps) is acceptable for its complexity.** The auto-fill of handler name from dog owner and the "cash" payment default reduce friction. The checkbox class selection allows multi-class entry in one pass.        | Pass     | Good use of smart defaults. This flow is inherently multi-step and the form handles it well.                                                                                                                                                                             |
| 6.6 | **No keyboard shortcuts for power users.** A secretary working through a stack of scratches could benefit from keyboard navigation: arrow keys to select entries, "S" to scratch, etc.                                                   | Low      | Not required for MVP, but would further serve "That was easy" for high-volume show days.                                                                                                                                                                                 |

---

## Summary

### Overall Assessment

The Day-of Operations page has sound information architecture and uses correct domain terminology. The three-tab layout (entries, move-ups, scratches) maps to the secretary's mental model. However, the page fundamentally violates its core INTENT target: **scratches and move-ups are supposed to be 1-tap operations, but they currently require 3-5 taps each, with confirmation dialogs that INTENT explicitly lists as an anti-pattern.** The page feels more like an admin panel than a show-day crisis tool.

The most impactful fix is removing the confirmation dialogs for scratch and move-up, replacing them with immediate action + undo toast. This single architectural change would cut tap counts in half and align the page with the "That was easy" intent.

### Findings by Severity

#### High (4)

| #   | Finding                                                                                                                                     | Recommendation                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1.2 | Scratches and move-ups are 3-5 taps instead of INTENT-target 1 tap. Confirmation dialogs are explicitly listed as a Secretary anti-pattern. | Remove confirmation dialogs. Execute scratch/move-up on button click. Add undo action to the success toast (5-second window). |
| 5.5 | Network errors during data load are silently swallowed. Page shows empty tables with no error indication.                                   | Add try/catch to `loadData` with visible error state: "Could not load data. Tap to retry."                                    |
| 6.1 | Scratch flow requires 3 taps minimum (button -> dialog -> confirm). INTENT says 1 tap.                                                      | Inline scratch: button click executes immediately, toast with undo.                                                           |
| 6.2 | Move-up flow requires 4 taps minimum (button -> dialog -> class select -> confirm). INTENT says 1 tap.                                      | Inline move-up: button click expands row with class picker, selecting a class executes immediately, toast with undo.          |

#### Medium (7)

| #   | Finding                                                                                           | Recommendation                                                                                             |
| --- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1.3 | Show selector does not auto-select today's show.                                                  | Filter `getSecretaryShows` to today's date, or sort today's shows first. Auto-select the first today-show. |
| 1.4 | No search/filter in scratch or move-up tables for quick armband/dog lookup.                       | Add a search input above the tables that filters by armband number, dog name, or handler.                  |
| 2.1 | Tabbed layout hides two of three workflows; no summary dashboard showing counts across all areas. | Add a summary bar above tabs: "3 scratches pending / 2 move-ups eligible / 5 classes open."                |
| 2.2 | Default tab is "Day-of Entries" but scratches are the most common show-day action.                | Default to "scratches" tab, or use a unified dashboard.                                                    |
| 3.1 | Scratch button uses `size="sm"` — likely under 44x44px minimum touch target.                      | Use `size="default"` or add `className="min-h-[44px]"`.                                                    |
| 3.2 | Move Up button uses `size="sm"` — same touch target concern.                                      | Same fix as 3.1.                                                                                           |
| 4.5 | No undo capability for scratches. A mistake has no recovery path visible on this page.            | Add undo action to success toast, or add an "Undo Last Scratch" button.                                    |
| 5.1 | Empty shows state shows a blank dropdown with no explanation.                                     | Show "No shows assigned to you" message with guidance.                                                     |
| 5.8 | Show load failure is silent — no error toast or message.                                          | Add error handling to `loadShows` with visible feedback.                                                   |
| 5.9 | Data is not polled — stale data from other users is invisible.                                    | Add 30-60 second polling interval or "last updated" timestamp.                                             |

#### Low (7)

| #   | Finding                                                                        | Recommendation                                              |
| --- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| 2.6 | Show Selector card is heavy chrome for a single dropdown.                      | Move to a compact inline selector in the page header.       |
| 3.6 | MoveUpDialog disabled button gives no hint why it is disabled.                 | Add helper text explaining class selection is required.     |
| 3.7 | Dog search in DayOfEntryDialog requires manual search button click.            | Add debounced auto-search as user types.                    |
| 4.1 | ScratchDialog "Reason" textarea adds decision fatigue to a fast action.        | Hide behind an "Add reason" expandable link.                |
| 4.2 | MoveUpDialog "Reason" textarea — same concern.                                 | Same recommendation as 4.1.                                 |
| 5.7 | No loading indicator on tables during refresh — stale data shows with no hint. | Add subtle loading overlay or skeleton during data refresh. |
| 6.4 | Full data reload after each action loses scroll position.                      | Use optimistic updates to remove/move entries locally.      |
| 6.6 | No keyboard shortcuts for power-user scratch/move-up workflows.                | Consider keyboard navigation for high-volume days.          |

### Quick Wins

1. **Remove ScratchDialog** (6.1) — Change `handleScratchClick` to call `scratchEntry` directly, show success toast with undo action. Eliminates the biggest INTENT violation. Estimated effort: 1-2 hours.
2. **Increase button touch targets** (3.1, 3.2) — Change `size="sm"` to `size="default"` on Scratch and Move Up buttons. 2-minute fix.
3. **Add error handling to data loading** (5.5, 5.8) — Wrap `loadData` and `loadShows` in try/catch with `toast.error`. 15-minute fix.
4. **Default to Scratches tab** (2.2) — Change `defaultValue="entries"` to `defaultValue="scratches"`. 1-minute fix.
5. **Auto-filter to today's shows** (1.3) — Sort or filter shows list to prioritize today's date. 15-minute fix.
