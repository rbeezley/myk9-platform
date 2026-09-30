import { describe, expect, it } from 'vitest';
import { useWizardStore } from '../wizardStore';
import { realignTrialsToShowDates } from '@/utils/wizardTrialDates';

const local = (y: number, m: number, d: number) => new Date(y, m - 1, d, 8).toISOString();
const store = () => useWizardStore.getState();
const t = (dateTime: string) => ({ dateTime });

describe('step header navigation realigns like Next (MYK9-884)', () => {
  it('realigns when a later step is reached through goToStep', () => {
    store().updateShowData({ startDate: local(2026, 7, 1), endDate: local(2026, 7, 1) });
    store().addTrial({
      nameOverride: undefined,
      dateTime: '2026-07-01T08:00:00',
      eventNumber: '',
      classes: [],
    });
    store().markStepCompleted(0);
    store().markStepCompleted(1);
    store().updateShowData({ startDate: local(2026, 8, 15) });
    store().updateShowData({ endDate: local(2026, 8, 15) });

    store().goToStep(2);

    expect(store().currentStep).toBe(2);
    expect(store().trials.map(x => x.dateTime)).toEqual(['2026-08-15T08:00:00']);
  });
});

describe('realignTrialsToShowDates keeps in-range trials in place', () => {
  it('clamps only the out-of-range trial when the start moves inside the trials', () => {
    const out = realignTrialsToShowDates(
      [t('2026-01-10T08:00:00'), t('2026-01-11T08:00:00'), t('2026-01-12T08:00:00')],
      local(2026, 1, 11),
      local(2026, 1, 12)
    );
    expect(out.map(x => x.dateTime)).toEqual([
      '2026-01-11T08:00:00',
      '2026-01-11T08:00:00',
      '2026-01-12T08:00:00',
    ]);
  });

  it('shifts every trial when all of them are outside the new range', () => {
    const out = realignTrialsToShowDates(
      [t('2026-08-14T08:00:00'), t('2026-08-15T09:00:00')],
      local(2026, 9, 12),
      local(2026, 9, 13)
    );
    expect(out.map(x => x.dateTime)).toEqual(['2026-09-12T08:00:00', '2026-09-13T09:00:00']);
  });
});

describe('moved-dates notice flag', () => {
  it('counts moved trials on the forward move and clears on an edit or leaving Trials', () => {
    store().updateShowData({ startDate: local(2026, 7, 1), endDate: local(2026, 7, 1) });
    store().addTrial({
      nameOverride: undefined,
      dateTime: '2026-07-01T08:00:00',
      eventNumber: '',
      classes: [],
    });
    store().updateShowData({ startDate: local(2026, 8, 15) });
    store().updateShowData({ endDate: local(2026, 8, 15) });
    store().setCurrentStep(1);
    expect(store().trialsMovedCount).toBe(1);

    store().updateTrial(store().trials[0]!.id, { eventNumber: '1' });
    expect(store().trialsMovedCount).toBe(0);

    store().setCurrentStep(0);
    store().updateShowData({ startDate: local(2026, 9, 1) });
    store().updateShowData({ endDate: local(2026, 9, 1) });
    store().setCurrentStep(1);
    expect(store().trialsMovedCount).toBe(1);
    store().setCurrentStep(2);
    expect(store().trialsMovedCount).toBe(0);
  });
});
