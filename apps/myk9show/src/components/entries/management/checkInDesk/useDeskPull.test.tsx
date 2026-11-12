import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { toast } from 'sonner';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { CheckInDesk } from './CheckInDesk';
import { resetReplica, writeReplicaRow } from './storedRowsReplica';
import { StoredRowsDesk } from './storedRowsTestUtils';

const h = vi.hoisted(() => ({
  updateReplicatedCheckInStatus: vi.fn(),
  scratchShowMapEntry: vi.fn(),
  undoShowMapScratch: vi.fn(),
  showUndoToast: vi.fn(),
  changeSecretaryEntryStatus: vi.fn(),
  getEntryStatusHistory: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', async () => ({
  replicatedEntriesTable: (await import('./storedRowsReplica')).replicaEntriesTable,
}));
vi.mock('@/services/replication/ReplicatedClassesTable', async () => ({
  replicatedClassesTable: (await import('./storedRowsReplica')).replicaClassesTable,
}));
vi.mock('@/services/database/entries/lifecycle', () => ({
  changeSecretaryEntryStatus: h.changeSecretaryEntryStatus,
}));
vi.mock('@/services/database/entries/statusHistory', () => ({
  getEntryStatusHistory: h.getEntryStatusHistory,
}));

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: h.updateReplicatedCheckInStatus,
}));
vi.mock('@/features/show-map/showMapActionMutations', () => ({
  scratchShowMapEntry: h.scratchShowMapEntry,
  undoShowMapScratch: h.undoShowMapScratch,
}));
vi.mock('@/lib/undoToast', () => ({ showUndoToast: h.showUndoToast }));
vi.mock('@/pages/secretary/useShowDeskScheduleRead', () => ({
  useShowDeskScheduleRead: () => ({
    readPending: false,
    readFailed: false,
    retry: vi.fn(),
    trials: [
      {
        id: 'trial-1',
        showId: 'show-1',
        name: 'Trial 1',
        trialNumber: '1',
        trialDate: '2026-07-08',
        timezone: 'America/New_York',
      },
    ],
    trialClasses: {
      'trial-1': [
        { id: 'class-1', element: 'Container', level: 'Novice', section: 'A', startTime: '09:00' },
      ],
    },
  }),
}));

const NOW = new Date('2026-07-08T16:00:00.000Z');

const poppy: EntryManagementEntry = {
  id: 'entry-1',
  registrationId: 'reg-1',
  entryNumber: '114',
  showId: 'show-1',
  dogId: 'dog-1',
  dogName: 'Poppy',
  ownerName: 'Alice Martin',
  ownerEmail: 'alice@example.com',
  handlerName: 'Alice Martin',
  handlerId: 'person-1',
  ownerId: 'person-1',
  classes: [
    {
      id: 'entry-1',
      classId: 'class-1',
      name: 'Container Novice A',
      number: '1',
      fee: 25,
      status: 'entered',
      checkInStatus: 'checked-in',
    },
  ],
  totalFee: 25,
  paidAmount: 25,
  entryStatus: EntryStatus.ACCEPTED,
  paymentStatus: PaymentStatus.PAID_ONLINE,
  submittedAt: NOW,
  lastUpdated: NOW,
  armbandNumber: '114',
};

async function choosePulled(user: ReturnType<typeof render>['user']) {
  await user.click(screen.getByRole('button', { name: /^Change status for Poppy/ }));
  const picker = await screen.findByRole('dialog');
  await user.click(within(picker).getByRole('button', { name: /^Pulled/ }));
}

