# Trial Card Enhancements: Date Circle, Counts, Progress Bar

**Date:** 2026-03-18
**Status:** Approved

## Problem

Trial cards on ShowDetailsPage show only name, status, date, type, and start time. Users cannot see class/entry counts or scoring progress at a glance without clicking into each trial.

## Design

### Layout

Replace the current vertical detail list with a horizontal layout: date element on the left, content on the right.

```
[DATE]  Title  [Status Badge]
        Type · Start Time
        ──── progress bar ────
        N classes  N entries  [N/N scored]
```

### Date Element

A 56x56px rounded square (`border-radius: 12px`) with a 2px border. Contains month abbreviation (uppercase, 10px, colored) on top and day number (22px, bold) below, vertically centered.

**Border color by state:**

| Trial Status                   | Border Color              | Month Text Color      |
| ------------------------------ | ------------------------- | --------------------- |
| Scheduled, Upcoming, Cancelled | `border` (Tailwind token) | `#3b82f6` (blue-500)  |
| In Progress                    | `#3b82f6` (blue-500)      | `#3b82f6` (blue-500)  |
| Completed                      | `#16a34a` (green-600)     | `#16a34a` (green-600) |

The month text is always colored (blue for non-completed, green for completed). The border transitions from neutral to colored as the trial progresses.

### Content Area

- **Row 1:** Trial name (14px semibold) + status badge (existing `getClassStatusBadgeClasses`)
- **Row 2:** Trial type + start time, separated by middot, 12px muted text
- **Row 3:** Progress bar — 3px tall, rounded, `border` color track. Fill color: blue-500 for in-progress, green-600 for completed. Width = `totalClasses > 0 ? (completedClasses / totalClasses) * 100 : 0`. At 0% the empty track acts as a subtle divider.
- **Row 4:** Class count + entry count (12px, bold number + muted label). When in-progress or completed, "N/N scored" appears right-aligned in the status color.

### Props Interface

Pass `trialStats` as a new prop to `TrialsTab`:

```typescript
interface TrialStats {
  classCount: number;
  entryCount: number;
  completedClasses: number;
}

interface TrialsTabProps {
  trials: Trial[];
  showId: string;
  trialStats: Record<string, TrialStats>; // keyed by trial.id
}
```

### Data Derivation

Computed in `ShowDetailsPage` via `useMemo` from the existing `trialClasses` store data:

```typescript
const trialStats = useMemo(() => {
  const stats: Record<string, TrialStats> = {};
  for (const trial of associatedTrials) {
    const classes = trialClasses[trial.id] || [];
    stats[trial.id] = {
      classCount: classes.length,
      entryCount: classes.reduce((sum, cls) => sum + (cls.entries ?? 0), 0),
      completedClasses: classes.filter(cls => cls.status === 'Completed').length,
    };
  }
  return stats;
}, [associatedTrials, trialClasses]);
```

### Progress Bar Visibility

The progress bar track (empty gray line) is always visible — it serves as a divider. The fill only appears when `completedClasses > 0`. The "N/N scored" text only appears when `completedClasses > 0`.

### Responsive Behavior

Cards remain in the existing grid: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`. The date element stays at fixed 56px width; content area flexes to fill.

## Files Changed

| File                                                    | Change                                                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `apps/myk9show/src/components/shows/tabs/TrialsTab.tsx` | Rewrite card layout: date element, counts, progress bar. Accept `trialStats` prop. |
| `apps/myk9show/src/pages/ShowDetailsPage.tsx`           | Compute `trialStats` from `trialClasses` and pass to `TrialsTab`                   |

## Files Not Changed

- Trial types — no new fields needed on `Trial` interface
- Class store / entry store — data already available
- Other tabs — no changes

## Out of Scope

- Show-level cards with date circles (separate TODO: "Redesign show cards with date circle")
- Reusable `DateCircle` component extraction (can be done when show cards are redesigned)
- Trial card table/list view toggle (separate TODO)
