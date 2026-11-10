import { describe, expect, it } from 'vitest';
import type { Show } from '@/types/show-types';
import type { SyncableClassData } from '@/store/classStore';
import { createWizardTrialView } from '@/utils/wizardTrialNames';
import { normalizeWizardClassSelections } from '../classConfigurationValidation';
import { buildEditModeDraft } from '../buildEditModeDraft';
import { createClassDataFromWizard, type WizardTrial } from '../showCreationWizardTransformers';

const TRIAL_ID = 'trial-1';

const wizardTrial: WizardTrial = {
  id: TRIAL_ID,
  trialDate: '2026-10-10',
  startTimeDraft: '09:00 AM',
  eventNumber: 'EVT-1',
  trialType: 'Scent Work',
  classes: [
    {
      templateId: 'template-1',
      customizations: {
        className: 'Interior Novice A',
        element: 'Interior',
        level: 'Novice',
        section: 'A',
      },
    },
  ],
};

function writeClasses() {
  const trials = [wizardTrial];
  return createClassDataFromWizard(
    trials,
    { [TRIAL_ID]: TRIAL_ID },
    {},
    'show-1',
    [],
    undefined,
    undefined,
    createWizardTrialView([], []),
    normalizeWizardClassSelections('AKC', trials, [])
  );
}

const show = {
  id: 'show-1',
  name: 'Heartland',
  organization: 'AKC',
  startDate: '2026-10-10',
  endDate: '2026-10-11',
  location: 'Venue',
  clubId: 'club-1',
  entryOpenDate: '2026-09-01',
  entryCloseDate: '2026-10-01',
  preEntryFee: '30',
  dayOfShowFee: '35',
  assignedJudges: [{ judgeId: 'judge-1', judgeName: 'TBD' }],
} as unknown as Show;

function draftJudgeIds(classes: Array<Partial<SyncableClassData>>) {
  const draft = buildEditModeDraft({
    editMode: { showId: 'show-1', mode: 'edit-show' } as never,
    existingShow: show,
    showTrials: [{ id: TRIAL_ID, timezone: 'America/Chicago' } as never],
    existingClasses: classes.map(c => ({
      trialId: TRIAL_ID,
      className: 'Interior Novice A',
      ...c,
    })) as never,
    people: [],
  });
  return draft.trials.flatMap(t => t.classes.map(c => c.judgeId));
}

describe('a class with no judge (MYK9-1846)', () => {
  it('is written as unset, never the literal TBD', () => {
    const [cls] = writeClasses();
    expect(cls?.judge).toBe('');
    expect(cls?.judgeId).toBeUndefined();
  });

  it('round-trips through the edit draft as unset', () => {
    const [cls] = writeClasses();
    expect(draftJudgeIds([cls as never])).toEqual(['']);
  });

  it('reads an old local TBD row as unset, even when a judge happens to be named TBD', () => {
    expect(draftJudgeIds([{ judge: 'TBD' }])).toEqual(['']);
  });
});