describe('Pulled on the Check-in desk is the real Pull (MYK9-1749)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.scratchShowMapEntry.mockResolvedValue({
      entryId: 'entry-1',
      previousEntryStatus: 'accepted',
    });
    h.undoShowMapScratch.mockResolvedValue(undefined);
  });

  it('asks first, then pulls through the shared Pull and offers Undo', async () => {
    const onRefreshEntries = vi.fn().mockResolvedValue(undefined);
    const { user } = render(
      <CheckInDesk
        showId="show-1"
        entries={[poppy]}
        loading={false}
        unknown={false}
        onRetry={vi.fn()}
        onRefreshEntries={onRefreshEntries}
        currentDate={NOW}
      />
    );
    await choosePulled(user);

    const confirm = await screen.findByRole('dialog', { name: 'Pull Poppy?' });
    expect(confirm).toHaveTextContent('Refunds are not automatic');
    // Nothing is written until the secretary confirms; the check-in path is never used for it.
    expect(h.scratchShowMapEntry).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Pull' }));

    await waitFor(() =>
      expect(h.scratchShowMapEntry).toHaveBeenCalledWith(
        'entry-1',
        undefined,
        'Pulled at the check-in desk'
      )
    );
    expect(h.updateReplicatedCheckInStatus).not.toHaveBeenCalled();
    await waitFor(() => expect(h.showUndoToast).toHaveBeenCalledTimes(1));
    expect(onRefreshEntries).toHaveBeenCalled();

    h.showUndoToast.mock.calls[0]![0].onUndo();
    await waitFor(() =>
      expect(h.undoShowMapScratch).toHaveBeenCalledWith({
        entryId: 'entry-1',
        previousEntryStatus: 'accepted',
      })
    );
  });

  describe('a Pull never waits for the entries re-read (MYK9-1812)', () => {
    const toastInfo = vi.spyOn(toast, 'info');
    const toastError = vi.spyOn(toast, 'error');
    beforeEach(() => {
      toastInfo.mockClear();
      toastError.mockClear();
    });
    const stalled = () => vi.fn(() => new Promise<void>(() => {}));
    const pip: EntryManagementEntry = {
      ...poppy,
      id: 'entry-2',
      dogId: 'dog-2',
      dogName: 'Pip',
      armbandNumber: '115',
      classes: [{ ...poppy.classes[0]!, id: 'entry-2' }],
    };
    const renderDesk = (onRefreshEntries: () => Promise<void>) =>
      render(
        <CheckInDesk
          showId="show-1"
          entries={[poppy, pip]}
          loading={false}
          unknown={false}
          onRetry={vi.fn()}
          onRefreshEntries={onRefreshEntries}
          currentDate={NOW}
        />
      );
    const pullDog = async (user: ReturnType<typeof render>['user'], dog: string) => {
      await user.click(
        screen.getByRole('button', { name: new RegExp(`^Change status for ${dog}`) })
      );
      const picker = await screen.findByRole('dialog');
      await user.click(within(picker).getByRole('button', { name: /^Pulled/ }));
      const confirm = await screen.findByRole('dialog', { name: `Pull ${dog}?` });
      await user.click(within(confirm).getByRole('button', { name: 'Pull' }));
    };

    it('offers Undo and runs it while the re-read is stalled', async () => {
      const { user } = renderDesk(stalled());
      await pullDog(user, 'Poppy');
      await waitFor(() => expect(h.showUndoToast).toHaveBeenCalledTimes(1));

      h.showUndoToast.mock.calls[0]![0].onUndo();
      await waitFor(() =>
        expect(h.undoShowMapScratch).toHaveBeenCalledWith({
          entryId: 'entry-1',
          previousEntryStatus: 'accepted',
        })
      );
    });

    it('lets another dog be pulled while the first re-read is stalled', async () => {
      const { user } = renderDesk(stalled());
      await pullDog(user, 'Poppy');
      await waitFor(() => expect(h.showUndoToast).toHaveBeenCalledTimes(1));

      await pullDog(user, 'Pip');
      await waitFor(() => expect(h.scratchShowMapEntry).toHaveBeenCalledTimes(2));
      expect(h.scratchShowMapEntry).toHaveBeenLastCalledWith(
        'entry-2',
        undefined,
        'Pulled at the check-in desk'
      );
      await waitFor(() => expect(h.showUndoToast).toHaveBeenCalledTimes(2));
    });

    it('does not offer an Undo that restores the pulled state when the same dog is pulled twice', async () => {
      const { user } = renderDesk(stalled());
      await pullDog(user, 'Poppy');
      await waitFor(() => expect(h.showUndoToast).toHaveBeenCalledTimes(1));

      // The row has not refreshed yet, so it is still editable; the stored entry says pulled.
      h.scratchShowMapEntry.mockRejectedValueOnce(
        Object.assign(new Error('already pulled'), { code: 'already-pulled' })
      );
      await pullDog(user, 'Poppy');

      await waitFor(() => expect(h.scratchShowMapEntry).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(toastInfo).toHaveBeenCalledWith('Poppy is already pulled from Container Novice A')
      );
      expect(toastError).not.toHaveBeenCalled();
      expect(h.showUndoToast).toHaveBeenCalledTimes(1);
      expect(h.undoShowMapScratch).not.toHaveBeenCalled();
    });

    it('shows the stored Pull when the entries re-read fails', async () => {
      resetReplica();
      h.scratchShowMapEntry.mockImplementation(async (entryId: string) => {
        writeReplicaRow(entryId, { entryStatus: 'scratched', checkInStatus: 'pulled' });
        return { entryId, previousEntryStatus: 'confirmed' };
      });
      const { user } = render(
        <StoredRowsDesk initial={[poppy]} reRead={() => Promise.reject(new Error('not synced'))} />
      );
      await pullDog(user, 'Poppy');

      await waitFor(() =>
        expect(screen.getByRole('region', { name: 'Alice Martin' })).toHaveTextContent('Pulled')
      );
      expect(
        screen.queryByRole('button', { name: /^Change status for Poppy/ })
      ).not.toBeInTheDocument();
    });
  });

  describe('a Pull that fails (MYK9-1844)', () => {
    let toastError: MockInstance<typeof toast.error>;

    beforeEach(() => {
      toastError = vi.spyOn(toast, 'error');
    });

    afterEach(() => {
      toastError.mockRestore();
      vi.unstubAllEnvs();
    });

    it('names the dog and class that did not pull, never the raw error', async () => {
      // Production wording: development builds echo raw messages on purpose.
      vi.stubEnv('DEV', false);
      h.scratchShowMapEntry.mockRejectedValue(new Error('IndexedDB transaction aborted'));
      const { user } = render(
        <CheckInDesk
          showId="show-1"
          entries={[poppy]}
          loading={false}
          unknown={false}
          onRetry={vi.fn()}
          currentDate={NOW}
        />
      );
      await choosePulled(user);
      const confirm = await screen.findByRole('dialog', { name: 'Pull Poppy?' });
      await user.click(within(confirm).getByRole('button', { name: 'Pull' }));

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith(
          "We couldn't pull Poppy from Container Novice A. Check Poppy's status before you try again."
        )
      );
      expect(JSON.stringify(toastError.mock.calls)).not.toContain('IndexedDB');
      expect(h.showUndoToast).not.toHaveBeenCalled();
    });
  });

  it('writes nothing when the secretary cancels', async () => {
    const { user } = render(
      <CheckInDesk
        showId="show-1"
        entries={[poppy]}
        loading={false}
        unknown={false}
        onRetry={vi.fn()}
        currentDate={NOW}
      />
    );
    await choosePulled(user);
    const confirm = await screen.findByRole('dialog', { name: 'Pull Poppy?' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Pull Poppy?' })).not.toBeInTheDocument()
    );
    expect(h.scratchShowMapEntry).not.toHaveBeenCalled();
    expect(h.updateReplicatedCheckInStatus).not.toHaveBeenCalled();
  });

  it('closes, writing nothing, when ringside takes the dog while the Pull is being confirmed', async () => {
    const props = {
      showId: 'show-1',
      loading: false,
      unknown: false,
      onRetry: vi.fn(),
      currentDate: NOW,
    };
    const { user, rerender } = render(<CheckInDesk {...props} entries={[poppy]} />);
    await choosePulled(user);
    expect(await screen.findByRole('dialog', { name: 'Pull Poppy?' })).toBeInTheDocument();

    const inRing: EntryManagementEntry = {
      ...poppy,
      classes: [{ ...poppy.classes[0]!, checkInStatus: 'in-ring' }],
    };
    rerender(<CheckInDesk {...props} entries={[inRing]} />);

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Pull Poppy?' })).not.toBeInTheDocument()
    );
    // Put back: the confirmation does not reopen on its own.
    rerender(<CheckInDesk {...props} entries={[poppy]} />);
    expect(screen.queryByRole('dialog', { name: 'Pull Poppy?' })).not.toBeInTheDocument();
    expect(h.scratchShowMapEntry).not.toHaveBeenCalled();
  });
});

