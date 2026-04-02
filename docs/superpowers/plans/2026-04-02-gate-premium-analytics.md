# Gate Premium Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate three analytics sections (QualificationTrendChart, DogBreakdownCards, FastestTimesTable) behind the `performance_stats` premium feature with a shows-based free trial (first 3 scored shows).

**Architecture:** Extend `useSubscriptionGate` with an optional `trialShowCount` parameter. AnalyticsPage computes the count from existing `useMyLifetimeStats` data and passes it to the hook. Three sections are wrapped individually with `<FeatureGate>`. A trial banner shows remaining free shows.

**Tech Stack:** React, TypeScript, Vitest, existing FeatureGate/useSubscriptionGate infrastructure

**Spec:** `docs/superpowers/specs/2026-04-02-gate-premium-analytics-design.md`

---

## File Map

| Action | File                                                            | Responsibility                                                   |
| ------ | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| Modify | `apps/myk9show/src/hooks/useSubscriptionGate.ts`                | Add optional `trialShowCount` param, `isInTrial` return          |
| Create | `apps/myk9show/src/hooks/__tests__/useSubscriptionGate.test.ts` | Unit tests for hook with trial logic                             |
| Modify | `apps/myk9show/src/pages/AnalyticsPage.tsx`                     | Wrap sections with FeatureGate, add trial banner, reorder layout |
| Modify | `apps/myk9show/src/pages/__tests__/AnalyticsPage.test.tsx`      | Integration tests for gating and trial states                    |

---

### Task 1: useSubscriptionGate — Write Failing Tests

**Files:**

- Create: `apps/myk9show/src/hooks/__tests__/useSubscriptionGate.test.ts`

- [ ] **Step 1: Create test file with all test cases**

```typescript
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseExhibitorProfile =
  vi.fn<() => { profile: Record<string, unknown> | null; isLoading: boolean }>();

vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => mockUseExhibitorProfile(),
}));

import { useSubscriptionGate } from '../useSubscriptionGate';

describe('useSubscriptionGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('existing behavior (no options)', () => {
    it('returns free tier when profile has no subscription', () => {
      mockUseExhibitorProfile.mockReturnValue({
        profile: { subscription_tier: 'free', subscription_expires_at: null },
        isLoading: false,
      });

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.tier).toBe('free');
      expect(result.current.isPremium).toBe(false);
      expect(result.current.isExpired).toBe(false);
      expect(result.current.isInTrial).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });

    it('returns premium tier for active premium subscriber', () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      mockUseExhibitorProfile.mockReturnValue({
        profile: { subscription_tier: 'premium', subscription_expires_at: futureDate },
        isLoading: false,
      });

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.tier).toBe('premium');
      expect(result.current.isPremium).toBe(true);
      expect(result.current.isExpired).toBe(false);
      expect(result.current.isInTrial).toBe(false);
    });

    it('downgrades expired premium to free', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      mockUseExhibitorProfile.mockReturnValue({
        profile: { subscription_tier: 'premium', subscription_expires_at: pastDate },
        isLoading: false,
      });

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.tier).toBe('free');
      expect(result.current.isPremium).toBe(false);
      expect(result.current.isExpired).toBe(true);
      expect(result.current.isInTrial).toBe(false);
    });

    it('returns free tier when profile is null', () => {
      mockUseExhibitorProfile.mockReturnValue({
        profile: null,
        isLoading: false,
      });

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.tier).toBe('free');
      expect(result.current.isPremium).toBe(false);
    });
  });

  describe('trial logic (with trialShowCount)', () => {
    it('grants premium via trial when user has 0 scored shows', () => {
      mockUseExhibitorProfile.mockReturnValue({
        profile: { subscription_tier: 'free', subscription_expires_at: null },
        isLoading: false,
      });

      const { result } = renderHook(() => useSubscriptionGate({ trialShowCount: 0 }));

      expect(result.current.tier).toBe('premium');
      expect(result.current.isPremium).toBe(true);
      expect(result.current.isInTrial).toBe(true);
    });

    it('grants premium via trial when user has exactly 3 scored shows', () => {
      mockUseExhibitorProfile.mockReturnValue({
        profile: { subscription_tier: 'free', subscription_expires_at: null },
        isLoading: false,
      });

      const { result } = renderHook(() => useSubscriptionGate({ trialShowCount: 3 }));

      expect(result.current.tier).toBe('premium');
      expect(result.current.isPremium).toBe(true);
      expect(result.current.isInTrial).toBe(true);
    });

    it('does NOT grant trial when user has 4+ scored shows', () => {
      mockUseExhibitorProfile.mockReturnValue({
        profile: { subscription_tier: 'free', subscription_expires_at: null },
        isLoading: false,
      });

      const { result } = renderHook(() => useSubscriptionGate({ trialShowCount: 4 }));

      expect(result.current.tier).toBe('free');
      expect(result.current.isPremium).toBe(false);
      expect(result.current.isInTrial).toBe(false);
    });

    it('does NOT activate trial for paid premium subscribers', () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      mockUseExhibitorProfile.mockReturnValue({
        profile: { subscription_tier: 'premium', subscription_expires_at: futureDate },
        isLoading: false,
      });

      const { result } = renderHook(() => useSubscriptionGate({ trialShowCount: 1 }));

      expect(result.current.tier).toBe('premium');
      expect(result.current.isPremium).toBe(true);
      expect(result.current.isInTrial).toBe(false);
    });

    it('does NOT activate trial for expired premium (falls through to free)', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      mockUseExhibitorProfile.mockReturnValue({
        profile: { subscription_tier: 'premium', subscription_expires_at: pastDate },
        isLoading: false,
      });

      const { result } = renderHook(() => useSubscriptionGate({ trialShowCount: 1 }));

      expect(result.current.tier).toBe('premium');
      expect(result.current.isPremium).toBe(true);
      expect(result.current.isInTrial).toBe(true);
      expect(result.current.isExpired).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/hooks/__tests__/useSubscriptionGate.test.ts`

