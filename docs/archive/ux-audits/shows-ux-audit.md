# UX Audit: Browse Shows & Show Details

**Date:** 2026-04-02
**Auditor:** Claude
**Sources:** Source code analysis (BrowseShowsPage, ShowDetailsPage, ShowCardHorizontal, ShowCardGrid, EmptyState, DetailHero, FilterChips, unified-shows-config, and related hooks/stores)

---

## Pass 1: Mental Model Alignment

**What UI suggests:** A comprehensive show directory where exhibitors can find, filter, and register for upcoming dog shows. The page appears to be a full-featured event marketplace.

**What it actually does:** Correct for browsing and filtering. However, several UI suggestions don't match what's behind them.

**Misalignment gaps:**

| UI Element                          | User Expects                           | Actually Does                                                                                                                    | Severity |
| ----------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------- |
| "Register" button (DetailHero)      | Quick registration flow                | Navigates to multi-step wizard at `/shows/:id/register` — unclear how long this will take before clicking                        | Medium   |
| "Full Calendar" button              | See a calendar of shows they can enter | Navigates to `/calendar` (protected route) — anonymous users hit auth wall unexpectedly                                          | High     |
| Location filter ("Within 50 miles") | Filter by proximity to me              | Requires user location permission or address — unclear if this actually geo-filters or is cosmetic                               | High     |
| "My Shows" toggle                   | Shows I'm registered for               | Shows where user has entries — but "entries" vs "registrations" terminology may confuse users who think in terms of "registered" | Low      |
| Tab counts (e.g., Trials: 3)        | 3 trials I can enter                   | 3 trials total (some may be full/closed) — count doesn't indicate availability                                                   | Low      |
| "ViewPicker" / saved views          | Bookmark a filtered search             | Saves filter+view+tab state — power feature that most exhibitors won't discover or need                                          | Low      |

**Jargon found:**

- "Discipline" — exhibitors may think "sport" or "event type" (AKC uses "sport")
- "Entry Status" — exhibitors say "entries open/closed," not "entry status: open"
- "Armband" — correct dog show term, but the ArmbandLookup component on the detail page has no label explaining what it does for first-time users

---

## Pass 2: Information Architecture

**Current structure:**

**Browse page (`/shows`):**

- Header: breadcrumbs + action buttons (Create Show, Full Calendar)
- Filter toolbar: search bar, 5 filter chips, mine toggle, view toggle, saved views, results count
- Bulk actions bar (conditional)
- Tab strip: role-based tabs (Browse All, Managing, My Shows, Judging, Past Shows)
- Content: cards / table / calendar

**Detail page (`/shows/:id`):**

- Header: breadcrumbs + armband lookup
- Hero: show name, club, org badge, Register button, Edit/Delete (secretary)
- Quick info cards (footer of hero)
- Tab strip: Overview, Trials, Classes, Entries, My Stats, Results

**IA issues:**

| Issue                            | Location                   | Problem                                                                                                                                               | Recommendation                                                                                                 |
| -------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Filter overload                  | Browse page filter toolbar | 6 filter axes + search + mine toggle + view mode + saved views = ~10 controls visible simultaneously. Violates INTENT.md "calm over clever" principle | Collapse filters behind a "Filters" button; keep search + mine toggle always visible                           |
| Redundant navigation             | Browse page                | Both the Calendar view mode toggle AND a "Full Calendar" button exist — two paths to calendar with different behaviors (inline vs. full page)         | Remove one; inline calendar view mode is sufficient, link "Open full calendar" as a secondary action within it |
| Tab + filter interaction unclear | Browse page                | Tabs filter shows (e.g., "My Shows" tab), but so does the "My Shows" toggle. Both do the same thing differently                                       | Remove MineToggle when the "My Shows" tab is active, or consolidate into one mechanism                         |
| Missing key info on cards        | ShowCardHorizontal         | No dates visible in card text — dates are only in the DateCircle component which is compact and may not communicate multi-day ranges well             | Add explicit date text (e.g., "Mar 15-16") below club name                                                     |
| Important info buried            | Show detail page           | Entry open/close dates and fees are in the Overview tab, not in the hero or quick info cards — these are the #1 thing exhibitors check                | Surface entry dates + fees in QuickInfoCards                                                                   |

