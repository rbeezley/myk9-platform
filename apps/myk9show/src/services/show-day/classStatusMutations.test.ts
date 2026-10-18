import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLASS_STATUS } from '@myk9/core';

const { getClassById, updateClass } = vi.hoisted(() => ({
  getClassById: vi.fn(),
  updateClass: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { getClassById, updateClass },
}));

import { applyManualClassStatus } from './classStatusMutations';

describe('applyManualClassStatus timing stamps', () => {
  beforeEach(() => {
    getClassById.mockReset();
    updateClass.mockReset();
  });

  it('keeps the original start and clears the finish when a completed class is reopened', async () => {
    getClassById.mockResolvedValue({
      classStatus: CLASS_STATUS.COMPLETED,
      actual_start_time: '2026-10-10T09:00:00.000Z',
      actual_end_time: '2026-10-10T11:00:00.000Z',
    });

    await applyManualClassStatus('class-1', CLASS_STATUS.IN_PROGRESS);

    expect(updateClass).toHaveBeenCalledTimes(1);
    const [, updates] = updateClass.mock.calls[0]!;
    expect(updates).toMatchObject({
      classStatus: CLASS_STATUS.IN_PROGRESS,
      statusSource: 'manual',
    });
    expect(updates).not.toHaveProperty('actual_start_time');
    expect(updates).toHaveProperty('actual_end_time', undefined);
  });

  it('stamps the start the first time a class moves to in progress', async () => {
    getClassById.mockResolvedValue({ classStatus: CLASS_STATUS.SCHEDULED });

    await applyManualClassStatus('class-1', CLASS_STATUS.IN_PROGRESS);

    const [, updates] = updateClass.mock.calls[0]!;
    expect(updates.actual_start_time).toEqual(expect.any(String));
    expect(updates).toHaveProperty('actual_end_time', undefined);
  });

  it('stamps the finish when a class is completed', async () => {
    getClassById.mockResolvedValue({
      classStatus: CLASS_STATUS.IN_PROGRESS,
      actual_start_time: '2026-10-10T09:00:00.000Z',
    });

    await applyManualClassStatus('class-1', CLASS_STATUS.COMPLETED);

    const [, updates] = updateClass.mock.calls[0]!;
    expect(updates.actual_end_time).toEqual(expect.any(String));
    expect(updates).not.toHaveProperty('actual_start_time');
  });
});
