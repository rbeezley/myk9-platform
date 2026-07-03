## 1. Pre-work (required before writing SQL)

- [x] 1.1 Query live schema for `promo_codes` and `trial_judge_supplies` column
      names (`trial_id`/`show_id`/FKs) to confirm the authoritative scope key
      — CONFIRMED (live introspection): `promo_codes` has BOTH `trial_id` (uuid,
      nullable) AND `show_id` (uuid, nullable) — a row is scoped by exactly one.
      `show_id` was added post-045 (not co-located with CREATE TABLE). Scope
      predicate must cover both cases. `trial_judge_supplies` has `trial_id`
      (uuid, NOT NULL) → single trials-join.
- [x] 1.2 Confirm exact signatures of `can_manage_show`, `is_show_official`,
      `is_trial_secretary`, `is_club_admin` against the live schema
      — CONFIRMED: `can_manage_show(check_show_id UUID)` (038, SECURITY DEFINER,
      = is_club_admin OR is_trial_secretary OR is_platform_admin for the show's
      club); `is_show_official(check_show_id UUID)` (099, user_roles join,
      secretary/chairman/steward scoped to show_id, or site_admin);
      `is_trial_secretary(check_club_id UUID DEFAULT NULL)`;
      `is_club_admin(check_club_id UUID DEFAULT NULL)`; `is_platform_admin()`.
      Live policies confirmed via pg_policies (see 2.2/3.2 DROP targets).
- [x] 1.3 Grep the client for any promo-code list/read view to decide SA-002
      SELECT option (scoped SELECT vs. validate-only RPC)
      — CONFIRMED: every LIVE read call site is official-facing —
      `getPromoCodesByTrial`/`getPromoCodesByShow` (secretary catalog via
      `usePromoCodeDatabase`), and the batch read inside
      `getEntriesByShowForFinancials` (secretary financials). The exhibitor
      validation path (`validatePromoCodeForEntry`/`findPromoCodeByCode`) exists
      in the service layer but has NO wired UI caller. Decision: officials-only
      SELECT + a `SECURITY DEFINER` validate RPC that the exhibitor service
      functions call (forward-safe for when checkout wires them).

## 2. SA-002 — promo_codes

- [x] 2.1 Write failing SQL/Deno policy tests: exhibitor INSERT into another
      show's `promo_codes` denied; exhibitor SELECT of another show's codes
      returns 0 rows (red against current permissive policy)
      — DONE: source-text RLS contract test
      `apps/myk9show/src/test/database/promoCodesScopingRlsContract.test.ts`
      (repo's established `*RlsContract` pattern) asserts the scoped INSERT/SELECT
      predicates + the validate RPC. Red before the migration existed, green now.
- [x] 2.2 Write `<ts>_scope_promo_codes_rls.sql`: DROP the two permissive
      policies, CREATE scoped INSERT — NOTE: aligned to the **087** show-scoped
      `can_manage_show` join, not the weaker `085` UPDATE predicate
      (`created_by OR is_trial_secretary()` is not row-scoped; the spec requires
      "manages the row's show/trial"). Handles the dual scope key (show_id
      direct OR trial_id→trials.show_id). File
      `supabase/migrations/20260703123000_scope_promo_codes_rls.sql`.
- [x] 2.3 Implement the chosen SELECT fix (officials-only SELECT + `SECURITY
      DEFINER` `validate_promo_code` RPC) and re-point the client validate path
      — DONE (user chose full re-point): `reads.ts` `validatePromoCode`/
      `validatePromoCodeForEntry` now call the RPC; dead finders
      (`getPromoCodeByCode`/`findPromoCodeByCode`) removed; barrel + generated
      types + `PromoCodeValidationResult` updated; service test re-pointed to
      mock `.rpc()`.
- [x] 2.4 Confirm `submit_show_entries` (mig `151`) still ignores client promo
      input after the change — CONFIRMED: mig 151 has no `promo` reference; the
      server fee path is independent of the RLS change. No code change.
- [x] 2.5 Run the tests from 2.1 green — 21/21 green (both contract tests + the
      re-pointed promo service test); `pnpm typecheck` + `pnpm lint` clean.

## 3. SA-007 — trial_judge_supplies

- [x] 3.1 Write failing SQL/Deno policy tests: unrelated authenticated user
      write/delete on another trial's supply row denied (red against current
      permissive policy)
      — DONE: `apps/myk9show/src/test/database/trialJudgeSuppliesScopingRlsContract.test.ts`
      asserts all four policies DROP + recreate with the trials-joined
      `can_manage_show` predicate and that no policy keeps `auth.uid() IS NOT NULL`.
- [x] 3.2 Write `<ts>_scope_trial_judge_supplies_rls.sql`: DROP the four
      permissive policies, CREATE `trials`-joined scoped replacements mirroring
      `087_security_sa017_checklist_state_rls.sql`
      — File `supabase/migrations/20260703124000_scope_trial_judge_supplies_rls.sql`.
- [x] 3.3 Decide and implement read scope (show-participant vs. official-only)
      per the design doc — DECIDED official-only (design Open Question #2): all
      live consumers are official surfaces (secretary trial view + supply report);
      no participant surface reads it. Spec delta updated to match (least privilege).
- [x] 3.4 Run the tests from 3.1 green — green (included in the 21/21 above).

## 4. Verification and rollout

- [x] 4.1 Run `migration-auditor` subagent on both new migration files
      — DONE: both SAFE TO PUSH (DROP names match live policies; `(SELECT fn())`
      initplan wrapper used, not the O(N) anti-pattern; RPC has REVOKE-from-PUBLIC
      + GRANT-to-authenticated + empty search_path). Two findings FIXED: (1) swapped
      deprecated `is_platform_admin()` → canonical `is_site_admin()` (mig 124
      convention) in both migrations + contract tests; (2) removed the RLS-unsafe
      raw SELECT+UPDATE fallback in `incrementPromoCodeUsage` (would fail for
      exhibitor sessions under officials-only writes) — now RPC-only, typed.
- [ ] 4.2 Run `supabase db push --dry-run`; confirm clean
- [ ] 4.3 Request Codex second opinion (RLS change)
- [ ] 4.4 Push migrations only after explicit user confirmation (merge is not
      deploy)
- [ ] 4.5 Update `docs/security-audit-2026-07/README.md` status table (SA-002,
      SA-007 rows → DONE) and this change's tracking status
