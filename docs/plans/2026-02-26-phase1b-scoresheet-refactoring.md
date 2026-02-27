# Phase 1B: Scoresheet Refactoring — Implementation Plan

**Date:** February 26, 2026
**Status:** Implementation complete — all sprints done, typecheck passing, tests passing
**Depends on:** Phase 1A (data layer + wiring) — complete
**Design doc:** `docs/plans/2026-02-24-phase1-multi-sport-templates-design.md`

---

## Goal

Remove hardcoded rule logic from scoresheets in both myK9Show and myK9Q. Both apps construct a shared `ResolvedClassRules` object from the class record and pass it to their scoresheets. Rules are baked into the class at creation time (from the sport template) so scoring works fully offline.

## Out of Scope

- **AKC Nationals** (2 files per app) — rules change yearly, rare event
- **MRV capacity calculation** — only used in Barn Hunt
- **UKC Obedience/Rally scoresheets** — no template seed data yet

---

## Architecture

Rules live on the **class record**, not the template store. The template is consulted at class creation time; at scoring time everything comes from the class.

```
CLASS CREATION (online, wizard):
  sport_class_rules (DB) → wizard writes all rule fields to class record

SCORING (offline-capable):
  class record (replicated)
    → buildResolvedClassRules() (pure function, @myk9/scoring-ui)
      → ResolvedClassRules object
        → passed to scoresheet as props (myK9Show)
        → read from hook (myK9Q)
```

### Two scoresheet codebases

| App | Scoresheet location | Style | Data pattern |
|-----|---------------------|-------|-------------|
| myK9Show | `packages/scoring-ui/src/components/scoresheets/` | Tailwind, props-driven | Parent page passes `rules` prop |
| myK9Q | `apps/myk9q/src/pages/scoresheets/` | CSS, hook-driven | `useScoresheetCore` hook provides rules |

Both sets have the same hardcoded functions (`getAreaCount()`, `isDualTimerLevel()`). Both get refactored to use `ResolvedClassRules` from the shared package.

### Shared code in `@myk9/scoring-ui`

- `ResolvedClassRules` type
- `buildResolvedClassRules()` pure function — constructs from class record fields
- `useElementTimer` hook (already shared)

---

## Database Changes

### Migration: add rule columns to `classes`

Add four columns to the `classes` table:

```sql
ALTER TABLE classes ADD COLUMN timer_mode TEXT DEFAULT 'single';
ALTER TABLE classes ADD COLUMN hide_count INTEGER;
ALTER TABLE classes ADD COLUMN hides_known BOOLEAN DEFAULT true;
ALTER TABLE classes ADD COLUMN distraction_count INTEGER DEFAULT 0;
```

The class record already has `area_count`, `time_limit_seconds`, `element`, and `level`. These four columns fill the gaps.

### Backfill migration

Populate the new columns for existing classes by joining on `sport_class_rules` via element + level + sport template. Classes that don't match a template rule keep their defaults (single timer, no hides info).

### Wizard update [EXPANDED]

When the Create Show wizard creates classes from a template, write ALL rule fields to the class record — including the four new columns. The lookup path:

1. Trial has `sport_type` (e.g., `'akc-scent-work'`) — set during wizard step 1
2. Wizard uses `sport_type` to find the matching `sport_template` in the template store
3. For each class being created, wizard looks up the `sport_class_rules` row by element + level
4. Wizard copies `timer_mode`, `hide_count`/`hides_known`, and `distraction_count` from the rule row into the class record alongside the existing fields (`area_count`, `time_limit_seconds`)

The wizard already reads from `sport_class_rules` via the template store for time limits and area counts. This extends the same path to include the four new fields.

---

## ResolvedClassRules

**Location:** `packages/scoring-ui/src/types/resolvedClassRules.ts`

```typescript
export interface ResolvedClassRules {
  areaCount: number;
  timerMode: 'single' | 'dual';
  maxTimeSeconds: number;
  hideCount: number | null;
  hidesKnown: boolean;
  distractionCount: number;
}
```

