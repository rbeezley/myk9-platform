import { describe, it, expect } from 'vitest';
import { generateAKCScentWorkClasses } from '../akc-scent-work-generator';

/**
 * Phase 2c: the GeneratedClass generator (showTemplateStore path) now derives structure from the
 * registry and attaches the customField prose. Pins canonical labels/order and verifies the
 * customFields survived the migration. 'Masters' → 'Master' is the intentional reconciliation.
 */
describe('generateAKCScentWorkClasses (GeneratedClass)', () => {
  const classes = generateAKCScentWorkClasses();
  const byName = (name: string) => classes.find(c => c.className === name);

  it('produces 26 classes in canonical registry order with canonical labels', () => {
    expect(classes).toHaveLength(26);
    expect(classes.map(c => c.className).slice(0, 5)).toEqual([
      'Container Novice A',
      'Container Novice B',
      'Container Advanced',
      'Container Excellent',
      'Container Master',
    ]);
    expect(classes.some(c => c.level === 'Masters')).toBe(false);
    expect(classes.some(c => c.className.includes('Masters'))).toBe(false);
  });

  it('preserves customFields for a standard Novice class', () => {
    expect(byName('Container Novice A')).toMatchObject({
      element: 'Container',
      level: 'Novice',
      section: 'A',
      maxEntries: 40,
      customFields: {
        searchType: 'Known number',
        hideCount: '1',
        offLeashOption: 'true',
      },
    });
  });

  it('keeps the Interior-Excellent special-case (Unknown number / 1-3 hides)', () => {
    expect(byName('Interior Excellent')?.customFields).toMatchObject({
      searchType: 'Unknown number',
      hideCount: 'Unknown (1-3)',
    });
    expect(byName('Container Excellent')?.customFields).toMatchObject({
      searchType: 'Known number',
      hideCount: 'Variable',
    });
  });

  it('emits Handler Discrimination with canonical label + its special customField', () => {
    const hd = byName('Handler Discrimination Master');
    expect(hd?.element).toBe('Handler Discrimination');
    expect(hd?.level).toBe('Master');
    expect(hd?.customFields).toMatchObject({
      searchType: 'Unknown number',
      special: 'Hide location changes between competitors',
    });
  });

  it('keeps Detective standalone with maxEntries 30 and its special customField', () => {
    const det = byName('Detective');
    expect(det?.element).toBe('Detective');
    expect(det?.level).toBeUndefined();
    expect(det?.maxEntries).toBe(30);
    expect(det?.customFields).toMatchObject({
      special: 'Combines interior and exterior elements in one large search area',
    });
  });
});
