## Context

`promo_codes` (mig `045_promo_codes_financial.sql`) and `trial_judge_supplies`
(mig `20260516170000`) both predate a scoped-RLS convention that now exists
elsewhere in the schema (`085_*`'s `promo_codes` UPDATE policy;
`087_security_sa017_checklist_state_rls.sql`'s `trial_checklist_state` policy).
Both tables currently gate only on "is a logged-in user," which is a cross-tenant
hole once real shows/clubs are not all operated by the same test users. Full audit
evidence: `docs/security-audit-2026-07-03.md` (SA-002, SA-007).

## Goals / Non-Goals

**Goals:**
- Scope every `promo_codes` and `trial_judge_supplies` policy to "manages this
  show/trial," matching the join pattern already accepted for the `085_*` UPDATE
  policy and `trial_checklist_state`.
- Preserve legitimate show-official read/write access with no regression.
- Decide, not guess, the exact predicate — confirm live column names
  (`trial_id`/`show_id`/FKs) and helper-function signatures
  (`can_manage_show`, `is_show_official`, `is_trial_secretary`, `is_club_admin`)
  before writing SQL (CLAUDE.md "don't guess" + seed-data pre-work rule).

**Non-Goals:**
- Redesigning the promo-code feature's UX or the judge-supplies UI.
- Touching the server-side fee path (`submit_show_entries`, mig `151`) — it already
  ignores client promo input; this fix closes the config-table hole, not fee math.
- Client-side replication/offline changes — this is server-side RLS only.

## Decisions

1. **`promo_codes` INSERT** — align to the `085_*` UPDATE predicate (show-official
   join), not `created_by = auth.uid()`. *Alternative considered:* keep
   `created_by`-based check and add a separate scope check — rejected as two checks
   where one join suffices and it's easy for a future edit to drop the second.
2. **`promo_codes` SELECT** — prefer a `SECURITY DEFINER` RPC that validates a
   *specific* typed code (match/no-match + discount only) over a scoped-but-still-
   readable catalog. *Alternative considered:* scope SELECT to show officials only
   — acceptable fallback if the client has a legitimate "list codes to exhibitors"
   view (verify by grep before choosing); the RPC is preferred because it removes
   the catalog-enumeration surface entirely rather than narrowing it.
3. **`trial_judge_supplies` predicate** — reuse the `trial_checklist_state` join
   exactly (join to `trials`, gate on `can_manage_show()`/`is_show_official()`)
   rather than inventing a new helper. *Alternative considered:* write a bespoke
   predicate — rejected, duplicates logic that's already reviewed and tested.
4. **`trial_judge_supplies` read scope** — default to show-scoped read for any
   authenticated show participant (supply lists are per-show operational data, not
   secret), writes/deletes remain official-only. Confirm during pre-work whether any
   consumer needs broader read; narrow further only if evidence says so.

## Risks / Trade-offs

- [Wrong scoping predicate locks out legitimate secretaries] → Mitigation: reuse
  proven predicates (`085_*`, `trial_checklist_state`) instead of inventing new
  ones; red→green policy tests for both allow and deny cases before merge.
- [RPC redesign for promo-code validation changes client integration shape] →
  Mitigation: grep for existing promo-code list/read call sites before choosing
  option (b); if a UI depends on listing codes, fall back to scoped SELECT instead
  of forcing an RPC rewrite under launch time pressure.
- [Migration applied to a live schema with existing rows] → Mitigation:
  `migration-auditor` subagent + `supabase db push --dry-run` before any push;
  push only after explicit confirmation (merge is not deploy).

## Migration Plan

1. Query live schema for `promo_codes`/`trial_judge_supplies` columns and the four
   helper-function signatures (pre-work, no SQL written yet).
2. Write `<ts>_scope_promo_codes_rls.sql`: DROP the two permissive policies, CREATE
   scoped replacements (+ RPC if option (b) chosen).
3. Write `<ts>_scope_trial_judge_supplies_rls.sql`: DROP the four permissive
   policies, CREATE `trials`-joined scoped replacements.
4. Run `migration-auditor` on both files.
5. `supabase db push --dry-run`; push only after explicit user confirmation.
6. Rollback: each migration's DOWN path (or a follow-up migration) restores the
   prior permissive policy if a scoping predicate turns out to be wrong in
   production — do not hand-edit the applied migration.

## Open Questions

- Does any client surface list `promo_codes` to exhibitors? (Determines SELECT
  option a vs. b.)
- Should `trial_judge_supplies` reads be official-only instead of
  any-show-participant? (Default assumed above; confirm against actual consumers.)
