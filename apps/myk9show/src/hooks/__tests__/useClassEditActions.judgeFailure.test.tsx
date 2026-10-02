import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useClassEditActions } from '../useClassEditActions';
const mocks = vi.hoisted(() => ({ prepare: vi.fn(), sync: vi.fn(), load: vi.fn() }));
vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => undefined }));
vi.mock('@/services/replication', () => ({
  replicatedJudgeAssignmentsTable: { replaceClassAssignment: mocks.prepare },
  replicatedClassesTable: { sync: mocks.sync, updateClass: vi.fn(async () => 'queued-touch') },
}));
vi.mock('@/store/trialStore', () => ({
  useTrialStore: { getState: () => ({ loadTrialClasses: mocks.load }) },
}));
describe('required judge preparation', () => {
  beforeEach(() => {
    mocks.prepare.mockReset().mockResolvedValue(undefined);
    mocks.sync.mockReset().mockResolvedValue(undefined);
    mocks.load.mockReset().mockResolvedValue(undefined);
  });
  it('rejects before the independent class write, then permits retry', async () => {
    const failure = new Error('Unable to read assignments for write');
    mocks.prepare.mockRejectedValueOnce(failure);
    const updateClass = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useClassEditActions({ showId: 's1', updateClass }));
    await expect(
      result.current.saveClass('c1', { judgeId: 'j2' }, 't1', 'j1')
    ).rejects.toMatchObject({
      message: failure.message,
      table: 'judge_assignments',
      operation: 'upsert_class_assignment',
    });
    expect(updateClass).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
    await result.current.saveClass('c1', { judgeId: 'j2' }, 't1', 'j1');
    expect(mocks.prepare).toHaveBeenCalledWith('s1', 'c1', 'j2');
    expect(updateClass).toHaveBeenCalledWith('c1', { judgeId: 'j2' });
  });
  it('keeps prepared saves successful when cache sync fails', async () => {
    mocks.sync.mockRejectedValue(new Error('Cache refresh failed'));
    const updateClass = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useClassEditActions({ showId: 's1', updateClass }));
    await expect(
      result.current.saveClass('c1', { judgeId: 'j2' }, 't1', 'j1')
    ).resolves.toBeUndefined();
    expect(mocks.prepare).toHaveBeenCalledWith('s1', 'c1', 'j2');
    expect(updateClass).toHaveBeenCalledWith('c1', { judgeId: 'j2' });
  });
});
