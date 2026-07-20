import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLASS_STATUS } from '@myk9/core';

import { applyManualClassStatus } from '../classStatusMutations';
import { replicatedClassesTable } from '@/services/replication';

const mockUpdateClass = replicatedClassesTable.updateClass as unknown as ReturnType<typeof vi.fn>;
const mockGetClassById = replicatedClassesTable.getClassById as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {
    getClassById: vi.fn(() => Promise.resolve(null)),
    updateClass: vi.fn(() => Promise.resolve('class-mutation-1')),
  },
}));

describe('applyManualClassStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00.000Z'));
    mockGetClassById.mockResolvedValue(null);
  });

  it('writes In Progress with a start timestamp and no reopen-stamp clear', async () => {
    await applyManualClassStatus('class-1', CLASS_STATUS.IN_PROGRESS);

    expect(mockUpdateClass).toHaveBeenCalledWith('class-1', {
      classStatus: CLASS_STATUS.IN_PROGRESS,
      statusSource: 'manual',
      actual_start_time: '2026-07-18T12:00:00.000Z',
    });
    const payload = mockUpdateClass.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('actual_end_time');
    expect(payload).not.toHaveProperty('reopenedAfterCloseoutAt');
    expect(payload).not.toHaveProperty('isCompleted');
  });

  it('writes Completed with an end timestamp and clears the reopen stamp', async () => {
    await applyManualClassStatus('class-1', CLASS_STATUS.COMPLETED);

    expect(mockUpdateClass).toHaveBeenCalledWith('class-1', {
      classStatus: CLASS_STATUS.COMPLETED,
      statusSource: 'manual',
      reopenedAfterCloseoutAt: null,
      actual_end_time: '2026-07-18T12:00:00.000Z',
    });
    const payload = mockUpdateClass.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('actual_start_time');
    expect(payload).not.toHaveProperty('isCompleted');
  });

  it('writes Scheduled with both timing fields nulled', async () => {
    await applyManualClassStatus('class-1', CLASS_STATUS.SCHEDULED);

    expect(mockUpdateClass).toHaveBeenCalledWith('class-1', {
      classStatus: CLASS_STATUS.SCHEDULED,
      statusSource: 'manual',
      actual_start_time: undefined,
      actual_end_time: undefined,
    });
    const payload = mockUpdateClass.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('reopenedAfterCloseoutAt');
    expect(payload).not.toHaveProperty('isCompleted');
  });

  it('writes Upcoming with both timing fields nulled', async () => {
    await applyManualClassStatus('class-1', CLASS_STATUS.UPCOMING);

    expect(mockUpdateClass).toHaveBeenCalledWith('class-1', {
      classStatus: CLASS_STATUS.UPCOMING,
      statusSource: 'manual',
      actual_start_time: undefined,
      actual_end_time: undefined,
    });
    const payload = mockUpdateClass.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('reopenedAfterCloseoutAt');
    expect(payload).not.toHaveProperty('isCompleted');
  });

  it('writes Cancelled with no timing fields beyond status and source', async () => {
    await applyManualClassStatus('class-1', CLASS_STATUS.CANCELLED);

    expect(mockUpdateClass).toHaveBeenCalledWith('class-1', {
      classStatus: CLASS_STATUS.CANCELLED,
      statusSource: 'manual',
    });
    const payload = mockUpdateClass.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('actual_start_time');
    expect(payload).not.toHaveProperty('actual_end_time');
    expect(payload).not.toHaveProperty('reopenedAfterCloseoutAt');
    expect(payload).not.toHaveProperty('isCompleted');
  });

  it('makes exactly one replicated write per call', async () => {
    await applyManualClassStatus('class-1', CLASS_STATUS.IN_PROGRESS);

    expect(mockUpdateClass).toHaveBeenCalledTimes(1);
  });

  it('preserves authoritative timing when the selected status is already current', async () => {
    mockGetClassById.mockResolvedValue({
      classStatus: CLASS_STATUS.IN_PROGRESS,
      actual_start_time: '2026-07-18T11:30:00.000Z',
    });

    await applyManualClassStatus('class-1', CLASS_STATUS.IN_PROGRESS);

    expect(mockUpdateClass).not.toHaveBeenCalled();
  });
});
