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

    expect(screen.queryByRole('menuitem', { name: /^accept$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /move to waitlist/i })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /check in all classes/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^reject$/i })).toBeInTheDocument();
  });

  it('hides actions when their handlers are not supplied', async () => {
    const { user } = render(
      <EntryRowActionMenu entry={makeEntry()} onStatusChange={vi.fn()} onRemoveEntry={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /actions for bravo/i }));
    await screen.findByRole('menu');

    expect(screen.getByRole('menuitem', { name: /^accept$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /move to waitlist/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /remove entry/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /check in all classes/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /assign armband/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /comp entry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /edit entry/i })).not.toBeInTheDocument();
  });

  it('renders Edit entry and wires its callback', async () => {
    const onOpenEditEntry = vi.fn();
    const entry = makeEntry();
    const { user } = render(<EntryRowActionMenu entry={entry} onOpenEditEntry={onOpenEditEntry} />);

    await user.click(screen.getByRole('button', { name: /actions for bravo/i }));
    await screen.findByRole('menu');
    await user.click(screen.getByRole('menuitem', { name: /edit entry/i }));

    expect(onOpenEditEntry).toHaveBeenCalledWith(entry);
  });

  it('groups mixed row actions by concern', async () => {
    const { user } = render(
      <EntryRowActionMenu
        entry={makeEntry({
          entryStatus: EntryStatus.ACCEPTED,
          paymentStatus: PaymentStatus.PENDING,
        })}
        onStatusChange={vi.fn()}
        onCheckInEntry={vi.fn()}
        onOpenArmbandDialog={vi.fn()}
        onOpenCompDialog={vi.fn()}
        onRemoveEntry={vi.fn()}
        onResendEmail={vi.fn()}
        onOpenRequestPayment={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /actions for bravo/i }));
    await screen.findByRole('menu');

    expect(screen.getByText('Show day')).toBeInTheDocument();
    expect(screen.getByText('Payment')).toBeInTheDocument();
    expect(screen.getByText('Communication')).toBeInTheDocument();
    expect(screen.getByText('Danger')).toBeInTheDocument();
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
        entry={makeEntry({
          paymentMethod: 'online',
          refundedAt: new Date('2026-02-01').toISOString(),
        })}
        onStatusChange={vi.fn()}
        onOpenRefund={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /actions for bravo/i }));
    await screen.findByRole('menu');

    expect(screen.queryByRole('menuitem', { name: /refund payment/i })).not.toBeInTheDocument();
  });

  it('confirms before reverting a completed entry to a pre-scoring status from the row menu', async () => {
    const onStatusChange = vi.fn().mockResolvedValue(true);
    const { user } = render(
      <EntryRowActionMenu
        entry={makeEntry({ entryStatus: EntryStatus.COMPLETED })}
        onStatusChange={onStatusChange}
      />
    );

    await user.click(screen.getByRole('button', { name: /actions for bravo/i }));
    await screen.findByRole('menu');
    await user.click(screen.getByRole('menuitem', { name: /^accept$/i }));

    expect(onStatusChange).not.toHaveBeenCalled();
    expect(screen.getByText('This entry has a recorded result')).toBeInTheDocument();

    // Cancel is a no-op.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(screen.queryByText('This entry has a recorded result')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /actions for bravo/i }));
    await screen.findByRole('menu');
    await user.click(screen.getByRole('menuitem', { name: /^accept$/i }));
    await user.click(screen.getByRole('button', { name: 'Change status' }));

    expect(onStatusChange).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenCalledWith('entry-1', EntryStatus.ACCEPTED);
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
