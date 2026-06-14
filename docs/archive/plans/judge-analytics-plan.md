# Judge Analytics Plan

**Purpose:** Give show secretaries and admins insight into judge activity, utilization, and qualification status — and give judges a personal performance summary.

**Status:** Plan only — implement after judge assignments are flowing.

**Prerequisites:** Availability persistence (see `availability-persistence-plan.md`), judge assignments actively being created/confirmed through the UI.

---

## Data Sources

All data already exists in the schema. No new tables needed for analytics — this is a read-only feature.

| Table                  | Analytics Value                                              |
| ---------------------- | ------------------------------------------------------------ |
| `judge_assignments`    | Utilization, acceptance rate, fee totals, assignment history |
| `judge_qualifications` | Active/expiring/suspended counts, org breakdown              |
| `judge_certifications` | Certification coverage, expiration tracking                  |
| `entries`              | Entries judged, scoring times, result distribution           |
| `shows`                | Show types, locations, date ranges for trend analysis        |
| `trials` / `classes`   | Class-level detail for workload analysis                     |
| `judge_availability`   | Capacity vs actual utilization (once implemented)            |

---

## Two Audiences, Two Views

### 1. Admin/Secretary View — "Which judges should I invite?"

**Intent:** "The platform is healthy" (INTENT.md 3.2.5) — key metrics at a glance, problems surfaced automatically, drill-down from summary to detail.

**Metrics:**

- **Judge Roster Overview** — Total active judges, by organization, expiring qualifications (30-day warning)
- **Utilization** — Shows judged per judge (this month/quarter/year), busiest vs underutilized judges
- **Acceptance Rate** — Invited vs confirmed vs declined per judge
- **Fee Summary** — Total fees by judge, average fee per show/class
- **Qualification Alerts** — Expiring within 30/60/90 days, recently suspended, lapsed certifications

### 2. Judge View — "How's my season going?"

**Intent:** "Invisible technology" (INTENT.md 3.2.2) — quick glance, no cognitive load.

**Metrics:**

- **My Season** — Shows judged this year, upcoming confirmed assignments
- **Entries Judged** — Total entries scored, by discipline/level
- **Result Distribution** — Q/NQ/Absent/Excused breakdown (pie chart, reuse dog stats pattern)
- **Scoring Pace** — Average time per entry (from `scoring_started_at` / `scoring_completed_at`)
- **Qualification Status** — My active qualifications, upcoming expirations

---

## Implementation Plan

### Step 1: Database Query Functions

**Edit:** `apps/myk9show/src/services/database/queries/judgeQueries.ts`

Add analytics query functions:

```typescript
export const judgeAnalyticsQueries = {
  // Secretary/admin: overview stats for all judges
  async getRosterSummary() {
    // Count active judges, qualifications by org, expiring soon
    // Uses judge_qualifications + people tables
  },

  // Secretary/admin: per-judge utilization
  async getUtilizationStats(filters?: {
    dateRange?: { start: string; end: string };
    organization?: string;
  }) {
    // JOIN judge_assignments + shows + people
    // GROUP BY person_id
    // Returns: judge name, show count, class count, entries judged,
    //          confirmed/declined/cancelled counts, total fees
  },

  // Secretary/admin: qualification alerts
  async getQualificationAlerts(withinDays: number = 30) {
    // Uses existing getSummary() pattern from judgeQualificationQueries
    // Expiring, expired, suspended qualifications
  },

  // Judge: personal stats
  async getMyStats(personId: string, year?: number) {
    // Assignments for this judge, joined with shows/classes/entries
    // Returns: shows judged, entries scored, result breakdown, avg scoring time
  },

  // Judge: upcoming assignments
  async getUpcomingAssignments(personId: string) {
    // judge_assignments WHERE status IN ('invited','confirmed')
    // JOIN shows for dates/names, ORDER BY show start_date
  },
};
```

**Pattern:** Follow `healthStatisticsQueries.ts` — filters, date ranges, aggregation.

**[ADDED] Join Path for Entries:** The `entries` table has no `judge_id`. To attribute entries to a judge, join through assignments:

```
judge_assignments.person_id = judge's person_id
judge_assignments.class_id = entries.class_id (or via trial_id/show_id)
```

For scoring pace, use `entries.scoring_started_at` / `scoring_completed_at` — filter out rows where either is NULL.

**[ADDED] Performance:** Default date range to current year. Add pagination (50 judges per page) on utilization table. Consider a Supabase RPC function if multi-table JOINs are too slow from the client.

### Step 2: React Query Hooks

**New file:** `apps/myk9show/src/hooks/queries/useJudgeAnalyticsQuery.ts`

```typescript
export function useJudgeRosterSummary() {
  /* queryKey: ['judges', 'roster-summary'] */
}
export function useJudgeUtilizationStats(filters) {
  /* queryKey: ['judges', 'utilization', filters] */
}
export function useJudgeQualificationAlerts(days) {
  /* queryKey: ['judges', 'alerts', days] */
}
export function useMyJudgeStats(personId, year) {
  /* queryKey: ['judges', 'my-stats', personId, year] */
}
export function useUpcomingAssignments(personId) {
  /* queryKey: ['judges', 'upcoming', personId] */
}
```

Cache strategy: `cacheStrategies.moderate` (5min) — analytics data doesn't need real-time freshness.

