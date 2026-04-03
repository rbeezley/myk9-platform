# Wait List & Mail-In Reservation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement judge-day capacity management, wait lists with FIFO ordering, mail-in reservations, and secretary-driven promotion with pay-on-promotion via Stripe.

**Architecture:** New migration adds columns to `shows` and `judge_assignments`, extends entry status enum, and creates a `get_judge_day_capacity()` function. The existing `waitlist_entries` table and `add_to_waitlist()` function are reused. Frontend adds a capacity dashboard for secretaries, updates the registration flow to handle wait-listed entries in the cart, and adds a promotion/payment flow. A new edge function handles push + email notifications.

**Tech Stack:** PostgreSQL (Supabase), TypeScript, React, Zustand, React Query, shadcn/ui, Resend (email), web-push (notifications), Stripe (payment)

**Design doc:** `docs/plans/2026-04-02-wait-list-design.md`

---

## Phase 1: Database Migration

### Task 1: Create migration file with schema changes

**Files:**
- Create: `supabase/migrations/110_wait_list_capacity.sql`

**Step 1: Write the migration**

```sql
-- =============================================================================
-- Migration 110: Wait List & Judge-Day Capacity
-- =============================================================================
-- Adds judge-day capacity model, mail-in reservation config, wait list
-- payment flow, and a function to calculate judge-day availability.
-- Design: docs/plans/2026-04-02-wait-list-design.md

-- -----------------------------------------------------------------------------
-- 1. Add capacity & mail-in config to shows
-- -----------------------------------------------------------------------------

ALTER TABLE shows
  ADD COLUMN IF NOT EXISTS default_judge_day_capacity INTEGER NOT NULL DEFAULT 125,
  ADD COLUMN IF NOT EXISTS mail_in_strategy TEXT DEFAULT 'none'
    CHECK (mail_in_strategy IN ('fixed', 'percentage', 'deadline', 'none')),
  ADD COLUMN IF NOT EXISTS mail_in_value INTEGER,
  ADD COLUMN IF NOT EXISTS mail_in_deadline DATE,
  ADD COLUMN IF NOT EXISTS mail_in_auto_release BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mail_in_release_date DATE,
  ADD COLUMN IF NOT EXISTS waitlist_payment_deadline_hours INTEGER NOT NULL DEFAULT 48;

-- Validate mail_in_value is set when strategy requires it
ALTER TABLE shows ADD CONSTRAINT shows_mail_in_value_required
  CHECK (
    mail_in_strategy = 'none'
    OR mail_in_strategy = 'deadline'
    OR mail_in_value IS NOT NULL
  );

-- Validate mail_in_deadline is set when strategy = 'deadline'
ALTER TABLE shows ADD CONSTRAINT shows_mail_in_deadline_required
  CHECK (
    mail_in_strategy != 'deadline'
    OR mail_in_deadline IS NOT NULL
  );

-- -----------------------------------------------------------------------------
-- 2. Add capacity override to judge_assignments
-- -----------------------------------------------------------------------------

ALTER TABLE judge_assignments
  ADD COLUMN IF NOT EXISTS day_capacity_override INTEGER;

-- -----------------------------------------------------------------------------
-- 3. Extend entry_status with wait-list payment statuses
-- -----------------------------------------------------------------------------

-- Drop and recreate the CHECK constraint to add new values.
-- Existing constraint is inline on the column (migration 003).
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_entry_status_check;
ALTER TABLE entries ADD CONSTRAINT entries_entry_status_check
  CHECK (entry_status IN (
    'no-status', 'draft', 'submitted', 'paid', 'confirmed',
    'checked-in', 'competing', 'completed',
    'withdrawn', 'scratched', 'absent',
    'pending-payment', 'promotion-expired'
  ));

-- -----------------------------------------------------------------------------
-- 4. get_judge_day_capacity() — core capacity function
-- -----------------------------------------------------------------------------
-- Returns capacity stats for a judge on a specific show date.
-- "Judge-day" = all classes assigned to this judge in trials on this date.

CREATE OR REPLACE FUNCTION get_judge_day_capacity(
  p_judge_id UUID,
  p_show_id UUID,
  p_date DATE
)
RETURNS TABLE (
  judge_id UUID,
  show_date DATE,
  capacity INTEGER,
  confirmed_count INTEGER,
  waitlist_count INTEGER,
  mail_in_reserved INTEGER,
  available_spots INTEGER,
  class_ids UUID[]
) AS $$
DECLARE
  v_capacity INTEGER;
  v_override INTEGER;
  v_show_capacity INTEGER;
  v_confirmed INTEGER;
  v_waitlist INTEGER;
  v_reserved INTEGER;
  v_class_ids UUID[];
  v_mail_in_strategy TEXT;
  v_mail_in_value INTEGER;
  v_mail_in_deadline DATE;
BEGIN
  -- Collect all class IDs for this judge on this date
  SELECT ARRAY_AGG(ja.class_id)
  INTO v_class_ids
  FROM judge_assignments ja
  JOIN classes c ON c.id = ja.class_id
  JOIN trials t ON t.id = c.trial_id
  WHERE ja.person_id = p_judge_id
    AND ja.show_id = p_show_id
    AND t.date = p_date
    AND ja.status = 'confirmed';

  -- Default to empty array if no assignments
  v_class_ids := COALESCE(v_class_ids, ARRAY[]::UUID[]);

  -- Get show-level default capacity
  SELECT s.default_judge_day_capacity, s.mail_in_strategy, s.mail_in_value, s.mail_in_deadline
  INTO v_show_capacity, v_mail_in_strategy, v_mail_in_value, v_mail_in_deadline
  FROM shows s
  WHERE s.id = p_show_id;

  -- Check for judge-specific override (use MAX since there could be
  -- multiple assignments; the override applies to the judge's whole day)
  SELECT MAX(ja.day_capacity_override)
  INTO v_override
  FROM judge_assignments ja
  JOIN classes c ON c.id = ja.class_id
  JOIN trials t ON t.id = c.trial_id
  WHERE ja.person_id = p_judge_id
    AND ja.show_id = p_show_id
    AND t.date = p_date
    AND ja.day_capacity_override IS NOT NULL;

  v_capacity := COALESCE(v_override, v_show_capacity, 125);

  -- Calculate mail-in reserved spots
  v_reserved := 0;
  IF v_mail_in_strategy = 'fixed' THEN
    v_reserved := COALESCE(v_mail_in_value, 0);
  ELSIF v_mail_in_strategy = 'percentage' THEN
    v_reserved := FLOOR(v_capacity * COALESCE(v_mail_in_value, 0) / 100.0);
  ELSIF v_mail_in_strategy = 'deadline' THEN
    -- Reserve spots only before the deadline
    IF CURRENT_DATE <= COALESCE(v_mail_in_deadline, CURRENT_DATE - 1) THEN
      -- Before deadline: all remaining capacity is effectively reserved for mail-in priority.
      -- Online entries still fill normally; the deadline strategy means mail-in gets priority,
      -- not that spots are blocked. So reserved = 0 for capacity calculation purposes.
      v_reserved := 0;
    END IF;
  END IF;

  -- Count confirmed entries across all judge's classes for this day
  SELECT COUNT(*)
  INTO v_confirmed
  FROM entries e
  WHERE e.class_id = ANY(v_class_ids)
    AND e.entry_status IN ('submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'pending-payment')
    AND e.deleted_at IS NULL;

  -- Count active waitlist entries across all judge's classes for this day
  SELECT COUNT(*)
  INTO v_waitlist
  FROM waitlist_entries we
  WHERE we.class_id = ANY(v_class_ids)
    AND we.status = 'waiting';

  -- Return results
  judge_id := p_judge_id;
  show_date := p_date;
  capacity := v_capacity;
  confirmed_count := v_confirmed;
  waitlist_count := v_waitlist;
  mail_in_reserved := v_reserved;
  available_spots := GREATEST(0, v_capacity - v_confirmed - v_reserved);
  class_ids := v_class_ids;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION get_judge_day_capacity(UUID, UUID, DATE) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. RLS policies for waitlist operations [ADDED]
-- -----------------------------------------------------------------------------

-- Secretary/admin can manage waitlist entries
CREATE POLICY waitlist_entries_select ON waitlist_entries FOR SELECT
  TO authenticated USING (true);

CREATE POLICY waitlist_entries_insert ON waitlist_entries FOR INSERT
  TO authenticated WITH CHECK (
    exhibitor_id = (
      SELECT ep.id FROM exhibitor_profiles ep
      JOIN people p ON p.id = ep.person_id
      WHERE p.auth_user_id = auth.uid()
    )
    OR is_secretary_or_admin()
  );

CREATE POLICY waitlist_entries_update ON waitlist_entries FOR UPDATE
  TO authenticated USING (is_secretary_or_admin());

CREATE POLICY waitlist_entries_delete ON waitlist_entries FOR DELETE
  TO authenticated USING (
    -- Exhibitor can withdraw their own
    exhibitor_id = (
      SELECT ep.id FROM exhibitor_profiles ep
      JOIN people p ON p.id = ep.person_id
      WHERE p.auth_user_id = auth.uid()
    )
    OR is_secretary_or_admin()
  );

ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 6. Promote with advisory lock to prevent double-promote [ADDED]
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION promote_waitlist_entry(
  p_waitlist_entry_id UUID,
  p_deadline_hours INTEGER DEFAULT 48
) RETURNS UUID AS $$
DECLARE
  v_wl waitlist_entries;
  v_new_entry_id UUID;
BEGIN
  -- Lock this waitlist entry to prevent concurrent promotion
  PERFORM pg_advisory_xact_lock(hashtext(p_waitlist_entry_id::text));

  -- Fetch and verify still waiting
  SELECT * INTO v_wl FROM waitlist_entries WHERE id = p_waitlist_entry_id;
  IF v_wl.status != 'waiting' THEN
    RAISE EXCEPTION 'Waitlist entry is no longer in waiting status (current: %)', v_wl.status;
  END IF;

  -- Create the entry with pending-payment status
  INSERT INTO entries (dog_id, class_id, show_id, trial_id, entry_status, handler_id)
  SELECT v_wl.dog_id, v_wl.class_id, t.show_id, c.trial_id, 'pending-payment', v_wl.handler_id
  FROM classes c JOIN trials t ON t.id = c.trial_id
  WHERE c.id = v_wl.class_id
  RETURNING id INTO v_new_entry_id;

  -- Update waitlist entry
  UPDATE waitlist_entries
  SET status = 'offered',
      offered_at = NOW(),
      offer_expires_at = NOW() + (p_deadline_hours || ' hours')::INTERVAL,
      updated_at = NOW()
  WHERE id = p_waitlist_entry_id;

  RETURN v_new_entry_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION promote_waitlist_entry(UUID, INTEGER) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. Performance index for entry counting [ADDED]
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS entries_class_status_idx
  ON entries(class_id, entry_status)
  WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 8. Helper view: judge_day_summary
-- -----------------------------------------------------------------------------
-- Convenience view for the secretary dashboard. Lists every judge + date
-- combination for a show with their capacity stats.

CREATE OR REPLACE VIEW judge_day_summary AS
SELECT
  ja.show_id,
  ja.person_id AS judge_id,
  p.first_name || ' ' || p.last_name AS judge_name,
  t.date AS show_date,
  ARRAY_AGG(DISTINCT c.id) AS class_ids,
  ARRAY_AGG(DISTINCT c.name) AS class_names,
  COUNT(DISTINCT e.id) FILTER (
    WHERE e.entry_status IN ('submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'pending-payment')
    AND e.deleted_at IS NULL
  ) AS confirmed_count,
  COUNT(DISTINCT we.id) FILTER (WHERE we.status = 'waiting') AS waitlist_count
FROM judge_assignments ja
JOIN people p ON p.id = ja.person_id
JOIN classes c ON c.id = ja.class_id
JOIN trials t ON t.id = c.trial_id
LEFT JOIN entries e ON e.class_id = c.id
LEFT JOIN waitlist_entries we ON we.class_id = c.id
WHERE ja.status = 'confirmed'
GROUP BY ja.show_id, ja.person_id, p.first_name, p.last_name, t.date;

-- RLS: readable by authenticated users (secretary checks happen in app layer)
GRANT SELECT ON judge_day_summary TO authenticated;

-- -----------------------------------------------------------------------------
-- 9. Deprecate old check_class_availability [ADDED]
-- -----------------------------------------------------------------------------
-- Keep the function for backwards compatibility but add a comment.
-- New code should use get_judge_day_capacity() instead.
COMMENT ON FUNCTION check_class_availability(UUID) IS
  'DEPRECATED: Use get_judge_day_capacity() for judge-day capacity model. Retained for backwards compatibility.';

-- -----------------------------------------------------------------------------
-- 6. Index for judge-day lookups
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS judge_assignments_class_trial_idx
  ON judge_assignments(person_id, show_id, class_id)
  WHERE status = 'confirmed';
```

