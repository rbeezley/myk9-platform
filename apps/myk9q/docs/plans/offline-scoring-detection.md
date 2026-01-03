# Implementation Plan: Offline Scoring Detection

## Overview

Two complementary mechanisms to warn exhibitors when run order data may be unreliable:

1. **Manual "Offline Scoring" Status** - Ring steward explicitly marks class as being judged offline
2. **Automatic Stale Data Detection** - Detects when no results have synced for an active class

---

## Part 1: Add "Offline Scoring" Class Status

### 1.1 Database Migration

**File:** `supabase/migrations/20251206_add_offline_scoring_status.sql`

```sql
-- Add 'offline-scoring' to class_status enum/check constraint
-- Note: class_status is stored as TEXT, validated by application

-- Add last_result_at column for stale detection (Part 2)
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS last_result_at TIMESTAMPTZ;

-- Create trigger to update last_result_at when entry is scored
CREATE OR REPLACE FUNCTION update_class_last_result_at()
RETURNS TRIGGER AS $$
BEGIN
  -- When an entry is scored, update the class's last_result_at
  IF NEW.is_scored = TRUE AND (OLD.is_scored IS NULL OR OLD.is_scored = FALSE) THEN
    UPDATE classes
    SET last_result_at = NOW()
    WHERE id = NEW.class_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entries_update_class_last_result ON entries;
CREATE TRIGGER entries_update_class_last_result
  AFTER UPDATE OF is_scored ON entries
  FOR EACH ROW
  EXECUTE FUNCTION update_class_last_result_at();

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_classes_last_result_at ON classes(last_result_at);

-- Backfill last_result_at for existing classes with scored entries
UPDATE classes c
SET last_result_at = (
  SELECT MAX(e.updated_at)
  FROM entries e
  WHERE e.class_id = c.id AND e.is_scored = TRUE
)
WHERE EXISTS (
  SELECT 1 FROM entries e WHERE e.class_id = c.id AND e.is_scored = TRUE
);
```

### 1.2 Update Status Configuration

**File:** `src/constants/statusConfig.ts`

Add new status:

```typescript
OFFLINE_SCORING: {
  value: 'offline-scoring',
  label: 'Offline Scoring',
  colorVar: '--status-offline-scoring',
  textColorVar: '--status-offline-scoring-text',
  icon: 'WifiOff',
  description: 'Class is being judged offline - run order updates delayed'
}
```

### 1.3 Add CSS Variables

**File:** `src/index.css` (or theme file)

```css
:root {
  --status-offline-scoring: #f59e0b;      /* Amber/warning color */
  --status-offline-scoring-text: #ffffff;
}
```

### 1.4 Update ClassCard Component

**File:** `src/pages/ClassList/ClassCard.tsx`

1. Add `'offline-scoring'` to `ClassEntry['class_status']` type (line 16)
2. Add case to `getStatusIcon()` function:
   ```typescript
   case 'offline-scoring':
     return <WifiOff size={18} className="status-icon" />;
   ```
3. Add offline warning banner when status is 'offline-scoring':
   ```tsx
   {classEntry.class_status === 'offline-scoring' && (
     <div className="offline-scoring-warning">
       <WifiOff size={16} />
       <span>Run order updates delayed. Check with ring steward.</span>
     </div>
   )}
   ```

### 1.5 Update Status Dialog

**File:** `src/components/dialogs/ClassStatusDialog.tsx` (or wherever status options are rendered)

Add "Offline Scoring" as a selectable status option with appropriate icon and description.

### 1.6 Update useClassStatus Hook

**File:** `src/pages/ClassList/hooks/useClassStatus.ts`

Ensure `'offline-scoring'` is handled in `handleStatusChange()` - should work automatically since it maps status to database.

---

## Part 2: Automatic Stale Data Detection

### 2.1 Add Type Definitions

**File:** `src/pages/ClassList/ClassCard.tsx` (or shared types)

Extend ClassEntry interface:

```typescript
interface ClassEntry {
  // ... existing fields
  last_result_at?: string;  // ISO timestamp of last synced result
}
```

### 2.2 Create Stale Detection Utility

**File:** `src/utils/staleDataUtils.ts`

