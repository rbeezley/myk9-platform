/**
 * MYK9-639 round 3: resolving the money root ONCE, at the mapper, is what stops
 * every per-entry predicate having to remember move-ups exist.
 *
 * Round 2 resolved it inside each AGGREGATION, which left the badges and the
 * gates reading the raw row — and a move-up destination is money-neutral by
 * construction. So the secretary was told a paid exhibitor owed money, on a card
 * whose own total said paid in full, and the refund they were owed had no
 * reachable control. These are the four consumers named in that review.
 */
import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { withEntryManagementMoneyRoots } from './entryManagementMoneyRoots';
import { classifyEntryAttention } from '@/features/entry-operations/attentionClassification';
import { isStripeRefundable } from '@/components/entries/management/refundEligibility';
import { isPaymentRequestable } from '@/components/entries/management/paymentRequestEligibility';
import { getEntryManagementCountSummary } from '@/utils/entryCountSelectors';
import { groupEntriesByEnrollment } from '@/utils/enrollmentGrouping';
import type { EntryManagementEntry } from '@/types/entry-management-types';

function entry(overrides: Partial<EntryManagementEntry>): EntryManagementEntry {
  return {
    id: 'entry',
    registrationId: 'reg-1',
    entryNumber: '100',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Acorn',
    ownerName: 'Owner',
    ownerEmail: 'owner@example.com',
    handlerName: 'Handler',
    classes: [],
    totalFee: 0,
    paidAmount: 0,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-09-01T00:00:00Z'),
    lastUpdated: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

/** The finding's own pair, paid ONLINE so the refund gate is in play. */
const PAIR: EntryManagementEntry[] = [
  entry({
    id: 'source-moved',
    entryStatus: EntryStatus.MOVED,
    totalFee: 35,
    paidAmount: 35,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    rawPaymentStatus: 'paid',
    paymentMethod: 'online',
    stripePaymentIntentId: 'pi_1',
  }),
  entry({
    id: 'destination',
    entryStatus: EntryStatus.ACCEPTED,
    movedFromEntryId: 'source-moved',
  }),
];

function rootedDestination(entries = PAIR): EntryManagementEntry {
  const rooted = withEntryManagementMoneyRoots(entries);
  const destination = rooted.find(item => item.id === 'destination');
  if (!destination) throw new Error('fixture lost the destination');
  return destination;
}

describe('withEntryManagementMoneyRoots', () => {
  it('stamps the row with where its money came from', () => {
    const destination = rootedDestination();

    expect(destination.moneyRootEntryId).toBe('source-moved');
    expect(destination.moneyRootUnresolved).toBe(false);
    expect(destination.totalFee).toBe(35);
    expect(destination.paidAmount).toBe(35);
  });

  it('keeps everything that makes the row THIS run', () => {
    const destination = rootedDestination();

    // The id is the run's, not the root's — a refund must target
    // `moneyRootEntryId`, and everything else must still address this row.
    expect(destination.id).toBe('destination');
    expect(destination.entryStatus).toBe(EntryStatus.ACCEPTED);
    expect(destination.movedFromEntryId).toBe('source-moved');
  });

  it('leaves an entry that was never moved exactly as it was', () => {
    const plain = entry({ id: 'plain', totalFee: 35, paidAmount: 35 });
    const [rooted] = withEntryManagementMoneyRoots([plain]);

    expect(rooted?.moneyRootEntryId).toBe('plain');
    expect(rooted?.moneyRootUnresolved).toBe(false);
    expect(rooted?.totalFee).toBe(35);
  });

  it('FLAGS a root outside the loaded scope instead of reporting $0', () => {
    const [rooted] = withEntryManagementMoneyRoots([
      entry({ id: 'destination', movedFromEntryId: 'somewhere-else' }),
    ]);

    expect(rooted?.moneyRootUnresolved).toBe(true);
    expect(rooted?.moneyRootEntryId).toBe('destination');
  });

  describe('the four consumers that used to read the raw row', () => {
    it('does not tell the secretary a paid exhibitor owes money', () => {
      // Before: `accepted` + effective payment `pending` => ['payment_due'],
      // rendered in text-destructive on a card whose totals said $35 of $35 paid.
      expect(
        classifyEntryAttention({
          entryStatus: rootedDestination().entryStatus,
          paymentStatus: rootedDestination().paymentStatus,
        })
      ).toEqual([]);
    });

    it('offers the refund the exhibitor is owed', () => {
      // Before: the gate read the money-neutral row, so the menu item was never
      // rendered — and the superseded source it WOULD have been offered on is
      // excluded from the list. Net: no refund path at all.
      expect(isStripeRefundable(rootedDestination())).toBe(true);
      // ...and it must be ISSUED against the row that holds the Stripe intent.
      expect(rootedDestination().moneyRootEntryId).toBe('source-moved');
    });

    it('does not offer "Request payment" on a settled entry', () => {
      expect(isPaymentRequestable(rootedDestination())).toBe(false);
    });

    it('agrees with the enrollment card and the stat chips', () => {
      const rooted = withEntryManagementMoneyRoots(PAIR);
      const { stats, tabCounts } = getEntryManagementCountSummary(rooted);
      const groups = groupEntriesByEnrollment(rooted);

      expect(stats.total).toBe(1);
      expect(tabCounts.all).toBe(1);
      expect(stats.revenue).toBe(35);
      expect(stats.outstanding).toBe(0);
      expect(tabCounts.issues).toBe(0);
      expect(groups).toHaveLength(1);
      expect(groups[0]?.entries.map(item => item.id)).toEqual(['destination']);
    });
  });
});
