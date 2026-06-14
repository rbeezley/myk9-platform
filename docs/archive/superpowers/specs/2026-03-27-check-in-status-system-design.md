# Check-In Status System — Design Spec

**Date:** 2026-03-27
**Status:** Draft

## Problem

myK9Show has no way to track or display the show-day status of entries (checked-in, at gate, in ring, etc.). myK9Q has this feature and it's essential for live event operations: judges see who's ready, stewards manage the gate, exhibitors confirm arrival. Status changes must propagate in real time to all viewers.

## Decisions Made

- **Data storage:** New `check_in_status` column on `entries` table, separate from existing `entry_status` lifecycle column
- **Real-time:** Supabase Postgres Change Events, one channel per class
- **Offline:** Status changes go through the replication layer (optimistic local update, async sync)
- **UI trigger:** Tap status badge on entry card/table row -> opens dialog
- **Dialog vs sheet:** Dialog — this is a quick single-tap selection, not a form
- **Visual consistency:** Single canonical config in `@myk9/core`, consumed everywhere

## Status Values

Eight check-in statuses, already defined in `@myk9/core` as `CheckInStatus`:

| Status         | Label        | Lucide Icon     | Color Var              | Who Can Set              |
| -------------- | ------------ | --------------- | ---------------------- | ------------------------ |
| `no-status`    | No Status    | `Circle`        | `--checkin-none`       | Anyone (reset)           |
| `checked-in`   | Checked-in   | `Check`         | `--checkin-checked-in` | Anyone                   |
| `conflict`     | Conflict     | `AlertTriangle` | `--checkin-conflict`   | Anyone                   |
| `pulled`       | Pulled       | `XCircle`       | `--checkin-pulled`     | Anyone                   |
| `at-gate`      | At Gate      | `Star`          | `--checkin-at-gate`    | Anyone                   |
| `come-to-gate` | Come to Gate | `Bell`          | `--checkin-at-gate`    | Staff only               |
| `in-ring`      | In Ring      | `Target`        | `--checkin-in-ring`    | Staff only (+ automatic) |
| `completed`    | Completed    | `CheckCircle`   | `--status-completed`   | Staff only (+ automatic) |

**Role restrictions:**

- **Exhibitors** see 5 options: No Status, Checked-in, Conflict, Pulled, At Gate
- **Staff** (secretary, judge, steward) see all 8 options
- Already encoded in `@myk9/core` as `EXHIBITOR_ALLOWED_STATUSES` and `SECRETARY_ONLY_STATUSES`

## Two Status Axes

The `entries` table has a single `entry_status` column that currently mixes lifecycle statuses (`draft`, `submitted`, `paid`, `confirmed`) with show-day statuses (`checked-in`, `competing`, `completed`). This spec adds a separate `check_in_status` column for the show-day axis:

| Column            | Purpose                | Values                                                                                             |
| ----------------- | ---------------------- | -------------------------------------------------------------------------------------------------- |
| `entry_status`    | Registration lifecycle | `draft`, `submitted`, `paid`, `confirmed`, `completed`, `withdrawn`, `scratched`, `absent`         |
| `check_in_status` | Show-day operations    | `no-status`, `checked-in`, `conflict`, `pulled`, `at-gate`, `come-to-gate`, `in-ring`, `completed` |

These are independent. An entry can be `confirmed` (lifecycle) and `at-gate` (show-day) simultaneously. The existing `entry_status` column and its consumers are unchanged.

## Database Migration (092)

```sql
-- Add check-in status column
ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS check_in_status TEXT DEFAULT 'no-status'
  CHECK (check_in_status IN (
    'no-status', 'checked-in', 'conflict', 'pulled',
    'at-gate', 'come-to-gate', 'in-ring', 'completed'
  ));

-- Index for filtered queries (class entries by status)
CREATE INDEX IF NOT EXISTS entries_class_checkin_idx
  ON entries(class_id, check_in_status);

-- Enable realtime on entries table (if not already)
ALTER PUBLICATION supabase_realtime ADD TABLE entries;

-- RLS: exhibitors can update check_in_status on own entries (restricted values)
-- Staff can update any entry's check_in_status within their show
-- (Specific policies TBD in implementation plan)
```

## Canonical Status Config

`@myk9/core` already has the full config (`CHECKIN_STATUS` record with `CheckInStatusConfig` objects containing `value`, `label`, `icon`, `colorVar`, `textColorVar`, `description`). This is the single source of truth.

**Current state of `entryStatusConfig.ts` in ClassResultsTable:**
This file duplicates colors/icons using hardcoded Tailwind classes instead of CSS variables. It will be deleted and replaced with a shared UI component that reads from `@myk9/core`.

### Shared `CheckInStatusBadge` Component

New component in `apps/myk9show/src/components/common/`:

```tsx
// Reads config from @myk9/core's CHECKIN_STATUS
// Renders: colored icon + label badge
// Props: status: CheckInStatus, size?: 'sm' | 'md', onClick?: () => void
```

This replaces all inline status badge rendering across:

- `EntryCard` (card view on class details page)
- `ClassResultsTable` table view (new clickable status cell)
- `TrialEntriesTable` (trial detail page)
- `MyEntriesTab` (show detail page, exhibitor view)
- Any future entry list

CSS variables (`--checkin-*`) are already defined in `design-tokens.css`. The badge component uses `var(--checkin-*)` so colors are theme-aware and defined in one place.

