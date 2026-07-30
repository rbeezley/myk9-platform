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

  it('character length is in the expected range (guards against silent truncation)', () => {
    // Captured 2026-06-30: 5921 chars. Bounds allow ±5% drift before failing.
    expect(ASCA_EXHIBITOR_AGREEMENT.length).toBeGreaterThan(5625);
    expect(ASCA_EXHIBITOR_AGREEMENT.length).toBeLessThan(6217);
  });
});

describe('ASCA Scent Detection — generated class catalog', () => {
  const classes = generateScentWorkClasses(getScentWorkSport('ASCA'));
  const names = classes.map(c => c.className);

  it('produces 32 classes (4 elements × 4 levels × {base + Level C})', () => {
    expect(classes).toHaveLength(32);
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
    expect(
      classes.some(c => c.element === 'Buried' || c.element === 'Handler Discrimination')
    ).toBe(false);
  });

  it('has no Champion class — "Level C" is a continuation track, not a Champion level', () => {
    // This previously asserted a standalone Champion class, modeled on the assumption that
    // ASCA's "Level C" meant Champion. Rulebook §3.2.2 says otherwise: 3 qualifying scores
    // earn the base element title, 7 more (10 total) earn the Level C element title
    // (SCNc-C, SCNi-C, …). Earning that makes a team a champion OF that element and level —
    // it is not a class anyone enters. Competition levels run §5 Novice → §8 Excellent,
    // then §9 is Faults.
    expect(classes.some(c => c.element === 'Champion')).toBe(false);
    expect(names.some(n => n.includes('Champion'))).toBe(false);

    // Every level is a real, enterable level with both a base and a Level C class.
    expect([...new Set(classes.map(c => c.level))].sort()).toEqual([
      'Advanced',
      'Excellent',
      'Novice',
      'Open',
    ]);
  });
});
