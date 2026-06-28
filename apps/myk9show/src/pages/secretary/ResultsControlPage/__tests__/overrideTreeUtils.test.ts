import { describe, it, expect } from 'vitest';
import {
  resolveTrialVisibility,
  resolveTrialCheckin,
  resolveClassVisibility,
  resolveClassCheckin,
  countOverriddenClasses,
} from '../overrideTreeUtils';
import type {
  ShowSettings,
  TrialOverrideEntry,
  ClassOverrideEntry,
} from '@/hooks/queries/useShowSettingsDatabase';

const settings: ShowSettings = {
  visibility: {
    placement: 'class_complete',
    qualification: 'immediate',
    time: 'class_complete',
    faults: 'class_complete',
    preset: 'standard',
    inheritedFrom: 'show',
  },
  selfCheckinEnabled: true,
  hasExplicitSettings: true,
};

describe('overrideTreeUtils — visibility cascade', () => {
  it('trial inherits from show when no override', () => {
    const f = resolveTrialVisibility(undefined);
    expect(f.hasOverride).toBe(false);
    expect(f.source).toBe('show');
    expect(f.preset).toBeNull();
    expect(f.label).toBe('Inheriting from show');
  });

  it('trial reports its own override and preset', () => {
    const trial: TrialOverrideEntry = {
      trialId: 't1',
      override: { preset: 'review', placement: 'manual_release' },
      selfCheckinEnabled: null,
    };
    const f = resolveTrialVisibility(trial);
    expect(f.hasOverride).toBe(true);
    expect(f.source).toBe('trial');
    expect(f.preset).toBe('review');
    expect(f.label).toBe('Override: review');
  });

  it('class falls back to trial when class has no visibility override', () => {
    const trial: TrialOverrideEntry = {
      trialId: 't1',
      override: { preset: 'open', qualification: 'immediate' },
      selfCheckinEnabled: null,
    };
    const f = resolveClassVisibility(undefined, trial);
    expect(f.source).toBe('trial');
    expect(f.label).toBe('Inheriting from trial');
  });

  it('class override wins over trial override', () => {
    const trial: TrialOverrideEntry = {
      trialId: 't1',
      override: { preset: 'open', qualification: 'immediate' },
      selfCheckinEnabled: null,
    };
    const cls: ClassOverrideEntry = {
      classId: 'c1',
      trialId: 't1',
      override: { preset: 'review', placement: 'manual_release' },
      selfCheckinEnabled: null,
    };
    const f = resolveClassVisibility(cls, trial);
    expect(f.source).toBe('class');
    expect(f.preset).toBe('review');
  });
});

describe('overrideTreeUtils — check-in cascade (independent of visibility)', () => {
  it('trial check-in inherits from show', () => {
    const f = resolveTrialCheckin(settings, undefined);
    expect(f.hasOverride).toBe(false);
    expect(f.effective).toBe(true);
    expect(f.label).toBe('Inheriting from show');
  });

  it('trial check-in override is honored even when false', () => {
    const trial: TrialOverrideEntry = { trialId: 't1', override: {}, selfCheckinEnabled: false };
    const f = resolveTrialCheckin(settings, trial);
    expect(f.hasOverride).toBe(true);
    expect(f.effective).toBe(false);
    expect(f.source).toBe('trial');
  });

  it('class check-in falls back to trial then show', () => {
    const trial: TrialOverrideEntry = { trialId: 't1', override: {}, selfCheckinEnabled: false };
    const f = resolveClassCheckin(settings, undefined, trial);
    expect(f.source).toBe('trial');
    expect(f.effective).toBe(false);
    expect(f.label).toBe('Inheriting from trial');
  });

  it('class check-in override wins', () => {
    const trial: TrialOverrideEntry = { trialId: 't1', override: {}, selfCheckinEnabled: false };
    const cls: ClassOverrideEntry = {
      classId: 'c1',
      trialId: 't1',
      override: {},
      selfCheckinEnabled: true,
    };
    const f = resolveClassCheckin(settings, cls, trial);
    expect(f.source).toBe('class');
    expect(f.effective).toBe(true);
  });

  it('facets resolve INDEPENDENTLY: visibility at class, check-in at trial', () => {
    const trial: TrialOverrideEntry = {
      trialId: 't1',
      override: {},
      selfCheckinEnabled: false, // check-in overridden at trial
    };
    const cls: ClassOverrideEntry = {
      classId: 'c1',
      trialId: 't1',
      override: { preset: 'review' }, // visibility overridden at class
      selfCheckinEnabled: null, // check-in inherits
    };
    expect(resolveClassVisibility(cls, trial).source).toBe('class');
    expect(resolveClassCheckin(settings, cls, trial).source).toBe('trial');
  });
});

describe('countOverriddenClasses', () => {
  it('counts classes with a visibility OR check-in override', () => {
    const overrides: ClassOverrideEntry[] = [
      { classId: 'c1', trialId: 't1', override: { preset: 'review' }, selfCheckinEnabled: null },
      { classId: 'c2', trialId: 't1', override: {}, selfCheckinEnabled: false },
      { classId: 'c3', trialId: 't1', override: {}, selfCheckinEnabled: null }, // empty row
    ];
    expect(countOverriddenClasses(['c1', 'c2', 'c3'], overrides)).toBe(2);
  });
});
