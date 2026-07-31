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

// A seeded row, narrowed to the fields the helper reads. `levels` is the flat column.
const UKC = {
  sport_code: 'ukc-nosework',
  levels: ['Novice', 'Advanced', 'Superior', 'Master', 'Elite'],
};

describe('levelOptionsForTemplate', () => {
  it('offers UKC Handler Discrimination its own levels, not the flat column', () => {
    // The regression: the select used to map `template.levels`, which offered HD the Superior
    // and Elite classes UKC does not run and no way to record an Excellent (EHD) result.
    const options = levelOptionsForTemplate(UKC, 'Handler Discrimination');
    expect(options).toEqual(['Novice', 'Advanced', 'Excellent', 'Master']);
    expect(options).not.toEqual(UKC.levels);
  });

  it('offers the sport’s full set before an element is chosen, so the picker is never empty', () => {
    const options = levelOptionsForTemplate(UKC, '');
    expect(options).toContain('Superior');
    expect(options).toContain('Excellent');
    expect(options).toContain('Elite');
  });

  it('offers nothing when no template is chosen', () => {
    expect(levelOptionsForTemplate(null, '')).toEqual([]);
  });
});