Expected: Multiple failures — `isInTrial` is not returned by the current hook, trial logic doesn't exist yet.

- [ ] **Step 3: Commit failing tests**

```bash
git add apps/myk9show/src/hooks/__tests__/useSubscriptionGate.test.ts
git commit -m "test: add useSubscriptionGate tests for trial logic"
```

---

### Task 2: useSubscriptionGate — Implement Trial Logic

**Files:**

- Modify: `apps/myk9show/src/hooks/useSubscriptionGate.ts`

- [ ] **Step 1: Replace useSubscriptionGate.ts with trial-aware version**

Replace the full contents of `apps/myk9show/src/hooks/useSubscriptionGate.ts` with:

```typescript
import { useExhibitorProfile } from './useExhibitorProfile';
import type { PlanType } from '@/components/subscription/featureUtils';

const TRIAL_SHOW_LIMIT = 3;

export interface SubscriptionGateOptions {
  /** Number of distinct shows where the user has at least one scored entry. */
  trialShowCount?: number;
}

/**
 * Hook to check current subscription tier with expiration and trial awareness.
 * Returns the effective tier (downgrades to 'free' if expired, upgrades to
 * 'premium' during shows-based trial) and convenience booleans.
 *
 * Usage:
 *   const { isPremium, isExpired, tier } = useSubscriptionGate();
 *   const { isPremium, isInTrial } = useSubscriptionGate({ trialShowCount: 2 });
 */
export function useSubscriptionGate(options?: SubscriptionGateOptions) {
  const { profile, isLoading } = useExhibitorProfile();

  const rawTier: PlanType = profile?.subscription_tier ?? 'free';
  const expiresAt = profile?.subscription_expires_at;

  const isExpired = rawTier === 'premium' && expiresAt ? new Date(expiresAt) < new Date() : false;

  const paidTier: PlanType = isExpired ? 'free' : rawTier;
  const isPaidPremium = paidTier === 'premium';

  const isInTrial =
    !isPaidPremium &&
    options?.trialShowCount !== undefined &&
    options.trialShowCount <= TRIAL_SHOW_LIMIT;

  const tier: PlanType = isPaidPremium ? 'premium' : isInTrial ? 'premium' : 'free';

  return { tier, isPremium: tier === 'premium', isExpired, isInTrial, isLoading } as const;
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/hooks/__tests__/useSubscriptionGate.test.ts`

Expected: All tests pass.

- [ ] **Step 3: Run typecheck to confirm backward compatibility**

Run: `cd apps/myk9show && npx tsc --noEmit`

Expected: No errors. Existing callers in `AskQPanel.tsx` and `DogDetailsTabs.tsx` call `useSubscriptionGate()` with no arguments and destructure `{ isPremium }` — fully compatible.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/hooks/useSubscriptionGate.ts
git commit -m "feat: add shows-based trial logic to useSubscriptionGate"
```

---

### Task 3: AnalyticsPage — Write Failing Tests for Gating

**Files:**

- Modify: `apps/myk9show/src/pages/__tests__/AnalyticsPage.test.tsx`

The existing test file mocks `useMyLifetimeStats` but not `useSubscriptionGate`. We need to add a mock for `useSubscriptionGate` and add test cases for the three gating states.

- [ ] **Step 1: Add useSubscriptionGate mock and gating tests**

Add to the mocks section of `apps/myk9show/src/pages/__tests__/AnalyticsPage.test.tsx`, after the existing `mockUseMyLifetimeStats` mock:

```typescript
const mockUseSubscriptionGate = vi.fn<
  (options?: { trialShowCount?: number }) => {
    tier: 'free' | 'premium';
    isPremium: boolean;
    isExpired: boolean;
    isInTrial: boolean;
    isLoading: boolean;
  }
