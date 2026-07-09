# Design — exhibitor-closed-show-server-guard

## The boundary rule (single source of truth)

`shows.entry_open_date` / `entry_close_date` are `timestamptz`. A close date typed as a calendar day ("2026-08-15") is stored as **midnight UTC** of that day (`2026-08-15 00:00:00+00`). A few rows carry an explicit end-of-day instant (`2026-07-04 23:59:59+00`). Both must be interpreted as "the entry period runs through the end of this calendar day."

Rule, applied identically by the RPC, the edge function, and (already) the client cart gate:

- **Intended close day** = `entry_close_date` read in UTC → `(entry_close_date AT TIME ZONE 'UTC')::date`. This recovers the organizer's typed date regardless of whether the stored time is `00:00` or `23:59`.
- **Now** = current calendar date in the show's timezone → `(now() AT TIME ZONE show_tz)::date`, where `show_tz` is the show's primary trial `timezone` (default `America/New_York`, matching `getTrialTimezone`).
- **Closed** ⇔ `now_local_date > close_day`. Open through the entire local close day; closed at local midnight after it.

### Why not the old `now > entry_close_date`?

That treats the stored value as a precise instant. For the common midnight-UTC value it closes entries at the *start* of the close day in UTC — a full day early for shows west of UTC. Proven against live data:

| Case (close stored `2026-08-15 00:00+00`) | New rule | Old `now > instant` |
| --- | --- | --- |
| ET show, 11pm on Aug 15 (local close day) | OPEN ✓ | CLOSED ✗ |
| ET show, 9pm on Aug 14 (evening before) | OPEN ✓ | CLOSED ✗ (a day early) |
| Pacific show, 11pm on Aug 15 | OPEN ✓ | CLOSED ✗ |
| Any show, 12:30am local Aug 16 | CLOSED ✓ | CLOSED ✓ |
| Explicit `23:59:59` close, 4pm same day | OPEN ✓ | OPEN ✓ |

## Enforcement points

Two write paths create entries; each gets the rule at its existing authorization stage.

1. **`submit_show_entries` (offline RPC).** Guard inserted as step **3a**, immediately after `v_is_official` is computed and before payment-method authz. `NOT v_is_official AND close_day passed → RAISE EXCEPTION … ERRCODE '42501'`. Officials bypass. The whole function body is otherwise copied verbatim from migration `20260706190500` so a partial edit cannot drift the handler / ownership / fee logic (the established convention for this RPC).

2. **`stripe-checkout` (online path).** The existing status + open/close gate is rewritten to the calendar-day comparison, adding a one-row `trials.timezone` lookup for `show_tz`. The webhook that actually inserts paid entries is left unchanged: it is gated upstream by this checkout gate plus Stripe's short session TTL, so re-checking there would be redundant and risk divergence.

### Why not a blanket BEFORE INSERT trigger on `entries`?

Considered and rejected. A trigger would also fire for the Stripe webhook insert, seed data, and imports, all of which would then have to satisfy the official-bypass path — high blast radius on a money table. The two-point approach matches where each path already authorizes and keeps the bypass logic where the caller identity is known.

## Official bypass — scope

`v_is_official = is_site_admin() OR is_show_secretary(show) OR is_club_admin(club)`. Exhibitors self-submitting after close are rejected on both paths (consistent with the online path's pre-existing hard block). Officials add late/day-of entries unimpeded. This matches current product behavior; if a future "exhibitor day-of entry window" is wanted it becomes an explicit per-show flag, not a silently open door.

## Error surfacing

The RPC raises SQLSTATE `42501` (consistent with its sibling authz rejections). The offline submission client surfaces the RPC error; `stripe-checkout` returns HTTP 403 with a plain-language message. No new client copy is required for this change.

## Testing

- **Boundary math**: proven against live data (table above) via read-only `SELECT` — no mutation.
- **Source-pin tests**: assert the migration contains the guard with the official bypass and the timezone-anchored expression; assert `stripe-checkout` compares calendar days (no `getTime()` instant compare on the close date).
- **Live RPC verification**: in a rolled-back psql transaction, apply the `CREATE OR REPLACE`, set `request.jwt.claims` to a non-official exhibitor and confirm a closed-show submission raises `42501`; set claims to a secretary and confirm it succeeds; confirm an open-show submission succeeds for the exhibitor. Rollback leaves the live function untouched.
