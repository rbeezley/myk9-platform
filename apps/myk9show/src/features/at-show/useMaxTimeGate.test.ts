/**
 * MYK9-1099: a judge-set class with no max time asks for it before the first dog;
 * a rulebook (fixed) time is applied without asking; the gate re-reads the
 * classes on every replica change.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const replica = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>();
  const listeners = new Set<() => void>();
  return {
    rows,
    listeners,
    getClassById: vi.fn(async (id: string) => rows.get(id) ?? null),
    updateClass: vi.fn(async (id: string, updates: Record<string, unknown>) => {
      rows.set(id, { ...rows.get(id), ...updates });
      listeners.forEach(listener => listener());
      return 'm1';
    }),
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
});
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {
    getClassById: replica.getClassById,
    updateClass: replica.updateClass,
    subscribe: replica.subscribe,
  },
}));

const assignment = vi.hoisted(() => ({ status: 'not-applicable' as string }));
vi.mock('./useJudgeAssignedToClass', () => ({
  useJudgeAssignedToClass: () => ({ status: assignment.status }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { is_anonymous: false } }),
}));

import { useMaxTimeGate } from './useMaxTimeGate';

const judgeSet = { min: 60, max: 180, forElement: 'Interior', forLevel: 'Excellent' };
const fixed = { fixed: 120, forElement: 'Container', forLevel: 'Novice' };

function seed(id: string, over: Record<string, unknown> = {}) {
  replica.rows.set(id, {
    id,
    element: 'Interior',
    level: 'Excellent',
    classStatus: 'upcoming',
    timeLimitRule: judgeSet,
    ...over,
  });
}

function setup(canSetMaxTime = true, classIds = ['c1']) {
  const setMaxTimeDialogOpen = vi.fn();
  const setMaxTimeRequiredWarning = vi.fn();
  const hook = renderHook(() =>
    useMaxTimeGate({
      classIds,
      ready: true,
      canSetMaxTime,
      showRole: undefined,
      setMaxTimeDialogOpen,
      setMaxTimeRequiredWarning,
    })
  );
  return { ...hook, setMaxTimeDialogOpen, setMaxTimeRequiredWarning };
}

const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));

describe('useMaxTimeGate (MYK9-1099)', () => {
  beforeEach(() => {
    replica.rows.clear();
    replica.listeners.clear();
    replica.updateClass.mockClear();
    replica.getClassById.mockClear();
    assignment.status = 'not-applicable';
  });

  it('opens Set Max Time with the required banner for a judge-set class with no time', async () => {
    seed('c1');
    const { result, setMaxTimeDialogOpen, setMaxTimeRequiredWarning } = setup();

    await waitFor(() => expect(setMaxTimeDialogOpen).toHaveBeenCalledWith(true));
    expect(setMaxTimeRequiredWarning).toHaveBeenCalledWith(true);

    setMaxTimeDialogOpen.mockClear();
    let blocked = false;
    act(() => {
      blocked = result.current.gateEntryClick();
    });
    expect(blocked).toBe(true);
    expect(setMaxTimeDialogOpen).toHaveBeenCalledWith(true);
  });

  it('never writes or asks for a rulebook time: class creation sets it', async () => {
    seed('c1', { element: 'Container', level: 'Novice', timeLimitRule: fixed });
    const { result, setMaxTimeDialogOpen } = setup();
    await settle();
    expect(replica.updateClass).not.toHaveBeenCalled();
    expect(setMaxTimeDialogOpen).not.toHaveBeenCalled();
    expect(result.current.gateEntryClick()).toBe(false);
  });

  it('does not ask a signed-in judge who is not assigned to the class', async () => {
    assignment.status = 'unassigned';
    seed('c1');
    const { result, setMaxTimeDialogOpen } = setup();
    await waitFor(() => expect(result.current.needsMaxTime).toBe(true));
    await settle();
    expect(setMaxTimeDialogOpen).not.toHaveBeenCalled();
    expect(result.current.gateEntryClick()).toBe(false);
  });

  it('asks while the assignment check is still running', async () => {
    assignment.status = 'checking';
    seed('c1');
    const { setMaxTimeDialogOpen } = setup();
    await waitFor(() => expect(setMaxTimeDialogOpen).toHaveBeenCalledWith(true));
  });

  it('withdraws the prompt when the assignment check then finds the judge unassigned', async () => {
    assignment.status = 'checking';
    seed('c1');
    const { setMaxTimeDialogOpen, setMaxTimeRequiredWarning, rerender } = setup();
    await waitFor(() => expect(setMaxTimeDialogOpen).toHaveBeenCalledWith(true));

    assignment.status = 'unassigned';
    rerender();

    expect(setMaxTimeDialogOpen).toHaveBeenLastCalledWith(false);
    expect(setMaxTimeRequiredWarning).toHaveBeenLastCalledWith(false);
  });

  it('asks again, and holds taps, when a reused list moves to another class', async () => {
    seed('c1', { timeLimitSeconds: 120 });
    seed('c2');
    const setMaxTimeDialogOpen = vi.fn();
    const setMaxTimeRequiredWarning = vi.fn();
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) =>
        useMaxTimeGate({
          classIds: ids,
          ready: true,
          canSetMaxTime: true,
          showRole: undefined,
          setMaxTimeDialogOpen,
          setMaxTimeRequiredWarning,
        }),
      { initialProps: { ids: ['c1'] } }
    );
    await settle();
    expect(setMaxTimeDialogOpen).not.toHaveBeenCalled();

    replica.getClassById.mockImplementationOnce(() => new Promise(() => {}));
    rerender({ ids: ['c2'] });
    // The previous class's snapshot must not answer for the new one.
    expect(result.current.gateEntryClick()).toBe(true);
  });

  it('prompts on a second class after a first one in the same list', async () => {
    seed('c1');
    seed('c2');
    const setMaxTimeDialogOpen = vi.fn();
    const { rerender } = renderHook(
      ({ ids }: { ids: string[] }) =>
        useMaxTimeGate({
          classIds: ids,
          ready: true,
          canSetMaxTime: true,
          showRole: undefined,
          setMaxTimeDialogOpen,
          setMaxTimeRequiredWarning: vi.fn(),
        }),
      { initialProps: { ids: ['c1'] } }
    );
    await waitFor(() => expect(setMaxTimeDialogOpen).toHaveBeenCalledTimes(1));
    rerender({ ids: ['c2'] });
    await waitFor(() => expect(setMaxTimeDialogOpen).toHaveBeenCalledTimes(2));
  });

  it('does not lock the list when the class read fails', async () => {
    seed('c1');
    replica.getClassById.mockRejectedValueOnce(new Error('idb'));
    const { result } = setup();
    await settle();
    expect(result.current.gateEntryClick()).toBe(false);
  });

  it('holds a dog tap until the class read answers', () => {
    seed('c1');
    replica.getClassById.mockImplementationOnce(() => new Promise(() => {}));
    const { result, setMaxTimeDialogOpen } = setup();
    expect(result.current.gateEntryClick()).toBe(true);
    expect(setMaxTimeDialogOpen).not.toHaveBeenCalled();
  });

  it('never gates someone who cannot set the time', async () => {
    seed('c1');
    const { result, setMaxTimeDialogOpen } = setup(false);

    await waitFor(() => expect(result.current.needsMaxTime).toBe(true));
    await settle();
    expect(setMaxTimeDialogOpen).not.toHaveBeenCalled();
    expect(result.current.gateEntryClick()).toBe(false);
    expect(replica.updateClass).not.toHaveBeenCalled();
  });

  it('leaves a class alone when it has a time, is completed, or has no time rule', async () => {
    for (const over of [
      { timeLimitSeconds: 150 },
      { classStatus: 'Completed' },
      { timeLimitRule: { forElement: 'Interior', forLevel: 'Excellent' } },
      { timeLimitRule: undefined },
    ]) {
      replica.rows.clear();
      seed('c1', over);
      const { result, setMaxTimeDialogOpen, unmount } = setup();
      await settle();
      expect(setMaxTimeDialogOpen).not.toHaveBeenCalled();
      expect(result.current.needsMaxTime).toBe(false);
      unmount();
    }
  });

  it('clears on a combined list once the section without a time gets one', async () => {
    seed('a', { timeLimitSeconds: 120 });
    seed('b');
    const { result } = setup(true, ['a', 'b']);
    await waitFor(() => expect(result.current.needsMaxTime).toBe(true));

    // The dialog saves A's unchanged time to both sections.
    await act(async () => {
      await replica.updateClass('a', { timeLimitSeconds: 120 });
      await replica.updateClass('b', { timeLimitSeconds: 120 });
    });

    await waitFor(() => expect(result.current.needsMaxTime).toBe(false));
    expect(result.current.gateEntryClick()).toBe(false);
  });
});
