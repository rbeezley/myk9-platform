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
3. **Dogs-ahead is computed from the same entries array the list renders.** New pure util in
   ringside (`computeDogsAheadInList`), because the existing `computeDogsAhead` consumes the
   orphaned `ShowDayClass` shape. **User decision 2026-06-11:** the in-ring dog is EXCLUDED
   from the count — "You're next" shows while a dog is still in the ring, because that is how
   exhibitors think about the queue. (Deliberate divergence from the legacy `computeDogsAhead`
   convention, which counted the in-ring dog as "ahead".)
4. **Conflict = two of MY entries near-up simultaneously.** Across all in-progress classes in
   the show: if ≥2 of my unscored entries are each within `leadDogs` of the front, warn. This
   covers both the same-dog-two-classes case and the one-handler-multiple-dogs case (the
   common one). **Both involved entries get the badge**, each in its own class's entry list,
   labeled with the *other* class ("Also 2 away in Container Master").
   `useNotificationMonitor`'s `detectConflicts` stays untouched — it computes per-dog at
   alert time over a different data shape; ours computes per-account at render time over
   replicated rows. Same concept, deliberately separate computations (not a deferral).
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
- New pure util `computeDogsAheadInList(entries: Entry[], entryId: string)` in
  `pages/EntryList/` (null when scored/pulled/absent; own entry in-ring → distinct state;
  in-ring dog excluded from the count, so 0 = "You're next" while a dog runs).
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

### Phase 3 — CUT (user decision 2026-06-11)

Class-card chips on the at-show class list were cut: everything surfaces on the entry
lists only. Keeps the class list calm; the entry list is where exhibitors track the queue.

### Phase 4 — Ring-conflict detection (entry-list only)

- New pure util `apps/myk9show/src/features/at-show/ringConflicts.ts`:
  - Input: my entry ids + show-wide replicated entries/classes; threshold = the existing
    `notificationStore.preferences.leadDogs` (1–5).
  - Output: `Map<entryId, ConflictInfo[]>` where each involved entry maps to the OTHER
    class(es): `{ otherClassName, dogsAhead }`. Both sides of a conflict get an annotation.
  - `useNotificationMonitor` is deliberately NOT migrated (see design decision 4).
- Hook `useMyRingConflicts(showId, ownEntryIds)`: reads `replicatedEntriesTable` /
  `replicatedClassesTable` (offline-safe), recomputes on replication change events.
- Surface: amber informational chip on my own entry card via the ownership bag
  (`conflictLabelByEntryId`) — "Also 2 away in Container Master". No banner, no links,
  no class-list presence. Marking `check_in_status='conflict'` remains the human action.
- **Tests:** pure util (threshold boundaries 0/leadDogs/leadDogs+1, not-in-progress classes
  excluded, scored/pulled excluded, two-dogs-one-handler case, same-dog case, both sides
  annotated); chip renders only with a label.

### Phase 5 — Realtime refresh (user decision 2026-06-11: myK9Q parity)

Today the at-show lists refresh on pull-to-refresh only (`subscribeToReplicationChanges`
is a no-op). Exhibitors expect realtime because legacy myK9Q is realtime.

- New hook `useAtShowRealtimeRefresh(showId, refresh)` in the at-show feature:
  - Supabase channel per show: `postgres_changes` UPDATE on `entries`
    (`show_id=eq.<showId>`) and on `classes` → debounced (~1.5s) `refresh(true)`
    (forceSync → replication pull → list re-render). Same pattern as
    `useNotificationMonitor`'s channels; `entries`/`classes` are already in the
    `supabase_realtime` publication (PR #584).
  - `visibilitychange` → immediate refresh when returning to foreground (mobile
    tab-switch is the common case ringside).
  - Offline-safe: channel silently idle without a connection; pull-to-refresh remains.
- Wire into `AtShowEntryListPage` + `AtShowCombinedEntryListPage` shims.
- **Tests:** debounce coalesces bursts, cleanup removes channel on unmount, visibility
  handler fires refresh, no refresh while already refreshing.

### Phase 6 — Verification & hygiene

- `pnpm --filter @myk9/ringside build && pnpm typecheck && pnpm lint`
- `cd apps/myk9show && pnpm test` (full suite) + ringside package suite.
- Manual walk: signed-in exhibitor with entries → entry list highlight + queue pill →
  simulate scoring progression → pill counts down in realtime → conflict chip appears on
  both involved entries.
- Update `OPEN-TODOS.md`.

## Out of scope (explicitly)

- Push notification for "you're next" — already exists in `useNotificationMonitor`.
- Reviving `NextUpCard` / `ShowDayHero` / `RingMonitor` orphans (separate deletion candidate).
- Estimated clock times per entry (needs per-run duration model — different feature).
- Any canvas/visual-map surface (see conversation 2026-06-11; rejected for this phase).
