# Check-In Status System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time check-in status tracking to all entry views, with a status picker dialog, role-based restrictions, automatic in-ring/completed transitions, and offline-first replication.

**Architecture:** New `check_in_status` column on the `entries` table (separate from existing lifecycle `entry_status`). Shared `CheckInStatusBadge` component consumes canonical config from `@myk9/core`. `StatusPickerDialog` provides the picker UI. Real-time updates via Supabase Postgres Change Events per class. All mutations go through the existing replication layer for offline support.

**Tech Stack:** Supabase (Postgres, Realtime), Zustand, React Query, shadcn Dialog, Lucide icons, Vitest

**Spec:** `docs/superpowers/specs/2026-03-27-check-in-status-system-design.md`

---

## File Structure

### New Files

| File                                                              | Responsibility                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------------- |
| `supabase/migrations/092_add_check_in_status.sql`                 | DB column, index, RLS policies                             |
| `apps/myk9show/src/components/common/CheckInStatusBadge.tsx`      | Shared badge rendering from `@myk9/core` config            |
| `apps/myk9show/src/components/common/CheckInStatusBadge.test.tsx` | Badge unit tests                                           |
| `apps/myk9show/src/components/common/StatusPickerDialog.tsx`      | Modal dialog for picking status                            |
| `apps/myk9show/src/components/common/StatusPickerDialog.test.tsx` | Dialog unit tests                                          |
| `apps/myk9show/src/hooks/useCheckInStatusSubscription.ts`         | Real-time Supabase subscription hook                       |
| `apps/myk9show/src/hooks/useCheckInStatusSubscription.test.ts`    | Subscription hook tests                                    |
| `apps/myk9show/src/components/common/checkin-icon-map.ts`         | [ADDED] Shared Lucide icon map for check-in statuses (DRY) |

### Modified Files

| File                                                                       | Change                                                                            |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts`         | Add `check_in_status` to `ReplicatedEntry`, `toSupabaseRow`, `fromSupabaseRow`    |
| `apps/myk9show/src/store/entry-store-types.ts`                             | Add `checkInStatus` field to `ShowEntry`                                          |
| `apps/myk9show/src/store/entryStore.ts`                                    | Add `updateCheckInStatus` method                                                  |
| `apps/myk9show/src/components/classes/ClassResultsTable/EntryCard.tsx`     | Replace inline badge with `CheckInStatusBadge`, add onClick for picker            |
| `apps/myk9show/src/components/classes/ClassResultsTable/EntryCardGrid.tsx` | [ADDED] Forward `onStatusClick`, map `checkInStatus` from entry data              |
| `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx`         | Add check-in status column to table, wire badge onClick, mount StatusPickerDialog |
| `apps/myk9show/src/components/trials/TrialDetail/TrialEntriesTable.tsx`    | Add check-in status badge column                                                  |
| `apps/myk9show/src/components/shows/tabs/MyEntriesTab.tsx`                 | Add check-in status badge column                                                  |
| `apps/myk9show/src/pages/ClassDetailsPage/ClassDetailsMain.tsx`            | Mount `useCheckInStatusSubscription`                                              |
| `apps/myk9show/src/pages/scoring/ScoresheetPage.tsx`                       | Auto-set `in-ring` on entry load                                                  |
| `apps/myk9show/src/pages/scoring/SecretaryScoringPage.tsx`                 | Auto-set `in-ring` on entry load                                                  |

### Deleted Files

| File                                                                          | Reason                                                   |
| ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| `apps/myk9show/src/components/classes/ClassResultsTable/entryStatusConfig.ts` | Replaced by `@myk9/core` config + shared badge component |

---

## Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/092_add_check_in_status.sql`

- [ ] **Step 1: Write migration file**

```sql
-- Migration: Add check_in_status column for show-day entry tracking
-- Separate from entry_status (registration lifecycle) — these are independent axes.

-- Add check-in status column
ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS check_in_status TEXT DEFAULT 'no-status';

-- Add CHECK constraint separately (allows IF NOT EXISTS on column)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entries_check_in_status_check'
  ) THEN
    ALTER TABLE entries
      ADD CONSTRAINT entries_check_in_status_check
      CHECK (check_in_status IN (
        'no-status', 'checked-in', 'conflict', 'pulled',
        'at-gate', 'come-to-gate', 'in-ring', 'completed'
      ));
  END IF;
END $$;

-- Index for filtered queries (class entries by check-in status)
CREATE INDEX IF NOT EXISTS entries_class_checkin_idx
  ON entries(class_id, check_in_status);

-- Enable realtime for entries table (idempotent — no-ops if already enabled)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE entries;
  END IF;
END $$;

-- RLS: Staff (secretary, judge, steward, site_admin) can update check_in_status on any
-- entry in shows they have a role for. Exhibitors can only update their own entries.
-- [ADDED] Tighter RLS than original plan — exhibitors restricted to own entries server-side.
CREATE POLICY "entries_checkin_update_staff" ON entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND r.name IN ('site_admin', 'secretary', 'judge', 'steward')
    )
  )
  WITH CHECK (true);

CREATE POLICY "entries_checkin_update_own" ON entries
  FOR UPDATE TO authenticated
  USING (
    handler_id = (SELECT id FROM people WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    handler_id = (SELECT id FROM people WHERE auth_user_id = auth.uid())
  );
```