describe('Putting a pulled class back from the desk (MYK9-1749)', () => {
  const pulledPoppy: EntryManagementEntry = {
    ...poppy,
    entryStatus: EntryStatus.SCRATCHED,
    classes: [{ ...poppy.classes[0]!, status: 'scratched', checkInStatus: 'pulled' }],
  };
  const props = { showId: 'show-1', loading: false, unknown: false, onRetry: vi.fn() };

  const history = (before: string) => [
    { previousStatus: 'submitted', newStatus: before },
    { previousStatus: before, newStatus: 'scratched' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    h.changeSecretaryEntryStatus.mockResolvedValue({});
    h.getEntryStatusHistory.mockResolvedValue(history('confirmed'));
  });

  const openPutBack = async (user: ReturnType<typeof render>['user']) => {
    await user.click(screen.getByRole('button', { name: 'Put Poppy back in Container Novice A' }));
    return screen.findByRole('alertdialog', { name: 'Put Poppy back in Container Novice A?' });
  };

  it('asks first, then puts an accepted entry back with Entries’ own Accept', async () => {
    const { user } = render(<CheckInDesk {...props} currentDate={NOW} entries={[pulledPoppy]} />);
    const confirm = await openPutBack(user);
    expect(h.changeSecretaryEntryStatus).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Put back' }));

    await waitFor(() => expect(h.changeSecretaryEntryStatus).toHaveBeenCalledTimes(1));
    expect(h.getEntryStatusHistory).toHaveBeenCalledWith('entry-1');
    expect(h.changeSecretaryEntryStatus.mock.calls[0]![0]).toMatchObject({
      entry: { id: 'entry-1' },
      newStatus: EntryStatus.ACCEPTED,
    });
    expect(h.updateReplicatedCheckInStatus).not.toHaveBeenCalled();
  });

  it('shows both the status and the check-in the stored Put back wrote when the re-read fails (MYK9-1812)', async () => {
    resetReplica();
    // What the real write stores: back to entered, and the check-in cleared from Pulled.
    h.changeSecretaryEntryStatus.mockImplementation(
      async ({ entry }: { entry: { id: string } }) => {
        writeReplicaRow(entry.id, { entryStatus: 'confirmed', checkInStatus: 'no-status' });
        return {};
      }
    );
    const { user } = render(
      <StoredRowsDesk
        initial={[pulledPoppy]}
        reRead={() => Promise.reject(new Error('not synced'))}
      />
    );
    const confirm = await openPutBack(user);
    await user.click(within(confirm).getByRole('button', { name: 'Put back' }));

    const row = () => screen.getByRole('region', { name: 'Alice Martin' });
    await waitFor(() => expect(row()).toHaveTextContent('Not checked in'));
    expect(row()).not.toHaveTextContent('Pulled');
    expect(screen.getByRole('button', { name: /^Change status for Poppy/ })).toBeInTheDocument();
  });

  it.each(['submitted', 'waitlisted', 'withdrawn'])(
    'refuses to accept an entry that was %s before the pull',
    async before => {
      h.getEntryStatusHistory.mockResolvedValue(history(before));
      const { user } = render(<CheckInDesk {...props} currentDate={NOW} entries={[pulledPoppy]} />);
      const confirm = await openPutBack(user);
      await user.click(within(confirm).getByRole('button', { name: 'Put back' }));

      await waitFor(() => expect(h.getEntryStatusHistory).toHaveBeenCalledTimes(1));
      expect(h.changeSecretaryEntryStatus).not.toHaveBeenCalled();
    }
  );

  it('offers no way back once a refund is decided', () => {
    render(
      <CheckInDesk
        {...props}
        currentDate={NOW}
        entries={[{ ...pulledPoppy, refundDecision: 'denied' }]}
      />
    );
    expect(screen.getByRole('article', { name: 'Poppy' })).toHaveTextContent(
      'Pulled · refund decided, see Entries'
    );
    expect(screen.queryByRole('button', { name: /^Change status|^Put Poppy back/ })).toBeNull();
  });
});
