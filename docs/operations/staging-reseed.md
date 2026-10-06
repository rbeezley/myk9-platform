# Staging demo reseed — runbook

Operational guide for resetting the staging demo dataset (Supabase project
`sojmvhhwsjxmfistvzbe`) to a known, walkable state. The **content** source of
truth is [`supabase/seed-demo.sql`](../../supabase/seed-demo.sql) — read its
header for the full dataset description and section map. This runbook covers how
to run it and, critically, **what to verify afterward**.

## Precondition: migrations first

Since MYK9-538 the seed's money guard is the database function
`public.seed_demo_assert_no_paid_strays()`, added by migration
`20260916213500`. **Push migrations to the target database before reseeding it.**
If that migration is missing, `seed-demo.sql` aborts on

```
ERROR:  42883: function public.seed_demo_assert_no_paid_strays() does not exist
```

before any parent delete. The whole file runs in one transaction, so the
database is left untouched — but the reseed has not happened either. Check with
`supabase migration list` from a linked checkout.

## What a reseed is

1. **Hard wipe (historical, 2026-06-17 only)** — cleared all
   shows/trials/classes/entries/dogs/clubs and all non-protected people (the 11
   protected accounts survived). Order:
   `entry_cart_items → shows (cascade) → dogs → clubs → non-protected people`.
   **Do not repeat it** now that clubs run their own UAT shows on staging
   (MYK9-558): a blanket delete would destroy them. Remove stray data from the
   site-admin dashboard (soft-delete, then Admin → Data Lifecycle Management →
   Deleted Entities) instead.
