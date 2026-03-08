# CRM/SaaS UX Inspiration for myK9 Platform

Research from HubSpot, Pipedrive, and Attio — mapped to our dog show management domain.

---

## Executive Summary

Three patterns emerge across all three best-in-class CRMs:

1. **The record page is king** — All three invest heavily in a multi-panel record detail layout (properties sidebar + tabbed content + associations). This is the single biggest gap in myK9 today.
2. **Views are first-class objects** — Table, Kanban, and calendar are interchangeable lenses on the same data. Users customize and save their own views.
3. **Progressive disclosure everywhere** — Start simple, reveal complexity on demand. Collapsible sections, conditional visibility, and "show only filled fields" toggles.

---

## Top 10 Actionable Patterns (Ranked by Impact)

### 1. Three-Panel Record Pages

**From:** HubSpot (signature pattern), Attio (two-column variant)

**What it is:** Every record (dog, show, person, entry) gets a rich detail page with:

- **Left sidebar** — Key properties in collapsible sections (breed, reg number, owner, status)
- **Center** — Tabbed content area (Overview, Activity/History, related records)
- **Right sidebar** — Associated records as preview cards (a dog's entries, a show's classes)

**What we have today:** Header + tabs + flat content. No persistent properties sidebar. No association previews.

**myK9 application:**
| Record | Left Sidebar | Center Tabs | Right Sidebar |
|--------|-------------|-------------|---------------|
| Dog | Breed, reg #, DOB, sex, owner, status | Overview (career highlights), Show History, Health, Photos | Current entries, titles/awards, owner card |
| Show | Date range, location, club, status, entry count | Overview, Trials, Entries, Results, Schedule | Club card, assigned judges, secretary |
| Person | Name, email, roles, location, club | Overview, Show History, Dogs, Availability | Associated clubs, upcoming assignments |
| Entry | Dog, handler, class, armband #, status, fee | Activity log, Score history | Show card, class card, dog card |

**Effort:** Medium — requires a `RecordPageLayout` component and refactoring detail pages.

---

### 2. Inline Editing on Record Pages

**From:** HubSpot (click any field to edit), Attio (spreadsheet-style cell editing), Pipedrive (in-place editing)

**What it is:** Click a property value to edit it directly. No "Edit" button, no slide-out panel for simple changes. Click away or press Enter to save.

**What we have today:** Dedicated Edit panels (SlideOverPanel) for all edits. Good for complex multi-field edits, overkill for changing a single field.

**myK9 application:** On a dog's detail page, click the owner name to reassign. On a show, click the location to update it. On an entry, click status to change it. Keep the full Edit panel for multi-field batch edits.

**Effort:** Medium — needs an `InlineEditableField` component with optimistic updates.

---

### 3. Unified Table + Kanban + Calendar View Switching

**From:** All three (universal pattern)

**What it is:** Any list of records can be viewed as a table (rows/columns), a Kanban board (cards in columns by status), or a calendar (events on dates). One-click toggle, same data, same filters.

**What we have today:** Grid + List + Table on browse pages. Pipeline dashboard is a separate page with its own Kanban. Calendar exists only on BrowseShowsPage. No unified switching.

**myK9 application:**

- **Entries** — Table (spreadsheet for data entry), Kanban (by status: Draft > Submitted > Confirmed > Checked In > Scored), Calendar (by show date)
- **Shows** — Table (sortable list), Kanban (by lifecycle: Planning > Entries Open > Entries Closed > Show Day > Results Published), Calendar (by date)
- **Classes** — Table (all classes for a trial), Kanban (by pipeline stage — this is the existing Mission Control)

**Effort:** Medium-High — needs a `ViewSwitcher` abstraction that shares filter/sort state across view modes.

---

### 4. Saved Views (Personal Workspaces)

**From:** Attio (views as first-class objects), HubSpot (saved filter combinations)

**What it is:** Users save their column selections, filters, sorts, and view mode as named views. Each user's views are independent — the secretary sees "Entries Needing Payment" while the ring steward sees "Ring 2 Run Order."

**What we have today:** URL-based tab and view state (e.g., `?tab=managing&view=list`). No persistent saved views.

**myK9 application:**

- Secretary: "Closing This Week," "Unpaid Entries," "Saturday Ring 1"
- Judge: "My Upcoming Assignments," "Pending Evaluations"
- Exhibitor: "My Active Entries," "Results This Season"

**Effort:** Medium — needs a `saved_views` table (user_id, page, name, config JSON) and a view picker dropdown.

---

### 5. Smart Quick Filters Above Tables

