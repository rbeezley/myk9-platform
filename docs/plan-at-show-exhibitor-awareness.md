# Plan: At-Show Exhibitor Awareness

Own-dog highlighting, live "N dogs ahead", and ring-conflict detection — built into the
existing `/at-show` list UI. No new pages, no new surfaces; this annotates the lists
exhibitors already use.

**INTENT alignment (docs/INTENT.md, Exhibitor):** target feeling is *"I know where to be."*
Every addition here is glanceable state on an existing list — no new navigation, no data
entry, calm visuals only.

## Duplication check (required by CLAUDE.md)

Does this duplicate an existing surface? **No — it completes one.**

- `useNotificationMonitor` (App.tsx:208) already fires *transient* "your turn" toasts/push
  with dogs-ahead counts and cross-class conflicts. This plan adds the *persistent,
  glanceable* representation of the same facts on the at-show lists. Toast = event;
  list badge = state. Both read the same underlying data.
- The orphaned exhibitor components (`NextUpCard`, `ShowDayHero`, `RingMonitor`,
  `DogsAheadBadge`, `LiveClassCard` — only tests import them) are NOT revived. They were
  built for a deleted live-show surface. We reuse their *logic patterns*, not the components.
- `WhereToBe` (ShowDetailsPage › My Entries tab) is a pre-show schedule view; this plan is
  show-day ring state. Different moments, no overlap.

## Existing pieces (verified 2026-06-11)

| Piece | Location | Status |
| --- | --- | --- |
| Ownership RPC | `get_account_today_entries()` — migration `20260531090000` | Live. Matches handler OR owner OR co-owner. Returns entry_id, show_id, class_id, trial_id. Already called at the at-show access gate via `useAccountTodayAutoFavorites`. |
| Dogs-ahead math | `apps/myk9show/src/utils/dogsAhead.ts` | Live util, but its `ShowDayClass` consumers are orphans. |
| Conflict math | `apps/myk9show/src/utils/conflictDetection.ts` (`detectConflicts`) | Live — consumed by `useNotificationMonitor`. Coupled to legacy `ShowEntry` shape. |
| Lead-dogs preference | `notificationStore.preferences.leadDogs` (clamped 1–5) | Live. Reuse as the conflict/alert threshold — do NOT add a second knob. |
| Entry list architecture | `packages/ringside/src/pages/EntryList/` — pure controlled render, prop bags | `favorites?: EntryListFavorites` bag is the precedent for an optional per-exhibitor bag. |
| Card primitive | `packages/ringside/src/components/DogCard.tsx` + `SortableEntryCard.tsx` | `isFavorite` → heart button is the threading template for `isOwnEntry`. |
| Class list | `apps/myk9show/src/features/at-show/AtShowClassListPage.tsx` + `atShowClassListAdapter.ts` | Already fetches ALL show entries (replication) and auto-favorites the user's classes. |
| `check_in_status = 'conflict'` | migration 092 enum | Manual flag already exists; detection (this plan) suggests, never auto-writes. |
| At-show data freshness | `atShowDataAdapter.ts` — `subscribeToReplicationChanges` is an intentional no-op; refresh = pull-to-refresh / forceSync | Liveness gap addressed in Phase 5. |

## Design decisions

1. **Ownership source = the RPC, persisted per show.** `useMyAtShowEntries(showId)` wraps the
   existing `account-today-entries` query, derives `{ ownEntryIds: Set<string>,
   ownClassIds: Set<string> }`, and persists to localStorage (`my_entries_${showId}`),
   mirroring `persistAccountTodayClassFavorites`. Offline-first: cold-start offline reads the
   persisted set; online refresh overwrites it.
2. **Match by entry id, not armband.** The RPC returns entry ids; armbands can collide across
   trials. The favorites bag uses armbands for historical reasons — do not copy that.
3. **Dogs-ahead is computed from the same entries array the list renders.** Position of my
   entry among unscored entries in run order, minus in-ring offset — consistency with the
   visible list by construction. New pure util in ringside (`computeDogsAheadInList`), because
   the existing `computeDogsAhead` consumes the orphaned `ShowDayClass` shape.
4. **Conflict = two of MY entries near-up simultaneously.** Across all in-progress classes in
   the show: if ≥2 of my unscored entries are each within `leadDogs` of the front, warn. This
   covers both the same-dog-two-classes case and the one-handler-multiple-dogs case (the
   common one). Generalize `detectConflicts` into a pure util over a minimal structural shape;
   `useNotificationMonitor` migrates to it so there is exactly one conflict definition.
5. **Ringside package changes are additive and optional.** New `ownership?` prop bag —
   absent bag = today's rendering, byte-for-byte. myK9Q-era hosts unaffected.
6. **No auto-writes.** Detection renders a warning chip/banner with a link to the other
   class. Marking `check_in_status='conflict'` stays a human action via the existing status
   dialog.

## Phases

### Phase 1 — `useMyAtShowEntries` (app-side ownership hook)

- New `apps/myk9show/src/features/at-show/useMyAtShowEntries.ts`:
  - Reads the existing `['account-today-entries', userId]` query (already populated at the
    access gate); filters to `showId`; derives `ownEntryIds` / `ownClassIds`.
  - Persists per show to localStorage; hydrates from storage when query is cold/offline.
