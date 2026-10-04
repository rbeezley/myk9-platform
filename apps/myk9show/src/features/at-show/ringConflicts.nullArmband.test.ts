/**
 * MYK9-977 — ring-conflict detection must carry a missing armband as null.
 * `toQueueEntry` used to write `Number(armband) || 0`, so every dog without an
 * armband became "armband 0" and looked like the same competitor to the queue.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Entry } from '@myk9/ringside';

const seen = vi.hoisted(() => ({ queues: [] as Array<Array<{ id: string; armband: unknown }>> }));

vi.mock('@myk9/ringside', async importOriginal => {
  const actual = await importOriginal<typeof import('@myk9/ringside')>();
  return {
    ...actual,
    computeDogsAheadInList: (entries: Entry[], entryId: string) => {
      seen.queues.push(entries.map(e => ({ id: e.id, armband: e.armband })));
      return actual.computeDogsAheadInList(entries, entryId);
    },
  };
});

import { detectMyRingConflicts, type RingConflictEntry } from './ringConflicts';

const classes = [
  { classId: 'class-a', className: 'Container Novice', inProgress: true },
  { classId: 'class-b', className: 'Buried Master', inProgress: true },
];

function row(id: string, classId: string, armband: string | undefined): RingConflictEntry {
  return {
    id,
    classId,
    isScored: false,
    dogCallName: id,
    ...(armband !== undefined && { armband }),
  };
}

describe('detectMyRingConflicts — entries without an armband (MYK9-977)', () => {
  it('hands the queue null armbands, never 0', () => {
    seen.queues.length = 0;
    detectMyRingConflicts({
      entries: [
        row('a1', 'class-a', undefined),
        row('a2', 'class-a', ''),
        row('b1', 'class-b', undefined),
        row('b2', 'class-b', '7'),
      ],
      classes,
      ownEntryIds: new Set(['a2', 'b1']),
      leadDogs: 3,
    });

    const byId = new Map(seen.queues.flat().map(e => [e.id, e.armband]));
    expect(byId.get('a1')).toBeNull();
    expect(byId.get('a2')).toBeNull();
    expect(byId.get('b1')).toBeNull();
    expect(byId.get('b2')).toBe(7);
  });

  it('still tells two armband-less dogs apart by id (not as one competitor "0")', () => {
    const conflicts = detectMyRingConflicts({
      entries: [
        row('a1', 'class-a', undefined),
        row('a2', 'class-a', undefined),
        row('b1', 'class-b', undefined),
      ],
      classes,
      ownEntryIds: new Set(['a2', 'b1']),
      leadDogs: 3,
    });

    expect(conflicts.get('a2')).toBe('b1 next in Buried Master');
    expect(conflicts.get('b1')).toBe('a2 1 away in Container Novice');
  });
});