**Visibility problems:**

- Hidden but should be visible: entry fees, entry dates, whether show is multi-day, number of entries/availability on browse cards
- Prominent but should be secondary: bulk actions bar, ViewPicker saved views, organization badge on cards

---

## Pass 3: Affordance Clarity

**Affordance audit:**

| Element                     | Looks Like          | Actually Is                          | Clear?                                                                     |
| --------------------------- | ------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| Show card                   | Clickable card      | Navigates to `/shows/:id`            | Yes — cursor pointer + hover shadow                                        |
| DateCircle                  | Visual date badge   | Non-interactive decoration           | Yes                                                                        |
| Checkbox on card            | Selection toggle    | Bulk selection for secretary actions | No — regular exhibitors see checkboxes with no clear purpose               |
| Filter chips                | Pill buttons        | Dropdown menus for single-select     | Mostly — but "all" state looks like a default button, not an active filter |
| MineToggle                  | Toggle switch       | Binary filter                        | Yes                                                                        |
| "Register" button (hero)    | Primary CTA         | Navigate to wizard                   | Yes, but no indication of effort required                                  |
| ViewToggle icons            | View mode switcher  | Switches cards/table/calendar        | Somewhat — icons only, no labels on mobile                                 |
| ViewPicker bookmark icon    | Bookmark? Favorite? | Save/load view configurations        | No — the bookmark icon doesn't communicate "saved views"                   |
| Org/event badges on cards   | Informational tags  | Non-interactive                      | Yes                                                                        |
| ArmbandLookup (detail page) | Search input?       | Armband number lookup                | No — purpose unclear without context                                       |

**False affordances:** Checkboxes on show cards appear for all users who can see the bulk actions system — exhibitors may think they need to select shows to register.

**Hidden affordances:** ViewPicker saved views feature is discoverable only by clicking a small bookmark icon — power users may never find it.

**Recommended fixes:**

- Only show checkboxes on cards when user has secretary/admin role
- Add text labels or tooltips to ViewToggle icons
- Replace bookmark icon on ViewPicker with a labeled dropdown ("Saved Views")
- Add a brief label or placeholder to ArmbandLookup

---

## Pass 4: Cognitive Load

**Decision points:**

| Screen/Step             | Decisions Required                                                                         | Can Be Reduced?                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Browse page (initial)   | Which tab? Which filters? Which view mode? Search? Mine toggle?                            | Yes — default to smart defaults based on role. New users should see "Upcoming" by default, not "all"         |
| Browse page (filtering) | 5 independent filter dropdowns + search + mine toggle = 7 filter dimensions simultaneously | Yes — progressive disclosure. Show search + 1-2 most-used filters, hide rest behind "More filters"           |
| Show detail page        | 5-6 tabs to choose from                                                                    | Partially — tab strip is manageable, but "My Stats" tab only appears conditionally which can be disorienting |
| Registration decision   | Which show to register for                                                                 | Needs improvement — no at-a-glance pricing or availability info on browse cards                              |

**Missing defaults:**

- No "Upcoming" date filter applied by default — users see ALL shows including past ones unless they switch tabs
- No location filter pre-applied — could default to "nearby" if location is available
- Calendar view doesn't highlight "today" prominently enough

**Unnecessary complexity:**

| Complexity                  | Who Needs It                          | Recommendation                                   |
| --------------------------- | ------------------------------------- | ------------------------------------------------ |
| Saved views (ViewPicker)    | Power secretaries managing many shows | Hide behind a "..." menu or advanced section     |
| Bulk selection              | Secretaries doing batch operations    | Only show for secretary role                     |
| 5 simultaneous filter chips | Power users                           | Progressive disclosure — show 2, expand for rest |
| Organization filter         | Users attending multi-org events      | Rarely needed — move to "more filters"           |

**Cognitive load score:** Medium-High — The browse page tries to serve all roles (guest, exhibitor, secretary, admin, judge) on one screen, leading to feature density that can overwhelm the primary user (exhibitor). Per INTENT.md, the exhibitor experience should feel like "This respects my time" — the current filter toolbar requires learning what 6+ controls do.

