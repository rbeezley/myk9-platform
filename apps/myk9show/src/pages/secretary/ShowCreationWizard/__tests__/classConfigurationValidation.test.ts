import { describe, expect, it } from 'vitest';
import {
  assertValidWizardClassSelections,
  normalizeWizardClassTriple,
  wizardClassIdentityKey,
} from '../classConfigurationValidation';

describe('normalizeWizardClassTriple', () => {
  it('round-trips legacy element aliases, ownership variants, and whitespace', () => {
    const triple = normalizeWizardClassTriple('AKC', 'Scent Work', {
      element: '  Containers  ',
      level: '  novice ',
      section: '  a  ',
    });

    expect(triple).toEqual({
      registryId: 'AKC',
      element: 'Container',
      level: 'Novice',
      section: 'A',
    });
    expect(() =>
      assertValidWizardClassSelections('AKC', [
        {
          id: 'trial-1',
          trialType: 'Scent Work',
          classes: [
            {
              customizations: {
                element: triple.element,
                level: triple.level,
                section: triple.section,
              },
            },
          ],
        },
      ])
    ).not.toThrow();
  });

  it('keeps ASCA base classes unsectioned and canonicalizes continuation sections', () => {
    expect(
      normalizeWizardClassTriple('ASCA', 'Scent Detection', {
        element: ' Containers ',
        level: ' Novice ',
        section: '   ',
      })
    ).toEqual({ registryId: 'ASCA', element: 'Container', level: 'Novice', section: '' });
    expect(
      normalizeWizardClassTriple('ASCA', 'Scent Detection', {
        element: 'Containers',
        level: 'Novice',
        section: ' Level C ',
      })
    ).toEqual({ registryId: 'ASCA', element: 'Container', level: 'Novice', section: 'C' });
  });

  it('uses the normalized triple for validation-to-persistence identity and deduplication', () => {
    const legacy = normalizeWizardClassTriple('AKC', 'Scent Work', {
      element: 'Containers',
      level: 'Novice',
      section: ' A ',
    });
    const canonical = normalizeWizardClassTriple('AKC', 'Scent Work', {
      element: 'Container',
      level: 'Novice',
      section: 'A',
    });

    expect(wizardClassIdentityKey('trial-1', legacy)).toBe(
      wizardClassIdentityKey('trial-1', canonical)
    );
  });
});
