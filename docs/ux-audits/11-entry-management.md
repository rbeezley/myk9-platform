# UX Audit: Entry Management

**Date:** 2026-04-04
**Auditor:** Claude
**Sources:** Code review of EntryManagementPage.tsx
**Role context:** Secretary -- "That was easy"

---

## Pass 1: Mental Model Alignment

Does the UI match what a trial secretary expects when managing show entries? Does the terminology and layout map to how secretaries think about their workflow?

| #   | Finding                                              | Severity | Detail                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | **"Actions" dropdown label is misleading**           | Medium   | Each entry row has a `Select` with `placeholder="Actions"` but it only contains status changes (Accept, Waitlist, Reject, Missing Info). Secretaries expect "Actions" to include operations like edit, view details, or send email. The dropdown is really "Change Status" but wears a generic label.                                                                |
| 1.2 | **"Registration view" vs "Roster view" terminology** | Low      | The `viewMode` state toggles between `registration`, `roster`, and `scoring` based on trial/class filter selection. This implicit mode switching may confuse a secretary who expects to explicitly choose a view. Selecting a trial silently changes the entire page layout from registration cards to a roster table with no visible mode indicator or explanation. |
| 1.3 | **Owner vs Handler distinction is correct**          | --       | Entry cards show both "Owner" and "Handler" separately. This matches dog show semantics where the handler is often different from the owner. Good.                                                                                                                                                                                                                   |
| 1.4 | **"Comp Entry" terminology is domain-correct**       | --       | Secretaries use "comp" to describe waiving fees for judges, workers, and guests. The Gift icon and comp dialog with reason field match the real workflow. Good.                                                                                                                                                                                                      |
| 1.5 | **Stats card labels match secretary mental model**   | --       | Total, Pending, Accepted, Waitlist, Revenue -- these are the exact numbers a secretary wants at a glance. Good.                                                                                                                                                                                                                                                      |
| 1.6 | **"Issues" tab has no definition**                   | Medium   | The tab labeled "Issues" shows a count from `isIssueEntry()` but the page never explains what constitutes an "issue." A secretary needs to know: is this missing payment? Missing info? Conflicting data? The predicate is imported from `entryPredicates.ts` and opaque from the UI perspective.                                                                    |

---

## Pass 2: Information Architecture

Is content grouped the way secretaries think? What is hidden that should be visible? What is visible that should be hidden?

| #   | Finding                                                   | Severity | Detail                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | **Show selector forces an extra step**                    | Medium   | Every visit begins with a show selector dropdown, even when the URL contains `showId`. The `useEntryManagementData` hook resolves from URL param or localStorage, but the full "Select Show" card with its header and description always renders prominently, consuming vertical space. When a show is already selected, this card should collapse or move to a compact header position.                            |
| 2.2 | **Filter card and tab filters are redundant**             | Medium   | The page has three overlapping filter layers: (1) the EntryFiltersCard with search, status dropdown, and payment dropdown, (2) the Tabs bar (All, Pending, Accepted, Waitlist, etc.), and (3) the Trial/Class dropdowns. A secretary filtering to "Pending" via tabs and also setting status filter to "Pending" in the filter card will get confusing results. These interact but the relationship is not visible. |
| 2.3 | **Header buttons compete for attention**                  | Medium   | The page header has four buttons side-by-side: "New Entry," "Refresh," "Auto-Assign Armbands," and "Export CSV." All are the same size. The primary action (New Entry) should be visually dominant. "Refresh" is a utility action that could be a simple icon button. On narrower screens these will likely wrap badly.                                                                                             |
| 2.4 | **Seven tabs is high for a work page**                    | Medium   | The TabsList renders 7 columns: All, Pending, Accepted, Waitlist, Move-Ups, Scratches, Issues. At `grid-cols-7` each tab gets very narrow, especially with count badges. On typical laptop screens, text will truncate. The Move-Ups and Scratches tabs are specialized workflows that could be accessed via a secondary menu rather than top-level tabs.                                                           |
| 2.5 | **Bulk actions bar appears conditionally, may be missed** | Low      | The blue bulk actions bar only appears when `selectedEntries.size > 0`. This is correct behavior, but the bar appears between the filters and the tabs -- a secretary might not notice it appeared, especially if they scrolled past the filter area. No animation or scroll-into-view call draws attention to it.                                                                                                  |
| 2.6 | **CSV export produces incomplete data**                   | High     | The `handleExportCSV` function builds a CSV with 15 columns but leaves 4 columns blank: Registration #, Owner First Name, Owner Last Name, Owner Email, Owner Phone. The code has comments acknowledging these are "not available in export query." A secretary exporting entries for a premium list or report gets a file with missing critical data and no warning.                                               |

