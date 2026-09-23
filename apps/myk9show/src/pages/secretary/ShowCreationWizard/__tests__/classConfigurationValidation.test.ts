import { describe, expect, it } from 'vitest';
import {
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
