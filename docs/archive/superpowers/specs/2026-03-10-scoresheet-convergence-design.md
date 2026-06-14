# Scoresheet Convergence Design

**Date:** 2026-03-10
**Status:** Approved
**Context:** myK9Q and myK9Show have 7 scoresheet types triplicated across 3 locations (~25,000 lines). This design consolidates them into a single shared package with two UI modes.

---

## Problem

Every scoresheet exists in three places:

| Location                                          | Style                      | Status                     |
| ------------------------------------------------- | -------------------------- | -------------------------- |
| `apps/myk9q/src/pages/scoresheets/`               | Hook-driven, semantic CSS  | Active (in-ring judge use) |
| `packages/scoring-ui/src/components/scoresheets/` | Props-driven, Tailwind     | Reference implementation   |
| `apps/myk9show/src/pages/scoring/scoresheets/`    | Props-driven, semantic CSS | Unused                     |

The scoring logic (time parsing, fault counting, validation, calculations) is identical. Only the data plumbing (hooks vs. props) and CSS (semantic vs. Tailwind) differ. Bug fixes must happen in up to 3 places.

## Decision

**Approach B: Shared scoring engine, two thin UI shells.**

All business logic moves into `@myk9/scoring-ui`. Two UI variants per scoresheet type:

- **LiveScoresheet** — Judge's in-ring view with stopwatch, big touch targets, area-by-area flow
- **EntryScoresheet** — Secretary's desk view for typing in results from paper sheets

Both produce the same `ScoreData` output. Apps handle data loading and persistence.

## Two User Flows

### Judge (live, in-ring)

The current myK9Q experience: navigate to class → entry list → tap entry → stopwatch running, mark areas, pick result → submit → next entry. Mobile-first, speed-optimized, large touch targets.

### Secretary (desk, after-the-fact)

Manual data entry from paper scoresheets: see entry list → select entry → compact form with all areas visible → type times, pick result, enter faults → Save & Next → repeat. Keyboard-first, efficiency-optimized, tab-navigable.

## Architecture

### Shared Scoring Engine (`@myk9/scoring-ui`)

#### `useScoresheetScoring(config)` hook

Replaces myK9Q's `useScoresheetCore`. Pure scoring state management:

- Areas state (add, update, reset)
- Qualifying result (Q, NQ, EX, ABS) with auto-clear on EX
- Non-qualifying reason
- Fault count
- Trial metadata (date, number)
- `handleAreaUpdate(index, field, value)`
- `calculateTotalTime()` — sums area times
- Validation (missing result, unparseable time, time exceeds max)

No dependency on router, stores, or replication. Works in any React app.

#### `useStopwatch(config)` and `useElementTimer(config)` hooks

Consolidated from the two existing copies (myK9Q local + shared package). Single source of truth.

#### What moves to shared package

- Scoring state management (from `useScoresheetCore`)
- Time parsing (`parseSmartTime`)
- Area initialization logic
- Score validation
- `ResolvedClassRules` types (already there)
- `buildResolvedClassRules` (already there)

#### What stays app-specific

- **myK9Q:** `useEntryNavigation` (replicated tables), `useOptimisticScoring` (offline submission), `markInRing`, celebration modal
- **myK9Show:** React Query data fetching, Supabase mutations, secretary workflow

### UI Shells

#### LiveScoresheet (Judge)

- Full-screen mobile-first layout
- Stopwatch with big start/stop button
- Area-by-area scoring (swipe or tap between areas)
- Found/Not Found toggle, time per area
- Result chips (Q, NQ, EX, ABS) as large tappable buttons
- Confirmation dialog before submit

```tsx
<AKCScentWorkLiveScoresheet
  entry={entry}
  classInfo={classInfo}
  rules={rules}
  onSubmit={scoreData => {
    /* app handles persistence */
  }}
  onBack={() => {
    /* app handles navigation */
  }}
/>
```

#### EntryScoresheet (Secretary)

- Compact single-screen form — all areas visible at once
- Text inputs for times (smart parsing: "123" → "1:23.00")
- Result dropdown instead of large chips
- Fault counter as number input
- Non-qualifying reason dropdown (conditional)
- Tab-navigable — no mouse required
- "Save & Next" button

```tsx
<AKCScentWorkEntryScoresheet
  entry={entry}
  classInfo={classInfo}
  rules={rules}
  onSubmit={scoreData => {
    /* app handles persistence */
  }}
  onNext={() => {
    /* advance to next entry */
  }}
  onBack={() => {
    /* return to entry list */
  }}
/>
```

### File Structure

