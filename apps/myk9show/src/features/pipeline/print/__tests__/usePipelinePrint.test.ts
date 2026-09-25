import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassPipelineItem } from '../../mission-control-types';

const mocks = vi.hoisted(() => ({
  getEntriesByClass: vi.fn(),
  generateRunOrder: vi.fn(),
  revision: { value: 0 },
  settle: vi.fn(),
}));

vi.mock('@/services/database/entries', () => ({ getEntriesByClass: mocks.getEntriesByClass }));
vi.mock('@/services/database/entries/handlerHydration', () => ({
  getHandlerPeopleHydrationRevision: () => mocks.revision.value,
  settleHandlerPeopleHydration: mocks.settle,
}));
vi.mock('../print-service', () => ({
  generateRunOrder: mocks.generateRunOrder,
  generateScoreSheet: vi.fn(),
  generateResults: vi.fn(),
}));
vi.mock('@/lib/notifications', () => ({
  notifications: { warning: vi.fn(), error: vi.fn() },
}));
vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (state: { shows: unknown[] }) => unknown) => selector({ shows: [] }),
}));
vi.mock('@/store/trialStore', () => ({
  useTrialStore: (selector: (state: { trials: unknown[] }) => unknown) => selector({ trials: [] }),
}));

import { usePipelinePrint } from '../usePipelinePrint';

const item = { id: 'class-1', name: 'Container Novice A', judge_name: 'J' } as ClassPipelineItem;

function row(handlerIdentity: { source: string; name: string | null }) {
  return {
    id: 'entry-1',
    armband: 7,
    dog: { call_name: 'Ditto', breed: 'Mutt' },
    handler_identity: handlerIdentity,
  };
}

function printedHandlerNames(): string[] {
  const entries = mocks.generateRunOrder.mock.calls[0][1] as Array<{ handlerName: string }>;
  return entries.map(entry => entry.handlerName);
}

// MYK9-743: on a cold cache the handler people read can miss its 250ms fast
// window, so the first read carries no name for a text-less entry. A one-shot
// print must wait for that hydration and re-read, not print "Unknown Handler".
describe('usePipelinePrint handler identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.revision.value = 0;
    mocks.settle.mockResolvedValue(undefined);
  });

  it('re-reads after a handler hydration completes while the print waits', async () => {
    mocks.getEntriesByClass
      .mockResolvedValueOnce({ data: [row({ source: 'unknown', name: null })], error: null })
      .mockResolvedValueOnce({
        data: [row({ source: 'assigned', name: 'Jamie Walker' })],
        error: null,
      });
    mocks.settle.mockImplementation(async () => {
      mocks.revision.value += 1;
    });

    const { result } = renderHook(() => usePipelinePrint('show-1', 'trial-1'));
    await act(async () => {
      await result.current.printRunOrder(item);
    });

    expect(mocks.getEntriesByClass).toHaveBeenCalledTimes(2);
    expect(printedHandlerNames()).toEqual(['Jamie Walker']);
  });

  it('reads once when no hydration completes', async () => {
    mocks.getEntriesByClass.mockResolvedValue({
      data: [row({ source: 'assigned', name: 'Jamie Walker' })],
      error: null,
    });

    const { result } = renderHook(() => usePipelinePrint('show-1', 'trial-1'));
    await act(async () => {
      await result.current.printRunOrder(item);
    });

    expect(mocks.settle).toHaveBeenCalledOnce();
    expect(mocks.getEntriesByClass).toHaveBeenCalledOnce();
    expect(printedHandlerNames()).toEqual(['Jamie Walker']);
  });
});
