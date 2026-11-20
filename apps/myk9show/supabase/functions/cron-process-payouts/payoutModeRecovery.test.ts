// MYK9-2187 Codex round 1: the hand recovery for a payout held on an
// unconfirmed Stripe mode checks the right mode(s), changes only a row that is
// still unresolved, and records a found transfer by the cron's own rules.
import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../_shared/clubMoneyEmails';
import {
  attemptModeRecoveryHtml,
  MODE_CHECKED_REASON,
  modeCheckedSql,
  recordTransferSql,
} from './payoutModeRecovery';

const GUARD = "and status in ('processing', 'failed') and stripe_transfer_id is null;";

describe('the hand-recovery statements', () => {
  it('the mode check changes only an unresolved row with no transfer recorded', () => {
    expect(modeCheckedSql('row-0')).toBe(
      `update public.show_payouts set status = 'failed', failure_reason = '${MODE_CHECKED_REASON}' where id = 'row-0' ${GUARD}`
    );
  });

  it('recording a transfer writes what the cron writes, under the same guard', () => {
    const sql = recordTransferSql('row-0');
    expect(sql).toContain("set status = 'completed'");
    expect(sql).toContain("stripe_transfer_id = '<tr_ id>'");
    expect(sql).toContain('amount_cents = <');
    expect(sql).toContain('completed_at = now()');
    expect(sql).toContain("paid_stripe_account_id = '<acct_ id it went to>'");
    expect(sql).toContain('paid_destination_checked = true');
    expect(sql.endsWith(`where id = 'row-0' ${GUARD}`)).toBe(true);
  });
});

describe('attemptModeRecoveryHtml', () => {
  it('a mode mismatch points at the other mode only', () => {
    const html = attemptModeRecoveryHtml('mismatch', false, 'show-1', 'row-0');
    expect(html).toContain('in <strong>live mode</strong>, the mode the earlier attempt used');
    expect(html).not.toContain('both');
  });

  it.each(['no_account', 'read_error'] as const)(
    '%s: the operator must check both modes before changing anything',
    mode => {
      const html = attemptModeRecoveryHtml(mode, true, 'show-1', 'row-0');
      expect(html).toContain('both test mode and live mode');
      expect(html).toContain('check both before changing anything');
    }
  );

  it('a fully reversed transfer is not a payment, and the run records what it can see', () => {
    const html = attemptModeRecoveryHtml('mismatch', true, 'show-1', 'row-0');
    expect(html).toContain('returned the money: it is not a payment');
    expect(html).toContain('records a transfer it finds there itself');
    expect(html).toContain(escapeHtml(modeCheckedSql('row-0')));
    expect(html).toContain(escapeHtml(recordTransferSql('row-0')));
    // The placeholders print as text, never as HTML tags.
    expect(html).toContain('&lt;tr_ id&gt;');
    expect(html).not.toContain('<tr_ id>');
  });

  it('asks the operator to confirm exactly one row changed', () => {
    const html = attemptModeRecoveryHtml('no_account', false, 'show-1', 'row-0');
    expect(html).toContain('exactly one row changed (UPDATE 1)');
    expect(html).toContain('UPDATE 0');
  });

  it('escapes the ids it prints', () => {
    const html = attemptModeRecoveryHtml('mismatch', false, '<show>', "row'<x>");
    expect(html).not.toContain('<show>');
    expect(html).not.toContain('<x>');
    expect(html).toContain('&lt;show&gt;');
  });
});