---

## Pass 3: Affordance Clarity

Can users tell what is interactive? Check buttons, links, clickable elements.

| #   | Finding                                                      | Severity | Detail                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.1 | **Check-in status indicator is clickable but looks static**  | High     | In `EntryListCard`, each class's check-in status is wrapped in a bare `<button>` with only `hover:scale-105` as the interactive affordance. The `CheckInStatusIndicator` component renders a badge -- it looks like a status display, not a clickable element. No cursor-pointer class is set on the button. Secretaries will not discover they can click to change check-in status. |
| 3.2 | **Armband assign button is icon-only with no label**         | Medium   | The armband button renders just a `<Hash>` icon with `variant="ghost"` and a `title` attribute ("Assign Armband"). Ghost buttons with only an icon are easy to miss. On touch devices, the title tooltip is not visible. This is a common secretary action that deserves a visible label or at least an icon + abbreviated label.                                                    |
| 3.3 | **Comp/uncomp buttons are identical icons**                  | Medium   | Both the "Comp Entry" and "Remove Comp" buttons use the same `<Gift>` icon. The only difference is a `text-destructive` class on the uncomp variant. For a secretary scanning quickly, two identical gift icons with different semantic meanings creates confusion. The uncomp action should use a different icon or have a strikethrough visual.                                    |
| 3.4 | **"Send Email" bulk button does nothing**                    | High     | In `RegistrationView`, the bulk actions bar includes a "Send Email" button that has no `onClick` handler. It renders as an interactive button but clicking it does nothing. This is a dead control that will frustrate secretaries.                                                                                                                                                  |
| 3.5 | **List/Table view toggle lacks labels**                      | Low      | The view toggle renders two icon-only buttons (`List` and `Table2` icons). While the toggle group pattern is recognizable, adding sr-only labels or tooltips would improve accessibility. The `h-8 px-2` sizing (32px height) is below the 44px minimum touch target from INTENT.md.                                                                                                 |
| 3.6 | **Roster class names are clickable buttons styled as links** | Low      | In `TrialRosterView`, class group headers are `<button>` elements styled as links (`text-primary hover:underline`). This is functional but the affordance is ambiguous -- is it a link to the class page or a filter action? It actually sets the class filter, changing the view to scoring mode.                                                                                   |

---

## Pass 4: Cognitive Load

How many decisions per screen? Are there smart defaults? What requires explanation?

