import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mocks.from },
}));

import { db } from '@/services/database/connection';
import { queryClient } from '@/lib/queryClient';
import {
  loadHandlerPeople,
  resetHandlerHydrationCircuit,
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
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
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
      expect(invalidateQueries).toHaveBeenCalled();
      const invalidateOptions = invalidateQueries.mock.calls.at(-1)?.[0] as unknown as {
        predicate?: (query: { queryKey: readonly unknown[] }) => boolean;
      };
      expect(
        invalidateOptions.predicate?.({ queryKey: ['reports', 'show-1', 'trial-1', 'class-1'] })
      ).toBe(true);
      expect(invalidateOptions.predicate?.({ queryKey: ['report-data', 'show-1'] })).toBe(false);
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
});
