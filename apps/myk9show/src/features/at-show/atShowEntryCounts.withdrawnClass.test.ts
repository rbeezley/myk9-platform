/**
 * MYK9-976: Exterior Excellent on the Heartland demo show, as stored. One
 * pending entry (Juni) and two withdrawn-and-refunded entries (Ranger, Maple).
 * Ringside must count and group exactly what the class page and paper scoring
 * list: one runnable dog, the withdrawn pair under Not running.
 */
import { describe, expect, it } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import { toClassEntry } from './atShowClassListAdapter';
import { buildClassInfo, transformEntry } from './atShowDataAdapter';

const cls = { id: 'class-1', element: 'Exterior', level: 'Excellent' } as ReplicatedClass;

const base = { showId: 'show-1', classId: 'class-1', checkInStatus: 'no-status' };
const stored = [
  { ...base, id: 'maple', entryStatus: 'withdrawn', paymentStatus: 'refunded' },
  { ...base, id: 'ranger', entryStatus: 'withdrawn', paymentStatus: 'refunded' },
  { ...base, id: 'juni', armband: '102', entryStatus: 'submitted', paymentStatus: 'pending' },
] as ReplicatedEntry[];

describe('ringside reads the withdrawn-class fixture (MYK9-976)', () => {
  it('the class list card counts 1 entry, not 3', () => {
    const card = toClassEntry(cls, stored, new Set());

    expect(card.entry_count).toBe(1);
    expect(card.completed_count).toBe(0);
  });

  it('the class page counts 1 and puts only Juni in Pending', () => {
    const info = buildClassInfo(
      cls,
      null,
      stored.map(entry => transformEntry(entry, cls)),
      stored
    );

    expect(info.totalEntries).toBe(1);
    expect(info.statusCounts).toEqual({ pending: 1, completed: 0 });
    expect(info.entryClassification).toEqual({
      maple: 'not_running',
      ranger: 'not_running',
      juni: 'pending',
    });
  });
});
