import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  restoreFromInRing,
  settleRingRestores,
  transitionToCompleted,
  transitionToInRing,
} from './checkInTransitions';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';
import { replicatedEntriesTable } from '@/services/replication';

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: { get: vi.fn(), updateEntryWith: vi.fn().mockResolvedValue('m1') },
}));

describe('checkInTransitions', () => {
  beforeEach(() => {
    vi.mocked(updateReplicatedCheckInStatus).mockClear();
    vi.mocked(replicatedEntriesTable.get).mockReset();
    vi.mocked(replicatedEntriesTable.updateEntryWith).mockReset().mockResolvedValue('m1');
  });

  function buildStartFor(row: object) {
    return vi
      .mocked(replicatedEntriesTable.updateEntryWith)
      .mockImplementationOnce(async (_, build) => {
        const updates = build(row as never);
        return updates ? 'm1' : null;
      });
  }

  it.each([
    { checkInStatus: 'pulled' },
    { checkInStatus: 'completed' },
    { checkInStatus: 'checked-in', isScored: true },
    { checkInStatus: 'checked-in', awaitingRegistrationNumber: true },
    { checkInStatus: 'in-ring', ring_entry_time: '2026-10-14T18:00:00.000Z' },
  ])('leaves the current status and stamp alone for %j when timing starts', async row => {
    const update = buildStartFor(row);
    const move = transitionToInRing('entry-1');

    await expect(move.written).resolves.toBeNull();
    expect(update).toHaveBeenCalledExactlyOnceWith('entry-1', expect.any(Function));
    expect(update.mock.calls[0]?.[1](row as never)).toBeNull();
  });

  it.each(['checked-in', 'in-ring'] as const)(
    'stamps the current %s entry when timing starts and retains its prior status',
    async checkInStatus => {
      const row = { checkInStatus };
      const update = buildStartFor(row);
      const move = transitionToInRing('entry-1');

      await expect(move.written).resolves.toBe(checkInStatus);
      expect(update.mock.calls[0]?.[1](row as never)).toEqual({
        checkInStatus: 'in-ring',
        check_in_status: 'in-ring',
        ring_entry_time: move.writtenRingEntryTime,
      });
    }
  );

  it('moves scored entries to completed through the replicated helper', () => {
    transitionToCompleted('entry-1');

    expect(updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'completed', {
      ring_exit_time: expect.any(String),
    });
  });

  // MYK9-1762: leaving the sheet without a score puts the dog back.
  describe('restoreFromInRing', () => {
    const STAMP = '2026-11-08T18:00:00.000Z';
    const move = {
      entryId: 'entry-1',
      writtenRingEntryTime: STAMP,
      written: Promise.resolve('checked-in' as const),
    };

    function applyBuilder(row: object) {
      const build = vi.mocked(replicatedEntriesTable.updateEntryWith).mock.calls.at(-1)?.[1];
      return build?.(row as never);
    }

    it('puts back no ring time over a stale one the dog carried before the sheet opened (MYK9-1778)', async () => {
      buildStartFor({ checkInStatus: 'checked-in', ring_entry_time: '2026-11-07T15:00:00.000Z' });
      const opened = transitionToInRing('entry-1');
      const row = {
        id: 'entry-1',
        checkInStatus: 'in-ring',
        ring_entry_time: opened.writtenRingEntryTime,
        isScored: false,
      };
      vi.mocked(replicatedEntriesTable.get).mockResolvedValue(row as never);

      await restoreFromInRing(opened);

      expect(applyBuilder(row)).toEqual({
        checkInStatus: 'checked-in',
        check_in_status: 'checked-in',
        ring_entry_time: undefined,
      });
    });

    it('writes back the previous status, with no ring time, for an unscored dog still in the ring', async () => {
      const row = {
        id: 'entry-1',
        checkInStatus: 'in-ring',
        ring_entry_time: STAMP,
        isScored: false,
      };
      vi.mocked(replicatedEntriesTable.get).mockResolvedValue(row as never);

      await restoreFromInRing(move);

      expect(replicatedEntriesTable.updateEntryWith).toHaveBeenCalledWith(
        'entry-1',
        expect.any(Function)
      );
      expect(applyBuilder(row)).toEqual({
        checkInStatus: 'checked-in',
        check_in_status: 'checked-in',
        ring_entry_time: undefined,
      });
    });

    it('keeps a hand-marked in-ring dog in the ring, without the stamp the sheet added', async () => {
      const row = {
        id: 'entry-1',
        checkInStatus: 'in-ring',
        ring_entry_time: STAMP,
        isScored: false,
      };
      vi.mocked(replicatedEntriesTable.get).mockResolvedValue(row as never);

      await restoreFromInRing({ ...move, written: Promise.resolve('in-ring') });

      expect(applyBuilder(row)).toEqual({
        checkInStatus: 'in-ring',
        check_in_status: 'in-ring',
        ring_entry_time: undefined,
      });
    });

    it('never touches a dog that has been scored since', async () => {
      vi.mocked(replicatedEntriesTable.get).mockResolvedValue({
        id: 'entry-1',
        checkInStatus: 'in-ring',
        isScored: true,
      } as never);

      await restoreFromInRing(move);

      expect(replicatedEntriesTable.updateEntryWith).not.toHaveBeenCalled();
    });

    it('never overwrites a status someone else set since', async () => {
      vi.mocked(replicatedEntriesTable.get).mockResolvedValue({
        id: 'entry-1',
        checkInStatus: 'conflict',
        isScored: false,
      } as never);

      await restoreFromInRing(move);

      expect(replicatedEntriesTable.updateEntryWith).not.toHaveBeenCalled();
    });

    it("leaves another device's run alone: the stamp is not the one this sheet wrote", async () => {
      vi.mocked(replicatedEntriesTable.get).mockResolvedValue({
        id: 'entry-1',
        checkInStatus: 'in-ring',
        ring_entry_time: '2026-11-08T18:05:00.000Z',
        isScored: false,
      } as never);

      await restoreFromInRing(move);

      expect(replicatedEntriesTable.updateEntryWith).not.toHaveBeenCalled();
    });

    it('matches its own stamp when the server echoes it in another format', async () => {
      vi.mocked(replicatedEntriesTable.get).mockResolvedValue({
        id: 'entry-1',
        checkInStatus: 'in-ring',
        ring_entry_time: '2026-11-08 18:00:00+00',
        isScored: false,
      } as never);

      await restoreFromInRing(move);

      expect(replicatedEntriesTable.updateEntryWith).toHaveBeenCalledOnce();
    });

    it('waits for the in-ring write before reading the row (an instant Cancel)', async () => {
      let land: (status: 'checked-in') => void = () => undefined;
      const written = new Promise<'checked-in'>(resolve => {
        land = resolve;
      });
      vi.mocked(replicatedEntriesTable.get).mockResolvedValue({
        id: 'entry-1',
        checkInStatus: 'in-ring',
        ring_entry_time: STAMP,
        isScored: false,
      } as never);

      const restoring = restoreFromInRing({ ...move, written });
      await Promise.resolve();
      expect(replicatedEntriesTable.get).not.toHaveBeenCalled();
      land('checked-in');
      await restoring;

      expect(replicatedEntriesTable.updateEntryWith).toHaveBeenCalledOnce();
    });
  });

  // MYK9-1779: the list a sheet returns to reads after the dog is put back.
  describe('settleRingRestores', () => {
    it('resolves at once when nothing is restoring', async () => {
      await expect(settleRingRestores()).resolves.toBeUndefined();
    });

    it('waits for a restore in flight, then resolves', async () => {
      let land: (status: 'checked-in') => void = () => undefined;
      const written = new Promise<'checked-in'>(resolve => {
        land = resolve;
      });
      vi.mocked(replicatedEntriesTable.get).mockResolvedValue(undefined as never);
      const restoring = restoreFromInRing({
        entryId: 'entry-1',
        writtenRingEntryTime: '2026-11-08T16:03:13.750Z',
        written,
      });

      let settled = false;
      const waiting = settleRingRestores().then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);

      land('checked-in');
      await restoring;
      await waiting;
      expect(settled).toBe(true);
    });

    it('stops waiting after the ceiling when a restore never lands', async () => {
      vi.useFakeTimers();
      try {
        void restoreFromInRing({
          entryId: 'entry-1',
          writtenRingEntryTime: '2026-11-08T16:03:13.750Z',
          written: new Promise(() => undefined),
        });
        const waiting = settleRingRestores();
        await vi.advanceTimersByTimeAsync(1500);
        await expect(waiting).resolves.toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
