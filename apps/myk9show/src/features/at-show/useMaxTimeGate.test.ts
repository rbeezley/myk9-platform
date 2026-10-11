/**
 * MYK9-1099: a judge-set class with no max time asks for it before the first dog;
 * a rulebook (fixed) time is applied without asking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const { getClass, updateClass } = vi.hoisted(() => ({
  getClass: vi.fn(),
  updateClass: vi.fn(),
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { get: getClass, updateClass },
}));

import { useMaxTimeGate } from './useMaxTimeGate';

const judgeSet = { min: 60, max: 180, forElement: 'Interior', forLevel: 'Excellent' };
const fixed = { fixed: 120, forElement: 'Container', forLevel: 'Novice' };

function cls(over: Record<string, unknown>) {
  return { id: 'c1', element: 'Interior', level: 'Excellent', classStatus: 'upcoming', ...over };
}

function setup(canSetMaxTime = true, classIds = ['c1']) {
  const setMaxTimeDialogOpen = vi.fn();
  const setMaxTimeRequiredWarning = vi.fn();
  const hook = renderHook(() =>
    useMaxTimeGate({
      classIds,
      timeLimitKey: undefined,
      ready: true,
      canSetMaxTime,
      setMaxTimeDialogOpen,
      setMaxTimeRequiredWarning,
    })
  );
  return { ...hook, setMaxTimeDialogOpen, setMaxTimeRequiredWarning };
}

describe('useMaxTimeGate (MYK9-1099)', () => {
  beforeEach(() => {
    getClass.mockReset();
    updateClass.mockReset().mockResolvedValue('m1');
  });

  it('opens Set Max Time with the required banner for a judge-set class with no time', async () => {
    getClass.mockResolvedValue(cls({ timeLimitRule: judgeSet }));
    const { result, setMaxTimeDialogOpen, setMaxTimeRequiredWarning } = setup();

    await waitFor(() => expect(setMaxTimeDialogOpen).toHaveBeenCalledWith(true));
    expect(setMaxTimeRequiredWarning).toHaveBeenCalledWith(true);
    expect(result.current.needsMaxTime).toBe(true);

    setMaxTimeDialogOpen.mockClear();
    let blocked = false;
    act(() => {
      blocked = result.current.gateEntryClick();
    });
    expect(blocked).toBe(true);
    expect(setMaxTimeDialogOpen).toHaveBeenCalledWith(true);
  });

  it('applies a rulebook time without asking', async () => {
    getClass.mockResolvedValue(
      cls({ element: 'Container', level: 'Novice', timeLimitRule: fixed })
    );
    const { result, setMaxTimeDialogOpen } = setup();

    await waitFor(() => expect(updateClass).toHaveBeenCalledWith('c1', { timeLimitSeconds: 120 }));
    expect(setMaxTimeDialogOpen).not.toHaveBeenCalled();
    expect(result.current.gateEntryClick()).toBe(false);
  });

  it('never gates or writes for someone who cannot set the time', async () => {
    getClass.mockResolvedValue(cls({ timeLimitRule: judgeSet }));
    const { result, setMaxTimeDialogOpen } = setup(false);

    await waitFor(() => expect(result.current.needsMaxTime).toBe(true));
    expect(setMaxTimeDialogOpen).not.toHaveBeenCalled();
    expect(result.current.gateEntryClick()).toBe(false);

    getClass.mockResolvedValue(
      cls({ element: 'Container', level: 'Novice', timeLimitRule: fixed })
    );
    setup(false);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(updateClass).not.toHaveBeenCalled();
  });

  it('leaves a class alone when it has a time, is completed, or has no time rule', async () => {
    for (const over of [
      { timeLimitSeconds: 150, timeLimitRule: judgeSet },
      { classStatus: 'Completed', timeLimitRule: judgeSet },
      { timeLimitRule: { forElement: 'Interior', forLevel: 'Excellent' } },
      {},
    ]) {
      getClass.mockResolvedValue(cls(over));
      const { result, setMaxTimeDialogOpen, unmount } = setup();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(setMaxTimeDialogOpen).not.toHaveBeenCalled();
      expect(result.current.needsMaxTime).toBe(false);
      unmount();
    }
  });

  it('gates a combined list when either section has no time', async () => {
    getClass.mockImplementation(async (id: string) =>
      id === 'a'
        ? cls({ id: 'a', timeLimitSeconds: 120, timeLimitRule: judgeSet })
        : cls({ id: 'b', timeLimitRule: judgeSet })
    );
    const { setMaxTimeDialogOpen } = setup(true, ['a', 'b']);
    await waitFor(() => expect(setMaxTimeDialogOpen).toHaveBeenCalledWith(true));
  });
});
