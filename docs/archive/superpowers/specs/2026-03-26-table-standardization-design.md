# Table Standardization Design

**Date:** 2026-03-26
**Status:** Approved

## Goal

Every table in myK9Show gets consistent behavior: sortable columns, global search, pagination, column visibility toggle with localStorage persistence. No exceptions.

## Approach

Migrate all raw HTML `<table>` elements to the existing `DataTable` component (TanStack React Table). Add persistent column visibility and a default toolbar so the simplest migration requires only column definitions and data.

---

## 1. DataTable Enhancements

### 1.1 Persistent Column Visibility

Add a `tableId` prop to `DataTable`. When provided:

- Column visibility state is saved to `localStorage` under key `datatable-cols-{tableId}`
- State is restored on mount
- Non-persistent fallback when `tableId` is omitted (backward-compatible)

Implementation: a `useColumnVisibility(tableId?: string)` hook modeled after the existing `useViewPreference` pattern. The hook returns `[VisibilityState, (state: VisibilityState) => void]` and handles read/write with try-catch for environments where localStorage is unavailable.

The `DataTable` component wires this internally — call sites just pass `tableId`.

### 1.2 Default Toolbar

When `tableId` is provided and no custom `toolbar` prop is passed, `DataTable` automatically renders:

```
[ DataTableSearch ] .................. [ DataTableColumnToggle ]
```

Tables needing extra controls (filters, action buttons) pass a custom `toolbar` prop that includes `DataTableSearch` and `DataTableColumnToggle` alongside their custom elements.

Simplest migration:

```tsx
<DataTable tableId="trialsTab" columns={columns} data={trials} />
```

### 1.3 Pagination

Default `pageSize={25}` with page size options. Already the DataTable default. All tables show pagination controls regardless of row count.

### 1.4 Responsive Column Hiding

Each table defines `meta.responsiveHide` breakpoints for less-critical columns on mobile using the existing `RESPONSIVE_CLASSES` system (`sm`, `md`, `lg`).

---

## 2. Tables to Migrate

### Tier 1 — Simple (column definitions only)

| #   | Table                     | File                                                             | Columns                                                        | Notes                                                                           |
| --- | ------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | TrialsTab (table view)    | `components/shows/tabs/TrialsTab.tsx`                            | Date, Trial Name, Type, Time, Classes, Entries, Scored, Status | Row click navigates to trial detail. Card view unchanged.                       |
| 2   | MyEntriesTab (table view) | `components/shows/tabs/MyEntriesTab.tsx`                         | Class, Status, Progress, My Dog, Position                      | Card view unchanged.                                                            |
| 3   | EntriesTab (ShowDetails)  | `components/shows/ShowDetails/EntriesTab.tsx`                    | Dog, Class, Handler/Owner, Armband, Status, Date               | Replace manual search with DataTable global filter. Remove custom search input. |
| 4   | ScratchEntriesTable       | `pages/secretary/DayOfOperationsPage/ScratchEntriesTable.tsx`    | Armband, Dog, Handler, Class, Check-in, Actions                | Actions column: Scratch button. `enableSorting: false` on Actions.              |
| 5   | MoveUpEntriesTable        | `pages/secretary/DayOfOperationsPage/MoveUpEntriesTable.tsx`     | Armband, Dog, Handler, Current Class, Status, Actions          | Actions column: Move Up button. `enableSorting: false` on Actions.              |
| 6   | ClassAvailabilityTable    | `pages/secretary/DayOfOperationsPage/ClassAvailabilityTable.tsx` | Class, Limit, Accepted, Available, Status                      | Small dataset but gets full features per requirement.                           |

### Tier 2 — Medium (existing filters/controls to preserve)

| #   | Table                   | File                                                       | Special Handling                                                                                                                                                                                          |
| --- | ----------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | ClassesTab (table view) | `components/shows/tabs/ClassesTab.tsx`                     | Flatten trial grouping into a "Trial" column so sorting works across all rows. Keep Mine toggle + status filter above DataTable. Card view unchanged. Section display appended to Level in cell renderer. |
| 8   | WaitlistTable           | `pages/secretary/WaitlistManagementPage/WaitlistTable.tsx` | Currently card-based. Migrate to DataTable with Position, Dog, Added, Actions columns. Keep Offer Spot / Remove action buttons in Actions column.                                                         |

### Tier 3 — Complex (large files with tabs/grouping/export)

| #   | Table                  | File                                                 | Special Handling                                                                                                                                                                                                                       |
| --- | ---------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9   | PermissionAuditPage    | `pages/admin/permissions/PermissionAuditPage.tsx`    | Flatten date grouping into sortable columns. Keep date range selector + action filter as custom toolbar extras alongside DataTableSearch and DataTableColumnToggle. Keep CSV export button. Summary stat cards remain above the table. |
| 10  | UserRoleManagementPage | `pages/admin/permissions/UserRoleManagementPage.tsx` | Migrate only the "User Assignments" table tab. Role Summary tab (card grid) unchanged. Keep Assign Role button + revoke action in Actions column.                                                                                      |
| 11  | UserActivityUsersTab   | `components/analytics/UserActivityUsersTab.tsx`      | Convert card grid to DataTable with User, Role, Status, Device, Last Activity columns. Keep engagement metrics section separate (not tabular).                                                                                         |