```
packages/scoring-ui/src/
  hooks/
    useScoresheetScoring.ts        # Core scoring state (new)
    useStopwatch.ts                # Consolidated
    useElementTimer.ts             # Consolidated
  components/scoresheets/
    AKC/
      AKCScentWorkLiveScoresheet.tsx
      AKCScentWorkEntryScoresheet.tsx
      AKCFastCatLiveScoresheet.tsx
      AKCFastCatEntryScoresheet.tsx
      AKCNationalsLiveScoresheet.tsx
      AKCNationalsEntryScoresheet.tsx
    UKC/
      UKCNoseworkLiveScoresheet.tsx
      UKCNoseworkEntryScoresheet.tsx
      UKCObedienceLiveScoresheet.tsx
      UKCObedienceEntryScoresheet.tsx
      UKCRallyLiveScoresheet.tsx
      UKCRallyEntryScoresheet.tsx
    ASCA/
      ASCAScentDetectionLiveScoresheet.tsx
      ASCAScentDetectionEntryScoresheet.tsx
  types/
    scoreData.ts                   # ScoreData, ScoresheetEntry types
  utils/
    getScoresheetComponent.ts      # Factory: (sportType, mode) → component
    buildResolvedClassRules.ts     # Already exists
    timeUtils.ts                   # parseSmartTime, formatTime
```

## Data Contracts

### ScoreData (universal output)

```typescript
interface ScoreData {
  resultText: 'Q' | 'NQ' | 'EX' | 'ABS';
  searchTime: string;
  nonQualifyingReason?: string;
  areas: Record<string, string>;
  areaTimes: string[];
  correctCount: number;
  incorrectCount: number;
  faultCount: number;
  finishCallErrors: number;
  points: number;
  element?: string;
  level?: string;
}
```

### ScoresheetEntry (universal input)

```typescript
interface ScoresheetEntry {
  id: number;
  armband: number;
  dogName: string;
  handlerName: string;
  className: string;
  element?: string;
  level?: string;
  section?: string;
  existingScore?: ScoreData; // for editing previously scored entries
}
```

### Submission Contract

| App      | What happens on `onSubmit(scoreData)`                                    |
| -------- | ------------------------------------------------------------------------ |
| myK9Q    | `useOptimisticScoring` → local store → queued mutation → background sync |
| myK9Show | React Query mutation → direct Supabase insert/update                     |

### Validation

Lives in `useScoresheetScoring`:

- **Blockers:** No result selected, unparseable time
- **Warnings:** Time exceeds max, no areas marked
- **Sport-specific:** Nationals must have placement if qualifying

Both shells show the same validation, styled differently (toast vs. inline).

## App Integration

### myK9Q

`ScoresheetPage` becomes a thin wrapper (~50 lines per scoresheet type):

- `useEntryNavigation` loads entry from replicated tables (stays app-specific)
- Renders `*LiveScoresheet` from `@myk9/scoring-ui`
- `onSubmit` → `useOptimisticScoring` for offline-first persistence
- `onBack` → `navigateBackWithRingCleanup`
- Celebration modal wired via `onSubmit` success callback

Deleted: `useScoresheetCore`, local `useStopwatch`, local `useElementTimer`
Kept: `useEntryNavigation`, `useEntryNavigationHelpers` (myK9Q-specific data loading)

### myK9Show

Two routes:

- **`/scoring/:classId/entry/:entryId`** — Secretary manual entry
  - React Query fetches entry + class + rules from Supabase
  - Renders `*EntryScoresheet`
  - `onSubmit` → mutation to write score
  - `onNext` → advance to next unscored entry

- **`/scoring/:classId/live/:entryId`** — Future judge use
  - Same data fetching
  - Renders `*LiveScoresheet`

### Scoresheet Type Routing

Shared `getScoresheetComponent(sportType, mode)` factory returns the correct component. Both apps use it.

## CSS Approach

Both shells use Tailwind. myK9Q currently uses semantic CSS — Tailwind will be added to myK9Q since it's headed toward retirement in favor of myK9Show.

## Migration Order

1. Build shared hooks + both shell variants in `@myk9/scoring-ui`
2. Wire myK9Show's secretary flow (new capability, no migration)
3. Migrate myK9Q to shared `*LiveScoresheet` components (replace 7 files)
4. Delete triplicated code (myK9Q originals + myK9Show unused copies)

## Testing Strategy

### Shared package (`@myk9/scoring-ui`)

**Hook tests** — `useScoresheetScoring`:

- Area state management (add, update, reset)
- Time calculation (single area, multi-area, edge cases)
- Qualifying result auto-clear on EX
- Validation rules
- Sport-specific logic (MPH for FastCAT, dual timer for UKC Nosework, points for Nationals)

**Component tests** — each scoresheet variant:

- Renders correct fields for sport type and rules
- LiveScoresheet: stopwatch starts/stops, area navigation
- EntryScoresheet: tab order, smart time parsing, Save & Next
- Both: calls `onSubmit` with correct `ScoreData` shape
- Both: pre-fills from `existingScore`
- Both: shows validation errors

### App-level tests

- myK9Q: Wrapper loads entry from replicated tables, passes correct props, submission uses optimistic scoring
- myK9Show: Wrapper fetches via React Query, passes correct props, submission calls mutation

### Deleted

All existing tests across the 3 locations replaced by shared package tests.

## Expected Outcome

- ~25,000 lines of duplicated code → ~14 shared components + thin wrapper pages per app
- Bug fixes happen once, apply everywhere
- New scoresheet types require one implementation (Live + Entry variants)
- Secretary can enter scores from paper sheets immediately
- Path to retiring myK9Q: myK9Show already has the live scoring capability
