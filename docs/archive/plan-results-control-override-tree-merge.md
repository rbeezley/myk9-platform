# Results Control — Merge the duplicated override trees into one hierarchy

> **Status:** Complete — shipped in [#996](https://github.com/rbeezley/myk9-platform/pull/996) (squash `ce6df5f51`). The merge resolution also folded in #986's inherited-preset display (`overrideTreeUtils.inheritedPresetLabel`).

## Problem

The secretary Results Control page (`apps/myk9show/src/pages/secretary/ResultsControlPage/`)
renders the same trial→class hierarchy **four times**:

| Card                  | Trial-level tree                     | Class-level tree                          |
| --------------------- | ------------------------------------ | ----------------------------------------- |
| Results Visibility    | `TrialOverrides.tsx`                 | `ClassOverrides.tsx`                      |
| Self Check-In         | trial block in `SelfCheckinSection`  | class block in `SelfCheckinSection`       |

The secretary navigates the same "Trial Overrides / Class Overrides" structure twice,
with near-identical headers, collapse-by-trial behavior, and reset buttons — only the
control differs (visibility **preset `Select`** vs check-in **`Switch`**).

### Key facts that make the merge safe

1. **Same DB rows.** `trial_visibility_overrides` and `class_visibility_overrides` each
   carry *both* the visibility columns (`preset`, `*_timing`) *and* `self_checkin_enabled`.
   The two cards already edit the same row, one column-group each. The query layer already
   returns both facets together (`TrialOverrideEntry.override` + `.selfCheckinEnabled`).
2. **Edits are already independent.** `useUpdateTrialOverride` / `useUpdateClassOverride`
   send only the columns passed; JS `undefined` is dropped from the upsert, so on conflict
   the other facet is preserved. Setting a preset does not clobber check-in, and vice versa.
3. **Reset is the one coupled operation.** `useResetOverride` nulls *every* column, so the
   Reset button in *either* card silently wipes *both* facets. Today this coupling is hidden
   across two trees. → **Decision: split into two independent resets** (see below).
4. **The bulk bar is already unified.** `BulkOperationsBar` operates on one class selection
   with both "Apply Preset" and "Enable/Disable Check-in". Only the trees above it are split.
5. **The merged pattern already ships.** `components/secretary/SettingsOverrideCard.tsx`
   combines visibility + per-field + check-in + reset for a single trial/class detail page.

## Decisions (confirmed with user)

- **Full merge into one tree.** One trial→class hierarchy; each row carries the visibility
  preset `Select` *and* the check-in `Switch` side by side. Show-level controls (preset
  cards + show check-in switch) stay above the tree.
- **Two independent resets per row.** A visibility reset nulls only `preset` + `*_timing`;
  a check-in reset nulls only `self_checkin_enabled`. Fixes the hidden coupling and honors
  the "class ?? trial ?? show" cascade independently per facet.

## Out of scope

- `ShowSettingsPage/` (separate live route with its *own* `SelfCheckinSection`). Flagged as
  a follow-up consolidation; not touched here. Verify its tests/behavior stay green.
- `SettingsOverrideCard.tsx` (single-entity detail card). Must keep working unchanged — the
  `useResetOverride` change is backward-compatible via a defaulted `facet` param.

## Inheritance semantics to preserve (MUST verify)

- **Visibility (per field):** `class.override[f] ?? trial.override[f] ?? show.visibility[f]`
  for each of `placement`, `qualification`, `time`, `faults`. Preset is a label over these.
- **Check-in (boolean):** `class.selfCheckinEnabled ?? trial.selfCheckinEnabled ?? show.selfCheckinEnabled`.
- A merged row's two facets can sit at **different** inheritance levels (e.g. visibility
  overridden at class, check-in inheriting from trial). The row therefore shows a
  **per-control** status label, not one row-level label.
- Preserve every `aria-label` (`Select ${className}`, `Self check-in for ${name}`, reset
  titles) and the `min-h-[44px]/min-w-[44px]` touch-floor wrappers around switches and
  `size="icon-lg"` reset buttons.

## Implementation phases

