/**
 * MYK9-604 — only classes the wizard will WRITE are validated. In add-classes mode
 * buildEditModeDraft loads every persisted class into `trials`; a legacy row whose
 * identity the current catalog rejects must not block saving an unrelated change or
 * adding a valid class, and it must never be re-written.
 */
import { describe, expect, it } from 'vitest';
import { createWizardTrialView } from '@/utils/wizardTrialNames';
import {
  InvalidWizardClassConfigurationError,
  normalizeWizardClassSelections,
  type PersistedClassIdentity,
} from '../classConfigurationValidation';
import { createClassDataFromWizard, type WizardTrial } from '../showCreationWizardTransformers';
import { getValidationMessagesForStep } from '../showCreationWizardValidation';

const TRIAL_ID = 'persisted-trial-1';

// A Detective the pre-fix wizard saved with the literal 'Unknown' level.
const legacyDetective = {
  templateId: '',
  customizations: {
    className: 'Detective',
    element: 'Detective',
    level: 'Unknown',
    section: '',
    fieldOverrides: {},
  },
};
const legacyRow: PersistedClassIdentity = {
  trialId: TRIAL_ID,
  element: 'Detective',
  level: 'Unknown',
  section: '',
};

const validNew = {
  templateId: 'template-1',
  customizations: {
    className: 'Interior Novice A',
    element: 'Interior',
    level: 'Novice',
    section: 'A',
  },
};

function persistedTrial(classes: WizardTrial['classes'], trialType?: string): WizardTrial {
  return {
    id: TRIAL_ID,
    dateTime: '2026-10-10T09:00:00',
    eventNumber: 'EVT-1',
    ...(trialType === undefined ? {} : { trialType }),
    classes,
  };
}

function writtenClasses(trials: WizardTrial[], persisted: PersistedClassIdentity[]) {
  const normalized = normalizeWizardClassSelections('AKC', trials, persisted);
  return createClassDataFromWizard(
    trials,
    { [TRIAL_ID]: TRIAL_ID },
    {},
    'show-1',
    [],
    { showId: 'show-1', mode: 'add-classes' },
    undefined,
    createWizardTrialView([], []),
    normalized
  ).map(cls => ({ element: cls.element, level: cls.level, section: cls.section }));
}

describe('retained persisted classes (add-classes mode)', () => {
  it('saves an unrelated change: a legacy invalid row is neither validated nor re-written', () => {
    const trials = [persistedTrial([legacyDetective], 'Scent Work')];

    expect(writtenClasses(trials, [legacyRow])).toEqual([]);
  });

  it('adds a valid class next to a legacy invalid row, writing only the new class', () => {
    const trials = [persistedTrial([legacyDetective, validNew], 'Scent Work')];

    expect(writtenClasses(trials, [legacyRow])).toEqual([
      { element: 'Interior', level: 'Novice', section: 'A' },
    ]);
  });

  it('lets the class step pass with a legacy invalid row', () => {
    const trials = [persistedTrial([legacyDetective, validNew], 'Scent Work')];
    const show = { organization: 'AKC' } as Parameters<typeof getValidationMessagesForStep>[1];

    expect(
      getValidationMessagesForStep(2, show, trials, createWizardTrialView([], []), [legacyRow])
    ).toEqual([]);
  });

  it('retains a standalone class stored on a legacy untyped trial (A4, persisted half)', () => {
    const detective = {
      templateId: '',
      customizations: { className: 'Detective', element: 'Detective', level: null },
    };
    const trials = [persistedTrial([detective])];

    expect(
      writtenClasses(trials, [{ trialId: TRIAL_ID, element: 'Detective', level: null }])
    ).toEqual([]);
  });

  it('does not re-create a legacy row under its canonical triple', () => {
    const legacyNoviceA = {
      templateId: '',
      customizations: { className: 'Container Novice A', element: 'Container', level: 'Novice A' },
    };
    const canonicalDuplicate = {
      templateId: 'template-1',
      customizations: {
        className: 'Container Novice A',
        element: 'Container',
        level: 'Novice',
        section: 'A',
      },
    };
    const trials = [persistedTrial([canonicalDuplicate, legacyNoviceA, validNew], 'Scent Work')];

    expect(
      writtenClasses(trials, [
        { trialId: TRIAL_ID, element: 'Container', level: 'Novice A', section: '' },
      ])
    ).toEqual([{ element: 'Interior', level: 'Novice', section: 'A' }]);
  });

  it('still refuses a NEW invalid class, naming it, when retained rows are present', () => {
    const newInvalid = {
      templateId: 'template-1',
      customizations: { className: 'Bad new class', element: 'Unknown', level: 'Unknown' },
    };
    const trials = [persistedTrial([legacyDetective, newInvalid], 'Scent Work')];

    expect(() => normalizeWizardClassSelections('AKC', trials, [legacyRow])).toThrow(
      InvalidWizardClassConfigurationError
    );
    expect(() => normalizeWizardClassSelections('AKC', trials, [legacyRow])).toThrow(
      /Bad new class/
    );
  });

  it('refuses the same legacy identity when it is not persisted (a new class)', () => {
    expect(() =>
      normalizeWizardClassSelections('AKC', [persistedTrial([legacyDetective], 'Scent Work')], [])
    ).toThrow(/Detective/);
  });
});
