import { describe, expect, it } from 'vitest';
import { useWizardStore } from '../wizardStore';

const local = (y: number, m: number, d: number) => new Date(y, m - 1, d, 8).toISOString();
const trial = (trialDate: string) => ({
  nameOverride: undefined,
  trialDate,
  eventNumber: '',
  classes: [],
});
const days = () => useWizardStore.getState().trials.map(t => t.trialDate);
const store = () => useWizardStore.getState();

/** Dates entered the way the range picker writes them, then the step advance. */
function setShowDates(start: [number, number, number], end: [number, number, number]) {
  store().updateShowData({ startDate: local(...start) });
  store().updateShowData({ endDate: local(...end) });
}

describe('draft trials follow the final show dates (MYK9-884)', () => {
  it('moves a draft trial left on July 1 to the new one-day show date', () => {
    setShowDates([2026, 7, 1], [2026, 7, 1]);
    store().addTrial(trial('2026-07-01'));

    setShowDates([2026, 8, 15], [2026, 8, 15]);
    store().setCurrentStep(1);

    expect(days()).toEqual(['2026-08-15']);
  });

  it('keeps two days for a legacy or cloned draft when Aug 14-15 moves to Sep 12-13', () => {
    // Trials written straight into the store, as a pre-change persisted draft has them.
    useWizardStore.setState({
      trials: [
        {
          id: 'a',
          trialDate: '2026-08-14',
          startTimeDraft: '08:00 AM',
          eventNumber: '',
          classes: [],
        },
        {
          id: 'b',
          trialDate: '2026-08-15',
          startTimeDraft: '09:00 AM',
          eventNumber: '',
          classes: [],
        },
      ],
    });

    setShowDates([2026, 9, 12], [2026, 9, 13]);
    store().setCurrentStep(1);

    expect(days()).toEqual(['2026-09-12', '2026-09-13']);
  });

  it('keeps both days when Aug 14-15 moves to Aug 1-2 through separate start and end writes', () => {
    setShowDates([2026, 8, 14], [2026, 8, 15]);
    store().addTrial(trial('2026-08-14'));
    store().addTrial(trial('2026-08-15'));

    store().updateShowData({ startDate: local(2026, 8, 1) });
    store().updateShowData({ endDate: local(2026, 8, 2) });
    store().setCurrentStep(1);

    expect(days()).toEqual(['2026-08-01', '2026-08-02']);
  });

  it('survives the one-click-then-extend picker sequence', () => {
    setShowDates([2026, 8, 14], [2026, 8, 15]);
    store().addTrial(trial('2026-08-14'));
    store().addTrial(trial('2026-08-15'));

    store().updateShowData({ startDate: local(2026, 8, 1), endDate: local(2026, 8, 1) });
    store().updateShowData({ endDate: local(2026, 8, 2) });
    store().setCurrentStep(1);

    expect(days()).toEqual(['2026-08-01', '2026-08-02']);
  });

  it('does not move trials until the step advances', () => {
    setShowDates([2026, 7, 1], [2026, 7, 1]);
    store().addTrial(trial('2026-07-01'));

    setShowDates([2026, 8, 15], [2026, 8, 15]);

    expect(days()).toEqual(['2026-07-01']);
  });

  it('keeps a trial that is still inside the new range', () => {
    setShowDates([2026, 8, 14], [2026, 8, 16]);
    store().addTrial(trial('2026-08-15'));

    setShowDates([2026, 8, 15], [2026, 8, 16]);
    store().setCurrentStep(1);

    expect(days()).toEqual(['2026-08-15']);
  });

  it('leaves undated trials alone and moves the dated ones', () => {
    setShowDates([2026, 7, 1], [2026, 7, 2]);
    store().addTrial(trial(''));
    store().addTrial(trial('2026-07-01'));

    setShowDates([2026, 8, 15], [2026, 8, 16]);
    store().setCurrentStep(1);

    expect(days()).toEqual(['', '2026-08-15']);
  });

  it('keeps an out-of-range trial edit through Back, then realigns on the next forward move', () => {
    setShowDates([2026, 8, 14], [2026, 8, 15]);
    store().addTrial(trial('2026-08-14'));
    store().setCurrentStep(1);
    const id = store().trials[0]!.id;

    // Secretary picks a date past the show, goes Back to extend the show.
    store().updateTrial(id, { trialDate: '2026-08-20', startTimeDraft: '08:00 AM' });
    store().setCurrentStep(0);
    expect(days()).toEqual(['2026-08-20']);

    store().updateShowData({ endDate: local(2026, 8, 21) });
    store().setCurrentStep(1);
    expect(days()).toEqual(['2026-08-20']);

    // Dates moved away from the trial: the next forward move realigns it.
    store().setCurrentStep(0);
    setShowDates([2026, 9, 12], [2026, 9, 13]);
    store().setCurrentStep(1);
    expect(days()).toEqual(['2026-09-12']);
  });

  it('is idempotent once aligned', () => {
    setShowDates([2026, 7, 1], [2026, 7, 1]);
    store().addTrial(trial('2026-07-01'));
    setShowDates([2026, 8, 15], [2026, 8, 15]);
    store().setCurrentStep(1);
    store().setCurrentStep(2);
    store().setCurrentStep(1);

    expect(days()).toEqual(['2026-08-15']);
  });

  it('does not touch trials in edit mode', () => {
    useWizardStore.setState({ editBaselineJudgeIds: [] });
    setShowDates([2026, 7, 1], [2026, 7, 1]);
    store().addTrial(trial('2026-07-01'));

    setShowDates([2026, 8, 15], [2026, 8, 15]);
    store().setCurrentStep(1);
    store().setCurrentStep(1);

    expect(days()).toEqual(['2026-07-01']);
  });
});
