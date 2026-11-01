/**
 * MYK9-1625: a manager is asked for a flexible class's area count when the list
 * opens and again on a dog tap; anyone else is never asked; a count already chosen
 * asks nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const replica = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    getClassById: vi.fn(async (id: string) => rows.get(id) ?? null),
    subscribe: vi.fn(() => () => {}),
  };
});
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { getClassById: replica.getClassById, subscribe: replica.subscribe },
}));
vi.mock('./useJudgeAssignedToClass', () => ({
  useJudgeAssignedToClass: () => ({ status: 'not-applicable' }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { is_anonymous: false } }),
}));

import { useAreaCountGate } from './useAreaCountGate';
import { FLEXIBLE_AREA_COUNTS } from './areaCountChoices';

const flexible = FLEXIBLE_AREA_COUNTS as Record<string, { min: number; max: number }>;
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));

function seed(over: Record<string, unknown> = {}) {
  replica.rows.set('c1', {
    id: 'c1',
    element: 'Interior',
    level: 'Master',
    classStatus: 'upcoming',
    ...over,
  });
}

function setup(canManage = true, registry: string | null = 'AKC') {
  const setAreaCountDialogOpen = vi.fn();
  const setAreaCountRequirements = vi.fn();
  const hook = renderHook(() =>
    useAreaCountGate({
      classId: 'c1',
      registry: registry ?? undefined,
      ready: true,
      canManage,
      showRole: undefined,
      setAreaCountDialogOpen,
      setAreaCountRequirements,
    })
  );
  return { ...hook, setAreaCountDialogOpen, setAreaCountRequirements };
}

describe('useAreaCountGate (MYK9-1625)', () => {
  beforeEach(() => {
    replica.rows.clear();
    flexible['AKC|Interior|Master'] = { min: 2, max: 3 };
  });
  afterEach(() => {
    delete flexible['AKC|Interior|Master'];
  });

  it('opens the picker on load for a manager when the count is unset', async () => {
    seed();
    const { setAreaCountDialogOpen, setAreaCountRequirements } = setup();
    await settle();
    expect(setAreaCountRequirements).toHaveBeenCalledWith({ min: 2, max: 3, maxTotalSeconds: 0 });
    expect(setAreaCountDialogOpen).toHaveBeenCalledWith(true);
  });

  it('asks nothing of someone who cannot manage classes, and lets their tap through', async () => {
    seed();
    const { result, setAreaCountDialogOpen, setAreaCountRequirements } = setup(false);
    await settle();
    expect(setAreaCountDialogOpen).not.toHaveBeenCalled();
    expect(setAreaCountRequirements).not.toHaveBeenCalledWith(expect.objectContaining({ min: 2 }));
    expect(result.current.gateEntryClick()).toBe(false);
  });

  it('asks nothing once a count is chosen, but keeps the choices for the class menu', async () => {
    seed({ areaCount: 3 });
    const { result, setAreaCountDialogOpen, setAreaCountRequirements } = setup();
    await settle();
    expect(setAreaCountDialogOpen).not.toHaveBeenCalled();
    expect(setAreaCountRequirements).toHaveBeenCalled();
    expect(result.current.gateEntryClick()).toBe(false);
  });

  it('holds a dog tap and asks again while the count is unset', async () => {
    seed();
    const { result, setAreaCountDialogOpen } = setup();
    await settle();
    setAreaCountDialogOpen.mockClear();
    expect(result.current.gateEntryClick()).toBe(true);
    expect(setAreaCountDialogOpen).toHaveBeenCalledWith(true);
  });

  it('clears the choices when the list moves to a class with none', async () => {
    seed();
    replica.rows.set('c2', {
      id: 'c2',
      element: 'Interior',
      level: 'Novice',
      classStatus: 'upcoming',
    });
    const setAreaCountDialogOpen = vi.fn();
    const setAreaCountRequirements = vi.fn();
    const { rerender } = renderHook(
      ({ classId }: { classId: string }) =>
        useAreaCountGate({
          classId,
          registry: 'AKC',
          ready: true,
          canManage: true,
          showRole: undefined,
          setAreaCountDialogOpen,
          setAreaCountRequirements,
        }),
      { initialProps: { classId: 'c1' } }
    );
    await settle();
    expect(setAreaCountRequirements).toHaveBeenLastCalledWith({
      min: 2,
      max: 3,
      maxTotalSeconds: 0,
    });
    rerender({ classId: 'c2' });
    await settle();
    expect(setAreaCountRequirements).toHaveBeenLastCalledWith(null);
  });

  it('asks nothing until the class registry is known', async () => {
    seed();
    const { result, setAreaCountDialogOpen } = setup(true, null);
    await settle();
    expect(setAreaCountDialogOpen).not.toHaveBeenCalled();
    expect(result.current.gateEntryClick()).toBe(false);
  });

  it('never asks about a class whose area count is not a choice', async () => {
    seed({ level: 'Novice' });
    const { result, setAreaCountDialogOpen, setAreaCountRequirements } = setup();
    await settle();
    expect(setAreaCountDialogOpen).not.toHaveBeenCalled();
    expect(setAreaCountRequirements).not.toHaveBeenCalledWith(expect.objectContaining({ min: 2 }));
    expect(result.current.gateEntryClick()).toBe(false);
  });
});