Simplified from the earlier design — range values (`maxTimeRange`, `hideCountRange`) belong to the wizard, not the scoresheet. By scoring time, the class has concrete values.

### Builder function

**Location:** `packages/scoring-ui/src/utils/buildResolvedClassRules.ts`

```typescript
export function buildResolvedClassRules(classRecord: {
  areaCount?: number;
  timeLimitSeconds?: number;
  timerMode?: string;
  hideCount?: number;
  hidesKnown?: boolean;
  distractionCount?: number;
  level?: string;
  element?: string;
}): ResolvedClassRules
```

Pure function. Reads fields from the class record. Provides sensible defaults for missing fields so old classes (created before the migration) still work:
- `areaCount`: from class record, default `1`
- `timerMode`: from class record, default `'single'`
- `maxTimeSeconds`: from class record, default `180` (3 minutes)
- `hideCount`: from class record, default `null`
- `hidesKnown`: from class record, default `true`
- `distractionCount`: from class record, default `0`

No hardcoded level/element logic — that's the whole point. Old classes without the new fields get safe defaults; new classes get exact values from the template.

---

## Refactoring: myK9Show (shared scoresheets)

### File locations

| File | Package |
|------|---------|
| `AKCScentWorkScoresheet.tsx` | `packages/scoring-ui/src/components/scoresheets/AKC/` |
| `UKCNoseworkScoresheet.tsx` | `packages/scoring-ui/src/components/scoresheets/UKC/` |
| `ASCAScentDetectionScoresheet.tsx` | `packages/scoring-ui/src/components/scoresheets/ASCA/` |
| `useElementTimer.ts` | `packages/scoring-ui/src/hooks/` |
| `areaInitialization.ts` | `apps/myk9show/src/services/scoresheets/` |
| `akcScentWorkRules.ts` | `apps/myk9show/src/data/templates/` |
| `akcScentWorkFields.ts` | `apps/myk9show/src/data/templates/` |
| `akcScentWorkTemplate.ts` | `apps/myk9show/src/data/templates/` |

### Parent page wiring

**`apps/myk9show/src/pages/scoring/ScoresheetPage.tsx`**: Import `buildResolvedClassRules` from `@myk9/scoring-ui`. Build rules from the class record (available via `replicatedClassesTable`). Add `rules` to `scoresheetProps`.

**`apps/myk9show/src/pages/scoring/types.ts`**: The `toClassInfo()` function currently has a hardcoded `getMaxTimeForLevel()`. Remove it — time comes from the class record's `timeLimitSeconds`. [EXPANDED: This is task 9a below.]

**`apps/myk9show/src/pages/scoring/ScoresheetPage.tsx`**: The `detectScoresheetType()` function currently parses the class name string to guess organization and sport type. With `sport_type` on the trial record, replace this fragile parsing with a direct lookup from the trial's `sport_type` field. [ADDED]

### Scoresheet changes (simplest-first)

**ASCA `ASCAScentDetectionScoresheet.tsx`** — Remove local `getAreaCount()`. Read `rules.areaCount` from props.

**UKC `UKCNoseworkScoresheet.tsx`** — Remove `isDualTimerLevel()`. Read `rules.timerMode` from props.

**AKC `AKCScentWorkScoresheet.tsx`** — Read `rules.areaCount` and `rules.timerMode` from props.

**`useElementTimer.ts`** — Change signature to accept `timerMode: 'single' | 'dual'` instead of `level` string. Now sport-agnostic.

**`areaInitialization.ts`** (myK9Show copy) — Accept `ResolvedClassRules` instead of sport/element/level strings. Single generic path using `rules.areaCount`.

**`akcScentWorkRules.ts`** — Replace switch statements with calls to `buildResolvedClassRules()`. Keep same export signatures during transition.

