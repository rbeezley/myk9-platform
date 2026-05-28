# Phase 1 — Mount `@myk9/ringside` at `/at-show` in myK9Show

**Status:** Plan (discovery complete 2026-05-28). Awaiting go-ahead to implement Phase 1a.
**Predecessor:** Phase 0 complete (PRs A–G; `@myk9/ringside` shipped).
**Parent plans:** [`2026-05-17-unify-myk9show-myk9q.md`](2026-05-17-unify-myk9show-myk9q.md) (rev 6) · [`phase-0-ringside-package.md`](phase-0-ringside-package.md).

---

## TL;DR

Phase 1 is the first time **two app shells render the same ringside tree**. The plan bundles ~9 items (smart-input landing, auth merge, routing table, feature flags, `/help/credentials`, rebrand, and the ringside mount). This plan sequences the **technical spine first** — a *mount spike* (Phase 1a) that renders one ringside page (EntryList) at `/at-show` behind a feature flag, fully wired to myK9Show's existing replication. Everything else (the headline smart-input UX, etc.) sequences after the spine is proven.

**The big de-risking discovery:** the replication-orchestration worry from plan §3 is mostly moot — myK9Show already has a full offline-first replication layer, and ringside injects via hook contracts, not table instances. Phase 1a is **adapter wiring**, not new infrastructure.

---

## Discovery findings (2026-05-28, 4 parallel scouts)

### F1 — myK9Show already has replication; ringside injects via contracts
- myK9Show has 9 `Replicated*Table` subclasses, a `MutationManager`, and `ReplicationSyncProvider` (`apps/myk9show/src/services/replication/`, `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`), all on `@myk9/replication`.
- ringside never imports `ReplicatedTable`. It consumes **hook contracts** (`EntryListHandlers` 22 methods, `EntryListActions` 8 methods — `packages/ringside/src/pages/EntryList/hookContracts.ts`) + the `RingsideProvider` capability bag (`auth`/`replication`/`prefetch` — `packages/ringside/src/context/types.ts:144`).
- ⇒ Phase 1a writes **adapter hooks** that wrap myK9Show's existing tables, modeled on myK9Q's `apps/myk9q/src/pages/EntryList/hooks/useEntryListHandlers.ts` + `useEntryListActions.ts` (pattern, not copy).

### F2 — the DI contract is large but enumerated
ringside's `EntryListPage` is a **controlled render** (owns no state, calls no hooks). The host shim must supply:
- `RingsideProvider` value: `{ auth: {role, showContext, canAccess}, replication: {updateClassStatus}, prefetch: {get} }`.
- `EntryListPageProps`: `data`, `dataStatus`, `handlers` (22), `actions` (8), `uiState` (~24 fields) + `uiActions`, `derived` (from `useEntryListFilters`), `drag` (from `useDragAndDropEntries`), `dialogs` (10 slots), `layout` (10 slots), `context` (role/permission).
- `EntryListDataDependencies`: `fetchSingleClass`, `fetchCombinedClasses`, `forceSyncEntriesAndClasses`, `subscribeToReplicationChanges` (`packages/ringside/src/pages/EntryList/types.ts:108`).
- **10 dialog slots** (`dialogSlots.ts:397`) + **10 layout slots** (`pageProps.ts:316`) as `ComponentType`s sourced from myK9Show's own components.

