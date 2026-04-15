# Sidebar Nav Redesign — Design Spec

**Date:** 2026-04-14  
**Status:** Approved  
**Scope:** Secretary nav simplification, exhibitor nav consolidation, route cleanup

---

## Problem

The sidebar is fragmented and confusing:

- Secretary + exhibitor users see 16 nav items across 3 sections
- "My Shows" section contains two redundant items (Dashboard duplicates exhibitor dashboard; My Account duplicates avatar dropdown profile)
- Pure exhibitors see 7 items including Profile and Settings which belong in the avatar dropdown
- "Run Orders" is a misnomer — users expect it to mean dog order within a class; it actually shows class/ring scheduling
- "Pipeline" is jargon; "Dashboard" is universally understood
- "Create Show" is an action, not a destination — it doesn't belong in the nav
- "Messages" is scaffolded but not wired; it should be hidden until ready
- Item order does not match the secretary's natural show lifecycle workflow

---

## Decisions

### Secretary — Manage section

**Before (10 items, arbitrary order):**
Pipeline, Create Show, Entries, Day-of Ops, Tasks, Run Orders, Messages, Reports, Results Control, Submit Results

**After (8 items, lifecycle order):**

| #   | Nav label       | Route                           | Notes                                                                                                           |
| --- | --------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | Dashboard       | `/secretary/dashboard`          | Renamed from "Pipeline". Verify a "Create Show" button exists on this page; add one if missing.                 |
| 2   | Entries         | `/secretary/entries`            | Wait List is a tab, not a nav item.                                                                             |
| 3   | Tasks           | `/secretary/tasks`              | Pre-show preparation tool.                                                                                      |
| 4   | Schedule        | `/secretary/run-order`          | Renamed from "Run Orders". "Run order" means dog order within a class; this page handles class/ring scheduling. |
| 5   | Day of Show     | `/secretary/day-of`             | Renamed from "Day-of Ops". Check-in is a tab, not a nav item.                                                   |
| 6   | Reports         | `/secretary/reports`            | Used in Phase 3 (scoresheets) and Phase 4 (official reports).                                                   |
| 7   | Results Control | `/secretary/results-control`    | Used in Phase 3 (enter results) and Phase 4 (verify/release).                                                   |
| 8   | Submit Results  | `/secretary/results-submission` | Final Phase 4 step. Keep generic name — not AKC-specific, future orgs planned.                                  |

**Removed from nav:**

- **Create Show** — demoted to a button on the Dashboard page
- **Messages** — hidden until the feature is fully wired (fall 2026 deliverable)

### Secretary — Browse section

**Before:** Shows, Dogs, People  
**After:** Shows, Dogs, Clubs, People

Clubs and Dogs restored — secretary needs to look up dogs and clubs when managing entries and people.

### Secretary + Exhibitor — "My Shows" section

**Before (3 items):** Dashboard (`/exhibitor/dashboard`), My Account (`/exhibitor/account`), Current Entries (`/exhibitor/entries`)

**After (1 item):**

| #   | Nav label | Route                | Notes                              |
| --- | --------- | -------------------- | ---------------------------------- |
| 1   | My Shows  | `/exhibitor/entries` | New consolidated page (see below). |

**Section renamed:** "My Shows" → "As Exhibitor" — makes the role context clear for a secretary who also competes.

**Removed:**

- **Dashboard** — absorbed into the new consolidated My Shows page
- **My Account** — duplicate of the avatar dropdown → `/profile` link

### Pure Exhibitor sidebar

**Before (7 items):** Home, Show Day, My Dogs, My Entries, Find Shows, Profile, Settings

**After (3 items):**

| #   | Nav label  | Route                 |
| --- | ---------- | --------------------- |
| 1   | My Shows   | `/exhibitor/entries`  |
| 2   | Show Day   | `/exhibitor/show-day` |
| 3   | Find Shows | `/shows`              |

Profile and Settings move to the avatar dropdown (they're already there at `/profile` and `/preferences`).

---

## New Page: Consolidated Exhibitor "My Shows"

Replaces both `ExhibitorDashboard` (`/exhibitor/dashboard`) and `MyEntriesPage` (`/exhibitor/entries`). The new page lives at `/exhibitor/entries` and becomes the single exhibitor hub.

### Layout (top to bottom)

1. **Greeting header** — "Good morning, Sarah" + "Here's what's happening with your shows" + "Enter a Show" button. Carried over from ExhibitorDashboard.
2. **Show Day alert** — conditional banner linking to `/exhibitor/show-day`. Only renders when the exhibitor has entries for a show today. Carried over from ExhibitorDashboard.
3. **My Dogs strip** — compact dog cards showing:
   - Dog name + breed
   - Upcoming show count badge (green "2 upcoming" or amber "Not entered")
   - Title abbreviations as secondary info (e.g. SWN, SWA)
   - "Add Dog" card at the end
4. **Entry tabs** — All / Upcoming / Accepted / Waitlist / Pending / Completed
5. **Entry list** — existing `MyEntryCard` components with edit, receipt, and check-in actions
6. **Waitlist queue** — existing waitlist section at bottom

### What moves from ExhibitorDashboard to the new page

- Greeting header
- Show Day alert
- Stats row (active entries, upcoming shows, dog count) — rendered above the dog strip
- Title Progress info — surfaced inline on each dog card rather than a separate card

### What is removed

- Recent Results section — not in the new page (not critical path for fall)
- Quick action cards (Find Shows, My Dogs, My Entries) — replaced by the nav itself and the dog strip

### ExhibitorDashboard fate

- Page component and route (`/exhibitor/dashboard`) are deleted
- Any inbound links to `/exhibitor/dashboard` are redirected to `/exhibitor/entries`

---

## Route Cleanup

| Route                  | Action                                    | Reason                                                |
| ---------------------- | ----------------------------------------- | ----------------------------------------------------- |
| `/exhibitor/account`   | Delete                                    | Duplicate of `/profile`; same `ProfilePage` component |
| `/exhibitor/profile`   | Delete                                    | Duplicate of `/profile`; same `ProfilePage` component |
| `/exhibitor/dashboard` | Delete + redirect to `/exhibitor/entries` | Replaced by consolidated My Shows page                |

Also update `getDashboardRoute` in `src/hooks/roleUtils.ts` — exhibitors currently land on `/exhibitor/dashboard` after login. Change to `/exhibitor/entries` so the post-login redirect still works after the dashboard route is deleted.

---

## Sidebar Config Changes (`unifiedSidebarConfig.ts`)

- Secretary Manage section: reorder, rename Dashboard + Schedule, remove Create Show + Messages
- Secretary Browse section: add Clubs and Dogs
- Secretary+Exhibitor "My Shows" section: rename to "As Exhibitor", replace 3 items with 1 (My Shows)
- Exhibitor-only section: replace 4 items (Home, My Dogs, My Entries, Profile/Settings) with 3 (My Shows, Show Day, Find Shows)

---

## Out of Scope

- Pipeline/Dashboard page redesign — acknowledged as needed, separate spec
- Messages feature build-out — deferred to post-fall
- Within-class run order feature — future deliverable; "Schedule" naming leaves room for it
- Avatar dropdown changes — Profile and Settings already exist there; no changes needed
