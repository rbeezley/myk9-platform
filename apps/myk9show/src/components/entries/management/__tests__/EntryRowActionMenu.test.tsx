import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry, EntryClass } from '@/types/entry-management-types';
import { EntryRowActionMenu } from '../EntryRowActionMenu';

const entryClass: EntryClass = {
  id: 'class-1',
  name: 'Novice A',
  number: '101',
  fee: 25,
  status: 'entered',
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
    classes: [entryClass],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-01-01'),
    lastUpdated: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('EntryRowActionMenu', () => {
  it('hides same-value and unavailable status actions', async () => {
    const { user } = render(
      <EntryRowActionMenu
        entry={makeEntry({ entryStatus: EntryStatus.ACCEPTED })}
        onStatusChange={vi.fn()}
        onCheckInEntry={vi.fn()}
        onOpenArmbandDialog={vi.fn()}
        onOpenCompDialog={vi.fn()}
        onUncompEntry={vi.fn()}
        onRemoveEntry={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /actions for bravo/i }));
    await screen.findByRole('menu');

    expect(screen.queryByRole('menuitem', { name: /accept entry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /move to waitlist/i })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /check in all classes/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /reject entry/i })).toBeInTheDocument();
  });

  it('hides actions when their handlers are not supplied', async () => {
    const { user } = render(
      <EntryRowActionMenu entry={makeEntry()} onStatusChange={vi.fn()} onRemoveEntry={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /actions for bravo/i }));
    await screen.findByRole('menu');

    expect(screen.getByRole('menuitem', { name: /accept entry/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /move to waitlist/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /remove entry/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /check in all classes/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /assign armband/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /comp entry/i })).not.toBeInTheDocument();
  });

  it('shows the Refund action for a stripe-refundable entry when onOpenRefund is supplied', async () => {
    const onOpenRefund = vi.fn();
    const refundable = makeEntry({
      paymentMethod: 'online',
      paymentStatus: PaymentStatus.PAID_ONLINE,
    });
    const { user } = render(
      <EntryRowActionMenu entry={refundable} onStatusChange={vi.fn()} onOpenRefund={onOpenRefund} />
    );

    await user.click(screen.getByRole('button', { name: /actions for bravo/i }));
    await screen.findByRole('menu');

    const refundItem = screen.getByRole('menuitem', { name: /refund payment/i });
    expect(refundItem).toBeInTheDocument();

    await user.click(refundItem);
    expect(onOpenRefund).toHaveBeenCalledWith(refundable);
  });

  it('hides the Refund action when the entry is not stripe-refundable', async () => {
    const { user } = render(
      <EntryRowActionMenu
        entry={makeEntry({ paymentMethod: 'online', refundedAt: new Date('2026-02-01') })}
        onStatusChange={vi.fn()}
        onOpenRefund={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /actions for bravo/i }));
    await screen.findByRole('menu');

    expect(screen.queryByRole('menuitem', { name: /refund payment/i })).not.toBeInTheDocument();
  });

  it('hides the Refund action when onOpenRefund is not supplied', async () => {
    const { user } = render(
      <EntryRowActionMenu
        entry={makeEntry({ paymentMethod: 'online', paymentStatus: PaymentStatus.PAID_ONLINE })}
        onStatusChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /actions for bravo/i }));
    await screen.findByRole('menu');

    expect(screen.queryByRole('menuitem', { name: /refund payment/i })).not.toBeInTheDocument();
  });
});
