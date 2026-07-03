# Fix Plan — Show-Scope the `promo_codes` and `trial_judge_supplies` RLS

> **Status:** Active

Covers **SA-002** and **SA-007** from [`../security-audit-2026-07-03.md`](../security-audit-2026-07-03.md).
Both are the same disease — a mutation policy that authorizes on "is logged in"
instead of "manages this show" — so they share a plan and (being both new
migrations) one PR. Design decision required: the exact scoping predicate.

## Why these need a decision (not mechanical)

The fix isn't "add FORCE RLS"; it's choosing the correct join path from each row to
a show/club the caller manages, and deciding what the *read* surface should be. Get
the predicate wrong and you either re-open the hole or lock out legitimate
secretaries. Survey the existing scoped-policy precedents before writing SQL —
**do not guess the predicate** (per `CLAUDE.md` → Don't guess).

## SA-002 — `promo_codes`

**Current (mig `045_promo_codes_financial.sql`):**
- INSERT: `WITH CHECK (created_by = auth.uid())` — no show/trial scope.
- SELECT: `USING (auth.uid() IS NOT NULL)` — every logged-in user reads every code.
- UPDATE: already tightened in `085_*` to creator/secretary/admin (reference model).

**Decision points:**
1. **Scope key** — `promo_codes` carries `trial_id`/`show_id`. Confirm which column
   is authoritative, then gate INSERT with the show-official predicate used by the
   `085_*` UPDATE policy (align INSERT to the already-accepted UPDATE scope).
2. **SELECT model** — a blanket read of a financial config table is the disclosure
   half. Options: (a) restrict SELECT to show officials for the row's show; (b) keep
   the table unreadable to non-officials and validate a *specific typed code* via a
   `SECURITY DEFINER` RPC that returns only match/no-match + discount, never the
   catalog. **(b) is the stronger design** — recommend it unless a UI needs to list
   codes to exhibitors (verify: search the client for a promo-code list view).
3. Confirm the server-side fee path (`submit_show_entries`, mig `151`) still ignores
   client promo input after the change — it should; this fix closes the config-table
   hole, not the fee math.

**New migration:** `<ts>_scope_promo_codes_rls.sql` — DROP the two permissive
policies, CREATE scoped replacements (+ RPC if choosing (b)). New migration file,
never edit `045`.

## SA-007 — `trial_judge_supplies`

**Current (mig `20260516170000`):** all four of SELECT/INSERT/UPDATE/DELETE are
`USING/WITH CHECK (auth.uid() IS NOT NULL)`; the migration comment defers scoping to
the client.

**Decision points:**
1. **Precedent to mirror** — `trial_checklist_state` in
   `087_security_sa017_checklist_state_rls.sql` already solves the identical
   "trial-scoped checklist" shape. Reuse its join-to-`trials` + `can_manage_show()`
   /`is_show_official()` predicate rather than inventing one.
2. **Read vs. write asymmetry** — decide whether *reads* should also be
   show-scoped (likely yes — supply lists are per-show operational data) or whether
   any authenticated show participant may read. Writes/deletes must be
   official-only regardless.

**New migration:** `<ts>_scope_trial_judge_supplies_rls.sql` — DROP the four
`auth.uid() IS NOT NULL` policies, CREATE `trials`-joined scoped replacements.

## Pre-work (required by `CLAUDE.md` seed-data debugging rule)

Single query pass before writing SQL: confirm `promo_codes` and
`trial_judge_supplies` column names (`trial_id`/`show_id`/FKs) and the exact
signatures of `can_manage_show`, `is_show_official`, `is_trial_secretary`,
`is_club_admin` against the live schema. Inventory, then write.

## Testing phase (assertion-first — gate for completion)

RLS is value-sensitive authz — write the failing policy tests first. Preferred: SQL
integration tests (pgTAP or a Deno harness) that set a JWT `sub` for three personas
and assert row visibility/mutation:

- **SA-002:** secretary-of-show-A INSERT into show-A `promo_codes` → allowed;
  exhibitor INSERT into any show → **denied** (currently allowed → red first);
  exhibitor SELECT of another show's codes → **0 rows** (currently all rows).
- **SA-007:** official-of-trial-A UPDATE/DELETE a trial-A supply row → allowed;
  unrelated authenticated user DELETE → **denied** (currently allowed → red first);
  read scope per the decision above.

If no SQL test harness exists, document the manual `psql`-with-`SET request.jwt.claims`
proof in the PR **and** add a code-level regression test that any client read path
for these tables passes a scope. Then:

- `migration-auditor` subagent clean on both migrations.
- `supabase db push --dry-run` clean; **push only after explicit confirmation**;
  merge is not deploy.
- Codex second opinion ON (RLS change).

## Done criteria

Cross-tenant INSERT/SELECT on `promo_codes` and cross-tenant write/delete on
`trial_judge_supplies` are denied at the DB layer, proven by red→green policy tests;
legitimate show officials retain full access; migrations auditor-clean and pushed
under confirmation.
