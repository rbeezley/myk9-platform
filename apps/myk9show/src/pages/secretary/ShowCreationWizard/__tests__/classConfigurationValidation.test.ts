import { describe, expect, it } from 'vitest';
import {
  excludePersistedClasses,
  InvalidWizardClassConfigurationError,
  normalizeWizardClassSelections,
} from '../classConfigurationValidation';
import type { WizardTrial } from '../showCreationWizardTransformers';

function trial(
  trialType: string,
  customizations: Record<string, unknown>,
  id = 'trial-1'
): WizardTrial {
  return {
    id,
    trialType,
    dateTime: '2026-06-01T09:00:00',
    eventNumber: 'EVT-1',
    classes: [{ templateId: 'template-1', customizations }],
  };
}

describe('normalizeWizardClassSelections', () => {
  it('rejects unresolved sentinels and includes the class name in feedback', () => {
    expect(() =>
      normalizeWizardClassSelections('AKC', [
        trial('Scent Work', {
          className: 'Unresolved class',
          element: 'Unknown',
          level: 'Unknown',
        }),
      ])
    ).toThrow(/Unresolved class.*element/i);

    expect(() =>
      normalizeWizardClassSelections('AKC', [
        trial('Obedience', {
          className: 'Unresolved section',
          element: 'Utility',
          level: 'B',
          section: 'Unknown',
        }),
      ])
    ).toThrow(/Unresolved section.*section/i);
  });

  it('rejects a level and section combination not present in the selected registry', () => {
    try {
      normalizeWizardClassSelections('AKC', [
        trial('Scent Work', {
          className: 'Container Master B',
          element: 'Container',
          level: 'Master',
          section: 'B',
        }),
      ]);
      expect.fail('Expected the foreign registry triple to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidWizardClassConfigurationError);
      expect((error as InvalidWizardClassConfigurationError).invalidClasses[0]).toMatchObject({
        className: 'Container Master B',
      });
      expect((error as Error).message).toMatch(/AKC registry/i);
    }
  });

  it.each([
    'Scent Work',
    'SCENT_WORK',
    'scent_work',
    'scent-work',
    'Scentwork',
    'AKC Scent Work',
    'UKC Nosework',
    'Nosework',
    'ASCA Scent Detection',
    'Scent Detection',
  ])('validates %s trial types against the registry catalog', trialType => {
    expect(() =>
      normalizeWizardClassSelections('AKC', [
        trial(trialType, {
          className: 'Cloned Container Master B',
          element: 'Container',
          level: 'Master',
          section: 'B',
        }),
      ])
    ).toThrow(/Cloned Container Master B.*AKC registry/i);
  });

  it('leaves an unclassified custom discipline outside the scent-work matrix', () => {
    const normalized = normalizeWizardClassSelections('AKC', [
      trial('Future Discipline', {
        className: 'Custom Container Master B',
        element: 'Container',
        level: 'Master',
        section: 'B',
      }),
    ]);

    expect(normalized[0]!.triple).toEqual({
      registryId: 'AKC',
      element: 'Container',
      level: 'Master',
      section: 'B',
    });
  });

  it('rejects the retained-class unresolved element sentinel for non-scent trials', () => {
    expect(() =>
      normalizeWizardClassSelections('AKC', [
        trial('Obedience', {
          className: 'Retained class',
          element: 'Unknown Element',
          level: 'Novice',
        }),
      ])
    ).toThrow(/Retained class.*element.*unresolved/i);
  });

  it('canonicalizes configured standalone elements to an empty level', () => {
    const normalized = normalizeWizardClassSelections('AKC', [
      trial('Scent Work', {
        className: 'Detective',
        element: 'Detective',
        level: 'Detective',
      }),
    ]);

    expect(normalized[0]!.triple).toEqual({
      registryId: 'AKC',
      element: 'Detective',
      level: '',
      section: '',
    });
  });

  it('normalizes grid-label aliases and ownership variants from registry configuration', () => {
    const normalized = normalizeWizardClassSelections('AKC', [
      trial('Scent Work', {
        className: 'Novice A',
        element: ' Containers ',
        level: 'Novice A',
      }),
    ]);

    expect(normalized[0]!.triple).toEqual({
      registryId: 'AKC',
      element: 'Container',
      level: 'Novice',
      section: 'A',
    });
  });

  it('rejects a composite level that conflicts with its explicit section', () => {
    expect(() =>
      normalizeWizardClassSelections('AKC', [
        trial('Scent Work', {
          className: 'Container Novice A',
          element: 'Container',
          level: 'Novice A',
          section: 'B',
        }),
      ])
    ).toThrow(/Container Novice A.*conflicts with section/i);
  });

  it('rejects a blank ownership section but accepts configured continuation classes', () => {
    expect(() =>
      normalizeWizardClassSelections('UKC', [
        trial('Nosework', { className: 'Container Novice', element: 'Container', level: 'Novice' }),
      ])
    ).toThrow(/section is required/i);

    const asca = normalizeWizardClassSelections('ASCA', [
      trial('Scent Detection', {
        className: 'Container Novice Level C',
        element: 'Container',
        level: 'Novice',
        section: 'Level C',
      }),
    ]);
    expect(asca[0]!.triple).toEqual({
      registryId: 'ASCA',
      element: 'Container',
      level: 'Novice',
      section: 'C',
    });
  });

  it('leaves non-scent-work sport labels outside the scent-work catalog', () => {
    const normalized = normalizeWizardClassSelections('UKC', [
      trial('Obedience', { className: 'Utility', element: 'Utility', level: 'B' }),
    ]);
    expect(normalized[0]!.triple).toEqual({
      registryId: 'UKC',
      element: 'Utility',
      level: 'B',
      section: '',
    });
  });
});

describe('excludePersistedClasses (add-classes mode)', () => {
  it('does not re-create a legacy persisted row under its canonical triple', () => {
    const legacy = { className: 'Container Novice A', element: 'Container', level: 'Novice A' };
    const added = {
      className: 'Interior Novice A',
      element: 'Interior',
      level: 'Novice',
      section: 'A',
    };
    const trials: WizardTrial[] = [
      {
        id: 'trial-1',
        trialType: 'Scent Work',
        dateTime: '2026-06-01T09:00:00',
        eventNumber: 'EVT-1',
        classes: [
          { templateId: '', customizations: { ...legacy, section: '' } },
          { templateId: 'template-1', customizations: added },
        ],
      },
    ];
    const normalized = normalizeWizardClassSelections('AKC', trials);
    const written = normalized.map(selection => ({
      trialId: selection.trialId,
      element: selection.triple.element,
      level: selection.triple.level,
      section: selection.triple.section,
    }));

    const toCreate = excludePersistedClasses(written, normalized, trials, [
      { trialId: 'trial-1', element: 'Container', level: 'Novice A', section: '' },
    ]);

    expect(toCreate).toEqual([
      { trialId: 'trial-1', element: 'Interior', level: 'Novice', section: 'A' },
    ]);
  });

  it('treats a NULL persisted level as the empty level of a standalone class', () => {
    const trials = [
      trial('Scent Work', { className: 'Detective', element: 'Detective', level: null }),
    ];
    const normalized = normalizeWizardClassSelections('AKC', trials);
    const written = [{ trialId: 'trial-1', element: 'Detective', level: '', section: '' }];

    expect(
      excludePersistedClasses(written, normalized, trials, [
        { trialId: 'trial-1', element: 'Detective', level: null, section: null },
      ])
    ).toEqual([]);
  });
});
