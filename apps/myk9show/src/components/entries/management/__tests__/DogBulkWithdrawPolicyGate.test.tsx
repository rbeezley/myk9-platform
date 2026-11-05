import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import { render } from '@/test/utils/testUtils';
import { mockSupabase } from '@/test/mocks/supabase';
import { DogBulkStatusMenu } from '../DogBulkStatusMenu';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';

/**
 * MYK9-1615: the dog-level Withdraw confirm must not submit while a paid entry's refund-policy
 * read has failed or is still loading. The real preview hook runs here; only the policy read
 * (`entries.select(...).single()`) is synthetic, and no refund function is ever invoked.
 */
const { single, invoke, toastSuccess, toastError } = vi.hoisted(() => ({
  single: vi.fn(),
  invoke: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/supabase', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/supabase')>();
  actual.supabase.functions.invoke = invoke;
  return actual;
});
vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError, info: vi.fn() },
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode;
    onValueChange?: (v: string) => void;
  }) => (
    <select data-testid="reason-select" onChange={e => onValueChange?.(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => <option value="" />,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

const POLICY_ROW = {
  data: {
    withdrawal_policy_snapshot: {
      cutoffDate: '2000-01-01',
      retentionType: 'flat',
      retentionValue: 500,
      retentionDeclared: true,
      notes: null,
    },
    trials: { timezone: 'America/New_York' },
  },
  error: null,
};
const POLICY_READ_FAILED = { data: null, error: { message: 'network down', code: 'PGRST000' } };

/** A synthetic paid-online entry: the only kind whose refund the preview reads. */
function paidEntry(id: string, trialNumber: string): EntryManagementEntry {
  return {
    id,
    registrationId: 'reg-1',
    entryNumber: id,
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Rex',
    ownerName: 'Jane',
    handlerName: 'Casey',
    classes: [
      {
        id: `c-${id}`,
        name: 'Novice Interior',
        number: '1',
        fee: 30,
        trialNumber,
        status: 'entered',
      },
    ],
    totalFee: 30,
    paidAmount: 30,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    paymentMethod: 'online',
  } as unknown as EntryManagementEntry;
}

async function openWithdraw(onStatusChange = vi.fn().mockResolvedValue(true)) {
  const user = userEvent.setup();
  render(
    <DogBulkStatusMenu
      dogName="Rex"
      entries={[paidEntry('e1', '1'), paidEntry('e2', '2')]}
      onStatusChange={onStatusChange}
    />
  );
  await user.click(screen.getByRole('button', { name: /actions for rex, all entries/i }));
  await user.click(await screen.findByRole('menuitem', { name: /withdraw rex/i }));
  fireEvent.change(screen.getByTestId('reason-select'), { target: { value: 'In-Season Dog' } });
  return { user, onStatusChange };
}

describe('Dog-level Withdraw: refund-policy gate (MYK9-1615)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Drop any queued once-values so a shuffled order cannot hand one test another's reads.
    single.mockReset();
    mockSupabase.from.mockImplementation(() => ({
      select: () => ({ eq: () => ({ single }) }),
    }));
  });

  it('keeps Withdraw disabled while the policy is still being checked', async () => {
    single.mockReturnValue(new Promise(() => {}));
    await openWithdraw();

    expect(screen.getAllByText('Checking policy…')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Withdraw Rex' })).toBeDisabled();
  });

  it('shows a failed policy read, blocks Withdraw, and recovers on retry', async () => {
    // Both entries' first reads fail; every read after that succeeds.
    single.mockResolvedValue(POLICY_ROW);
    single.mockResolvedValueOnce(POLICY_READ_FAILED).mockResolvedValueOnce(POLICY_READ_FAILED);
    const { user, onStatusChange } = await openWithdraw();

    expect(await screen.findAllByText("Couldn't check the refund policy")).toHaveLength(2);
    expect(screen.queryByText('Checking policy…')).not.toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Withdraw Rex' });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(onStatusChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findAllByText('Suggested refund $25.00')).toHaveLength(2);
    expect(screen.queryByText("Couldn't check the refund policy")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Withdraw Rex' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Withdraw Rex' }));
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledTimes(2));
    expect(onStatusChange).toHaveBeenCalledWith('e1', EntryStatus.CANCELLED, 'In-Season Dog');
    expect(onStatusChange).toHaveBeenCalledWith('e2', EntryStatus.CANCELLED, 'In-Season Dog');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('offers the approval fallback offline, where the policy read pauses instead of failing', async () => {
    single.mockResolvedValue(POLICY_ROW);
    onlineManager.setOnline(false);
    try {
      const { user, onStatusChange } = await openWithdraw();

      expect(await screen.findAllByText("Couldn't check the refund policy")).toHaveLength(2);
      expect(screen.queryByText('Checking policy…')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Withdraw Rex' })).toBeDisabled();

      await user.click(screen.getByRole('button', { name: 'Set refunds when approving' }));
      await user.click(screen.getByRole('button', { name: 'Withdraw Rex' }));
      await waitFor(() => expect(onStatusChange).toHaveBeenCalledTimes(2));
      expect(onStatusChange).toHaveBeenCalledWith('e1', EntryStatus.CANCELLED, 'In-Season Dog');
      expect(single).not.toHaveBeenCalled();
      expect(invoke).not.toHaveBeenCalled();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('keeps the recovery buttons at the 44px touch floor', async () => {
    single.mockResolvedValue(POLICY_READ_FAILED);
    await openWithdraw();
    await screen.findAllByText("Couldn't check the refund policy");
    for (const name of ['Try again', 'Set refunds when approving']) {
      expect(screen.getByRole('button', { name })).toHaveClass('min-h-11');
    }
  });

  it('lets the secretary withdraw with the refund left to approval, as an explicit choice', async () => {
    single.mockResolvedValue(POLICY_READ_FAILED);
    const { user, onStatusChange } = await openWithdraw();

    await screen.findAllByText("Couldn't check the refund policy");
    expect(screen.getByRole('button', { name: 'Withdraw Rex' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Set refunds when approving' }));

    expect(screen.getAllByText(/Refund set when you approve it \(up to \$30\.00\)/)).toHaveLength(
      2
    );
    await user.click(screen.getByRole('button', { name: 'Withdraw Rex' }));
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledTimes(2));
    expect(onStatusChange).toHaveBeenCalledWith('e1', EntryStatus.CANCELLED, 'In-Season Dog');
    // Money stays with a person: no refund function runs.
    expect(invoke).not.toHaveBeenCalled();
  });
});
