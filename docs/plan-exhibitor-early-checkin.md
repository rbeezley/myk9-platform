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

### Phase 1 — Honor the secretary toggle (client) — DONE
Shipped as a focused PR (client gate only; server enforcement split out below).
- [x] Add `classId` to `EntryClass` (`my-entries-types.ts`); set it from
      `classData.id` in `useMyEntriesData.ts`.
- [x] `MyEntriesPage`: collect class ids, call `useSelfCheckinMap`, pass
      `selfCheckinByClassId` into `MyEntryCard`.
- [x] `MyEntryCard`: when self-check-in is off, render a non-interactive check-in
      indicator with a reason; enabled (and default) otherwise.
- [x] 3 gating tests. typecheck + lint clean; MyEntryCard suite 50 green.

### Phase 1b — Server enforcement (FOLLOW-UP, deferred)
- [ ] Migration adding a cascade check to `self_checkin_entry` — resolve class
      ?? trial ?? show ?? true from the visibility tables; raise if disabled.
      Defense-in-depth: the client gate covers UI users; a direct RPC call could
      still bypass. Lower priority — an exhibitor's own check-in is not a security
      boundary. Unit-test the cascade helper.

### Phase 2 — Fix the broken /at-show exhibitor check-in (FOLLOW-UP, deferred)
**Corrected approach (the plan's original banner-redirect was wrong — it would
strip exhibitors' show-day awareness features that live on `/at-show`).** The
at-show check-in writer (`updateReplicatedCheckInStatus` → replication →
`ringside_update_entry`) rejects exhibitors. Mirror `ClassResultsTable`'s
`isStaff ? 'replicated' : 'self-checkin-rpc'`: branch the at-show check-in by
effective role so an exhibitor-role user writes through `self_checkin_entry`.
- [ ] Investigate how the at-show surface presents check-in to an exhibitor-role
      user (does it reach `useAtShowEntryListActions.writeCheckInStatus`?).
- [ ] Role-branch the writer; exhibitor → `self_checkin_entry` (online-only, like
      every other exhibitor self-check-in — not a regression vs the current
      silent failure).
- [ ] Delete dead `ShowDayHero` (+ `StickyShowBar` if orphaned) — never mounted.

## Out of scope
- Letting exhibitors into the staff `/at-show` ringside surface.
- Changing `ringside_update_entry` authz (staff-only by design).
