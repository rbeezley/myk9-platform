import { describe, it, expect } from 'vitest';
import { resolvePreset, type VisibilitySettings } from '@myk9/secretary';
import { resolveInheritedPresetLabel } from '../resultsControlUtils';

describe('resolveInheritedPresetLabel', () => {
  it('labels a trial inheriting straight from the show with the show preset title', () => {
    // standard → "After Class"
    expect(resolveInheritedPresetLabel(resolvePreset('standard', 'show'))).toBe('After Class');
    // open → "Immediately", review → "After Review"
    expect(resolveInheritedPresetLabel(resolvePreset('open', 'show'))).toBe('Immediately');
    expect(resolveInheritedPresetLabel(resolvePreset('review', 'show'))).toBe('After Review');
  });

  it("resolves a class's inherited label through the trial override when present", () => {
    // Show says standard, but the parent trial overrides to review → the class
    // (inheriting) resolves to the trial's "After Review".
    const label = resolveInheritedPresetLabel(resolvePreset('standard', 'show'), {
      preset: 'review',
    });
    expect(label).toBe('After Review');
  });

  it('falls through to the show preset when the trial override is empty', () => {
    // An all-null override contributes nothing — the class still inherits the show.
    const label = resolveInheritedPresetLabel(resolvePreset('open', 'show'), {});
    expect(label).toBe('Immediately');
  });

  it('reports "Custom" when the resolved timings match no named preset', () => {
    const custom: VisibilitySettings = {
      placement: 'manual_release',
      qualification: 'immediate',
      time: 'immediate',
      faults: 'immediate',
      inheritedFrom: 'show',
    };
    expect(resolveInheritedPresetLabel(custom)).toBe('Custom');
  });

  it('respects a per-field trial override that breaks the inherited preset', () => {
    // Show is a clean "standard"; the trial flips one field, so the class no
    // longer resolves to any named preset.
    const label = resolveInheritedPresetLabel(resolvePreset('standard', 'show'), {
      qualification: 'manual_release',
    });
    expect(label).toBe('Custom');
  });
});
