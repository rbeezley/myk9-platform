import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { STATUS_UNDO_WINDOW_MS } from '@/lib/undoToast';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryPullProvider, ENTRIES_PULL_STARTED_AT } from '../entryPull';
import { EntryStatusPopover } from '../EntryStatusPopover';
import { EntryRowActionMenu } from '../EntryRowActionMenu';

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

const undoInput = { entryId: 'entry-1', previousEntryStatus: 'accepted' };

beforeEach(() => {
  vi.clearAllMocks();
  h.scratchShowMapEntry.mockResolvedValue(undoInput);
  h.undoShowMapScratch.mockResolvedValue(undefined);
});

describe("Pull on the Entries page is the desks' Pull (MYK9-1940 phase 3)", () => {
  it('the status chip opens the Pull dialog with its refund note, and writes nothing until confirmed', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(
      <EntryPullProvider entries={[entry]}>
        <EntryStatusPopover
          entry={entry}
          entryClassName="Novice A"
          onStatusChange={onStatusChange}
        />
      </EntryPullProvider>
    );

    await user.click(screen.getByRole('button', { name: /change entry status for Hazel/i }));
    await user.click(screen.getByRole('menuitem', { name: /^Pull/ }));

    expect(await screen.findByText('Pull Hazel?')).toBeInTheDocument();
    expect(screen.getByText(/Refunds are not automatic/)).toBeInTheDocument();
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(h.scratchShowMapEntry).not.toHaveBeenCalled();
    expect(screen.queryByText(/saved on this device/i)).not.toBeInTheDocument();
  });

  it('confirming says "{dog} pulled from {class}" with the shared Undo and its duration', async () => {
    const user = userEvent.setup();
    render(
      <EntryPullProvider entries={[entry]}>
        <EntryStatusPopover entry={entry} entryClassName="Novice A" onStatusChange={vi.fn()} />
      </EntryPullProvider>
    );

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
      expect.objectContaining({
        message: '#110 Hazel pulled from Novice A',
        duration: STATUS_UNDO_WINDOW_MS,
      })
    );
    h.showUndoToast.mock.calls[0]?.[0].onUndo();
    expect(h.undoShowMapScratch).toHaveBeenCalledWith(undoInput);
  });

  it('Pull on a Pending entry opens the Pull dialog (no dead button)', async () => {
    const user = userEvent.setup();
    const pending = { ...entry, entryStatus: EntryStatus.PENDING };
    const onStatusChange = vi.fn();
    render(
      <EntryPullProvider entries={[pending]}>
        <EntryRowActionMenu entry={pending} onStatusChange={onStatusChange} />
      </EntryPullProvider>
    );

    await user.click(screen.getByRole('button', { name: /actions for hazel/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^Pull/ }));

    expect(await screen.findByText('Pull Hazel?')).toBeInTheDocument();
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('the row menu hands Pull to the same dialog', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(
      <EntryPullProvider entries={[entry]}>
        <EntryRowActionMenu entry={entry} onStatusChange={onStatusChange} />
      </EntryPullProvider>
    );

    await user.click(screen.getByRole('button', { name: /actions for hazel/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^Pull/ }));

    expect(await screen.findByText('Pull Hazel?')).toBeInTheDocument();
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('other status changes still go straight to the page handler', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(
      <EntryPullProvider entries={[entry]}>
        <EntryStatusPopover
          entry={entry}
          entryClassName="Novice A"
          onStatusChange={onStatusChange}
        />
      </EntryPullProvider>
    );

    await user.click(screen.getByRole('button', { name: /change entry status for Hazel/i }));
    await user.click(screen.getByRole('menuitem', { name: /^Reject/ }));

    expect(onStatusChange).toHaveBeenCalledWith('entry-1', EntryStatus.REJECTED);
  });
});

describe('Pull is offered only where it works (MYK9-1990)', () => {
  const pullCases: Array<[string, Partial<EntryManagementEntry>, boolean]> = [
    ['accepted', { entryStatus: EntryStatus.ACCEPTED }, true],
    ['pending', { entryStatus: EntryStatus.PENDING }, true],
    ['missing info', { entryStatus: EntryStatus.MISSING_INFO }, true],
    ['accepted but scored', { isScored: true }, false],
    ['completed', { entryStatus: EntryStatus.COMPLETED }, false],
    ['rejected', { entryStatus: EntryStatus.REJECTED }, false],
    ['cancelled', { entryStatus: EntryStatus.CANCELLED }, false],
    ['already pulled', { entryStatus: EntryStatus.SCRATCHED }, false],
    ['moved', { entryStatus: EntryStatus.MOVED }, false],
  ];

  it.each(pullCases)(
    'a %s entry: Pull in the row menu is %s and opens the dialog when shown',
    async (_name, override, shown) => {
      const user = userEvent.setup();
      const target = { ...entry, ...override };
      render(
        <EntryPullProvider entries={[target]}>
          <EntryRowActionMenu entry={target} onStatusChange={vi.fn()} />
        </EntryPullProvider>
      );

      await user.click(screen.getByRole('button', { name: /actions for hazel/i }));
      await screen.findAllByRole('menuitem');
      const item = screen.queryByRole('menuitem', { name: /^Pull/ });
      if (!shown) {
        expect(item).toBeNull();
        return;
      }
      expect(item).not.toBeNull();
      await user.click(item as HTMLElement);
      // A shown Pull must do something: the dialog opens.
      expect(await screen.findByText('Pull Hazel?')).toBeInTheDocument();
    }
  );

  it('a scored entry is not offered Pull on the status chip either', async () => {
    const user = userEvent.setup();
    const scored = { ...entry, isScored: true };
    render(
      <EntryPullProvider entries={[scored]}>
        <EntryStatusPopover entry={scored} entryClassName="Novice A" onStatusChange={vi.fn()} />
      </EntryPullProvider>
    );

    await user.click(screen.getByRole('button', { name: /change entry status for Hazel/i }));
    await screen.findAllByRole('menuitem');
    expect(screen.queryByRole('menuitem', { name: /^Pull/ })).toBeNull();
  });
});
