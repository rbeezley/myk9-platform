import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bulkGet: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/services/database/connection', () => ({
  db: { instance: { people: { bulkGet: mocks.bulkGet } } },
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mocks.from },
}));

import { loadHandlerPeople } from './handlerHydration';

describe('loadHandlerPeople offline boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bulkGet.mockResolvedValue([]);
  });

  it('returns cached identities without starting the online read offline', async () => {
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    mocks.bulkGet.mockResolvedValue([
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
    mocks.bulkGet.mockResolvedValue([
      { id: 'handler-1', first_name: 'Cached', last_name: 'Handler' },
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
});
