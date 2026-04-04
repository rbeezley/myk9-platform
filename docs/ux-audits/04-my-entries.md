# UX Audit: My Entries Page

**Date:** 2026-04-04
**Auditor:** Claude
**Sources:** Code review of MyEntriesPage/index.tsx and modules/
**Role context:** Exhibitor --- "This respects my time"

---

## Pass 1: Mental Model Alignment

**Question:** Does the page show entries the way exhibitors think about them?

| #   | Finding                           | Severity | Detail                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Flat list, not grouped by show    | Medium   | Exhibitors think "I'm going to the Springfield trial this weekend --- what did I enter?" The page renders a flat list of entries sorted by date. If an exhibitor has 3 dogs in one show, they see 3 separate cards with the same show name, date, and location repeated. This does not match how exhibitors mentally organize: by show first, then by dog within that show.                   |
| 1.2 | Each entry = one dog in one class | Medium   | The data hook (`useMyEntriesData`) transforms each database row into one `MyEntry` with a single-element `classes` array (lines 64-82 of `useMyEntriesData.ts`). If a dog is entered in 3 classes at one show, the exhibitor sees 3 separate cards instead of one card showing all 3 classes. This contradicts the "Classes Entered:" section header which implies multiple classes per card. |
| 1.3 | No "by dog" view                  | Low      | Some exhibitors think dog-first: "What is Bella entered in?" There is no grouping or filtering by dog. The dog name appears as a subtitle but cannot be used to narrow the list.                                                                                                                                                                                                              |
| 1.4 | Sort order is ascending date      | Low      | Entries sort oldest-first. Exhibitors checking the page before show day likely want upcoming shows at the top. Past/completed entries should sink, not lead.                                                                                                                                                                                                                                  |

---

## Pass 2: Information Architecture

**Question:** Is the grouping intuitive? Can users find a specific entry quickly?

| #   | Finding                                            | Severity | Detail                                                                                                                                                                                                                                                                                            |
| --- | -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | No search or text filter                           | Medium   | An exhibitor with 15+ entries across a season has no way to search by show name, dog name, or date. The only filtering mechanism is 6 status tabs.                                                                                                                                                |
| 2.2 | Tab count not visible                              | Low      | Tabs do not show counts (e.g., "Pending (3)"). The user must click each tab to discover how many entries match. The stats cards above show some numbers, but the mapping between stat cards and tabs is indirect.                                                                                 |
| 2.3 | "Upcoming" vs "Accepted" overlap is confusing      | Medium   | The "Upcoming" tab shows entries where `showDate >= now AND status === ACCEPTED`. The "Accepted" tab shows all accepted entries regardless of date. An accepted entry for a future show appears in both tabs. The user may not understand the distinction, and the overlap wastes a tab position. |
| 2.4 | "Completed" tab includes non-accepted past entries | Low      | The "Completed" filter is `showDate < now` with no status filter. A rejected or cancelled entry for a past show appears in "Completed," which is misleading --- the exhibitor never competed.                                                                                                     |
| 2.5 | Stats cards may overwhelm casual users             | Low      | Four stat cards with progress bars, percentages, and financial summaries are visible before the entry list. For an exhibitor with 2 entries, this is dashboard-level complexity for a simple question ("Am I confirmed?").                                                                        |

---

## Pass 3: Affordance Clarity

**Question:** Are entry status indicators clear? Can users tell what actions are available per entry?

| #   | Finding                                                     | Severity | Detail                                                                                                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Check-in button looks like a status indicator, not a button | High     | The check-in control (`MyEntryCard.tsx` lines 122-131) is a `<button>` wrapping a `CheckInStatusIndicator`. There is no visible button chrome --- no border, no background, no "Check In" label. The only affordance is `hover:scale-105`, which does not exist on touch. An exhibitor on a phone has no visual cue this is tappable. |
| 3.2 | Two badges per entry may confuse                            | Low      | Each card shows both an entry status badge (Accepted/Pending) and a payment status badge (Paid/Payment Due). Exhibitors may not distinguish between these two statuses. A single combined status ("Confirmed and Paid" / "Pending Review" / "Payment Due") would be clearer.                                                          |
| 3.3 | Receipt button only appears when paid                       | Good     | `canShowReceipt` is gated on `confirmationNumber && isPaid`, which correctly hides the receipt action when it would be meaningless.                                                                                                                                                                                                   |
| 3.4 | Edit button correctly hidden for terminal states            | Good     | `canEdit` is limited to PENDING and ACCEPTED entries. Rejected/cancelled entries cannot be edited.                                                                                                                                                                                                                                    |
| 3.5 | Touch targets meet 44px minimum                             | Good     | Action buttons use `min-h-[44px]` (line 158 of `MyEntryCard.tsx`), meeting the INTENT.md guardrail. However, the check-in button (finding 3.1) has no minimum size guarantee.                                                                                                                                                         |
| 3.6 | "View Show" link is always present and prominent            | Good     | Every card has a "View Show" link that takes the user to the show detail page, providing a clear escape hatch for more information.                                                                                                                                                                                                   |