**From:** HubSpot (pinned dropdown filters), Pipedrive (pre-built filter shortcuts)

**What it is:** The 3-4 most common filter dimensions sit as dropdown menus pinned directly above the table. One click to filter. No "open filter panel" step.

**What we have today:** Collapsible filter panel with search bar + dropdowns. Works but requires expanding the panel first.

**myK9 application:**

- **Entries table:** Status | Class | Breed Group | Payment (always visible above table)
- **Shows table:** Status | Organization | Date Range (always visible)
- **Dogs table:** Breed | Sex | Status (always visible)
- Keep "Advanced Filters" button for complex multi-condition queries

**Effort:** Low — extract filter dropdowns from the collapsible panel into a persistent row.

---

### 6. Activity Timeline on Records

**From:** HubSpot (chronological feed), Pipedrive (activity-first philosophy), Attio (unified timeline)

**What it is:** Every record has a chronological activity feed showing all interactions: entries submitted, status changes, payments, notes, emails. Upcoming activities pinned to top. Overdue items highlighted in red.

**What we have today:** No activity timeline. Show history is implicit (you'd have to check entries, results, etc. separately).

**myK9 application:**

- **Dog record:** "Mar 5 — Entered in Rally Novice at Sunflower KC" > "Mar 6 — Checked in, Armband #42" > "Mar 6 — Scored 195/200, 2nd Place" > "Mar 6 — Title earned: RN"
- **Show record:** "Feb 28 — Show created" > "Mar 1 — 12 entries received" > "Mar 3 — Entry period closed" > "Mar 5 — Run orders published"
- **Person record:** "Judged 3 shows this season" > "Next assignment: Apr 12 Sunflower KC"

**Effort:** Medium-High — needs an `activity_log` table and background event logging.

---

### 7. Highlight Widgets / Stats at Record Top

**From:** Attio (up to 6 highlight widgets on record overview), HubSpot (summary panel)

**What it is:** The 4-6 most important metrics for a record display as prominent cards at the top of the detail page, visible without scrolling. Not a separate analytics page — the data lives on the record itself.

**What we have today:** Stat cards on dashboards, but not on individual record pages.

**myK9 application:**

- **Dog:** Total Shows | Titles Earned | Qualifying Rate | Career High Score
- **Show:** Total Entries | Classes | Days Until Show | Revenue
- **Person (judge):** Shows Judged | Upcoming Assignments | Avg Class Size
- **Person (exhibitor):** Active Dogs | Entries This Season | Titles This Year

**Effort:** Low — reuse existing `StatCard` component, add to detail page headers.

---

### 8. No-Confirmation Drag-and-Drop

**From:** Pipedrive (signature pattern)

**What it is:** Dragging a card between Kanban columns changes its state immediately. No confirmation dialog. Optimistic update, sync in background. If you made a mistake, just drag it back.

**What we have today:** Pipeline dashboard has columns but no drag-and-drop. Status changes require opening the record.

**myK9 application:** On Mission Control, drag an entry from "Registered" to "Checked In." Drag a class from "Planned" to "In Progress." The spatial metaphor (left = earlier stage, right = later) makes the workflow self-documenting.

**Effort:** Medium — add `@dnd-kit/core` or similar, wire to optimistic store updates.

---

### 9. Contextual Empty States with Progressive Onboarding

**From:** HubSpot (educational empty states, tip banners, progressive callouts)

**What it is:** Empty states aren't just "no data" — they explain the feature, show what success looks like, and offer a single clear action. After milestones, tip banners introduce the next level of functionality.

**What we have today:** Good role-specific empty states (EnhancedEmptyState component). Missing: progressive tip banners and milestone-triggered callouts.

**myK9 application:**

- After first show created: "Tip: Import your entry list from a CSV file"
- After first show completed: "Did you know you can print run orders and score sheets?"
- After 5 shows: "Consider setting up automated results notifications"
- First time on entries page with no entries: illustration of what a populated entries table looks like

**Effort:** Low — add a `TipBanner` component and a `user_milestones` tracking table.

---

### 10. Global Search Across All Record Types

**From:** HubSpot (unified search bar), Pipedrive (global search)

**What it is:** One search bar at the top finds records across all types — dogs, shows, people, entries, clubs. Results grouped by type. No need to navigate to the right page first.

**What we have today:** Per-page search within browse pages. No global cross-entity search.

**myK9 application:** Type "Buddy" — see the dog named Buddy, the show entry for Buddy, and the handler who owns Buddy. Type "Sunflower" — see Sunflower Kennel Club and all their shows. Command+K shortcut to open.

**Effort:** Medium — needs a search endpoint that queries multiple tables, plus a `CommandPalette` component.

---

## Patterns We Already Do Well

These patterns from the research are already present in myK9:

| Pattern                            | CRM Source | myK9 Status                                         |
| ---------------------------------- | ---------- | --------------------------------------------------- |
| Role-based navigation              | HubSpot    | Sidebar changes by role (secretary/judge/exhibitor) |
| Multi-view browsing                | All three  | Grid/List/Table on browse pages                     |
| Slide-out panels for complex edits | Pipedrive  | 60+ panel implementations via PanelContext          |
| Pipeline/Kanban board              | Pipedrive  | Mission Control dashboard                           |
| Role-specific empty states         | HubSpot    | EnhancedEmptyState with contextual CTAs             |
| Exhibitor onboarding gate          | HubSpot    | ExhibitorOnboardingChecker modal                    |
| URL state preservation             | Attio      | Tabs and view mode in URL params                    |
| Gradient card design system        | Attio      | Consistent across dashboards                        |

---

## Quick Wins (Low Effort, High Impact)

These can be done in a single session each:

1. **Quick filters above tables** — Move 3-4 filter dropdowns out of collapsible panel into persistent row
2. **Highlight widgets on detail pages** — Reuse StatCard, add 4 metrics to dog/show/person pages
3. **"Show only filled fields" toggle** — On record sidebars, hide empty fields (Pipedrive's signature)
4. **Remembered tab preference** — Store last-viewed tab per record type in localStorage
5. **Quick-action buttons on records** — Prominent "Add Entry," "Log Payment," "Send Notification" at top of show records (HubSpot pattern)

---

## Strategic Patterns (Higher Effort, Transformative)

These would fundamentally elevate the product:

1. **Three-panel record layout** — Unified record page component used by all detail pages
2. **Activity timeline** — Event logging + chronological display on every record
3. **Saved views** — Personal workspace configurations per user
4. **Drag-and-drop pipeline** — Mission Control becomes interactive, not just visual
5. **Global command palette search** — Cmd+K to find anything

---

## Design Principles to Adopt

From these three CRMs, the clearest takeaways for our design language:

1. **Activity-first, not record-first** (Pipedrive) — Always answer "what do I need to do next?" before "what happened?"
2. **Function and aesthetics are the same thing** (Attio) — Polish isn't a nice-to-have, it's how users build trust
3. **One-screen test** (HubSpot) — Any core task should be completable or at least understandable from a single screen
4. **Color for semantics, not decoration** (Attio) — Reserve color for status (green=confirmed, yellow=pending, red=overdue), keep chrome monochrome
5. **Optimistic, instant updates** (Pipedrive) — UI responds immediately, sync happens in background (we already do this via replication layer)
6. **Progressive disclosure over separate pages** (All three) — Collapsible sections > new routes. Filters > separate views. Inline editing > edit panels for simple changes.

---

## Sources

### HubSpot

- [Navigation Guide](https://knowledge.hubspot.com/help-and-resources/a-guide-to-hubspots-navigation)
- [Record Page Layout](https://knowledge.hubspot.com/records/work-with-records)
- [Customize Records](https://knowledge.hubspot.com/object-settings/customize-records)
- [View and Filter Records](https://knowledge.hubspot.com/records/view-and-filter-records)
- [EmptyState Component](https://developers.hubspot.com/docs/apps/developer-platform/add-features/ui-extensibility/ui-components/standard-components/empty-state)

### Pipedrive

- [Pipeline Management Features](https://www.pipedrive.com/en/features/pipeline-management)
- [Deal Detail View](https://support.pipedrive.com/en/article/deal-detail-view)
- [Deal Card Customization](https://support.pipedrive.com/en/article/deal-card-customization-sorting)
- [Focus View Mobile](https://support.pipedrive.com/en/article/focus-view-in-the-mobile-app)
- [Contacts Timeline](https://support.pipedrive.com/en/article/contacts-timeline)

### Attio

- [How Attio Creates Beautiful Design](https://www.opensourceceo.com/p/attio-beautiful-design)
- [Attio: Reframing CRM via UX](https://www.softwareco.com/attio-reframe-crm-through-ux-and-language/)
- [How Attio Does Design](https://strategybreakdowns.com/p/how-attio-does-design)
- [Table Views](https://attio.com/help/reference/managing-your-data/views/create-and-manage-table-views)
- [Record Pages](https://attio.com/help/reference/managing-your-data/records/configure-record-pages)
- [Design Guidelines](https://docs.attio.com/sdk/guides/design-guidelines)
