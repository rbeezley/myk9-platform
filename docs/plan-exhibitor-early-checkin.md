# Exhibitor early check-in — correctness & consistency fix

> **Status:** Active

## Origin

Request: "let exhibitors reach the at-show pages before show day so they can
start checking in." Investigation + a **live verification** (2026-06-23) reframed
this: early exhibitor self-check-in **already works** from My Entries. The real
work is two correctness/consistency defects.

Owner decisions (locked): exhibitors check in from **their own view** (not the
staff `/at-show` surface); availability is governed by the secretary's
`selfCheckinEnabled` toggle. Owner chose **both fixes**.

## Live verification (ground truth, 2026-06-23)

Signed in as `e2e-exhibitor@test.myk9.com` (7 **upcoming** entries, Heartland show
dated Aug 2026). Check-in on an upcoming entry from My Entries →
`POST /rpc/self_checkin_entry → 204` (persisted), UI updated, no console errors,
reverted after. Confirms: early self-check-in works, via the correct RPC.

## The two defects

1. **Toggle not honored.** The check-in succeeded with no `selfCheckinEnabled`
   check. `MyEntryCard` renders the control on `!cls.isScored` only; the
   `self_checkin_entry` RPC validates ownership + status but not the cascade.
2. **Prominent path broken.** The "Show today" banner sends exhibitors to
   `/at-show/:showId` ([ShowTodayBanner.tsx:30]); check-in there routes through
   `ringside_update_entry` (manager/judge/steward only) → silently fails on sync
   for exhibitors.

## Key data facts (verified in code)

- `EntryClass.id` is the **entry row id** (used as `p_entry_id`), NOT the class
  id. The real class id is `classData.id` in `useMyEntriesData.ts` (the
  `class:class_id` join) — available, just not surfaced on `EntryClass`.
- A batch resolver already exists: `useSelfCheckinMap(classIds)` →
  `Record<classId, boolean>`, cascading class ?? trial ?? show ?? true from the
  `*_visibility_settings/overrides` tables.
- `self_checkin_entry` (migration `20260604004045`) is SECURITY DEFINER; it
  raises on non-owner / disallowed status, but has no cascade check.

## Phases

### Phase 1 — Honor the secretary toggle (client + server)
- [ ] Add `classId?: string` to `EntryClass` (`my-entries-types.ts`); set it from
      `classData.id` in `useMyEntriesData.ts`.
- [ ] In `MyEntriesPage`, collect class ids across entries and call
      `useSelfCheckinMap`; pass a `selfCheckinEnabledByClassId` map (or per-class
      flag) into `MyEntryCard`.
- [ ] `MyEntryCard`: when self-check-in is off for a class, render the check-in
      control disabled with a reason (no dead tap); enabled otherwise.
- [ ] **Server enforcement:** migration adding a cascade check to
      `self_checkin_entry` — resolve class ?? trial ?? show ?? true from the
      visibility tables; raise if disabled. Assertion-first SQL-shaped tests where
      feasible; unit-test the cascade helper.

### Phase 2 — Stop stranding exhibitors on /at-show check-in
- [ ] Route the "Show today" banner / exhibitor entry to their My Entries
      check-in instead of `/at-show` (owner decision: own view). Verify no other
      exhibitor-only reliance on the `/at-show` landing breaks.

### Phase 3 — Cleanup + verify
- [ ] Delete dead `ShowDayHero` (+ `StickyShowBar` if orphaned).
- [ ] `pnpm typecheck`, lint, unit tests green. Live re-verify on staging after
      merge: toggle off → control disabled; toggle on → check-in persists; banner
      no longer lands exhibitors on a failing /at-show check-in.

## Out of scope
- Letting exhibitors into the staff `/at-show` ringside surface.
- Changing `ringside_update_entry` authz (staff-only by design).
