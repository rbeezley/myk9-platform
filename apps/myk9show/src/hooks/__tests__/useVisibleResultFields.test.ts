import { resolveVisibilityCascade, getVisibleResultFields, PRESET_CONFIGS } from '@myk9/secretary';
import type { VisibilitySettings } from '@myk9/secretary';
import { deriveClassState } from '../useVisibleResultFields';

describe('resolveVisibilityCascade', () => {
  const showDefaults: VisibilitySettings = {
    ...PRESET_CONFIGS.open,
    inheritedFrom: 'show',
    preset: 'open',
  };

  it('returns show defaults when no overrides', () => {
    const result = resolveVisibilityCascade(showDefaults);
    expect(result.qualification).toBe('immediate');
    expect(result.placement).toBe('class_complete');
  });

  it('applies trial override over show default', () => {
    const result = resolveVisibilityCascade(showDefaults, { preset: 'review' });
    expect(result.qualification).toBe('manual_release');
    expect(result.inheritedFrom).toBe('trial');
  });

  it('applies class override over trial override', () => {
    const result = resolveVisibilityCascade(showDefaults, { preset: 'review' }, { preset: 'open' });
    expect(result.qualification).toBe('immediate');
    expect(result.inheritedFrom).toBe('class');
  });

  it('per-field override wins over preset at same level', () => {
    const result = resolveVisibilityCascade(showDefaults, {
      preset: 'review',
      qualification: 'immediate',
    });
    expect(result.qualification).toBe('immediate');
    expect(result.time).toBe('manual_release');
  });

  it('null override fields inherit from parent', () => {
    const result = resolveVisibilityCascade(showDefaults, {
      qualification: 'class_complete',
    });
    expect(result.qualification).toBe('class_complete');
    expect(result.time).toBe('immediate');
  });
});

describe('getVisibleResultFields', () => {
  const reviewSettings: VisibilitySettings = {
    ...PRESET_CONFIGS.review,
    inheritedFrom: 'show',
    preset: 'review',
  };
  const openSettings: VisibilitySettings = {
    ...PRESET_CONFIGS.open,
    inheritedFrom: 'show',
    preset: 'open',
  };

  it('judges always see everything', () => {
    const result = getVisibleResultFields(reviewSettings, 'in_progress', 'judge');
    expect(result.showPlacement).toBe(true);
    expect(result.showQualification).toBe(true);
    expect(result.showTime).toBe(true);
    expect(result.showFaults).toBe(true);
  });

  it('admins always see everything', () => {
    const result = getVisibleResultFields(reviewSettings, 'in_progress', 'admin');
    expect(result).toEqual({
      showPlacement: true,
      showQualification: true,
      showTime: true,
      showFaults: true,
    });
  });

  it('exhibitor sees nothing in review mode when in_progress', () => {
    const result = getVisibleResultFields(reviewSettings, 'in_progress', 'exhibitor');
    expect(result.showPlacement).toBe(false);
    expect(result.showQualification).toBe(false);
    expect(result.showTime).toBe(false);
    expect(result.showFaults).toBe(false);
  });

  it('exhibitor sees Q/NQ immediately in open mode', () => {
    const result = getVisibleResultFields(openSettings, 'in_progress', 'exhibitor');
    expect(result.showQualification).toBe(true);
    expect(result.showTime).toBe(true);
    expect(result.showFaults).toBe(true);
    expect(result.showPlacement).toBe(false);
  });

  it('exhibitor sees placement when class completed in open mode', () => {
    const result = getVisibleResultFields(openSettings, 'completed', 'exhibitor');
    expect(result.showPlacement).toBe(true);
  });

  it('exhibitor sees everything when class released in review mode', () => {
    const result = getVisibleResultFields(reviewSettings, 'released', 'exhibitor');
    expect(result).toEqual({
      showPlacement: true,
      showQualification: true,
      showTime: true,
      showFaults: true,
    });
  });
});

describe('deriveClassState', () => {
  it('returns released when resultsReleasedAt is set', () => {
    expect(deriveClassState('completed', '2026-03-28T12:00:00Z')).toBe('released');
  });

  it('returns completed when status is completed and not released', () => {
    expect(deriveClassState('completed', null)).toBe('completed');
  });

  it('returns completed for capitalized Completed', () => {
    expect(deriveClassState('Completed', null)).toBe('completed');
  });

  it('returns in_progress for other statuses', () => {
    expect(deriveClassState('in_progress', null)).toBe('in_progress');
    expect(deriveClassState('Scheduled', null)).toBe('in_progress');
    expect(deriveClassState(undefined, null)).toBe('in_progress');
  });

  it('released takes priority over any status', () => {
    expect(deriveClassState('in_progress', '2026-03-28T12:00:00Z')).toBe('released');
  });
});
