import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mocks.from },
}));

import { db } from '@/services/database/connection';
import {
  loadHandlerPeople,
  resetHandlerHydrationCircuit,
  subscribeHandlerPeopleHydration,
  type HandlerPersonRow,
} from './handlerHydration';

describe('loadHandlerPeople offline boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHandlerHydrationCircuit();
    vi.spyOn(db.instance.people, 'bulkGet').mockResolvedValue([]);
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns cached identities without starting the online read offline', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    vi.mocked(db.instance.people.bulkGet).mockResolvedValue([
      { id: 'handler-1', firstName: 'Cached', lastName: 'Handler' },
    ]);

    try {
      await expect(loadHandlerPeople(['handler-1'])).resolves.toEqual(
        new Map([['handler-1', { id: 'handler-1', first_name: 'Cached', last_name: 'Handler' }]])
      );
      expect(mocks.from).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });

  it('returns an empty map without waiting for online hydration when unresolved offline', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    try {
      await expect(loadHandlerPeople(['missing-handler'])).resolves.toEqual(new Map());
      expect(mocks.from).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });

  it('hydrates a blank-handler owner from the local people cache offline', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    vi.mocked(db.instance.people.bulkGet).mockResolvedValue([
      { id: 'owner-1', firstName: 'Jamie', lastName: 'Walker' },
    ]);

    try {
      await expect(loadHandlerPeople(['owner-1'])).resolves.toEqual(
        new Map([['owner-1', { id: 'owner-1', first_name: 'Jamie', last_name: 'Walker' }]])
      );
      expect(mocks.from).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });

  it('does not retain a cached identity omitted by a successful online refresh', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.mocked(db.instance.people.bulkGet).mockResolvedValue([
      { id: 'handler-1', firstName: 'Cached', lastName: 'Handler' },
    ]);
    const bulkDelete = vi.spyOn(db.instance.people, 'bulkDelete').mockResolvedValue();
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    try {
      await expect(loadHandlerPeople(['handler-1'])).resolves.toEqual(new Map());
      expect(bulkDelete).toHaveBeenCalledWith(['handler-1']);
    } finally {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });

  it('persists a fast authoritative refresh before a later offline read', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.mocked(db.instance.people.bulkGet)
      .mockResolvedValueOnce([{ id: 'handler-1', firstName: 'Cached', lastName: 'Handler' }])
      .mockResolvedValueOnce([{ id: 'handler-1', firstName: 'Fresh', lastName: 'Handler' }]);
    const bulkPut = vi.spyOn(db.instance.people, 'bulkPut').mockResolvedValue('handler-1');
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: [{ id: 'handler-1', first_name: 'Fresh', last_name: 'Handler' }],
          error: null,
        }),
      }),
    });

    try {
      await expect(loadHandlerPeople(['handler-1'])).resolves.toEqual(
        new Map([['handler-1', { id: 'handler-1', first_name: 'Fresh', last_name: 'Handler' }]])
      );
      expect(bulkPut).toHaveBeenCalledWith([
        { id: 'handler-1', firstName: 'Fresh', lastName: 'Handler' },
      ]);

      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      await expect(loadHandlerPeople(['handler-1'])).resolves.toEqual(
        new Map([['handler-1', { id: 'handler-1', first_name: 'Fresh', last_name: 'Handler' }]])
      );
    } finally {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });

  it('removes an omitted fast-refresh identity before a later offline read', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.mocked(db.instance.people.bulkGet)
      .mockResolvedValueOnce([{ id: 'handler-1', firstName: 'Cached', lastName: 'Handler' }])
      .mockResolvedValueOnce([]);
    const bulkDelete = vi.spyOn(db.instance.people, 'bulkDelete').mockResolvedValue();
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    try {
      await expect(loadHandlerPeople(['handler-1'])).resolves.toEqual(new Map());
      expect(bulkDelete).toHaveBeenCalledWith(['handler-1']);

      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      await expect(loadHandlerPeople(['handler-1'])).resolves.toEqual(new Map());
    } finally {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });

  it('opens a short circuit after a failed online refresh', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.mocked(db.instance.people.bulkGet).mockResolvedValue([
      { id: 'handler-1', firstName: 'Cached', lastName: 'Handler' },
    ]);
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockRejectedValue(new Error('network unavailable')),
      }),
    });

    try {
      await expect(loadHandlerPeople(['handler-1'])).resolves.toEqual(
        new Map([['handler-1', { id: 'handler-1', first_name: 'Cached', last_name: 'Handler' }]])
      );
      mocks.from.mockClear();
      await expect(loadHandlerPeople(['handler-1'])).resolves.toEqual(
        new Map([['handler-1', { id: 'handler-1', first_name: 'Cached', last_name: 'Handler' }]])
      );
      expect(mocks.from).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });

  it('waits for a delayed authoritative rename instead of returning stale cache', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.mocked(db.instance.people.bulkGet).mockResolvedValue([
      { id: 'handler-1', firstName: 'Old', lastName: 'Name' },
    ]);
    const bulkPut = vi.spyOn(db.instance.people, 'bulkPut').mockResolvedValue('handler-1');
    let resolveRefresh!: (value: { data: HandlerPersonRow[]; error: null }) => void;
    const refresh = new Promise<{ data: HandlerPersonRow[]; error: null }>(resolve => {
      resolveRefresh = resolve;
    });
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue(refresh) }),
    });

    try {
      let settled = false;
      const pending = loadHandlerPeople(['handler-1']).then(result => {
        settled = true;
        return result;
      });
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(settled).toBe(true);
      await expect(pending).resolves.toEqual(
        new Map([['handler-1', { id: 'handler-1', first_name: 'Old', last_name: 'Name' }]])
      );
      resolveRefresh({
        data: [{ id: 'handler-1', first_name: 'New', last_name: 'Name' }],
        error: null,
      });
      await vi.waitFor(() => expect(bulkPut).toHaveBeenCalled());
    } finally {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });

  it('waits for a delayed authoritative deletion and removes cached identity', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.mocked(db.instance.people.bulkGet).mockResolvedValue([
      { id: 'handler-1', firstName: 'Deleted', lastName: 'Person' },
    ]);
    const bulkDelete = vi.spyOn(db.instance.people, 'bulkDelete').mockResolvedValue();
    let resolveRefresh!: (value: { data: HandlerPersonRow[]; error: null }) => void;
    const refresh = new Promise<{ data: HandlerPersonRow[]; error: null }>(resolve => {
      resolveRefresh = resolve;
    });
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue(refresh) }),
    });

    try {
      const pending = loadHandlerPeople(['handler-1']);
      await new Promise(resolve => setTimeout(resolve, 300));
      await expect(pending).resolves.toEqual(
        new Map([['handler-1', { id: 'handler-1', first_name: 'Deleted', last_name: 'Person' }]])
      );
      resolveRefresh({ data: [], error: null });
      await vi.waitFor(() => expect(bulkDelete).toHaveBeenCalledWith(['handler-1']));
    } finally {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });

  it('emits completion after a delayed refresh persists into an empty cache', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.mocked(db.instance.people.bulkGet).mockResolvedValue([]);
    const bulkPut = vi.spyOn(db.instance.people, 'bulkPut').mockResolvedValue('handler-1');
    let resolveRefresh!: (value: { data: HandlerPersonRow[]; error: null }) => void;
    const refresh = new Promise<{ data: HandlerPersonRow[]; error: null }>(resolve => {
      resolveRefresh = resolve;
    });
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue(refresh) }),
    });
    const events: Array<{ ids: readonly string[]; people: ReadonlyMap<string, HandlerPersonRow> }> =
      [];
    const unsubscribe = subscribeHandlerPeopleHydration(event => events.push(event));

    try {
      const pending = loadHandlerPeople(['handler-1']);
      await new Promise(resolve => setTimeout(resolve, 300));
      await expect(pending).resolves.toEqual(new Map());
      expect(events).toEqual([]);

      resolveRefresh({
        data: [{ id: 'handler-1', first_name: 'Fresh', last_name: 'Handler' }],
        error: null,
      });

      await vi.waitFor(() => expect(events).toHaveLength(1));
      expect(events[0]).toEqual({
        ids: ['handler-1'],
        people: new Map([
          ['handler-1', { id: 'handler-1', first_name: 'Fresh', last_name: 'Handler' }],
        ]),
        revision: expect.any(Number),
      });
      expect(bulkPut).toHaveBeenCalledWith([
        { id: 'handler-1', firstName: 'Fresh', lastName: 'Handler' },
      ]);
    } finally {
      unsubscribe();
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });

  it('does not emit a completion when a re-read persists identical authoritative values', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const first = deferredSupabaseResponse();
    const bulkPut = vi.spyOn(db.instance.people, 'bulkPut').mockResolvedValue('handler-1');
    vi.mocked(db.instance.people.bulkGet)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'handler-1', firstName: 'Fresh', lastName: 'Handler' }]);
    mocks.from
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue(first.promise) }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [{ id: 'handler-1', first_name: 'Fresh', last_name: 'Handler' }],
            error: null,
          }),
        }),
      });
    const events: Array<{ ids: readonly string[]; people: ReadonlyMap<string, HandlerPersonRow> }> =
      [];
    const unsubscribe = subscribeHandlerPeopleHydration(event => events.push(event));

    try {
      const pending = loadHandlerPeople(['handler-1']);
      await new Promise(resolve => setTimeout(resolve, 300));
      await expect(pending).resolves.toEqual(new Map());
      first.resolve({
        data: [{ id: 'handler-1', first_name: 'Fresh', last_name: 'Handler' }],
        error: null,
      });
      await vi.waitFor(() => expect(events).toHaveLength(1));

      await expect(loadHandlerPeople(['handler-1'])).resolves.toEqual(
        new Map([['handler-1', { id: 'handler-1', first_name: 'Fresh', last_name: 'Handler' }]])
      );
      expect(events).toHaveLength(1);
      expect(bulkPut).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });

  it('emits a deletion once, then stays quiet when the authoritative absence is unchanged', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const first = deferredSupabaseResponse();
    const bulkDelete = vi.spyOn(db.instance.people, 'bulkDelete').mockResolvedValue();
    vi.mocked(db.instance.people.bulkGet)
      .mockResolvedValueOnce([{ id: 'handler-1', firstName: 'Deleted', lastName: 'Person' }])
      .mockResolvedValueOnce([]);
    mocks.from
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue(first.promise) }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });
    const events: Array<{ ids: readonly string[]; people: ReadonlyMap<string, HandlerPersonRow> }> =
      [];
    const unsubscribe = subscribeHandlerPeopleHydration(event => events.push(event));

    try {
      const pending = loadHandlerPeople(['handler-1']);
      await new Promise(resolve => setTimeout(resolve, 300));
      await expect(pending).resolves.toEqual(
        new Map([['handler-1', { id: 'handler-1', first_name: 'Deleted', last_name: 'Person' }]])
      );
      first.resolve({ data: [], error: null });
      await vi.waitFor(() => expect(events).toHaveLength(1));

      await expect(loadHandlerPeople(['handler-1'])).resolves.toEqual(new Map());
      expect(events).toHaveLength(1);
      expect(bulkDelete).toHaveBeenCalledTimes(1);
      expect(events[0]).toEqual({
        ids: ['handler-1'],
        people: new Map(),
        revision: expect.any(Number),
      });
    } finally {
      unsubscribe();
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });

  function deferredSupabaseResponse() {
    let resolve!: (value: { data: HandlerPersonRow[]; error: null }) => void;
    const promise = new Promise<{ data: HandlerPersonRow[]; error: null }>(resolvePromise => {
      resolve = resolvePromise;
    });
    return {
      promise,
      resolve,
    };
  }

  it('does not persist an older refresh after a newer refresh', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const first = deferredSupabaseResponse();
    const second = deferredSupabaseResponse();
    const bulkPut = vi.spyOn(db.instance.people, 'bulkPut').mockResolvedValue('handler-1');
    mocks.from
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue(first.promise) }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue(second.promise) }),
      });

    try {
      const stale = loadHandlerPeople(['handler-1']);
      const current = loadHandlerPeople(['handler-1']);
      await vi.waitFor(() => expect(mocks.from).toHaveBeenCalledTimes(2));
      second.resolve({
        data: [{ id: 'handler-1', first_name: 'New', last_name: 'Name' }],
        error: null,
      });
      first.resolve({
        data: [{ id: 'handler-1', first_name: 'Old', last_name: 'Name' }],
        error: null,
      });
      await Promise.all([stale, current]);
      await vi.waitFor(() => expect(bulkPut).toHaveBeenCalledTimes(1));
      expect(bulkPut).toHaveBeenLastCalledWith([
        { id: 'handler-1', firstName: 'New', lastName: 'Name' },
      ]);
    } finally {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });

  it('does not publish an older completion after a newer generation starts during persistence', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const first = deferredSupabaseResponse();
    const second = deferredSupabaseResponse();
    let releaseOldPersistence!: (value: string) => void;
    const oldPersistence = new Promise<string>(resolve => {
      releaseOldPersistence = resolve;
    });
    const bulkPut = vi
      .spyOn(db.instance.people, 'bulkPut')
      .mockImplementation(people =>
        people.some(person => person.firstName === 'Old')
          ? Dexie.Promise.resolve(oldPersistence)
          : Dexie.Promise.resolve('handler-1')
      );
    mocks.from
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue(first.promise) }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue(second.promise) }),
      });
    const events: Array<{ ids: readonly string[]; people: ReadonlyMap<string, HandlerPersonRow> }> =
      [];
    const unsubscribe = subscribeHandlerPeopleHydration(event => events.push(event));

    try {
      const stale = loadHandlerPeople(['handler-1']);
      await vi.waitFor(() => expect(mocks.from).toHaveBeenCalledTimes(1));
      first.resolve({
        data: [{ id: 'handler-1', first_name: 'Old', last_name: 'Name' }],
        error: null,
      });
      await vi.waitFor(() =>
        expect(bulkPut).toHaveBeenCalledWith([
          { id: 'handler-1', firstName: 'Old', lastName: 'Name' },
        ])
      );

      const current = loadHandlerPeople(['handler-1']);
      await vi.waitFor(() => expect(mocks.from).toHaveBeenCalledTimes(2));
      second.resolve({
        data: [{ id: 'handler-1', first_name: 'New', last_name: 'Name' }],
        error: null,
      });
      await expect(current).resolves.toEqual(
        new Map([['handler-1', { id: 'handler-1', first_name: 'New', last_name: 'Name' }]])
      );
      await vi.waitFor(() => expect(events).toHaveLength(1));
      expect(events[0]).toEqual({
        ids: ['handler-1'],
        people: new Map([['handler-1', { id: 'handler-1', first_name: 'New', last_name: 'Name' }]]),
        revision: expect.any(Number),
      });

      releaseOldPersistence('handler-1');
      await expect(stale).resolves.toEqual(
        new Map([['handler-1', { id: 'handler-1', first_name: 'Old', last_name: 'Name' }]])
      );
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(events).toHaveLength(1);
    } finally {
      unsubscribe();
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });
});
