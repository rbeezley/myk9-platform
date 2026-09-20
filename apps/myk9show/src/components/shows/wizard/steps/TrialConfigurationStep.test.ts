import { describe, expect, it } from 'vitest';
import { TrialType } from '@/types/template.types';
import {
  getNextTrialName,
  getTrialCreationCopy,
  isTrialSnapshotReady,
  resolveTrialTypeOptions,
} from './TrialConfigurationStep.helpers';

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
    expect(getTrialCreationCopy([])).toEqual({
      addTrialLabel: 'Add First Trial',
      emptyStateTitle: 'Schedule Your Trials',
      emptyStateDescription:
        'Trials are individual competition events within your show. Add your first trial to get started.',
    });
  });

  it('uses another-trial wording when the show already has a trial', () => {
    expect(getTrialCreationCopy([{ name: 'Saturday Trial 1', trialDate: '2026-08-01' }])).toEqual({
      addTrialLabel: 'Add Another Trial',
      emptyStateTitle: 'Add Another Trial',
      emptyStateDescription: 'Add another trial to continue setting up this show.',
    });
  });

  it('allocates the first unused persisted same-day trial name', () => {
    expect(
      getNextTrialName(
        [
          { name: 'Saturday Trial 1', trialDate: '2026-08-01' },
          { name: 'Saturday Trial 3', trialDate: '2026-08-01' },
        ],
        '2026-08-01'
      )
    ).toBe('Saturday Trial 2');
  });

  it('does not count trials from another day', () => {
    expect(
      getNextTrialName([{ name: 'Sunday Trial 1', trialDate: '2026-08-02' }], '2026-08-01')
    ).toBe('Saturday Trial 1');
  });

  it('does not reserve generated names for unrelated same-day trial names', () => {
    expect(
      getNextTrialName([{ name: 'Veteran Sweepstakes', trialDate: '2026-08-01' }], '2026-08-01')
    ).toBe('Saturday Trial 1');
  });

  it('uses first-trial wording for a selected day with no trial on that day', () => {
    expect(
      getTrialCreationCopy([{ name: 'Sunday Trial 1', trialDate: '2026-08-02' }], '2026-08-01')
        .addTrialLabel
    ).toBe('Add First Trial');
  });

  it('uses another-trial wording when the selected day already has a trial', () => {
    expect(
      getTrialCreationCopy([{ name: 'Saturday Trial 1', trialDate: '2026-08-01' }], '2026-08-01')
        .addTrialLabel
    ).toBe('Add Another Trial');
  });

  it('fails closed before a current trial snapshot is confirmed', () => {
    expect(isTrialSnapshotReady('idle', false)).toBe(false);
    expect(isTrialSnapshotReady('loading', false)).toBe(false);
    expect(isTrialSnapshotReady('error', true)).toBe(true);
    expect(isTrialSnapshotReady('ready', true)).toBe(true);
  });
});