- [ ] **Step 2: Apply migration locally**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && supabase db push`
Expected: Migration applied successfully, no errors.

- [ ] **Step 3: Verify column exists**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && supabase db reset --dry-run 2>&1 | head -5` or check via Supabase dashboard that `entries.check_in_status` column exists with default `'no-status'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/092_add_check_in_status.sql
git commit -m "feat(db): add check_in_status column to entries table (migration 092)"
```

---

## Task 2: Replication Layer — Add `check_in_status` to ReplicatedEntry

**Files:**

- Modify: `apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts`

- [ ] **Step 1: Add `check_in_status` to `ReplicatedEntry` interface**

In the `ReplicatedEntry` interface (around line 25), add the field alongside the other status fields:

```typescript
// Check-in status (show-day flow, separate from entry_status lifecycle)
checkInStatus: CheckInStatus;
check_in_status: CheckInStatus; // snake_case alias for Supabase compatibility
```

Add the import at the top of the file:

```typescript
import type { CheckInStatus } from '@myk9/core';
```

- [ ] **Step 2: Update `toSupabaseRow` mapping**

In the `toSupabaseRow` method (around line 181), add:

```typescript
  check_in_status: entry.checkInStatus ?? entry.check_in_status ?? 'no-status',
```

- [ ] **Step 3: Update `fromSupabaseRow` mapping**

Find where Supabase rows are converted to `ReplicatedEntry` (the reverse mapping). Add:

```typescript
  checkInStatus: (row.check_in_status as CheckInStatus) ?? 'no-status',
  check_in_status: (row.check_in_status as CheckInStatus) ?? 'no-status',
```

