import { describe, it, expect } from 'vitest';
import { PRESET_CONFIGS, resolvePreset } from '../visibility-presets';
import type { VisibilityPreset } from '../visibility-types';

describe('PRESET_CONFIGS', () => {
  it('defines all three presets', () => {
    expect(Object.keys(PRESET_CONFIGS)).toEqual(['open', 'standard', 'review']);
  });

  it('open preset: placement is class_complete, others immediate', () => {
    const open = PRESET_CONFIGS.open;
    expect(open.placement).toBe('class_complete');
    expect(open.qualification).toBe('immediate');
    expect(open.time).toBe('immediate');
    expect(open.faults).toBe('immediate');
  });

  it('standard preset: qualification immediate, others class_complete', () => {
    const std = PRESET_CONFIGS.standard;
    expect(std.placement).toBe('class_complete');
    expect(std.qualification).toBe('immediate');
    expect(std.time).toBe('class_complete');
    expect(std.faults).toBe('class_complete');
  });

  it('review preset: all manual_release', () => {
    const rev = PRESET_CONFIGS.review;
    expect(rev.placement).toBe('manual_release');
    expect(rev.qualification).toBe('manual_release');
    expect(rev.time).toBe('manual_release');
    expect(rev.faults).toBe('manual_release');
  });
});

describe('resolvePreset', () => {
  it('returns correct settings with inheritedFrom and preset', () => {
    const result = resolvePreset('open', 'trial');
    expect(result.inheritedFrom).toBe('trial');
    expect(result.preset).toBe('open');
    expect(result.placement).toBe('class_complete');
  });

  it.each<VisibilityPreset>(['open', 'standard', 'review'])(
    'never sets placement to immediate for %s',
    preset => {
      const result = resolvePreset(preset, 'show');
      expect(result.placement).not.toBe('immediate');
    }
  );
});
