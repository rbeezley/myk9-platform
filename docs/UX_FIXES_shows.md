# UX Fix Backlog — myK9Show
> Generated from UX audit of `/shows`, `/shows/:id`, and `/shows/:id/register`
> Audience: Dog Show Exhibitors & Secretaries
> Date: 2026-04-07

---

## How to use this file
Work through issues in priority order (P1 first). Each issue includes the problem, affected files/components to look for, and the expected fix. Mark items done by changing `[ ]` to `[x]`.

---

## P1 — Critical (fix immediately)

### [ ] P1-01: Dog list clipped off-screen in entry registration wizard
**Flow:** `/shows/:id/register` — Step 1 "Select Dogs"
**Problem:** The dog table renders below the visible viewport. The right-hand content panel has no independent scroll, so the dog rows are hidden on standard laptop screens (~768px viewport height). Users see the filter tabs and "7 dogs" count but cannot scroll to the rows without awkwardly scrolling the outer window, which reveals a large dark empty area.
**Fix:**
- Give the registration content panel `overflow-y: auto` with a calculated `max-height` so it fills the remaining viewport below the header/breadcrumb.
- The layout should be: fixed top nav + fixed breadcrumb row + flex-fill content area that scrolls internally.
- The wizard left panel (step list) and right panel (form content) should both scroll independently within the content area.

---

### [ ] P1-02: Default dog filter tab shows 0 results for new entries
**Flow:** `/shows/:id/register` — Step 1 "Select Dogs"
**Problem:** The wizard opens with the "Registered" tab active, which returns 0 dogs for any exhibitor making a first-time entry. The empty state message is generic ("No dogs found matching your criteria. Try adjusting your search terms or filters.") and doesn't direct the user to the "Unregistered" tab. High abandonment risk.
**Fix:**
- Change the default active tab from "Registered" to "Unregistered" (or an "All Dogs" view) when the show has no prior entries for this user.
- Update the empty state copy for the "Registered" tab to: *"None of your dogs are entered in this show yet. Switch to 'Unregistered' to add dogs."*
- Update the empty state for the "Recent" tab to: *"No recently active dogs found. Try 'All Dogs' or search by name."*

---

## P2 — High (next sprint)

### [ ] P2-01: "Register" button shown when entry is already submitted
**Flow:** `/shows/:id`
**Problem:** The show detail page shows an "Entry Submitted" badge alongside a prominent "Register" primary button. These signals conflict — the user doesn't know if their entry was saved or if they need to register again.
**Fix:**
- When `entryStatus === 'submitted'` (or equivalent), replace the "Register" button label with "Manage Entry" or "View / Edit Entry".
- Only show "Register" when no entry exists for this user/show.

---

### [ ] P2-02: Entry Status filter and show card badge use different terminology
**Flow:** `/shows` filter dropdown vs. show card badge
**Problem:** The show card displays "Accepting Entries" but the Entry Status filter dropdown uses "Open" for the same state.
**Fix:**
- Standardize on "Accepting Entries" throughout. Update the filter dropdown option from "Open" → "Accepting Entries".
- Audit all other status labels (Closing Soon, Waitlist, Closed) for consistency between filter options, card badges, and detail page badges.

---

### [ ] P2-03: Entry fee currency formatting is broken/inconsistent
**Flow:** `/shows` card, `/shows/:id` detail page
**Problem:**
- Show list card: renders as "$ 10" (dollar sign icon + space + number)
- Show detail page Entry Fee field: renders as "10" — no currency symbol at all
- Day-of-show fee: "Day of show: 20" — no currency symbol
**Fix:**
- Format all monetary values as "$10" using a shared currency formatter (e.g., `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })`).
- Remove any separate dollar-sign icon elements; include the symbol in the formatted string.
- Apply this formatter consistently everywhere fees are displayed.

---

