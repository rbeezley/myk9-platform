import { describe, expect, it } from 'vitest';
import { resolvePayoutLedgerEmptyState } from './payoutLedgerEmptyState';

describe('resolvePayoutLedgerEmptyState', () => {
  it('returns nothing when the ledger has rows', () => {
    expect(
      resolvePayoutLedgerEmptyState({
        rowCount: 3,
        overviewCollected: { status: 'known', collectedCents: 0 },
      })
    ).toBeNull();
    expect(
      resolvePayoutLedgerEmptyState({
        rowCount: 1,
        overviewCollected: { status: 'unknown' },
      })
    ).toBeNull();
  });

  it('keeps the plain first-payment copy when the overview also collected nothing', () => {
    const state = resolvePayoutLedgerEmptyState({
      rowCount: 0,
      overviewCollected: { status: 'known', collectedCents: 0 },
    });

    expect(state?.variant).toBe('no-payments-yet');
    expect(state?.headline).toBe('No online payments yet.');
    expect(state?.detail).toBe('Club liabilities appear here once exhibitors pay online.');
    expect(state?.guidance).toBeUndefined();
  });

  it('never claims there have been no payments when the overview reports money collected', () => {
    const state = resolvePayoutLedgerEmptyState({
      rowCount: 0,
      overviewCollected: { status: 'known', collectedCents: 49_515 },
    });

    expect(state?.variant).toBe('reconciliation-boundary');
    // The categorical sentence must be gone from every field.
    const text = `${state?.headline} ${state?.detail} ${state?.guidance}`;
    expect(text).not.toMatch(/no online payments/i);
    // It explains the boundary...
    expect(state?.detail).toMatch(/built from online entries/i);
    expect(state?.detail).toMatch(/built from Stripe charges/i);
    expect(state?.detail).toMatch(/can legitimately differ/i);
    // ...points at an existing drill-down...
    expect(state?.guidance).toMatch(/How this is calculated/i);
    // ...and refuses to say the collected total is owed or paid.
    expect(text).not.toMatch(/\bis owed\b|\bowe[sd]? to\b|\bhas been paid\b/i);
  });

  it('uses neutral language while the overview total is unknown', () => {
    const state = resolvePayoutLedgerEmptyState({
      rowCount: 0,
      overviewCollected: { status: 'unknown' },
    });

    expect(state?.variant).toBe('unconfirmed');
    // Neither confident variant: not the categorical denial...
    expect(`${state?.headline} ${state?.detail}`).not.toMatch(/no online payments/i);
    // ...and not an assertion that the two surfaces disagree.
    expect(state?.detail).toMatch(/has not loaded/i);
    expect(state?.detail).toMatch(/cannot say/i);
  });

  it('treats a zero-cent known total as zero, not as unknown', () => {
    // Guards the discriminated state: `{status:'known', collectedCents: 0}` and
    // `{status:'unknown'}` are different facts and must not share copy.
    const zero = resolvePayoutLedgerEmptyState({
      rowCount: 0,
      overviewCollected: { status: 'known', collectedCents: 0 },
    });
    const unknown = resolvePayoutLedgerEmptyState({
      rowCount: 0,
      overviewCollected: { status: 'unknown' },
    });

    expect(zero?.variant).not.toBe(unknown?.variant);
  });
});