**`akcScentWorkFields.ts`** — Replace level-string checks with `ResolvedClassRules` field checks (e.g., `distractionCount > 0` instead of `level === 'Excellent'`).

**`akcScentWorkTemplate.ts`** — Mark as fallback-only. No active refactoring.

---

## Refactoring: myK9Q (app-specific scoresheets)

### File locations

| File | Location |
|------|----------|
| `ASCAScentDetectionScoresheet.tsx` | `apps/myk9q/src/pages/scoresheets/ASCA/` |
| `UKCNoseworkScoresheet.tsx` | `apps/myk9q/src/pages/scoresheets/UKC/` |
| `AKCScentWorkScoresheet.tsx` | `apps/myk9q/src/pages/scoresheets/AKC/` |
| `useScoresheetCore.ts` | `apps/myk9q/src/pages/scoresheets/hooks/` |
| `useElementTimer.ts` (local copy) | `apps/myk9q/src/pages/scoresheets/hooks/` |
| `areaInitialization.ts` (local copy) | `apps/myk9q/src/services/scoresheets/` |

### Hook wiring

**`useScoresheetCore.ts`**: Import `buildResolvedClassRules` from `@myk9/scoring-ui`. Build rules from the replicated class record (already loaded by the hook). Expose `rules: ResolvedClassRules` in the return value.

### Scoresheet changes

Same pattern as myK9Show — remove hardcoded functions, read from `core.rules` (provided by the hook) instead of computing locally.

**`areaInitialization.ts`** (myK9Q copy) — Same refactoring as myK9Show copy: accept `ResolvedClassRules`, use `rules.areaCount`.

### ReplicatedClass update

**Both apps**: Update `ReplicatedClass` interface to include the four new fields (`timerMode`, `hideCount`, `hidesKnown`, `distractionCount`). Update the DB-to-object mapping to read them.

---

## Testing Strategy

All tests use vitest. No DB calls.

### Test file 1: `buildResolvedClassRules.test.ts` (in `@myk9/scoring-ui`)

- Builds rules from complete class record
- Provides sensible defaults for missing fields
- Handles old classes without timer_mode/hide_count columns
- Returns correct types for all fields

### Test file 2: `areaInitialization.test.ts`

- Single-area initialization (ASCA Novice, AKC Container)
- Multi-area initialization (ASCA Excellent → 3, AKC Interior Master → 3)
- Accepts `ResolvedClassRules` as input

### Test file 3: Scoresheet component tests (myK9Show shared scoresheets)

- ASCA scoresheet renders correct area count from `rules.areaCount`
- UKC nosework renders dual timer when `rules.timerMode === 'dual'`
- UKC nosework renders single timer when `rules.timerMode === 'single'`
- AKC scoresheet renders multi-area layout when `rules.areaCount > 1`

### Test file 4: Multi-sport integration test

Verify that building rules from two different class records (AKC Container Novice vs UKC Container Superior) produces different `ResolvedClassRules` — different timer modes, time limits, area counts.

---

## Task Sequence

### Sprint A: Foundation

| # | Task | Depends on | Location |
|---|------|-----------|----------|
| 1 | DB migration: add `timer_mode`, `hide_count`, `hides_known`, `distraction_count` to classes | — | `supabase/migrations/` |
| 2 | Backfill migration: populate from `sport_class_rules` | 1 | `supabase/migrations/` |
| 3 | Create `ResolvedClassRules` type | — | `packages/scoring-ui/src/types/` |
| 4 | Create `buildResolvedClassRules()` builder | 3 | `packages/scoring-ui/src/utils/` |
| 5 | Write `buildResolvedClassRules.test.ts` | 4 | `packages/scoring-ui/src/utils/__tests__/` |
| 6 | Update `ReplicatedClass` interface in both apps | 1 | Both apps' replication modules |
| 7 | Update wizard to write rule fields when creating classes | 1 | `apps/myk9show/src/` (wizard) |

### Sprint B: myK9Show scoresheets

