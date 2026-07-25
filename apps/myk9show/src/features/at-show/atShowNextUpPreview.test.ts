import { describe, it, expect } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import {
  buildNextUpPreview,
  isEmptyNextUpPreview,
  isLiveNextUpStatus,
  selectNextUpForCard,
  type AtShowNextUpPreview,
} from './atShowNextUpPreview';

function entry(partial: Partial<ReplicatedEntry> & { id: string }): ReplicatedEntry {
  return partial as ReplicatedEntry;
}

describe('buildNextUpPreview', () => {
  it('reports the in-ring dog and the next three waiting armbands in run order', () => {
    const preview = buildNextUpPreview([
      entry({ id: 'c', armband: '30', runOrder: 3 }),
      entry({ id: 'a', armband: '10', runOrder: 1, isInRing: true }),
      entry({ id: 'b', armband: '20', runOrder: 2 }),
      entry({ id: 'd', armband: '40', runOrder: 4 }),
      entry({ id: 'e', armband: '50', runOrder: 5 }),
    ]);

    expect(preview.inRingArmband).toBe('10');
    expect(preview.nextArmbands).toEqual(['20', '30', '40']);
  });

  it('excludes the in-ring dog from the waiting queue (INTENT 2026-06-11)', () => {
    const preview = buildNextUpPreview([
      entry({ id: 'a', armband: '10', runOrder: 1, isInRing: true }),
      entry({ id: 'b', armband: '20', runOrder: 2 }),
    ]);

    expect(preview.nextArmbands).toEqual(['20']);
  });

  it('counts the in-ring dog as remaining and scored dogs toward the total', () => {
    const preview = buildNextUpPreview([
      entry({ id: 'a', armband: '10', runOrder: 1, isScored: true }),
      entry({ id: 'b', armband: '20', runOrder: 2, isInRing: true }),
      entry({ id: 'c', armband: '30', runOrder: 3 }),
      entry({ id: 'd', armband: '40', runOrder: 4 }),
    ]);

    expect(preview.remaining).toBe(3);
    expect(preview.total).toBe(4);
  });

  it('omits pulled entries from the queue and the counts', () => {
    const preview = buildNextUpPreview([
      entry({ id: 'a', armband: '10', runOrder: 1 }),
      entry({ id: 'b', armband: '20', runOrder: 2, status: 'pulled' }),
    ]);

    expect(preview.nextArmbands).toEqual(['10']);
    expect(preview.remaining).toBe(1);
    expect(preview.total).toBe(1);
  });

  it('reads the snake_case aliases and falls back to armbandNumber', () => {
    const preview = buildNextUpPreview([
      entry({ id: 'a', armbandNumber: '11', runOrder: 1, is_in_ring: true }),
      entry({ id: 'b', armbandNumber: '22', runOrder: 2 }),
    ]);

    expect(preview.inRingArmband).toBe('11');
    expect(preview.nextArmbands).toEqual(['22']);
  });

  it('drops entries with no usable armband from the preview list', () => {
    const preview = buildNextUpPreview([
      entry({ id: 'a', armband: '  ', runOrder: 1 }),
      entry({ id: 'b', armband: '20', runOrder: 2 }),
    ]);

    expect(preview.nextArmbands).toEqual(['20']);
    // Still counted as remaining — it is a real dog, just missing an armband.
    expect(preview.remaining).toBe(2);
  });

  it('returns an empty preview for a class with no entries', () => {
    const preview = buildNextUpPreview([]);
    expect(preview).toEqual({ inRingArmband: null, nextArmbands: [], remaining: 0, total: 0 });
    expect(isEmptyNextUpPreview(preview)).toBe(true);
  });
});

describe('isLiveNextUpStatus', () => {
  it('shows the line only for live statuses', () => {
    expect(isLiveNextUpStatus('briefing')).toBe(true);
    expect(isLiveNextUpStatus('in-progress')).toBe(true);
    expect(isLiveNextUpStatus('offline-scoring')).toBe(true);
    expect(isLiveNextUpStatus('no-status')).toBe(false);
    expect(isLiveNextUpStatus('start_time')).toBe(false);
    expect(isLiveNextUpStatus('completed')).toBe(false);
    expect(isLiveNextUpStatus('setup')).toBe(false);
    expect(isLiveNextUpStatus('break')).toBe(false);
  });
});

describe('selectNextUpForCard', () => {
  const idle: AtShowNextUpPreview = {
    inRingArmband: null,
    nextArmbands: [],
    remaining: 2,
    total: 2,
  };
  const waiting: AtShowNextUpPreview = {
    inRingArmband: null,
    nextArmbands: ['7'],
    remaining: 1,
    total: 3,
  };
  const running: AtShowNextUpPreview = {
    inRingArmband: '5',
    nextArmbands: ['9'],
    remaining: 2,
    total: 4,
  };

  it('prefers the paired class that actually has a dog in the ring', () => {
    const map = new Map([
      ['a', waiting],
      ['b', running],
    ]);
    expect(selectNextUpForCard(['a', 'b'], map)).toBe(running);
  });

  it('falls back to the first class with dogs waiting', () => {
    const map = new Map([
      ['a', idle],
      ['b', waiting],
    ]);
    expect(selectNextUpForCard(['a', 'b'], map)).toBe(waiting);
  });

  it('falls back to the first known preview so counts still render', () => {
    const map = new Map([['a', idle]]);
    expect(selectNextUpForCard(['a', 'b'], map)).toBe(idle);
  });

  it('returns undefined when no class id is known', () => {
    expect(selectNextUpForCard(['zz'], new Map())).toBeUndefined();
    expect(isEmptyNextUpPreview(undefined)).toBe(true);
  });
});
