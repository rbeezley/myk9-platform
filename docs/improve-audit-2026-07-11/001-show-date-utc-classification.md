# 001 — Shows classified past/active up to a day early (UTC-midnight date parsing)

> Written against commit `15897d862` (2026-07-11). If the cited code has moved materially, STOP and report drift instead of improvising.

## Why this matters

`shows.start_date` / `shows.end_date` are DATE-like values serialized as `"YYYY-MM-DD"` (or timestamptz midnight-UTC). `new Date("2026-05-15")` parses as **UTC midnight**, which is the evening of May 14 in every US timezone. So for any user west of UTC, comparisons like `showEnd < now` flip a show into "past" (and out of "upcoming"/"active") up to a day early. This controls which action buttons render (edit/manage/cancel), which tab a show lands in, and past/upcoming counts. The repo already has the correct primitive — `toLocalDate()` in `apps/myk9show/src/utils/date-format.ts:2-5` — and `utils/entryStatusUtils.ts` uses it correctly. Five modules bypass it.

## Current state (confirmed by reading, 2026-07-11)

`apps/myk9show/src/utils/show-actions.ts:53-57`:

```ts
const now = new Date();
const showStart = new Date(show.startDate);
const showEnd = new Date(show.endDate);
const isUpcoming = showStart > now;
const isPast = showEnd < now;
const isActive = showStart <= now && showEnd >= now;
```

Same raw-parse pattern at: `utils/unified-shows-config.ts:48,52,129,133,341,376`; `utils/show-relationships.ts:125,127,130-131,197-198,209-210,295`; `utils/showCardUtils.ts:14-15`; `utils/showFilters.ts:11`. (Line numbers are leads — re-locate by grepping `new Date(show` and `new Date(s.startDate` variants in those files.)

Note the semantics you must preserve: a show whose `endDate` is today is **still active until end of day local time**. The correct comparison is `toLocalDate(endDate)` at end-of-day (or `toLocalDate(endDate) + 1 day > now`), not merely swapping the parser — `toLocalDate("2026-05-15")` is local *midnight*, so `showEnd < now` would still mark the show past for most of its final day. Follow `entryStatusUtils.ts`'s existing end-of-day handling as the exemplar.

## Steps

1. In `utils/date-format.ts`, add two tested helpers (keep names if equivalents already exist):
   - `showDateRangeStatus(startDate: string, endDate: string, now?: Date): 'upcoming' | 'active' | 'past'` — parses via `toLocalDate`, treats `endDate` as inclusive through 23:59:59.999 local.
   - Export nothing else new; do not modify `toLocalDate`/`toLocalDateOnly` in this plan (that's plan 002).
2. Write the tests FIRST (assertion-first) in a colocated `date-format.test.ts` (pure logic — check whether `utils/` tests are picked up by the vitest config; existing colocated `*.test.ts` files under `src/` are the pattern). Pin the boundary cases:
   - `now` = 2026-05-15T20:00 local, endDate `"2026-05-15"` → `active` (this is the case that is red today).
   - `now` = 2026-05-16T00:01 local, endDate `"2026-05-15"` → `past`.
   - startDate `"2026-05-16"` at `now` = 2026-05-15 → `upcoming`.
   - timestamptz-shaped input `"2026-05-15T00:00:00+00:00"` behaves identically to `"2026-05-15"`.
3. Replace the raw comparisons in the five modules with the helper. Keep each module's existing derived flags (`isUpcoming`/`isPast`/`isActive`) as local consts computed from the helper's return so downstream logic is untouched.
4. Run the colocated tests for every file you touch that has one (project rule): check for existing tests next to `show-actions.ts`, `show-relationships.ts`, `unified-shows-config.ts`, `showCardUtils.ts`, `showFilters.ts` — the audit found none, which is why step 2's tests are the safety net. Add one thin classification test per module ONLY where the module adds logic beyond the helper (e.g. `show-relationships` bucketing).

## Out of scope

- `entryStatusUtils.ts` (already correct — use as exemplar, don't touch).
- `toLocalDateOnly` hardening and enum-map fallbacks (plan 002).
- Any server/DB change. Any UI copy change.

## Done criteria

- `cd apps/myk9show && npx vitest run src/utils/date-format.test.ts` — green, including the boundary case that fails against the old code (demonstrate red first by writing the test before the fix).
- `grep -rn "new Date(show\.\|new Date(s\.start\|new Date(s\.end" apps/myk9show/src/utils/` returns no raw show-date parses in the five modules.
- `pnpm typecheck && pnpm lint` green; `cd apps/myk9show && pnpm test` green.

## Maintenance note

Any new surface that buckets shows by date must use `showDateRangeStatus` — flag raw `new Date(<date-column>)` in review. The same hazard applies to any DATE column (entry_open/close already handled elsewhere).
