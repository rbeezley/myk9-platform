import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  entriesByShow: vi.fn(),
  entriesByClass: vi.fn(),
  dogs: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    getEntriesByShow: mocks.entriesByShow,
    getEntriesByClass: mocks.entriesByClass,
  },
  replicatedDogsTable: { getAllDogs: mocks.dogs },
}));
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: mocks.from } }));

import { db } from '@/services/database/connection';
import {
  getHandlerPeopleHydrationRevision,
  resetHandlerHydrationCircuit,
} from './handlerHydration';
import { getLocalShowDayEntriesByClass, getLocalShowDayEntriesByShow } from './localShowDayRead';

const localEntry = {
  id: 'entry-1',
  showId: 'show-1',
  classId: 'class-1',
  dogId: 'dog-1',
  dogOwnerId: 'owner-1',
  handlerId: 'handler-1',
  registrationId: 'registration-request-unresolved',
  runOrder: 3,
  checkInStatus: 'come-to-gate',
  isInRing: true,
  isScored: false,
  entryStatus: 'confirmed',
};

describe('local show-day entry reads', () => {
  const originalOnline = navigator.onLine;

  beforeEach(() => {
    vi.clearAllMocks();
    resetHandlerHydrationCircuit();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    vi.spyOn(db.instance.people, 'bulkGet').mockResolvedValue([
      { id: 'owner-1', firstName: 'Owner', lastName: 'Person' },
      { id: 'handler-1', firstName: 'Cached', lastName: 'Handler' },
    ]);
    mocks.entriesByShow.mockResolvedValue([localEntry]);
    mocks.entriesByClass.mockResolvedValue([localEntry]);
    mocks.dogs.mockResolvedValue([
      { id: 'dog-1', callName: 'Scout', name: 'Scout', breed: 'Beagle', ownerId: 'owner-1' },
    ]);
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnline });
    vi.restoreAllMocks();
  });

  it('projects local queue state and cached assigned identity offline without sync or online reads', async () => {
    const { entries } = await getLocalShowDayEntriesByShow('show-1');

    expect(entries[0]).toMatchObject({
      isInRing: true,
      checkInStatus: 'come-to-gate',
      runOrder: 3,
      isScored: false,
      registrationId: 'registration-request-unresolved',
      dogCallName: 'Scout',
      dogBreed: 'Beagle',
      handler_identity: {
        name: 'Cached Handler',
        source: 'assigned-person',
      },
    });
    expect(mocks.entriesByShow).toHaveBeenCalledWith('show-1');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('keeps an assigned but uncached person unknown instead of substituting the owner', async () => {
    vi.mocked(db.instance.people.bulkGet).mockResolvedValue([
      { id: 'owner-1', firstName: 'Owner', lastName: 'Person' },
    ]);

    const { entries } = await getLocalShowDayEntriesByClass('class-1');

    expect(entries[0]?.handler_identity).toEqual({ name: null, person: null, source: 'unknown' });
    expect(mocks.entriesByClass).toHaveBeenCalledWith('class-1');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('prefers assigned handler text to both cached person and owner', async () => {
    mocks.entriesByShow.mockResolvedValue([{ ...localEntry, handler: 'Assigned Text' }]);

    const { entries } = await getLocalShowDayEntriesByShow('show-1');

    expect(entries[0]?.handler_identity).toMatchObject({
      name: 'Assigned Text',
      source: 'assigned-text',
    });
  });

  it('starts deferred people refresh without holding the local queue read open', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.mocked(db.instance.people.bulkGet).mockResolvedValue([]);
    mocks.entriesByShow.mockResolvedValue([{ ...localEntry, handler: undefined }]);
    const bulkPut = vi.spyOn(db.instance.people, 'bulkPut').mockResolvedValue('handler-1');
    let resolvePeople!: (value: {
      data: { id: string; first_name: string; last_name: string }[];
      error: null;
    }) => void;
    const deferred = new Promise<{
      data: { id: string; first_name: string; last_name: string }[];
      error: null;
    }>(resolve => {
      resolvePeople = resolve;
    });
    mocks.from.mockReturnValue({ select: () => ({ in: () => deferred }) });

    const result = await getLocalShowDayEntriesByShow('show-1');

    expect(result.entries[0]?.handler_identity.source).toBe('unknown');
    await vi.waitFor(() => expect(mocks.from).toHaveBeenCalledWith('people'));
    resolvePeople({
      data: [{ id: 'handler-1', first_name: 'Fresh', last_name: 'Person' }],
      error: null,
    });
    await vi.waitFor(() =>
      expect(getHandlerPeopleHydrationRevision()).toBeGreaterThan(result.hydrationRevision)
    );
    expect(bulkPut).toHaveBeenCalledWith([
      { id: 'handler-1', firstName: 'Fresh', lastName: 'Person' },
    ]);
  });
});
