import { describe, it, expect } from 'vitest';
import { resolveVisibilityCascade } from '../visibility-cascade';
import type { VisibilitySettings, VisibilityOverride } from '../visibility-types';

const showDefaults: VisibilitySettings = {
  placement: 'class_complete',
  qualification: 'immediate',
  time: 'class_complete',
  faults: 'class_complete',
  preset: 'standard',
  inheritedFrom: 'show',
};

describe('resolveVisibilityCascade', () => {
  it('returns show defaults when no overrides', () => {
    const result = resolveVisibilityCascade(showDefaults);
    expect(result.placement).toBe('class_complete');
    expect(result.qualification).toBe('immediate');
    expect(result.inheritedFrom).toBe('show');
  });

  it('applies trial override fields, inherits rest from show', () => {
    const trialOverride: VisibilityOverride = {
      time: 'immediate',
    };
    const result = resolveVisibilityCascade(showDefaults, trialOverride);
    expect(result.time).toBe('immediate');
    expect(result.placement).toBe('class_complete');
    expect(result.inheritedFrom).toBe('trial');
  });

  it('class override takes highest precedence', () => {
    const trialOverride: VisibilityOverride = { time: 'immediate' };
    const classOverride: VisibilityOverride = { faults: 'manual_release' };
    const result = resolveVisibilityCascade(showDefaults, trialOverride, classOverride);
    expect(result.faults).toBe('manual_release');
    expect(result.time).toBe('immediate');
    expect(result.placement).toBe('class_complete');
    expect(result.inheritedFrom).toBe('class');
  });

  it('preset override applies all preset fields as base', () => {
    const trialOverride: VisibilityOverride = { preset: 'review' };
    const result = resolveVisibilityCascade(showDefaults, trialOverride);
    expect(result.placement).toBe('manual_release');
    expect(result.qualification).toBe('manual_release');
    expect(result.preset).toBe('review');
  });

  it('per-field overrides win over preset at same level', () => {
    const trialOverride: VisibilityOverride = {
      preset: 'review',
      qualification: 'immediate',
    };
    const result = resolveVisibilityCascade(showDefaults, trialOverride);
    expect(result.qualification).toBe('immediate');
    expect(result.placement).toBe('manual_release');
  });

  it('all-null override means full inherit from parent', () => {
    const emptyOverride: VisibilityOverride = {};
    const result = resolveVisibilityCascade(showDefaults, emptyOverride);
    expect(result).toEqual(
      expect.objectContaining({
        placement: 'class_complete',
        qualification: 'immediate',
        time: 'class_complete',
        faults: 'class_complete',
      })
    );
  });

  it('null fields in override are skipped (inherit from parent)', () => {
    const trialOverride: VisibilityOverride = {
      placement: null,
      qualification: 'manual_release',
      time: null,
      faults: null,
    };
    const result = resolveVisibilityCascade(showDefaults, trialOverride);
    expect(result.qualification).toBe('manual_release');
    expect(result.placement).toBe('class_complete');
  });
});