---

## Pass 5: State Coverage

### BrowseShowsPage

| State            | Implemented? | Quality | Issue                                                                               |
| ---------------- | ------------ | ------- | ----------------------------------------------------------------------------------- |
| Empty (no shows) | Yes          | Good    | Clear message "No shows found" with "Check back soon" — matches INTENT.md calm tone |
| Empty (filtered) | Yes          | Good    | "No matching shows" with "Clear Filters" CTA                                        |
| Loading          | Yes          | Good    | ShowsPageSkeleton with 6 cards — prevents layout shift                              |
| Success          | Yes          | Good    | Cards/table/calendar render cleanly                                                 |
| Partial          | No           | Missing | No handling for partial load failure (e.g., shows load but entries fail)            |
| Error            | Yes          | Good    | "We couldn't load the shows" with retry button — plain English per INTENT.md        |

**Dead ends found:** None on browse page — error and empty states both have actions.

### ShowDetailsPage

| State                            | Implemented? | Quality  | Issue                                                                                                         |
| -------------------------------- | ------------ | -------- | ------------------------------------------------------------------------------------------------------------- |
| Empty (no show data)             | Yes          | Good     | NotFoundState with "Back to Shows" link                                                                       |
| Loading                          | Yes          | Good     | LoadingSkeleton variant="cards" count=3                                                                       |
| Success                          | Yes          | Good     | Full hero + tabs render                                                                                       |
| Partial (show exists, no trials) | Partial      | Adequate | Trials tab shows count of 0, but no empty state message within the tab content itself                         |
| Error                            | Partial      | Poor     | No explicit error state — if show query fails after initial load, user sees the fallback spinner indefinitely |

**Dead ends found:**

- ShowDetailsPage line 247-257: If `actualCurrentShow` is null (not due to loading or not-found), user sees an infinite spinner with "Loading..." — no timeout, no escape. This violates INTENT.md "no dead ends" principle.
- The "Register" button is always visible even for shows with closed entries — clicking it may lead to a dead-end registration page.

**Missing error handling:**

- Show detail page has no error boundary or error state for failed data fetches after initial render
- No offline handling — if user loses connection while on detail page, no indication

---

## Pass 6: Flow Integrity

**Primary flow tested:** Guest discovers a show, views details, decides to register

**Step-by-step findings:**

| Step | Action                  | Friction                                                                                                         | Severity |
| ---- | ----------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| 1    | Land on `/shows`        | None — page loads with all shows visible                                                                         | None     |
| 2    | Scan show cards         | Moderate — no at-a-glance pricing or entry availability. User must click into each show to learn basics          | Medium   |
| 3    | Use search to narrow    | None — search is prominent and placeholder text is helpful                                                       | None     |
| 4    | Apply discipline filter | Low — filter chips are intuitive once noticed                                                                    | Low      |
| 5    | Click a show card       | None — card hover state is clear, click navigates smoothly                                                       | None     |
| 6    | View show details       | Low — hero shows name/club/org but not dates or location (those are in Overview tab)                             | Medium   |
| 7    | Check entry dates/fees  | High — must scroll to Overview tab content to find this info, not in hero or quick cards                         | High     |
| 8    | Click "Register"        | Potential dead end — if entries are closed, registration wizard may reject them. No pre-validation on the button | High     |
| 9    | Complete registration   | Unknown — requires auth, then multi-step wizard. Guest user hits auth wall                                       | Medium   |

**Abandonment risks:**

- Step 2: Users scanning cards can't see pricing or entry dates — they must click into each show, which is tedious when comparing options. INTENT.md says exhibitor experience should be "That took 30 seconds."
- Step 7: Key decision-making info (fees, entry dates) is not in the hero section where users first land. They must hunt for it.
- Step 8: Register button visible for closed shows leads to frustration.

**Recovery gaps:**

- Missing back/undo: None significant — breadcrumbs provide navigation back
- No cancel option: Registration wizard flow (not audited here) may lack cancel
- Destructive with no confirm: Delete show has a confirmation dialog (good)

