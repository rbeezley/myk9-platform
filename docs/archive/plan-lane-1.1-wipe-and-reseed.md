# Plan: Lane 1.1 — Test-Data Wipe & Repeatable Reseed

> **Status:** Complete

**Outcome (2026-06-17):** Executed. Hard wipe + reseed ran as one atomic
transaction against the live DB — deleted 39 cart items, 9 shows (cascade), 230
dogs, 67 clubs, 132 non-protected people (and all tombstones); seeded 1 club, 1
published show, 2 trials, 5 classes, 6 dogs, 8 entries. Final state: exactly the
11 protected accounts + the demo dataset, zero tombstones. The repeatable reset
lives at `supabase/seed-demo.sql` (idempotent; re-run to restore demo state).

**Goal:** clear the accumulated test-data noise from the live DB and replace it with
a small, clean, *reproducible* seed set — so the app is easy to demo/test and the DB
can be reset to a known state with one command. Verified-safe now that delete/restore
is fixed (#790/#793/#796).

## Current state (inventory 2026-06-17)

| table   | live | soft-deleted | total |
|---------|-----:|-------------:|------:|
| shows   |    8 |            1 |     9 |
| trials  |    8 |           25 |    33 |
| classes |  112 |          197 |   309 |
| entries |  193 |            8 |   201 |
| dogs    |  140 |           90 |   230 |
| people  |  107 |           36 |   143 |
| clubs   |   62 |            5 |    67 |

## Protect-list — KEEP these 11 people (and their logins/roles), delete all else

| email | name | note |
|-------|------|------|
| beezley@cox.net | Richard Beezley | owner; owns 1 live dog |
| admin@myk9t.com | Test Admin | site_admin |
| club@myk9t.com | Test Club | club_admin |
| secretary@myk9t.com | Test Secretary | **owns 100 live dogs** |
| judge@myk9t.com | Test Judge | judge |
| e2e-admin@test.myk9.com | Test Admin | e2e suite |
| e2e-clubadmin@test.myk9.com | Test ClubAdmin | e2e suite |
| e2e-exhibitor@test.myk9.com | Test Exhibitor | e2e suite (the only "Test Exhibitor") |
| e2e-judge@test.myk9.com | Test Judge | e2e suite |
| e2e-secretary@test.myk9.com | Test Secretary | e2e suite |
| e2e-steward@test.myk9.com | Test Steward | e2e suite |

Notes: there is **no** named `Test Exhibitor` under `@myk9t.com` (only `exhibitor1-5@myk9t.com`
test rows, which are wiped); the protected exhibitor is `e2e-exhibitor`. Protected
people's *dogs/entries are NOT preserved* — they're wiped with everything else and the
reseed recreates a clean set. The owns-dogs guard (MK001) does not block keeping a
person; it only blocks deleting one, which we don't do here.

## Wipe scope & order (hard delete — true clean slate, purges tombstones too)

The show subtree is almost all `ON DELETE CASCADE`, so deleting parents cascades.
Run as the postgres pooler connection (bypasses RLS/FORCE RLS). Order:

1. `DELETE FROM entry_cart_items;` — NO ACTION FK to classes **and** dogs; must clear first.
2. `DELETE FROM shows;` — cascades trials → classes → entries + ~20 child tables.
3. `DELETE FROM dogs;` — verify no NO ACTION/RESTRICT inbound FK blocks (entries already gone).
4. `DELETE FROM clubs;` — verify inbound FKs (shows already gone).
5. `DELETE FROM people WHERE id NOT IN (<11 protected ids>);` — cascades user_roles,
   club_members, judge_*, notifications, stripe_customers, role_requests, etc.

Each step's inbound NO ACTION/RESTRICT FKs must be confirmed in the dry-run; add a
pre-clear for any that block. (Known: `entry_cart_items` on classes+dogs.)

## Phases

1. **Dry-run** — wrap the full wipe in `BEGIN … ROLLBACK`; after the deletes, assert
   the 11 protected people (and their user_roles) survive and every target table is
   empty, then ROLLBACK. Fix any FK blocker surfaced. Zero persistence.
2. **Reseed script** — author `supabase/seed-demo.sql` (or a script): a minimal,
   deterministic dataset — 1 club, 1 published show with 2 trials / a few classes,
   ~6 dogs owned across the protected exhibitor accounts, a handful of entries. Idempotent
   (safe to re-run: delete-then-insert by stable ids, or guard on a sentinel).
3. **Execute** — run the wipe (explicit confirm), then the reseed; verify counts.
4. **Document** — note the reset command in the reseed script header + TO-DOS.

## Open decisions (confirm before Phase 3)
- **Hard vs soft wipe.** Recommend HARD (clean slate; also clears the 90/197/36 tombstones). Soft would leave restorable noise.
- **Reseed contents.** Needs a concrete spec — what shows/dogs/entries the demo+e2e flows expect. Drafted in Phase 2; review before running.

## Out of scope
- Touching `auth.users` for the protected logins (kept as-is).
- Production (this is the staging/dev `myk9-platform` project).
