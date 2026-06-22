# Staging demo reseed — runbook

Operational guide for resetting the staging demo dataset (Supabase project
`sojmvhhwsjxmfistvzbe`) to a known, walkable state. The **content** source of
truth is [`supabase/seed-demo.sql`](../../supabase/seed-demo.sql) — read its
header for the full dataset description and section map. This runbook covers how
to run it and, critically, **what to verify afterward**.

## What a reseed is

1. **Hard wipe** — clears all shows/trials/classes/entries/dogs/clubs and all
   non-protected people (the 11 protected accounts survive). Order:
   `entry_cart_items → shows (cascade) → dogs → clubs → non-protected people`.
   Always dry-run inside `BEGIN … ROLLBACK` first.
2. **Reseed** — run `supabase/seed-demo.sql`. It is idempotent (content reset,
   not the wipe) and references the protected accounts by email lookup.

```bash
# From a checkout linked to staging (or copy supabase/.temp from a linked tree).
export PGPASSWORD="$(grep '^SUPABASE_DB_PASSWORD=' supabase/.env | cut -d= -f2-)"
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/seed-demo.sql
```

> Worktrees are NOT linked to Supabase (the CLI link cache lives in
> `supabase/.temp`, which—like gitignored files—does not copy across worktrees).
> Copy `supabase/.temp` from a linked checkout, or run from the linked tree.

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