## StatusPickerDialog

Modal dialog triggered by tapping any `CheckInStatusBadge`.

**Layout** (matches myK9Q screenshot):

- **Header:** Armband badge + dog name + handler name + close button
- **Body:** 2-column grid of status option cards
- Each card: colored circle with Lucide icon, label, description text
- Current status highlighted (ring/border treatment)
- Role-filtered: exhibitors see 5 cards, staff see 8

**Interaction:**

1. User taps status badge on any entry card/table row
2. Dialog opens with current status highlighted
3. User taps a status option
4. Dialog closes immediately
5. Badge updates optimistically (local store)
6. Mutation queued for Supabase sync via replication layer

**Props:**

```tsx
interface StatusPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: { entryId: string; armband: string; dogName: string; handlerName: string };
  currentStatus: CheckInStatus;
  onStatusChange: (entryId: string, newStatus: CheckInStatus) => void;
  userRole: 'exhibitor' | 'staff'; // determines which statuses are shown
}
```

## Real-Time Subscription

**Hook:** `useCheckInStatusSubscription(classId: string)`

Subscribes to Supabase Postgres Change Events on the `entries` table, filtered by `class_id`. On UPDATE events where `check_in_status` changed, invalidates the relevant React Query cache keys so all viewers see the update.

```tsx
// Subscribe pattern (matches announcementStore)
const channel = supabase.channel(`checkin:${classId}`);
channel.on(
  'postgres_changes',
  {
    event: 'UPDATE',
    schema: 'public',
    table: 'entries',
    filter: `class_id=eq.${classId}`,
  },
  payload => {
    // Invalidate React Query cache for this class's entries
    queryClient.invalidateQueries({ queryKey: ['classes', classId, 'entries'] });
  }
);
```

Mounted in `ClassDetailsMain` (class detail page) and any other page displaying class entries with status.

## Automatic Status Transitions

Two transitions happen without user interaction:

### Scoresheet Open -> In Ring

When `ScoresheetPage` or `SecretaryScoringPage` loads an entry for scoring:

- If `check_in_status` is not `completed`, set it to `in-ring`
- Also set `ring_entry_time = now()` (column already exists)
- Goes through replication layer for offline support

### Score Submitted -> Completed

When a score is successfully recorded (in the existing `onResultUpdate` / submit flow):

- Set `check_in_status = 'completed'`
- Also set `ring_exit_time = now()` (column already exists)
- Goes through replication layer

These automatic transitions fire normal updates through the replication layer, so real-time propagation works automatically.

## Status Update Flow

```
User taps badge
  -> StatusPickerDialog opens
  -> User picks status
  -> Dialog closes
  -> Call entryStore.updateCheckInStatus(entryId, newStatus)
    -> Optimistic local Zustand update
    -> replicatedEntriesTable.updateEntry({ check_in_status: newStatus })
      -> IndexedDB updated immediately
      -> MutationManager queues UPDATE for Supabase
      -> Supabase receives UPDATE
      -> Postgres Change Event fires
      -> All other clients' subscriptions receive the change
      -> React Query cache invalidated
      -> UI re-renders with new status
```

## Files Changed (Summary)

### New Files

- `apps/myk9show/src/components/common/CheckInStatusBadge.tsx` — shared badge component
- `apps/myk9show/src/components/common/StatusPickerDialog.tsx` — status picker modal
- `apps/myk9show/src/hooks/useCheckInStatusSubscription.ts` — real-time hook
- `supabase/migrations/092_add_check_in_status.sql` — DB migration

### Modified Files

- `apps/myk9show/src/store/entryStore.ts` — add `updateCheckInStatus` method
- `apps/myk9show/src/store/entry-store-types.ts` — add `checkInStatus` to `ShowEntry`
- `apps/myk9show/src/components/classes/ClassResultsTable/EntryCard.tsx` — use shared badge, add onClick
- `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx` — add status column to table, wire badge onClick
- `apps/myk9show/src/components/trials/TrialDetail/TrialEntriesTable.tsx` — add status badge column
- `apps/myk9show/src/components/shows/tabs/MyEntriesTab.tsx` — add status badge column
- `apps/myk9show/src/pages/scoring/ScoresheetPage.tsx` — auto-set in-ring on load
- `apps/myk9show/src/pages/scoring/SecretaryScoringPage.tsx` — auto-set in-ring on load
- `apps/myk9show/src/pages/ClassDetailsPage/ClassDetailsMain.tsx` — mount real-time subscription

### Deleted Files

- `apps/myk9show/src/components/classes/ClassResultsTable/entryStatusConfig.ts` — replaced by `@myk9/core` config + shared badge

## Testing

- **CheckInStatusBadge:** Renders correct icon/color/label for each status
- **StatusPickerDialog:** Role filtering (exhibitor sees 5, staff sees 8), current status highlighted, fires onStatusChange on pick
- **useCheckInStatusSubscription:** Subscribes/unsubscribes on mount/unmount, invalidates correct query keys
- **Automatic transitions:** ScoresheetPage sets in-ring on load, score submit sets completed
- **Entry store:** `updateCheckInStatus` updates local state and queues mutation
- **Integration:** Status change on one client propagates to another (manual verification)

## Out of Scope

- **Check-in status report** (secretary aggregate view) — separate todo item
- **Push notifications** for status changes — part of "Dog notification pipeline" todo
- **Status history UI** — `entry_status_history` table exists but viewing history is future work
