# Volunteer Scheduling Page — Design Spec

**Date:** 2026-03-30
**Status:** Draft
**Route:** `/shows/:showId/volunteers`
**Role access:** SECRETARY, SITE_ADMIN

## Overview

A show-scoped page for managing volunteer/steward assignments to ring roles and general duties. Secretaries add volunteers (linked to registered users or ad-hoc walk-ups), then assign them to roles on per-class cards and show-level general duty cards using a click-to-assign popover.

Ported from myK9Q's ScheduleBoard/VolunteerPool system, adapted to myK9Show's auth-based model, card-based layout patterns, and React Query data layer.

## Data Model

### Volunteer Pool (Hybrid Model)

Volunteers are per-show. Each volunteer is either linked to a registered user (`person_id` set) or a walk-up (standalone name + phone, `person_id` null).

**Table: `volunteers`** (existing, migration 004)

| Column       | Type             | Notes                                                        |
| ------------ | ---------------- | ------------------------------------------------------------ |
| id           | UUID PK          |                                                              |
| person_id    | UUID FK → people | Nullable. Set when linked to a registered user.              |
| name         | TEXT NOT NULL    | Denormalized for display. Auto-filled from people if linked. |
| phone        | TEXT             | Optional contact number.                                     |
| notes        | TEXT             | Availability, skills, etc.                                   |
| is_available | BOOLEAN          | Default true.                                                |
| show_id      | UUID FK → shows  | Scopes volunteer to a single show.                           |
| created_at   | TIMESTAMPTZ      |                                                              |
| updated_at   | TIMESTAMPTZ      |                                                              |

**Note:** The existing migration uses `license_key` for scoping. A new migration will add `show_id` column and migrate/replace `license_key` usage for myK9Show. myK9Q continues using `license_key`.

### Assignments

**Table: `volunteer_class_assignments`** (existing, migration 004)

| Column       | Type                                | Notes                                                                              |
| ------------ | ----------------------------------- | ---------------------------------------------------------------------------------- |
| id           | UUID PK                             |                                                                                    |
| volunteer_id | UUID FK → volunteers                | CASCADE delete.                                                                    |
| class_id     | UUID FK → classes                   | The class this assignment is for.                                                  |
| role_id      | UUID FK → volunteer_roles           | Nullable — use `role_name` as source of truth.                                     |
| role_name    | TEXT                                | Denormalized role name (e.g., "Gate Steward").                                     |
| status       | TEXT                                | 'assigned', 'confirmed', 'checked_in', 'completed', 'no_show'. Default 'assigned'. |
| notes        | TEXT                                | Optional.                                                                          |
| created_at   | TIMESTAMPTZ                         |                                                                                    |
| UNIQUE       | (volunteer_id, class_id, role_name) | Prevent duplicate assignments.                                                     |

Multiple volunteers can be assigned to the same class + role (e.g., 3 Ring Stewards).

**Table: `volunteer_general_assignments`** (existing, migration 004)

| Column       | Type                               | Notes                                                 |
| ------------ | ---------------------------------- | ----------------------------------------------------- |
| id           | UUID PK                            |                                                       |
| volunteer_id | UUID FK → volunteers               | CASCADE delete.                                       |
| show_id      | UUID FK → shows                    | Scoped to show.                                       |
| role_name    | TEXT                               | Denormalized role name (e.g., "Hospitality").         |
| shift_start  | TIME                               | Optional.                                             |
| shift_end    | TIME                               | Optional.                                             |
| status       | TEXT                               | Same values as class assignments. Default 'assigned'. |
| notes        | TEXT                               | Optional.                                             |
| created_at   | TIMESTAMPTZ                        |                                                       |
| UNIQUE       | (volunteer_id, show_id, role_name) | Prevent duplicate assignments.                        |

### Fixed Roles

No role configuration UI in v1. Roles are defined as constants:

**Ring roles** (per-class): Gate Steward, Timer, Ring Steward
**General duties** (per-show): Hospitality, Equipment, Ring Setup, Ribbons

Stored as a `VOLUNTEER_ROLES` constant in a shared file. The `volunteer_roles` table is not used in v1 — `role_name` strings are the source of truth on assignment records.

### Conflict Detection

A volunteer has a **conflict** with a class if they are also entered in that class as an exhibitor. Detected by joining:

- `volunteers.person_id` → `people.id` → `entries` where `entries.class_id` matches the assigned class

Conflicts show a warning icon but do not block assignment.

## Page Structure

### Route & Navigation

- **Route:** `/shows/:showId/volunteers`
- **Sidebar:** New entry under Secretary "Manage" section — icon: `Users` (Lucide), label: "Volunteers"
- **Route file:** `secretaryRoutes.tsx` — lazy-loaded, protected by SECRETARY + SITE_ADMIN roles

### Layout Zones

