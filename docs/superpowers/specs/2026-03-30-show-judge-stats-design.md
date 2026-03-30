# Show Stats & Judge Stats — Design Spec

**Date:** 2026-03-30
**Location:** ShowDetailsPage > Results tab > Sub-tabs

## Overview

Add two public analytics views to the Results tab on ShowDetailsPage:

- **Show Stats** — aggregate performance across all exhibitors at the show
- **Judge Stats** — performance breakdown for a selected judge's classes

Both are visible to any user (no role-gating). Gated only by data availability: scored entries must exist.

## Results Tab Structure

The existing Results tab gains a secondary tab bar (using the existing `SubTabs` component):

```
Results Tab
├── Podium        (existing — podium cards by class)
├── Show Stats    (new — aggregate show analytics)
└── Judge Stats   (new — per-judge analytics with dropdown)
```

**Podium** remains the default sub-tab. Show Stats and Judge Stats sub-tabs appear conditionally when scored entries exist (for Show Stats) or when judge assignments with scored entries exist (for Judge Stats).

## Show Stats Sub-Tab

### Data Source

New `useShowStats(showId)` hook:

- Queries `view_entry_with_results` filtered by `show_id`
- No dog or user filter — fetches all entries for the show
- Returns `StatsEntry[]` using the same interface as `useMyShowStats`
- Cache strategy: `cacheStrategies.moderate` (5 min)
- Query key: `queryKeys.showStats(showId)`

### Sections (top to bottom)

1. **StatsSummaryCards** — total entries, Q rate, best time, avg time (reused)
2. **ResultDistributionChart** — pie chart of Q/NQ/EX/ABS/WD (reused)
3. **DogBreakdownCards** — per-dog performance at the show (reused)
4. **FastestTimesTable** — ranked fastest qualified times across the show (reused)

### Computation

All stats computed client-side via existing `analytics-utils.ts` functions:

- `computeSummaryStats(entries)`
- `computeResultDistribution(entries)`
- `computePerDogStats(entries)`
- `computeFastestTimes(entries, 10)`

All wrapped in `useMemo` keyed on the entries array.

### Empty State

When no scored entries exist for the show, the sub-tab is hidden from the tab bar.

## Judge Stats Sub-Tab

### Data Source

New `useJudgeShowStats(judgeId, showId)` hook:

- Queries `view_entry_with_results` joined through `classes` to find classes where the selected judge is assigned (via `judge_assignments`)
- Returns `StatsEntry[]` with additional `trialDate`, `trialNumber` fields per entry
- Cache strategy: `cacheStrategies.moderate` (5 min)
- Query key: `queryKeys.judgeShowStats(judgeId, showId)`
- `enabled` only when both `judgeId` and `showId` are truthy

### Judge Selection

- Dropdown at the top of the sub-tab listing all judges assigned to the show
- Source: show's judge assignments (already available on ShowDetailsPage via `associatedTrials` or `judge_assignments` join)
- New `useShowJudges(showId)` hook returns `{ id, name }[]` of judges with assignments
- First judge pre-selected by default
- Changing the dropdown triggers a new query via the `judgeId` dependency

### Sections (top to bottom)

1. **Judge dropdown selector** (new — simple Select component)
2. **StatsSummaryCards** — summary for the selected judge's classes (reused)
3. **ClassBreakdownTable** — per-class Q rate breakdown (new component)
4. **ResultDistributionChart** — pie chart for judge's classes (reused)
5. **DogBreakdownCards** — dogs that competed under this judge (reused)
6. **FastestTimesTable** — fastest times in judge's classes (reused)

### ClassBreakdownTable (New Component)

A new `ClassBreakdownTable` component in `src/components/analytics/`.

**Columns:**
| Column | Source |
|--------|--------|
| Trial Date | `trialDate` from class join |
| Trial # | `trialNumber` from class join |
| Class | Element + Level (formatted via `shouldShowSection`/`shouldShowLevel`) |
| Entries | Count of entries in that class |
| Q Rate | Qualified / scored, with progress bar |
| Best Time | Fastest qualified time in that class |
| Avg Time | Average qualified time in that class |