---

## Pass 4: Cognitive Load

**Question:** How much info per entry? Is filtering/sorting available and intuitive?

| #   | Finding                                     | Severity | Detail                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4.1 | Each card has 7+ distinct information zones | Medium   | Header (show name + dog + reg#), two status badges, a stepper component, three detail items (date, location, fee), a classes section, and an actions bar with contextual message + buttons. For an exhibitor who just wants to know "Am I in?", this is a lot of visual scanning per card. |
| 4.2 | EntryStatusStepper adds visual weight       | Medium   | Every card includes a multi-step progress visualization (`EntryStatusStepper`). While helpful for understanding the entry lifecycle, it adds significant vertical height and visual complexity, especially when multiplied across many cards. On mobile, each card will be very tall.      |
| 4.3 | No sort control                             | Low      | Entries are always sorted by show date ascending. There is no way to sort by dog name, status, or submission date.                                                                                                                                                                         |
| 4.4 | Fee displayed per class AND per entry       | Low      | The class row shows `$cls.fee` and the detail grid shows `$entry.totalFee total`. Since finding 1.2 means each card has only one class, these two numbers will almost always be identical, creating redundant information.                                                                 |
| 4.5 | Status message is context-aware             | Good     | `getContextualStatusMessage` surfaces the most useful information based on timing: "Show is today!" when it matters most, "Payment pending since Mar 5" when action is needed. This is well-aligned with "respects my time."                                                               |

---

## Pass 5: State Coverage

**Question:** Empty state, loading, error, mixed states?

| #   | Finding                                                   | Severity | Detail                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | Empty state is clear and actionable                       | Good     | The empty state shows a calendar icon, contextual message (different for "all" vs filtered tabs), and a "Browse All Shows" CTA. This follows the "no dead ends" guardrail.                                                                                                                                                                                                                                                    |
| 5.2 | Loading state uses skeleton placeholders                  | Good     | Three skeleton cards with pulse animation give spatial preview of the loaded state.                                                                                                                                                                                                                                                                                                                                           |
| 5.3 | Error state silently shows empty list                     | High     | When `getUserEntries` fails (`useMyEntriesData.ts` lines 131-135), the hook sets `entries` to `[]` and logs the error. The user sees the empty state ("You haven't entered any shows yet") with no indication that a load failure occurred. An exhibitor with confirmed entries who hits a network error will think they have no entries. This directly violates "respects my time" --- the user may panic or re-enter shows. |
| 5.4 | No error state in the UI at all                           | High     | There is no `error` state returned from `useMyEntriesData`. The hook catches errors and swallows them. The page component has no error rendering path.                                                                                                                                                                                                                                                                        |
| 5.5 | No pull-to-refresh or auto-refresh                        | Low      | The manual "Refresh" button is the only way to re-fetch. There is no periodic polling or real-time subscription, despite the `EntryUpdateEvent` type being defined in the types file. On show day, when statuses change frequently, the exhibitor must manually refresh.                                                                                                                                                      |
| 5.6 | Refreshing state spins the icon but no toast/confirmation | Low      | After refresh completes, there is no feedback ("Entries updated" or a timestamp). The user cannot tell if the refresh actually changed anything.                                                                                                                                                                                                                                                                              |
| 5.7 | Optimistic check-in revert has no user feedback           | Medium   | If the check-in status update fails server-side (`useMyEntriesData.ts` lines 223-241), the optimistic update is reverted silently. The user sees the status flip and then flip back with no explanation.                                                                                                                                                                                                                      |

---

## Pass 6: Flow Integrity

**Question:** Can an exhibitor quickly answer "What ring am I in at 10am?" and "Is my entry confirmed?"

