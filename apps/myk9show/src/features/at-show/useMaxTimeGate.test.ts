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

  it('applies a rulebook time once, without asking', async () => {
    seed('c1', { element: 'Container', level: 'Novice', timeLimitRule: fixed });
    const { result, setMaxTimeDialogOpen } = setup();

    await waitFor(() =>
      expect(replica.updateClass).toHaveBeenCalledWith('c1', { timeLimitSeconds: 120 })
    );
    await settle();
    expect(replica.updateClass).toHaveBeenCalledTimes(1);
    expect(setMaxTimeDialogOpen).not.toHaveBeenCalled();
    expect(result.current.gateEntryClick()).toBe(false);
  });

  it('never gates or writes for someone who cannot set the time', async () => {
    seed('c1');
    seed('c2', { element: 'Container', level: 'Novice', timeLimitRule: fixed });
    const { result, setMaxTimeDialogOpen } = setup(false, ['c1', 'c2']);

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