**Computation:** New `computeClassBreakdown(entries)` function in `analytics-utils.ts`:

- Groups entries by `classId`
- For each class: counts entries, computes Q rate, finds best/avg times
- Includes `trialDate` and `trialNumber` from entry metadata
- Sorts by trial date, then trial number, then element, then level
- Returns `ClassBreakdownEntry[]`

**Rendering:** Responsive table using existing table patterns. On mobile, trial date and trial number collapse into a single "Trial" column. Progress bar uses the same style as `StatCard` progress bars from `@myk9/ui`.

### Empty State

When no judge assignments with scored entries exist, the sub-tab is hidden from the tab bar.

## Data Flow

```
ShowDetailsPage
└── Results Tab (PrimaryTab)
    └── SubTabs
        ├── Podium (existing)
        ├── Show Stats
        │   └── ShowStatsSubTab(showId)
        │       ├── useShowStats(showId)
        │       │   └── view_entry_with_results WHERE show_id = ?
        │       └── compute* → StatsSummaryCards, ResultDistributionChart,
        │                       DogBreakdownCards, FastestTimesTable
        └── Judge Stats
            └── JudgeStatsSubTab(showId)
                ├── useShowJudges(showId)
                │   └── judge_assignments WHERE show classes
                ├── [Judge Dropdown] → selectedJudgeId
                └── useJudgeShowStats(selectedJudgeId, showId)
                    └── view_entry_with_results JOIN classes JOIN judge_assignments
                    └── compute* → StatsSummaryCards, ClassBreakdownTable,
                                    ResultDistributionChart, DogBreakdownCards,
                                    FastestTimesTable
```

## New Files

| File                                                              | Purpose                                       |
| ----------------------------------------------------------------- | --------------------------------------------- |
| `src/components/analytics/ShowStatsSubTab.tsx`                    | Show Stats sub-tab component                  |
| `src/components/analytics/JudgeStatsSubTab.tsx`                   | Judge Stats sub-tab with judge dropdown       |
| `src/components/analytics/ClassBreakdownTable.tsx`                | Per-class Q rate table (new)                  |
| `src/hooks/queries/useShowStats.ts`                               | Hook: all entries for a show                  |
| `src/hooks/queries/useJudgeShowStats.ts`                          | Hook: entries for a judge's classes at a show |
| `src/hooks/queries/useShowJudges.ts`                              | Hook: judges assigned to a show               |
| `src/components/analytics/__tests__/ShowStatsSubTab.test.tsx`     | Tests                                         |
| `src/components/analytics/__tests__/JudgeStatsSubTab.test.tsx`    | Tests                                         |
| `src/components/analytics/__tests__/ClassBreakdownTable.test.tsx` | Tests                                         |
| `src/test/hooks/useShowStats.test.ts`                             | Hook tests                                    |
| `src/test/hooks/useJudgeShowStats.test.ts`                        | Hook tests                                    |

## Modified Files

| File                                          | Change                                                              |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `src/pages/ShowDetailsPage.tsx`               | Replace Results `TabsContent` with sub-tabbed version               |
| `src/components/analytics/analytics-utils.ts` | Add `computeClassBreakdown()` function + `ClassBreakdownEntry` type |
| `src/components/analytics/index.ts`           | Export new components                                               |
| `src/lib/queryClient.ts`                      | Add `showStats`, `judgeShowStats`, `showJudges` query key factories |

## Icons

Lucide icons only. No emojis anywhere.

- Show Stats sub-tab: `BarChart3`
- Judge Stats sub-tab: `Scale`
- Podium sub-tab: `Medal`

## Testing

- Unit tests for all new components (mock data, render assertions)
- Unit tests for `computeClassBreakdown()` utility
- Unit tests for new hooks (mock Supabase queries)
- Verify sub-tabs hide when no scored data exists
- Verify judge dropdown switches data correctly
