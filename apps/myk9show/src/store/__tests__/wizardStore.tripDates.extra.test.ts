import { describe, expect, it } from 'vitest';
import { useWizardStore } from '../wizardStore';
import { realignTrialsToShowDates } from '@/utils/wizardTrialDates';

const local = (y: number, m: number, d: number) => new Date(y, m - 1, d, 8).toISOString();
const store = () => useWizardStore.getState();
const t = (trialDate: string) => ({ trialDate });

describe('step header navigation realigns like Next (MYK9-884)', () => {
  const seedOldTrial = () => {
    store().updateShowData({ startDate: local(2026, 7, 1), endDate: local(2026, 7, 1) });
    store().addTrial({
      nameOverride: undefined,
      trialDate: '2026-07-01',
      startTimeDraft: '08:00 AM',
      eventNumber: '',
      classes: [],
    });
    [0, 1, 2].forEach(step => store().markStepCompleted(step));
  };

  it('lands on the Trials step when a header jump past it moved trial dates', () => {
    seedOldTrial();
    store().updateShowData({ startDate: local(2026, 8, 15) });
    store().updateShowData({ endDate: local(2026, 8, 15) });

    store().goToStep(3);

    expect(store().trials.map(x => x.trialDate)).toEqual(['2026-08-15']);
    expect(store().currentStep).toBe(1);
    expect(store().trialsMovedCount).toBe(1);
  });

  it('goes to the requested step when no trial moved', () => {
    seedOldTrial();

    store().goToStep(3);

    expect(store().currentStep).toBe(3);
    expect(store().trialsMovedCount).toBe(0);
  });
});

describe('moved-dates count does not survive a new draft', () => {
  it('resets on loadDraft and resetWizard', () => {
    useWizardStore.setState({ trialsMovedCount: 2 });
    store().loadDraft({});
    expect(store().trialsMovedCount).toBe(0);

    useWizardStore.setState({ trialsMovedCount: 2 });
    store().resetWizard();
    expect(store().trialsMovedCount).toBe(0);
  });
});

describe('realignTrialsToShowDates keeps in-range trials in place', () => {
  it('clamps only the out-of-range trial when the start moves inside the trials', () => {
    const out = realignTrialsToShowDates(
      [t('2026-01-10'), t('2026-01-11'), t('2026-01-12')],
      local(2026, 1, 11),
      local(2026, 1, 12)
    );
    expect(out.map(x => x.trialDate)).toEqual(['2026-01-11', '2026-01-11', '2026-01-12']);
  });

  it('shifts every trial when all of them are outside the new range', () => {
    const out = realignTrialsToShowDates(
      [t('2026-08-14'), t('2026-08-15')],
      local(2026, 9, 12),
      local(2026, 9, 13)
    );
    expect(out.map(x => x.trialDate)).toEqual(['2026-09-12', '2026-09-13']);
  });
});

describe('moved-dates notice flag', () => {
  it('counts moved trials on the forward move and clears on an edit or leaving Trials', () => {
    store().updateShowData({ startDate: local(2026, 7, 1), endDate: local(2026, 7, 1) });
    store().addTrial({
      nameOverride: undefined,
      trialDate: '2026-07-01',
      startTimeDraft: '08:00 AM',
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
