# exhibitor-closed-show-server-guard

## Why

The `exhibitor-ux-remediation` change (#1217) shipped a **client** cart gate that stops an exhibitor from paying into a show whose entries have closed, and its `cart-integrity` spec already requires that "the entry-submission path SHALL reject submissions for closed shows server-side" ("Stale client attempts submission" scenario). That server half was **deferred** — task 2.1 was left `[~]` paused as a money-path migration needing explicit confirmation. This change delivers it.

Investigating the write paths surfaced two facts the earlier pass recorded incorrectly:

1. **The online path is already gated, but closes entries ~a day early.** `stripe-checkout` (the online-payment path) does check `entry_close_date`, but with `now > new Date(entry_close_date).getTime()`. `shows.entry_close_date` is a **timestamptz** whose value for a typed calendar date is *midnight UTC* of that day. Comparing against that instant closes online entry at the *start* of the close day in UTC — e.g. 8pm ET the evening before an Eastern show's stated close date. The client cart gate (#1217) keeps the cart open through the end of that local day, so the UI invites a payment the server then 403s. That is a live revenue-losing disagreement, not a hypothetical.
2. **The offline path is not gated at all.** `submit_show_entries` (the SECURITY DEFINER RPC behind cash / check / group / waived / pay-at-show self-service submissions) never checks the entry-close deadline. A direct call — or a client with a stale "entries open" view — can create brand-new entries for a closed show.

## What Changes

- Add an entry-period guard to `submit_show_entries`: reject self-service submissions once the show's entry period has closed. Site admins, show secretaries, and club admins (the RPC's existing `v_is_official` branch) bypass it, so legitimate late and day-of entries by officials keep working.
- Fix the `stripe-checkout` entry-window gate to evaluate the **calendar day** in the show's timezone instead of a UTC instant, for both the open-date and close-date checks. No more early close.
- Both surfaces adopt one boundary rule, identical to the client cart gate: the intended open/close *day* is the stored timestamptz read in UTC; "now" is the current calendar date in the show's timezone (primary trial's `timezone`, default `America/New_York`). Closed once the local date passes the close day.

**Duplication check:** no new UI, pages, or endpoints. This hardens two existing server write paths and reconciles them with the already-shipped client gate — pure consolidation toward one agreed boundary.

## Capabilities

### New Capabilities
- `entry-period-enforcement`: the entry-close deadline is enforced server-authoritatively on every entry-creation path (online checkout and the offline submission RPC), evaluated as a timezone-anchored calendar day so no exhibitor is blocked before the end of the local close day, with an official bypass for legitimate late entries.

## Impact

- `supabase/migrations/` — new migration: `CREATE OR REPLACE submit_show_entries` (verbatim copy of `20260706190500` plus the guard). Requires `supabase db push` (shared DB — confirm per Auto Mode rules).
- `apps/myk9show/supabase/functions/stripe-checkout/index.ts` — entry-window gate rewritten to timezone-anchored calendar-day comparison; adds a primary-trial timezone lookup. Requires `supabase functions deploy stripe-checkout --no-verify-jwt`.
- No client behavior change; the client cart gate and My Entries surfaces are untouched.
- Completes `exhibitor-ux-remediation` task 2.1 (cross-referenced there).
- Tests: source-pin tests for the migration and the edge fix; live rolled-back RPC verification (official bypass vs. non-official reject); the boundary math is proven against live data in `design.md`.
