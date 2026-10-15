import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassPipelineItem } from '../../mission-control-types';

const mocks = vi.hoisted(() => ({
  getEntriesByClass: vi.fn(),
  generateRunOrder: vi.fn(),
}));

vi.mock('@/services/database/entries', () => ({ getEntriesByClass: mocks.getEntriesByClass }));
vi.mock('@/services/database/entries/handlerHydration', () => ({
  getHandlerPeopleHydrationRevision: () => 0,
  settleHandlerPeopleHydration: vi.fn().mockResolvedValue(undefined),
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
const row = (id: string, callName: string, held?: boolean) => ({
  id,
  entry_status: 'confirmed',
  armband: id,
  dog: { call_name: callName, breed: 'Beagle' },
  handler_identity: { source: 'assigned', name: 'Jamie' },
  ...(held === undefined ? {} : { awaiting_registration_number: held }),
});

// MYK9-1162: the pipeline print never lists an entry the server marks as held.
describe('usePipelinePrint entries awaiting a registration number', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('leaves the held entry off and prints the rest', async () => {
    mocks.getEntriesByClass.mockResolvedValue({
      data: [row('1', 'Registered', false), row('2', 'Held', true), row('3', 'Unflagged')],
      error: null,
    });
    const { result } = renderHook(() => usePipelinePrint('show-1', 'trial-1'));
    await act(async () => {
      await result.current.printRunOrder(item);
    });
    const entries = mocks.generateRunOrder.mock.calls[0]?.[1] as Array<{ callName: string }>;
    expect(entries.map(entry => entry.callName)).toEqual(['Registered', 'Unflagged']);
  });
});
