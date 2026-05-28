# PR E2d-2b — EntryList page orchestrator move + host shims

**Status:** Plan ready, baseline green (25/25 typecheck, 309/309 ringside tests).
**Branch:** `worktree-ringside-pr-e2d-2b-orchestrator-move` (worktree).
**Base:** `379052ee` (post-PR #410, post-PR #407).
**Closes:** Phase 0 of the ringside unification plan once merged. PR F (generic scoresheets) unblocks after.

---

## Goal

Move the 7-file, ~2.3k-LOC EntryList page-orchestrator tree from
`apps/myk9q/src/pages/EntryList/` into `packages/ringside/src/pages/EntryList/`,
and build two host shims (single-class + combined) that own all `useState`,
call the three host hooks (`useEntryListHandlers`, `useEntryListActions`,
`useEntryListEffects`), assemble the contract bags, and render the ringside
page.

The contract surface is already complete from PRs #402–#407. This PR is the
mechanical wiring.

---

## Architectural decisions (locked in this session)

1. **`react-router-dom` becomes a ringside peer/dev dep.** Both consumers
   (myK9Q, myK9Show) already use it. The moved components call
   `useNavigate()` directly as today; no callback bloat in the contract.
2. **`@myk9/scoring-ui` becomes a ringside workspace dep.** Single `haptic.medium()`
   callsite in `SortableEntryCard`. Slotting a one-liner is heavier than the
   dep.
3. **Ringside-local `EntryListPermission` union.** Narrow 4-key union (`'canScore'
   | 'canCheckInDogs' | 'canChangeRunOrder' | 'canManageClasses'`) consumed by
   the moved components' `hasPermission` props. Matches the page contract's
   `context.hasPermission` shape exactly. Host's `usePermission()` return type
   already satisfies this (it's a function over `keyof UserPermissions`, which
   is a superset).
4. **A1 architecture is locked.** Ringside owns pure UI + types + filter/drag
   hooks + the page render. Host owns `useState`, the three side-effecting
   hooks, auth, permissions, all dialog implementations, all UI primitives.
5. **Both assertion-test files stay where they are.** They live in apps/myk9q
   because both ends of their compile-time check (host hooks + host primitives)
   live in apps/myk9q. No changes needed to them — they continue proving the
   contract.

---

## File-level scope

### Moving into `packages/ringside/src/pages/EntryList/`

| Source path | Dest path | LOC | Notes |
|---|---|---|---|
| `apps/myk9q/src/pages/EntryList/SortableEntryCard.tsx` | `packages/ringside/src/pages/EntryList/SortableEntryCard.tsx` | 257 | DogCard via layout slot; haptic via `@myk9/scoring-ui` dep; permission union narrowed |
| `apps/myk9q/src/pages/EntryList/components/EntryListContent.tsx` | `packages/ringside/src/pages/EntryList/components/EntryListContent.tsx` | 153 | Imports SortableEntryCard from sibling; permission union narrowed |
| `apps/myk9q/src/pages/EntryList/components/EntryListHeader.tsx` | `packages/ringside/src/pages/EntryList/components/EntryListHeader.tsx` | 203 | 6 layout slots; entryListHeaderHelpers already in ringside |
| `apps/myk9q/src/pages/EntryList/components/EntryListDialogs.tsx` | `packages/ringside/src/pages/EntryList/components/EntryListDialogs.tsx` | 319 | 10 dialog slots; auth via context prop; organizationUtils inlined or slotted |
| `apps/myk9q/src/pages/EntryList/CombinedEntryListDialogs.tsx` | `packages/ringside/src/pages/EntryList/CombinedEntryListDialogs.tsx` | 197 | 4-dialog subset slot; FilterPanel slot |
| `apps/myk9q/src/pages/EntryList/EntryList.tsx` | `packages/ringside/src/pages/EntryList/EntryListPage.tsx` | 475 | Renamed `EntryList` → `EntryListPage` to avoid barrel collision; pure controlled-render of `EntryListPageProps` |
| `apps/myk9q/src/pages/EntryList/CombinedEntryList.tsx` | `packages/ringside/src/pages/EntryList/CombinedEntryListPage.tsx` | 457 | Renamed similarly; consumes `CombinedEntryListPageProps` |

### Staying on the host (slot-injected or shimmed)

- **10 dialog implementations** in `apps/myk9q/src/components/dialogs/` — slot-injected via `EntryListDialogSlots`
- **11 UI primitives** in `apps/myk9q/src/components/ui/` + `apps/myk9q/src/components/DogCard.tsx` — slot-injected via `EntryListLayoutSlots`
- **`useEntryListHandlers.ts`** (653 LOC) — host-only; return type satisfies ringside's `EntryListHandlers` contract
- **`useEntryListActions.ts`** — host-only; return type satisfies `EntryListActions`
- **`useEntryListEffects.ts`** — host-only; void return, no contract
- **`useEntryListData.ts` (apps/myk9q shim)** — already a thin shim into ringside's data hook; host shim continues to call it
- **`CombinedEntryList.print.ts`** (162 LOC) — uses host `reportService`; exposed via the shim's `onPrintSortOrder` prop
- **`AKCNationalsScoresheet*` files** — skipped per master plan, fresh-port in Phase F

### New: two host shims (≈80 LOC each)

| Path | Role |
|---|---|
| `apps/myk9q/src/pages/EntryList/EntryList.tsx` (rewritten) | Single-class shim: owns 19 useState slots, calls `useEntryListData/Handlers/Actions/Effects` + `useEntryListFilters` + `useDragAndDropEntries`, assembles all 6 bags + context, renders `<EntryListPage>` from `@myk9/ringside` |
| `apps/myk9q/src/pages/EntryList/CombinedEntryList.tsx` (rewritten) | Combined shim: owns 10 useState slots, calls `useEntryListData/Actions` + `useEntryHandlers` (already in ringside) + filters + drag, binds `dispatchPrintAction`/`applyRunOrderPresetScoped`/`getScoresheetNavigationRoute`, renders `<CombinedEntryListPage>` |

### Deletions

- `apps/myk9q/src/pages/EntryList/SortableEntryCard.tsx` → replaced by re-export shim from `@myk9/ringside`
- `apps/myk9q/src/pages/EntryList/components/EntryListContent.tsx` → re-export shim
- `apps/myk9q/src/pages/EntryList/components/EntryListHeader.tsx` → re-export shim
- `apps/myk9q/src/pages/EntryList/components/EntryListDialogs.tsx` → re-export shim
- `apps/myk9q/src/pages/EntryList/CombinedEntryListDialogs.tsx` → re-export shim
- Two `.types.ts` / `.helpers.ts` re-export hosts collapsed if no longer needed

### Out of scope (separate PRs)

- Delete `apps/myk9q/src/pages/EntryList/hooks/useEntryListSubscriptions.ts` (dead code) — flag in todos
- Delete `apps/myk9q/src/pages/EntryList/hooks/useEntryNavigation.ts` (dead code) — flag in todos
- Reconcile host `RunOrderPreset` vs `runOrderService` Record type — pre-existing, not blocking

---

## Phase-by-phase plan

### Phase 1 — Dependency prep (≤10 min)

1. Update `packages/ringside/package.json`:
   - Add to **dependencies**: `"@myk9/scoring-ui": "workspace:*"`
   - Add to **peerDependencies**: `"react-router-dom": "^6.0.0 || ^7.0.0"`
   - Add to **devDependencies**: `"react-router-dom": "^7.x.x"` (matching apps/myk9q's pinned range)
2. Force lockfile rewrite per PR #407 lesson #2:
   ```bash
   pnpm --filter @myk9/ringside add react-router-dom -D
   pnpm --filter @myk9/ringside add @myk9/scoring-ui
   ```
3. Run `pnpm install` once more for safety; confirm `pnpm-lock.yaml` reflects new ranges.
4. `pnpm --filter @myk9/ringside test -- --run` should still pass (309/309).

**Exit criteria:** Lockfile updated, ringside tests green, typecheck green.

### Phase 2 — Move leaf components (≤45 min)

Order chosen so each move's imports are already in ringside before that file lands.

#### 2a. Move `SortableEntryCard.tsx`

1. Copy `apps/myk9q/src/pages/EntryList/SortableEntryCard.tsx` → `packages/ringside/src/pages/EntryList/SortableEntryCard.tsx`.
2. Rewrite imports:
   - `DogCard` → take as required prop, typed `ComponentType<DogCardProps>`
   - `Entry` → from `'../../stores/entryStore'`
   - `UserPermissions` → remove; replace with narrow `EntryListPermission` union (defined in this file or pulled from a new `./permissions.ts`)
   - `getStatusBorderClass` → from `'./sortableEntryCardUtils'`
   - `ResultBadges`, `StatusBadgeContent` → from `'./SortableEntryCardComponents'`
   - `haptic` → from `'@myk9/scoring-ui'` (unchanged)
3. Update `SortableEntryCardProps`:
   - Add `DogCard: ComponentType<DogCardProps>` prop
   - Narrow `hasPermission` to `(p: EntryListPermission) => boolean`
4. Replace `<DogCard ... />` with `<DogCard ... />` from prop (lower-cased local alias inside the component body for clarity, e.g. `DogCardSlot`).
5. Add the new file to `packages/ringside/src/pages/EntryList/index.ts` barrel as `export { SortableEntryCard }` + `export type { SortableEntryCardProps }`.
6. Add to root `packages/ringside/src/index.ts` — check for `SortableEntryCard` name collision (none expected).
7. Replace `apps/myk9q/src/pages/EntryList/SortableEntryCard.tsx` with a re-export shim:
   ```ts
   /* eslint-disable react-refresh/only-export-components */
   export { SortableEntryCard } from '@myk9/ringside';
   export type { SortableEntryCardProps } from '@myk9/ringside';
   ```
8. Typecheck + ringside tests.

#### 2b. Move `EntryListContent.tsx`

1. Copy to `packages/ringside/src/pages/EntryList/components/EntryListContent.tsx`.
2. Rewrite imports:
   - `SortableEntryCard` → from `'../SortableEntryCard'`
   - `Entry` → from `'../../../stores/entryStore'`
   - `UserPermissions` → drop; use `EntryListPermission`
   - `ClassInfo` → from `'../hooks'` (already in ringside)
3. Update `EntryListContentProps`:
   - Add `DogCard: ComponentType<DogCardProps>` (passed through to SortableEntryCard)
   - Narrow `hasPermission` to `EntryListPermission`
4. Pass `DogCard` through to `<SortableEntryCard>`.
5. Update `packages/ringside/src/pages/EntryList/components/index.ts` (sibling barrel) with the new export. (Already has `EntryListHeader` and `EntryListContent` placeholders? — verify and add if missing.)
6. Add to ringside root barrel.
7. Replace host file with re-export shim.
8. Typecheck + ringside tests.

#### 2c. Move `EntryListHeader.tsx`

1. Copy to `packages/ringside/src/pages/EntryList/components/EntryListHeader.tsx`.
2. Rewrite imports:
   - `useNavigate` → from `'react-router-dom'` (new peer dep)
   - `Info` → from `'lucide-react'`
   - 5 host primitives (`HamburgerMenu`, `CompactOfflineIndicator`, `SyncIndicator`, `RefreshIndicator`, `FilterTriggerButton`) → drop direct imports; take as props
   - `ClassDetailsPopover` → take as prop (typed `ComponentType<ClassDetailsPopoverProps>`)
   - `ClassInfo` → ringside hooks
   - `ActionsDropdownMenu`, `getStatusBadge`, `ActionsMenuConfig` → from `'./entryListHeaderHelpers'` (already in ringside)
   - `formatTrialDate` → from `'@myk9/core'` (verify export exists; otherwise from `@myk9/ringside` re-export)
3. Update `EntryListHeaderProps`:
   - Replace 6 primitives with required `ComponentType<...>` props
   - Keep all existing prop names (the shim passes them through unchanged)
4. The 6 primitives render via lower-cased local aliases in JSX.
5. Replace host file with re-export shim.
6. Typecheck + ringside tests.

#### 2d. Move `EntryListDialogs.tsx`

1. Copy to `packages/ringside/src/pages/EntryList/components/EntryListDialogs.tsx`.
2. Rewrite imports:
   - 10 dialog imports → drop; take as props
   - `useAuth`, `usePermission` → drop; take `context` prop matching `EntryListPageProps.context` shape (+ `hasRole` from a new context field if needed — verify usage of `hasRole(['admin', 'judge'])`)
   - `useNavigate` → keep (`react-router-dom` is now a ringside dep)
   - `parseOrganizationData`, `hasRuleDefinedMaxTimes` → these are app-side utilities. Two paths:
     - **A.** Move them to ringside (verify they're pure — see audit)
     - **B.** Slot them as a small `EntryListDialogsHelpers` bag prop
     - **Chosen:** A if pure (likely), otherwise pass `hasRuleDefinedMaxTimes` and `orgData` as derived values from the shim
3. Refactor `canModifyClassSettings` derivation — currently uses `hasRole`. Options:
   - Add `hasRole` to ringside's context contract (matches host's hook signature)
   - Pass `canModifyClassSettings: boolean` precomputed from the shim
   - **Chosen:** Pass precomputed from shim (smaller surface, less coupling)
4. Update `EntryListDialogsProps` — flatten the 10 dialog slots into props (or accept the whole `EntryListDialogSlots` bag as one prop).
5. Replace host file with re-export shim.
6. Typecheck + ringside tests.

#### 2e. Move `CombinedEntryListDialogs.tsx`

Same shape as 2d but with the 4-dialog subset (`CheckinStatusDialog`, `RunOrderDialog`, `ScoresheetPrintDialog`, `FilterPanel`) + 4 leaf components (`ResetMenuPopup`, `ResetConfirmDialog`, `SelfCheckinDisabledDialog`, `SuccessToast`, `FloatingDoneButton` — already in ringside, direct import).

**Exit criteria for Phase 2:** All 5 leaf components moved + re-exported. Both
assertion files still compile. Ringside tests green. Host typecheck green.

### Phase 3 — Move page orchestrators (≤45 min)

#### 3a. Move `EntryList.tsx` → `EntryListPage.tsx`

1. Copy `apps/myk9q/src/pages/EntryList/EntryList.tsx` → `packages/ringside/src/pages/EntryList/EntryListPage.tsx`.
2. Rename component: `EntryList` → `EntryListPage`.
3. Refactor the function signature: takes `EntryListPageProps` (the bag from `pageProps.ts`) instead of reading `useParams`/`useAuth`/`useState` itself.
4. Inside the body:
   - Replace `useParams` destructure with `props.classId`
   - Replace `useAuth`/`usePermission` with `props.context.{role, showContext, hasPermission}`
   - Replace all `useState` declarations with `props.uiState.*` reads + `props.uiActions.set*` calls
   - Replace `useEntryListData/Handlers/Actions/Effects/Filters/DragAndDrop` hook calls with `props.data`, `props.handlers`, `props.actions`, etc.
   - Drag, filter, and effects hooks STAY in the shim (not the page) per A1 architecture — so this page no longer calls them at all
   - Pass dialog slots from `props.dialogs.*` into `<EntryListDialogs>` (now from ringside)
   - Pass layout slots from `props.layout.*` into `<EntryListHeader>`, `<PullToRefresh>`, `<FilterPanel>`, `<ErrorState>`
   - Remove the `useEntryListFilters` hook call — its return values become `props.uiState.{activeTab, sortOrder, searchTerm}` + matching setters. The hook itself is called in the shim and threaded in.
   - **Decision needed:** Filters return rich derived data (`filteredEntries`, `pendingEntries`, `completedEntries`, `entryCounts`) — these need to either be added to the page-props bag OR computed inline in the page from `props.uiState.localEntries`. Cleanest: add a `derived` field to props that the shim computes. **Choose:** flatten `filteredEntries`, `pendingEntries`, `completedEntries`, `entryCounts`, `currentEntries`, `statusTabs`, `sortOptions`, `hasActiveFilters` into a `pageDerived` prop — these are page-render derivations, not state.
5. Inside `derived`, also include `sensors`, `handleDragStart`, `handleDragEnd` from the drag hook (or pass them as a separate `drag` bag — match `pageProps.ts` shape; check whether the contract names them).
6. Verify: the file should be a pure controlled render. No `useState`, no `useEffect`, no hook calls except possibly `useMemo` for trivial derivations and any internal child-render memo guards.
7. Add to ringside barrel: `export { EntryListPage }` + `export type { EntryListPageProps }` (already exported as type).
8. Add to root `packages/ringside/src/index.ts`.

**Note on derived data:** `pageProps.ts` does NOT currently include `pageDerived`
— it expects the page to use `uiState.localEntries` and call the filter/drag
hooks internally. But the architecture decision says hooks live in the shim.
This is a real gap. Two paths:

- **Path A (extend the contract):** Add `derived: { filteredEntries, pendingEntries, completedEntries, currentEntries, entryCounts, sensors, handleDragStart, handleDragEnd }` to `EntryListPageProps`. Update the contract file.
- **Path B (page calls pure-hooks):** Page calls `useEntryListFilters` and `useDragAndDropEntries` itself — they're already in ringside, pure, no host coupling. Shim only owns the imperative `useState` slots + the side-effecting host hooks.

**Chosen: Path B.** The two pure ringside hooks are safe for the page to call.
Keeps the contract slim and matches what the page actually needs to compute
from its props. This means the page DOES call exactly two hooks
(`useEntryListFilters`, `useDragAndDropEntries`); these are pure and live in
the same package. The shim no longer needs to pass `filteredEntries` etc. as
props.

Re-read step 4 with Path B in mind: `useEntryListFilters` and
`useDragAndDropEntries` remain in the page; `useEntryListData/Handlers/Actions/Effects`
move to the shim.

#### 3b. Move `CombinedEntryList.tsx` → `CombinedEntryListPage.tsx`

Same shape as 3a, consuming `CombinedEntryListPageProps`. Differences:
- Uses `combinedHandlers` (smaller bag from `useEntryHandlers`, already in ringside)
- No `useEntryListEffects` call (combined view doesn't need it)
- Uses `props.onPrintSortOrder`, `props.onApplyRunOrder`, `props.getScoresheetNavigationRoute` for the host-bound service wrappers
- Internal `useMemo` for `sortedEntries`, `pendingEntries`, `completedEntries`, `sectionTabs`, `statusTabs`, `sortOptions`, `hasActiveFilters` — all derivable from props
- Calls `useEntryListFilters` and `useDragAndDropEntries` internally (Path B)

#### 3c. Add to root ringside barrel

```ts
// PR E2d-2b — page orchestrators
export { EntryListPage } from './pages/EntryList';
export { CombinedEntryListPage } from './pages/EntryList';
```

**Exit criteria for Phase 3:** Both pages compile inside ringside. Ringside tests
still green. Host typecheck still green (since the original
`apps/myk9q/src/pages/EntryList/EntryList.tsx` and `CombinedEntryList.tsx`
files still exist — they get rewritten in Phase 4).

### Phase 4 — Build host shims (≤30 min)

#### 4a. Rewrite `apps/myk9q/src/pages/EntryList/EntryList.tsx` as shim

Replaces the old 475-LOC page with ~100 LOC of pure assembly:

```tsx
import { useParams } from 'react-router-dom';
import { useState, useRef } from 'react';
import { EntryListPage, type EntryListPageProps } from '@myk9/ringside';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import { useEntryListData } from './hooks/useEntryListData';
import { useEntryListActions } from './hooks/useEntryListActions';
import { useEntryListHandlers } from './hooks/useEntryListHandlers';
import { useEntryListEffects } from './hooks/useEntryListEffects';
// 10 dialog imports (passed to EntryListPage as `dialogs` bag)
import { CheckinStatusDialog } from '../../components/dialogs/CheckinStatusDialog';
// ... (9 more)
// 11 UI primitive imports (passed as `layout` bag)
import { HamburgerMenu, CompactOfflineIndicator, /* ... */ } from '../../components/ui';
import { DogCard } from '../../components/DogCard';
import { ClassDetailsPopover } from '../../components/dialogs/ClassDetailsPopover';

const EntryList: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const { showContext, role } = useAuth();
  const { hasPermission } = usePermission();
  const isDraggingRef = useRef<boolean>(false);

  // Data + hooks
  const { entries, classInfo, isRefreshing, fetchError, refresh } =
    useEntryListData({ classId, isDraggingRef });
  const actions = useEntryListActions(refresh);

  // 19 useState slots (mirrors EntryListUiState exactly)
  const [localEntries, setLocalEntries] = useState<Entry[]>([]);
  // ... (18 more)

  // The 16-or-so deps for useEntryListHandlers
  const handlers = useEntryListHandlers({ /* threading */ });

  // Side effects (returns void)
  useEntryListEffects({ /* threading */ });

  return (
    <EntryListPage
      classId={classId}
      data={{ entries, classInfo }}
      dataStatus={{ isRefreshing, fetchError, refresh }}
      handlers={handlers}
      actions={actions}
      uiState={{ localEntries, manualOrder, /* ... 17 more */ }}
      uiActions={{ setLocalEntries, setManualOrder, /* ... 17 more */ setActiveTab, setSortOrder }}
      dialogs={{ CheckinStatusDialog, RunOrderDialog, /* ... 8 more */ }}
      layout={{ HamburgerMenu, CompactOfflineIndicator, /* ... 8 more */ }}
      context={{ role, showContext, hasPermission }}
    />
  );
};

export default EntryList;
```

**Note:** `setActiveTab`/`setSortOrder` come from `useEntryListFilters`, which
under Path B is called inside the ringside page. So they cannot be passed by
the shim. The contract's `uiActions` field for these is therefore wrong under
Path B and must be removed from `EntryListUiActions`. Will update the contract
in Phase 3 alongside the page move.

#### 4b. Rewrite `apps/myk9q/src/pages/EntryList/CombinedEntryList.tsx` as shim

Same shape, smaller. Owns 10 useState slots. Binds:
- `onPrintSortOrder: (type, sortOrder) => dispatchPrintAction(type, sortOrder, classInfo, showContext?.org || '', entries)`
- `onApplyRunOrder: (preset, scope, mode) => applyRunOrderPresetScoped(localEntries, preset, scope || 'all', mode || 'renumber')` (and follow with `setLocalEntries(result)` etc. — verify shim ownership of optimistic update vs page)
- `getScoresheetNavigationRoute: (entry) => getScoresheetNavigationRoute(showContext?.org || '', entry)`

**Decision on `onApplyRunOrder`:** Looking at the existing combined logic in
`CombinedEntryList.tsx:222`, it does optimistic local update +
`setRunOrderDialogOpen(false)` + `setShowSuccessMessage(true)` + `setSortOrder('run')`
+ timeout + `await refresh()`. These mutations are mixed across state owned
by both ends. Cleanest: the shim's `onApplyRunOrder` is the full async
function (returns Promise<void>); it does everything; the page just calls
it and re-renders when the resulting state lands.

**Exit criteria for Phase 4:** Both host files rewritten as shims. App still
boots in dev mode (smoke test: `pnpm dev:q`, navigate to a class entry list,
no console errors). Both assertion files still compile.

### Phase 5 — Cleanup + verification (≤30 min)

1. Delete now-unused files in `apps/myk9q/src/pages/EntryList/`:
   - `useEntryListSubscriptions.ts` (dead code, flagged)
   - `hooks/useEntryNavigation.ts` (dead code, flagged)
   - `CombinedEntryList.types.ts` if all types are now re-exports from ringside (verify)
   - `CombinedEntryList.helpers.ts` if all helpers are in ringside (the impure `fetchClassRequirements` stays — see handoff)
2. Update barrel `apps/myk9q/src/pages/EntryList/index.ts` if it exists; verify the route file (`App.tsx`) still imports `EntryList` and `CombinedEntryList` from the right path.
3. Update the `EntryListUiActions` contract in `packages/ringside/src/pages/EntryList/pageProps.ts`:
   - Remove `setActiveTab` and `setSortOrder` (now owned by the page's internal `useEntryListFilters` call)
4. Run the full verification suite:
   ```bash
   pnpm typecheck                                    # 25/25
   pnpm --filter @myk9/ringside test -- --run        # ≥309 (new tests may add)
   pnpm --filter @myk9/q test -- --run               # ≥2115 + 4 skipped
   pnpm --filter @myk9/q lint --max-warnings 0       # clean
   pnpm --filter @myk9/q build                       # clean
   pnpm --filter @myk9/ringside build                # clean
   ```
5. **Coverage gate sanity:** apps/myk9q coverage thresholds are 45/41/49/45.
   Run `pnpm --filter @myk9/q test:coverage -- --run` and confirm we're still
   above the threshold. Per PR #407 lessons, the page move drags 2k LOC out
   of the apps/myk9q coverage denominator — coverage may rise modestly. If it
   drops, investigate before pushing.

### Phase 6 — Tests for the new ringside surface (≤30 min)

Add minimal smoke tests for the moved page components. The pages themselves
are hard to unit-test (large prop bags, deep render tree), but the leaf
components are testable:

1. `packages/ringside/src/pages/EntryList/SortableEntryCard.test.tsx` — render with mock `DogCard` slot + minimal entry; verify drag handle gating, status badge click delegation, prefetch wiring.
2. `packages/ringside/src/pages/EntryList/components/EntryListContent.test.tsx` — render with 3 entries + mock `DogCard`; verify empty state, drag-mode class, sectionBadge plumbing.
3. `packages/ringside/src/pages/EntryList/components/EntryListHeader.test.tsx` — render with mock primitives; verify popover open/close on hasExtraInfo, actions-menu close-on-outside-click.

Skip page-level tests (`EntryListPage`, `CombinedEntryListPage`) — the
assertion-test files already prove the contract, and an integration test
would essentially duplicate what's already tested through the host app.

### Phase 7 — Commit, push, Codex review (≤15 min)

1. Stage in two commits for review readability:
   - `feat(unify/phase-0): move EntryList page tree into @myk9/ringside (PR E2d-2b)` — the move + shims
   - `test(unify/phase-0): smoke tests for moved EntryList components` — Phase 6 tests
2. Push branch.
3. Open PR with checklist body referencing the master plan line 160.
4. Run Codex review immediately:
   ```bash
   codex review --commit $(git rev-parse HEAD) --title "E2d-2b orchestrator move"
   ```
   Post output verbatim as a PR comment.
5. Wait 2 minutes for the first CI run before reporting ready (per PR #407 lesson 5).
6. Lead the completion report with `**Codex review:** clean ✅ — *"..."*`.
7. Do NOT merge — wait for user merge call.

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| `pageProps.ts` contract needs adjustment under Path B (filter setters removed) | High (planned) | Update contract in Phase 3; assertion files don't reference these setters |
| `parseOrganizationData`/`hasRuleDefinedMaxTimes` aren't pure | Medium | Audit first; if impure, pass derived bools from shim instead of moving |
| Host's `hasRole` not on the context contract | Medium | Pass precomputed `canModifyClassSettings: boolean` from shim |
| Lockfile drift from new peer deps fails `--frozen-lockfile` in CI | Medium (per PR #407 lesson 2) | Use `pnpm --filter ringside add` not raw `pnpm install`; verify lockfile diff |
| Coverage drops below 45/41/49/45 | Low | Coverage rises when net LOC leaves apps/myk9q; ringside tests already 309 |
| ESLint plugin drift on mixed-export shim files | Low (per PR #407 lesson 4) | Preserve any `/* eslint-disable react-refresh/only-export-components */` directives |
| Type-vs-value barrel collisions at root barrel | Low (per PR #407 lesson 3) | Grep `packages/ringside/src/index.ts` for `EntryList` before adding; alias if needed |
| Drag mode wiring breaks (3-prop drift caught in PR #406 → #394) | Medium | Re-point any drag-related mock invocations in the same PR (per memory `feedback_callback_signature_widening`) |
| `useEntryListEffects`'s `AreaCountRequirements` type collision (host vs ringside dialogSlots) | Medium | Use ringside's `AreaCountRequirements` everywhere; delete host alias if it exists |

---

## Files to NOT touch

- `useEntryListHandlers.ts` (host monolith — its return shape is what the contract assertion locks)
- `useEntryListActions.ts` (host hook — same)
- `useEntryListEffects.ts` (host hook with no return value)
- `useEntryListDataHelpers.ts` (host fetcher impls — bound to ringside data hook via DI)
- All dialog implementations in `apps/myk9q/src/components/dialogs/*`
- All UI primitives in `apps/myk9q/src/components/ui/*`
- `apps/myk9q/src/components/DogCard.tsx`
- Both assertion test files (must keep compiling)

---

## Total estimate

5 hours (vs the 8-commit-deep PR #407 took at ~6 hours). The contract is now
mature; the move is mechanical. Risk concentration is in Phase 4 (shim
assembly) and the contract adjustment in Phase 3.
