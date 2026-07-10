/**
 * Phase 1h — buildClassInfo surfaces the replicated visibility-cascade values
 * (self-check-in + visibility preset) onto the ringside ClassInfo, with safe
 * fallbacks when a class row hasn't been enriched yet.
 */

import { describe, it, expect } from 'vitest';
import { buildClassInfo } from './atShowDataAdapter';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';

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
