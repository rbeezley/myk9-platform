import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: mocks.from } }));

import { db } from '@/services/database/connection';
import {
  getHandlerPeopleHydrationRevision,
  loadHandlerPeople,
  resetHandlerHydrationCircuit,
  settleHandlerPeopleHydration,
  type HandlerPersonRow,
} from './handlerHydration';

// MYK9-743: a one-shot print waits for a refresh that missed the fast window.
describe('settleHandlerPeopleHydration', () => {
  const originalOnline = navigator.onLine;

  beforeEach(() => {
    vi.clearAllMocks();
    resetHandlerHydrationCircuit();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.spyOn(db.instance.people, 'bulkGet').mockResolvedValue([]);
    vi.spyOn(db.instance.people, 'bulkPut').mockResolvedValue('handler-1');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnline });
  });

  it('resolves immediately when nothing is deferred', async () => {
    await expect(settleHandlerPeopleHydration()).resolves.toBeUndefined();
  });

  it('waits for a deferred refresh to persist and advance the revision', async () => {
    let respond!: (value: { data: HandlerPersonRow[]; error: null }) => void;
    const slow = new Promise<{ data: HandlerPersonRow[]; error: null }>(resolve => {
      respond = resolve;
    });
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue(slow) }),
    });

    const revision = getHandlerPeopleHydrationRevision();
    // The fast window elapses: the caller gets the (empty) cache.
    await expect(loadHandlerPeople(['handler-1'])).resolves.toEqual(new Map());

    let settled = false;
    const settling = settleHandlerPeopleHydration().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    respond({ data: [{ id: 'handler-1', first_name: 'Jamie', last_name: 'Walker' }], error: null });
    await settling;
    expect(getHandlerPeopleHydrationRevision()).toBe(revision + 1);
    expect(db.instance.people.bulkPut).toHaveBeenCalledWith([
      { id: 'handler-1', firstName: 'Jamie', lastName: 'Walker' },
    ]);
  });
});
