/**
 * MYK9-1761: moving an unscored dog out of the ring to a pre-run status clears
 * ring_entry_time, which Show Map, hand placement and move-up supersession read
 * as "in the ring / run started".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { replicatedEntriesTable } from '@/services/replication';
import { classifyEntryRunStatus } from '@/features/show-map/showMapStatus';
import { updateReplicatedCheckInStatus } from './checkInStatus';

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    get: vi.fn(),
    updateEntryWith: vi.fn().mockResolvedValue('m-with'),
    updateEntry: vi.fn().mockResolvedValue('m-entry'),
    updateCheckInStatus: vi.fn().mockResolvedValue('m-narrow'),
  },
}));

const inRingUnscored = {
  id: 'e1',
  checkInStatus: 'in-ring',
  ring_entry_time: '2026-11-08T16:03:13.750Z',
  isScored: false,
};

function builtUpdates(row: object) {
  const build = vi.mocked(replicatedEntriesTable.updateEntryWith).mock.calls[0]?.[1];
  return build?.(row as never);
}

describe('updateReplicatedCheckInStatus and ring_entry_time (MYK9-1761)', () => {
  beforeEach(() => {
    vi.mocked(replicatedEntriesTable.get).mockReset();
    vi.mocked(replicatedEntriesTable.updateEntryWith).mockClear();
    vi.mocked(replicatedEntriesTable.updateEntry).mockClear();
    vi.mocked(replicatedEntriesTable.updateCheckInStatus).mockClear();
  });

  it.each(['no-status', 'checked-in', 'at-gate', 'come-to-gate', 'conflict'] as const)(
    'clears the ring time when an unscored dog goes back to %s',
    async status => {
      vi.mocked(replicatedEntriesTable.get).mockResolvedValue(inRingUnscored as never);

      await expect(updateReplicatedCheckInStatus('e1', status)).resolves.toBe('m-with');

      expect(builtUpdates(inRingUnscored)).toEqual({
        ring_entry_time: undefined,
        checkInStatus: status,
        check_in_status: status,
      });
      expect(replicatedEntriesTable.updateCheckInStatus).not.toHaveBeenCalled();
    }
  );

  it('keeps the ring time on a scored dog', async () => {
    vi.mocked(replicatedEntriesTable.get).mockResolvedValue({
      ...inRingUnscored,
      isScored: true,
    } as never);

    await updateReplicatedCheckInStatus('e1', 'checked-in');

    expect(replicatedEntriesTable.updateEntryWith).not.toHaveBeenCalled();
    expect(replicatedEntriesTable.updateCheckInStatus).toHaveBeenCalledWith('e1', 'checked-in');
  });

  it('keeps the narrow check-in write when there is no ring time to clear', async () => {
    vi.mocked(replicatedEntriesTable.get).mockResolvedValue({
      id: 'e1',
      checkInStatus: 'no-status',
      isScored: false,
    } as never);

    await updateReplicatedCheckInStatus('e1', 'checked-in');

    expect(replicatedEntriesTable.updateEntryWith).not.toHaveBeenCalled();
    expect(replicatedEntriesTable.updateCheckInStatus).toHaveBeenCalledWith('e1', 'checked-in');
  });

  it('leaves the ring time alone for in-ring and completed writes', async () => {
    vi.mocked(replicatedEntriesTable.get).mockResolvedValue(inRingUnscored as never);

    await updateReplicatedCheckInStatus('e1', 'completed', { ring_exit_time: 't' });

    expect(replicatedEntriesTable.get).not.toHaveBeenCalled();
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('e1', {
      ring_exit_time: 't',
      checkInStatus: 'completed',
      check_in_status: 'completed',
    });
  });

  it('judges a row not yet on this device on the hydrated row, not by skipping it', async () => {
    vi.mocked(replicatedEntriesTable.get).mockResolvedValue(null);

    await updateReplicatedCheckInStatus('e1', 'checked-in');

    expect(replicatedEntriesTable.updateEntryWith).toHaveBeenCalledWith('e1', expect.any(Function));
    expect(builtUpdates(inRingUnscored)).toEqual({
      ring_entry_time: undefined,
      checkInStatus: 'checked-in',
      check_in_status: 'checked-in',
    });
    expect(builtUpdates({ id: 'e1', checkInStatus: 'no-status' })).toEqual({
      checkInStatus: 'checked-in',
      check_in_status: 'checked-in',
    });
  });

  it('Show Map stops showing the dog in the ring after the undo', async () => {
    const showMapRow = {
      entry_status: 'confirmed',
      check_in_status: 'in-ring',
      ring_entry_time: '2026-11-08T16:03:13.750Z',
    };
    expect(classifyEntryRunStatus(showMapRow)?.label).toBe('In ring');
    vi.mocked(replicatedEntriesTable.get).mockResolvedValue(inRingUnscored as never);

    await updateReplicatedCheckInStatus('e1', 'no-status');
    const after = { ...showMapRow, ...builtUpdates(inRingUnscored) };

    expect(classifyEntryRunStatus(after)?.value).not.toBe('in-ring');
    expect(after.ring_entry_time).toBeUndefined();
  });
});