### Phase 1 — Make `useResetOverride` facet-aware (backward compatible)
`apps/myk9show/src/hooks/mutations/useShowSettingsMutations.ts`
- Extend `OverrideReset` with `facet?: 'visibility' | 'checkin' | 'all'` (default `'all'`).
- Extract a pure `buildResetPayload({ level, entityId, facet, userId, timestamp })` helper:
  - `facet: 'all'` → null all six override columns (today's behavior).
  - `facet: 'visibility'` → null `preset` + 4 `*_timing`; **omit** `self_checkin_enabled`.
  - `facet: 'checkin'` → null `self_checkin_enabled`; **omit** the visibility columns.
  - Omission (not `null`) is what preserves the other facet on upsert-conflict.
- **Assertion-first test** (`__tests__/useShowSettingsMutations.resetPayload.test.ts`):
  pin the exact key set for each facet before wiring the component.

### Phase 2 — Build the unified `OverrideTree` component
`apps/myk9show/src/pages/secretary/ResultsControlPage/OverrideTree.tsx`
- One `Collapsible` per trial. The **trial row** (always visible) carries: trial name,
  per-facet status text, visibility `Select`, check-in `Switch`, two resets, and a
  dedicated chevron trigger. The chevron is the *only* collapsible trigger — controls are
  NOT inside the trigger (avoids nested-interactive a11y bug + accidental toggles).
- Expanded content: "Select all" checkbox + one **class row** per class: bulk checkbox,
  class name, per-facet status text, visibility `Select`, check-in `Switch`, two resets.
- Pure helpers extracted to `overrideTreeUtils.ts` (keep files < 500 lines):
  - `resolveTrialFacets(trial, trialOverride, settings)` → `{ visibility, checkin } status`.
  - `resolveClassFacets(cls, classOverride, trialOverride, settings)` → per-facet status +
    effective values, implementing the cascade above.
- Reuse `PRESET_INFO`, `PRESET_CONFIGS`, `hasVisibilityOverride` from `@myk9/secretary`.
- Props mirror the union of today's components: `showId`, `trials`, `classes`,
  `trialOverrides`, `classOverrides`, `settings`, plus the bulk-selection callbacks
  (`selectedClasses`, `onToggleClass`, `onToggleAllInTrial`).

### Phase 3 — Rewire the page
`apps/myk9show/src/pages/secretary/ResultsControlPage/index.tsx`
- Replace the two cards with **one** card ("Results & Self Check-In") containing:
  1. **Show defaults** subsection: `PresetSelector` (visibility) + the show-level check-in
     `Switch` row (lifted out of `SelfCheckinSection`).
  2. **Overrides** subsection: `<OverrideTree … />`.
- Keep `BulkOperationsBar` and `hasManualReleaseClasses` logic untouched.
- Delete `TrialOverrides.tsx`, `ClassOverrides.tsx`, `SelfCheckinSection.tsx`.

### Phase 4 — Migrate tests
- **Delete** `TrialOverrides.test.tsx` and the *second* `describe` of `ClassOverrides.test.tsx`
  (the `ResultsControlPage/ClassOverrides` block). **Keep** the first `describe` — it tests
  the still-live `ShowSettingsPage/SelfCheckinSection`; move it to a correctly-named file
  `ShowSettingsSelfCheckin.test.tsx` so the filename stops lying.
- **Delete** `ResultsControlPage/__tests__/SelfCheckinSection.test.tsx` (component removed);
  re-home its a11y assertions (every switch named, 44px tap rows, `icon-lg` reset sizing)
  into a new `OverrideTree.test.tsx`.
- New `OverrideTree.test.tsx`: cascade resolution (3 levels × 2 facets), per-facet status
  labels when facets differ, independent reset dispatch (`facet: 'visibility'` vs
  `'checkin'`), bulk checkbox callbacks, and the preserved a11y contract.
- Update `ResultsControlPage.test.tsx`: the `"Self Check-In"` header assertion → new card
  title; ensure preset cards + tree still render.

### Phase 5 — Verify
- `pnpm --filter @myk9/secretary build` (if helpers move) → `cd apps/myk9show && pnpm test`
  for the touched files, then `pnpm typecheck` + `pnpm lint`.
- Live check via preview: set a class visibility override, confirm check-in still inherits
  (and vice versa); reset each facet independently; confirm bulk bar still applies to both.

## Risks

- **Nested interactive elements** in the trial trigger — mitigated by a dedicated chevron.
- **Per-facet status drift** — covered by cascade unit tests with facets at different levels.
- **Reset omission semantics** — the assertion-first payload test is the guardrail; an
  accidental `self_checkin_enabled: null` in a visibility reset would re-introduce coupling.
