import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { DogBulkStatusMenu } from '../DogBulkStatusMenu';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';

const { invoke, toastSuccess, toastError } = vi.hoisted(() => ({
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
vi.mock('@/features/payments/useWithdrawalRefundPreview', () => ({
  useWithdrawalRefundPreviews: (requests: readonly unknown[]) =>
    requests.map(() => ({
      data: {
        refundCents: 2500,
        retainedCents: 500,
        requiresManual: false,
        reason: 'after_cutoff',
      },
      isError: false,
      isFetching: false,
      isPaused: false,
      refetch: vi.fn(),
    })),
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

function entry(
  id: string,
  trialNumber: string,
  overrides: Partial<EntryManagementEntry> = {}
): EntryManagementEntry {
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
    ...overrides,
  } as unknown as EntryManagementEntry;
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /actions for rex, all entries/i }));
}

describe('DogBulkStatusMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pulls every eligible entry with the per-entry scratched status and states the Pull help', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn().mockResolvedValue(true);
    render(
      <DogBulkStatusMenu
        dogName="Rex"
        entries={[entry('e1', '1'), entry('e2', '2'), entry('e3', '3')]}
        onStatusChange={onStatusChange}
      />
    );
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /pull rex from all entries/i }));
    expect(
      screen.getByText('Not competing, for any reason. No refund promise; the club decides.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pull Rex' }));
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledTimes(3));
    for (const id of ['e1', 'e2', 'e3']) {
      expect(onStatusChange).toHaveBeenCalledWith(id, EntryStatus.SCRATCHED);
    }
    expect(toastSuccess).toHaveBeenCalledWith('Pulled Rex: 3 of 3 entries');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('withdraws every eligible entry with CANCELLED and the reason, showing suggested refunds only', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn().mockResolvedValue(true);
    render(
      <DogBulkStatusMenu
        dogName="Rex"
        entries={[entry('e1', '1'), entry('e2', '2')]}
        onStatusChange={onStatusChange}
      />
    );
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /withdraw rex/i }));
    expect(screen.getAllByText('Suggested refund $25.00')).toHaveLength(2);
    expect(screen.getByText(/refunds are approved per entry afterwards/i)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('reason-select'), { target: { value: 'Judge Change' } });
    await user.click(screen.getByRole('button', { name: 'Withdraw Rex' }));
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledTimes(2));
    expect(onStatusChange).toHaveBeenCalledWith('e1', EntryStatus.CANCELLED, 'Judge Change');
    expect(onStatusChange).toHaveBeenCalledWith('e2', EntryStatus.CANCELLED, 'Judge Change');
    // Money stays with a person: no refund function, no refund dialog.
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.queryByText(/refund payment/i)).not.toBeInTheDocument();
  });

  it('names an already-run entry in the confirm and leaves it out of the writes', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn().mockResolvedValue(true);
    render(
      <DogBulkStatusMenu
        dogName="Rex"
        entries={[
          entry('e1', '1'),
          entry('e2', '2', { entryStatus: EntryStatus.COMPLETED, isScored: true }),
        ]}
        onStatusChange={onStatusChange}
      />
    );
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /pull rex from all entries/i }));
    expect(screen.getByText(/Left as they are/)).toBeInTheDocument();
    expect(screen.getByText(/Trial 2 · Novice Interior \(already run\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pull Rex' }));
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledTimes(1));
    expect(onStatusChange).toHaveBeenCalledWith('e1', EntryStatus.SCRATCHED);
  });

  it('disables both items with the reason when no entry is eligible', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(
      <DogBulkStatusMenu
        dogName="Rex"
        entries={[entry('e1', '1', { entryStatus: EntryStatus.COMPLETED, isScored: true })]}
        onStatusChange={onStatusChange}
      />
    );
    await openMenu(user);
    const pullItem = await screen.findByRole('menuitem', { name: /pull rex from all entries/i });
    expect(pullItem).toHaveAttribute('aria-disabled', 'true');
    expect(pullItem).toHaveTextContent(/already run, moved or finished/);
    expect(screen.getByRole('menuitem', { name: /withdraw rex/i })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('reports a partial failure and leaves the failed entry as it was', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn(async (id: string) => id !== 'e2');
    render(
      <DogBulkStatusMenu
        dogName="Rex"
        entries={[entry('e1', '1'), entry('e2', '2'), entry('e3', '3')]}
        onStatusChange={onStatusChange}
      />
    );
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /pull rex from all entries/i }));
    await user.click(screen.getByRole('button', { name: 'Pull Rex' }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0]?.[0]).toBe('Pulled 2 of 3 entries for Rex');
    expect(toastError.mock.calls[0]?.[1].description).toContain('Trial 2 · Novice Interior');
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
