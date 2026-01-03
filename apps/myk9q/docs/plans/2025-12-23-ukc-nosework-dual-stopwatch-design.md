# UKC Nosework Dual Stopwatch Design

## Overview

UKC Nosework requires two timing mechanisms for Superior, Master, and Elite levels where dogs search for multiple hides. This design adds Element Time tracking alongside the existing Search Time.

## Timing Definitions (from UKC Rulebook)

- **Search Time**: Accumulated time the dog is actively searching. Paused when handler calls alert, resumed when dog continues searching. This is recorded in the judge's book.

- **Element Time**: Total elapsed time from start to final alert. Never paused. Used to enforce max time limits. Only needed for classes with 2+ hides.

## Level-Based Behavior

| Level | Hides | Timer Mode |
|-------|-------|------------|
| Novice | 1 | Single (Search = Element) |
| Advanced | 1 | Single (Search = Element) |
| Superior | 2+ | Dual (Search + Element) |
| Master | 2+ | Dual (Search + Element) |
| Elite | 2+ | Dual (Search + Element) |

Detection: Check `currentEntry.level` to determine mode.

## Timer Display Layout (Superior/Master/Elite)

```
┌─────────────────────────────────────┐
│     Element: 0:57.23  [Finish]      │  ← Element Time + Finish button
│  ┌─────────────────────────────┐    │
│  │         0:42.15             │    │  ← Search Time (large, primary)
│  └─────────────────────────────┘    │
│        Remaining: 2:02.77           │  ← Countdown for 30-sec warning
│                                     │
│           [ Pause ]                 │  ← Pause/Resume button
└─────────────────────────────────────┘
```

**Visual grouping rationale:**
- Finish + Element Time = controls the overall run duration
- Pause + Search Time = controls active searching measurement

## Button States and Flow

```
[Start] → both timers begin
   ↓
[Pause] → Search pauses, Element continues
   ↓
[Resume] → Search resumes (can repeat Pause/Resume)
   ↓
[Finish] → BOTH timers stop
   ↓
[Resume] → BOTH timers resume (for timeout/correction edge cases)
```

**Button styling:**
- Start: Green
- Pause: Teal (current stop color)
- Resume: Blue
- Finish: Amber/orange (distinct, signals "end of run")

## Implementation Approach

**Option C: Composition with two hooks**

1. Use existing `useStopwatch` for Search Time (pausable)
2. Create minimal `useElementTimer` for Element Time (continuous)
3. Coordinate in component

**`useElementTimer` hook (new):**
```typescript
interface UseElementTimerReturn {
  time: number;              // Elapsed ms since start
  isRunning: boolean;
  start: () => void;         // Record start timestamp
  stop: () => void;          // Freeze current time
  resume: () => void;        // Continue from frozen time
  reset: () => void;
  formatTime: (ms: number) => string;
}
```

Element Time calculation: `Date.now() - startTimestamp + accumulatedTime`

**Coordination in UKCNoseworkScoresheet:**
- `handleStart()`: Start both timers
- `handlePause()`: Pause Search only
- `handleResume()`: Resume Search only
- `handleFinish()`: Stop both timers
- `handleResumeAll()`: Resume both timers (after Finish)

## Confirmation Dialog Update

For Superior/Master/Elite, show both times:

```
┌─────────────────────────────────────┐
│       Score Confirmation            │
│       Container Superior            │
│  ┌─────────────────────────────┐    │
│  │  133  Heidi                 │    │
│  │       German Shepherd Dog   │    │
│  │       Gisella Klindera      │    │
│  └─────────────────────────────┘    │
│                                     │
│   Result          Search Time       │
│   Qualified       0:42.15           │
│                                     │
│              Element Time           │
│              0:57.23                │
│                                     │
│   [Cancel]     [Confirm & Submit]   │
└─────────────────────────────────────┘
```

**ScoreConfirmationDialog changes:**
- Add optional `elementTime?: string` prop
- Show Element Time row when provided

## Data Recording

| Field | Value | Notes |
|-------|-------|-------|
| `searchTime` | string | Accumulated active searching time |
| `elementTime` | string | Total run duration (new field) |
| `faultCount` | number | From result section |
| `result` | Q/NQ/ABS/EX | Selected result |

For Novice/Advanced: `searchTime` = `elementTime` (single timer mode).

## Mobile Considerations

- Stacked layout works well on narrow screens
- Buttons sized for touch (min 44px height)
- Finish button smaller than Pause (less frequently used)
- Element Time display compact but readable

## Files to Modify

1. **New:** `src/pages/scoresheets/hooks/useElementTimer.ts`
2. **Modify:** `src/pages/scoresheets/UKC/UKCNoseworkScoresheet.tsx`
3. **Modify:** `src/pages/scoresheets/components/ScoreConfirmationDialog.tsx`
4. **Modify:** `src/pages/scoresheets/UKC/UKCNoseworkScoresheet.css`

## Testing Scenarios

1. Novice/Advanced: Single timer mode (no Element Time display)
2. Superior: Dual timer with pause/resume cycle
3. Master: Verify 30-second warning still works
4. Elite: Multiple pause/resume cycles
5. Edge case: Finish then Resume (timeout correction)
6. Edge case: Max time expiration during search