### Tier 4 — Already on DataTable (add `tableId` + column toggle)

These tables already use `DataTable` with search and sorting. They just need `tableId` added for persistent column visibility, and `DataTableColumnToggle` added to their existing custom toolbars.

| #   | Table                | File                                                         |
| --- | -------------------- | ------------------------------------------------------------ |
| 12  | TrialEntriesTable    | `components/trials/TrialDetail/TrialEntriesTable.tsx`        |
| 13  | TrialClassesTable    | `components/trials/TrialDetail/TrialClassesTable.tsx`        |
| 14  | ClassEntriesTable    | `components/classes/ClassEntriesTable/ClassEntriesTable.tsx` |
| 15  | ClassResultsTable    | `components/classes/ClassResultsTable/index.tsx`             |
| 16  | EntriesTableView     | `components/entries/management/EntriesTableView.tsx`         |
| 17  | UserTable            | `components/admin/users/UserTable/index.tsx`                 |
| 18  | PeopleTableView      | `components/users/browse/PeopleTableView.tsx`                |
| 19  | ShowsTableView       | `components/shows/browse/ShowsTableView.tsx`                 |
| 20  | ClassesTableView     | `components/classes/ClassesTableView.tsx`                    |
| 21  | DogsTableView        | `components/dogs/browse/DogsTableView.tsx`                   |
| 22  | ClassDefinitionTable | `components/templates/admin/ClassDefinitionTable.tsx`        |

---

## 3. Grouping-to-Column Strategy

Tables that currently use section header rows for grouping (ClassesTab groups by trial, PermissionAuditPage groups by date) are flattened: the group value becomes a regular sortable column. This ensures all rows participate in sort/search/pagination uniformly.

- **ClassesTab:** Add "Trial" column (e.g., "Saturday Trial 1"). Default sort: Trial asc, Element asc, Level asc.
- **PermissionAuditPage:** Time column already exists. Rows become flat list sorted by time desc by default.

---

## 4. Column Definitions Per Table

### TrialsTab

| Column     | accessorKey      | Sortable       | Responsive Hide | Cell Renderer                           |
| ---------- | ---------------- | -------------- | --------------- | --------------------------------------- |
| Date       | trialDate        | Yes (datetime) | —               | `MMM D` format                          |
| Trial Name | name             | Yes            | —               | Fallback to `Trial {trialNumber}`       |
| Type       | trialType        | Yes            | md              | —                                       |
| Time       | plannedStartTime | Yes            | md              | —                                       |
| Classes    | classCount       | Yes            | —               | Numeric from trialStats                 |
| Entries    | entryCount       | Yes            | —               | Numeric from trialStats                 |
| Scored     | scored           | Yes            | sm              | `{completed}/{total}` or em-dash        |
| Status     | status           | Yes            | —               | Badge with `getClassStatusBadgeClasses` |

Row click: navigate to `/shows/{showId}/trials/{trialId}`.

### ClassesTab

| Column  | accessorKey | Sortable                     | Responsive Hide | Cell Renderer              |
| ------- | ----------- | ---------------------------- | --------------- | -------------------------- |
| Trial   | trialLabel  | Yes                          | md              | Combined date + trial name |
| Element | element     | Yes                          | —               | —                          |
| Level   | level       | Yes (custom `compareLevels`) | —               | Level + section suffix     |
| Judge   | judgeName   | Yes                          | md              | Fallback "TBD"             |
| Time    | time        | Yes                          | sm              | —                          |
| Ring    | ring        | Yes                          | sm              | Hidden when `hideRing`     |
| Status  | status      | Yes                          | —               | Badge                      |
| Entries | entryCount  | Yes                          | —               | Numeric                    |

Row click: navigate to class detail. Mine toggle + status filter remain above DataTable.

### EntriesTab (ShowDetails)

| Column          | accessorKey  | Sortable       | Responsive Hide | Cell Renderer         |
| --------------- | ------------ | -------------- | --------------- | --------------------- |
| Dog             | dogName      | Yes            | —               | Name + breed subtitle |
| Class           | className    | Yes            | —               | —                     |
| Handler / Owner | handler      | Yes            | md              | —                     |
| Armband         | armband      | Yes            | —               | Monospace             |
| Status          | entry_status | Yes            | —               | Badge                 |
| Date            | created_at   | Yes (datetime) | sm              | Formatted date        |

### MyEntriesTab

