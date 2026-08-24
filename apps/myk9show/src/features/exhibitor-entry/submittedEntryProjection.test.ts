import { describe, expect, it } from 'vitest';
import {
  buildSubmittedEntryProjection,
  type SubmittedEntryProjectionRow,
} from './submittedEntryProjection';

function row(
  id: string,
  overrides: Partial<SubmittedEntryProjectionRow> = {}
): SubmittedEntryProjectionRow {
  return {
    id,
    dogId: 'owned-dog',
    classId: `class-${id}`,
    status: 'confirmed',
    checkInStatus: null,
    deletedAt: null,
    specialRequests: null,
    handlerId: null,
    ...overrides,
  };
}

describe('buildSubmittedEntryProjection', () => {
  it('separates active submitted entries from visible terminal history', () => {
    const projection = buildSubmittedEntryProjection({
      rows: [
        row('active'),
        row('withdrawn', { status: 'withdrawn' }),
        row('pulled', { checkInStatus: 'pulled' }),
        row('completed', { status: 'completed' }),
      ],
      ownedDogIds: new Set(['owned-dog']),
      state: 'ready',
    });

    expect(projection.ownedHistory.map(entry => entry.id)).toEqual([
      'active',
      'withdrawn',
      'pulled',
      'completed',
    ]);
    expect(projection.activeEntries.map(entry => entry.id)).toEqual(['active']);
    expect([...projection.activeClassIds]).toEqual(['class-active']);
    expect(projection.historyCount).toBe(4);
  });

  it('never exposes unowned or superseded move-up source rows, while retaining owned deleted history', () => {
    const projection = buildSubmittedEntryProjection({
      rows: [
        row('owned'),
        row('other', { dogId: 'other-dog' }),
        row('deleted', { deletedAt: '2026-07-10T12:00:00Z' }),
        row('moved', {
          status: 'moved',
          specialRequests: 'Moved up to Interior Excellent',
        }),
        row('destination', {
          classId: 'class-destination',
          specialRequests: 'Moved up from class class-moved',
        }),
      ],
      ownedDogIds: new Set(['owned-dog']),
      state: 'ready',
    });

    expect(projection.ownedHistory.map(entry => entry.id)).toEqual([
      'owned',
      'deleted',
      'destination',
    ]);
    expect(projection.activeEntries.map(entry => entry.id)).toEqual([
      'owned',
      'destination',
    ]);
    expect(projection.historyCount).toBe(3);
  });

  it.each(['loading', 'error'] as const)(
    'preserves the %s state instead of presenting a ready zero',
    state => {
      const projection = buildSubmittedEntryProjection({
        rows: [],
        ownedDogIds: new Set(['owned-dog']),
        state,
      });

      expect(projection.state).toBe(state);
      expect(projection.isReady).toBe(false);
    }
  );

  it('keeps an assigned handler entry visible when the handler does not own the dog', () => {
    const projection = buildSubmittedEntryProjection({
      rows: [row('handled', { dogId: 'other-dog', handlerId: 'handler-1' })],
      ownedDogIds: new Set<string>(),
      personId: 'handler-1',
      state: 'ready',
    });

    expect(projection.activeEntries.map(entry => entry.id)).toEqual(['handled']);
  });
});
