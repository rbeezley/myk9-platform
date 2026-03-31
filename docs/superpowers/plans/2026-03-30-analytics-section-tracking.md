# Analytics Section Usage Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track which future-premium analytics sections users scroll into view, storing events in a Supabase table so admins can query section popularity before gating.

**Architecture:** A Supabase `analytics_events` table with RLS (insert=authenticated, select=admin). A `useTrackSectionView` React hook uses IntersectionObserver to fire a single insert per section per page session. Four refs wired to AnalyticsPage section wrappers.

**Tech Stack:** Supabase (Postgres, RLS), React (hooks, refs), IntersectionObserver API, Vitest

**Spec:** `docs/superpowers/specs/2026-03-30-analytics-section-tracking-design.md`

---

## File Map

| Action | Path                                                            | Responsibility       |
| ------ | --------------------------------------------------------------- | -------------------- |
| Create | `supabase/migrations/096_analytics_events.sql`                  | Table, RLS, index    |
| Create | `apps/myk9show/src/hooks/useTrackSectionView.ts`                | Hook + constants     |
| Create | `apps/myk9show/src/hooks/__tests__/useTrackSectionView.test.ts` | Hook tests           |
| Modify | `apps/myk9show/src/pages/AnalyticsPage.tsx`                     | Wire 4 tracking refs |

---

### Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/096_analytics_events.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 096_analytics_events.sql
-- Lightweight analytics event tracking for section usage

CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  section_name text NOT NULL,
  page text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for "which sections are popular" queries
CREATE INDEX idx_analytics_events_section_created
  ON analytics_events (section_name, created_at);

-- RLS: append-only for authenticated users, read-only for site_admin
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own events"
  ON analytics_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Site admins can read all events"
  ON analytics_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND r.name = 'site_admin'
    )
  );
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/096_analytics_events.sql
git commit -m "feat(analytics): add analytics_events table with RLS (migration 096)"
```

---

### Task 2: Write Hook Tests

**Files:**

- Create: `apps/myk9show/src/hooks/__tests__/useTrackSectionView.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useTrackSectionView,
  TRACKED_SECTIONS,
  _resetTrackedSections,
} from '../useTrackSectionView';

// Mock supabase
const mockInsert = vi.fn(() => Promise.resolve({ error: null }));
const mockFrom = vi.fn(() => ({ insert: mockInsert }));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mockFrom },
}));

// Mock useAuth — default: authenticated user
const mockUser = { id: 'user-123' };
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: mockUser })),
}));

// Mock react-router useLocation
let mockPathname = '/analytics';
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useLocation: vi.fn(() => ({ pathname: mockPathname })),
  };
});

// IntersectionObserver mock
type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;
let observerCallback: ObserverCallback;
let observerDisconnect: ReturnType<typeof vi.fn>;

