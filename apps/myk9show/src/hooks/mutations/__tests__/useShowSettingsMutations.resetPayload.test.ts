import { describe, it, expect } from 'vitest';
import { buildResetPayload } from '../useShowSettingsMutations';

/**
 * Assertion-first guard on the reset payload. The whole point of facet-scoped reset
 * is that clearing one facet must NOT touch the other's columns — and on a PostgREST
 * upsert that means OMITTING the columns, not writing null. These tests pin the exact
 * key set per facet so a regression that re-introduces `self_checkin_enabled: null`
 * into a visibility reset (silently re-coupling the facets) fails loudly.
 */
describe('buildResetPayload', () => {
  const base = { entityId: 'trial-1', userId: 'user-1', timestamp: '2026-06-27T00:00:00.000Z' };

  it('visibility reset nulls only preset + timing columns and OMITS check-in', () => {
    const payload = buildResetPayload({ ...base, level: 'trial', facet: 'visibility' });
    expect(payload).toEqual({
      trial_id: 'trial-1',
      preset: null,
      placement_timing: null,
      qualification_timing: null,
      time_timing: null,
      faults_timing: null,
      updated_by: 'user-1',
      updated_at: '2026-06-27T00:00:00.000Z',
    });
    expect('self_checkin_enabled' in payload).toBe(false);
  });

  it('check-in reset nulls only self_checkin_enabled and OMITS visibility columns', () => {
    const payload = buildResetPayload({ ...base, level: 'class', facet: 'checkin' });
    expect(payload).toEqual({
      class_id: 'trial-1',
      self_checkin_enabled: null,
      updated_by: 'user-1',
      updated_at: '2026-06-27T00:00:00.000Z',
    });
    expect('preset' in payload).toBe(false);
    expect('placement_timing' in payload).toBe(false);
  });

  it('all reset (default behavior) nulls every override column', () => {
    const payload = buildResetPayload({ ...base, level: 'trial', facet: 'all' });
    expect(payload).toEqual({
      trial_id: 'trial-1',
      preset: null,
      placement_timing: null,
      qualification_timing: null,
      time_timing: null,
      faults_timing: null,
      self_checkin_enabled: null,
      updated_by: 'user-1',
      updated_at: '2026-06-27T00:00:00.000Z',
    });
  });

  it('uses class_id for class level and trial_id for trial level', () => {
    expect(buildResetPayload({ ...base, level: 'class', facet: 'all' })).toHaveProperty('class_id');
    expect(buildResetPayload({ ...base, level: 'trial', facet: 'all' })).toHaveProperty('trial_id');
  });
});
