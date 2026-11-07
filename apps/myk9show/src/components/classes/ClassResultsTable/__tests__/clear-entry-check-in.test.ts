import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useClassResults } from '../useClassResults';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import type { ScentWorkEntry, ScentWorkClassConfig } from '@/types/scent-work-types';
import type { UserPermissions } from '@/types/user-permissions';

const { updateEntry, getEntryById } = vi.hoisted(() => ({
  updateEntry: vi.fn().mockResolvedValue(undefined),
  getEntryById: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { updateEntry, getEntryById },
}));
vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn() },
}));

const raw = {
  id: 'e1',
  class_id: 'c1',
  show_id: 's1',
  dog_id: 'd1',
  handler_id: null,
  armband: '101',
  handler: 'Alice Smith',
  result_status: 'qualified',
  is_scored: true,
  search_time_seconds: 61,
  total_faults: 0,
  final_placement: 1,
  judge_notes: null,
  disqualification_reason: null,
  scoring_completed_at: '2026-11-07T15:00:00Z',
  check_in_status: 'completed',
  run_order: 1,
  dog: null,
  created_at: null,
  updated_at: null,
} as RawEntryRow;

function setup() {
  return renderHook(() =>
    useClassResults({
      entries: [{ id: 'e1' } as ScentWorkEntry],
      rawEntries: [raw],
      classConfig: {} as ScentWorkClassConfig,
      userPermissions: { canEditEntries: true } as UserPermissions,
      classId: 'c1',
    })
  );
}

beforeEach(() => {
  updateEntry.mockClear();
  getEntryById.mockClear();
});

describe('class results: clearing a score (MYK9-1737)', () => {
  it('puts a completed dog back to checked-in in the same write', async () => {
    getEntryById.mockResolvedValueOnce({ id: 'e1', checkInStatus: 'completed' });
    const { result } = setup();
    await act(async () => {
      await result.current.clearEntry('e1');
    });
    expect(updateEntry).toHaveBeenCalledTimes(1);
    expect(updateEntry).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({
        is_scored: false,
        result_status: 'pending',
        checkInStatus: 'checked-in',
        check_in_status: 'checked-in',
      })
    );
  });

  it('leaves a pulled dog pulled', async () => {
    getEntryById.mockResolvedValueOnce({ id: 'e1', checkInStatus: 'pulled' });
    const { result } = setup();
    await act(async () => {
      await result.current.clearEntry('e1');
    });
    expect(updateEntry.mock.calls[0]?.[1]).not.toHaveProperty('check_in_status');
  });
});
