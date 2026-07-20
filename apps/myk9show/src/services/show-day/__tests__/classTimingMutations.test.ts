import { beforeEach, describe, expect, it, vi } from 'vitest';

import { replicatedClassesTable } from '@/services/replication';
import { setRevisedExpectedStart } from '../classTimingMutations';

const mockUpdateClass = replicatedClassesTable.updateClass as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {
    updateClass: vi.fn(() => Promise.resolve('class-mutation-1')),
  },
}));

describe('setRevisedExpectedStart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes only the revised expectation through replication', async () => {
    await setRevisedExpectedStart('class-1', '2026-07-20T15:30:00.000Z');

    expect(mockUpdateClass).toHaveBeenCalledWith('class-1', {
      revisedExpectedStart: '2026-07-20T15:30:00.000Z',
    });
  });

  it('clears the revision without changing the scheduled start', async () => {
    await setRevisedExpectedStart('class-1', null);

    expect(mockUpdateClass).toHaveBeenCalledWith('class-1', {
      revisedExpectedStart: null,
    });
    expect(mockUpdateClass.mock.calls[0]?.[1]).not.toHaveProperty('startTime');
  });

  it('rejects an invalid timestamp before writing', async () => {
    await expect(setRevisedExpectedStart('class-1', 'not-a-time')).rejects.toThrow(
      'Revised expected start must be a valid timestamp'
    );

    expect(mockUpdateClass).not.toHaveBeenCalled();
  });
});
