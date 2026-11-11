import { describe, expect, it } from 'vitest';

import { createWizardTrialView } from '@/utils/wizardTrialNames';
import { createClassDataFromWizard, type WizardTrial } from '../showCreationWizardTransformers';
import type { NormalizedWizardClassSelection } from '../classConfigurationValidation';

const trial: WizardTrial = {
  id: 'wt1',
  trialDate: '2026-06-01',
  eventNumber: '1',
  classes: [
    { templateId: 't', customizations: {}, judgeId: 'j1' },
    { templateId: 't', customizations: {} },
  ],
};

function normalized(sourceIndex: number): NormalizedWizardClassSelection {
  return {
    trialId: 'wt1',
    sourceIndex,
    className: `Class ${sourceIndex}`,
    templateId: 't',
    triple: { element: 'Container', level: 'Novice', section: 'A' },
  } as NormalizedWizardClassSelection;
}

describe('createClassDataFromWizard judge (MYK9-1853)', () => {
  it('names the assigned judge and writes an empty name, never the literal TBD, for none', () => {
    const classes = createClassDataFromWizard(
      [trial],
      { wt1: 'trial-uuid' },
      { j1: { name: 'Jane Smith', email: '', phone: '' } },
      'show-1',
      [],
      undefined,
      undefined,
      createWizardTrialView([{ id: 'wt1', trialDate: '2026-06-01', nameOverride: undefined }], []),
      [normalized(0), normalized(1)]
    );
    expect(classes.map(c => c.judge)).toEqual(['Jane Smith', '']);
  });
});