| #   | Finding                                                 | Severity | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | **No smart default for show selection**                 | --       | The hook persists the last-used show to localStorage and restores it on return. URL param takes precedence. This is good -- the secretary does not need to reselect the show on every visit. Good.                                                                                                                                                                                                                                                |
| 4.2 | **Three filter systems require mental model switching** | High     | A secretary must understand: (1) tabs filter by entry status, (2) the filter card's status dropdown also filters by status but operates independently, (3) trial/class dropdowns change the entire view mode. These three systems are not coordinated. Setting a status in the filter card while on the "Pending" tab creates a compound filter with no visible summary of the combined state.                                                    |
| 4.3 | **Status change has no confirmation or undo**           | Medium   | `handleStatusChange` optimistically updates the entry status with no confirmation dialog. This aligns with the INTENT.md anti-pattern of avoiding "confirmation dialogs for routine actions" -- which is good. However, there is also no undo/toast with undo option. If a secretary accidentally rejects an entry via the status dropdown, the only recourse is to manually change it back. A toast with "Undo" would balance speed with safety. |
| 4.4 | **Auto-Assign Armbands lacks preview**                  | Medium   | The auto-assign dialog only asks for a starting number. It does not preview how many entries will be affected, what range will be assigned, or whether any existing armbands will be skipped. For a high-stakes batch operation on the night before a trial, this lack of preview creates anxiety -- the opposite of "That was easy."                                                                                                             |
| 4.5 | **Entry list card shows all detail at once**            | Medium   | Each entry in list view shows: entry number, dog name, armband, owner, handler, class count, fees, entry status badge, payment status badge, email status icon, comp badge, notes badge, check-in status per class, and action buttons. This is approximately 10-12 pieces of information per row. Scanning 50+ entries with this density is fatiguing. A collapsed/expanded pattern or summary row with drill-down would reduce cognitive load.  |
| 4.6 | **Bulk status change dialog closes after selection**    | Low      | The bulk status change dialog contains a Select that immediately fires `onBulkAction` when a value is chosen. There is no "Apply" button. While this is fast, it is also easy to accidentally trigger. The dialog description says "Change status for N entries" but the action is instant on selection. For destructive bulk operations (e.g., rejecting 20 entries), this is risky.                                                             |

---

## Pass 5: State Coverage

Check empty, loading, success, partial, and error states for each major component.

| Component               | Loading                                    | Empty                              | Error                            | Partial/Edge                     | Notes                                                                                                                            |
| ----------------------- | ------------------------------------------ | ---------------------------------- | -------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **EntryManagementPage** | Spinner (`Loader2` centered)               | "Select a Show" card with icon     | Destructive `Alert` with message | --                               | Loading and empty states covered. Error state shows at top of page but is generic -- no retry button, just a text message.       |
| **RegistrationView**    | No own loading state (parent handles)      | Delegated to EntryListCard         | No error handling                | --                               | Relies entirely on parent for state management.                                                                                  |
| **EntryListCard**       | No loading state                           | "No entries match" with icon       | No error state                   | --                               | Empty state is good. Missing: loading state when switching tabs, no error handling if entry data is malformed.                   |
| **EntriesTableView**    | No loading state                           | DataTable handles empty internally | No error state                   | --                               | Relies on DataTable component for empty handling.                                                                                |
| **EntryStatsCards**     | No loading state                           | Shows zeros (acceptable)           | N/A (pure render)                | --                               | Zero state is fine -- "0 Pending" is meaningful.                                                                                 |
| **TrialRosterView**     | Skeleton loader (good)                     | "No entries for this trial" text   | No error state                   | --                               | Loading state is good with skeleton. Empty state is minimal but adequate.                                                        |
| **TrialClassFilters**   | "Loading trials..." / "Loading classes..." | "No trials" option                 | No error state                   | Trial loaded but classes loading | Good loading indicators in select options. No error state if query fails.                                                        |
| **ArmbandDialog**       | Spinner on button                          | N/A                                | No visible error                 | --                               | Processing state shown on button. Errors set via `setError` which shows at the page level -- the dialog may have closed by then. |
| **AutoArmbandDialog**   | Spinner on button                          | N/A                                | No visible error                 | --                               | Same issue as ArmbandDialog -- errors bubble to page-level alert after dialog closes.                                            |
| **BulkCheckInDialog**   | Spinner on button                          | N/A                                | No visible error                 | --                               | Same pattern.                                                                                                                    |
| **CompEntryDialog**     | Button disabled when processing            | N/A                                | No visible error                 | --                               | Same pattern.                                                                                                                    |

