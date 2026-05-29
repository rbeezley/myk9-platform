# Phase 1 (critical path) — ringside id-model → string migration

**Status:** STARTED (WIP on `worktree-ringside-id-string-migration`). Contract change begun; execution scoped via typecheck. This is the **unblocker** for all Phase 1 ringside mounts (1a/1h).
**Owner decision:** Option B — `@myk9/ringside` ids become `string` (UUID-native), aligning with the unified platform DB.

## Why this PR exists

The unified DB uses **UUID** primary keys (`entries.id`, `classes.id` are `string`). myK9Q feeds ringside from `view_myk9q_entries` whose `id` is a legacy **bigint** ("bigint in DB, string for IndexedDB"), so ringside's contract is `Entry.id: number` and myK9Q does `parseInt(entry.id)`. myK9Show reads the raw UUID tables — `parseInt(uuid)` = `NaN` — so myK9Show **cannot** feed ringside's numeric contract. Fix: ringside ids → `string`.

`armband` stays `number` — it is a competitor number, not a UUID (parseInt-safe).

## Scope (verified, do not guess)

### Part 1 — `@myk9/ringside` package (in progress)
Contract fields → `string`: `Entry.id`, `Entry.classId`, `Entry.actualClassId` (DONE in `stores/entryStore.ts`); entryStore actions `setCurrentClassEntries`/`updateEntry`/`markAsScored`/`markInRing` entryId/classId params (DONE).

Remaining (the typechecker enumerated **20 errors**, all in EntryList — fix these declarations + value sites):
- `pages/EntryList/hookContracts.ts` — `entryId: number` → `string` (×7: handleStatusChange/StatusClick/ResetMenuClick/ResetScore/ToggleInRing/MarkInRing/MarkCompleted).
- `pages/EntryList/pageProps.ts` — `entryId: number` params → `string`; uiState `activeStatusPopup`/`activeResetMenu`: `number | null` → `string | null`.
- `pages/EntryList/combinedEntryListHelpers.ts` — `entryId: number` → `string`; the `===` comparisons at 206/209/223/237/255 + arg at 293.
- `pages/EntryList/CombinedEntryListPage.tsx:102` — replace `parseInt(classIds.a!)` comparison with string compare.
- `pages/EntryList/components/EntryListDialogs.tsx` — `entryId: number` → `string`; `id: Number(classId)` (×6) → `id: classId` (now string).
- `pages/EntryList/components/EntryListContent.tsx` / `ResetMenuPopup.tsx` / `CombinedEntryListDialogs.tsx` / `SortableEntryCard.tsx` — `entryId: number` → `string`; popup-id comparisons.
- `pages/EntryList/hooks/useEntryListFilters.ts` — `Map<number, number>` (manualOrderMap) → `Map<string, number>`.
- `pages/EntryList/hooks/useResetScore.ts` — entryId param.
- `pages/EntryList/types.ts` — `ClassInfo.trialId`/`actualClassId`/`actualClassIdA`/`actualClassIdB` → `string`.
- `pages/ClassList/types.ts` — `id`, nested `id`, `classId` → `string`.
- `utils/classStatus.ts:59` — `id: number` → `string`.
- `pages/EntryList/dialogSlots.ts` — the `ClassOptionsData`/`MaxTimeClassData` `id: number` → `string`.
- **ringside tests** — update Entry/Class fixtures using numeric ids (SortableEntryCard.test, useEntryListData.test, dialogSlots.test, EntryListContent.test, etc.).
- Gate: `pnpm --filter @myk9/ringside typecheck` + `pnpm --filter @myk9/ringside test` green.

### Part 2 — `apps/myk9q` consumers (the bulk, ~40 files) + regression
myK9Q bridges DB-string → ringside-number today; flipping ringside to string means:
- **DROP the `parseInt(id)` bridges** (~15 sites): `pages/EntryList/hooks/useEntryListDataHelpers.ts:122,253`, `ClassList/hooks/useClassListFetch.ts:171,226`, `Home/hooks/useHomeDashboardData.ts:251`, `TVRunOrder/hooks/useTVData.ts:208,300`, `ShowDetails/hooks/useDashboardData.ts:129,155,324`, `Stats/hooks/useStatsFilterOptions.ts:126`, `scoresheets/hooks/useEntryNavigationHelpers.ts:250`, `services/entryReplication.ts:70`, `services/announcementService.ts` (announcement ids — separate, may stay number), etc. → pass the string id through.
- **Service layer** `services/entryService.ts` + `services/entry/entryStatusManagement.ts`: `markInRing`/`markEntryCompleted`/`updateEntryCheckinStatus`/`resetEntryScore`/`savePreviousStatus`/`popPreviousStatus`/`shouldSkipInRingUpdate` take `entryId: number` → `string`; the previous-status `Map<number>` → `Map<string>`; supabase `.eq('id', entryId)` calls (string is fine for both bigint-view and uuid).
- myK9Q hooks/components consuming ringside Entry (EntryList/ClassList/scoresheets/Home/TV/Stats) — sorts/dedup/Map keys assuming numeric ids must be re-checked.
- **Regression (mandatory):** full `cd apps/myk9q && pnpm test` (the slow suite) — a missed numeric assumption silently corrupts ringside scoring. Plus `pnpm typecheck` + `pnpm lint` monorepo-green.

### Part 3 — unblocks
Once merged: myK9Show's `/at-show` data adapter (Phase 1a) reads its native UUID tables directly; ringside `Entry.id` holds the UUID. The spine adapters already built (`apps/myk9show/src/features/at-show/`) are id-agnostic and need no change.

## Execution recommendation
Run as ONE focused effort (a session or a workflow that can execute the full myK9Q regression). Do NOT merge without myK9Q's full suite green — ringside scoring is the product's core. Estimated: large (50 files) but mostly mechanical; the typechecker drives Part 1, and grep-driven `parseInt(id)` removal + the service-layer signature flip drive Part 2.