**Step 2: Review the migration**

Read the file back and verify:
- All constraints have correct logic
- `get_judge_day_capacity()` handles all mail-in strategies
- Entry status constraint includes all existing + new values
- View joins are correct

**Step 3: Commit**

```bash
git add supabase/migrations/110_wait_list_capacity.sql
git commit -m "feat: add wait list capacity migration (110)

Judge-day capacity model, mail-in reservation config on shows,
entry status extensions (pending-payment, promotion-expired),
get_judge_day_capacity() function, and judge_day_summary view."
```

---

## Phase 2: TypeScript Types & Shared Utilities

### Task 2: Update entry status types

**Files:**
- Modify: `apps/myk9show/src/types/entry-lifecycle.ts`
- Modify: `apps/myk9show/src/types/database-mappings.ts` (if entry_status is typed there)

**Step 1: Add new statuses to `EntryStatus` type**

In `entry-lifecycle.ts`, add `'pending-payment'` and `'promotion-expired'` to the `EntryStatus` union:

```typescript
export type EntryStatus =
  | 'draft'
  | 'submitted'
  | 'paid'
  | 'confirmed'
  | 'scheduled'
  | 'competing'
  | 'completed'
  | 'withdrawn'
  | 'scratched'
  | 'pending-payment'
  | 'promotion-expired';
```