**Flow verdict:** Completable with friction — The browse-to-register flow works but requires too many clicks to gather decision-making information (fees, dates, availability). The browse page prioritizes filtering power over information density on each card.

---

## Summary

**Overall UX health:** Needs Work

### Critical (Fix immediately)

| Finding                                                 | Pass   | Impact                                                         | Effort                                                 |
| ------------------------------------------------------- | ------ | -------------------------------------------------------------- | ------------------------------------------------------ |
| Infinite spinner dead end on ShowDetailsPage (line 247) | Pass 5 | User stuck with no escape if show data is null but not loading | Low — add timeout + fallback state                     |
| "Register" button visible for closed shows              | Pass 6 | User frustration from dead-end flow                            | Low — conditionally hide/disable based on entry status |

### High Priority (Fix soon)

| Finding                                                         | Pass   | Impact                                                        | Effort                                                              |
| --------------------------------------------------------------- | ------ | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| Entry dates and fees not visible on browse cards or detail hero | Pass 6 | Exhibitors can't compare shows without clicking into each one | Medium — add to ShowCardHorizontal + QuickInfoCards                 |
| "Full Calendar" button leads to auth wall for guests            | Pass 1 | Anonymous users hit unexpected login prompt                   | Low — hide button for unauthenticated users or make calendar public |
| Location filter may not actually geo-filter                     | Pass 1 | Filter appears functional but may be cosmetic                 | Medium — verify implementation, remove if non-functional            |
| No error state on ShowDetailsPage for failed fetches            | Pass 5 | Data fetch failures show stale or broken UI                   | Medium — add ErrorBoundary or error state handling                  |

### Medium Priority (Plan for)

| Finding                                                 | Pass   | Impact                                                  | Effort                                        |
| ------------------------------------------------------- | ------ | ------------------------------------------------------- | --------------------------------------------- |
| Filter toolbar cognitive overload (10 controls visible) | Pass 4 | Overwhelms casual exhibitors, violates "calm" principle | Medium — progressive disclosure pattern       |
| Tab + MineToggle redundancy                             | Pass 2 | Two controls do the same thing differently              | Low — hide toggle when My Shows tab is active |
| Checkboxes visible to non-secretary users               | Pass 3 | Confusing affordance for exhibitors                     | Low — gate behind role check                  |
| ViewPicker bookmark icon unclear                        | Pass 3 | Power feature is undiscoverable                         | Low — add label "Saved Views"                 |
| Show detail hero missing dates and location             | Pass 2 | Key info requires tab navigation to find                | Medium — add to hero metadata                 |

### Low Priority (Nice to have)

| Finding                                    | Pass   | Impact                                  | Effort                                    |
| ------------------------------------------ | ------ | --------------------------------------- | ----------------------------------------- |
| "Discipline" jargon                        | Pass 1 | Minor terminology mismatch              | Low — rename to "Sport" or "Event Type"   |
| No default "Upcoming" filter               | Pass 4 | Users see past shows mixed with future  | Low — change default dateRange            |
| Conditional "My Stats" tab is disorienting | Pass 4 | Tab appears/disappears based on entries | Low — always show tab, empty state inside |

### Quick Wins (High impact, low effort)

- Disable/hide "Register" button when entry status is "closed": 1-line conditional in DetailHero
- Add timeout to infinite spinner fallback (ShowDetailsPage:247): `setTimeout` + redirect to `/shows`
- Hide "Full Calendar" button for unauthenticated users: wrap in auth check
- Hide bulk-selection checkboxes for non-secretary roles: gate in ShowCardGrid
- Add `aria-label` to ArmbandLookup explaining what it does

### Recommendations

1. **Surface key decision info on cards** — Add entry dates, fees, and availability status to ShowCardHorizontal. Exhibitors compare shows by scanning, not by clicking into each one. This is the single highest-impact improvement for the "respects my time" intent.
2. **Simplify the filter toolbar** — Show search + mine toggle + date filter by default. Put discipline, location, club, org behind a "More Filters" expansion. Reduce the 10-control toolbar to 3-4 visible controls.
3. **Fix the dead-end states** — The infinite spinner and closed-show registration button are the two most frustrating UX bugs. Both are low-effort fixes that protect the "calm, competent helper" brand.
