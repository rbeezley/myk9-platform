import { screen, waitFor } from '@testing-library/react';
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

  it('asks for a reason first and saves nothing until one is typed', async () => {
    const { user } = render(
      <PullReconciliationActions entry={makeEntry()} onOpenRefund={vi.fn()} onResolved={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: 'Deny refund' }));

    expect(denyPullRefundDecision).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save denial' })).toBeDisabled();
    await user.type(screen.getByLabelText('Why is there no refund?'), '   ');
    expect(screen.getByRole('button', { name: 'Save denial' })).toBeDisabled();
  });

  it('sends the typed reason with the denial and refreshes the row', async () => {
    const onResolved = vi.fn();
    const { user } = render(
      <PullReconciliationActions
        entry={makeEntry()}
        onOpenRefund={vi.fn()}
        onResolved={onResolved}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Deny refund' }));
    await user.type(
      screen.getByLabelText('Why is there no refund?'),
      'The show was past its refund deadline.'
    );
    await user.click(screen.getByRole('button', { name: 'Save denial' }));

    await waitFor(() =>
      expect(denyPullRefundDecision).toHaveBeenCalledWith(
        'entry-1',
        'The show was past its refund deadline.'
      )
    );
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('closes the reason field on Cancel without saving', async () => {
    const { user } = render(
      <PullReconciliationActions entry={makeEntry()} onOpenRefund={vi.fn()} onResolved={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: 'Deny refund' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Why is there no refund?')).not.toBeInTheDocument();
    expect(denyPullRefundDecision).not.toHaveBeenCalled();
  });
});
