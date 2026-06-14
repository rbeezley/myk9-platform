# Exhibitor Analytics — Design Document

**Date:** 2026-03-29
**Status:** Approved
**Scope:** Port trial statistics from myK9Q to myK9Show, reimagined for exhibitors

---

## Overview

Replace the mock-data `AnalyticsDashboard` with real exhibitor-focused analytics. Two entry points, one shared component library:

- **Show-scoped view** — "My Stats" tab on `ShowDetailsPage`, visible when the user has entries in that show
- **Lifetime view** — rebuilt `AnalyticsPage` at `/analytics` with cross-show trends

## Audience

Exhibitors viewing their own competition performance. Not staff/secretary aggregate analytics (that's a separate future feature).

## Page Structure & Routing

### Show-scoped: "My Stats" tab

Added to `ShowDetailsPage` tab config array, conditionally visible when the current user has entries in the show. Uses existing `PrimaryTabs` system.

```typescript
{ id: 'my-stats', label: 'My Stats', icon: BarChart3, visible: myEntries.length > 0 }
```

### Lifetime: `/analytics` page

Replaces the current mock `AnalyticsPage`. Route and sidebar entry stay as-is. Feature gate (`FeatureGate`/`useSubscriptionGate`) removed — basic stats for your own entries should not be gated.

## Data Layer

### Queries

One React Query hook per scope, querying `view_entry_with_results` which already joins entries with dogs, classes, and result status.

**`useMyShowStats(showId)`** — all entries for the current user in a given show. Filters by `user_id` and `show_id`.

**`useMyLifetimeStats()`** — all entries for the current user across all shows. Joins with `shows` table to get show name, date, and organization.

### Client-side computation

Stats computed in `useMemo` from raw entry rows. Entry counts per user are small (tens to low hundreds), so client-side aggregation is fast and avoids new Postgres views or RPCs.

**Shared helpers** in `src/components/analytics/analytics-utils.ts`:

| Helper | Purpose |
|--------|---------|
| `computeSummaryStats(entries)` | Totals, Q rate, time stats |
| `computePerDogStats(entries)` | Grouped by `dog_id` |
| `computeResultDistribution(entries)` | Counts per result status |
| `computeFastestTimes(entries, limit)` | Sorted by raw time |
| `computeQualificationTrend(entries)` | Grouped by show date (lifetime only) |
| `findCleanSweepDogs(entries)` | Dogs with 100% Q across all entries |

**Query keys:** `queryKeys.myShowStats(showId)`, `queryKeys.myLifetimeStats()`

### No new database objects

No views, RPCs, or migrations. Everything computed client-side from existing `view_entry_with_results` rows.

## Shared Visualization Components

All in `src/components/analytics/`. Recharts already a dependency.

### `StatsSummaryCards`

4 `StatCard` components (from `@myk9/ui`) in a responsive grid:

| Card | Value | Subtitle |
|------|-------|----------|
| Entries | Total count | "X of Y scored" |
| Qualification Rate | Percentage | "X of Y qualified" |
| Best Time | MM:SS.HH | Dog name |
| Average Time | MM:SS.HH | Median time |

### `ResultDistributionChart`

Recharts `PieChart`. Segments: Qualified (green), NQ (red), Excused (amber), Absent (purple). Clickable segments to highlight. Same color scheme as myK9Q.

### `DogBreakdownCards`

Grid of cards, one per dog. Each shows: dog name, entries count, Q rate, best time, avg time. Gold trophy badge if 100% qualified (clean sweep). Clickable to navigate to dog profile.

### `FastestTimesTable`

Ranked table. Columns: rank (medal icons top 3), dog name, class (element + level), time. 10 rows for show view, 20 for lifetime.

### `QualificationTrendChart` (lifetime only)

Recharts `AreaChart`. X-axis: show dates. Y-axis: Q rate percentage. Tooltip with show name, entries, Q count.

## Show-Scoped View Layout

`MyShowStatsTab` receives `showId`, calls `useMyShowStats(showId)`.

Top-to-bottom:
1. **StatsSummaryCards** — 4 metric cards
2. **ResultDistributionChart** (half-width desktop) + **DogBreakdownCards** (half-width desktop) — side by side on desktop, stacked on mobile
3. **FastestTimesTable** — full width, 10 rows

**Empty state:** "Results will appear here once scoring begins." (when entries exist but none scored)

**No filters** — data set is small enough (one user at one show) that filtering adds complexity without value.

## Lifetime View Layout

Top-to-bottom:
1. **Page header** — "My Analytics" title, dog filter dropdown, organization filter dropdown
2. **StatsSummaryCards** — lifetime aggregates
3. **QualificationTrendChart** — Q rate per show over time (centerpiece)
4. **ResultDistributionChart** + **DogBreakdownCards** — side by side
5. **FastestTimesTable** — 20 rows, includes "Show" column

**Filters:** Simple `Select` dropdowns in page header. Client-side filtering of already-fetched data. Dog filter (all / specific dog), organization filter (all / AKC / UKC / ASCA).

## Files Changed

### Deleted (mock dashboard)
- `AnalyticsDashboard.tsx` — mock data dashboard
- `AnalyticsDashboard.data.ts` — hardcoded mock data
- `AnalyticsDashboard.types.ts` — mock types
- `EnhancedAnalyticsDashboard.tsx` — if also mock-based
- `StatCard.tsx` in analytics dir — using `@myk9/ui` `StatCard` instead

### Kept (admin/system monitoring, unrelated)
- `MonitoringDashboard.tsx`
- `PerformanceGraphs.tsx`, `PerformanceGraphs.helpers.ts`, `PerformanceGraphs.types.ts`
- `PerformanceCharts.tsx`
- `UserActivity*` files

### Created
- `src/components/analytics/analytics-utils.ts` — shared computation helpers
- `src/components/analytics/StatsSummaryCards.tsx`
- `src/components/analytics/ResultDistributionChart.tsx`
- `src/components/analytics/DogBreakdownCards.tsx`
- `src/components/analytics/FastestTimesTable.tsx`
- `src/components/analytics/QualificationTrendChart.tsx`
- `src/components/analytics/MyShowStatsTab.tsx`
- `src/hooks/queries/useMyShowStats.ts`
- `src/hooks/queries/useMyLifetimeStats.ts`

### Modified
- `src/pages/AnalyticsPage.tsx` — rewritten, no feature gate
- `src/pages/ShowDetailsPage.tsx` — add "My Stats" tab
- `src/lib/queryClient.ts` — add query key factories

## Out of Scope

- **Staff/secretary analytics** — aggregate stats across all exhibitors (myK9Q's model) is a separate feature
- **Financial tracking** — no earnings/expenses data in the system
- **Comparison features** — "my dog vs breed average" needs aggregate data not exposed to exhibitors
- **Export/download** — no CSV or PDF export
- **Real-time updates** — React Query standard cache with refetch-on-focus, no Supabase realtime subscription
- **New database objects** — no views, RPCs, or migrations