**Step 2: Search for any other entry_status type definitions**

Run: `cd apps/myk9show && grep -r "entry_status\|EntryStatus" src/types/ --include="*.ts" -l`

Update any other files that enumerate entry statuses (e.g., `database-mappings.ts`).

**Step 3: Commit**

```bash
git add apps/myk9show/src/types/
git commit -m "feat: add pending-payment and promotion-expired entry statuses"
```

### Task 3: Add wait list types

**Files:**
- Create: `apps/myk9show/src/types/waitlist-types.ts`

**Step 1: Write the types file**

```typescript
// Types for the wait list and judge-day capacity system

export type MailInStrategy = 'fixed' | 'percentage' | 'deadline' | 'none';

export interface WaitListShowConfig {
  defaultJudgeDayCapacity: number;
  mailInStrategy: MailInStrategy;
  mailInValue: number | null;
  mailInDeadline: string | null; // ISO date
  mailInAutoRelease: boolean;
  mailInReleaseDate: string | null; // ISO date
  waitlistPaymentDeadlineHours: number;
}

export interface JudgeDayCapacity {
  judgeId: string;
  judgeName: string;
  showDate: string; // ISO date
  capacity: number;
  confirmedCount: number;
  waitlistCount: number;
  mailInReserved: number;
  availableSpots: number;
  classIds: string[];
  classNames: string[];
}

export interface WaitListEntry {
  id: string;
  classId: string;
  className: string;
  exhibitorId: string;
  exhibitorName: string;
  dogId: string;
  dogName: string;
  handlerId: string | null;
  position: number;
  status: 'waiting' | 'offered' | 'accepted' | 'declined' | 'expired';
  createdAt: string;
}

export interface WaitListPromotion {
  waitlistEntryId: string;
  entryId: string; // the new entry created from promotion
  promotedAt: string;
  paymentDeadline: string; // ISO datetime
}
```

**Step 2: Commit**

```bash
git add apps/myk9show/src/types/waitlist-types.ts
git commit -m "feat: add wait list and judge-day capacity types"
```

---

## Phase 3: Capacity Hook & Data Layer

### Task 4: Create `useJudgeDayCapacity` hook

**Files:**
- Create: `apps/myk9show/src/hooks/queries/useJudgeDayCapacity.ts`
- Test: `apps/myk9show/src/hooks/queries/__tests__/useJudgeDayCapacity.test.ts`

**Step 1: Write the failing test**

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '@/test/utils/testUtils';
import { useJudgeDayCapacity } from '../useJudgeDayCapacity';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase');