2. **Reseed** — run `supabase/seed-demo.sql`. It is idempotent (content reset,
   not the wipe) and references the protected accounts by email lookup. Every
   delete it runs is scoped to the ids it seeds, so a hand-created show survives.
   It yields the LEAN set (two clubs, the three Heartland shows, six dogs, 13
   entries on the demo show) plus the show-day fixture `Heartland Scent Work
Week`, which has a trial dated today for seven days after the reseed
   (MYK9-731), and removes the MYK9-109 load fixture if it was applied.
   Once the seven days lapse, no seeded show is running today and the walks
   record show-day check-in, running order and announcements as a
   stale-fixture gap. Between reseeds, renew it with the targeted restore in
   [Show-day fixture restore](#show-day-fixture-restore-between-reseeds) below
   rather than a full reseed.
3. **Load fixture (opt-in)** — only for a load rehearsal or a 63-entry PDF
   calibration, run `supabase/seed-load-fixture.sql` AFTER step 2 against the
   same URL (MYK9-558). It adds the 63 load dogs and 504 entries on the demo
   show plus the three load clubs and shows. Rerun step 2 alone to remove it;
   never leave it applied while a club is testing on staging, because the staff
   dog picker searches every dog in the system.

```bash
# From a checkout linked to staging (or copy supabase/.temp from a linked tree).
export PGPASSWORD="$(grep '^SUPABASE_DB_PASSWORD=' supabase/.env | cut -d= -f2-)"
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/seed-demo.sql
```

> Worktrees are NOT linked to Supabase (the CLI link cache lives in
> `supabase/.temp`, which—like gitignored files—does not copy across worktrees).
> Copy `supabase/.temp` from a linked checkout, or run from the linked tree.

## Show-day fixture restore (between reseeds)

The show-day fixture (`Heartland Scent Work Week`, show
`dededede-0000-0000-0000-000000000014`) goes stale seven days after a reseed,
and a walk or a person can soft-delete it from the app. On 2026-10-01 the demo
secretary account deleted the whole show, which stamped its trials, classes and
entries too, and the October 5 show-day walk found zero live classes. A full
reseed is the wrong repair now: while real paid entries sit on a real club
show, `seed_demo_assert_no_paid_strays()` aborts it, by design.

`public.seed_demo_restore_show_day_fixture()` (migration `20261006014300`,
MYK9-731) repairs only this fixture. It re-dates the seven trials to today
through today + 6 in America/Chicago and undeletes the show, trials and classes.
It resets the 14 fixture entries, the armbands, the judge assignments and the two
announcements by their seed-fixed ids, and it turns self-check-in on. It never
touches another show, a person, a dog, or any payment, refund or Stripe row, and
it leaves an entry a walk created on the fixture as it is. Section 19 of
`seed-demo.sql` calls the same function, so the reseed and the restore cannot
drift apart.

- **Who runs it:** the owner. It writes to the shared staging database, so an
  agent does not run it unprompted, even in auto mode.
- **When:** before a scheduled show-day or exhibitor walk whose precondition
  query reports the fixture stale or missing, or on any day a show-day walk is
  planned. It is idempotent: a second run on the same day writes nothing and
  returns all-zero counts.
- **Precondition:** migration `20261006014300` is on the database
  (`supabase migration list`). Without it the call fails with `42883 function
... does not exist` and changes nothing.

```bash
# From a checkout that has supabase/.env (no link needed).
export PGPASSWORD="$(grep '^SUPABASE_DB_PASSWORD=' supabase/.env | cut -d= -f2-)"
psql "postgresql://postgres.sojmvhhwsjxmfistvzbe@aws-1-us-east-2.pooler.supabase.com:5432/postgres" \
  -X -v ON_ERROR_STOP=1 -c "select public.seed_demo_restore_show_day_fixture();"
```

It returns the rows it wrote per table plus the date it used, for example
`{"shows": 1, "trials": 7, "classes": 7, "entries_reset": 14, "entries_inserted": 14, ..., "today": "2026-10-06"}`.

It **refuses, and writes nothing,** when:

- the show is missing (`P0002`). Run the full reseed instead.
- the show is no longer under the Heartland demo club.
- `exhibitor@`, `secretary@` or `judge@myk9t.com` does not resolve to exactly
  one person, or the seeded dogs Willow and Cooper are missing or deleted.
- money sits on the show. That means a paid or refunded entry with a payment
  trail (the same predicate as the reseed guard, minus status history), a
  Stripe intent or refund on any entry, a paid enrollment, a Stripe order, a
  `show_payments` row, a cart line or a refund request. Resolve those rows
  deliberately. Never widen the guard to get past it.
- a fixture entry sits in a class outside the fixture, or an entry a walk
  created in a fixture class holds a placement or, if not deleted, a result.
  Resetting a fixture entry re-derives its class (class status and every
  entry's `final_placement` in it) through the entries scoring trigger, so the
  restore refuses rather than re-rank a row that is not the fixture's. Remove
  the walk's entry through the app, or run the full reseed.

Then confirm readiness, which is the query every walk's precondition runs:

```sql
select count(*) from public.trials t
join public.shows s on s.id = t.show_id
join public.show_visibility_settings vs on vs.show_id = s.id
join public.classes c on c.trial_id = t.id
join public.entries e on e.class_id = c.id
join public.people p on p.id = e.handler_id
where s.id = 'dededede-0000-0000-0000-000000000014'
  and s.status = 'published'
  and s.deleted_at is null and t.deleted_at is null
  and c.deleted_at is null and e.deleted_at is null
  and t.date = (now() at time zone t.timezone)::date
  and t.allow_self_checkin and vs.self_checkin_enabled
  and c.start_time is not null and e.run_order is not null
  and lower(p.email) = 'exhibitor@myk9t.com';                    -- expect 1
```

## Post-reseed verification — REQUIRED

A partial reseed (wipe ran, but the full `seed-demo.sql` did not, or an older
seed predating a section) leaves silent gaps. The wipe cascades through FKs
(e.g. `judge_assignments.show_id → shows ON DELETE CASCADE`), so any section the
reseed skips comes back **empty**, not stale. Run these after every reseed:

```sql
-- 1. JUDGE ASSIGNMENTS must be non-empty (seed §11). See incident below.
select count(*) from public.judge_assignments;                 -- expect > 0

-- 2. RBAC role grants present (seed §10/10b/10c/10d).
select r.name, count(*) from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.is_active group by r.name;                           -- expect secretary/club_admin/judge/steward/chairman

-- 3. Ringside passcodes seeded for the demo show (seed §12).
select count(*) from public.show_passcodes
  where show_id = 'dededede-0000-0000-0000-000000000010';       -- expect > 0

-- 4. Demo show + children present.
select
  (select count(*) from public.shows   where id        = 'dededede-0000-0000-0000-000000000010') as shows,
  (select count(*) from public.classes c join public.trials t on t.id=c.trial_id
     where t.show_id = 'dededede-0000-0000-0000-000000000010') as classes;
```

If `judge_assignments` (or any check) is empty, re-run the full
`seed-demo.sql` — or, to repair just that section, re-run its `DELETE` + `INSERT`
block scoped to the demo show.

## Incident: empty `judge_assignments` (2026-06-21)

`public.judge_assignments` was found **empty platform-wide** on staging even
though `seed-demo.sql` §11 inserts assignments for `judge@myk9t.com` and
`e2e-judge@test.myk9.com` across the demo show's 5 classes. Root cause was a
reseed that did not fully apply §11 (the wipe cascade-deletes these rows; §11 is
a plain `DELETE`+`INSERT` with no exception handler, so it does not fail
silently — it simply hadn't been run).

**Why it matters beyond any one feature:** an empty `judge_assignments` table
silently breaks **every** judge ringside and judge-dashboard flow — the judge
dashboard selects `judge_assignments → classes`, and the
`ringside_update_entry` RPC (migration `20260621171500`) authorizes a judge's
ringside writes via `judge_assignments`. With no rows, a judge-role account is
denied all ringside writes (incl. scoring) and sees an empty dashboard, with no
error surfaced. Hence check #1 above is mandatory after every reseed.

Repair applied: re-ran `seed-demo.sql` §11 scoped to show
`dededede-0000-0000-0000-000000000010` (10 rows: judge@ + e2e-judge@ × 5
classes each).
