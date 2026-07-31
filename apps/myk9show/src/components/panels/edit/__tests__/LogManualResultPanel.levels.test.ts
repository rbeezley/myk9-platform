import { describe, it, expect } from 'vitest';
import { levelOptionsForTemplate } from '../LogManualResultPanel.helpers';

/**
 * The Level select's options — `levelOptionsForTemplate` is exactly what the Level
 * `<SelectContent>` maps over, so these assertions are about what a user can pick.
 *
 * The per-registry level matrix is owned by `features/registries/__tests__/elementLevels.test.ts`.
 * What is tested here is only what this wrapper adds: the null-template guard, the
 * no-element-selected case, and the one UI-facing regression pin.
 */

// Seeded rows, narrowed to the fields the helper reads. `levels` is the flat column.
const UKC = {
  sport_code: 'ukc-nosework',
  levels: ['Novice', 'Advanced', 'Superior', 'Master', 'Elite'],
  elements: ['Container', 'Interior', 'Exterior', 'Vehicle', 'Handler Discrimination'],
};

const ASCA = {
  sport_code: 'asca-scent-detection',
  levels: ['Novice', 'Open', 'Advanced', 'Excellent'],
  elements: ['Container', 'Interior', 'Exterior', 'Vehicle'],
};

describe('levelOptionsForTemplate', () => {
  it('offers UKC Handler Discrimination its own levels, not the flat column', () => {
    // The regression: the select used to map `template.levels`, which offered HD the Superior
    // and Elite classes UKC does not run and no way to record an Excellent (EHD) result.
    const options = levelOptionsForTemplate(UKC, 'Handler Discrimination');
    expect(options).toEqual(['Novice', 'Advanced', 'Excellent', 'Master']);
    expect(options).not.toEqual(UKC.levels);
  });

  it('spans every element the template offers before one is chosen', () => {
    const options = levelOptionsForTemplate(UKC, '');
    expect(options).toContain('Superior'); // grid elements
    expect(options).toContain('Excellent'); // Handler Discrimination
    expect(options).toContain('Elite');
  });

  it('does not offer a registry level the template has no class for', () => {
    // ASCA 'Champion' is a real registry level held back from `sport_templates` by decision —
    // titling/invitational, not a scheduled class. Offering it would let a result be saved
    // against a level with no class and no title to credit it.
    expect(levelOptionsForTemplate(ASCA, '')).toEqual(['Novice', 'Open', 'Advanced', 'Excellent']);
  });

  it('offers nothing when no template is chosen', () => {
    expect(levelOptionsForTemplate(null, '')).toEqual([]);
  });
});