| Column   | accessorKey | Sortable | Responsive Hide | Cell Renderer                       |
| -------- | ----------- | -------- | --------------- | ----------------------------------- |
| Class    | className   | Yes      | —               | —                                   |
| Status   | scored      | Yes      | —               | Scored/Pending badge                |
| Progress | progress    | Yes      | md              | —                                   |
| My Dog   | dogName     | Yes      | —               | Name + armband suffix               |
| Position | position    | Yes      | —               | "Next up" / "N ahead" / "Completed" |

### ScratchEntriesTable

| Column   | accessorKey   | Sortable | Responsive Hide | Cell Renderer             |
| -------- | ------------- | -------- | --------------- | ------------------------- |
| Armband  | armband       | Yes      | —               | —                         |
| Dog      | dogName       | Yes      | —               | Name + call_name subtitle |
| Handler  | handler       | Yes      | md              | —                         |
| Class    | className     | Yes      | —               | —                         |
| Check-in | checkInStatus | Yes      | sm              | Badge                     |
| Actions  | —             | No       | —               | Scratch button            |

### MoveUpEntriesTable

| Column        | accessorKey | Sortable | Responsive Hide | Cell Renderer             |
| ------------- | ----------- | -------- | --------------- | ------------------------- |
| Armband       | armband     | Yes      | —               | —                         |
| Dog           | dogName     | Yes      | —               | Name + call_name subtitle |
| Handler       | handler     | Yes      | md              | —                         |
| Current Class | className   | Yes      | —               | —                         |
| Status        | status      | Yes      | —               | Badge                     |
| Actions       | —           | No       | —               | Move Up button            |

### ClassAvailabilityTable

| Column    | accessorKey | Sortable | Responsive Hide | Cell Renderer        |
| --------- | ----------- | -------- | --------------- | -------------------- |
| Class     | className   | Yes      | —               | Number prefix + name |
| Limit     | limit       | Yes      | —               | Numeric              |
| Accepted  | accepted    | Yes      | —               | Numeric              |
| Available | available   | Yes      | —               | Numeric              |
| Status    | status      | Yes      | —               | Open/Full badge      |

### WaitlistTable

| Column   | accessorKey | Sortable       | Responsive Hide | Cell Renderer               |
| -------- | ----------- | -------------- | --------------- | --------------------------- |
| Position | position    | Yes            | —               | Numbered badge              |
| Dog      | dogName     | Yes            | —               | Icon + name/call_name       |
| Added    | created_at  | Yes (datetime) | sm              | Relative timestamp          |
| Actions  | —           | No             | —               | Offer Spot + Remove buttons |

### PermissionAuditPage

| Column  | accessorKey | Sortable       | Responsive Hide | Cell Renderer                  |
| ------- | ----------- | -------------- | --------------- | ------------------------------ |
| Action  | action      | Yes            | —               | Icon + badge (colored by type) |
| Actor   | userId      | Yes            | —               | —                              |
| Target  | targetType  | Yes            | md              | Type + ID                      |
| Details | details     | Yes            | lg              | Key:value metadata             |
| Time    | timestamp   | Yes (datetime) | —               | Formatted datetime             |

Custom toolbar: date range selector + action filter + DataTableSearch + DataTableColumnToggle + CSV export button.

### UserRoleManagementPage

| Column   | accessorKey | Sortable       | Responsive Hide | Cell Renderer             |
| -------- | ----------- | -------------- | --------------- | ------------------------- |
| User     | email       | Yes            | —               | Email + user ID           |
| Role     | roleName    | Yes            | —               | Display name + code       |
| Scope    | scope       | Yes            | md              | Badge (type:id or Global) |
| Status   | isActive    | Yes            | —               | Active/Inactive badge     |
| Assigned | assignedAt  | Yes (datetime) | sm              | Date + assigned_by        |
| Expires  | expiresAt   | Yes            | lg              | Date or "Never" badge     |
| Actions  | —           | No             | —               | Dropdown with Revoke      |

### UserActivityUsersTab

| Column        | accessorKey  | Sortable       | Responsive Hide | Cell Renderer                |
| ------------- | ------------ | -------------- | --------------- | ---------------------------- |
| User          | userName     | Yes            | —               | Avatar + name                |
| Role          | role         | Yes            | —               | —                            |
| Status        | isOnline     | Yes            | —               | Online/Offline badge         |
| Device        | deviceType   | Yes            | sm              | Icon (mobile/tablet/desktop) |
| Last Activity | lastActivity | Yes (datetime) | —               | Minutes ago                  |

---

## 5. Testing

Each migrated table gets unit tests verifying:

1. Renders column headers
2. Renders data rows
3. Search filters rows
4. Column sort toggles (click header, verify order changes)
5. Pagination renders (if dataset > page size)
6. Column visibility toggle hides/shows a column

The `useColumnVisibility` hook gets its own unit test:

1. Returns default `{}` when no stored state
2. Reads from localStorage on mount
3. Writes to localStorage on change
4. Gracefully handles localStorage unavailability

---

## 6. Out of Scope

- Card/grid views are not changed (only table views migrate to DataTable)
- No new columns added beyond what currently exists (except "Trial" column for ClassesTab flattening)
- No backend changes