### Step 3: Admin Judge Analytics Page

**New file:** `apps/myk9show/src/pages/admin/JudgeAnalyticsPage.tsx`

**Route:** Add to `adminRoutes.tsx` at `/admin/judges/analytics` (or reuse `/admin/analytics` if it's currently empty).

**[ADDED] Access Control:** Current admin routes use `SITE_ADMIN` role gate. Secretaries also need access to judge analytics for show planning. Options: (1) add a separate `/secretary/judges/analytics` route with secretary role gate, (2) broaden the admin analytics route to allow secretary role. Prefer option 1 — keeps admin and secretary route trees separate.

**[ADDED] Lazy Loading:** Use `createEnhancedLazy(() => import('./JudgeAnalyticsPage'))` + `SuspenseWrapper` — matches all other admin page patterns in adminRoutes.tsx.

**Layout:** Follow `AdminDashboard.tsx` pattern — hook for data, sections as sub-components.

**Sections:**

1. **Roster Summary Cards** — 4 stat cards across top:
   - Total Active Judges
   - Qualifications Expiring (30 days)
   - Shows This Month
   - Average Acceptance Rate

2. **Utilization Table** — Sortable table of judges with columns:
   - Judge Name (link to person detail)
   - Shows (count)
   - Classes Judged
   - Entries Scored
   - Acceptance Rate (%)
   - Total Fees
   - Filter by date range, organization

3. **Qualification Alerts** — List of judges with expiring/expired/suspended qualifications, sorted by urgency. Action button to view judge detail.

4. **Assignment Trends** — recharts BarChart showing assignments per month (use existing chart pattern from `dogs/DogDetails/Statistics/charts.tsx`).

### Step 4: Judge Personal Dashboard Enhancement

**Edit:** `apps/myk9show/src/pages/JudgeDashboard.tsx`

Add a "My Stats" section (collapsible, below existing content):

1. **Season Summary Cards** — Shows judged, entries scored, upcoming assignments
2. **Result Distribution** — PieChart (Q/NQ/Absent/Excused) reusing colors from dog stats
3. **Upcoming Assignments** — Simple list with show name, date, status badge

Keep it lightweight — judges want "invisible technology," not a data wall.

### Step 4b: Loading, Error, and Empty States [ADDED]

All analytics views need three states:

- **Loading:** Skeleton cards (4-up) + skeleton table rows. Use existing shimmer pattern.
- **Error:** "Failed to load analytics" with retry button. Wrap each section independently so one failure doesn't blank the whole page.
- **Empty:** "No judge assignments yet" with contextual guidance. For admin: "Assign judges to shows to see analytics here." For judge personal: "Your stats will appear after your first judging assignment."

### Step 5: Export & Print Support

Leverage existing infrastructure:

- **CSV Export** — Use `exportToCSV()` from `lib/export.ts` for utilization table data
- **Print Report** — Use `print-service.ts` pattern for a "Judge Activity Report" template
  - New template in `print-templates.tsx`: `JudgeActivityReport`
  - Shows assignment history, fee summary, qualification status for a single judge
  - Useful for club record-keeping

---

## Visualization Approach

Use existing `recharts` (v3.7.0) with established patterns:

| Chart             | Data                           | Pattern Source            |
| ----------------- | ------------------------------ | ------------------------- |
| Stat cards (4-up) | Roster counts                  | AdminDashboard sections   |
| Bar chart         | Assignments per month          | Dog statistics charts.tsx |
| Pie chart         | Result distribution (Q/NQ/etc) | Dog statistics charts.tsx |
| Sortable table    | Judge utilization              | Existing table components |

Colors follow existing palette:

- Q: `#10b981` (green)
- NQ: `#ef4444` (red)
- Absent: `#8b5cf6` (purple)
- Excused: `#fbbf24` (amber)

---

## Files Changed (Summary)

| File                                                            | Change                         |
| --------------------------------------------------------------- | ------------------------------ |
| `apps/myk9show/src/services/database/queries/judgeQueries.ts`   | Add `judgeAnalyticsQueries`    |
| `apps/myk9show/src/hooks/queries/useJudgeAnalyticsQuery.ts`     | **New** — React Query hooks    |
| `apps/myk9show/src/pages/admin/JudgeAnalyticsPage.tsx`          | **New** — Admin analytics page |
| `apps/myk9show/src/routes/adminRoutes.tsx`                      | Add route for judge analytics  |
| `apps/myk9show/src/pages/JudgeDashboard.tsx`                    | Add personal stats section     |
| `apps/myk9show/src/features/pipeline/print/print-templates.tsx` | Add JudgeActivityReport        |

---

## What This Does NOT Include

- **Judge-to-show matching UI** — separate feature, uses availability data
- **New database tables** — analytics is read-only over existing data
- **Real-time updates** — 5min cache is fine for analytics
- **Fee management/invoicing** — just displays fee totals from assignments
- **Scheduling/calendar view** — could be a future enhancement

---

## Testing

- Unit test `judgeAnalyticsQueries` with mock Supabase responses
- Unit test React Query hooks (loading/error/success states)
- Component tests for stat cards and chart rendering
- Edge cases: judge with zero assignments, no qualifications, no scored entries
- Verify recharts renders correctly with empty datasets (no crash on [])