describe('useJudgeDayCapacity', () => {
  it('returns empty array when showId is undefined', () => {
    const { result } = renderHook(() => useJudgeDayCapacity(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.judgeDays).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('fetches judge-day capacity from the view', async () => {
    const mockData = [
      {
        show_id: 'show-1',
        judge_id: 'judge-1',
        judge_name: 'Jane Doe',
        show_date: '2026-05-01',
        class_ids: ['c1', 'c2'],
        class_names: ['Novice A', 'Novice B'],
        confirmed_count: 80,
        waitlist_count: 5,
      },
    ];

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      }),
    } as never);

    const { result } = renderHook(() => useJudgeDayCapacity('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.judgeDays).toHaveLength(1);
    expect(result.current.judgeDays[0]!.judgeName).toBe('Jane Doe');
    expect(result.current.judgeDays[0]!.confirmedCount).toBe(80);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/useJudgeDayCapacity.test.ts`

Expected: FAIL — module not found.

**Step 3: Write the hook**

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryClient';
import type { JudgeDayCapacity } from '@/types/waitlist-types';

interface JudgeDaySummaryRow {
  show_id: string;
  judge_id: string;
  judge_name: string;
  show_date: string;
  class_ids: string[];
  class_names: string[];
  confirmed_count: number;
  waitlist_count: number;
}

export function useJudgeDayCapacity(showId: string | undefined) {
  const query = useQuery({
    queryKey: [...queryKeys.shows, showId, 'judge-day-capacity'],
    queryFn: async (): Promise<JudgeDayCapacity[]> => {
      const { data, error } = await supabase
        .from('judge_day_summary')
        .select('*')
        .eq('show_id', showId!);

      if (error) throw error;

      // We need show config for capacity & mail-in calculations
      const { data: show, error: showError } = await supabase
        .from('shows')
        .select('default_judge_day_capacity, mail_in_strategy, mail_in_value, mail_in_deadline')
        .eq('id', showId!)
        .single();

      if (showError) throw showError;

      return (data as JudgeDaySummaryRow[]).map((row) => {
        const capacity = show.default_judge_day_capacity ?? 125;
        let mailInReserved = 0;
        if (show.mail_in_strategy === 'fixed') {
          mailInReserved = show.mail_in_value ?? 0;
        } else if (show.mail_in_strategy === 'percentage') {
          mailInReserved = Math.floor(capacity * (show.mail_in_value ?? 0) / 100);
        }

        return {
          judgeId: row.judge_id,
          judgeName: row.judge_name,
          showDate: row.show_date,
          capacity,
          confirmedCount: row.confirmed_count,
          waitlistCount: row.waitlist_count,
          mailInReserved,
          availableSpots: Math.max(0, capacity - row.confirmed_count - mailInReserved),
          classIds: row.class_ids,
          classNames: row.class_names,
        };
      });
    },
    enabled: !!showId,
  });

  return {
    judgeDays: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/useJudgeDayCapacity.test.ts`

**Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useJudgeDayCapacity.ts apps/myk9show/src/hooks/queries/__tests__/useJudgeDayCapacity.test.ts
git commit -m "feat: add useJudgeDayCapacity hook with tests"
```

### Task 5: Update `useClassAvailability` to use judge-day model

**Files:**
- Modify: `apps/myk9show/src/hooks/useClassAvailability.ts`
- Test: `apps/myk9show/src/hooks/__tests__/useClassAvailability.test.ts` (create if missing)

**Step 1: Write the failing test**

Test that `useClassAvailability` now returns a `judgeDayFull` flag per class, derived from the judge-day capacity rather than per-class `max_entries`:

```typescript
it('marks class as full when judge-day capacity is exhausted', async () => {
  // Mock: class has no per-class max_entries, but the judge-day is at 125
  // The class should show as full
  // ...setup mocks for classes, entries, judge_assignments, and show config...

  const { result } = renderHook(() => useClassAvailability('show-1'), {
    wrapper: createWrapper(),
  });

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.classes[0]!.judgeDayFull).toBe(true);
});
```

**Step 2: Update the hook**

Add `judgeDayFull` and `judgeId` fields to `ClassAvailability` interface. Fetch judge assignments alongside class data. For each class, look up which judge is assigned and whether that judge-day is full. The `isFull` flag should now reflect `judgeDayFull || perClassFull`.

Key changes to `useClassAvailability.ts`:
- Add `judgeId`, `judgeDayFull`, `judgeDayAvailable` to `ClassAvailability`
- Fetch `judge_assignments` for the show (where `status = 'confirmed'`)
- Group entries by judge+date and calculate totals
- Fetch show's `default_judge_day_capacity`

**Step 3: Run tests**

Run: `cd apps/myk9show && npx vitest run src/hooks/__tests__/useClassAvailability.test.ts`

**Step 4: Commit**

```bash
git add apps/myk9show/src/hooks/useClassAvailability.ts apps/myk9show/src/hooks/__tests__/useClassAvailability.test.ts
git commit -m "feat: integrate judge-day capacity into useClassAvailability"
```

---

## Phase 4: Show Setup UI — Capacity & Mail-In Config

### Task 6: Add capacity settings to ShowSettingsPage

**Files:**
- Modify: `apps/myk9show/src/pages/secretary/ShowSettingsPage/index.tsx`
- Create: `apps/myk9show/src/components/shows/WaitListSettingsCard.tsx`
- Test: `apps/myk9show/src/components/shows/__tests__/WaitListSettingsCard.test.tsx`

**Step 1: Write the failing test for `WaitListSettingsCard`**

Test that the component renders the capacity input (default 125), mail-in strategy dropdown, and conditionally shows fields based on selected strategy:

```typescript
import { render, screen, userEvent } from '@/test/utils/testUtils';
import { WaitListSettingsCard } from '../WaitListSettingsCard';

describe('WaitListSettingsCard', () => {
  const defaultProps = {
    config: {
      defaultJudgeDayCapacity: 125,
      mailInStrategy: 'none' as const,
      mailInValue: null,
      mailInDeadline: null,
      mailInAutoRelease: false,
      mailInReleaseDate: null,
      waitlistPaymentDeadlineHours: 48,
    },
    onChange: vi.fn(),
  };

  it('renders capacity input with default 125', () => {
    render(<WaitListSettingsCard {...defaultProps} />);
    expect(screen.getByLabelText(/judge daily capacity/i)).toHaveValue(125);
  });

  it('shows fixed count input when strategy is fixed', async () => {
    const { user } = render(
      <WaitListSettingsCard
        {...defaultProps}
        config={{ ...defaultProps.config, mailInStrategy: 'fixed' }}
      />
    );
    expect(screen.getByLabelText(/reserved spots/i)).toBeInTheDocument();
  });

  it('shows percentage input when strategy is percentage', () => {
    render(
      <WaitListSettingsCard
        {...defaultProps}
        config={{ ...defaultProps.config, mailInStrategy: 'percentage' }}
      />
    );
    expect(screen.getByLabelText(/reserved percentage/i)).toBeInTheDocument();
  });

  it('shows deadline picker when strategy is deadline', () => {
    render(
      <WaitListSettingsCard
        {...defaultProps}
        config={{ ...defaultProps.config, mailInStrategy: 'deadline' }}
      />
    );
    expect(screen.getByLabelText(/mail-in deadline/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run test, verify fail**

**Step 3: Build `WaitListSettingsCard`**

A shadcn Card with:
- Number input: "Judge Daily Capacity" (default 125)
- Select: "Mail-In Reservation Strategy" (None / Fixed Count / Percentage / Deadline)
- Conditional fields based on strategy
- Toggle: "Auto-release unused spots" (shows date picker when on)
- Number input: "Payment deadline (hours)" (default 48)

Use `@/components/ui/card`, `@/components/ui/input`, `@/components/ui/select`, `@/components/ui/switch`, `@/components/ui/label`.

**Step 4: Run tests, verify pass**

**Step 5: Wire into ShowSettingsPage**

Add `<WaitListSettingsCard>` to the settings page. Read/write the new show columns via existing show settings hook pattern.

**Step 6: Commit**

```bash
git add apps/myk9show/src/components/shows/WaitListSettingsCard.tsx apps/myk9show/src/components/shows/__tests__/WaitListSettingsCard.test.tsx apps/myk9show/src/pages/secretary/ShowSettingsPage/
git commit -m "feat: add wait list settings card to show settings page"
```

---

## Phase 5: Registration Flow — Wait List in Cart

### Task 7: Update `ClassSelectionStep` for wait list awareness

**Files:**
- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.tsx`
- Test: `apps/myk9show/src/components/shows/RegistrationWorkflow/__tests__/ClassSelectionStep.test.tsx` (create if missing)

**Step 1: Write the failing test**

```typescript
it('shows "Full — Join Wait List" badge when judge-day is full', async () => {
  // Mock useClassAvailability to return a class where judgeDayFull = true
  // Render ClassSelectionStep
  // Expect badge text "Full — Join Wait List"
});

it('allows adding a full class to cart as wait list entry', async () => {
  // Mock full class
  // Click the class toggle
  // Verify cart item is marked as waitlisted
});
```

**Step 2: Run test, verify fail**

**Step 3: Update `ClassSelectionStep`**

- When a class is full (`judgeDayFull`), show a badge: "Full — Join Wait List" with the current wait list position
- Allow selecting the class — it goes into the cart tagged as `waitlisted: true`
- In the cart summary section, separate confirmed entries from wait-listed entries with clear labels

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/RegistrationWorkflow/
git commit -m "feat: show wait list status in class selection step"
```

### Task 8: Update cart checkout to handle wait list entries

**Files:**
- Modify: cart store and checkout logic (find via `useCartStore` or `entry_carts`)
- Modify: entry creation mutations

**Step 1: Write the failing test**

```typescript
it('creates waitlist entries for full classes during checkout', async () => {
  // Cart has 2 items: one available class, one full class
  // On checkout, the available class becomes an entry (submitted)
  // The full class calls add_to_waitlist() instead
});

it('displays checkout summary distinguishing entries from waitlist', async () => {
  // Render confirmation step
  // Expect: "2 entries confirmed, 1 added to wait list (position #4)"
});
```

**Step 2: Update checkout logic**

During cart submission:
1. For each cart item, check judge-day availability
2. Available classes → create entries via normal path (`entry_status = 'submitted'`)
3. Full classes → call `add_to_waitlist()` RPC
4. Return mixed result to confirmation step

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add apps/myk9show/src/store/ apps/myk9show/src/components/shows/RegistrationWorkflow/
git commit -m "feat: handle wait list entries during cart checkout"
```

---

## Phase 6: Secretary Dashboard — Wait List Management

### Task 9: Create `JudgeCapacityOverview` component

**Files:**
- Create: `apps/myk9show/src/components/waitlist/JudgeCapacityOverview.tsx`
- Test: `apps/myk9show/src/components/waitlist/__tests__/JudgeCapacityOverview.test.tsx`

**Step 1: Write the failing test**

```typescript
import { render, screen } from '@/test/utils/testUtils';
import { JudgeCapacityOverview } from '../JudgeCapacityOverview';

describe('JudgeCapacityOverview', () => {
  const mockJudgeDays = [
    {
      judgeId: 'j1',
      judgeName: 'Jane Doe',
      showDate: '2026-05-01',
      capacity: 125,
      confirmedCount: 100,
      waitlistCount: 8,
      mailInReserved: 10,
      availableSpots: 15,
      classIds: ['c1', 'c2'],
      classNames: ['Novice A', 'Open B'],
    },
    {
      judgeId: 'j2',
      judgeName: 'John Smith',
      showDate: '2026-05-01',
      capacity: 125,
      confirmedCount: 125,
      waitlistCount: 12,
      mailInReserved: 0,
      availableSpots: 0,
      classIds: ['c3'],
      classNames: ['Excellent A'],
    },
  ];

  it('renders a card per judge-day', () => {
    render(<JudgeCapacityOverview judgeDays={mockJudgeDays} />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('John Smith')).toBeInTheDocument();
  });

  it('shows capacity bar with correct fill', () => {
    render(<JudgeCapacityOverview judgeDays={mockJudgeDays} />);
    // Jane: 100/125 = 80%
    expect(screen.getByText('100 / 125')).toBeInTheDocument();
  });

  it('highlights full judges', () => {
    render(<JudgeCapacityOverview judgeDays={mockJudgeDays} />);
    // John is at capacity — should have a visual indicator
    expect(screen.getByText('12 on wait list')).toBeInTheDocument();
  });
});
```

**Step 2: Run test, verify fail**

**Step 3: Build the component**

A grid of cards, one per judge-day. Each card shows:
- Judge name + date
- Progress bar (confirmed / capacity) — color shifts amber > red as it fills
- Class names listed below
- "X on wait list" badge if any
- "X mail-in reserved" note if applicable
- Button: "View Wait List" (links to wait list queue)

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add apps/myk9show/src/components/waitlist/
git commit -m "feat: add JudgeCapacityOverview component with tests"
```

### Task 10: Create `WaitListQueue` component

**Files:**
- Create: `apps/myk9show/src/components/waitlist/WaitListQueue.tsx`
- Test: `apps/myk9show/src/components/waitlist/__tests__/WaitListQueue.test.tsx`

**Step 1: Write the failing test**

```typescript
describe('WaitListQueue', () => {
  it('renders wait list entries in FIFO order', () => {
    // Mock entries sorted by position
    // Verify display order matches
  });

  it('calls onPromote when Promote button is clicked', async () => {
    const onPromote = vi.fn();
    // Render with entries and onPromote callback
    // Click Promote on first entry
    // Verify onPromote called with entry id
  });

  it('calls onRemove when Remove button is clicked', async () => {
    const onRemove = vi.fn();
    // Render with entries and onRemove callback
    // Click Remove
    // Verify onRemove called
  });

  it('shows pending payment entries with countdown', () => {
    // Entry with status 'offered' and offer_expires_at in the future
    // Verify countdown timer displays
  });
});
```

**Step 2: Run test, verify fail**

**Step 3: Build the component**

A table/list showing:
- Position, exhibitor name, dog name, class, date added
- Actions: "Promote" button (calls promote mutation), "Remove" button
- Pending payment section at top: entries that have been promoted but awaiting payment, with countdown timer

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add apps/myk9show/src/components/waitlist/
git commit -m "feat: add WaitListQueue component with promote/remove actions"
```

### Task 11: Create wait list mutations hook

**Files:**
- Create: `apps/myk9show/src/hooks/mutations/useWaitListMutations.ts`
- Test: `apps/myk9show/src/hooks/mutations/__tests__/useWaitListMutations.test.ts`

**Step 1: Write the failing test**

```typescript
describe('useWaitListMutations', () => {
  describe('promoteEntry', () => {
    it('creates entry from waitlist and updates waitlist status', async () => {
      // Mock supabase calls
      // Call promoteEntry with waitlist entry id
      // Verify: new entry created with status 'pending-payment'
      // Verify: waitlist entry status updated to 'offered'
      // Verify: offer_expires_at set correctly
    });
  });

  describe('removeFromWaitList', () => {
    it('deletes waitlist entry and reorders positions', async () => {
      // Mock supabase calls
      // Call removeFromWaitList with entry id
      // Verify deletion and position recalculation
    });
  });
});
```

**Step 2: Run test, verify fail**

**Step 3: Write the mutations hook**

```typescript
export function useWaitListMutations(showId: string) {
  const queryClient = useQueryClient();

  const promoteEntry = useMutation({
    mutationFn: async (waitlistEntryId: string) => {
      // 1. Fetch the waitlist entry
      // 2. Create a new entry with status 'pending-payment'
      // 3. Update waitlist entry: status='offered', offered_at=now(),
      //    offer_expires_at = now() + show.waitlist_payment_deadline_hours
      // 4. Trigger notification (via edge function or DB trigger)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.shows, showId] });
    },
  });

  const removeFromWaitList = useMutation({
    mutationFn: async (waitlistEntryId: string) => {
      // 1. Delete the waitlist entry
      // 2. Reorder remaining positions
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.shows, showId] });
    },
  });

  const bulkPromote = useMutation({
    mutationFn: async (waitlistEntryIds: string[]) => {
      // Promote multiple entries sequentially
    },
  });

  return { promoteEntry, removeFromWaitList, bulkPromote };
}
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/mutations/useWaitListMutations.ts apps/myk9show/src/hooks/mutations/__tests__/useWaitListMutations.test.ts
git commit -m "feat: add wait list mutation hooks (promote, remove, bulk)"
```

### Task 11b: Add exhibitor withdraw mutation [ADDED]

**Files:**
- Modify: `apps/myk9show/src/hooks/mutations/useWaitListMutations.ts`

**Step 1: Write the failing test**

```typescript
describe('withdrawFromWaitList', () => {
  it('deletes the waitlist entry for the current exhibitor', async () => {
    // Mock: exhibitor owns this waitlist entry
    // Call withdrawFromWaitList
    // Verify: entry deleted, positions reordered
  });

  it('rejects withdrawal if exhibitor does not own the entry', async () => {
    // Mock: different exhibitor
    // Verify: RLS blocks the delete
  });
});
```

**Step 2: Add `withdrawFromWaitList` mutation**

```typescript
const withdrawFromWaitList = useMutation({
  mutationFn: async (waitlistEntryId: string) => {
    const { error } = await supabase
      .from('waitlist_entries')
      .delete()
      .eq('id', waitlistEntryId);
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: [...queryKeys.shows, showId] });
  },
});
```

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add apps/myk9show/src/hooks/mutations/
git commit -m "feat: add exhibitor withdraw from wait list mutation"
```

### Task 11c: Add class rebalancing mutation [ADDED]

**Files:**
- Modify: `apps/myk9show/src/hooks/mutations/useWaitListMutations.ts`
- Test: `apps/myk9show/src/hooks/mutations/__tests__/useWaitListMutations.test.ts`

**Step 1: Write the failing test**

```typescript
describe('reassignClass', () => {
  it('updates judge_assignment to new judge and invalidates capacity queries', async () => {
    // Mock: class c1 assigned to judge j1, reassign to j2
    // Verify: judge_assignments row updated
    // Verify: both judges' capacity queries invalidated
  });
});
```

**Step 2: Add `reassignClass` mutation**

```typescript
const reassignClass = useMutation({
  mutationFn: async ({ classId, fromJudgeId, toJudgeId }: {
    classId: string;
    fromJudgeId: string;
    toJudgeId: string;
  }) => {
    const { error } = await supabase
      .from('judge_assignments')
      .update({ person_id: toJudgeId, updated_at: new Date().toISOString() })
      .eq('class_id', classId)
      .eq('person_id', fromJudgeId)
      .eq('show_id', showId);
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: [...queryKeys.shows, showId, 'judge-day-capacity'] });
    // Notification to secretary about capacity changes handled in the UI
    // after refetch completes
  },
});
```

**Step 3: Add "Reassign" UI to JudgeCapacityOverview**

Each class in a judge's card gets a "Reassign" action that opens a dialog listing other judges for that show. Selecting one calls `reassignClass`. After success, the capacity overview refetches and highlights any judges whose wait lists now have room.

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/mutations/ apps/myk9show/src/components/waitlist/
git commit -m "feat: add class rebalancing between judges"
```

### Task 12: Create secretary wait list page and route

**Files:**
- Create: `apps/myk9show/src/pages/secretary/WaitListPage/index.tsx`
- Modify: `apps/myk9show/src/routes/secretaryRoutes.tsx`

**Step 1: Build the page**

Compose `JudgeCapacityOverview` + `WaitListQueue` into a full page:
- Top: `JudgeCapacityOverview` for all judges
- Below: `WaitListQueue` filtered by selected judge (click a judge card to filter)
- Tab or section for "Pending Payments" — entries promoted but not yet paid

**Step 2: Add route**

In `secretaryRoutes.tsx`, add a lazy route:
```typescript
{
  path: 'wait-list',
  element: <SuspenseWrapper><WaitListPage /></SuspenseWrapper>,
}
```

**Step 3: Commit**

```bash
git add apps/myk9show/src/pages/secretary/WaitListPage/ apps/myk9show/src/routes/secretaryRoutes.tsx
git commit -m "feat: add secretary wait list management page"
```

---

## Phase 7: Promotion Payment Flow

### Task 13: Create exhibitor payment prompt page

**Files:**
- Create: `apps/myk9show/src/pages/exhibitor/WaitListPaymentPage/index.tsx`
- Modify: `apps/myk9show/src/routes/publicRoutes.tsx` or exhibitor routes

**Step 1: Build the payment page**

Route: `/entries/:entryId/complete-payment`

Page shows:
- Class name, show name, dog name
- Entry fee amount
- Countdown timer to payment deadline
- "Complete Payment" button → Stripe checkout (reuse existing `stripe-checkout` edge function pattern)
- "Decline" button → marks entry as `withdrawn`, notifies secretary

**Step 2: Add route**

**Step 3: Write a test**

```typescript
describe('WaitListPaymentPage', () => {
  it('renders entry details and payment button', () => {
    // Mock entry with status 'pending-payment'
    // Verify class name, fee, and button display
  });

  it('shows expired message when deadline has passed', () => {
    // Mock entry with promotion-expired status
    // Verify "This offer has expired" message
  });
});
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add apps/myk9show/src/pages/exhibitor/WaitListPaymentPage/ apps/myk9show/src/routes/
git commit -m "feat: add exhibitor wait list payment page"
```

### Task 14: Handle payment deadline expiry

**Files:**
- Create: `supabase/functions/waitlist-check-deadlines/index.ts`

**Step 1: Write the edge function**

A scheduled function (or invoked via cron) that:
1. Queries entries with `entry_status = 'pending-payment'` and related `waitlist_entries` where `offer_expires_at < NOW()`
2. Updates entry status to `promotion-expired`
3. Updates waitlist entry status to `expired`
4. Sends notification to secretary

This can also be done via a Postgres `pg_cron` job if available, or a Supabase scheduled function.

**Step 2: Commit**

```bash
git add supabase/functions/waitlist-check-deadlines/
git commit -m "feat: add deadline expiry checker for wait list promotions"
```

### Task 14b: Set up cron for deadline checker and auto-release [ADDED]

**Files:**
- Create: `supabase/migrations/111_waitlist_cron_jobs.sql` (if pg_cron available)
- Or: configure Supabase scheduled functions

**Step 1: Add pg_cron jobs (if available) or document manual setup**

Option A — pg_cron (if enabled on Supabase project):
```sql
-- Check for expired promotions every 15 minutes
SELECT cron.schedule('waitlist-check-deadlines', '*/15 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/waitlist-check-deadlines',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))
  )$$
);

-- Check for mail-in auto-release daily at midnight
SELECT cron.schedule('waitlist-auto-release', '0 0 * * *',
  $$UPDATE shows
    SET mail_in_strategy = 'none'
    WHERE mail_in_auto_release = TRUE
      AND mail_in_release_date <= CURRENT_DATE
      AND mail_in_strategy != 'none'$$
);
```

Option B — Supabase scheduled functions (use `/schedule` skill).

**Step 2: Add halfway reminder logic to deadline checker**

In `waitlist-check-deadlines/index.ts`, also query for entries where:
- `entry_status = 'pending-payment'`
- `offer_expires_at` is within the next half of `waitlist_payment_deadline_hours`
- No reminder has been sent yet (track via a `reminder_sent_at` column on `waitlist_entries` or a flag)

Send reminder notification via `push-trigger-waitlist` with `type: 'reminder'`.

**Step 3: Commit**

```bash
git add supabase/migrations/111_waitlist_cron_jobs.sql supabase/functions/waitlist-check-deadlines/
git commit -m "feat: add cron jobs for deadline expiry and auto-release"
```

### Task 14c: Handle Stripe checkout expiry for promoted entries [ADDED]

**Files:**
- Modify: Stripe webhook handler (if one exists) or `waitlist-check-deadlines/index.ts`

**Step 1: Handle Stripe session expiry**

When a promoted exhibitor starts Stripe checkout but doesn't complete it, the Stripe checkout session expires (default 24h). The deadline checker already handles this — if the entry is still `pending-payment` after the deadline, it gets expired regardless of Stripe session state.

For explicit Stripe failure (card declined), the payment page should:
1. Show an error message: "Payment failed. Please try again or contact the secretary."
2. Allow retry within the deadline window
3. Not change entry status — it stays `pending-payment` until deadline

**Step 2: Add retry logic to WaitListPaymentPage**

After failed Stripe checkout, redirect back to payment page with error message. Only expire on deadline, not on payment failure.

**Step 3: Commit**

```bash
git add apps/myk9show/src/pages/exhibitor/WaitListPaymentPage/
git commit -m "feat: handle Stripe payment failures with retry for wait list"
```

---

## Phase 8: Notifications & Email

### Task 15: Create `push-trigger-waitlist` edge function

**Files:**
- Create: `supabase/functions/push-trigger-waitlist/index.ts`

**Step 1: Write the edge function**

Follow the pattern from `push-trigger-announcement/index.ts`:
- Accept a JSON payload with `type` (promoted, reminder, expired, removed) and context (entry_id, show_id, exhibitor auth_user_id)
- Resolve push subscriptions for the target user
- Send push notification with appropriate message
- Clean up expired subscriptions

**Step 2: Write the email sending**

Within the same function (or a separate `send-waitlist-email` function), use Resend to send HTML emails. Follow the pattern from `send-registration-email/index.ts`:
- Template with brand colors
- Direct link to payment page for promotion emails
- Log to `email_log` table

**Step 3: Test manually**

Deploy to Supabase and test with a real push subscription + email.

**Step 4: Commit**

```bash
git add supabase/functions/push-trigger-waitlist/
git commit -m "feat: add push + email notifications for wait list events"
```

### Task 16: Wire promotion to trigger notifications

**Files:**
- Modify: `apps/myk9show/src/hooks/mutations/useWaitListMutations.ts`

**Step 1: Update `promoteEntry` mutation**

After creating the entry and updating the waitlist row, invoke the edge function:

```typescript
await supabase.functions.invoke('push-trigger-waitlist', {
  body: {
    type: 'promoted',
    entryId: newEntry.id,
    showId,
    exhibitorAuthUserId: exhibitor.auth_user_id,
    className: waitlistEntry.class_name,
    showName: show.name,
    paymentDeadlineHours: show.waitlist_payment_deadline_hours,
  },
});
```

**Step 2: Commit**

```bash
git add apps/myk9show/src/hooks/mutations/useWaitListMutations.ts
git commit -m "feat: trigger push + email on wait list promotion"
```

---

## Phase 9: Integration Testing & Polish

### Task 17: Add wait list entry display to exhibitor's "My Entries" page

**Files:**
- Modify: wherever "My Entries" or "My Shows" displays entries for the exhibitor
- Find via: `useMyEntries` hook or similar

**Step 1: Update My Entries to show wait list positions**

- Query `waitlist_entries` for the current exhibitor
- Display wait-listed entries in a separate "Wait List" section
- Show position, class, show, and "Withdraw" button

**Step 2: Commit**

```bash
git commit -m "feat: show wait list entries on exhibitor My Entries page"
```

### Task 18: Add sidebar navigation for secretary wait list page

**Files:**
- Modify: sidebar/navigation component used by secretary layout

**Step 1: Add "Wait List" nav item**

Add a nav item pointing to `/secretary/wait-list`. Include an unread-style badge showing total wait list count across all judges.

**Step 2: Commit**

```bash
git commit -m "feat: add Wait List to secretary sidebar navigation"
```

### Task 18b: Add show-day wait list cleanup action [ADDED]

**Files:**
- Modify: `apps/myk9show/src/pages/secretary/WaitListPage/index.tsx`
- Modify: `apps/myk9show/src/hooks/mutations/useWaitListMutations.ts`

**Step 1: Add "Close Wait List" action**

On the secretary wait list page, add a "Close Wait List" button (visible when show date has arrived or passed). This bulk-updates all remaining `waiting` entries to `expired` and optionally triggers a notification to each exhibitor: "The wait list for [Show] has closed. You were not promoted."

**Step 2: Add mutation**

```typescript
const closeWaitList = useMutation({
  mutationFn: async () => {
    const { error } = await supabase
      .from('waitlist_entries')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('status', 'waiting')
      .in('class_id', classIdsForShow);
    if (error) throw error;
  },
});
```

**Step 3: Commit**

```bash
git add apps/myk9show/src/pages/secretary/WaitListPage/ apps/myk9show/src/hooks/mutations/
git commit -m "feat: add show-day wait list close action for secretary"
```

### Task 19: Typecheck and lint

**Step 1: Run typecheck**

Run: `pnpm typecheck`

Fix any type errors introduced by the new code.

**Step 2: Run lint**

Run: `pnpm lint`

Fix any lint issues.

**Step 3: Run all tests**

Run: `cd apps/myk9show && pnpm test`

Verify no regressions.

**Step 4: Commit fixes**

```bash
git commit -m "fix: resolve type and lint issues from wait list feature"
```

---

## Phase 10: Database Push & Deploy

### Task 20: Push migration and deploy edge functions

**Step 1: Push migration 110**

Run: `npx supabase db push --db-url "postgresql://postgres.sojmvhhwsjxmfistvzbe:$PASSWORD@aws-1-us-east-2.pooler.supabase.com:5432/postgres"`

**Step 2: Deploy edge functions**

Run:
```bash
npx supabase functions deploy push-trigger-waitlist --no-verify-jwt
npx supabase functions deploy waitlist-check-deadlines --no-verify-jwt
```

**Step 3: Regenerate Supabase types**

Run: `npx supabase gen types typescript --project-id sojmvhhwsjxmfistvzbe > apps/myk9show/src/types/supabase.ts`

**Step 4: Commit**

```bash
git add apps/myk9show/src/types/supabase.ts
git commit -m "chore: regenerate Supabase types after migration 110"
```
