import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { PullReconciliationActions } from '../PullReconciliationActions';

const denyPullRefundDecision = vi.fn().mockResolvedValue(undefined);
vi.mock('@/features/payments/denyPullRefundDecision', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/payments/denyPullRefundDecision')>()),
  denyPullRefundDecision: (...args: unknown[]) => denyPullRefundDecision(...args),
}));

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: toastError },
}));

const refreshApp = vi.hoisted(() => vi.fn());
vi.mock('@/services/pwa/refreshApp', () => ({ refreshApp }));

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
    toastError.mockReset();
    refreshApp.mockReset();
  });

  async function saveDenial() {
    const onResolved = vi.fn();
    const { user } = render(
      <PullReconciliationActions
        entry={makeEntry()}
        onOpenRefund={vi.fn()}
        onResolved={onResolved}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Deny refund' }));
    await user.type(screen.getByLabelText('Why is there no refund?'), 'Past the deadline.');
    await user.click(screen.getByRole('button', { name: 'Save denial' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    return onResolved;
  }

  // MYK9-2293: the server no longer has the signature this tab was built against. The secretary is
  // told to restart, and offered it, instead of a "try again" that would fail the same way.
  it('asks for a restart when the refund decision function this tab calls is gone', async () => {
    denyPullRefundDecision.mockRejectedValue({
      code: 'PGRST202',
      message:
        // The shape PostgREST returns for any signature the schema no longer has.
        'Could not find the function public.set_entry_refund_decision(p_decision, p_entry_id) in the schema cache',
    });

    const onResolved = await saveDenial();

    expect(toastError).toHaveBeenCalledWith(
      'This refund decision could not be saved because myK9Show was updated. Restart the app, then deny the refund again.',
      { action: { label: 'Restart the app', onClick: expect.any(Function) } }
    );
    expect(onResolved).not.toHaveBeenCalled();
    const [, options] = toastError.mock.calls[0] as [string, { action: { onClick: () => void } }];
    options.action.onClick();
    expect(refreshApp).toHaveBeenCalledTimes(1);
  });

  it('keeps the plain retry message for any other failure', async () => {
    denyPullRefundDecision.mockRejectedValue({ code: '42501', message: 'not authorized' });

    await saveDenial();

    expect(toastError).toHaveBeenCalledWith("We couldn't save that refund decision. Try again.");
    expect(refreshApp).not.toHaveBeenCalled();
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

  it('shows a saved denial read-only instead of offering to save another reason', () => {
    render(
      <PullReconciliationActions
        entry={makeEntry({ refundDecision: 'denied' })}
        onOpenRefund={vi.fn()}
        onResolved={vi.fn()}
      />
    );

    expect(screen.getByText('Refund denied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deny refund' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save denial' })).not.toBeInTheDocument();
  });
});