>();

vi.mock('@/hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: (options?: { trialShowCount?: number }) => mockUseSubscriptionGate(options),
}));
```

Update the `beforeEach` to set a default return value for the new mock:

```typescript
beforeEach(() => {
  vi.clearAllMocks();
  mockUseSubscriptionGate.mockReturnValue({
    tier: 'premium',
    isPremium: true,
    isExpired: false,
    isInTrial: false,
    isLoading: false,
  });
});
```

Add a new `describe` block after the existing tests:

```typescript
describe('premium gating', () => {
  it('shows all sections for premium subscribers', () => {
    mockUseMyLifetimeStats.mockReturnValue({ data: mockEntries, isLoading: false });
    mockUseSubscriptionGate.mockReturnValue({
      tier: 'premium',
      isPremium: true,
      isExpired: false,
      isInTrial: false,
      isLoading: false,
    });

    render(<AnalyticsPage />, { initialRoute: '/analytics' });

    // Free sections visible
    expect(screen.getByText('Entries')).toBeInTheDocument();

    // Gated sections visible (not locked)
    expect(screen.getAllByText('Rex').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Upgrade Now')).not.toBeInTheDocument();
  });

  it('shows upgrade cards for free users past trial', () => {
    mockUseMyLifetimeStats.mockReturnValue({ data: mockEntries, isLoading: false });
    mockUseSubscriptionGate.mockReturnValue({
      tier: 'free',
      isPremium: false,
      isExpired: false,
      isInTrial: false,
      isLoading: false,
    });

    render(<AnalyticsPage />, { initialRoute: '/analytics' });

    // Free sections still visible
    expect(screen.getByText('Entries')).toBeInTheDocument();

    // Gated sections replaced with upgrade prompts
    const upgradeButtons = screen.getAllByText('Upgrade Now');
    expect(upgradeButtons.length).toBe(3);
  });

  it('shows all sections for trial users with trial banner', () => {
    mockUseMyLifetimeStats.mockReturnValue({ data: mockEntries, isLoading: false });
    mockUseSubscriptionGate.mockReturnValue({
      tier: 'premium',
      isPremium: true,
      isExpired: false,
      isInTrial: true,
      isLoading: false,
    });

    render(<AnalyticsPage />, { initialRoute: '/analytics' });

    // All sections visible
    expect(screen.getByText('Entries')).toBeInTheDocument();
    expect(screen.getAllByText('Rex').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Upgrade Now')).not.toBeInTheDocument();

    // Trial banner visible
    expect(screen.getByText(/exploring Premium Analytics free/)).toBeInTheDocument();
    expect(screen.getByText('Learn more')).toBeInTheDocument();
  });

  // [ADDED] Trial banner should not appear on empty state
  it('does not show trial banner when there is no data', () => {
    mockUseMyLifetimeStats.mockReturnValue({ data: [], isLoading: false });
    mockUseSubscriptionGate.mockReturnValue({
      tier: 'premium',
      isPremium: true,
      isExpired: false,
      isInTrial: true,
      isLoading: false,
    });

    render(<AnalyticsPage />, { initialRoute: '/analytics' });

    expect(screen.getByText('No Analytics Yet')).toBeInTheDocument();
    expect(screen.queryByText(/exploring Premium Analytics free/)).not.toBeInTheDocument();
  });

  it('does not show trial banner for paid premium users', () => {
    mockUseMyLifetimeStats.mockReturnValue({ data: mockEntries, isLoading: false });
    mockUseSubscriptionGate.mockReturnValue({
      tier: 'premium',
      isPremium: true,
      isExpired: false,
      isInTrial: false,
      isLoading: false,
    });

    render(<AnalyticsPage />, { initialRoute: '/analytics' });

    expect(screen.queryByText(/exploring Premium Analytics free/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `cd apps/myk9show && npx vitest run src/pages/__tests__/AnalyticsPage.test.tsx`

Expected: New gating tests fail (AnalyticsPage doesn't import `useSubscriptionGate` or `FeatureGate` yet). Existing tests should still pass because the mock defaults to premium.

- [ ] **Step 3: Commit failing tests**

```bash
git add apps/myk9show/src/pages/__tests__/AnalyticsPage.test.tsx
git commit -m "test: add AnalyticsPage gating and trial banner tests"
```

---

### Task 4: AnalyticsPage — Implement Gating and Trial Banner

**Files:**

- Modify: `apps/myk9show/src/pages/AnalyticsPage.tsx`

- [ ] **Step 1: Add imports for gating**

Add these imports to the top of `apps/myk9show/src/pages/AnalyticsPage.tsx`:

```typescript
import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';
import { FeatureGate } from '@/components/subscription/FeatureGate';
import { Link } from 'react-router-dom';
```

- [ ] **Step 2: Add scored show count computation and subscription gate call**

Add after the `trend` useMemo (line 77) and before the `useTrackSectionView` calls (line 79):

```typescript
const scoredShowCount = useMemo(() => {
  const showIds = new Set(allEntries.filter(e => e.resultText !== 'pending').map(e => e.showId));
  return showIds.size;
}, [allEntries]);

const { tier, isInTrial } = useSubscriptionGate({ trialShowCount: scoredShowCount });
```

- [ ] **Step 3: Add trial banner after PageHeader**

Add between the `<PageHeader>` closing tag and the `{isLoading && ...}` block. Replace the existing block at lines 118-161 with:

```tsx
return (
  <PageShell>
    <PageHeader
      breadcrumbs={[{ label: 'My Analytics', href: '/analytics' }]}
      title="My Analytics"
      actions={filterControls}
    />

    {/* [EXPANDED] Only show trial banner when user has data — avoids banner above empty state */}
    {isInTrial && hasData && (
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        You&apos;re exploring Premium Analytics free for your first 3 shows. You&apos;ve used{' '}
        {scoredShowCount} of 3.{' '}
        <Link to="/pricing-page" className="font-medium underline">
          Learn more
        </Link>
      </div>
    )}

    {isLoading && <StatsSummaryCardsSkeleton />}

    {!isLoading && !hasData && (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <BarChart3 className="h-16 w-16 text-muted-foreground/40 mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Analytics Yet</h2>
        <p className="text-muted-foreground max-w-md">
          Enter shows and get scored to see your performance analytics here.
        </p>
      </div>
    )}

    {!isLoading && hasFilteredData && (
      <div ref={pageRef} className="space-y-6">
        <StatsSummaryCards stats={summary} />

        <ResultDistributionChart data={distribution} />

        {/* [EXPANDED] FeatureGate wraps outside conditionals so free users always
            see 3 upgrade cards regardless of data shape */}
        <FeatureGate feature="performance_stats" userPlan={tier}>
          {trend.length > 1 && (
            <div ref={trendRef}>
              <QualificationTrendChart data={trend} />
            </div>
          )}
        </FeatureGate>

        <FeatureGate feature="performance_stats" userPlan={tier}>
          <div ref={dogBreakdownRef}>
            <DogBreakdownCards dogs={dogStats} onDogClick={dogId => navigate(`/dogs/${dogId}`)} />
          </div>
        </FeatureGate>

        <FeatureGate feature="performance_stats" userPlan={tier}>
          {fastestTimes.length > 0 && (
            <div ref={fastestTimesRef}>
              <FastestTimesTable times={fastestTimes} showShowColumn />
            </div>
          )}
        </FeatureGate>
      </div>
    )}
  </PageShell>
);
```

Key changes from original:

- `ResultDistributionChart` moved out of the 2-col grid to full width
- `QualificationTrendChart`, `DogBreakdownCards`, `FastestTimesTable` each wrapped in `<FeatureGate>`
- `[EXPANDED]` FeatureGate wraps outside data conditionals (`trend.length > 1`, `fastestTimes.length > 0`) so free users always see 3 upgrade cards regardless of data shape
- `[EXPANDED]` Trial banner conditioned on `isInTrial && hasData` to avoid showing above empty state
- `Link` used for "Learn more" instead of raw anchor

- [ ] **Step 4: Run all AnalyticsPage tests**

Run: `cd apps/myk9show && npx vitest run src/pages/__tests__/AnalyticsPage.test.tsx`

Expected: All tests pass (existing + new gating tests).

- [ ] **Step 5: Run full typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/pages/AnalyticsPage.tsx
git commit -m "feat: gate premium analytics sections with shows-based trial"
```

---

### Task 5: Final Verification

- [ ] **Step 1: Run the full test suite**

Run: `cd apps/myk9show && npx vitest run`

Expected: All tests pass. No regressions.

- [ ] **Step 2: Run lint**

Run: `cd apps/myk9show && npx eslint src/hooks/useSubscriptionGate.ts src/pages/AnalyticsPage.tsx src/hooks/__tests__/useSubscriptionGate.test.ts src/pages/__tests__/AnalyticsPage.test.tsx`

Expected: No errors.

- [ ] **Step 3: Run dev server and visually verify**

Run: `pnpm dev:show`

Verify at `http://localhost:5173/analytics`:

- Free user (no subscription): summary cards + pie chart visible, 3 upgrade cards for trend/dogs/times
- User with <= 3 scored shows: all sections visible + blue trial banner with show count
- Premium subscriber: all sections visible, no banner

- [ ] **Step 4: Commit any lint/format fixes if needed**

```bash
git add -u
git commit -m "chore: lint and format fixes for analytics gating"
```
