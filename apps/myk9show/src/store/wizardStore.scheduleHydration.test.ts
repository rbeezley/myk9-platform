import { afterEach, describe, expect, it } from 'vitest';
import { createJSONStorage } from 'zustand/middleware';
import { combineTrialDateTime } from '@/components/trials/trialDateTime';
import { useWizardStore } from './wizardStore';
import { buildCreateShowPayload } from '@/pages/secretary/ShowCreationWizard/buildCreateShowPayload';
import { createWizardTrialView } from '@/utils/wizardTrialNames';

const originalStorage = useWizardStore.persist.getOptions().storage;

afterEach(() => {
  useWizardStore.persist.setOptions({ storage: originalStorage });
  useWizardStore.getState().resetWizard();
});

async function hydrate(trial: Record<string, unknown>, version = 1) {
  let serialized = JSON.stringify({
    version,
    state: {
      trials: [trial],
      judgeAssignments: [{ trialId: 'trial-1', judgeId: 'judge-1' }],
    },
  });
  useWizardStore.persist.setOptions({
    storage: createJSONStorage(() => ({
      getItem: () => serialized,
      setItem: (_key, value) => {
        serialized = value;
      },
      removeItem: () => {},
    })),
  });
  await useWizardStore.persist.rehydrate();
  return useWizardStore.getState().trials[0]!;
}

describe('persisted wizard schedule recovery', () => {
  it('saves recovered schedule through the real payload builder', async () => {
    const trial = await hydrate({
      id: 'trial-1',
      nameOverride: 'Evening custom',
      dateTime: '2026-08-15T23:45:00',
      eventNumber: 'EVT-1',
      classes: [],
    });
    const state = useWizardStore.getState();
    const view = createWizardTrialView([trial], []);
    const { rpcInput } = buildCreateShowPayload(
      { ...state.show, timezone: 'America/Denver' },
      [trial],
      {},
      new Map(),
      'unpublished',
      view
    );
    expect(rpcInput.p_trials[0]).toMatchObject({
      date: '2026-08-15',
      planned_start_time: '11:45 PM',
      name: 'Evening custom',
      timezone: 'America/Denver',
    });
  });

  it('leaves missing legacy schedules incomplete', async () => {
    const trial = await hydrate({ id: 'trial-1' });
    expect(combineTrialDateTime(trial.trialDate, trial.startTimeDraft)).toBe('');
  });

  it('preserves current version schedules', async () => {
    const trial = await hydrate(
      { id: 'trial-1', trialDate: '2026-08-16', startTimeDraft: 'soon' },
      2
    );
    expect(trial.trialDate).toBe('2026-08-16');
    expect(trial.startTimeDraft).toBe('soon');
  });
  it.each(['2026-08-15T23:45:00', '2026-08-15T00:05:00'])(
    'hydrates the old local schedule %s without shifting the day',
    async dateTime => {
      const classes = [{ templateId: 'class-1', customizations: { judgeId: 'judge-1' } }];
      const trial = await hydrate({
        id: 'trial-1',
        nameOverride: 'Evening custom',
        dateTime,
        classes,
      });
      expect(combineTrialDateTime(trial.trialDate, trial.startTimeDraft)).toBe(dateTime);
      expect(trial.nameOverride).toBe('Evening custom');
      expect(trial.classes).toEqual(classes);
      expect(useWizardStore.getState().judgeAssignments).toEqual([
        { trialId: 'trial-1', judgeId: 'judge-1' },
      ]);
    }
  );

  it.each(['', 'bad', '2026-02-30T08:00:00', '2026-08-15T25:00:00'])(
    'keeps invalid legacy schedule %s incomplete',
    async dateTime => {
      const trial = await hydrate({ id: 'trial-1', dateTime });
      expect(combineTrialDateTime(trial.trialDate, trial.startTimeDraft)).toBe('');
    }
  );

  it.each(['', 'soon', '10:15 AM'])(
    'preserves current fields including typed %s',
    async startTimeDraft => {
      const trial = await hydrate({
        id: 'trial-1',
        dateTime: '2026-08-15T08:00:00',
        trialDate: '',
        startTimeDraft,
      });
      expect(trial.trialDate).toBe('');
      expect(trial.startTimeDraft).toBe(startTimeDraft);
    }
  );

  it('still converts version-zero names while recovering schedules', async () => {
    const trial = await hydrate(
      { id: 'trial-1', name: 'Custom morning', dateTime: '2026-08-15T08:00:00' },
      0
    );
    expect(trial.nameOverride).toBe('Custom morning');
    expect(combineTrialDateTime(trial.trialDate, trial.startTimeDraft)).toBe('2026-08-15T08:00:00');
  });
});
