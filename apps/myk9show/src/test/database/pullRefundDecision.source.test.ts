import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * TWO files, on purpose.
 *
 * `20260722160000` still owns the SHAPE — the columns, the CHECK constraint and
 * the audit index — and nothing has superseded those. It no longer owns the
 * BEHAVIOUR: MYK9-632 replaced `set_entry_refund_decision` and the reinstate
 * trigger in `20260917214300`, and MYK9-2099 replaced both again in
 * `20261117152900`, and MYK9-2145 again in `20261118174500` (the latest definition), and a source test that keeps reading the older
 * file certifies a guard that is not what ships. It also stays green while it
 * does so, which is the worst version of that mistake (LESSONS
 * replace-function-latest).
 */
const migrationsDir = resolve(__dirname, '../../../../../supabase/migrations');
const shape = readFileSync(
  resolve(migrationsDir, '20260722160000_add_pull_refund_decisions.sql'),
  'utf8'
);
const behaviour = readFileSync(
  resolve(migrationsDir, '20261118174500_myk9_2145_refund_decision_check_in_pull.sql'),
  'utf8'
);

describe('pull refund decision persistence', () => {
  it('stores a constrained decision and its audit metadata on entries', () => {
    expect(shape).toContain('refund_decision');
    expect(shape).toContain("CHECK (refund_decision IN ('denied'))");
    expect(shape).toContain('refund_decided_at');
    expect(shape).toContain('refund_decided_by');
  });

  it('allows only show officials to deny an unresolved paid-online removal', () => {
    expect(behaviour).toContain('public.is_site_admin()');
    expect(behaviour).toContain('public.is_show_secretary(v_show_id)');
    expect(behaviour).toContain('v_club_id IS NOT NULL AND public.is_club_admin(v_club_id)');
    expect(behaviour).toContain("COALESCE(v_payment_method, '') <> 'online'");
    expect(behaviour).toContain("COALESCE(v_payment_status, '') <> 'paid'");
    expect(behaviour).toContain('FOR UPDATE OF e');
  });

  // MYK9-2099: the status arm admits a pull, a withdrawal (with or without a
  // reason code, so a secretary removal too) and a no-show: the same rows
  // `refundToDecideRemoval` offers the Deny control for. It COALESCEs, because
  // with a NULL entry_status the NOT IN is NULL and the guard would fall through.
  // MYK9-2145: a check-in 'pulled' flag (ringside or the exhibitor's check-in) is a pull too.
  it('admits pulls, check-in pulls, withdrawals, removals and no-shows', () => {
    expect(behaviour).toContain(
      "COALESCE(v_entry_status, '') IN ('scratched', 'withdrawn', 'absent')"
    );
    expect(behaviour).toContain("OR lower(COALESCE(v_check_in_status, '')) = 'pulled'");
    expect(behaviour).toContain(
      "RAISE EXCEPTION 'entry % is not an unresolved paid-online pull, withdrawal, removal or no-show'"
    );
    expect(behaviour).toContain('COALESCE(v_refund_amount, 0) > 0');
    // The superseded coded-withdrawal-only arm must not survive in the shipped file.
    expect(behaviour).not.toContain('v_withdrawal_reason_code');
  });

  it('exposes only the guarded RPC to authenticated users', () => {
    expect(behaviour).toContain(
      'REVOKE EXECUTE ON FUNCTION public.set_entry_refund_decision(uuid, text) FROM PUBLIC, anon'
    );
    expect(behaviour).toContain(
      'GRANT EXECUTE ON FUNCTION public.set_entry_refund_decision(uuid, text)'
    );
    // The INSERT arm of the column guard is unchanged and still lives with the
    // trigger's original CREATE.
    expect(shape).toContain('BEFORE INSERT ON public.entries');
    expect(behaviour).toContain("IF TG_OP = 'INSERT'");
  });

  // MYK9-632 widened this to withdrawals, MYK9-2099 to no-shows and MYK9-2145 to
  // check-in pulls. Behaviour pinned in supabase/tests/withdraw_or_pull_own_entry_test.sql,
  // myk9_2099_refund_decision_removed_absent_test.sql and
  // myk9_2145_refund_decision_check_in_pull_test.sql; this only checks the
  // shipped file is the one that says it.
  it('clears a saved denial when any decided removal is reinstated', () => {
    expect(behaviour).toContain("old.entry_status IN ('scratched', 'withdrawn', 'absent')");
    expect(behaviour).toContain('new.entry_status IS DISTINCT FROM old.entry_status');
    expect(behaviour).toContain("AND lower(COALESCE(new.check_in_status, '')) <> 'pulled'");
    expect(behaviour).toContain('new.refund_decision := NULL');
    expect(behaviour).toContain('new.refund_decided_at := NULL');
    expect(behaviour).toContain('new.refund_decided_by := NULL');
    // The narrow condition must not survive in the shipped file.
    expect(behaviour).not.toContain("new.entry_status IS DISTINCT FROM 'scratched'");
  });

  it('adds constraints idempotently and indexes the audit foreign key', () => {
    expect(shape).toContain("WHERE conname = 'entries_refund_decision_check'");
    expect(shape).toContain('entries_refund_decided_by_idx');
    expect(shape).toContain('WHERE refund_decided_by IS NOT NULL');
  });
});
