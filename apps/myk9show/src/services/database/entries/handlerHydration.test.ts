import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mocks.from },
}));

import { db } from '@/services/database/connection';
import { loadHandlerPeople, type HandlerPersonRow } from './handlerHydration';

describe('loadHandlerPeople offline boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    try {
      await expect(loadHandlerPeople(['handler-1'])).resolves.toEqual(new Map());
    } finally {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });

  it('returns cached identities promptly while a degraded online refresh continues', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.mocked(db.instance.people.bulkGet).mockResolvedValue([
      { id: 'handler-1', firstName: 'Cached', lastName: 'Handler' },
    ]);
    const bulkPut = vi.spyOn(db.instance.people, 'bulkPut').mockResolvedValue('handler-1');
    const bulkDelete = vi.spyOn(db.instance.people, 'bulkDelete').mockResolvedValue();
    let resolveRefresh!: (value: { data: HandlerPersonRow[]; error: null }) => void;
    const refresh = new Promise<{ data: HandlerPersonRow[]; error: null }>(resolve => {
      resolveRefresh = resolve;
    });
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue(refresh) }),
    });

    try {
      const started = performance.now();
      await expect(loadHandlerPeople(['handler-1'])).resolves.toEqual(
        new Map([['handler-1', { id: 'handler-1', first_name: 'Cached', last_name: 'Handler' }]])
      );
      expect(performance.now() - started).toBeLessThan(1000);

      resolveRefresh({
        data: [{ id: 'handler-1', first_name: 'Fresh', last_name: 'Handler' }],
        error: null,
      });
      await vi.waitFor(() => expect(bulkPut).toHaveBeenCalled());
      expect(bulkDelete).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: originalOnline,
      });
    }
  });
});
