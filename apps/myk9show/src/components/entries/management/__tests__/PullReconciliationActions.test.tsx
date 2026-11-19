import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { PullReconciliationActions } from '../PullReconciliationActions';

const denyPullRefundDecision = vi.fn().mockResolvedValue(undefined);
vi.mock('@/features/payments/denyPullRefundDecision', () => ({
  denyPullRefundDecision: (...args: unknown[]) => denyPullRefundDecision(...args),
}));

function makeEntry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: '',
    entryNumber: '#1',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Bravo',
    ownerName: 'Jane Smith',
    ownerEmail: 'jane@example.com',
    handlerName: 'Jane Smith',
    classes: [],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.SCRATCHED,
    rawEntryStatus: 'scratched',
    paymentStatus: PaymentStatus.PAID_ONLINE,
    paymentMethod: 'online',
    submittedAt: new Date('2026-01-01'),
    lastUpdated: new Date('2026-01-02'),
    pullTiming: 'before_close',
    refundDecision: null,
    ...overrides,
  };
}

describe('PullReconciliationActions', () => {
  beforeEach(() => {
    denyPullRefundDecision.mockReset().mockResolvedValue(undefined);
  });

  it('suggests refund before close and denial after close', () => {
    const { rerender } = render(
      <PullReconciliationActions entry={makeEntry()} onOpenRefund={vi.fn()} onResolved={vi.fn()} />
    );

    expect(screen.getByRole('button', { name: 'Issue refund' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Deny refund' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );

    rerender(
      <PullReconciliationActions
        entry={makeEntry({ pullTiming: 'after_close' })}
        onOpenRefund={vi.fn()}
        onResolved={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Issue refund' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Deny refund' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('leaves both choices unselected when timing is unknown', () => {
    render(
      <PullReconciliationActions
        entry={makeEntry({ pullTiming: null })}
        onOpenRefund={vi.fn()}
        onResolved={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Issue refund' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Deny refund' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('asks for a reason, saves the denial with it, and refreshes the row', async () => {
    const onResolved = vi.fn();
    const { user } = render(
      <PullReconciliationActions
        entry={makeEntry()}
        onOpenRefund={vi.fn()}
        onResolved={onResolved}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Deny refund' }));
    // The decision is not saved until a reason is given.
    expect(denyPullRefundDecision).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Deny refund' });
    expect(submit).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Reason'), '  Pulled after the closing date  ');
    await user.click(submit);

    await waitFor(() =>
      expect(denyPullRefundDecision).toHaveBeenCalledWith(
        'entry-1',
        'Pulled after the closing date'
      )
    );
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('refuses a reason of only spaces', async () => {
    const { user } = render(
      <PullReconciliationActions entry={makeEntry()} onOpenRefund={vi.fn()} onResolved={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: 'Deny refund' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Reason'), '    ');

    expect(within(dialog).getByRole('button', { name: 'Deny refund' })).toBeDisabled();
    expect(denyPullRefundDecision).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and says so when the save fails, so the reason is not lost', async () => {
    denyPullRefundDecision.mockRejectedValueOnce(new Error('network'));
    const onResolved = vi.fn();
    const { user } = render(
      <PullReconciliationActions
        entry={makeEntry()}
        onOpenRefund={vi.fn()}
        onResolved={onResolved}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Deny refund' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Reason'), 'Late');
    await user.click(within(dialog).getByRole('button', { name: 'Deny refund' }));

    await waitFor(() => expect(denyPullRefundDecision).toHaveBeenCalled());
    expect(onResolved).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByLabelText('Reason')).toHaveValue('Late');
  });
});