- **Tests:** derivation from RPC rows, persistence round-trip, offline hydration, empty-state
  (staff member with no entries → empty sets, no storage write churn).

### Phase 2 — Own-dog highlighting + dogs-ahead in the ringside entry list

Package (`packages/ringside`):
- `pageProps.ts`: add `EntryListOwnership` bag — `{ ownEntryIds: ReadonlySet<string> }` —
  optional on both `EntryListPageProps` and `CombinedEntryListPageProps`.
- New pure util `computeDogsAheadInList(entries: Entry[], entryId: string): number | null`
  in `pages/EntryList/` (null when scored/absent; 0 = next; respects in-ring entry).
- `SortableEntryCard`: new optional `isOwnEntry` + `dogsAhead` props. Own entry renders a
  distinct ring/glow on `DogCard` (via `className`, no DogCard API change) plus a calm
  "You're next" / "N ahead" pill rendered through the existing `resultBadges` /
  badge area. Reuse `formatDogsAheadText` semantics.
- `EntryListContent` (+ combined variant): thread the bag; compute dogs-ahead only for own
  unscored entries.
- **Rebuild note:** app tests run against the package's built `dist` — run
  `pnpm --filter @myk9/ringside build` after package edits or app tests see stale behavior.

App shim:
- `AtShowEntryListPage.tsx` / `AtShowCombinedEntryListPage.tsx`: pass
  `ownership={ownEntryIds}` from `useMyAtShowEntries`.

- **Tests (package):** `computeDogsAheadInList` (in-ring present/absent, scored entries,
  scratched/pulled exclusion, own entry in-ring → null/“in ring” state, id shapes exactly as
  the UI passes them — see feedback_assertion_first_ui_id_shapes). SortableEntryCard renders
  pill + highlight only when bag present.
- **Tests (app):** shim passes the bag; absent for signed-out/passcode-only users.

### Phase 3 — Class-card chips on the at-show class list

- `atShowClassListAdapter.ts`: it already groups all show entries per class. For classes in
  `ownClassIds`, annotate the card model with `myDogsAhead: { callName, dogsAhead }[]`
  (reuse the Phase 2 util; entries are already in run order).
- `AtShowClassListPage.tsx`: render a chip on those cards — `Ditto · 3 ahead` /
  `Ditto · You're next` (pulse only at 0, calm otherwise). No chip when class not started
  or entry scored.
- **Tests:** adapter annotation (multiple own dogs in one class, scored entry drops chip,
  not-started class), chip rendering states.

### Phase 4 — Ring-conflict detection

- Generalize `detectConflicts`:
  - New pure util (ringside or `apps/.../at-show/ringConflicts.ts` — prefer app if no
    package consumer): input = my unscored entries grouped by in-progress class with
    positions; output = conflict pairs `{ classA, classB, dogsAheadA, dogsAheadB, callName }`
    when both positions ≤ `leadDogs`.
  - Migrate `useNotificationMonitor` to the shared util (single definition; its tests move
    with it).
- Surfaces:
  - `AtShowClassListPage`: warning banner above the trial list when a conflict is live —
    "Possible ring conflict: Ditto is 2 away in Container Novice and 3 away in Buried
    Master" with links to both classes. Banner, not modal (calm-over-clever).
  - Entry list: small `Conflict?` chip on my own card when that entry's dog/handler is also
    near-up elsewhere; links to the other class.
- **Tests:** pure util (threshold boundaries 0/leadDogs/leadDogs+1, not-in-progress classes
  excluded, scored entries excluded, two-dogs-one-handler case, same-dog case); banner/chip
  render + link targets; notification-monitor regression tests still green after migration.

### Phase 5 — Liveness (make "live" actually live)

Today the at-show lists refresh on pull-to-refresh only (`subscribeToReplicationChanges`
is a no-op). Dogs-ahead/conflict chips are only as fresh as the list.

- Add a visibility-aware periodic sync to the at-show list pages: `forceSync` every 30s
  while `document.visibilityState === 'visible'` (matches `useNotificationMonitor`'s 30s
  poll cadence; pauses in background to save battery).
- Optional realtime nudge (same pattern as `useNotificationMonitor`'s per-show entries
  channel): on entries UPDATE for this show → debounced `refresh()`. Implement only if the
  30s poll feels laggy in verification; do not build both speculatively.
- **Tests:** interval respects visibility; cleanup on unmount; no overlapping syncs.

### Phase 6 — Verification & hygiene

- `pnpm --filter @myk9/ringside build && pnpm typecheck && pnpm lint`
- `cd apps/myk9show && pnpm test` (full suite) + ringside package suite.
- Manual walk: signed-in exhibitor with entries → class list chips → entry list highlight →
  simulate scoring progression → chip counts down → conflict banner appears.
- Update `OPEN-TODOS.md`.

## Out of scope (explicitly)

- Push notification for "you're next" — already exists in `useNotificationMonitor`.
- Reviving `NextUpCard` / `ShowDayHero` / `RingMonitor` orphans (separate deletion candidate).
- Estimated clock times per entry (needs per-run duration model — different feature).
- Any canvas/visual-map surface (see conversation 2026-06-11; rejected for this phase).
