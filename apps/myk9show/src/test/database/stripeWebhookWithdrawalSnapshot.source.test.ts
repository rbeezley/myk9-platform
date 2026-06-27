import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression contract for the withdrawal-policy SNAPSHOT wiring in stripe-webhook.
 *
 * The precedence rule lives in (and is unit-tested via) the pure helper
 * _shared/withdrawalPolicy.ts. These source assertions pin the WIRING a pure
 * helper can't: that BOTH paid-entry paths stamp the snapshot, that the stamp is
 * decoupled from the payment write (best-effort, never throws), and that it runs
 * with the correct show id per path.
 */
const source = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-webhook/index.ts'),
  'utf8'
);

describe('stripe-webhook withdrawal snapshot wiring', () => {
  it('decides the snapshot via the pure helper (the precedence rule is unit-tested there)', () => {
    expect(source).toContain('resolveWithdrawalPolicy');
    expect(source).toContain("from '../_shared/withdrawalPolicy.ts'");
  });

  it('stamps freshly-created cart entries with the show they were paid under', () => {
    expect(source).toContain('await stampWithdrawalSnapshot(entryIds, cart.show_id)');
  });

  it('stamps payment-link entries using the actually-paid ids and the link show', () => {
    expect(source).toContain(
      'await stampWithdrawalSnapshot(updatedEntryIds, link.show_id as string | null)'
    );
  });

  it('is best-effort and decoupled from the payment write — never throws, only logs', () => {
    // The whole stamp body is wrapped so a failure (incl. columns not yet
    // migrated) cannot break a committed payment.
    expect(source).toContain('async function stampWithdrawalSnapshot(');
    expect(source).toContain('snapshot stamp failed (non-fatal)');
    expect(source).toContain('snapshot stamp threw (non-fatal)');
    // A null snapshot writes nothing (leaves the entry column NULL).
    expect(source).toContain('if (!snapshot) return;');
  });

  it('writes only the snapshot column on entries (does not touch payment fields)', () => {
    expect(source).toContain('.update({ withdrawal_policy_snapshot: snapshot })');
  });
});
