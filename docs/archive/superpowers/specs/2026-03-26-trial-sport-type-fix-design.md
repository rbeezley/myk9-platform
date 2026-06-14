# Trial sport_type Fix — Design Spec

**Date:** 2026-03-26
**Status:** Draft
**Scope:** Wire sport_type through trial creation and editing so scoresheets resolve correctly

## Problem

Trials created via the Show Creation Wizard have a null `sport_type` column. The scoresheet pages (`ScoresheetPage`, `SecretaryScoringPage`) read `trial.sportType` to resolve which scoresheet component to render. When it's null, the fallback `detectScoresheetType()` guesses from the class name — and fails for names like "Detective" that don't contain keywords like "scent" or "nosework." Result: "Entry Scoresheet Not Available."

The scoresheets themselves are fully ported and functional. The data just never reaches them.

## Root Cause

1. `TrialInput` (the type used by `addTrial()`) has no `sportType` field.
2. The wizard's `createTrials()` in `useShowCreationWizardActions.ts` omits `sportType` when building `TrialInput`, even though the wizard state has it.
3. `Trial` type in `trial.types.ts` has no `sportType` field, so the UI layer never carries it.
4. The trial edit panel has no way to set or derive `sport_type` on existing trials.

## Solution

### `deriveSportType()` mapping function

A single function that maps `(organization, trialType)` → sport_type code. This replaces the current `SPORT_TYPE_MAP` in `wizardStore.ts`.

```typescript
function deriveSportType(organization: string, trialType: string): string | null {
  const key = `${organization}:${trialType}`;
  const map: Record<string, string> = {
    'AKC:Scent Work': 'akc-scent-work',
    'AKC:FastCAT': 'akc-fast-cat',
    'UKC:Nosework': 'ukc-nosework',
    'UKC:Rally': 'ukc-rally',
    'UKC:Obedience': 'ukc-obedience',
    'UKC:Obedience & Rally': 'ukc-obedience',
    'ASCA:Scent Detection': 'asca-scent-detection',
  };
  return map[key] ?? null;
}
```

Returns `null` for org/discipline combos that don't have a scoresheet (e.g., AKC Agility). This is correct — those trials simply won't have a scoresheet component, and the UI gracefully shows "Not Available."

**Location:** Extract to a shared utility so both the wizard store and the trial edit panel can use it. Candidate: `apps/myk9show/src/utils/sportTypeUtils.ts` or co-located in `apps/myk9show/src/pages/scoring/types.ts` alongside the existing `mapSportType()` (the inverse function).

### Type changes

**`Trial` interface** (`apps/myk9show/src/components/trials/types/trial.types.ts`):

- Add `sportType?: string`

**`TrialInput` interface** (`apps/myk9show/src/store/trial-store-types.ts`):

- Add `sportType?: string`

### Wizard fix

**`useShowCreationWizardActions.ts` line 126-140:**

- Add `sportType: wizardTrial.sportType` to the `TrialInput` object passed to `addTrialToStore()`.

The wizard store's `addTrial` action already sets `sportType` on the wizard state (line 168: `sportType: trial.sportType ?? SPORT_TYPE_MAP[state.show.organization]`). The only gap is that `createTrials()` drops it when building `TrialInput`.

### Trial edit panel fix

**`TrialEditPanel.tsx`:**

- On save, derive `sportType` from the trial's organization + trialType using `deriveSportType()`.
- The organization comes from the parent show. The trialType is already editable in the panel.
- No new UI field needed — `sportType` is computed, not user-entered.

### ReplicatedTrialsTable

Already correctly maps `sportType ↔ sport_type` in `rowToTrial()` and `toSupabaseRow()`. No changes needed.

## Files Changed

| File                                                                                   | Change                                                      |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `apps/myk9show/src/pages/scoring/types.ts`                                             | Add `deriveSportType()` function                            |
| `apps/myk9show/src/components/trials/types/trial.types.ts`                             | Add `sportType?: string` to `Trial`                         |
| `apps/myk9show/src/store/trial-store-types.ts`                                         | Add `sportType?: string` to `TrialInput`                    |
| `apps/myk9show/src/store/wizardStore.ts`                                               | Replace `SPORT_TYPE_MAP` with import of `deriveSportType()` |
| `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts` | Pass `sportType` in `createTrials()`                        |
| `apps/myk9show/src/components/panels/edit/TrialEditPanel.tsx`                          | Derive and pass `sportType` on save                         |

## Testing

- Unit test for `deriveSportType()`: each org/discipline combo returns the correct code, unknown combos return null.
- Integration: create a show via the wizard, verify the trial's `sport_type` is set in the database.
- End-to-end: click a card on the class details page, verify the scoresheet loads instead of "Not Available."

## Out of Scope

- Backfilling existing test data (manual re-save or SQL update).
- `AKC:Scent Work Nationals` — this is a special event type, not a standard trial discipline. Can be added to the map when needed.
- New UI for sport_type selection — derived automatically from org + trialType.
