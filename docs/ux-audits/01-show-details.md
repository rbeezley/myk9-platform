# UX Audit: Show Details Page

**Date:** 2026-04-04
**Auditor:** Claude
**Sources:** Code review of ShowDetailsPage.tsx and ShowDetails/ components
**Role context:** Exhibitor -- "This respects my time"

---

## Pass 1: Mental Model Alignment

Does the UI match what exhibitors expect when they view a show? Does the terminology and layout map to how dog show people think?

| #   | Finding                                       | Severity | Detail                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------------------------------------- |
| 1.1 | **Tab labeled "Entries" is ambiguous**        | Medium   | The tab is labeled `Entries` (with icon `ClipboardList`) but it shows the user's own entries (`MyEntriesTab`). An exhibitor seeing "Entries" might expect the full entry list for the show. The tab definition uses `label: 'Entries'` but the component is `MyEntriesTab`. The older `EntriesTab` (secretary view showing all entries) exists separately. The label should be "My Entries" to match user expectation. |
| 1.2 | **"Results" tab shows count of 0**            | Low      | Tab definition hardcodes `count: 0` for Results. This is misleading -- a zero count implies "no results" even when results may exist. Either show the real count or omit the badge entirely.                                                                                                                                                                                                                           |
| 1.3 | **Organization badge uses "default" variant** | Low      | The hero badge shows `show.organization` (e.g., "AKC", "UKC") with `variant: 'default'` -- a gray/muted style. Dog show people identify strongly with their organization; this should be more visually prominent (a colored badge or org-specific styling).                                                                                                                                                            |
| 1.4 | **"Register" button label is correct**        | --       | The primary CTA says "Register" which aligns with dog show terminology. Good.                                                                                                                                                                                                                                                                                                                                          |
| 1.5 | **QuickInfoCards uses "Entry Fee" label**     | Low      | Shows `show.preEntryFee` under the label "Entry Fee". Dog show exhibitors distinguish between pre-entry and day-of-show fees. The label is correct but the raw value display (`show.preEntryFee                                                                                                                                                                                                                        |     | 'TBD'`) does not format as currency -- it passes through whatever string is stored. |

---

## Pass 2: Information Architecture

Is content grouped the way exhibitors think? What is hidden that should be visible? What is visible that should be hidden?

