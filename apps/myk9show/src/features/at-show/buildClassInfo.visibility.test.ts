/**
 * Phase 1h — buildClassInfo surfaces the replicated visibility-cascade values
 * (self-check-in + visibility preset) onto the ringside ClassInfo, with safe
 * fallbacks when a class row hasn't been enriched yet.
 */

import { describe, it, expect } from 'vitest';
import { buildClassInfo, transformEntry } from './atShowDataAdapter';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

function makeClass(overrides: Partial<ReplicatedClass> = {}): ReplicatedClass {
  return { id: 'class-1', name: 'Container Novice A', ...overrides };
}

describe('buildClassInfo — visibility', () => {
  it('maps the replicated self-check-in + visibility preset onto ClassInfo', () => {
    const info = buildClassInfo(
      makeClass({ selfCheckinEnabled: false, visibilityPreset: 'review' }),
      null,
      []
    );
    expect(info.selfCheckin).toBe(false);
    expect(info.visibilityPreset).toBe('review');
  });

  it('passes through an enabled check-in + open preset', () => {
    const info = buildClassInfo(
      makeClass({ selfCheckinEnabled: true, visibilityPreset: 'open' }),
      null,
      []
    );
    expect(info.selfCheckin).toBe(true);
    expect(info.visibilityPreset).toBe('open');
  });

  it('falls back to enabled / standard when the row is not yet enriched', () => {
    const info = buildClassInfo(makeClass(), null, []);
    expect(info.selfCheckin).toBe(true);
    expect(info.visibilityPreset).toBe('standard');
  });

  it('maps the server release and class timing fields used by the podium gate', () => {
    const info = buildClassInfo(
      makeClass({
        isScoringFinalized: true,
        resultsReleasedAt: '2026-07-24T16:00:00.000Z',
        actual_start_time: '2026-07-24T15:15:00.000Z',
        actual_end_time: '2026-07-24T16:00:00.000Z',
      }),
      null,
      []
    );

    expect(info.isScoringFinalized).toBe(true);
    expect(info.resultsReleasedAt).toBe('2026-07-24T16:00:00.000Z');
    expect(info.actualStartTime).toBe('2026-07-24T15:15:00.000Z');
    expect(info.actualEndTime).toBe('2026-07-24T16:00:00.000Z');
  });

  it('maps entry scoring and ring timestamps for the offline elapsed-time fallback', () => {
    const entry = transformEntry(
      {
        id: 'entry-1',
        scoringCompletedAt: '2026-07-24T15:59:00.000Z',
        ring_entry_time: '2026-07-24T15:57:00.000Z',
        ring_exit_time: '2026-07-24T16:00:00.000Z',
      } as ReplicatedEntry,
      makeClass()
    );

    expect(entry.scoredAt).toBe('2026-07-24T15:59:00.000Z');
    expect(entry.ringEntryTime).toBe('2026-07-24T15:57:00.000Z');
    expect(entry.ringExitTime).toBe('2026-07-24T16:00:00.000Z');
  });
});

describe('buildClassInfo — hides/distractions (R4)', () => {
  it('maps hidesKnown + distractionCount onto ClassInfo', () => {
    const info = buildClassInfo(makeClass({ hidesKnown: true, distractionCount: 3 }), null, []);
    expect(info.hidesKnown).toBe(true);
    expect(info.distractionCount).toBe(3);
  });

  it('maps hidesKnown: false and distractionCount: 0 without dropping falsy values', () => {
    const info = buildClassInfo(makeClass({ hidesKnown: false, distractionCount: 0 }), null, []);
    expect(info.hidesKnown).toBe(false);
    expect(info.distractionCount).toBe(0);
  });

  it('omits both fields when the class row has not been enriched yet', () => {
    const info = buildClassInfo(makeClass(), null, []);
    expect(info.hidesKnown).toBeUndefined();
    expect(info.distractionCount).toBeUndefined();
  });
});