| #   | Finding                                                    | Severity | Detail                                                                                                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | **Error messages are generic and technical**               | Medium   | All error states produce strings like "Failed to load entries," "Failed to assign armband," "Failed to bulk check-in." These are developer-facing messages, not secretary-facing. INTENT.md requires plain English: e.g., "We couldn't save that. Tap to try again." The messages should describe what the secretary can do about it.   |
| 5.2 | **Dialog errors appear at page level after dialog closes** | High     | When an action in a dialog fails (e.g., armband assignment), the error is set via `setError()` which renders as an `Alert` at the top of the page. But the dialog closes on success OR navigates away. On failure, the dialog stays open but the error appears behind it at the page level. The secretary may not see the error at all. |
| 5.3 | **No loading transition between tab switches**             | Low      | Switching tabs instantly filters the entry list. This is fast (local filter, no network call), but when the filtered list is large, there is a perceptible re-render with no visual transition. Not a major issue but a polish opportunity.                                                                                             |
| 5.4 | **No error state on show loading failure**                 | Medium   | If `getSecretaryShows` fails, the error is logged but not surfaced to the UI. The show dropdown simply shows empty with no explanation. A secretary opening the page and seeing an empty show list with no error message will be confused.                                                                                              |

---

## Pass 6: Flow Integrity

Primary use case: Secretary manages entries the night before a trial.

### Step-by-step walkthrough

**Step 1: Secretary opens Entry Management**

- Page loads. If they visited before, the last-used show is auto-selected (good).
- If first visit, they see a show selector and an empty state card.
- Stats cards and entry list load after show selection.
- **Friction:** The show selector card always takes up space even when the show is pre-selected from the URL. Wasted vertical space on every visit.

**Step 2: Secretary reviews entry summary**

- Five stat cards show total, pending, accepted, waitlist, revenue.
- **Friction:** No "checked in" count. On show morning, the most important number is "how many are checked in vs. total." The stats cards are pre-trial focused (pending/accepted) but lack show-day metrics.

**Step 3: Secretary processes pending entries**

- Clicks "Pending" tab to see entries needing review.
- Each entry has "Accept" and "Waitlist" buttons, plus an "Actions" dropdown with more options.
- **Friction:** Redundancy -- the "Accept" button and the "Actions" dropdown both offer "Accept." The inline buttons are faster for the common case, but the dropdown duplicates them plus adds Reject and Missing Info. This is not terrible but adds visual noise.
- Secretary clicks "Accept" on each entry one by one.
- **Friction:** No bulk "Accept All Pending" shortcut. The secretary must either: (a) click Accept on each entry individually, or (b) use Select All + bulk status change dialog. Option (b) requires: check the Select All checkbox, click "Change Status" button, wait for dialog, select "Accept" from dropdown. That is 4 steps for a routine batch operation.

**Step 4: Secretary assigns armbands**

- Clicks "Auto-Assign Armbands" in header.
- Dialog asks for starting number.
- **Friction:** No preview of what will happen. No count of "X entries will receive armbands." No indication of whether entries need to be in "Accepted" status first.
- After assigning, the page reloads entries. Good.

**Step 5: Secretary checks in arriving exhibitors**

- Needs to find a specific dog. Uses search field.
- Search covers dog name, owner name, entry number, armband, and confirmation number. Good coverage.
- Clicks the check-in status indicator for the dog's class.
- **Friction:** The check-in indicator does not look clickable (finding 3.1). Secretary may not discover this interaction.
- CheckInStatusDialog opens. Secretary updates status. Dialog closes. Entry updates optimistically.

**Step 6: Secretary exports entry list**

- Clicks "Export CSV."
- File downloads.
- **Friction:** CSV has blank columns for owner contact info (finding 2.6). Secretary opens the file and finds incomplete data. No warning was given before export.

**Step 7: Secretary handles a scratch**

