## Why

`promo_codes` (SA-002) and `trial_judge_supplies` (SA-007) both authorize mutations
on "is logged in" instead of "manages this show." Any authenticated user can insert
a promo code or read the full catalog for every show; any authenticated user can
write/delete another show's supply-request rows. This is one of the two design-level
findings from the 2026-07-03 pre-launch security audit
(`docs/security-audit-2026-07-03.md`) still open, and it's a cross-tenant write hole
— worth closing before real shows create real financial config and operational data.

## What Changes

- Replace the two permissive `promo_codes` policies (`INSERT WITH CHECK (created_by
  = auth.uid())`, `SELECT USING (auth.uid() IS NOT NULL)`) with show/trial-scoped
  policies aligned to the already-accepted `085_*` UPDATE scope. Decide whether
  SELECT stays a scoped read for show officials or is replaced by a `SECURITY
  DEFINER` validate-code RPC that never exposes the catalog (recommended).
- Replace the four `trial_judge_supplies` policies (`USING/WITH CHECK (auth.uid() IS
  NOT NULL)`) with `trials`-joined policies mirroring the `trial_checklist_state`
  precedent (`087_security_sa017_checklist_state_rls.sql`), gating writes to
  show officials and deciding read scope (show-participant vs. official-only).
- New migrations only — never edit `045_promo_codes_financial.sql` or the
  `20260516170000` supplies migration.

## Capabilities

### New Capabilities
- `rls-promo-codes-scoping`: show/trial-scoped RLS for `promo_codes` INSERT/SELECT,
  closing the cross-tenant financial-config disclosure and write hole (SA-002).
- `rls-trial-judge-supplies-scoping`: show-official-scoped RLS for
  `trial_judge_supplies` SELECT/INSERT/UPDATE/DELETE (SA-007).

### Modified Capabilities
(none — no existing OpenSpec capability covers these tables yet)

## Impact

- DB: two new migration files (`<ts>_scope_promo_codes_rls.sql`,
  `<ts>_scope_trial_judge_supplies_rls.sql`), pushed only after
  `migration-auditor` + `supabase db push --dry-run` are clean and after explicit
  confirmation (merge is not deploy).
- Code: possible new `SECURITY DEFINER` RPC for promo-code validation if SELECT is
  locked down (option b in the source plan); any client code that lists/reads
  `promo_codes` directly must be re-pointed at the RPC.
- Tests: new SQL/Deno policy tests proving cross-tenant denial (red before fix,
  green after); Codex second opinion required (RLS change per audit-remediation
  rules of the road).
- Fall 2026 launch: closes a pre-launch-audit MEDIUM finding before show creation
  is real; does not touch offline-first replication paths (server-side RLS only).
- Does not duplicate an existing surface — this is a policy fix on tables with no
  UI redesign; no link-vs-build question applies.

Full technical detail: `docs/security-audit-2026-07/plan-scoping-rls.md`.
