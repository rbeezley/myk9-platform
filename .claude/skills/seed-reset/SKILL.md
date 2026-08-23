---
name: seed-reset
description: "Use when reseeding dev/staging demo data, when e2e or demo accounts can't sign in (400s), when a role sees empty pages after a reseed, or when someone asks to 'reset the database', 'fix the test accounts', or 'reseed demo data'."
user-invocable: true
---

# Seed Reset

Dev/staging run on the idempotent `seed-demo.sql` demo dataset (clean-wiped 2026-06-17). Most "data is broken" reports after a reseed are one of three known gaps — check those before writing any SQL.

## Canonical accounts

Sign-in-capable accounts are the `@myk9t.com` set (exhibitor, secretary, judge, clubadmin, chairman, steward, testadmin — see the table in the `audit-pages` skill). They replaced `e2e-*@test.myk9.com` on 2026-08-23, when that undeliverable domain was retired. `exhibitor1/3/4/5@myk9t.com` remain demo fixture rows holding no roles. All e2e accounts share one password kept in `.env.local`.

## Known failure modes after a reseed

| Symptom | Cause | Fix |
| --- | --- | --- |
| `e2e-*` sign-in 400 | Supabase Auth passwords drifted from `.env.local` — auth state, not code | Reset the auth passwords (admin API or dashboard), don't debug the app |
| Secretary/club-admin pages empty | Missing club-scoped role grants | `seed-demo.sql` §10 grants them (fixed #804) — confirm those rows exist in `roles`/`role_permissions` |
| Feature works for admin, not other roles | RBAC seed gap | Inventory `roles`, `permissions`, `role_permissions` in ONE query batch before writing any INSERT (CLAUDE.md debugging rule) |

## Reseeding procedure

1. Confirm target is dev/staging — **never** run seed SQL at a production ref without explicit instruction. Project ref: `sojmvhhwsjxmfistvzbe`.
2. Reseed is a shared-system write: confirm with the user first (Auto Mode rule).
3. Run `seed-demo.sql` (idempotent — safe to re-run over existing demo data).
4. Verify, in one query batch: demo shows/trials/classes/entries exist; §10 role grants exist; `auth.users` rows exist for all five e2e accounts.
5. Smoke-test sign-in for secretary and exhibitor (two-step SmartSignInPage flow) before declaring done.

## Guardrails

- The demo exhibitor (`exhibitor@myk9t.com`) is a protected account with seeded dogs — don't delete or repurpose it.
- Person-delete is trigger-blocked when the person owns live dogs; surface the edge-fn error CODE rather than fighting it.
- After schema changes, re-check that seed SQL still satisfies CHECK constraints and enum values before pushing (memory: db-constraint-review).
