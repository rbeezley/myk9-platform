import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-webhook/index.ts'),
  'utf8'
);

describe('stripe-webhook withdrawal snapshot wiring', () => {
  it('runs post-commit side effects from SQL accepted line results for both payment sources', () => {
    expect(
      source.match(/completeEntrySettlementSideEffects\(settlement, freshSession,/g)
    ).toHaveLength(2);
    expect(source).toContain("settlement.lineResults.filter(line => line.outcome === 'accepted')");
    expect(source).toContain('await stampWithdrawalSnapshot(paidIds, showId)');
  });

  it('includes SQL-derived live and money-root entry ids without trusting planned ids', () => {
    const start = source.indexOf('async function completeEntrySettlementSideEffects');
    const end = source.indexOf('\nfunction fullCartRefundDecision', start);
    const sideEffects = source.slice(start, end);

    expect(sideEffects).toContain('[line.entryId, line.moneyRootEntryId]');
    expect(sideEffects).toContain('new Set(');
    expect(sideEffects).toContain("line.outcome === 'accepted'");
    expect(sideEffects).not.toContain('canonicalEntryIds');
  });

  it('uses the cart show and persisted payment-link show for the snapshot scope', () => {
    expect(source).toContain(
      'completeEntrySettlementSideEffects(settlement, freshSession, cart.show_id, true)'
    );
    expect(source).toContain(
      'completeEntrySettlementSideEffects(settlement, freshSession, link.show_id, false)'
    );
  });

  it('keeps withdrawal snapshots best-effort and limited to the snapshot column', () => {
    expect(source).toContain('async function stampWithdrawalSnapshot(');
    expect(source).toContain('snapshot stamp failed (non-fatal)');
    expect(source).toContain('snapshot stamp threw (non-fatal)');
    expect(source).toContain('if (!snapshot) return;');
    expect(source).toContain('.update({ withdrawal_policy_snapshot: snapshot })');
  });
});