- Clicks "Scratches" tab.
- `ScratchManagementTab` loads (separate component, not audited in detail here).
- **Friction:** Scratching a dog requires navigating to a dedicated tab. INTENT.md says "scratches are calm one-tap operations." The current flow requires: switch tab, find the dog, execute the scratch. This is a 3+ step operation.

### Flow friction summary

| Step           | Friction                                           | Severity | Fix complexity                                                    |
| -------------- | -------------------------------------------------- | -------- | ----------------------------------------------------------------- |
| Page load      | Show selector card wastes space when show is known | Medium   | Low -- collapse to inline header when show is selected            |
| Summary        | No "checked in" count in stats                     | Medium   | Low -- add stat card for check-in progress                        |
| Pending review | No bulk "Accept All" shortcut                      | Medium   | Low -- add one-click accept-all-pending action                    |
| Armband assign | Auto-assign has no preview or count                | Medium   | Low -- add count + preview before confirming                      |
| Check-in       | Status indicator not obviously clickable           | High     | Low -- add cursor-pointer, hover state, or explicit "Change" link |
| Export         | CSV has blank columns, no warning                  | High     | Medium -- fix export query or warn user                           |
| Scratch        | Multi-step to scratch (tab switch + find + action) | Medium   | Medium -- add scratch action to entry row context menu            |
| Error handling | Dialog errors appear behind the dialog             | High     | Low -- show toast instead of page-level alert for dialog errors   |

---

## Summary

### Findings by severity

#### Critical

None.

#### High

| #   | Finding                                                   | Impact                                                                                                                                | Fix effort                                                                     |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 2.6 | CSV export has blank columns for owner contact info       | Secretary gets incomplete data for premium lists and reports. No warning given. Undermines trust in the export feature.               | Medium: fix the export query to join owner data, or warn before export.        |
| 3.1 | Check-in status looks static but is clickable             | Secretaries will not discover they can change check-in status inline. They may look for a separate check-in page that does not exist. | Low: add `cursor-pointer` class, hover underline, or small "Change" text link. |
| 3.4 | "Send Email" bulk button has no onClick handler           | Dead control. Secretary clicks it expecting to email exhibitors and nothing happens. Erodes trust.                                    | Low: either wire up the handler or remove the button until implemented.        |
| 4.2 | Three independent filter systems create confusion         | Status can be filtered by tab, by dropdown, and implicitly by trial/class -- all independently. Combined state is invisible.          | Medium: unify tab and status filter, or show active filter summary.            |
| 5.2 | Dialog errors appear at page level behind the open dialog | Secretary does not see that an action failed. May believe armband was assigned when it was not.                                       | Low: use toast notifications for action errors instead of page-level alert.    |

#### Medium