```
┌─────────────────────────────────────────────────┐
│ Breadcrumb: Shows > {Show Name} > Volunteers    │
├─────────────────────────────────────────────────┤
│ Volunteer Pool                                   │
│ [12 volunteers] [Sarah M.] [Mike R.] [Tom K.]   │
│ [Linda P.] [Joe B.] ...        [+ Add Volunteer]│
├─────────────────────────────────────────────────┤
│ Toolbar: [Search...] [Trial ▾] [□ Unfilled only]│
├─────────────────────────────────────────────────┤
│ Trial 1 — Sat Mar 28                             │
│ ┌──────────────┐ ┌──────────────┐                │
│ │ Containers   │ │ Interior     │                │
│ │ Novice       │ │ Novice       │                │
│ │              │ │              │                │
│ │ Gate: [chip] │ │ Gate: [chip] │                │
│ │ Timer: [+]   │ │ Timer: [⚠chip]               │
│ │ Ring: [chip] │ │ Ring: [+]    │                │
│ └──────────────┘ └──────────────┘                │
│                                                   │
│ ── General Duties ──────────────────────────────  │
│ ┌──────────────┐ ┌──────────────┐                │
│ │ Hospitality  │ │ Equipment    │                │
│ │ [chip] [+]   │ │ [+]          │                │
│ └──────────────┘ └──────────────┘                │
└─────────────────────────────────────────────────┘
```

## Components

### VolunteerSchedulingPage

Top-level page component. Receives `showId` from URL params. Orchestrates data fetching and passes data to child components.

**File:** `apps/myk9show/src/pages/secretary/VolunteerSchedulingPage/index.tsx`

### VolunteerPool

Horizontal strip showing all volunteers as compact chips. Scrollable when overflowing.

- Count badge: "12 volunteers"
- Each chip: first name + last initial, exhibitor badge if entered in this show
- Click chip → edit dialog
- "+ Add Volunteer" button at end
- Chips show `(walk-up)` label for volunteers without `person_id`

**File:** `apps/myk9show/src/components/volunteers/VolunteerPool.tsx`

### VolunteerDialog

Dialog for adding/editing volunteers.

**Fields:**

- **Search registered users** — Combobox searching `people` table. Selecting auto-fills name + phone, sets `person_id`. Optional — skip for walk-ups.
- **Name** (required) — Text input. Editable even after auto-fill.
- **Phone** (optional) — Text input.
- **Notes** (optional) — Textarea. Availability, skills.

**Actions:** Save, Delete (edit mode only), Cancel.

**File:** `apps/myk9show/src/components/volunteers/VolunteerDialog.tsx`

### ClassVolunteerCard

Card representing a single class with its ring role assignments.

**Header:** Class name, metadata line (ring, time, judge name).
**Body:** One row per ring role (Gate Steward, Timer, Ring Steward). Each row shows:

- Role label
- Assigned volunteer chips (wrapping, multiple allowed)
- "+ Assign" button (always visible at end of chip row)
- Conflict badge (⚠) on chips where volunteer is entered in this class

**File:** `apps/myk9show/src/components/volunteers/ClassVolunteerCard.tsx`

### GeneralDutyCard

Card for a general duty role (Hospitality, Equipment, etc.).

**Header:** Role name.
**Body:** Assigned volunteer chips + "+ Assign" button. Same chip/assign UX as class cards.

**File:** `apps/myk9show/src/components/volunteers/GeneralDutyCard.tsx`

### AssignVolunteerPopover

Popover anchored to the "+ Assign" button. Shows a searchable list of volunteers from the pool.

- Search input at top — filters by name
- List items show volunteer name, "(walk-up)" label if no `person_id`, ⚠ if conflict with this class
- Click to assign. Popover closes.
- Already-assigned volunteers for this role+class are excluded from the list (or shown as disabled/checked)

**File:** `apps/myk9show/src/components/volunteers/AssignVolunteerPopover.tsx`

### VolunteerChip

Small pill displaying an assigned volunteer's name with an X button to unassign.

- Display: First name + last initial
- Conflict state: amber background + ⚠ icon
- Click X → unassign (with optimistic removal)

**File:** `apps/myk9show/src/components/volunteers/VolunteerChip.tsx`

## Data Fetching

All hooks in `apps/myk9show/src/hooks/queries/volunteerQueries.ts`.

### Queries

| Hook                                     | Query Key                                      | Data                                                 |
| ---------------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| `useVolunteers(showId)`                  | `['volunteers', showId]`                       | All volunteers for the show                          |
| `useVolunteerClassAssignments(showId)`   | `['volunteer-assignments', 'class', showId]`   | All class assignments, joined with volunteer names   |
| `useVolunteerGeneralAssignments(showId)` | `['volunteer-assignments', 'general', showId]` | All general assignments, joined with volunteer names |
| `useShowClassesForVolunteers(showId)`    | Reuse `queryKeys.showClasses(showId)`          | Classes with trial info, judge, entry counts         |

### Mutations

