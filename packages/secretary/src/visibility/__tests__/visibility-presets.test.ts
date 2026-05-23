import { describe, it, expect } from 'vitest';
import {
  PRESET_CONFIGS,
  PRESET_INFO,
  detectPreset,
  fieldTimingsFromVisibility,
  hasVisibilityOverride,
  resolvePreset,
} from '../visibility-presets';
import type { FieldTimings, VisibilityOverride, VisibilityPreset } from '../visibility-types';

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

describe('PRESET_INFO', () => {
  it.each<VisibilityPreset>(['open', 'standard', 'review'])(
    'defines display metadata for %s',
    preset => {
      expect(PRESET_INFO[preset]).toMatchObject({ preset });
      expect(PRESET_INFO[preset].title).not.toBe('');
      expect(PRESET_INFO[preset].description).not.toBe('');
      expect(PRESET_INFO[preset].details).not.toBe('');
    }
  );
});

describe('fieldTimingsFromVisibility', () => {
  it('extracts only timing fields from a complete visibility setting', () => {
    const timings = fieldTimingsFromVisibility(resolvePreset('standard', 'class'));

    expect(timings).toEqual(PRESET_CONFIGS.standard);
  });
});

describe('detectPreset', () => {
  it.each<VisibilityPreset>(['open', 'standard', 'review'])(
    'detects %s timings',
    preset => {
      expect(detectPreset(PRESET_CONFIGS[preset])).toBe(preset);
    }
  );

  it('returns null for custom timings', () => {
    const customTimings: FieldTimings = {
      placement: 'manual_release',
      qualification: 'immediate',
      time: 'class_complete',
      faults: 'immediate',
    };

    expect(detectPreset(customTimings)).toBeNull();
  });
});

describe('hasVisibilityOverride', () => {
  it.each<VisibilityOverride>([
    { preset: 'open' },
    { placement: 'class_complete' },
    { qualification: 'immediate' },
    { time: 'manual_release' },
    { faults: 'class_complete' },
  ])('returns true when any override field is set: %o', override => {
    expect(hasVisibilityOverride(override)).toBe(true);
  });

  it.each<VisibilityOverride>([
    {},
    { preset: null, placement: null, qualification: null, time: null, faults: null },
    {
      preset: undefined,
      placement: undefined,
      qualification: undefined,
      time: undefined,
      faults: undefined,
    },
  ])('returns false when no override field is set: %o', override => {
    expect(hasVisibilityOverride(override)).toBe(false);
  });
});
