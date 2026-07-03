## 1. Pre-work (required before writing SQL)

- [x] 1.1 Query live schema for `promo_codes` and `trial_judge_supplies` column
      names (`trial_id`/`show_id`/FKs) to confirm the authoritative scope key
- [x] 1.2 Confirm exact signatures of `can_manage_show`, `is_show_official`,
      `is_trial_secretary`, `is_club_admin` against the live schema
- [x] 1.3 Grep the client for any promo-code list/read view to decide SA-002
      SELECT option (scoped SELECT vs. validate-only RPC)

## 2. SA-002 — promo_codes

- [ ] 2.1 Write failing SQL/Deno policy tests: exhibitor INSERT into another
      show's `promo_codes` denied; exhibitor SELECT of another show's codes
      returns 0 rows (red against current permissive policy)
- [x] 2.2 Write `<ts>_scope_promo_codes_rls.sql`: DROP the two permissive
      policies, CREATE scoped INSERT aligned to the `085_*` UPDATE predicate
- [x] 2.3 Implement the chosen SELECT fix (scoped policy or `SECURITY DEFINER`
      validate-code RPC) and re-point any client read path found in 1.3
- [x] 2.4 Confirm `submit_show_entries` (mig `151`) still ignores client promo
      input after the change (regression check, not a code change)
- [ ] 2.5 Run the tests from 2.1 green

## 3. SA-007 — trial_judge_supplies

- [ ] 3.1 Write failing SQL/Deno policy tests: unrelated authenticated user
      write/delete on another trial's supply row denied (red against current
      permissive policy)
- [x] 3.2 Write `<ts>_scope_trial_judge_supplies_rls.sql`: DROP the four
      permissive policies, CREATE `trials`-joined scoped replacements mirroring
      `087_security_sa017_checklist_state_rls.sql`
- [x] 3.3 Decide and implement read scope (show-participant vs. official-only)
      per the design doc
- [ ] 3.4 Run the tests from 3.1 green

## 4. Verification and rollout

- [ ] 4.1 Run `migration-auditor` subagent on both new migration files
- [x] 4.2 Run `supabase db push --dry-run`; confirm clean
- [ ] 4.3 Request Codex second opinion (RLS change)
- [ ] 4.4 Push migrations only after explicit user confirmation (merge is not
      deploy)
- [ ] 4.5 Update `docs/security-audit-2026-07/README.md` status table (SA-002,
      SA-007 rows → DONE) and this change's tracking status