- [ ] **Step 4: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: No new errors (existing consumers don't reference `checkInStatus` yet).

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts
git commit -m "feat(replication): add check_in_status to ReplicatedEntry interface and mappings"
```

---

## Task 3: Entry Store — Add `updateCheckInStatus` Method

**Files:**

- Modify: `apps/myk9show/src/store/entry-store-types.ts`
- Modify: `apps/myk9show/src/store/entryStore.ts`

- [ ] **Step 1: Add `checkInStatus` to `ShowEntry` and store interface**

In `entry-store-types.ts`, add to `ShowEntry` interface (around line 65):

```typescript
  // Show-day check-in status (separate from lifecycle status)
  checkInStatus?: CheckInStatus | undefined;
```

Add import at top:

```typescript
import type { CheckInStatus } from '@myk9/core';
```

Add `updateCheckInStatus` to `EntryStoreState` interface (near `updateStatus`, around line 125):

```typescript
updateCheckInStatus: (entryId: string, checkInStatus: CheckInStatus, userId: string) =>
  Promise<SyncableShowEntry | null>;
```

- [ ] **Step 2: Implement `updateCheckInStatus` in entryStore.ts**

In `entryStore.ts`, add the method implementation. Follow the same pattern as `updateStatus` (around line 207):

```typescript
    updateCheckInStatus: async (entryId, checkInStatus, userId) => {
      const entry = get().entries.find(e => e.id === entryId);
      if (!entry) return null;

      const updated: SyncableShowEntry = {
        ...entry,
        checkInStatus,
        updatedAt: new Date().toISOString(),
        _version: entry._version + 1,
        _lastModified: new Date(),
        _lastModifiedBy: userId,
        _syncStatus: 'pending',
      };

      // Queue mutation through replication layer
      await replicatedEntriesTable.updateEntry(entryId, {
        checkInStatus,
        check_in_status: checkInStatus,
      });

      // Update local state
      set(state => ({
        entries: state.entries.map(e => (e.id === entryId ? updated : e)),
      }));

      return updated;
    },
```

- [ ] **Step 3: Write unit test for updateCheckInStatus [ADDED]**

Add to the entry store test file (or create if needed):

```typescript
// In entryStore.test.ts or a new file
describe('updateCheckInStatus', () => {
  it('updates checkInStatus and increments version', async () => {
    const store = useEntryStore.getState();
    // Seed an entry first
    const entry = await store.createEntry(
      {
        showId: 'show-1',
        classId: 'class-1',
        dogId: 'dog-1',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Test',
          entryFee: 25,
          paymentStatus: 'paid',
        },
      },
      'user-1'
    );

    const updated = await store.updateCheckInStatus(entry.id, 'checked-in', 'user-1');

    expect(updated?.checkInStatus).toBe('checked-in');
    expect(updated?._version).toBe(entry._version + 1);
    expect(updated?._syncStatus).toBe('pending');
  });

  it('returns null for non-existent entry', async () => {
    const result = await useEntryStore
      .getState()
      .updateCheckInStatus('nonexistent', 'checked-in', 'user-1');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 4: Run typecheck and tests**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck && cd apps/myk9show && npx vitest run src/store/entryStore`
Expected: Pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/store/entry-store-types.ts apps/myk9show/src/store/entryStore.ts apps/myk9show/src/store/entryStore.test.ts
git commit -m "feat(store): add updateCheckInStatus method to entry store with tests"
```

---

## Task 4: CheckInStatusBadge Component

**Files:**

- Create: `apps/myk9show/src/components/common/CheckInStatusBadge.tsx`
- Create: `apps/myk9show/src/components/common/CheckInStatusBadge.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// CheckInStatusBadge.test.tsx
import { render, screen } from '@/test/utils/testUtils';
import { CheckInStatusBadge } from './CheckInStatusBadge';

describe('CheckInStatusBadge', () => {
  it('renders the correct label for each status', () => {
    const { rerender } = render(<CheckInStatusBadge status="checked-in" />);
    expect(screen.getByText('Checked-in')).toBeInTheDocument();

    rerender(<CheckInStatusBadge status="in-ring" />);
    expect(screen.getByText('In Ring')).toBeInTheDocument();

    rerender(<CheckInStatusBadge status="no-status" />);
    expect(screen.getByText('No Status')).toBeInTheDocument();
  });

  it('renders with correct color CSS variable as inline style', () => {
    render(<CheckInStatusBadge status="checked-in" />);
    const badge = screen.getByText('Checked-in').closest('span');
    expect(badge).toHaveStyle({ backgroundColor: 'var(--checkin-checked-in)' });
  });

  it('calls onClick when provided and clicked', async () => {
    const onClick = vi.fn();
    const { user } = render(<CheckInStatusBadge status="checked-in" onClick={onClick} />);
    await user.click(screen.getByText('Checked-in'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not render as a button when onClick is not provided', () => {
    render(<CheckInStatusBadge status="checked-in" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders as a button when onClick is provided', () => {
    render(<CheckInStatusBadge status="checked-in" onClick={() => {}} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders small size correctly', () => {
    render(<CheckInStatusBadge status="pulled" size="sm" />);
    const badge = screen.getByText('Pulled').closest('span');
    expect(badge?.className).toContain('text-[10px]');
  });

  it('renders all 8 statuses without error', () => {
    const statuses = [
      'no-status', 'checked-in', 'conflict', 'pulled',
      'at-gate', 'come-to-gate', 'in-ring', 'completed',
    ] as const;
    for (const status of statuses) {
      const { unmount } = render(<CheckInStatusBadge status={status} />);
      unmount();
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && npx vitest run src/components/common/CheckInStatusBadge.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create shared ICON_MAP [ADDED]**

Create `apps/myk9show/src/components/common/checkin-icon-map.ts`:

```typescript
// checkin-icon-map.ts — Single source of truth for check-in status icons.
// [ADDED] Extracted to avoid duplicating the map in Badge and Dialog.
import {
  Check,
  Circle,
  AlertTriangle,
  XCircle,
  Star,
  Bell,
  Target,
  CheckCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Maps @myk9/core icon name strings to Lucide components. */
export const CHECKIN_ICON_MAP: Record<string, LucideIcon> = {
  Circle,
  Check,
  AlertTriangle,
  XCircle,
  Star,
  Bell,
  Target,
  CheckCircle,
};
```

- [ ] **Step 4: Implement CheckInStatusBadge**

```typescript
// CheckInStatusBadge.tsx
import { cn } from '@/lib/utils';
import type { CheckInStatus } from '@myk9/core';
import { getCheckinStatusConfig } from '@myk9/core';
import { CHECKIN_ICON_MAP } from './checkin-icon-map';

interface CheckInStatusBadgeProps {
  status: CheckInStatus;
  size?: 'sm' | 'md';
  onClick?: () => void;
  className?: string;
}

export function CheckInStatusBadge({
  status,
  size = 'md',
  onClick,
  className,
}: CheckInStatusBadgeProps) {
  const config = getCheckinStatusConfig(status);
  if (!config) return null;

  const Icon = CHECKIN_ICON_MAP[config.icon];
  const sizeClasses = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5';
  const iconSize = size === 'sm' ? 10 : 12;

  const badgeContent = (
    <>
      {Icon && <Icon size={iconSize} className="shrink-0" />}
      {config.label}
    </>
  );

  const badgeStyle = {
    backgroundColor: `var(${config.colorVar})`,
    color: `var(${config.textColorVar})`,
  };

  const sharedClasses = cn(
    'inline-flex items-center gap-1 font-semibold rounded-md whitespace-nowrap',
    sizeClasses,
    className
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onClick();
        }}
        className={cn(sharedClasses, 'cursor-pointer hover:opacity-80 transition-opacity')}
        style={badgeStyle}
      >
        {badgeContent}
      </button>
    );
  }

  return (
    <span className={sharedClasses} style={badgeStyle}>
      {badgeContent}
    </span>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && npx vitest run src/components/common/CheckInStatusBadge.test.tsx`
Expected: All 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/common/checkin-icon-map.ts apps/myk9show/src/components/common/CheckInStatusBadge.tsx apps/myk9show/src/components/common/CheckInStatusBadge.test.tsx
git commit -m "feat: add CheckInStatusBadge shared component with icon map and tests"
```

---

## Task 5: StatusPickerDialog Component

**Files:**

- Create: `apps/myk9show/src/components/common/StatusPickerDialog.tsx`
- Create: `apps/myk9show/src/components/common/StatusPickerDialog.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// StatusPickerDialog.test.tsx
import { render, screen, within } from '@/test/utils/testUtils';
import { StatusPickerDialog } from './StatusPickerDialog';
import type { CheckInStatus } from '@myk9/core';

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  entry: {
    entryId: 'entry-1',
    armband: '187',
    dogName: 'Arlo',
    handlerName: 'Anna Lenhart Murray',
  },
  currentStatus: 'no-status' as CheckInStatus,
  onStatusChange: vi.fn(),
  isStaff: false,
};

describe('StatusPickerDialog', () => {
  it('renders entry header with armband, dog name, and handler', () => {
    render(<StatusPickerDialog {...defaultProps} />);
    expect(screen.getByText('187')).toBeInTheDocument();
    expect(screen.getByText('Arlo')).toBeInTheDocument();
    expect(screen.getByText('Anna Lenhart Murray')).toBeInTheDocument();
  });

  it('shows 5 status options for exhibitors', () => {
    render(<StatusPickerDialog {...defaultProps} isStaff={false} />);
    expect(screen.getByText('No Status')).toBeInTheDocument();
    expect(screen.getByText('Checked-in')).toBeInTheDocument();
    expect(screen.getByText('Conflict')).toBeInTheDocument();
    expect(screen.getByText('Pulled')).toBeInTheDocument();
    expect(screen.getByText('At Gate')).toBeInTheDocument();
    // Staff-only statuses should not appear
    expect(screen.queryByText('Come to Gate')).not.toBeInTheDocument();
    expect(screen.queryByText('In Ring')).not.toBeInTheDocument();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  it('shows all 8 status options for staff', () => {
    render(<StatusPickerDialog {...defaultProps} isStaff={true} />);
    expect(screen.getByText('No Status')).toBeInTheDocument();
    expect(screen.getByText('Checked-in')).toBeInTheDocument();
    expect(screen.getByText('Conflict')).toBeInTheDocument();
    expect(screen.getByText('Pulled')).toBeInTheDocument();
    expect(screen.getByText('At Gate')).toBeInTheDocument();
    expect(screen.getByText('Come to Gate')).toBeInTheDocument();
    expect(screen.getByText('In Ring')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('highlights the current status', () => {
    render(<StatusPickerDialog {...defaultProps} currentStatus="checked-in" />);
    const checkedInCard = screen.getByText('Checked-in').closest('button');
    expect(checkedInCard?.className).toContain('ring-2');
  });

  it('calls onStatusChange and closes when a status is picked', async () => {
    const onStatusChange = vi.fn();
    const onOpenChange = vi.fn();
    const { user } = render(
      <StatusPickerDialog
        {...defaultProps}
        onStatusChange={onStatusChange}
        onOpenChange={onOpenChange}
      />
    );
    await user.click(screen.getByText('Checked-in'));
    expect(onStatusChange).toHaveBeenCalledWith('entry-1', 'checked-in');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows description text for each status', () => {
    render(<StatusPickerDialog {...defaultProps} isStaff={true} />);
    expect(screen.getByText('Dog has not checked in yet')).toBeInTheDocument();
    expect(screen.getByText('Dog is ready to compete')).toBeInTheDocument();
    expect(screen.getByText('Dog entered in multiple classes')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(<StatusPickerDialog {...defaultProps} open={false} />);
    expect(screen.queryByText('Arlo')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && npx vitest run src/components/common/StatusPickerDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement StatusPickerDialog**

```typescript
// StatusPickerDialog.tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { cn } from '@/lib/utils';
import type { CheckInStatus } from '@myk9/core';
import {
  CHECKIN_STATUS,
  EXHIBITOR_ALLOWED_STATUSES,
  CHECKIN_STATUSES,
} from '@myk9/core';
import { CHECKIN_ICON_MAP } from './checkin-icon-map'; // [ADDED] DRY — shared with CheckInStatusBadge

interface StatusPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: {
    entryId: string;
    armband: string;
    dogName: string;
    handlerName: string;
  };
  currentStatus: CheckInStatus;
  onStatusChange: (entryId: string, newStatus: CheckInStatus) => void;
  isStaff: boolean;
}

export function StatusPickerDialog({
  open,
  onOpenChange,
  entry,
  currentStatus,
  onStatusChange,
  isStaff,
}: StatusPickerDialogProps) {
  const visibleStatuses = isStaff
    ? CHECKIN_STATUSES
    : EXHIBITOR_ALLOWED_STATUSES;

  const statusConfigs = Object.values(CHECKIN_STATUS).filter(config =>
    visibleStatuses.includes(config.value)
  );

  function handlePick(status: CheckInStatus) {
    onStatusChange(entry.entryId, status);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <ArmbandBadge armband={entry.armband} className="size-11 rounded-lg text-base" />
            <div className="min-w-0">
              <DialogTitle className="text-base truncate">{entry.dogName}</DialogTitle>
              <DialogDescription className="text-sm truncate">
                {entry.handlerName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 pt-2">
          {statusConfigs.map(config => {
            const Icon = CHECKIN_ICON_MAP[config.icon];
            const isActive = config.value === currentStatus;

            return (
              <button
                key={config.value}
                type="button"
                onClick={() => handlePick(config.value)}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                  'hover:bg-accent/50',
                  isActive
                    ? 'ring-2 ring-primary border-primary bg-accent/30'
                    : 'border-border'
                )}
              >
                <div
                  className="shrink-0 size-9 rounded-full flex items-center justify-center mt-0.5"
                  style={{
                    backgroundColor: `var(${config.colorVar})`,
                    color: `var(${config.textColorVar})`,
                  }}
                >
                  {Icon && <Icon size={18} />}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{config.label}</div>
                  <div className="text-xs text-muted-foreground leading-tight">
                    {config.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && npx vitest run src/components/common/StatusPickerDialog.test.tsx`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/common/StatusPickerDialog.tsx apps/myk9show/src/components/common/StatusPickerDialog.test.tsx
git commit -m "feat: add StatusPickerDialog component with role-based filtering and tests"
```

---

## Task 6: Real-Time Subscription Hook

**Files:**

- Create: `apps/myk9show/src/hooks/useCheckInStatusSubscription.ts`
- Create: `apps/myk9show/src/hooks/useCheckInStatusSubscription.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// useCheckInStatusSubscription.test.ts
import { renderHook } from '@testing-library/react';
import { useCheckInStatusSubscription } from './useCheckInStatusSubscription';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(),
}));

describe('useCheckInStatusSubscription', () => {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockResolvedValue('SUBSCRIBED'),
  };
  const mockRemoveChannel = vi.fn();
  const mockInvalidateQueries = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.channel as ReturnType<typeof vi.fn>).mockReturnValue(mockChannel);
    (supabase as unknown as { removeChannel: ReturnType<typeof vi.fn> }).removeChannel =
      mockRemoveChannel;
    (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValue({
      invalidateQueries: mockInvalidateQueries,
    });
  });

  it('subscribes to the correct channel on mount', () => {
    renderHook(() => useCheckInStatusSubscription('class-123'));
    expect(supabase.channel).toHaveBeenCalledWith('checkin:class-123');
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'UPDATE',
        schema: 'public',
        table: 'entries',
        filter: 'class_id=eq.class-123',
      }),
      expect.any(Function)
    );
    expect(mockChannel.subscribe).toHaveBeenCalled();
  });

  it('does not subscribe when classId is undefined', () => {
    renderHook(() => useCheckInStatusSubscription(undefined));
    expect(supabase.channel).not.toHaveBeenCalled();
  });

  it('cleans up channel on unmount', () => {
    const { unmount } = renderHook(() => useCheckInStatusSubscription('class-123'));
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
  });

  it('invalidates queries when a change event fires', () => {
    renderHook(() => useCheckInStatusSubscription('class-123'));
    // Get the callback passed to .on()
    const onCallback = mockChannel.on.mock.calls[0][2];
    // Simulate a Postgres change event
    onCallback({ new: { id: 'entry-1', check_in_status: 'checked-in' } });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['classes', 'class-123', 'entries'],
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && npx vitest run src/hooks/useCheckInStatusSubscription.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```typescript
// useCheckInStatusSubscription.ts
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Subscribes to real-time check-in status changes for entries in a class.
 * Invalidates React Query cache on change so all viewers see updates instantly.
 */
export function useCheckInStatusSubscription(classId: string | undefined) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!classId) return;

    const channel = supabase.channel(`checkin:${classId}`);

    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'entries',
          filter: `class_id=eq.${classId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ['classes', classId, 'entries'],
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [classId, queryClient]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && npx vitest run src/hooks/useCheckInStatusSubscription.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/useCheckInStatusSubscription.ts apps/myk9show/src/hooks/useCheckInStatusSubscription.test.ts
git commit -m "feat: add useCheckInStatusSubscription real-time hook with tests"
```

---

## Task 7: Wire Badge + Dialog into EntryCard (Card View)

**Files:**

- Modify: `apps/myk9show/src/components/classes/ClassResultsTable/EntryCard.tsx`
- Delete: `apps/myk9show/src/components/classes/ClassResultsTable/entryStatusConfig.ts`

- [ ] **Step 1: Update EntryCard to use CheckInStatusBadge and accept onStatusClick**

Replace the inline badge rendering in `EntryCard.tsx` with the shared component. Add `onStatusClick` prop:

Replace the entire file content. Key changes:

- Remove import of `ENTRY_STATUS_CONFIG` from `./entryStatusConfig`
- Add import of `CheckInStatusBadge` from `@/components/common/CheckInStatusBadge`
- Add `onStatusClick?: (entry: EntryCardEntry) => void` to `EntryCardProps`
- Replace the inline `<span>` badge (lines 42-50) with `<CheckInStatusBadge>`

```typescript
// Updated EntryCard.tsx
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { CheckInStatusBadge } from '@/components/common/CheckInStatusBadge';
import type { CheckInStatus } from '@myk9/core';

export interface EntryCardEntry {
  entryId: string;
  armband: string;
  dogName: string;
  dogBreed: string;
  handlerName: string;
  status: CheckInStatus;
}

interface EntryCardProps {
  entry: EntryCardEntry;
  scoringRoute: string;
  onStatusClick?: (entry: EntryCardEntry) => void;
}

export function EntryCard({ entry, scoringRoute, onStatusClick }: EntryCardProps) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(scoringRoute)}
      className={cn(
        'w-full text-left bg-card rounded-xl border border-border p-4',
        'flex items-start gap-3.5 cursor-pointer',
        'transition-colors hover:border-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <ArmbandBadge armband={entry.armband} className="size-12 rounded-[10px] text-lg" />
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2">
          <span className="font-semibold text-[15px] text-foreground truncate">
            {entry.dogName}
          </span>
          <CheckInStatusBadge
            status={entry.status}
            size="sm"
            onClick={onStatusClick ? () => onStatusClick(entry) : undefined}
          />
        </div>
        <div className="text-[13px] text-muted-foreground truncate">{entry.dogBreed}</div>
        <div className="text-xs text-muted-foreground/70 truncate">
          Handler: {entry.handlerName}
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Delete the old entryStatusConfig.ts**

Delete: `apps/myk9show/src/components/classes/ClassResultsTable/entryStatusConfig.ts`

- [ ] **Step 3: Update any other imports of `entryStatusConfig`**

Search for imports of `entryStatusConfig` and `ENTRY_STATUS_CONFIG` — update them to use `CheckInStatusBadge` or `@myk9/core` directly. Check `EntryCardGrid.tsx` if it imports from the deleted file.

- [ ] **Step 4: Run typecheck and tests**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck && cd apps/myk9show && npx vitest run src/components/classes/ClassResultsTable/`
Expected: Pass.

- [ ] **Step 5: Commit**

```bash
git add -u apps/myk9show/src/components/classes/ClassResultsTable/
git add apps/myk9show/src/components/classes/ClassResultsTable/EntryCard.tsx
git commit -m "refactor: replace entryStatusConfig with shared CheckInStatusBadge in EntryCard"
```

---

## Task 8: Wire Badge + Dialog into ClassResultsTable (Table + Card View)

**Files:**

- Modify: `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx`

- [ ] **Step 1: Add check-in status column and StatusPickerDialog state**

Add imports at top of file:

```typescript
import { CheckInStatusBadge } from '@/components/common/CheckInStatusBadge';
import { StatusPickerDialog } from '@/components/common/StatusPickerDialog';
import { useAuthContext } from '@/context/AuthContext';
import { useEntryStore } from '@/store/entryStore';
import type { CheckInStatus } from '@myk9/core';
```

Add dialog state inside the component function:

```typescript
const { isExhibitor, isSecretary, isJudge, user } = useAuthContext();
const updateCheckInStatus = useEntryStore(s => s.updateCheckInStatus);
const isStaff = isSecretary || isJudge || !isExhibitor;

const [statusPickerEntry, setStatusPickerEntry] = useState<{
  entryId: string;
  armband: string;
  dogName: string;
  handlerName: string;
  currentStatus: CheckInStatus;
} | null>(null);

function handleStatusChange(entryId: string, newStatus: CheckInStatus) {
  if (user?.id) {
    updateCheckInStatus(entryId, newStatus, user.id);
  }
}
```

- [ ] **Step 2: Add check-in status column to table columns**

Add a new column definition before the existing status/validation column (insert into the columns array):

```typescript
{
  id: 'checkInStatus',
  header: 'Status',
  cell: ({ row }) => {
    const entry = row.original;
    return (
      <CheckInStatusBadge
        status={(entry.checkInStatus as CheckInStatus) ?? 'no-status'}
        size="sm"
        onClick={() =>
          setStatusPickerEntry({
            entryId: entry.entryId,
            armband: entry.armband ?? '',
            dogName: entry.dogName ?? 'Unknown',
            handlerName: entry.handlerName ?? '',
            currentStatus: (entry.checkInStatus as CheckInStatus) ?? 'no-status',
          })
        }
      />
    );
  },
},
```

- [ ] **Step 3: Pass onStatusClick to EntryCardGrid**

In the card view rendering section, pass the status click handler through to EntryCard via EntryCardGrid. Find where `<EntryCardGrid>` is rendered and add the prop:

```typescript
<EntryCardGrid
  entries={filteredEntries}
  classId={classId!}
  onStatusClick={(entry) =>
    setStatusPickerEntry({
      entryId: entry.entryId,
      armband: entry.armband,
      dogName: entry.dogName,
      handlerName: entry.handlerName,
      currentStatus: entry.status,
    })
  }
/>
```

[EXPANDED] Update `EntryCardGrid.tsx` to accept and forward `onStatusClick`, and map `checkInStatus` from entry data. The current `toCardEntry` hardcodes `status: 'no-status'` — fix it to read from entry data:

```typescript
// Updated EntryCardGrid.tsx
import { useMemo } from 'react';
import type { ScentWorkEntry } from '@/types/scent-work-types';
import { EntryCard, type EntryCardEntry } from './EntryCard';
import type { CheckInStatus } from '@myk9/core';

interface EntryCardGridProps {
  entries: ScentWorkEntry[];
  classId: string;
  onStatusClick?: (entry: EntryCardEntry) => void;
}

function toCardEntry(entry: ScentWorkEntry): EntryCardEntry {
  return {
    entryId: entry.id,
    armband: entry.displayInfo.armband,
    dogName: entry.displayInfo.dogName,
    dogBreed: entry.displayInfo.dogBreed,
    handlerName: entry.displayInfo.handlerName,
    status: (entry.checkInStatus as CheckInStatus) ?? 'no-status',
  };
}

export function EntryCardGrid({ entries, classId, onStatusClick }: EntryCardGridProps) {
  const cardEntries = useMemo(() => entries.map(toCardEntry), [entries]);

  if (cardEntries.length === 0) {
    return <div className="py-12 text-center text-muted-foreground">No entries in this class.</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
      {cardEntries.map(entry => (
        <EntryCard
          key={entry.entryId}
          entry={entry}
          scoringRoute={`/scoring/classes/${classId}/entries/${entry.entryId}`}
          onStatusClick={onStatusClick}
        />
      ))}
    </div>
  );
}
```

Note: `entry.checkInStatus` must be added to `ScentWorkEntry` type or the entry data mapping upstream. Check that the data source includes `check_in_status` from the DB query.

- [ ] **Step 4: Add StatusPickerDialog at component bottom**

Just before the closing fragment/div of the component, add:

```typescript
<StatusPickerDialog
  open={statusPickerEntry !== null}
  onOpenChange={open => { if (!open) setStatusPickerEntry(null); }}
  entry={statusPickerEntry ?? { entryId: '', armband: '', dogName: '', handlerName: '' }}
  currentStatus={statusPickerEntry?.currentStatus ?? 'no-status'}
  onStatusChange={handleStatusChange}
  isStaff={isStaff}
/>
```

- [ ] **Step 5: Run typecheck and tests**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck && cd apps/myk9show && npx vitest run src/components/classes/ClassResultsTable/`
Expected: Pass. Fix any type issues (e.g., `checkInStatus` may need to be added to `BulkEntryData` or mapped from entry data).

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassResultsTable/
git commit -m "feat: wire check-in status badge and picker dialog into ClassResultsTable"
```

---

## Task 9: Add Status Badge to TrialEntriesTable

**Files:**

- Modify: `apps/myk9show/src/components/trials/TrialDetail/TrialEntriesTable.tsx`

- [ ] **Step 1: Add check-in status column**

Add import:

```typescript
import { CheckInStatusBadge } from '@/components/common/CheckInStatusBadge';
import type { CheckInStatus } from '@myk9/core';
```

Add a new column to the `COLUMNS` array (after the existing Status column or replacing it):

```typescript
{
  id: 'checkInStatus',
  header: 'Check-in',
  cell: ({ row }) => (
    <CheckInStatusBadge
      status={(row.original.checkInStatus as CheckInStatus) ?? 'no-status'}
      size="sm"
    />
  ),
},
```

Note: The TrialEntriesTable is read-only (no status picker dialog here — status changes happen at the class level). The badge is display-only.

- [ ] **Step 2: Map `check_in_status` in data transformation**

In the data transformation section (around lines 94-114 where raw entries are mapped to `DisplayEntry`), add:

```typescript
checkInStatus: entry.check_in_status ?? 'no-status',
```

And add `checkInStatus: string` to the `DisplayEntry` interface if it exists, or to the inline type.

- [ ] **Step 3: Run typecheck and tests**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck && cd apps/myk9show && npx vitest run src/components/trials/`
Expected: Pass.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/trials/TrialDetail/TrialEntriesTable.tsx
git commit -m "feat: add check-in status badge to TrialEntriesTable"
```

---

## Task 10: Add Status Badge to MyEntriesTab

**Files:**

- Modify: `apps/myk9show/src/components/shows/tabs/MyEntriesTab.tsx`

- [ ] **Step 1: Add check-in status column**

Add import:

```typescript
import { CheckInStatusBadge } from '@/components/common/CheckInStatusBadge';
import type { CheckInStatus } from '@myk9/core';
```

Replace or augment the existing "scored" status badge column (lines 33-48) with the check-in status:

```typescript
{
  id: 'checkInStatus',
  header: 'Status',
  cell: ({ row }) => (
    <CheckInStatusBadge
      status={(row.original.checkInStatus as CheckInStatus) ?? 'no-status'}
      size="sm"
    />
  ),
},
```

- [ ] **Step 2: Map `check_in_status` in the entry data**

Ensure the data source for MyEntriesTab includes `checkInStatus`. Update the `useMyEntries` hook output mapping or the inline transformation to include:

```typescript
checkInStatus: entry.check_in_status ?? 'no-status',
```

- [ ] **Step 3: Run typecheck and tests**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck && cd apps/myk9show && npx vitest run src/components/shows/tabs/MyEntriesTab`
Expected: Pass.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/shows/tabs/MyEntriesTab.tsx
git commit -m "feat: add check-in status badge to MyEntriesTab"
```

---

## Task 11: Mount Real-Time Subscription in ClassDetailsMain

**Files:**

- Modify: `apps/myk9show/src/pages/ClassDetailsPage/ClassDetailsMain.tsx`

- [ ] **Step 1: Add subscription hook call**

Add import:

```typescript
import { useCheckInStatusSubscription } from '@/hooks/useCheckInStatusSubscription';
```

Inside the component, after the existing hooks, add:

```typescript
useCheckInStatusSubscription(classId);
```

where `classId` is the class ID already available in the component (from URL params or props).

- [ ] **Step 2: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: Pass.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/pages/ClassDetailsPage/ClassDetailsMain.tsx
git commit -m "feat: mount real-time check-in status subscription on class details page"
```

---

## Task 12: Automatic Status Transitions — Scoresheet Pages

**Files:**

- Modify: `apps/myk9show/src/pages/scoring/ScoresheetPage.tsx`
- Modify: `apps/myk9show/src/pages/scoring/SecretaryScoringPage.tsx`

- [ ] **Step 1: Add auto-set in-ring on entry load in ScoresheetPage**

Add imports:

```typescript
import { useEntryStore } from '@/store/entryStore';
import { useAuthContext } from '@/context/AuthContext';
```

After the entry data is loaded (inside the useEffect that loads entry data, after the entry is resolved), add:

```typescript
// Auto-set check-in status to in-ring when scoresheet opens
// [EXPANDED] Also set ring_entry_time per spec
const updateCheckInStatus = useEntryStore.getState().updateCheckInStatus;
if (rawEntry && rawEntry.checkInStatus !== 'completed') {
  updateCheckInStatus(rawEntry.id, 'in-ring', user?.id ?? 'system');
  // Set ring entry timestamp via replication layer
  replicatedEntriesTable.updateEntry(rawEntry.id, {
    ring_entry_time: new Date().toISOString(),
  });
}
```

Note: Use `useEntryStore.getState()` instead of a hook selector because this runs inside a `useEffect`. Get `user` from `useAuthContext()`. Import `replicatedEntriesTable` from `@/services/replication`.

- [ ] **Step 2: Add auto-set completed on score submit in ScoresheetPage**

In the score submission success handler (the `onSuccess` callback around line 120), add:

```typescript
// Auto-set check-in status to completed after scoring
// [EXPANDED] Also set ring_exit_time per spec
const updateCheckInStatus = useEntryStore.getState().updateCheckInStatus;
updateCheckInStatus(entryId, 'completed', user?.id ?? 'system');
replicatedEntriesTable.updateEntry(entryId, {
  ring_exit_time: new Date().toISOString(),
});
```

- [ ] **Step 3: Apply same changes to SecretaryScoringPage**

Repeat the same two changes in `SecretaryScoringPage.tsx`:

1. Auto-set `in-ring` + `ring_entry_time` when entry loads for scoring
2. Auto-set `completed` + `ring_exit_time` after score submission succeeds

- [ ] **Step 4: Write tests for automatic transitions [ADDED]**

Add tests to verify the scoresheet pages trigger status updates:

```typescript
// In ScoresheetPage.test.tsx or a new test file
describe('automatic status transitions', () => {
  it('sets check-in status to in-ring when scoresheet loads', async () => {
    const updateCheckInStatus = vi.fn();
    vi.spyOn(useEntryStore, 'getState').mockReturnValue({
      ...useEntryStore.getState(),
      updateCheckInStatus,
    });

    render(<ScoresheetPage />, { initialRoute: '/scoring/classes/class-1/entries/entry-1' });

    // After entry data loads
    await waitFor(() => {
      expect(updateCheckInStatus).toHaveBeenCalledWith('entry-1', 'in-ring', expect.any(String));
    });
  });

  it('does not override completed status on scoresheet open', async () => {
    // Mock entry with completed status
    const updateCheckInStatus = vi.fn();
    vi.spyOn(useEntryStore, 'getState').mockReturnValue({
      ...useEntryStore.getState(),
      updateCheckInStatus,
    });
    // ... set up entry with checkInStatus: 'completed'

    render(<ScoresheetPage />, { initialRoute: '/scoring/classes/class-1/entries/entry-1' });

    await waitFor(() => {
      expect(updateCheckInStatus).not.toHaveBeenCalled();
    });
  });
});
```

Adapt mock setup to match the actual entry loading pattern in ScoresheetPage.

- [ ] **Step 5: Run typecheck and tests**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck && cd apps/myk9show && npx vitest run src/pages/scoring/`
Expected: Pass.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/pages/scoring/ScoresheetPage.tsx apps/myk9show/src/pages/scoring/SecretaryScoringPage.tsx apps/myk9show/src/pages/scoring/ScoresheetPage.test.tsx
git commit -m "feat: auto-set in-ring on scoresheet open, completed on score submit"
```

---

## Task 13: Final Integration Test + Cleanup

**Files:**

- All modified files

- [ ] **Step 1: Run full test suite**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && pnpm test`
Expected: All tests pass. Fix any failures from the changes above.

- [ ] **Step 2: Run typecheck and lint**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck && pnpm lint`
Expected: Clean.

- [ ] **Step 3: Verify no stale imports**

Search for any remaining references to the deleted `entryStatusConfig.ts`:

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && grep -r "entryStatusConfig" apps/myk9show/src/`
Expected: No results.

Search for any remaining `ENTRY_STATUS_CONFIG` usage:

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && grep -r "ENTRY_STATUS_CONFIG" apps/myk9show/src/`
Expected: No results.

- [ ] **Step 4: Manual smoke test**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm dev:show`

Verify in browser:

1. Navigate to a class details page — entry cards show status badges
2. Click a status badge — dialog opens with status options
3. Pick a status — badge updates immediately
4. Switch to table view — status column shows badges
5. Open a scoresheet — entry status changes to "In Ring"

- [ ] **Step 5: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore: check-in status system integration cleanup"
```

---

## Task 14: Update TO-DOS.md

**Files:**

- Modify: `TO-DOS.md`

- [ ] **Step 1: Mark the check-in status todo as done**

Update the check-in status item in TO-DOS.md to `[x]` with a completion summary:

```markdown
- [x] **Check-in status system** — Done: Added `check_in_status` column (migration 092), shared `CheckInStatusBadge` component (reads from `@myk9/core` canonical config), `StatusPickerDialog` (role-filtered: exhibitors 5 options, staff 8), real-time Supabase subscription per class, automatic in-ring/completed transitions from scoresheets. Status badges added to all entry views (ClassResultsTable cards+table, TrialEntriesTable, MyEntriesTab). Deleted duplicate `entryStatusConfig.ts`. Offline-first via replication layer.
```

- [ ] **Step 2: Commit**

```bash
git add TO-DOS.md
git commit -m "docs: mark check-in status system as complete in TO-DOS.md"
```
