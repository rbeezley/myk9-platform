import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { useCommandMenuContextStore } from './commandMenuContextStore';
import { useRegisterEntryManagementCommandContext } from './useRegisterEntryManagementCommandContext';

const acceptedEntry: EntryManagementEntry = {
  id: 'entry-1',
  registrationId: 'registration-1',
  entryNumber: '101',
  showId: 'show-1',
  dogId: 'dog-1',
  dogName: 'Willow',
  ownerName: 'Owner',
  ownerEmail: 'owner@example.com',
  handlerName: 'Handler',
  classes: [{ id: 'class-1', name: 'Novice A', number: '1', fee: 25, status: 'entered' }],
  totalFee: 25,
  paidAmount: 25,
  entryStatus: EntryStatus.ACCEPTED,
  paymentStatus: PaymentStatus.PAID_ONLINE,
  submittedAt: new Date('2026-07-18T12:00:00Z'),
  lastUpdated: new Date('2026-07-18T12:00:00Z'),
};

describe('useRegisterEntryManagementCommandContext', () => {
  beforeEach(() => {
    useCommandMenuContextStore.setState({ context: null, token: 0 });
  });

  it('passes the owner clear callback to command-palette check-in', async () => {
    const clearSelection = vi.fn();
    const runBulkCheckIn = vi.fn(async (_entryIds: string[], onFullSuccess?: () => void) => {
      onFullSuccess?.();
      return true;
    });

    renderHook(() =>
      useRegisterEntryManagementCommandContext({
        showId: 'show-1',
        trialId: 'trial-1',
        selectedEntries: [acceptedEntry],
        runBulkCheckIn,
        clearSelection,
        busy: false,
      })
    );

    await waitFor(() => {
      expect(useCommandMenuContextStore.getState().context?.eligibleCheckInIds).toEqual([
        'entry-1',
      ]);
    });

    await act(async () => {
      await useCommandMenuContextStore.getState().context?.runBulkCheckIn(['entry-1']);
    });

    expect(runBulkCheckIn).toHaveBeenCalledWith(['entry-1'], clearSelection);
    expect(clearSelection).toHaveBeenCalledOnce();
  });
});
