import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useClassResults } from '../useClassResults';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import type { ScentWorkEntry, ScentWorkClassConfig } from '@/types/scent-work-types';
import type { UserPermissions } from '@/types/user-permissions';

// `currentRow` is the row `updateEntryWith` hands its builder (the hydrated row
// the real table writes against); the builder's payload lands in `updateEntry`.
const { updateEntry, currentRow } = vi.hoisted(() => ({
  updateEntry: vi.fn().mockResolvedValue(undefined),
  currentRow: vi.fn().mockReturnValue({}),
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    updateEntry,
    updateEntryWith: (id: string, build: (row: unknown) => Record<string, unknown>) =>
      updateEntry(id, build(currentRow(id))),
  },
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
  currentRow.mockClear();
});

describe('class results: clearing a score (MYK9-1737)', () => {
  it('puts a completed dog back to checked-in in the same write', async () => {
    currentRow.mockReturnValueOnce({ id: 'e1', checkInStatus: 'completed' });
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
    currentRow.mockReturnValueOnce({ id: 'e1', checkInStatus: 'pulled' });
    const { result } = setup();
    await act(async () => {
      await result.current.clearEntry('e1');
    });
    expect(updateEntry.mock.calls[0]?.[1]).not.toHaveProperty('check_in_status');
  });
});