| #   | Finding                                           | Severity | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | **Entry status not shown in hero**                | High     | The `getEntryStatus()` utility computes rich status info (not yet open, accepting, closing soon, closed, submitted) with labels and descriptions, but the hero only conditionally shows a "Register" button. There is no visible badge or text communicating the entry window status. An exhibitor landing on this page has no immediate indication of whether entries are open, closed, or closing soon. The `EntryStatusInfo` has a `label` and `description` that go unused in the hero. |
| 2.2 | **Show dates not in hero title area**             | Medium   | The hero shows `name`, `clubName` as subtitle, and `organization` as badge, but the show dates are only in the `QuickInfoCards` footer strip. Dates are the single most important piece of information for an exhibitor. They should be more prominent -- in the subtitle or as metadata items.                                                                                                                                                                                             |
| 2.3 | **Six tabs may overwhelm casual visitors**        | Medium   | Authenticated users see 6 tabs: Overview, Trials, Classes, Entries, My Stats, Results. For a first-time exhibitor, the distinction between Trials, Classes, and the Overview schedule summary is unclear. The mental model is "when do I show up, what class am I in, how do I register."                                                                                                                                                                                                   |
| 2.4 | **Overview tab has good IA**                      | --       | The `ShowOverviewTab` has a solid two-column layout: schedule summary + venue map in main, officials + judges + share in sidebar, then "more from club" full-width. This maps well to exhibitor needs.                                                                                                                                                                                                                                                                                      |
| 2.5 | **Armband lookup only shows when armbands exist** | Low      | `ArmbandLookup` appears in the header actions only when `armbandCount > 0`. This is correct gating but provides no discoverability before armbands are assigned. An exhibitor looking for their armband number gets no indication the feature exists.                                                                                                                                                                                                                                       |
| 2.6 | **Duplicate/orphaned components in ShowDetails/** | Low      | `ShowMainCard`, `ShowInformationCard`, `HostingClubCard`, `ShowDetailsLayout`, `ShowGroupedSidebar`, `ShowEmptyStateView`, `ShowStatistics`, both `TrialsList` files, and `TrialItem` are not imported by `ShowDetailsPage.tsx`. These appear to be legacy components from an older layout. They add maintenance burden and could confuse developers.                                                                                                                                       |

---

## Pass 3: Affordance Clarity

Can users tell what is interactive? Check buttons, links, clickable elements.

| #   | Finding                                                         | Severity | Detail                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | **Register button is well-sized**                               | --       | `DetailHero` renders the primary action as an `h-12 px-6` button -- 48px height with generous padding. Meets the 44x44 minimum from INTENT.md. Good.                                                                                                      |
| 3.2 | **Trial cards are clickable but lack explicit affordance text** | Low      | `TrialsTab` cards use `role="button"` and `tabIndex={0}` with `cursor-pointer` and hover effects. This is good. The card has no "View details" text though -- the entire card is the click target. Keyboard support via `onKeyDown` for Enter is present. |
| 3.3 | **Class rows in table view lack click affordance**              | Medium   | `ClassesTab` table uses `onRowClick` on `DataTable`, but table rows typically look non-interactive. There is no visual cue (arrow icon, hover underline, or "view" link) that rows navigate somewhere.                                                    |
| 3.4 | **MyEntriesTab error state has no retry action**                | Medium   | The error state renders plain text "Could not load your entries. Please try again." with no retry button. The exhibitor has no obvious next step. Compare to `ErrorState` component which provides an `onRetry` button -- this tab should use it.         |
| 3.5 | **MyEntriesTab empty state says "Browse Classes"**              | --       | The empty state action navigates to the Classes tab (`?tab=classes`). This is a good affordance -- clear next step for an exhibitor who wants to enter.                                                                                                   |
| 3.6 | **Edit/Delete actions correctly gated**                         | --       | `canManageShow` gates the edit button and three-dot menu. Exhibitors will not see admin controls. Good.                                                                                                                                                   |

---

## Pass 4: Cognitive Load

How many decisions per screen? Are there smart defaults? What requires explanation?

| #   | Finding                                                | Severity | Detail                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4.1 | **Default tab is always "overview"**                   | Medium   | `useUrlTab(allowedTabs, 'overview')` defaults to overview. But for a returning exhibitor who has entries, the most useful default would be "my-entries" -- showing their schedule and position. The code computes `hasUserEntries` but does not use it to set the default tab. |
| 4.2 | **ClassesTab defaults "Mine" toggle based on entries** | --       | `useState(userHasEntries)` initializes the mine toggle to true when the user has entries. This is a smart default that respects the exhibitor's time. Good.                                                                                                                    |
| 4.3 | **View mode preferences are persisted**                | --       | `useViewPreference('trials', 'cards')` and similar hooks remember the user's preferred view. Good pattern.                                                                                                                                                                     |
| 4.4 | **QuickInfoCards shows 4 data points**                 | --       | Date, entry fee, location, host club. This is a well-scoped glanceable summary. Not overloaded.                                                                                                                                                                                |
| 4.5 | **"My Stats" tab purpose unclear without context**     | Low      | The tab exists for authenticated users but the label "My Stats" gives no indication of what stats are shown. Is it my dog's performance? My entry history? An exhibitor might click it out of curiosity and be confused.                                                       |
| 4.6 | **Tab counts help scanning**                           | --       | Trials, Classes, and Entries tabs show counts. This helps exhibitors quickly gauge the scope without clicking. Good.                                                                                                                                                           |

---

## Pass 5: State Coverage

Check empty, loading, success, partial, and error states for each major component.

| Component                         | Loading                                        | Empty                                      | Error                                           | Partial/Edge                                       | Notes                                                                                                                                                                     |
| --------------------------------- | ---------------------------------------------- | ------------------------------------------ | ----------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ShowDetailsPage**               | Skeleton via `LoadingSkeleton variant="cards"` | `NotFoundState` with back link             | `ErrorState` with retry + plain English message | --                                                 | All three top-level states covered. Good.                                                                                                                                 |
| **TrialsTab**                     | No loading state                               | "No Trials" with icon + add button (gated) | No error state                                  | Filter empty state when filters exclude all        | Missing: no loading skeleton while trials data resolves. The data comes from `trialStore` which may already be loaded, but there is no loading guard.                     |
| **ClassesTab**                    | No loading state                               | `EmptyState` "No classes scheduled"        | No error state                                  | Filter empty + mine-filtered empty handled         | Same gap as TrialsTab: no loading indicator.                                                                                                                              |
| **MyEntriesTab**                  | `LoadingSkeleton`                              | `EmptyState` with "Browse Classes" action  | Text-only error (no retry)                      | --                                                 | Error state is weak (finding 3.4).                                                                                                                                        |
| **EntriesTab** (legacy/secretary) | Spinner + "Loading entries..."                 | "No Entries Yet" with icon                 | Error card with message                         | --                                                 | Well covered but this component is not used in the current page.                                                                                                          |
| **QuickInfoCards**                | No loading state                               | Graceful "TBD" fallbacks                   | N/A (pure render)                               | --                                                 | Good use of TBD fallbacks.                                                                                                                                                |
| **DetailHero**                    | N/A (parent handles)                           | N/A                                        | N/A                                             | Missing entry dates = no badge, no register button | When `entryOpenDate` or `entryCloseDate` is missing/invalid, `getEntryStatus` will produce `NaN` for date comparisons, potentially showing "Register" when it should not. |

| #   | Finding                                               | Severity | Detail                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 5.1 | **getEntryStatus does not guard missing dates**       | High     | If `show.entryOpenDate` or `show.entryCloseDate` is empty/undefined, `new Date(undefined)` produces `Invalid Date`. The comparisons `now < openDate` and `now > closeDate` will both be `false`, falling through to the "accepting" status with `NaN` for `daysUntilClose`. This means a show with no entry dates configured will display "Register" as if entries are open, and show broken countdown text. |
| 5.2 | **TrialsTab and ClassesTab have no error boundaries** | Medium   | If the trial store or class data has an issue, these tabs have no error handling. A runtime error in rendering would crash the entire page via React's error boundary (if one exists at a higher level).                                                                                                                                                                                                     |
| 5.3 | **MyEntriesTab error state lacks retry**              | Medium   | Duplicate of 3.4 -- listed here for state coverage completeness.                                                                                                                                                                                                                                                                                                                                             |

---

## Pass 6: Flow Integrity

Primary use case: Exhibitor discovers show -> views details -> decides to register.

### Step-by-step walkthrough

**Step 1: Exhibitor lands on show page**

- Page loads with skeleton (good).
- Hero renders with show name, club, organization badge, and QuickInfoCards.
- **Friction:** No visible entry status indicator. The exhibitor must scan the QuickInfoCards footer to find the entry close date, then mentally compute whether entries are open.

**Step 2: Exhibitor looks for key information**

- Dates are in the QuickInfoCards footer strip, which is a secondary position below the hero content.
- Fee information is visible in QuickInfoCards. Good.
- Location is visible. Good.
- **Friction:** If the exhibitor wants to know "what classes can I enter," they must navigate to the Classes tab. The Overview tab shows a schedule summary but it is unclear if that is clickable or how it relates to registration.

**Step 3: Exhibitor decides to register**

- If entries are open, the "Register" button appears in the hero. Good placement and sizing.
- **Friction:** If entries are NOT open (closed, or not yet open), the Register button simply disappears. There is no explanatory text like "Entries closed on [date]" or "Entries open on [date]" in the hero area. The exhibitor sees no CTA and no explanation why.
- **Friction:** If the exhibitor has already entered, `canEnter` is still `true` (the submitted status allows more entries). The button still says "Register" -- it could say "Add Another Entry" or "Manage Entries" to acknowledge their existing registration.

**Step 4: Exhibitor checks their entries after registering**

- The "Entries" tab (which is really "My Entries") shows their classes with position tracking ("3 ahead", "Next up").
- **Friction:** The tab is labeled "Entries" not "My Entries" (finding 1.1).
- The empty state correctly guides them to browse classes if they have no entries yet.

**Step 5: Exhibitor checks schedule on show day**

- Overview tab shows ScheduleSummary.
- MyEntriesTab shows `LiveClassCard` with `dogsAhead` count.
- **Friction:** No single "my schedule" view that combines time, ring, class, and position into one glanceable list. The exhibitor must piece together information from the Classes tab (time/ring) and the Entries tab (position/status).

### Flow friction summary

| Step        | Friction                                                  | Severity | Fix complexity                             |
| ----------- | --------------------------------------------------------- | -------- | ------------------------------------------ |
| Landing     | No entry status shown                                     | High     | Low -- add entry status badge to hero      |
| Landing     | Dates in footer, not prominent                            | Medium   | Low -- add to hero subtitle or metadata    |
| Register    | Button disappears with no explanation when entries closed | High     | Low -- show disabled button or status text |
| Register    | "Register" label unchanged when user has entries          | Low      | Low -- conditional label                   |
| My schedule | Tab labeled "Entries" not "My Entries"                    | Medium   | Trivial -- change label string             |
| Show day    | No combined schedule+position view                        | Medium   | Medium -- new component needed             |

---

## Summary

### Findings by severity

#### Critical

None.

#### High

| #   | Finding                                                                                  | Impact                                                                                                             | Fix effort                                                      |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 5.1 | `getEntryStatus` does not guard missing dates -- shows "Register" for unconfigured shows | Users could attempt to register for shows that are not ready. Data integrity risk.                                 | Low: add early return when dates are falsy.                     |
| 2.1 | Entry status not displayed in hero area                                                  | Exhibitors cannot tell at a glance whether entries are open, closing soon, or closed. Violates "respects my time." | Low: render the `EntryStatusInfo.label` as a badge in the hero. |
| F.3 | Register button disappears silently when entries are closed                              | No call to action and no explanation. Dead end. Violates "no dead ends" guardrail.                                 | Low: show status text or disabled button with tooltip.          |

#### Medium

| #         | Finding                                         | Impact                                                       | Fix effort                                             |
| --------- | ----------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| 1.1       | "Entries" tab should be "My Entries"            | Ambiguity between personal entries and show-wide entry list. | Trivial: change label.                                 |
| 2.2       | Show dates buried in footer strip               | Most important info not in primary visual hierarchy.         | Low: add to hero metadata.                             |
| 2.3       | Six tabs for authenticated users                | Cognitive load for first-time visitors.                      | Medium: consider collapsing or progressive disclosure. |
| 3.3       | Table rows lack click affordance in ClassesTab  | Users may not realize rows are interactive.                  | Low: add hover style or arrow icon.                    |
| 3.4 / 5.3 | MyEntriesTab error state has no retry button    | Dead end on error.                                           | Low: use `ErrorState` component.                       |
| 4.1       | Default tab ignores user context                | Returning exhibitors with entries still land on Overview.    | Low: conditional default based on `hasUserEntries`.    |
| 5.2       | TrialsTab / ClassesTab have no error handling   | Runtime errors crash the whole page.                         | Low: wrap in error boundary.                           |
| F.5       | No combined schedule+position view for show day | Exhibitors must cross-reference two tabs.                    | Medium: new component.                                 |

#### Low

| #   | Finding                                                         | Impact                          | Fix effort                           |
| --- | --------------------------------------------------------------- | ------------------------------- | ------------------------------------ |
| 1.2 | Results tab count hardcoded to 0                                | Minor confusion.                | Trivial.                             |
| 1.3 | Organization badge is muted gray                                | Missed branding opportunity.    | Low.                                 |
| 1.5 | Entry fee not consistently currency-formatted in QuickInfoCards | Raw string display.             | Low.                                 |
| 2.5 | Armband lookup has no discoverability before assignment         | Feature invisible until active. | Low: add placeholder text.           |
| 2.6 | Orphaned legacy components in ShowDetails/                      | Maintenance burden.             | Low: delete unused files.            |
| 3.2 | Trial cards lack explicit "View" text                           | Minor affordance gap.           | Trivial.                             |
| 4.5 | "My Stats" tab purpose unclear                                  | Low confusion.                  | Trivial: add tooltip or description. |
| F.4 | Register label unchanged when user has existing entries         | Minor label inaccuracy.         | Trivial.                             |

---

### Quick Wins

These fixes are low-effort (under 30 minutes each) and directly improve the exhibitor experience:

1. **Add entry status badge to DetailHero** -- Use the already-computed `getEntryStatus()` result to render a badge (e.g., "Accepting Entries", "Closes in 3 days", "Entries Closed") next to the show name. The utility and badge styles already exist in `entryStatusUtils.ts`.

2. **Guard missing dates in `getEntryStatus`** -- Add an early return at the top of the function when `show.entryOpenDate` or `show.entryCloseDate` is falsy, returning a safe default (e.g., status `'not_yet_open'` with label "Entry dates TBD").

3. **Show status text when Register button is absent** -- When `canEnter` is false, render the `EntryStatusInfo.label` and `description` as text in the hero action area instead of nothing.

4. **Rename "Entries" tab to "My Entries"** -- One-line change in the tab definition: `label: 'My Entries'`.

5. **Use `ErrorState` in MyEntriesTab** -- Replace the plain `<p>` error message with `<ErrorState message="..." onRetry={refetch} />` for consistency and to provide a retry action.

6. **Default to "my-entries" tab when user has entries** -- Change the `useUrlTab` default from `'overview'` to `hasUserEntries ? 'my-entries' : 'overview'`. Note: since hooks cannot be called conditionally, the default would need to be computed before the hook call (it already is -- `hasUserEntries` is available).

7. **Delete orphaned ShowDetails components** -- Remove `ShowMainCard`, `ShowInformationCard`, `HostingClubCard`, `ShowDetailsLayout`, `ShowGroupedSidebar`, `ShowEmptyStateView`, `ShowStatistics`, legacy `TrialsList` (both versions), and `TrialItem` if they are truly unused. Verify with a project-wide search first.
