import { describe, it, expect } from 'vitest';
import { getRegistry } from '../index';
import { generateScentWorkClasses, getScentWorkSport } from '../scentWork';
import { ASCA_EXHIBITOR_AGREEMENT } from '../asca';

/**
 * Phase 4: ASCA Scent Detection registry config — the first registry to exercise the
 * `continuation` variant path (Level C). Pins identity/legal and the generated catalog,
 * especially that each base level keeps BOTH a base class and a Level C class.
 */
describe('ASCA registry — identity & legal', () => {
  const asca = getRegistry('ASCA');

  it('has the expected identity strings', () => {
    expect(asca.name).toBe('The Australian Shepherd Club of America');
    expect(asca.shortName).toBe('ASCA');
    expect(asca.licenseLanguage).toBe('An ASCA Sanctioned Scent Detection Trial');
    expect(asca.registrationField.label).toBe('ASCA Registration # (LEP/QT/REGULAR)');
  });

  it('exhibitor agreement is the ASCA release (3 blocks) with the Texas-venue + indemnity clauses', () => {
    expect(asca.exhibitorAgreement).toBe(ASCA_EXHIBITOR_AGREEMENT);
    expect(ASCA_EXHIBITOR_AGREEMENT.split('\n\n')).toHaveLength(3);
    expect(ASCA_EXHIBITOR_AGREEMENT).toMatch(/courts serving Brazos County, Texas/);
    expect(ASCA_EXHIBITOR_AGREEMENT).toMatch(/indemnify and hold Releasees harmless/);
    expect(ASCA_EXHIBITOR_AGREEMENT).toMatch(/AS USED HERE, "ASCA®" MEANS/);
  });
});

describe('ASCA Scent Detection — generated class catalog', () => {
  const classes = generateScentWorkClasses(getScentWorkSport('ASCA'));
  const names = classes.map(c => c.className);

  it('produces 33 classes (4 elements × 4 base levels × {base + Level C} + Champion)', () => {
    expect(classes).toHaveLength(33);
  });

  it('keeps BOTH the base class and the Level C class for each base level (continuation)', () => {
    expect(names).toEqual(
      expect.arrayContaining([
        'Container Novice',
        'Container Novice Level C',
        'Container Open',
        'Container Open Level C',
        'Container Excellent',
        'Container Excellent Level C',
      ])
    );
    // Level C sections are 'C' with continuation kind (not ownership) — base is NOT dropped.
    const noviceC = classes.find(c => c.className === 'Container Novice Level C');
    expect(noviceC).toMatchObject({ element: 'Container', level: 'Novice', section: 'C' });
  });

  it('uses ASCA-only level vocabulary (Open) and excludes AKC/UKC-only elements', () => {
    expect(names.some(n => n.includes('Open'))).toBe(true);
    expect(classes.some(c => c.element === 'Vehicle')).toBe(true);
    expect(classes.some(c => c.element === 'Buried' || c.element === 'Handler Discrimination')).toBe(
      false
    );
  });

  it('Champion is a single standalone class with no level, no section, and no Level C', () => {
    const champion = classes.filter(c => c.element === 'Champion');
    expect(champion).toEqual([{ element: 'Champion', className: 'Champion' }]);
    expect(names).not.toContain('Champion Level C');
  });
});