### [ ] P2-04: Host Club shows "TBD" and Judges show "Unknown Judge" on a live show
**Flow:** `/shows/:id`
**Problem:** The show is actively accepting entries but displays "TBD" for Host Club and "Unknown Judge" for all assigned judges. This looks like broken data to exhibitors.
**Fix:**
- Replace "Unknown Judge" with "Judge TBD" or hide the judges section when no judge is assigned.
- Replace "TBD" host club with "Not yet assigned" or suppress the field when empty.
- Consider a secretary-facing validation warning that prevents "Accepting Entries" state while Host Club is blank.

---

### [ ] P2-05: Show name "May 2026" is non-descriptive
**Flow:** Show creation (secretary), `/shows` list, `/shows/:id`
**Problem:** The show is named only with the month/year, making it unsearchable and indistinguishable from other shows.
**Fix:**
- In the secretary show creation flow, make Show Name a required field.
- Add helper/placeholder text: e.g., *"Example: Tulsa Agility Club Spring Trial 2026"*
- Optionally warn if the entered name matches a date-only pattern.

---

## P3 — Medium (planned backlog)

### [ ] P3-01: Sidebar nav links have no accessible names
**Flow:** All pages — left sidebar navigation
**Problem:** All icon-only nav links have no `aria-label`, no `title`, and no visible text. Screen readers announce them as empty links.
**Fix:**
- Add `aria-label="Shows"` (etc.) to each `<a>` in the sidebar nav.
- Add a visible tooltip on hover (via `title` or a tooltip component).

---

### [ ] P3-02: Show detail tabs are not keyboard-reachable (tabindex="-1")
**Flow:** `/shows/:id` — Trials, Classes, Entries, My Stats, Results tabs
**Problem:** All tab buttons except Overview have `tabindex="-1"`, removing them from keyboard navigation.
**Fix:**
- Implement the correct ARIA tab pattern: `role="tablist"` on the container, `role="tab"` on each button.
- Active tab: `tabindex="0"`. Inactive tabs: `tabindex="-1"` managed via arrow-key JavaScript (WAI-ARIA managed focus pattern).

---

### [ ] P3-03: "All Shows / My Shows" toggle duplicates the tab row
**Flow:** `/shows`
**Problem:** An "All Shows / My Shows" toggle and a separate tab row (Managing, Browse All, Past Shows, My Entries) both appear, with overlapping scope and unclear relationship.
**Fix:** Evaluate whether both controls are needed. If so, add visual hierarchy to clarify. If not, consolidate into the tab row.

---

### [ ] P3-04: Empty states in dog search are generic across all filter tabs
**Flow:** `/shows/:id/register` — Step 1 dog filter tabs
**Problem:** All filter tabs (Recent, Registered, Unregistered) show the same generic empty message regardless of context.
**Fix:** Write tab-specific empty states with actionable guidance (see P1-02 for copy).

---

### [ ] P3-05: "Load Draft (5)" count is unexplained
**Flow:** `/shows/:id/register` — top right of wizard
**Problem:** The number in "Load Draft (5)" has no label. Users don't know what it refers to.
**Fix:**
- Change label to "Load Draft (5 saved)" or add a tooltip: *"You have 5 saved drafts for this show."*
- Or expose a dropdown list of named/dated drafts so users can preview before loading.

---

## P4 — Low (polish pass)

### [ ] P4-01: Duplicate H1/H2 — show name appears twice in heading hierarchy
**Flow:** `/shows/:id`
**Fix:** Remove the duplicate `<h2>` for the show name. Appropriate H2s: Schedule, Judges, Share This Event.

---

### [ ] P4-02: Date Range filter has no quick-select presets
**Flow:** `/shows` — Date Range filter
**Fix:** Add preset options: "This week," "This month," "Next 3 months," "Custom range."

---

### [ ] P4-03: "(Max: 1000 dogs)" caveat is unnecessarily prominent
**Flow:** `/shows/:id/register` — Step 1 subtitle
**Fix:** Remove from the subtitle. Show only as a warning when the user approaches the limit.

---

*End of UX fix backlog — 15 issues total (2 P1, 5 P2, 5 P3, 3 P4)*