### F3 — auth adapter needed (bounded)
ringside expects 4 passcode roles (`admin`/`judge`/`steward`/`exhibitor`) + `canAccess(permissionKey: keyof UserPermissions)`. myK9Show has Supabase RBAC (7 roles, async DB permissions; `apps/myk9show/src/context/AuthContext.tsx`, `types/auth-types.ts`). Phase 1a needs a **role/permission adapter** mapping RBAC → ringside's 4-role + `UserPermissions` shape. The plan's full account+passcode *merge* (Locked Decision #8) is deferred to the smart-input PR; the spike can drive off the signed-in account's RBAC role alone.

### F4 — mount point + flag
- myK9Show: React Router v7. Route families are functions returning `<Route>` fragments under `<UnifiedAppLayout>` (`apps/myk9show/src/App.tsx:344`). Add `apps/myk9show/src/routes/atShowRoutes.tsx`, register at `App.tsx`.
- Root providers already present: QueryClient, AuthProvider, **ReplicationSyncProvider**, StoreProvider, PanelProvider, etc.
- Feature flag (Locked Decision #10): `shows.unified_ringside_enabled` (boolean) + `feature_flag_overrides(person_id, flag_name, enabled, set_at)`. The spike can gate on the per-show flag first; the override table can come with the smart-input/flag PR.
- `@myk9/ringside` is currently a **type-only** import in myK9Show — no components mounted yet.

---

## Phase 1a — the mount spike (this PR)

**Goal:** `/at-show/:showId/class/:classId` renders ringside's `EntryListPage` inside myK9Show's shell, reading/writing through myK9Show's replication, behind `unified_ringside_enabled`. One page, end-to-end, proving the contract.

### Work items
1. **Auth adapter** — `apps/myk9show/src/features/at-show/ringsideAuthAdapter.ts`: map myK9Show RBAC role → ringside `UserRole`; build `canAccess` from RBAC permissions; assemble `RingsideShowContext` from the loaded show.
2. **Replication/prefetch adapter** — bind `RingsideReplication.updateClassStatus` → myK9Show `ReplicatedClassesTable.updateClassStatus`; bind `RingsidePrefetch.get` → myK9Show's cache (or a no-op returning `null` if no prefetch cache exists yet — verify).
3. **Data dependencies** — implement `EntryListDataDependencies` (`fetchSingleClass`/`fetchCombinedClasses`/force-sync/subscribe) against myK9Show's replicated entries/classes tables.
4. **Adapter hooks** — `useEntryListHandlers` (22) + `useEntryListActions` (8) for myK9Show, wrapping its tables/services. Model on myK9Q; do NOT copy (different services).
5. **Slot wiring** — map myK9Show's existing dialog + UI-primitive components into the 10 dialog slots + 10 layout slots. **Audit first:** which myK9Show already has vs. needs a thin shim. (Likely the highest-effort sub-task.)
6. **Host shim page** — `apps/myk9show/src/features/at-show/AtShowEntryListPage.tsx`: owns `useState` (the ~24 uiState fields) + calls the host hooks + assembles all bags + renders `<RingsideProvider><EntryListPage .../></RingsideProvider>`.
7. **Route + flag gate** — `atShowRoutes.tsx` with a `unified_ringside_enabled` guard; lazy-load; register in `App.tsx`. Off-flag → 404/redirect.
8. **Ringside CSS** — import `@myk9/ringside/styles` once in myK9Show (Tailwind-bundled per Q1).

### Out of scope for 1a (later Phase 1 PRs)
Smart-input landing; account+passcode merge + confirmation step; post-credential routing table; `feature_flag_overrides` table + per-person override; `/help/credentials`; `MyK9QAccessCard` rebrand; ClassList + scoresheet mounts (EntryList proves the pattern first); `@myk9/notifications` migration.

### Testing phase (required)
- **Unit:** the auth adapter (RBAC→ringside role/permission mapping — assertion-first per CLAUDE.md), the data-dependency adapters.
- **Integration (vitest + testUtils):** `AtShowEntryListPage` renders with mocked replication; status change calls the right `Replicated*Table` method (`toHaveBeenCalledWith`); off-flag gate hides the route.
- **Manual smoke:** `pnpm dev:show`, enable flag on a test show, reach `/at-show/:showId/class/:classId`, change an entry status, confirm it persists + syncs.
- `pnpm typecheck` + `pnpm lint` clean; `pnpm --filter=@myk9/show test` green.

### Risks / decisions to confirm during 1a
- **Slot coverage gap:** if myK9Show lacks equivalents for several of the 10 layout slots (e.g. `PullToRefresh`, `DogCard`, `HamburgerMenu`), each needs a thin shim — could expand scope. Audit in step 5 before committing effort.
- **Prefetch:** confirm whether myK9Show has a prefetch cache; if not, a `get: async () => null` adapter is acceptable for the spike.
- **`uiState` surface (~24 fields):** large but mechanical; consider a small `useAtShowEntryListUiState` hook to keep the shim under the 500-line rule.

---

## Phase 1 roadmap (after 1a proves the spine)

| # | Item | Notes |
|---|---|---|
| 1a | **Ringside EntryList mount spike** (this plan) | technical spine; flag-gated |
| 1b | Smart-input landing (single email-or-passcode field) | headline UX; Locked Decision #2 |
| 1c | Account+passcode auth merge + confirmation step | Locked Decision #8; `usePasscodeAuth` from ringside |
| 1d | Post-credential routing table (role → surface) | Locked Decision #8 |
| 1e | `feature_flag_overrides` table + per-person override + homepage banner | Locked Decision #10 (migration + RLS) |
| 1f | `/help/credentials` page | **ship blocker** per plan |
| 1g | Rebrand `MyK9QAccessCard` → "Show Access Codes" | Locked Decision #9 |
| 1h | Mount ClassList + scoresheets at `/at-show` | reuse 1a's adapters + `@myk9/scoring-ui` |

---

## Open questions for the owner (carried into 1a)
1. **Spike scope confirm:** EntryList as the first mounted page (vs. ClassList)? EntryList exercises the richest contract (dialogs + drag + scoring), so it's the strongest proof — but it's also the most slots to wire.
2. **Slot strategy:** if myK9Show is missing layout-slot equivalents, prefer thin per-slot shims (fast) over building polished components now (the polish belongs to a later `/at-show` UI sprint per Q1)?
