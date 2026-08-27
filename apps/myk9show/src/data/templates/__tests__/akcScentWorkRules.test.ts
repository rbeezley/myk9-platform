import { describe, it, expect } from 'vitest';
import { generateAKCScentWorkClasses } from '../akcScentWorkRules';

/**
 * Phase 2b: the AKC ClassDefinition generator now derives structure from the registry
 * (generateScentWorkClasses) and attaches rule field-overrides per class. These tests pin the
 * canonical labels/order and confirm the field-override values survived the migration.
 */
describe('generateAKCScentWorkClasses (ClassDefinition)', () => {
  const classes = generateAKCScentWorkClasses();
  const byName = (name: string) => classes.find(c => c.className === name);

  it('produces 26 classes in canonical registry order', () => {
    expect(classes).toHaveLength(26);
    expect(classes.map(c => c.className).slice(0, 6)).toEqual([
      'Container Novice A',
      'Container Novice B',
      'Container Advanced',
      'Container Excellent',
      'Container Master',
      'Interior Novice A',
    ]);
    expect(classes.map(c => c.displayOrder)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
  });

  it('uses canonical labels — no "Masters", no "(HD)" in any element', () => {
    expect(classes.some(c => c.level === 'Masters')).toBe(false);
    expect(classes.some(c => c.element?.includes('(HD)'))).toBe(false);
    expect(classes.filter(c => c.element === 'Handler Discrimination')).toHaveLength(5);
  });

  it('preserves the rule field-overrides for a standard Novice class', () => {
    const c = byName('Container Novice A');
    expect(c).toMatchObject({ element: 'Container', level: 'Novice', section: 'A' });
    expect(c?.fieldOverrides).toMatchObject({
      searchAreas: { ruleValue: 1 },
      hides: { ruleValue: 'Set by Rules: 1' },
      distractions: { ruleValue: 0 },
      estimatedJudgingTime: { defaultValue: 2.5 },
      timeLimit1: { ruleValue: '2 minutes', fieldSource: 'rule-based' },
    });
    expect(c?.fieldOverrides).not.toHaveProperty('hcdExclude');
  });

  it('preserves multi-area overrides for Interior Master', () => {
    const c = byName('Interior Master');
    expect(c?.fieldOverrides?.searchAreas).toEqual({ ruleValue: 3 });
    expect(c?.fieldOverrides).toHaveProperty('timeLimit2');
    expect(c?.fieldOverrides).toHaveProperty('timeLimit3');
  });

  it('uses the fixed three-hide total for Interior Excellent', () => {
    const interiorExcellent = byName('Interior Excellent');

    expect(interiorExcellent?.fieldOverrides?.hides).toEqual({ ruleValue: 'Set by Rules: 3' });
  });

  it('keeps Handler Discrimination Master fixed at three hides', () => {
    const handlerDiscriminationMaster = byName('Handler Discrimination Master');

    expect(handlerDiscriminationMaster?.fieldOverrides?.hides).toEqual({
      ruleValue: 'Set by Rules: 3 per class',
    });
  });

  it('marks Handler Discrimination classes hcdExclude with the canonical element label', () => {
    const hd = byName('Handler Discrimination Novice A');
    expect(hd).toMatchObject({ element: 'Handler Discrimination', level: 'Novice', section: 'A' });
    expect(hd?.fieldOverrides?.hcdExclude).toEqual({ defaultValue: true });
  });

  it('keeps Detective standalone with its fee + entry-limit overrides', () => {
    const det = byName('Detective');
    expect(det?.element).toBe('Detective');
    expect(det?.level).toBeUndefined();
    expect(det?.section).toBeUndefined();
    expect(det?.fieldOverrides).toMatchObject({
      hides: { ruleValue: 'Set by Judge: 5-10' },
      distractions: { ruleValue: 4, helpText: 'Judge sets 4-6 distractions' },
      preEntryFee: { defaultValue: 35 },
      dayOfShowFee: { defaultValue: 40 },
      maxEntries: { defaultValue: 30 },
    });
  });
});
