/**
 * MYK9-1407: Comp forgives a fee that is still owed. It is offered only while
 * the entry's effective payment status is pending, on both surfaces that offer
 * it: the inline Comp button on the entry card and the row action menu. A paid
 * or refunded entry is never offered Comp, so collected money cannot be
 * relabelled as forgiven from the UI (the server refuses it as well).
 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EntryListCard } from '../EntryListCard';
import { EntryRowActionMenu } from '../EntryRowActionMenu';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry, EntryClass } from '@/types/entry-management-types';

vi.mock('@/components/common/CheckInStatusIndicator', () => ({
  CheckInStatusIndicator: () => null,
}));
vi.mock('@/components/entries/EmailStatusIcon', () => ({
  EmailStatusIcon: () => null,
}));

const cls: EntryClass = {
  id: 'cls-1',
  name: 'Novice A',
  number: '101',
  fee: 25,
  status: 'entered',
  checkInStatus: 'no-status' as EntryClass['checkInStatus'],
};

function makeEntry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'reg-1',
    entryNumber: '#1',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Bravo',
    ownerName: 'Jane Smith',
    ownerEmail: 'jane@example.com',
    handlerName: 'Jane Smith',
    classes: [cls],
    totalFee: 25,
    paidAmount: 0,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-01-01'),
    lastUpdated: new Date('2026-01-01'),
    ...overrides,
  };
}

function renderCard(entry: EntryManagementEntry) {
  return render(
    <EntryListCard
      entries={[entry]}
      onStatusChange={vi.fn()}
      onCheckInStatusChange={vi.fn()}
      onOpenArmbandDialog={vi.fn()}
      onEntryRemoved={vi.fn()}
      onCompEntry={vi.fn()}
      onUncompEntry={vi.fn()}
    />
  );
}

async function openRowMenu(entry: EntryManagementEntry) {
  const { user } = render(
    <EntryRowActionMenu
      entry={entry}
      onOpenCompDialog={vi.fn()}
      onUncompEntry={vi.fn()}
      onRemoveEntry={vi.fn()}
    />
  );
  await user.click(screen.getByRole('button', { name: /actions for bravo/i }));
  await screen.findByRole('menu');
}

const settled: Array<[string, Partial<EntryManagementEntry>]> = [
  ['paid online', { paymentStatus: PaymentStatus.PAID_ONLINE, paidAmount: 25 }],
  ['paid by check', { paymentStatus: PaymentStatus.PAID_BY_CHECK, paidAmount: 25 }],
  ['paid by cash', { paymentStatus: PaymentStatus.PAID_BY_CASH, paidAmount: 25 }],
  ['refunded', { paymentStatus: PaymentStatus.REFUNDED }],
  ['partially refunded', { paymentStatus: PaymentStatus.PARTIAL_REFUND }],
  // The entry row says paid while its order has not settled: effective pending,
  // but the server refuses a comp on it, so the button would only error.
  [
    'paid under an unsettled order',
    {
      paymentStatus: PaymentStatus.PAID_ONLINE,
      enrollmentPaymentStatus: PaymentStatus.PENDING,
    },
  ],
];

describe('Comp is offered only on unpaid entries (MYK9-1407)', () => {
  it('offers the inline Comp button on a pending entry', () => {
    renderCard(makeEntry());
    expect(screen.getByRole('button', { name: 'Comp entry for Bravo' })).toBeInTheDocument();
  });

  it('offers Comp entry in the row menu on a pending entry', async () => {
    await openRowMenu(makeEntry());
    expect(screen.getByRole('menuitem', { name: /comp entry/i })).toBeInTheDocument();
  });

  it.each(settled)('hides the inline Comp button on an entry %s', (_label, overrides) => {
    renderCard(makeEntry(overrides));
    expect(screen.getByText('Bravo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Comp entry for Bravo' })).not.toBeInTheDocument();
  });

  it.each(settled)(
    'leaves Comp entry out of the row menu on an entry %s',
    async (_l, overrides) => {
      await openRowMenu(makeEntry(overrides));
      // Positive control: the menu rendered its other actions.
      expect(screen.getByRole('menuitem', { name: /remove entry/i })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: /comp entry/i })).not.toBeInTheDocument();
    }
  );

  it('hides Comp on a waived entry that is not comped', () => {
    // An entry-level waive the order never made stands (effective waived).
    renderCard(
      makeEntry({
        paymentStatus: PaymentStatus.WAIVED,
        enrollmentPaymentStatus: PaymentStatus.PENDING,
      })
    );
    expect(screen.queryByRole('button', { name: 'Comp entry for Bravo' })).not.toBeInTheDocument();
  });

  it('still offers Undo on a comped entry card', () => {
    renderCard(makeEntry({ comped: true, paymentStatus: PaymentStatus.WAIVED }));
    expect(screen.getByRole('button', { name: 'Undo comp for Bravo' })).toBeInTheDocument();
  });

  it('still offers Remove comp in the row menu on a comped entry', async () => {
    await openRowMenu(makeEntry({ comped: true, paymentStatus: PaymentStatus.WAIVED }));
    expect(screen.getByRole('menuitem', { name: /remove comp/i })).toBeInTheDocument();
  });
});
