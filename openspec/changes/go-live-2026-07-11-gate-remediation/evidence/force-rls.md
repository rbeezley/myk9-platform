# FORCE RLS Evidence

**Checked:** 2026-07-11 15:04:23 UTC
**Project:** `sojmvhhwsjxmfistvzbe`
**Mutation performed:** none

## Audit correction

The July 11 audit named five tables. Ordered repository migration replay and a read-only live `pg_class` query show that `public.unified_ringside_overrides` was dropped by applied migration `20260623120000_remove_unified_ringside_flag.sql` and does not exist remotely. Issuing `ALTER TABLE` for it would make the remediation migration fail.

The four extant live gaps are:

- `public.club_premium_templates`
- `public.login_attempts`
- `public.premium_generations`
- `public.secretary_tasks`

All four report `relrowsecurity = true` and `relforcerowsecurity = false` before remediation.

## Repository remediation

Migration `20260711170000_force_rls_go_live_gap.sql` forces RLS on those four tables only and includes manual `NO FORCE` rollback SQL without changing RLS enablement, policies, or grants.

`forceRlsInvariant.test.ts` replays the ordered migration corpus dynamically. Its pre-migration RED reported exactly the four extant gaps; after the remediation migration and independent review hardening, all 13 focused tests pass. The checker uses no table allowlist and covers create, drop, enable, disable, force, and no-force transitions plus compound `ALTER TABLE` statements. It fails closed on any RLS state change inside an anonymous `DO` block—including conditional or dynamic execution—so migrations must express those changes as top-level statements; stored function bodies remain ignored.

The first linked dry run caught that the integration branch's original `20260711150000` version now collided with the ringside containment migration on `main`. `migrationVersionUniqueness.test.ts` reproduced the collision, the FORCE-RLS migration was renumbered to the next free version, and the invariant then passed. A second linked `supabase db push --dry-run` completed cleanly and proposed exactly `20260711170000_force_rls_go_live_gap.sql`; no database write occurred.

The read-only live verifier is `scripts/qa/db-security/force-rls-live.sql`. It has not been used as post-deployment evidence because no database push is authorized yet.