| Hook                           | Action                                          | Invalidates                                    |
| ------------------------------ | ----------------------------------------------- | ---------------------------------------------- |
| `useAddVolunteer()`            | Insert into `volunteers`                        | `['volunteers', showId]`                       |
| `useUpdateVolunteer()`         | Update `volunteers` row                         | `['volunteers', showId]`                       |
| `useDeleteVolunteer()`         | Delete from `volunteers` (cascades assignments) | `['volunteers', showId]`, both assignment keys |
| `useAssignToClass()`           | Insert into `volunteer_class_assignments`       | `['volunteer-assignments', 'class', showId]`   |
| `useUnassignFromClass()`       | Delete from `volunteer_class_assignments`       | `['volunteer-assignments', 'class', showId]`   |
| `useAssignToGeneralDuty()`     | Insert into `volunteer_general_assignments`     | `['volunteer-assignments', 'general', showId]` |
| `useUnassignFromGeneralDuty()` | Delete from `volunteer_general_assignments`     | `['volunteer-assignments', 'general', showId]` |

All mutations use optimistic updates — UI updates immediately, reverts on error with toast notification.

### Conflict Detection

`useVolunteerConflicts(showId)` — queries entries for this show joined with `people` to build a map: `Map<volunteerId, Set<classId>>`. Used by ClassVolunteerCard to show conflict badges. Cached with `cacheStrategies.moderate` (5 min).

### People Search

`useSearchPeople(query)` — debounced search hook for the VolunteerDialog combobox. Queries `people` table by name. Returns `{ id, first_name, last_name, phone }`. Enabled only when query length >= 2.

## Filtering & Search

Handled by a `useVolunteerFilters` hook in the page directory.

- **Search** (text input): Filters class cards by class name, judge name, or assigned volunteer name. Also filters general duty cards by role name or assigned volunteer name.
- **Trial filter** (dropdown): Shows "All Trials" + individual trial options. Filters class cards to selected trial. No effect on general duties.
- **Unfilled only** (checkbox toggle): Shows only cards that have at least one role with no volunteer assigned.

All filtering is client-side on already-fetched data.

## Error Handling

- **Save/delete failures:** Toast via `notifications.error()`.
- **Optimistic revert:** On mutation error, React Query cache reverts to previous state.
- **Empty states:**
  - No volunteers: "No volunteers added yet. Click 'Add Volunteer' to get started." with illustration.
  - No classes: "This show has no classes yet. Create trials and classes first."
  - No results after filtering: "No classes match your filters." with clear-filters action.
- **Loading:** Skeleton cards while data loads.

## Database Migration

Actual state of migration 004 vs what this feature needs:

- `volunteers`: has `license_key` but **no `show_id`** — needs new column
- `volunteer_general_assignments`: already has `show_id` — no change needed
- `volunteer_class_assignments`: unique constraint is `(volunteer_id, class_id, role_id)` — needs changing to `(volunteer_id, class_id, role_name)` since v1 uses `role_name` not `role_id`
- `volunteer_general_assignments`: no unique constraint — needs `(volunteer_id, show_id, role_name)` added
- CASCADE deletes on `volunteer_id` FK already exist on both assignment tables

New migration will:

1. Add `show_id` (UUID, FK → shows, nullable) to `volunteers` table + index
2. Drop old unique constraint `(volunteer_id, class_id, role_id)` on `volunteer_class_assignments`, add `(volunteer_id, class_id, role_name)`
3. Add unique constraint `(volunteer_id, show_id, role_name)` on `volunteer_general_assignments`
4. Add RLS policies: authenticated users with secretary/site_admin role can CRUD; all authenticated users can SELECT (read-only view of volunteer schedule)

The existing `license_key` column stays for myK9Q compatibility. myK9Show queries filter by `show_id`; myK9Q queries filter by `license_key`.

## Testing

### Unit Tests

| File                              | Tests                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `VolunteerPool.test.tsx`          | Renders chips, count badge, add button, click-to-edit, exhibitor badge, walk-up label                          |
| `VolunteerDialog.test.tsx`        | Add mode, edit mode, people search auto-fill, validation (name required), delete confirmation                  |
| `ClassVolunteerCard.test.tsx`     | Renders class info, role rows, assigned chips, "+ Assign" button, conflict badge, multiple volunteers per role |
| `GeneralDutyCard.test.tsx`        | Renders role name, assigned chips, "+ Assign" button                                                           |
| `AssignVolunteerPopover.test.tsx` | Search filter, excludes already-assigned, conflict indicator, click-to-assign                                  |
| `VolunteerChip.test.tsx`          | Renders name, conflict state, X button unassign                                                                |
| `volunteerQueries.test.ts`        | CRUD hooks, optimistic updates, cache invalidation                                                             |
| `useVolunteerFilters.test.ts`     | Search, trial filter, unfilled-only toggle, combined filters                                                   |

## Out of Scope (Future)

- Drag-and-drop assignment (desktop power-user enhancement)
- Custom role configuration (add/remove/rename roles per show)
- Assignment status tracking (confirmed, checked-in, completed, no-show)
- Volunteer availability/shift scheduling with time ranges
- Print-friendly volunteer schedule report
- Bulk assignment (assign one volunteer to all classes in a trial)
- Notification to volunteers about their assignments
