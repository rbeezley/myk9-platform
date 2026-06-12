/**
 * Tests for detectMyRingConflicts — the exhibitor ring-conflict detector.
 *
 * Definition under test: ≥2 of MY entries near the front simultaneously in
 * DIFFERENT in-progress classes; "near" = in-ring or within leadDogs of going
 * in (in-ring dog excluded from counts, matching the dogs-ahead pill).
 */

import { describe, expect, it } from 'vitest';
import {
  detectMyRingConflicts,
  type RingConflictClass,
  type RingConflictEntry,
} from './ringConflicts';

function entry(overrides: Partial<RingConflictEntry> & { id: string }): RingConflictEntry {
  return {
    classId: 'class-a',
    armband: '1',
    isScored: false,
    dogCallName: 'Ditto',
    ...overrides,
  };
}

const classes: RingConflictClass[] = [
  { classId: 'class-a', className: 'Container Novice', inProgress: true },
  { classId: 'class-b', className: 'Buried Master', inProgress: true },
  { classId: 'class-c', className: 'Interior Excellent', inProgress: false },
];

// Ditto is 1 away in Container Novice; Sparky is next in Buried Master.
const conflictingEntries: RingConflictEntry[] = [
  entry({ id: 'a1', classId: 'class-a', runOrder: 1, dogCallName: 'Other Dog' }),
  entry({ id: 'a2', classId: 'class-a', runOrder: 2, dogCallName: 'Ditto' }),
  entry({ id: 'b1', classId: 'class-b', runOrder: 1, dogCallName: 'Sparky' }),
  entry({ id: 'b2', classId: 'class-b', runOrder: 2, dogCallName: 'Another Dog' }),
];

describe('detectMyRingConflicts', () => {
  it('annotates BOTH involved entries, each describing the other class', () => {
    const conflicts = detectMyRingConflicts({
      entries: conflictingEntries,
      classes,
      ownEntryIds: new Set(['a2', 'b1']),
      leadDogs: 3,
    });
    expect(conflicts.get('a2')).toBe('Sparky next in Buried Master');
    expect(conflicts.get('b1')).toBe('Ditto 1 away in Container Novice');
  });

  it('returns nothing when only one of my entries is near up', () => {
    const conflicts = detectMyRingConflicts({
      entries: conflictingEntries,
      classes,
      ownEntryIds: new Set(['a2']),
      leadDogs: 3,
    });
    expect(conflicts.size).toBe(0);
  });

  it('honors the leadDogs threshold inclusively', () => {
    const farEntries: RingConflictEntry[] = [
      entry({ id: 'a1', classId: 'class-a', runOrder: 1 }),
      entry({ id: 'a2', classId: 'class-a', runOrder: 2, dogCallName: 'Ditto' }), // 1 away
      entry({ id: 'b1', classId: 'class-b', runOrder: 1 }),
      entry({ id: 'b2', classId: 'class-b', runOrder: 2 }),
      entry({ id: 'b3', classId: 'class-b', runOrder: 3, dogCallName: 'Sparky' }), // 2 away
    ];
    const at2 = detectMyRingConflicts({
      entries: farEntries,
      classes,
      ownEntryIds: new Set(['a2', 'b3']),
      leadDogs: 2,
    });
    expect(at2.size).toBe(2);

    const at1 = detectMyRingConflicts({
      entries: farEntries,
      classes,
      ownEntryIds: new Set(['a2', 'b3']),
      leadDogs: 1,
    });
    expect(at1.size).toBe(0); // Sparky at 2 away is outside leadDogs=1
  });

  it('counts an in-ring own entry as near up', () => {
    const inRingEntries: RingConflictEntry[] = [
      entry({ id: 'a1', classId: 'class-a', runOrder: 1, checkInStatus: 'in-ring' }),
      entry({ id: 'b1', classId: 'class-b', runOrder: 1, dogCallName: 'Sparky' }),
    ];
    const conflicts = detectMyRingConflicts({
      entries: inRingEntries,
      classes,
      ownEntryIds: new Set(['a1', 'b1']),
      leadDogs: 3,
    });
    expect(conflicts.get('b1')).toBe('Ditto in the ring in Container Novice');
  });

  it('ignores classes that are not in progress', () => {
    const withInactive: RingConflictEntry[] = [
      entry({ id: 'a2', classId: 'class-a', runOrder: 1, dogCallName: 'Ditto' }),
      entry({ id: 'c1', classId: 'class-c', runOrder: 1, dogCallName: 'Sparky' }),
    ];
    const conflicts = detectMyRingConflicts({
      entries: withInactive,
      classes,
      ownEntryIds: new Set(['a2', 'c1']),
      leadDogs: 3,
    });
    expect(conflicts.size).toBe(0);
  });

  it('ignores scored and pulled entries', () => {
    const settled: RingConflictEntry[] = [
      entry({ id: 'a2', classId: 'class-a', runOrder: 1, isScored: true }),
      entry({ id: 'b1', classId: 'class-b', runOrder: 1, checkInStatus: 'pulled' }),
      entry({ id: 'b2', classId: 'class-b', runOrder: 2 }),
    ];
    const conflicts = detectMyRingConflicts({
      entries: settled,
      classes,
      ownEntryIds: new Set(['a2', 'b1', 'b2']),
      leadDogs: 3,
    });
    expect(conflicts.size).toBe(0);
  });

  it('two near-up entries in the SAME class are not a conflict', () => {
    const sameClass: RingConflictEntry[] = [
      entry({ id: 'a1', classId: 'class-a', runOrder: 1, dogCallName: 'Ditto' }),
      entry({ id: 'a2', classId: 'class-a', runOrder: 2, dogCallName: 'Sparky' }),
    ];
    const conflicts = detectMyRingConflicts({
      entries: sameClass,
      classes,
      ownEntryIds: new Set(['a1', 'a2']),
      leadDogs: 3,
    });
    expect(conflicts.size).toBe(0);
  });

  it('joins labels for three-way conflicts', () => {
    const threeWay: RingConflictClass[] = [
      ...classes,
      { classId: 'class-d', className: 'Exterior Advanced', inProgress: true },
    ];
    const entries3: RingConflictEntry[] = [
      entry({ id: 'a1', classId: 'class-a', runOrder: 1, dogCallName: 'Ditto' }),
      entry({ id: 'b1', classId: 'class-b', runOrder: 1, dogCallName: 'Sparky' }),
      entry({ id: 'd1', classId: 'class-d', runOrder: 1, dogCallName: 'Rex' }),
    ];
    const conflicts = detectMyRingConflicts({
      entries: entries3,
      classes: threeWay,
      ownEntryIds: new Set(['a1', 'b1', 'd1']),
      leadDogs: 3,
    });
    expect(conflicts.get('a1')).toBe('Sparky next in Buried Master · Rex next in Exterior Advanced');
  });

  it('returns empty for empty ownership without touching the data', () => {
    const conflicts = detectMyRingConflicts({
      entries: conflictingEntries,
      classes,
      ownEntryIds: new Set(),
      leadDogs: 3,
    });
    expect(conflicts.size).toBe(0);
  });
});
