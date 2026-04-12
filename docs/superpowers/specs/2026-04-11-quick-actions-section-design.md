# Design: Quick Actions Section for Mission Control

**Date:** 2026-04-11
**Phase:** Phase 2 — Secretary Golden Path (Secretary Dashboard Migration)
**Status:** Approved

---

## Context

The legacy `SecretaryDashboard` had three stat-aware quick-action cards:

1. **Result Entry** — pending entry count with link to Entry Management
2. **Export Reports** — reports-ready count (finalized classes) with link to Reports
3. **Pending Issues** — active trials badge with link to Day of Operations

These were never ported to `PipelineDashboard` (Mission Control). The current dashboard has plain link buttons at the bottom with no live counts. This design replaces those buttons with full stat cards.

`Clone Show` and `Completed Trials` are already handled — Clone Show is in the dashboard header; completed shows appear in the show picker with no additional work needed.

---

## Decisions

| Decision          | Choice                                           | Reason                                                            |
| ----------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| Card layout       | Hero stat (big number, color border, CTA button) | Most scannable; counts are the primary signal                     |
| Count scope       | Selected show only                               | Focused context; counts update when secretary switches shows      |
| Data architecture | Separate `useQuickActionStats` hook              | Keeps `useMissionControlData` focused on pipeline data            |
| Existing buttons  | Replace                                          | Cards cover the same destinations; plain buttons become redundant |
| Zero counts       | Show as `0`, not hidden                          | Zero is meaningful — "nothing pending" is useful information      |

---

## Architecture

### Hook: `useQuickActionStats`

**File:** `apps/myk9show/src/features/pipeline/hooks/useQuickActionStats.ts`

Reads synchronously from two existing Zustand stores — no new network calls.

```typescript
function useQuickActionStats(showId: string): {
  pendingEntriesCount: number;
  reportsReadyCount: number;
  activeTrialsCount: number;
};
```

| Count                 | Store                        | Logic                                                                                                                          |
| --------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pendingEntriesCount` | `entryStore`                 | `getEntriesByShow(showId)` → filter `status === 'submitted'` → `.length`                                                       |
| `reportsReadyCount`   | `trialStore.allTrialClasses` | flatten all class arrays for trials in this show → count `is_scoring_finalized === true`                                       |
| `activeTrialsCount`   | `trialStore.allTrials`       | trials where `showId` matches and `status !== 'completed'` and `status !== 'cancelled'` (i.e. `'upcoming'` or `'in_progress'`) |

All three return `0` when `showId` is empty string.

### Component: `QuickActionsSection`

**File:** `apps/myk9show/src/features/pipeline/components/QuickActionsSection.tsx`

Props:

```typescript
interface QuickActionsSectionProps {
  showId: string;
  pendingEntriesCount: number;
  reportsReadyCount: number;
  activeTrialsCount: number;
}
```

Returns `null` when `showId` is empty.

Three cards in a horizontal `flex` row. Each card is a React Router `<Link>` wrapping the full card area.

| Card | Number                | Title           | Subtitle          | Border / number color                        | Destination                          |
| ---- | --------------------- | --------------- | ----------------- | -------------------------------------------- | ------------------------------------ |
| 1    | `pendingEntriesCount` | Pending Entries | awaiting review   | blue (`border-blue-500`, `text-blue-400`)    | `/secretary/entries?showId=<showId>` |
| 2    | `reportsReadyCount`   | Reports Ready   | classes finalized | green (`border-green-500`, `text-green-400`) | `/secretary/reports`                 |
| 3    | `activeTrialsCount`   | Active Trials   | not yet completed | amber (`border-amber-500`, `text-amber-400`) | `/secretary/day-of-operations`       |

Card anatomy (per card):

- Color-coded left border (`border-l-4`)
- Large number (`text-3xl font-bold`) in the card's accent color
- Title (`text-sm font-medium text-foreground`)
- Subtitle (`text-xs text-muted-foreground`)
- CTA button (`variant="outline" size="sm"`) at the bottom — full-width

No emojis anywhere in the component.

---

## Integration: `PipelineDashboard`

**File:** `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx`

Changes:

1. Import and call `useQuickActionStats(selectedShow?.id ?? '')`
2. Import `QuickActionsSection`
3. Render `<QuickActionsSection>` between `<AnnouncementsCard>` and the class pipeline `<div>`
4. Delete the three plain `<Button asChild>` link buttons (current lines 259–278) — replaced by the cards

---

## Testing

### `useQuickActionStats.test.ts`

| Test                                       | Setup                                           | Expected                  |
| ------------------------------------------ | ----------------------------------------------- | ------------------------- |
| empty showId returns all zeros             | stores with data, showId = ''                   | `{ 0, 0, 0 }`             |
| counts submitted entries only              | show with 2 `submitted` + 1 `confirmed` entries | `pendingEntriesCount = 2` |
| counts finalized classes across all trials | 2 trials, 3 finalized + 1 not finalized         | `reportsReadyCount = 3`   |
| excludes completed + cancelled trials      | 1 active + 1 completed + 1 cancelled trial      | `activeTrialsCount = 1`   |

### `QuickActionsSection.test.tsx`

| Test                                            | Expected                 |
| ----------------------------------------------- | ------------------------ |
| renders null when showId is empty               | nothing in DOM           |
| renders three cards with correct numbers        | `12`, `3`, `2` visible   |
| card 1 links to `/secretary/entries?showId=abc` | correct href             |
| card 2 links to `/secretary/reports`            | correct href             |
| card 3 links to `/secretary/day-of-operations`  | correct href             |
| renders zero counts without hiding              | `0` visible in each card |

---

## Files

| File                                                                                    | Action |
| --------------------------------------------------------------------------------------- | ------ |
| `apps/myk9show/src/features/pipeline/hooks/useQuickActionStats.ts`                      | Create |
| `apps/myk9show/src/features/pipeline/hooks/__tests__/useQuickActionStats.test.ts`       | Create |
| `apps/myk9show/src/features/pipeline/components/QuickActionsSection.tsx`                | Create |
| `apps/myk9show/src/features/pipeline/components/__tests__/QuickActionsSection.test.tsx` | Create |
| `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx`                  | Modify |

---

## Out of Scope

- Global counts across all shows (deferred — not needed for fall 2026)
- Real-time subscription updates to entry counts (store-based reads are sufficient)
- Animated count transitions
- Dismissible cards or card state persistence