| #   | Finding                                                     | Impact                                                                | Fix effort                                                       |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1.1 | "Actions" dropdown label is misleading                      | Secretary expects broader actions, gets only status changes.          | Trivial: rename to "Status" or "Change Status."                  |
| 1.6 | "Issues" tab has no definition of what constitutes an issue | Secretary cannot triage issues without understanding the criteria.    | Low: add tooltip or description text explaining issue criteria.  |
| 2.1 | Show selector card always renders prominently               | Wastes vertical space on every visit when show is pre-selected.       | Low: collapse to compact inline display when show is known.      |
| 2.2 | Filter card and tab filters overlap / interact confusingly  | Double-filtering creates unexpected results.                          | Medium: hide status dropdown when a status tab is active.        |
| 2.3 | Four header buttons are equal weight                        | Primary action (New Entry) does not stand out.                        | Low: make Refresh an icon button, group secondary actions.       |
| 2.4 | Seven tabs with counts creates narrow, truncated labels     | Hard to read on typical screens.                                      | Medium: move Move-Ups and Scratches to overflow or secondary UI. |
| 3.2 | Armband button is icon-only                                 | Easy to miss as a common secretary action.                            | Low: add text label or tooltip.                                  |
| 3.3 | Comp and uncomp use identical Gift icon                     | Confusing when scanning quickly.                                      | Low: use different icon or add strikethrough for uncomp.         |
| 4.3 | Status changes have no undo                                 | Accidental status change requires manual correction.                  | Low: add toast with undo action.                                 |
| 4.4 | Auto-assign armbands has no preview                         | Secretary cannot see scope of batch operation before confirming.      | Low: add affected count to dialog.                               |
| 4.5 | Entry list rows show 10-12 data points each                 | Scanning 50+ dense entries is fatiguing. Opposite of "That was easy." | Medium: collapsed row with expand-on-click.                      |
| 5.1 | Error messages are generic developer-facing strings         | Violates INTENT.md guideline for plain English error messages.        | Low: rewrite error strings.                                      |
| 5.4 | Show loading failure is silent                              | Empty dropdown with no explanation.                                   | Low: show error state when show query fails.                     |
| F.2 | No "checked in" stat card                                   | Missing the most important show-morning metric.                       | Low: add stat card.                                              |
| F.3 | No bulk "Accept All Pending" shortcut                       | Common batch operation requires 4 steps.                              | Low: add one-click action.                                       |
| F.7 | Scratch requires tab switch + find + action (3+ steps)      | Violates INTENT.md "one-tap operations" for show day chaos.           | Medium: add scratch to entry row actions.                        |

#### Low

| #   | Finding                                                     | Impact                           | Fix effort                              |
| --- | ----------------------------------------------------------- | -------------------------------- | --------------------------------------- |
| 1.2 | View mode switches implicitly based on filter selection     | Unexpected layout changes.       | Low: add mode indicator or explanation. |
| 2.5 | Bulk actions bar appears without animation                  | May be missed.                   | Trivial: add scroll-into-view or fade.  |
| 3.5 | List/Table toggle icons are below 44px minimum touch target | Accessibility concern on tablet. | Trivial: increase to `h-10 px-3`.       |
| 3.6 | Roster class headers are buttons styled as links            | Ambiguous affordance.            | Trivial: add "View Scoring" label.      |
| 4.6 | Bulk status change fires instantly on dropdown selection    | Easy to accidentally trigger.    | Low: add confirm button to dialog.      |
| 5.3 | No loading transition between tab switches                  | Minor polish opportunity.        | Trivial.                                |

---

### Quick Wins

These fixes are low-effort (under 30 minutes each) and directly improve the secretary experience:

1. **Remove or disable the "Send Email" bulk button** -- It has no handler. Either wire it up or hide it until the feature is built. A dead button erodes trust more than a missing button.

2. **Make check-in status indicators obviously clickable** -- Add `cursor-pointer` to the button wrapper and consider adding a small "change" text or pencil icon next to the status badge. This is the most common show-day action and it is currently hidden.

3. **Use toast notifications for dialog action errors** -- Replace `setError()` calls in dialog action handlers with `toast.error()` from sonner (already imported in RegistrationView). This ensures the secretary sees the error even when a dialog is open.

4. **Rename "Actions" dropdown to "Status"** -- One-line change in `EntryListCard.tsx`: change `placeholder="Actions"` to `placeholder="Status"`.

5. **Add cursor-pointer to check-in button** -- In `EntryListCard.tsx`, add `className="cursor-pointer hover:scale-105 transition-transform"` to the check-in `<button>` element.

6. **Add affected count to auto-assign dialog** -- Pass the count of entries without armbands into `AutoArmbandDialog` and display it: "X entries will receive armbands starting at [number]."

7. **Show error state when show loading fails** -- In `useEntryManagementData`, surface the show loading error to the UI instead of only logging it. Display an `Alert` when the show list fails to load.

8. **Collapse show selector when show is pre-selected** -- When `selectedShowId` is set, render the show name inline in the page header instead of a full card with header and description.