beforeEach(() => {
  observerDisconnect = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn((callback: ObserverCallback) => {
      observerCallback = callback;
      return {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: observerDisconnect,
      };
    })
  );
  mockFrom.mockClear();
  mockInsert.mockClear();
  _resetTrackedSections();
  mockPathname = '/analytics';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useTrackSectionView', () => {
  it('inserts an event on first intersection', () => {
    const { result } = renderHook(() =>
      useTrackSectionView(TRACKED_SECTIONS.QUALIFICATION_TREND, 'analytics')
    );

    // Simulate element becoming visible
    act(() => {
      observerCallback([{ isIntersecting: true, intersectionRatio: 0.5 }]);
    });

    expect(mockFrom).toHaveBeenCalledWith('analytics_events');
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-123',
      event_type: 'section_view',
      section_name: 'qualification_trend_chart',
      page: 'analytics',
      metadata: null,
    });
    // Ref should be defined
    expect(result.current.current).toBeNull(); // ref not attached to DOM in test
  });

  it('deduplicates — second intersection does not insert', () => {
    renderHook(() => useTrackSectionView(TRACKED_SECTIONS.QUALIFICATION_TREND, 'analytics'));

    act(() => {
      observerCallback([{ isIntersecting: true, intersectionRatio: 0.5 }]);
    });
    act(() => {
      observerCallback([{ isIntersecting: true, intersectionRatio: 0.5 }]);
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('does not insert when not intersecting', () => {
    renderHook(() => useTrackSectionView(TRACKED_SECTIONS.DOG_BREAKDOWN, 'analytics'));

    act(() => {
      observerCallback([{ isIntersecting: false, intersectionRatio: 0 }]);
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('does not fire when ref is never attached to a DOM element', () => {
    renderHook(() => useTrackSectionView(TRACKED_SECTIONS.QUALIFICATION_TREND, 'analytics'));

    // No intersection callback possible — observer never observes a real element
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('no-ops for unauthenticated users', async () => {
    const { useAuth } = await import('@/hooks/useAuth');
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      resetPassword: vi.fn(),
      updatePassword: vi.fn(),
      updateProfile: vi.fn(),
    } as ReturnType<typeof useAuth>);

    renderHook(() => useTrackSectionView(TRACKED_SECTIONS.FASTEST_TIMES, 'analytics'));

    act(() => {
      observerCallback([{ isIntersecting: true, intersectionRatio: 0.5 }]);
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('resets tracking set when pathname changes', () => {
    const { rerender } = renderHook(() =>
      useTrackSectionView(TRACKED_SECTIONS.QUALIFICATION_TREND, 'analytics')
    );

    // First view
    act(() => {
      observerCallback([{ isIntersecting: true, intersectionRatio: 0.5 }]);
    });
    expect(mockInsert).toHaveBeenCalledTimes(1);

    // Navigate away and back
    mockPathname = '/dogs';
    rerender();
    mockPathname = '/analytics';
    rerender();

    // Should track again after navigation
    act(() => {
      observerCallback([{ isIntersecting: true, intersectionRatio: 0.5 }]);
    });
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it('disconnects observer on unmount', () => {
    const { unmount } = renderHook(() =>
      useTrackSectionView(TRACKED_SECTIONS.LIFETIME_PAGE, 'analytics')
    );

    unmount();

    expect(observerDisconnect).toHaveBeenCalled();
  });

  it('exports all tracked section constants', () => {
    expect(TRACKED_SECTIONS).toEqual({
      QUALIFICATION_TREND: 'qualification_trend_chart',
      DOG_BREAKDOWN: 'dog_breakdown_cards',
      FASTEST_TIMES: 'fastest_times_table',
      LIFETIME_PAGE: 'lifetime_analytics_page',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/myk9show && npx vitest run src/hooks/__tests__/useTrackSectionView.test.ts
```

Expected: FAIL — module `../useTrackSectionView` does not exist yet.

- [ ] **Step 3: Commit failing tests**

```bash
git add apps/myk9show/src/hooks/__tests__/useTrackSectionView.test.ts
git commit -m "test(analytics): add useTrackSectionView tests (red)"
```

---

### Task 3: Implement the Hook

**Files:**

- Create: `apps/myk9show/src/hooks/useTrackSectionView.ts`

- [ ] **Step 1: Write the hook**

```typescript
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/services/database/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/services/LoggingService';

export const TRACKED_SECTIONS = {
  QUALIFICATION_TREND: 'qualification_trend_chart',
  DOG_BREAKDOWN: 'dog_breakdown_cards',
  FASTEST_TIMES: 'fastest_times_table',
  LIFETIME_PAGE: 'lifetime_analytics_page',
} as const;

/** Module-level set for one-per-session dedup. Keyed by `page:sectionName`. */
let trackedKeys = new Set<string>();
let lastPathname = '';

/** Exported for test cleanup only. */
export function _resetTrackedSections() {
  trackedKeys = new Set();
  lastPathname = '';
}

/**
 * Tracks when a section scrolls into view (50% visible).
 * Fires one Supabase insert per section per page session.
 * No-ops for unauthenticated users. Fire-and-forget — non-critical telemetry.
 */
export function useTrackSectionView(
  sectionName: string,
  page: string
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const { user } = useAuth();
  const { pathname } = useLocation();

  // Reset tracked set on navigation
  useEffect(() => {
    if (pathname !== lastPathname) {
      trackedKeys = new Set();
      lastPathname = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    const element = ref.current;
    if (!element || !user) return;

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const key = `${page}:${sectionName}`;
          if (trackedKeys.has(key)) continue;

          trackedKeys.add(key);
          observer.disconnect();

          supabase
            .from('analytics_events')
            .insert({
              user_id: user.id,
              event_type: 'section_view',
              section_name: sectionName,
              page,
              metadata: null,
            })
            .then(({ error }) => {
              if (error) {
                logger.debug('Analytics event insert failed', 'analytics', {
                  sectionName,
                  page,
                  error: error.message,
                });
              }
            });

          break;
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [user, sectionName, page]);

  return ref;
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd apps/myk9show && npx vitest run src/hooks/__tests__/useTrackSectionView.test.ts
```

Expected: All 8 tests PASS.

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/hooks/useTrackSectionView.ts
git commit -m "feat(analytics): implement useTrackSectionView hook"
```

---

### Task 4: Wire Tracking Refs to AnalyticsPage

**Files:**

- Modify: `apps/myk9show/src/pages/AnalyticsPage.tsx`

- [ ] **Step 1: Add imports**

At the top of `AnalyticsPage.tsx`, add after the existing imports:

```typescript
import { useTrackSectionView, TRACKED_SECTIONS } from '@/hooks/useTrackSectionView';
```

- [ ] **Step 2: Add ref hooks inside the component**

Inside `AnalyticsPage()`, after the existing `useMemo` calls (after line 88), add:

```typescript
const pageRef = useTrackSectionView(TRACKED_SECTIONS.LIFETIME_PAGE, 'analytics');
const trendRef = useTrackSectionView(TRACKED_SECTIONS.QUALIFICATION_TREND, 'analytics');
const dogBreakdownRef = useTrackSectionView(TRACKED_SECTIONS.DOG_BREAKDOWN, 'analytics');
const fastestTimesRef = useTrackSectionView(TRACKED_SECTIONS.FASTEST_TIMES, 'analytics');
```

- [ ] **Step 3: Attach refs to JSX elements**

Apply these changes to the JSX return block:

1. Outer `<div className="space-y-6">` (line 145) — add `ref={pageRef}`:

```tsx
<div ref={pageRef} className="space-y-6">
```

2. QualificationTrendChart (line 148) — wrap with ref div:

```tsx
{
  trend.length > 1 && (
    <div ref={trendRef}>
      <QualificationTrendChart data={trend} />
    </div>
  );
}
```

3. DogBreakdownCards (lines 152-155) — wrap with ref div:

```tsx
<div ref={dogBreakdownRef}>
  <DogBreakdownCards dogs={dogStats} onDogClick={dogId => navigate(`/dogs/${dogId}`)} />
</div>
```

4. FastestTimesTable (lines 158-160) — wrap with ref div:

```tsx
{
  fastestTimes.length > 0 && (
    <div ref={fastestTimesRef}>
      <FastestTimesTable times={fastestTimes} showShowColumn />
    </div>
  );
}
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: No new errors.

- [ ] **Step 5: Run existing AnalyticsPage tests (if any) to verify no regressions**

```bash
cd apps/myk9show && npx vitest run src/pages --reporter=verbose 2>&1 | head -40
```

Expected: No new failures.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/pages/AnalyticsPage.tsx
git commit -m "feat(analytics): wire section tracking refs to AnalyticsPage"
```

---

### Task 5: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
cd apps/myk9show && pnpm test
```

Expected: All tests pass, including the 8 new `useTrackSectionView` tests.

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

Expected: Clean.

- [ ] **Step 3: Update TO-DOS.md**

Mark the "Add analytics section usage tracking" item as done with a summary:

```
- [x] **Add analytics section usage tracking** — Done: ...
```