| #   | Finding                                   | Severity | Detail                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6.1 | No ring or time information displayed     | High     | The `EntryClass` type has no ring assignment or scheduled time fields. The card shows class name, number, jump height, and fee --- but not the ring number or start time. An exhibitor cannot answer "What ring am I in?" from this page. They must click "View Show" and navigate to find ring assignments. This is the #1 question exhibitors ask on show day, per INTENT.md ("I know where to be"). |
| 6.2 | "Is my entry confirmed?" is answerable    | Good     | The entry status badge ("Accepted" / "Pending Review"), payment badge, status stepper, and contextual status message all contribute to answering this question. Multiple redundant signals help different users notice the answer.                                                                                                                                                                     |
| 6.3 | No quick-jump to today's show             | Medium   | On show day, the exhibitor must scroll through all entries to find today's. There is no "today" filter, no pinned/highlighted card for the current day's show, and ascending sort means today's entry may be buried below past entries. The `getContextualStatusMessage` does flag "Show is today!" in the status line, but the card is not elevated or pinned.                                        |
| 6.4 | Check-in flow requires dialog interaction | Low      | To check in for a class, the exhibitor taps the status indicator (which looks like a label, per 3.1), then interacts with a dialog. A one-tap check-in from the card would better match the "1-2 taps" guardrail.                                                                                                                                                                                      |
| 6.5 | No link to results for completed entries  | Medium   | For scored entries, the card shows a `ResultBadge` with search time and faults, but there is no action to view full results, scores breakdown, or placement details. The INTENT.md says "Results appear quickly, easy to find their dog."                                                                                                                                                              |

---

## Summary

### Critical Findings (fix before next release)

| #       | Finding                                       | Why It Matters                                                                                                                                                                                            |
| ------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.3/5.4 | **Error state displays as empty list**        | An exhibitor with real entries sees "You haven't entered any shows yet" on network failure. This causes panic on show day --- the opposite of "respects my time." Add an explicit error state with retry. |
| 6.1     | **No ring or time information**               | The #1 show-day question ("Where do I need to be?") cannot be answered from this page. Ring number and estimated start time should be visible per class entry when available.                             |
| 3.1     | **Check-in button has no visible affordance** | The check-in control looks like a status label, not a tappable button. On touch devices there is zero visual cue. Add button styling or a "Check In" text label.                                          |

### High-Priority Findings (address soon)

| #       | Finding                                             | Why It Matters                                                                                                                       |
| ------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1.1/1.2 | **Entries not grouped by show; one card per class** | Repeats show info across cards and fragments the exhibitor's mental model. Group entries by show, then by dog within show.           |
| 4.1/4.2 | **Cards are information-dense**                     | Seven information zones plus a stepper per card creates visual fatigue. Consider a collapsed default with expand-on-tap for details. |
| 5.7     | **Silent revert on check-in failure**               | Status flips then flips back with no explanation. Show a toast on failure.                                                           |
| 6.3     | **No fast path to today's entries**                 | On show day, today's entries should be pinned to the top or filterable with one tap.                                                 |

### Medium-Priority Findings (improve when touching this page)

| #   | Finding                       | Why It Matters                                          |
| --- | ----------------------------- | ------------------------------------------------------- |
| 2.1 | No search or text filter      | Hard to find a specific entry in a long list.           |
| 2.3 | Upcoming/Accepted tab overlap | Confusing mental model for what each tab means.         |
| 6.5 | No link to detailed results   | Scored entries show summary but no way to dig in.       |
| 1.4 | Ascending date sort           | Past entries appear first; upcoming entries are buried. |

### Quick Wins (small effort, high impact)

1. **Show an error banner when data fetch fails** --- add an `error` state to `useMyEntriesData` and render a retry banner instead of the empty state. (30 min)
2. **Reverse default sort to descending** --- change `a.showDate - b.showDate` to `b.showDate - a.showDate` so upcoming shows appear first. (5 min)
3. **Add counts to tab labels** --- e.g., "Pending (3)" so users can scan without clicking. (15 min)
4. **Add visible button chrome to check-in control** --- wrap with a styled button or add a "Check In" text label. (15 min)
5. **Highlight today's entries** --- add a visual accent (colored left border, "TODAY" badge) to cards where `isToday(entry.showDate)`. (20 min)
6. **Show toast on check-in failure** --- add a toast notification when optimistic revert happens. (10 min)

### What Works Well

- Contextual status messages (`getContextualStatusMessage`) surface the right info at the right time.
- Touch targets on action buttons meet the 44px minimum.
- Empty state is clear with an actionable CTA.
- Loading skeleton provides spatial preview.
- Entry/payment status badges use consistent color coding.
- Edit and receipt actions are correctly gated by state.
- The "Enter a Show" CTA is always visible, giving a clear next step.
