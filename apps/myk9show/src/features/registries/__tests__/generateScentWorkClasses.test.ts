import { describe, it, expect } from 'vitest';
import { generateScentWorkClasses, getScentWorkSport } from '../scentWork';

/**
 * Tests for the registry-driven scent-work class generator (Phase 2). Asserts the canonical
 * AKC catalog: structure derived from the registry, with canonical labels ('Master', not
 * 'Masters'; 'Handler Discrimination', not 'Handler Discrimination (HD)'). This is the single
 * source of truth the two legacy AKC generators migrate onto.
 */
describe('generateScentWorkClasses — AKC', () => {
  const classes = generateScentWorkClasses(getScentWorkSport('AKC'));
  const names = classes.map(c => c.className);

  it('produces the canonical 26-class AKC catalog', () => {
    expect(classes).toHaveLength(26);
  });

  it('emits each grid element with Novice A/B + Advanced/Excellent/Master (canonical labels)', () => {
    for (const element of ['Container', 'Interior', 'Exterior', 'Buried']) {
      expect(names).toEqual(
        expect.arrayContaining([
          `${element} Novice A`,
          `${element} Novice B`,
          `${element} Advanced`,
          `${element} Excellent`,
          `${element} Master`,
        ])
      );
    }
  });

  it('emits Handler Discrimination with the canonical label and 5 classes', () => {
    const hd = classes.filter(c => c.element === 'Handler Discrimination');
    expect(hd.map(c => c.className)).toEqual([
      'Handler Discrimination Novice A',
      'Handler Discrimination Novice B',
      'Handler Discrimination Advanced',
      'Handler Discrimination Excellent',
      'Handler Discrimination Master',
    ]);
  });

  it('emits Detective as a single standalone class (no level, no section)', () => {
    const detective = classes.filter(c => c.element === 'Detective');
    expect(detective).toEqual([
      { element: 'Detective', level: undefined, className: 'Detective' },
    ]);
  });

  it('sets section only on Novice classes, by ownership', () => {
    const withSection = classes.filter(c => c.section);
    expect(withSection.every(c => c.level === 'Novice')).toBe(true);
    expect(new Set(withSection.map(c => c.section))).toEqual(new Set(['A', 'B']));
    // 5 elements (4 grid + HD) × 2 sections = 10 sectioned classes.
    expect(withSection).toHaveLength(10);
  });

  it('uses canonical labels — no "Masters" / "Handler Discrimination (HD)" drift', () => {
    expect(names.some(n => n.includes('Masters'))).toBe(false);
    expect(names.some(n => n.includes('(HD)'))).toBe(false);
    expect(classes.every(c => c.level !== 'Masters')).toBe(true);
  });
});
