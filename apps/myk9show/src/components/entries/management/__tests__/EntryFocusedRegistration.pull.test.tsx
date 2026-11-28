import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { groupEntriesByShowRegistration } from '../showRegistrationProjection';
import { EntryFocusedRegistration } from '../EntryFocusedRegistration';
import { EntryPullProvider, ENTRIES_PULL_STARTED_AT } from '../entryPull';

const h = vi.hoisted(() => ({
  scratchShowMapEntry: vi.fn(),
  undoShowMapScratch: vi.fn(),
  showUndoToast: vi.fn(),
}));
vi.mock('@/features/show-map/showMapActionMutations', () => ({
  scratchShowMapEntry: h.scratchShowMapEntry,
  undoShowMapScratch: h.undoShowMapScratch,
}));
vi.mock('@/lib/undoToast', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/undoToast')>()),
  showUndoToast: h.showUndoToast,
}));
vi.mock('@/features/messages/hooks/useCanSendTargetedShowMessages', () => ({
  useCanSendTargetedShowMessages: () => true,
}));

const entry: EntryManagementEntry = {
  id: 'entry-1',
  registrationId: 'registration-1',
  entryNumber: '110',
  armbandNumber: '110',
  showId: 'show-1',
  dogId: 'dog-1',
  dogName: 'Hazel',
  ownerName: 'Jane Smith',
  ownerEmail: 'jane@example.com',
  handlerName: 'Jane Smith',
  classes: [{ id: 'class-1', name: 'Novice A', number: '101', fee: 25, status: 'entered' }],
  totalFee: 25,
  paidAmount: 25,
  entryStatus: EntryStatus.ACCEPTED,
  paymentStatus: PaymentStatus.PAID_ONLINE,
  submittedAt: new Date('2026-01-01'),
  lastUpdated: new Date('2026-01-01'),
};

function renderOpenedEntry(onStatusChange = vi.fn()) {
  const registration = groupEntriesByShowRegistration([entry])[0]!;
  return render(
    <EntryPullProvider entries={[entry]}>
      <EntryFocusedRegistration
        registration={registration}
        onStatusChange={onStatusChange}
        onCheckInStatusChange={vi.fn()}
        onOpenArmbandDialog={vi.fn()}
        onEntryRemoved={vi.fn()}
        onBulkStatusChange={vi.fn()}
        paymentLedger={{ record: vi.fn(), markPaidOnline: vi.fn(), todayInShowZone: '2026-09-17' }}
        showCheckInStatus={false}
      />
    </EntryPullProvider>
  );
}

describe('Pull from an opened entry on Entry Forms (MYK9-2478)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.scratchShowMapEntry.mockResolvedValue({
      entryId: 'entry-1',
      previousEntryStatus: 'accepted',
    });
    h.undoShowMapScratch.mockResolvedValue(undefined);
  });

  it('the per-class status menu opens the Pull dialog and writes nothing', async () => {
    const onStatusChange = vi.fn();
    const { user } = renderOpenedEntry(onStatusChange);

    await user.click(screen.getByRole('button', { name: /change entry status for Hazel/i }));
    await user.click(screen.getByRole('menuitem', { name: /^Pull/ }));

    expect(await screen.findByText('Pull Hazel?')).toBeInTheDocument();
    expect(screen.getByText(/Refunds are not automatic/)).toBeInTheDocument();
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(h.scratchShowMapEntry).not.toHaveBeenCalled();
  });

  it('confirming names the armband, dog and class, and Undo restores the entry', async () => {
    const { user } = renderOpenedEntry();

    await user.click(screen.getByRole('button', { name: /change entry status for Hazel/i }));
    await user.click(screen.getByRole('menuitem', { name: /^Pull/ }));
    await user.click(await screen.findByRole('button', { name: 'Pull' }));

    await waitFor(() => expect(h.showUndoToast).toHaveBeenCalledTimes(1));
    expect(h.scratchShowMapEntry).toHaveBeenCalledWith(
      'entry-1',
      undefined,
      ENTRIES_PULL_STARTED_AT
    );
    expect(h.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: '#110 Hazel pulled from Novice A' })
    );
    h.showUndoToast.mock.calls[0]?.[0].onUndo();
    expect(h.undoShowMapScratch).toHaveBeenCalledWith({
      entryId: 'entry-1',
      previousEntryStatus: 'accepted',
    });
  });
});