| # | Task | Depends on | Location |
|---|------|-----------|----------|
| 8 | Add `rules` prop to shared scoresheet interfaces | 3 | `packages/scoring-ui/` |
| 9 | Wire `ScoresheetPage.tsx` to build and pass rules | 4, 6, 8 | `apps/myk9show/` |
| 9a | Remove hardcoded `getMaxTimeForLevel()` from `toClassInfo()` | 6 | `apps/myk9show/src/pages/scoring/types.ts` | [ADDED]
| 9b | Replace `detectScoresheetType()` string parsing with trial `sport_type` lookup | 6 | `apps/myk9show/src/pages/scoring/ScoresheetPage.tsx` | [ADDED]
| 10 | Refactor ASCA scoresheet (shared) | 8 | `packages/scoring-ui/` |
| 11 | Refactor UKC nosework scoresheet (shared) | 8 | `packages/scoring-ui/` |
| 12 | Refactor `useElementTimer` to accept `timerMode` | 3 | `packages/scoring-ui/` |
| 13 | Refactor AKC scoresheet (shared) | 8 | `packages/scoring-ui/` |
| 14 | Refactor `areaInitialization.ts` (myK9Show) | 3 | `apps/myk9show/` |
| 15 | Refactor `akcScentWorkRules.ts` | 4 | `apps/myk9show/` |
| 16 | Refactor `akcScentWorkFields.ts` | 15 | `apps/myk9show/` |
| 17 | Mark `akcScentWorkTemplate.ts` as fallback-only | — | `apps/myk9show/` |

### Sprint C: myK9Q scoresheets

| # | Task | Depends on | Location |
|---|------|-----------|----------|
| 18 | Wire `useScoresheetCore` to build and expose rules | 4, 6 | `apps/myk9q/` |
| 19 | Refactor ASCA scoresheet (myK9Q) | 18 | `apps/myk9q/` |
| 20 | Refactor UKC nosework scoresheet (myK9Q) | 18 | `apps/myk9q/` |
| 21 | Refactor AKC scoresheet (myK9Q) | 18 | `apps/myk9q/` |
| 22 | Refactor `areaInitialization.ts` (myK9Q) | 3 | `apps/myk9q/` |
| 23 | Refactor `useElementTimer` (myK9Q local copy) | 12 | `apps/myk9q/` |

### Sprint D: Validation

| # | Task | Depends on | Location |
|---|------|-----------|----------|
| 24 | Write scoresheet component tests | 10, 11, 13 | `packages/scoring-ui/` |
| 25 | Write area initialization tests | 14, 22 | Both apps |
| 26 | Write multi-sport integration test | 4 | `packages/scoring-ui/` |
| 27 | Run `pnpm typecheck` + `pnpm lint`, fix issues | All | Monorepo root |
| 28 | Commit unstaged design doc status update | — | `docs/plans/` |

Sprints A-B-C are sequential (foundation → myK9Show → myK9Q). Within each sprint, tasks can partially parallelize. Sprint D runs after all code changes.

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Rules source at scoring time | Class record, not template store | Offline-first. Template used at creation, class used at scoring. |
| Shared code location | `@myk9/scoring-ui` | Both apps already depend on it. |
| Both apps refactored | Yes | User wants consistency and shared code. |
| Data flow (myK9Show) | Props-driven | Matches design doc. Scoresheets are pure renderers. |
| Data flow (myK9Q) | Hook-driven (`useScoresheetCore`) | Matches myK9Q's existing architecture. |
| Builder handles missing fields | Sensible defaults | Old classes (pre-migration) still work. |
| Range values | Not in `ResolvedClassRules` | Ranges are for the wizard. Scoresheets get concrete values. |
| AKC Nationals | Skip | Volatile rules, rare event. |
| MRV capacity | Skip | Barn Hunt only. |
| UKC Obedience/Rally | Skip | No template seed data yet. |

---

*Brainstorming session February 26, 2026. Revised after offline-first and cross-app review.*
