## Validation Profile

- Risk: high
- Validation: full
- Rationale: This change touches entry submission, payment-status mutation guards, payout inputs,
  and database migrations; focused database/source tests are required, and broad typecheck/lint/CI
  plus migration review are required before merge or shared DB push.

## 1. Assertion-First Coverage

- [x] 1.1 Confirm the existing database/source test proving `submit_show_entries` persists
      `payment_method` in the `public.entries` INSERT column list.
- [x] 1.2 Add a failing database/source test for the new `entries.payment_status` guard:
      online entries cannot be moved to `paid`/`refunded` by non-`service_role` writers.
- [x] 1.3 Add a regression assertion proving the `service_role` path can still move online
      entries to `paid`.
- [x] 1.4 Add a regression assertion proving desk methods (`cash`, `check`, `waived`,
      `secretary_paid`) can still be marked paid through authorized staff paths.

## 2. Database Implementation

- [x] 2.1 Reuse the existing migration redefining `public.submit_show_entries(...)` so inserted
      entries persist `payment_method = p_payment_method` while preserving existing fee, trial,
      idempotency, and waived/`secretary_paid` authorization behavior.
- [x] 2.2 Add a standalone `before update` trigger/function for `entries.payment_status` changes
      with a `service_role` bypass.
- [x] 2.3 Ensure the trigger blocks non-service transitions into `paid` or `refunded` when the
      effective payment method is `online`.
- [x] 2.4 Ensure the trigger allows desk-payment methods to move into `paid` where existing RLS/RPC
      authorization already permits the update.
- [x] 2.5 Include a rollback note in the migration comments or change docs: dropping the standalone
      payment-status trigger restores prior status behavior.

## 3. Verification

- [x] 3.1 Run the focused database/source tests added for this change.
- [x] 3.2 Run the closest relevant TypeScript check or test command for any touched app/function
      files; use full `pnpm typecheck`/`pnpm lint` if production TypeScript beyond tests changes.
- [x] 3.3 Run migration-auditor or the repo's migration review checklist for the new migration:
      no new table/RLS/GRANT surface; standalone `SECURITY DEFINER` function with empty
      `search_path`; explicit `service_role` bypass; trigger scoped to `payment_status` changes;
      rollback path documented.
- [x] 3.4 Run `supabase db push --dry-run` only after shared-DB confirmation is obtained.
      Result: passed; remote would also apply existing pending migration
      `20260705013523_support_tickets.sql` before this change's migration.
- [x] 3.5 Do not run `supabase db push` or deploy functions without explicit shared-system
      confirmation.
- [ ] 3.6 After any confirmed shared DB push, verify the staging online payment path can still mark
      an online entry paid through the service-role/webhook path before calling Phase 1 complete.

## 4. Tracking And Handoff

- [ ] 4.1 Update `docs/plan-money-path-hardening.md` Phase 1 status/evidence after the PR is merged
      and any required migration push is verified.
- [ ] 4.2 Update `docs/operations/go-live-runbook.md` or `OPEN-TODOS.md` only when this phase is
      fully shipped, and keep Phase 2/3 money-path gates open.
- [x] 4.3 Record the pre-go-live audit query for existing `online` rows with no
      `stripe_payment_intent_id` and paid/refunded status.

## 5. PR, CI, Review, And Merge

- [x] 5.1 Run `pnpm openspec validate --changes money-path-hardening-phase1`.
- [x] 5.2 Run `opsx:verify` for `money-path-hardening-phase1` and resolve critical findings.
      Result: no implementation-critical findings; lifecycle gates remain for DB push/staging
      verification, post-merge tracking, PR review, CI, and merge.
- [ ] 5.3 Open a PR that cites `Tracked in openspec change: money-path-hardening-phase1`.
- [ ] 5.4 Run the required Codex/security/migration second-opinion review for money-path and
      database-trigger changes.
- [ ] 5.5 Let CI pass and merge the PR before archive.
