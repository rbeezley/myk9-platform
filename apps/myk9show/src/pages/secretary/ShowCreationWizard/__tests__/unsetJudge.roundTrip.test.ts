/**
 * MYK9-1846: a class with no judge is stored as unset (empty), not the literal 'TBD', and an
 * old device row that still holds 'TBD' reads as unset.
 */
import { describe, expect, it } from 'vitest';
import { createWizardTrialView } from '@/utils/wizardTrialNames';
import type { Show } from '@/types/show-types';
import type { ClassData } from '@/components/classes/types/classTypes';
import { normalizeWizardClassSelections } from '../classConfigurationValidation';
import { buildEditModeDraft } from '../buildEditModeDraft';
import { classDataToReplicatedClass } from '../classDataToReplicatedClass';
import { createClassDataFromWizard, type WizardTrial } from '../showCreationWizardTransformers';

const TRIAL_ID = 'trial-1';

const trial: WizardTrial = {
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

function writeClasses(judgeId?: string): ClassData[] {
  const trials = [{ ...trial, classes: [{ ...trial.classes[0]!, judgeId }] }];
  return createClassDataFromWizard(
    trials,
    { [TRIAL_ID]: TRIAL_ID },
    { 'judge-1': { id: 'judge-1', name: 'Jane Smith' } } as never,
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
  assignedJudges: [{ judgeId: 'judge-1', judgeName: 'Jane Smith' }],
} as unknown as Show;

function draftJudgeIds(classes: Array<{ judge: string }>) {
  const draft = buildEditModeDraft({
    editMode: { showId: 'show-1', mode: 'edit-show' } as never,
    existingShow: show,
    showTrials: [{ id: TRIAL_ID }] as never,
    existingClasses: classes.map(c => ({
      trialId: TRIAL_ID,
      templateId: '',
      className: 'Interior Novice A',
      element: 'Interior',
      level: 'Novice',
      section: 'A',
      ...c,
    })) as never,
    people: [],
  });
  return draft.trials[0]!.classes.map(c => c.judgeId);
}

describe('unset judge round trip', () => {
  it('writes an unset judge as empty, never the literal TBD', () => {
    const [cls] = writeClasses(undefined);
    expect(cls!.judge).toBe('');
    expect(cls!.judgeId).toBeUndefined();
    expect(classDataToReplicatedClass(cls!).judgeName).toBe('');
  });

  it('still writes a named judge', () => {
    expect(writeClasses('judge-1')[0]!.judge).toBe('Jane Smith');
  });

  it('reads the unset class back as no judge', () => {
    const [cls] = writeClasses(undefined);
    expect(draftJudgeIds([{ judge: cls!.judge }])).toEqual(['']);
  });

  it('reads an old local TBD row as unset, and still matches a real judge', () => {
    expect(draftJudgeIds([{ judge: 'TBD' }, { judge: 'Jane Smith' }])).toEqual(['', 'judge-1']);
  });
});
