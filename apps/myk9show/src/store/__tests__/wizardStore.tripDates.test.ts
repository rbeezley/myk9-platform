import { describe, expect, it } from 'vitest';
import { useWizardStore } from '../wizardStore';

const local = (y: number, m: number, d: number) => new Date(y, m - 1, d, 8).toISOString();
const trial = (dateTime: string) => ({
  nameOverride: undefined,
  dateTime,
  eventNumber: '',
  classes: [],
});
const days = () => useWizardStore.getState().trials.map(t => t.dateTime);

describe('wizardStore show-date changes realign draft trials (MYK9-884)', () => {
  it('moves a draft trial left on July 1 to the new one-day show date', () => {
    const store = useWizardStore.getState();
    store.updateShowData({ startDate: local(2026, 7, 1), endDate: local(2026, 7, 1) });
    store.addTrial(trial('2026-07-01T08:00:00'));

    useWizardStore
      .getState()
      .updateShowData({ startDate: local(2026, 8, 15), endDate: local(2026, 8, 15) });

    expect(days()).toEqual(['2026-08-15T08:00:00']);
  });

  it('keeps a trial that is still inside the new range', () => {
    const store = useWizardStore.getState();
    store.updateShowData({ startDate: local(2026, 8, 14), endDate: local(2026, 8, 16) });
    store.addTrial(trial('2026-08-15T13:30:00'));

    useWizardStore
      .getState()
      .updateShowData({ startDate: local(2026, 8, 15), endDate: local(2026, 8, 16) });

    expect(days()).toEqual(['2026-08-15T13:30:00']);
  });

  it('moves a multi-day structure by the start delta', () => {
    const store = useWizardStore.getState();
    store.updateShowData({ startDate: local(2026, 9, 12), endDate: local(2026, 9, 13) });
    store.addTrial(trial('2026-09-12T08:00:00'));
    store.addTrial(trial('2026-09-13T09:00:00'));

    useWizardStore
      .getState()
      .updateShowData({ startDate: local(2026, 9, 19), endDate: local(2026, 9, 20) });

    expect(days()).toEqual(['2026-09-19T08:00:00', '2026-09-20T09:00:00']);
  });

  it('does not touch trials in edit mode', () => {
    useWizardStore.setState({ editBaselineJudgeIds: [] });
    const store = useWizardStore.getState();
    store.updateShowData({ startDate: local(2026, 7, 1), endDate: local(2026, 7, 1) });
    store.addTrial(trial('2026-07-01T08:00:00'));

    useWizardStore
      .getState()
      .updateShowData({ startDate: local(2026, 8, 15), endDate: local(2026, 8, 15) });

    expect(days()).toEqual(['2026-07-01T08:00:00']);
  });
});
