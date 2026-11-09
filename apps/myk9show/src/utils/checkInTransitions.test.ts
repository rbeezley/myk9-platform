import { beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreFromInRing, transitionToCompleted, transitionToInRing } from './checkInTransitions';
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
    vi.mocked(replicatedEntriesTable.updateEntryWith).mockClear();
  });

  it('moves scoring-opened entries to in-ring through the replicated helper', () => {
    const move = transitionToInRing('entry-1', 'checked-in', undefined);

    expect(move).toEqual({
      entryId: 'entry-1',
      previousStatus: 'checked-in',
      writtenRingEntryTime: expect.any(String),
      written: expect.any(Promise),
    });
    expect(vi.mocked(updateReplicatedCheckInStatus).mock.calls[0]?.[2]).toEqual({
      ring_entry_time: move?.writtenRingEntryTime,
    });

    expect(updateReplicatedCheckInStatus).toHaveBeenCalledOnce();
    expect(updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'in-ring', {
      ring_entry_time: expect.any(String),
    });
  });

  it('does not re-stamp ring_entry_time for an entry already in-ring (Resume)', () => {
    expect(transitionToInRing('entry-1', 'in-ring', '2026-10-14T18:00:00.000Z')).toBeNull();

    expect(updateReplicatedCheckInStatus).not.toHaveBeenCalled();
  });

  it('stamps ring_entry_time for an entry marked in-ring by hand with no time yet', () => {
    // The steward's "Mark in ring" writes only check_in_status; the scoresheet
    // opening is what records when the dog entered the ring.
    transitionToInRing('entry-1', 'in-ring', undefined);

    expect(updateReplicatedCheckInStatus).toHaveBeenCalledOnce();
    expect(updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'in-ring', {
      ring_entry_time: expect.any(String),
    });
  });

  it('does not reopen a completed entry', () => {
    transitionToInRing('entry-1', 'completed', undefined);

    expect(updateReplicatedCheckInStatus).not.toHaveBeenCalled();
  });

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
      previousStatus: 'checked-in' as const,
      writtenRingEntryTime: STAMP,
      written: Promise.resolve(),
    };

    function applyBuilder(row: object) {
      const build = vi.mocked(replicatedEntriesTable.updateEntryWith).mock.calls[0]?.[1];
      return build?.(row as never);
    }

    it('puts back no ring time over a stale one the dog carried before the sheet opened (MYK9-1778)', async () => {
      const opened = transitionToInRing('entry-1', 'checked-in', '2026-11-07T15:00:00.000Z');
      const row = {
        id: 'entry-1',
        checkInStatus: 'in-ring',
        ring_entry_time: opened?.writtenRingEntryTime,
        isScored: false,
      };
      vi.mocked(replicatedEntriesTable.get).mockResolvedValue(row as never);

      await restoreFromInRing(opened!);

      expect(applyBuilder(row)).toEqual({
        checkInStatus: 'checked-in',
        check_in_status: 'checked-in',
        ring_entry_time: undefined,
      });
    });

    it('writes back the previous status and ring time for an unscored dog still in the ring', async () => {
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

      await restoreFromInRing({ ...move, previousStatus: 'in-ring' });

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
      let land: () => void = () => undefined;
      const written = new Promise<void>(resolve => {
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
      land();
      await restoring;

      expect(replicatedEntriesTable.updateEntryWith).toHaveBeenCalledOnce();
    });
  });
});
