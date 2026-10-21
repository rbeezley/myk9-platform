import { describe, expect, it } from 'vitest';
import type {
  ClassOverrideEntry,
  ShowSettings,
  TrialOverrideEntry,
} from '@/hooks/queries/useShowSettingsDatabase';
import { classHasManualReleaseTiming } from './classManualReleaseTiming';

type Timing = 'immediate' | 'class_complete' | 'manual_release';

const settings = (timing: Timing, overrides: Partial<Record<string, Timing>> = {}): ShowSettings =>
  ({
    visibility: {
      placement: timing,
      qualification: timing,
      time: timing,
      faults: timing,
      inheritedFrom: 'show',
      preset: 'standard',
      ...overrides,
    },
    selfCheckinEnabled: false,
    hasExplicitSettings: true,
  }) as ShowSettings;

const trialOverride = (override: Record<string, Timing>): TrialOverrideEntry =>
  ({ trialId: 't1', override, selfCheckinEnabled: null }) as TrialOverrideEntry;
const classOverride = (override: Record<string, Timing>): ClassOverrideEntry =>
  ({ classId: 'c1', trialId: 't1', override, selfCheckinEnabled: null }) as ClassOverrideEntry;

describe('classHasManualReleaseTiming', () => {
  it('is true when the show default holds results for manual release', () => {
    expect(classHasManualReleaseTiming(settings('manual_release'), [], [], 'c1', 't1')).toBe(true);
  });

  it('is true when one field alone is manual release', () => {
    expect(
      classHasManualReleaseTiming(
        settings('immediate', { faults: 'manual_release' }),
        [],
        [],
        'c1',
        't1'
      )
    ).toBe(true);
  });

  it('is true when the trial override sets manual release', () => {
    expect(
      classHasManualReleaseTiming(
        settings('immediate'),
        [trialOverride({ placement: 'manual_release' })],
        [],
        'c1',
        't1'
      )
    ).toBe(true);
  });

  it('is true when the class override sets manual release', () => {
    expect(
      classHasManualReleaseTiming(
        settings('class_complete'),
        [],
        [classOverride({ time: 'manual_release' })],
        'c1',
        't1'
      )
    ).toBe(true);
  });

  it('is false when every field is immediate or class_complete', () => {
    expect(classHasManualReleaseTiming(settings('immediate'), [], [], 'c1', 't1')).toBe(false);
    expect(
      classHasManualReleaseTiming(
        settings('immediate', { time: 'class_complete' }),
        [],
        [],
        'c1',
        't1'
      )
    ).toBe(false);
  });

  it('lets a class override beat a manual show default', () => {
    const all: Record<string, Timing> = {
      placement: 'immediate',
      qualification: 'immediate',
      time: 'immediate',
      faults: 'immediate',
    };
    expect(
      classHasManualReleaseTiming(settings('manual_release'), [], [classOverride(all)], 'c1', 't1')
    ).toBe(false);
  });

  it('lets a trial override beat a manual show default, and a class override beat the trial', () => {
    const immediate: Record<string, Timing> = {
      placement: 'immediate',
      qualification: 'immediate',
      time: 'immediate',
      faults: 'immediate',
    };
    expect(
      classHasManualReleaseTiming(
        settings('manual_release'),
        [trialOverride(immediate)],
        [],
        'c1',
        't1'
      )
    ).toBe(false);
    expect(
      classHasManualReleaseTiming(
        settings('immediate'),
        [trialOverride({ placement: 'manual_release' })],
        [classOverride({ placement: 'immediate' })],
        'c1',
        't1'
      )
    ).toBe(false);
  });

  it('ignores overrides that belong to another class or trial', () => {
    expect(
      classHasManualReleaseTiming(
        settings('immediate'),
        [{ ...trialOverride({ placement: 'manual_release' }), trialId: 'other' }],
        [{ ...classOverride({ placement: 'manual_release' }), classId: 'other' }],
        'c1',
        't1'
      )
    ).toBe(false);
  });

  it('honours a preset override, as the After Review choice in the sheet saves it (all fields inherit)', () => {
    const presetOnly = {
      classId: 'c1',
      trialId: 't1',
      override: { preset: 'review' },
      selfCheckinEnabled: null,
    } as unknown as ClassOverrideEntry;
    expect(classHasManualReleaseTiming(settings('immediate'), [], [presetOnly], 'c1', 't1')).toBe(
      true
    );
  });

  it('is false without settings', () => {
    expect(classHasManualReleaseTiming(undefined, [], [], 'c1', 't1')).toBe(false);
  });
});
