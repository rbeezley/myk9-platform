import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassPipelineItem } from '../../mission-control-types';

const mocks = vi.hoisted(() => ({
  getEntriesByClass: vi.fn(),
  loadDogRegistrations: vi.fn(),
  generateRunOrder: vi.fn(),
  trials: [] as unknown[],
}));

vi.mock('@/services/database/entries', () => ({ getEntriesByClass: mocks.getEntriesByClass }));
vi.mock('@/services/database/dogs/reads', () => ({
  loadDogRegistrations: mocks.loadDogRegistrations,
}));
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
  useTrialStore: (selector: (state: { trials: unknown[] }) => unknown) =>
    selector({ trials: mocks.trials }),
}));

import { usePipelinePrint } from '../usePipelinePrint';

const item = { id: 'class-1', name: 'Container Novice A', judge_name: 'J' } as ClassPipelineItem;
const row = (id: string, dogId: string) => ({
  id,
  dog_id: dogId,
  entry_status: 'confirmed',
  armband: id,
  dog: { call_name: dogId, breed: 'Beagle' },
  handler_identity: { source: 'assigned', name: 'Jamie' },
});
const akc = [{ organization: 'AKC', registration_number: 'SR1' }];

async function printedCallNames(): Promise<string[]> {
  const { result } = renderHook(() => usePipelinePrint('show-1', 'trial-1'));
  await act(async () => {
    await result.current.printRunOrder(item);
  });
  const entries = mocks.generateRunOrder.mock.calls[0]?.[1] as Array<{ callName: string }>;
  return entries.map(entry => entry.callName);
}

// MYK9-1162: the pipeline print never lists an entry awaiting a number.
describe('usePipelinePrint entries awaiting a registration number', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trials = [{ id: 'trial-1', registryId: 'AKC' }];
    mocks.getEntriesByClass.mockResolvedValue({
      data: [row('1', 'dog-reg'), row('2', 'dog-held')],
      error: null,
    });
  });

  it('prints the registered dog and leaves the held one off', async () => {
    mocks.loadDogRegistrations.mockResolvedValue({
      byDog: new Map([['dog-reg', akc]]),
      registrationsReadComplete: true,
      source: 'server',
    });
    expect(await printedCallNames()).toEqual(['dog-reg']);
  });

  it('prints everyone when the registrations read did not answer', async () => {
    mocks.loadDogRegistrations.mockResolvedValue({
      byDog: new Map(),
      registrationsReadComplete: false,
      source: 'server',
    });
    expect(await printedCallNames()).toEqual(['dog-reg', 'dog-held']);
  });

  it('prints everyone when the trial is not in the store, without reading registrations', async () => {
    mocks.trials = [];
    expect(await printedCallNames()).toEqual(['dog-reg', 'dog-held']);
    expect(mocks.loadDogRegistrations).not.toHaveBeenCalled();
  });
});
