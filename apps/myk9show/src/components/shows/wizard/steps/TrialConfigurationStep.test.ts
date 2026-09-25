import { describe, expect, it } from 'vitest';
import { TrialType } from '@/types/template.types';
import {
  getTrialCreationCopy,
  isTrialSnapshotReady,
  resolveTrialTypeOptions,
} from './TrialConfigurationStep.helpers';
import {
  createWizardTrialView,
  getEffectiveTrialNames,
  getTrialLocalDay,
} from '@/utils/wizardTrialNames';

describe('resolveTrialTypeOptions', () => {
  it('keeps the full AKC discipline list even when templates only include Scent Work', () => {
    const options = resolveTrialTypeOptions('AKC', [
      { isActive: true, organization: 'AKC', trialType: 'Scent Work' },
    ]);

    expect(options).toContain(TrialType.SCENT_WORK);
    expect(options).toContain(TrialType.AGILITY);
    expect(options).toContain(TrialType.OBEDIENCE);
    expect(options).toContain(TrialType.RALLY);
    expect(options).toContain(TrialType.CONFORMATION);
    expect(options.at(-1)).toBe(TrialType.OTHER);
  });

  it('normalizes raw enum-style template values before deduping', () => {
    const options = resolveTrialTypeOptions('AKC', [
      { isActive: true, organization: 'AKC', trialType: 'scent_work' },
    ]);

    expect(options.filter(type => type === TrialType.SCENT_WORK)).toHaveLength(1);
    expect(options).not.toContain('scent_work' as TrialType);
  });
});

describe('trial creation wording', () => {
  it('uses first-trial wording when the show has no current trials', () => {
    expect(getTrialCreationCopy(false)).toEqual({
      addTrialLabel: 'Add First Trial',
      emptyStateTitle: 'Schedule Your Trials',
      emptyStateDescription:
        'Trials are individual competition events within your show. Add your first trial to get started.',
    });
  });

  it('uses another-trial wording when the show already has a trial', () => {
    expect(getTrialCreationCopy(true)).toEqual({
      addTrialLabel: 'Add Another Trial',
      emptyStateTitle: 'Add Another Trial',
      emptyStateDescription: 'Add another trial to continue setting up this show.',
    });
  });

  it('derives generated names from same-day persisted trials and draft order', () => {
    const persisted = [{ id: 'saved-1', name: 'Custom Novice Trial', trialDate: '2026-08-01' }];
    const drafts = [
      { id: 'draft-1', trialDate: '2026-08-01' },
      { id: 'draft-2', trialDate: '2026-08-01' },
    ];

    expect(getEffectiveTrialNames(drafts, persisted)).toEqual([
      'Saturday Trial 2',
      'Saturday Trial 3',
    ]);
  });

  it('recalculates draft names after additions, removals, and reorder', () => {
    const first = { id: 'draft-1', trialDate: '2026-08-01' };
    const second = { id: 'draft-2', trialDate: '2026-08-01' };
    const otherDay = { id: 'draft-3', trialDate: '2026-08-02' };

    expect(getEffectiveTrialNames([first, second, otherDay])).toEqual([
      'Saturday Trial 1',
      'Saturday Trial 2',
      'Sunday Trial 1',
    ]);
    expect(getEffectiveTrialNames([second, otherDay])).toEqual([
      'Saturday Trial 1',
      'Sunday Trial 1',
    ]);
    expect(getEffectiveTrialNames([second, first])).toEqual([
      'Saturday Trial 1',
      'Saturday Trial 2',
    ]);
  });

  it('recalculates a draft name when that trial moves to another local day', () => {
    expect(
      getEffectiveTrialNames([
        { id: 'moved', trialDate: '2026-08-01T08:00:00' },
        { id: 'remaining', trialDate: '2026-08-01T10:00:00' },
      ])
    ).toEqual(['Saturday Trial 1', 'Saturday Trial 2']);

    expect(
      getEffectiveTrialNames([
        { id: 'moved', trialDate: '2026-08-02T08:00:00' },
        { id: 'remaining', trialDate: '2026-08-01T10:00:00' },
      ])
    ).toEqual(['Sunday Trial 1', 'Saturday Trial 1']);
  });

  it('keeps an explicit override and restores the generated default when cleared', () => {
    const draft = { id: 'draft-1', trialDate: '2026-08-01' };
    expect(getEffectiveTrialNames([{ ...draft, nameOverride: 'Veteran Sweepstakes' }])).toEqual([
      'Veteran Sweepstakes',
    ]);
    expect(getEffectiveTrialNames([draft])).toEqual(['Saturday Trial 1']);
  });

  it('resolves an offset timestamp to its local calendar day at a UTC boundary', () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = 'America/Chicago';
    try {
      expect(getTrialLocalDay('2026-08-02T01:00:00Z')).toBe('2026-08-01');
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });

  it('uses show-level add-another copy when existing trials are on another day', () => {
    const view = createWizardTrialView(
      [],
      [{ id: 'sunday-trial', name: 'Sunday Trial 1', trialDate: '2026-08-02' }]
    );

    expect(getTrialCreationCopy(view.hasAnyTrials).addTrialLabel).toBe('Add Another Trial');
  });

  it('fails closed before a current trial snapshot is confirmed', () => {
    expect(isTrialSnapshotReady('idle', false)).toBe(false);
    expect(isTrialSnapshotReady('loading', false)).toBe(false);
    expect(isTrialSnapshotReady('error', true)).toBe(true);
    expect(isTrialSnapshotReady('ready', true)).toBe(true);
  });
});

describe('getTrialCreationCopy while the current trials are unknown (MYK9-758)', () => {
  it('claims neither first nor another, whatever the local snapshot shows', () => {
    for (const hasAnyTrials of [false, true]) {
      const copy = getTrialCreationCopy(hasAnyTrials, false);
      expect(copy.addTrialLabel).toBe('Add Trial');
      expect(copy.emptyStateTitle).toBe('Add a Trial');
      expect(copy.emptyStateDescription).not.toMatch(/first/i);
    }
  });
});
