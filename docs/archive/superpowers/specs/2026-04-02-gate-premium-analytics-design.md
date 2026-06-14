# Gate Premium Analytics Behind Subscription

**Date:** 2026-04-02
**Status:** Design approved

## Goal

Gate three analytics sections behind the existing `performance_stats` premium feature so free users see summary stats and result distribution (basic "how did I do"), while premium sections are locked with an upgrade prompt. Include a shows-based free trial: users get premium analytics free for their first 3 shows with scored results.

## What Stays Free

- **StatsSummaryCards** — the 4 stat cards (total entries, Q rate, best time, average time)
- **ResultDistributionChart** — pie chart showing Q/NQ/EX/ABS/WD breakdown
- **MyShowStatsTab** on ShowDetailsPage — per-show stats remain completely free (no changes)
- Page shell, header, filter controls, empty/loading states

## What Gets Gated

Each wrapped individually with `<FeatureGate feature="performance_stats">`:

1. **QualificationTrendChart** — "Am I improving?" trend line across shows
2. **DogBreakdownCards** — per-dog performance breakdown
3. **FastestTimesTable** — top 10 fastest qualified runs with medals

When locked, each section renders the existing `FeatureUpgradePrompt` (lock card with upgrade dialog). No custom fallbacks needed.

## Shows-Based Free Trial

**Rule:** Users with <= 3 distinct shows containing at least one scored entry get premium analytics free, even without a paid subscription. A "scored entry" is any entry where `resultText` is not `'pending'` (i.e., Q, NQ, EX, ABS, or WD). Three shows gives enough data for the trend chart to form and for exhibitors to see value before gating.

**Computation:** Client-side, derived from data already fetched by `useMyLifetimeStats()`:

```typescript
const scoredShowCount = useMemo(() => {
  const showIds = new Set(allEntries.filter(e => e.resultText !== 'pending').map(e => e.showId));
  return showIds.size;
}, [allEntries]);
```

## useSubscriptionGate Changes

Extend the hook to accept an optional trial context:

```typescript
interface SubscriptionGateOptions {
  trialShowCount?: number;
}

export function useSubscriptionGate(options?: SubscriptionGateOptions) {
  const { profile, isLoading } = useExhibitorProfile();

  const rawTier: PlanType = profile?.subscription_tier ?? 'free';
  const expiresAt = profile?.subscription_expires_at;
  const isExpired = rawTier === 'premium' && expiresAt ? new Date(expiresAt) < new Date() : false;
  const paidTier: PlanType = isExpired ? 'free' : rawTier;
  const isPaidPremium = paidTier === 'premium';

  const TRIAL_SHOW_LIMIT = 3;
  const isInTrial =
    !isPaidPremium &&
    options?.trialShowCount !== undefined &&
    options.trialShowCount <= TRIAL_SHOW_LIMIT;

  const tier: PlanType = isPaidPremium ? 'premium' : isInTrial ? 'premium' : 'free';

  return { tier, isPremium: tier === 'premium', isExpired, isInTrial, isLoading } as const;
}
```

Key points:

- Trial only activates when `trialShowCount` is provided (opt-in per caller)
- Returns `isInTrial` so UI can show trial messaging
- Existing callers that don't pass options are unaffected

## AnalyticsPage Layout Changes

Current layout renders everything in a flat `space-y-6` div with a 2-col grid for pie chart + dog breakdown.

New visual order:

1. Summary cards (free)
2. Result distribution pie chart (free, **full width** — moved out of the 2-col grid)
3. Qualification trend chart (gated)
4. Dog breakdown cards (gated)
5. Fastest times table (gated)

The pie chart moves to full width because its former grid partner (DogBreakdownCards) is gated and would create an awkward half-empty layout when locked.

## Trial Banner

When `isInTrial` is true, render a subtle inline banner below the page header:

> "You're exploring Premium Analytics free for your first 3 shows. You've used N of 3."

- Muted styling, not a toast or modal
- Includes "Learn more" link to `/pricing-page`
- Only shows during active trial (`isInTrial && tier === 'premium'`)
- No banner for paid premium subscribers
- No banner when gated (UpgradeCards speak for themselves)

## Scope Boundaries — What We're NOT Doing

- No new DB tables, columns, or migrations
- No changes to MyShowStatsTab (per-show stats stay free)
- No new feature types in featureUtils.ts (reuse `performance_stats` for all 3 sections)
- No Stripe integration changes (existing upgrade flow)
- No changes to FeatureGate component itself
- No server-side gating (UI-only, acceptable for analytics display)

## Testing

- `useSubscriptionGate` — unit tests for: paid premium, expired premium, free with trial (0-3 shows), free past trial (4+ shows), no options passed (backward compat)
- `AnalyticsPage` — integration tests for: free user sees summary + pie but gated sections show UpgradeCards, trial user sees all sections + trial banner, premium user sees all sections without banner, trial banner shows correct count