```typescript
const STALE_THRESHOLD_MINUTES = 10;

export interface StaleDataStatus {
  isStale: boolean;
  minutesSinceLastResult: number | null;
  shouldShowWarning: boolean;
}

export function getStaleDataStatus(
  classEntry: {
    class_status: string;
    last_result_at?: string;
    dogs: Array<{
      in_ring: boolean;
      is_scored: boolean;
      checkin_status: number;
    }>;
    completed_count: number;
    entry_count: number;
  }
): StaleDataStatus {
  // Don't show warning if class is manually marked offline (they already know)
  if (classEntry.class_status === 'offline-scoring') {
    return { isStale: false, minutesSinceLastResult: null, shouldShowWarning: false };
  }

  // Don't show warning if class is completed
  if (classEntry.class_status === 'completed') {
    return { isStale: false, minutesSinceLastResult: null, shouldShowWarning: false };
  }

  // Don't show warning if class hasn't started (no one in-ring or at-gate)
  const hasActiveEntry = classEntry.dogs.some(
    dog => dog.in_ring || dog.checkin_status === 2 // 2 = at-gate
  );
  if (!hasActiveEntry) {
    return { isStale: false, minutesSinceLastResult: null, shouldShowWarning: false };
  }

  // Don't show warning if no entries have been scored yet
  if (classEntry.completed_count === 0 && !classEntry.last_result_at) {
    return { isStale: false, minutesSinceLastResult: null, shouldShowWarning: false };
  }

  // Calculate time since last result
  if (!classEntry.last_result_at) {
    return { isStale: false, minutesSinceLastResult: null, shouldShowWarning: false };
  }

  const lastResultTime = new Date(classEntry.last_result_at);
  const now = new Date();
  const minutesSinceLastResult = Math.floor(
    (now.getTime() - lastResultTime.getTime()) / (1000 * 60)
  );

  const isStale = minutesSinceLastResult >= STALE_THRESHOLD_MINUTES;

  return {
    isStale,
    minutesSinceLastResult,
    shouldShowWarning: isStale
  };
}
```

### 2.3 Update ClassCard to Show Stale Warning

**File:** `src/pages/ClassList/ClassCard.tsx`

```tsx
import { getStaleDataStatus } from '../../utils/staleDataUtils';

// Inside component:
const staleStatus = useMemo(
  () => getStaleDataStatus(classEntry),
  [classEntry]
);

// In render, add warning banner:
{staleStatus.shouldShowWarning && (
  <div className="stale-data-warning">
    <AlertTriangle size={16} />
    <span>
      Run order may be outdated. Last update: {staleStatus.minutesSinceLastResult} min ago
    </span>
  </div>
)}
```

### 2.4 Add Warning Styles

**File:** `src/pages/ClassList/ClassCard.css`

```css
.offline-scoring-warning,
.stale-data-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--warning-bg, #fef3c7);
  border: 1px solid var(--warning-border, #f59e0b);
  border-radius: 6px;
  color: var(--warning-text, #92400e);
  font-size: 0.875rem;
  margin-top: 8px;
}

.offline-scoring-warning svg,
.stale-data-warning svg {
  flex-shrink: 0;
  color: var(--warning-icon, #d97706);
}
```

### 2.5 Update Data Fetching

**File:** `src/pages/ClassList/hooks/useClassListData.ts`

Add `last_result_at` to the SELECT query for classes.

---

## Part 3: Update Dog Details Page

The Dog Details page also shows "dogs ahead" count - needs same warnings.

**File:** `src/pages/DogDetails/DogDetailsPage.tsx` (or similar)

1. Check if class status is 'offline-scoring' → show warning
2. Check stale data status → show warning if stale

---

## Part 4: Suppress Notifications for Offline Classes

### 4.1 Update notify_up_soon() Trigger

**File:** `supabase/migrations/20251206_suppress_offline_notifications.sql`

Modify the trigger to skip notifications when class is in 'offline-scoring' status:

```sql
-- At the start of notify_up_soon() function, add:
-- Skip notifications if class is being scored offline
IF (SELECT class_status FROM classes WHERE id = NEW.class_id) = 'offline-scoring' THEN
  RETURN NEW;
END IF;
```

---

## Testing Checklist

### Manual Testing

- [ ] Ring steward can set class to "Offline Scoring" status
- [ ] Status badge shows correctly with WifiOff icon
- [ ] Warning banner appears on class card when offline
- [ ] Exhibitors cannot click status (non-admin view)
- [ ] Changing status from offline to in-progress clears warning

### Stale Detection Testing

- [ ] No warning for classes that haven't started
- [ ] No warning for completed classes
- [ ] Warning appears after 10 minutes of no activity
- [ ] Warning shows correct "X minutes ago" time
- [ ] Warning updates as time passes (may need refresh)

### Notification Testing

- [ ] "You're up soon" notifications still work for online classes
- [ ] Notifications are suppressed for offline-scoring classes

---

## Implementation Order

| Step | Description | Effort | Risk |
|------|-------------|--------|------|
| 1 | Database migration (last_result_at + trigger) | 1 hour | Low |
| 2 | Update statusConfig.ts + CSS | 30 min | Low |
| 3 | Update ClassCard (icon + type) | 30 min | Low |
| 4 | Update status dialog options | 30 min | Low |
| 5 | Create staleDataUtils.ts | 1 hour | Medium |
| 6 | Add warning banners to ClassCard | 1 hour | Low |
| 7 | Update useClassListData query | 30 min | Low |
| 8 | Update Dog Details page | 1 hour | Low |
| 9 | Update notification trigger | 30 min | Low |
| 10 | Testing | 2 hours | - |

**Total Estimated Effort:** ~8-9 hours

---

## Future Enhancements

1. **Push notification to exhibitors** when class goes offline
2. **Auto-detect** when a class that was in-progress stops syncing (hybrid approach)
3. **Ring-level offline status** for shows with multiple classes per ring
4. **Configurable stale threshold** per show/trial
