import { describe, expect, it } from 'vitest';
import {
  buildProximityPayload,
  pendingByRunOrder,
  resolveRecipients,
  type ProximityEntryRow,
  type WatcherRow,
} from './runProximity';

function row(overrides: Partial<ProximityEntryRow> & { id: string }): ProximityEntryRow {
  return {
    dog_id: `dog-${overrides.id}`,
    armband: null,
    run_order: null,
    is_scored: false,
    check_in_status: 'checked-in',
    ...overrides,
  };
}

function watcher(overrides: Partial<WatcherRow> & { authUserId: string }): WatcherRow {
  return {
    dogIds: new Set<string>(),
    favoriteArmbands: new Set<number>(),
    leadDogs: 3,
    ...overrides,
  };
}

describe('pendingByRunOrder', () => {
  it('orders by run_order and reports dogs-ahead from zero', () => {
    const pending = pendingByRunOrder([
      row({ id: 'c', run_order: 3 }),
      row({ id: 'a', run_order: 1 }),
      row({ id: 'b', run_order: 2 }),
    ]);

    expect(pending.map(p => [p.entryId, p.dogsAhead])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
  });

  it('falls back to armband when run_order is null or zero', () => {
    const pending = pendingByRunOrder([
      row({ id: 'high', run_order: null, armband: 50 }),
      row({ id: 'low', run_order: 0, armband: 10 }),
    ]);

    expect(pending.map(p => p.entryId)).toEqual(['low', 'high']);
  });

  it('EXCLUDES the in-ring dog so the next dog reads "You\'re next" (INTENT)', () => {
    const pending = pendingByRunOrder([
      row({ id: 'running', run_order: 1, check_in_status: 'in-ring' }),
      row({ id: 'next', run_order: 2 }),
    ]);

    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ entryId: 'next', dogsAhead: 0 });
  });

  it('excludes scored and pulled entries from the queue', () => {
    const pending = pendingByRunOrder([
      row({ id: 'done', run_order: 1, is_scored: true }),
      row({ id: 'pulled', run_order: 2, check_in_status: 'pulled' }),
      row({ id: 'waiting', run_order: 3 }),
    ]);

    expect(pending.map(p => p.entryId)).toEqual(['waiting']);
    expect(pending[0].dogsAhead).toBe(0);
  });

  it('does not mutate the caller array', () => {
    const entries = [row({ id: 'b', run_order: 2 }), row({ id: 'a', run_order: 1 })];
    pendingByRunOrder(entries);
    expect(entries.map(e => e.id)).toEqual(['b', 'a']);
  });
});

describe('resolveRecipients', () => {
  const pending = pendingByRunOrder([
    row({ id: 'e1', dog_id: 'dog-1', run_order: 1, armband: 11 }),
    row({ id: 'e2', dog_id: 'dog-2', run_order: 2, armband: 22 }),
    row({ id: 'e3', dog_id: 'dog-3', run_order: 3, armband: 33 }),
    row({ id: 'e4', dog_id: 'dog-4', run_order: 4, armband: 44 }),
  ]);

  it('notifies an owner within their own lead-dogs threshold', () => {
    const result = resolveRecipients(pending, [
      watcher({ authUserId: 'u1', dogIds: new Set(['dog-2']), leadDogs: 3 }),
    ]);

    expect(result).toEqual([{ authUserId: 'u1', entryId: 'e2', dogsAhead: 1 }]);
  });

  it('respects each watcher\'s OWN threshold', () => {
    const near = watcher({ authUserId: 'near', dogIds: new Set(['dog-3']), leadDogs: 1 });
    const far = watcher({ authUserId: 'far', dogIds: new Set(['dog-3']), leadDogs: 5 });

    expect(resolveRecipients(pending, [near])).toEqual([]);
    expect(resolveRecipients(pending, [far])).toEqual([
      { authUserId: 'far', entryId: 'e3', dogsAhead: 2 },
    ]);
  });

  it('notifies a favoriter by armband even without ownership', () => {
    const result = resolveRecipients(pending, [
      watcher({ authUserId: 'fan', favoriteArmbands: new Set([11]) }),
    ]);

    expect(result).toEqual([{ authUserId: 'fan', entryId: 'e1', dogsAhead: 0 }]);
  });

  it('does not double-notify when a dog is both owned and favorited', () => {
    const result = resolveRecipients(pending, [
      watcher({
        authUserId: 'both',
        dogIds: new Set(['dog-1']),
        favoriteArmbands: new Set([11]),
      }),
    ]);

    expect(result).toEqual([{ authUserId: 'both', entryId: 'e1', dogsAhead: 0 }]);
  });

  it('returns nothing for an unwatched queue', () => {
    expect(resolveRecipients(pending, [watcher({ authUserId: 'nobody' })])).toEqual([]);
  });
});

describe('buildProximityPayload', () => {
  it('says "You\'re up!" at zero dogs ahead', () => {
    const payload = buildProximityPayload({
      dogName: 'Cooper',
      className: 'Excellent Interiors',
      dogsAhead: 0,
      armband: 314,
    });

    expect(payload.title).toBe("Cooper — You're up!");
    expect(payload.body).toBe('Your turn in Excellent Interiors');
    expect(payload.priority).toBe('urgent');
  });

  it('counts dogs away and appends the ring when known', () => {
    const payload = buildProximityPayload({
      dogName: 'Cooper',
      className: 'Excellent Interiors',
      dogsAhead: 3,
      armband: 314,
      ringNumber: 2,
    });

    expect(payload.title).toBe('Cooper — 3 dogs away');
    expect(payload.body).toBe('3 dogs ahead in Excellent Interiors (Ring 2)');
  });

  it('carries the queue data through for the client handler', () => {
    const payload = buildProximityPayload({
      dogName: 'Cooper',
      className: 'Novice',
      dogsAhead: 2,
      armband: null,
    });

    expect(payload.data).toEqual({
      dogName: 'Cooper',
      className: 'Novice',
      dogsAhead: 2,
      armband: null,
      ringNumber: null,
    });
  });
});
