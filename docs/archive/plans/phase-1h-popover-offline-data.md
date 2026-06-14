# Plan — ClassDetailsPopover offline-safe Results + Check-in (Phase 1h)

## Goal
Make the at-show `ClassDetailsPopover`'s **Results** (visibility preset) and **Check-in**
(self-check-in) values work offline on the judge's phone. Today they come from
`useVisibleResultFields` / `useSelfCheckinEnabled`, which read **direct Supabase**
(`show_visibility_settings` / `trial_visibility_overrides` / `class_visibility_overrides`)
— so they're blank/stale offline. Owner chose **option (b): bring the data through the
replication layer.**

## Approach — denormalize the two resolved values onto `ReplicatedClass`
Both values the popover shows are **viewer-independent** resolved cascade outputs:
- `selfCheckinEnabled: boolean` — `resolveCheckinCascade(show, trial, class)`
- `visibilityPreset: string` — effective preset (class ?? trial ?? show)

Compute them **at classes-sync time** and store on the replicated class row. Reuse the
existing `getVisibilitySettings(showId)` service + `@myk9/secretary` resolvers (DRY — one
definition of the cascade). No new replicated tables.

Enrichment is grouped by each class row's OWN `trial_id` (not the sync `licenseKey`, which
at the at-show layer can be a show id or empty), so it runs on scoped AND unscoped syncs —
the values are therefore present on every sync and `resolveConflict` (server-authoritative)
also preserves a prior enriched value when an incoming row lacks them.

**Why not replicate the 3 raw tables:** denormalizing 2 fields is far smaller than 3 tables
+ sync + RLS + a client resolver, and these settings rarely change mid-show. **Trade-off
(documented):** the value is eventually consistent — refreshed whenever the class row syncs,
but a settings-only edit (no class-row change) won't reflect until the next full sync.
**Note `selfCheckinEnabled` is NOT purely cosmetic** — beyond the popover it also feeds the
ringside `SortableEntryCard` self-check-in gate (`classInfo.selfCheckin`). Acceptable because
/at-show is staff-only (STAFF_ROLES) and staff bypass that gate via `canCheckInDogs`; the
exhibitor-facing self-check-in enforcement stays on the live online hook. The real-time
alternative (replicating the raw cascade tables) is deferred.

## Changes
1. **`packages/ringside`** — extend `ClassDetailsPopoverProps['data']` with optional
   `selfCheckinEnabled?: boolean`. (`visibilityPreset?: string` already exists.)
2. **`ReplicatedClassesTable`**
   - Add `selfCheckinEnabled?: boolean` + `visibilityPreset?: string` to `ReplicatedClass`.
   - In `sync()`: after fetching classes, call `getVisibilitySettings(showId)` once, build
     trial/class override maps, and resolve per class via the shared resolvers; attach the
     two fields. Read-only — NOT written in `toSupabaseRow` (settings are managed elsewhere).
   - Map the fields in `rowToClass` for any path that reads a raw row.
3. **at-show ClassInfo/popover adapter** (`atShowDataAdapter` / class-list adapter) —
   surface `visibilityPreset` + `selfCheckinEnabled` from the replicated class onto the
   popover `data` bag.
4. **`atShowLayoutSlots` `ClassDetailsPopover`** — add a **Check-in** row
   (`Enabled` / `Disabled`) driven by `data.selfCheckinEnabled`; the Visibility row already
   renders `data.visibilityPreset`.

## Testing (required before complete)
- **Unit:** the sync's per-class resolution — a class override beats trial beats show for
  both preset and check-in; missing rows fall back to the show default / `true`. Reuse/verify
  `@myk9/secretary` resolvers are the single source (don't re-implement the cascade).
- **Unit:** `rowToClass` maps the two new fields (null/undefined → undefined).
- **Component:** popover renders the Check-in row (Enabled/Disabled) and the Visibility row
  from `data`; omits each when its value is absent.
- Run `pnpm typecheck` + scoped `vitest` + `eslint` before commit.

## Out of scope
- Real-time offline settings (raw-table replication) — revisit only if a settings change
  must reflect offline without a full sync.
- The self-check-in **enforcement** path (exhibitor self-check-in gate) — unchanged; still
  the online hook.
