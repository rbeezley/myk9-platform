import { describe, it, expect } from 'vitest';
import { AKC_SCENT_WORK_LEVELS, ELEMENT_COLUMN_HEADERS } from '@/lib/reports/entryFormTypes';
import { getRegistry, getSport } from '../index';
import type { ElementSpec } from '../index';

/**
 * Phase 0 (multi-registry plan): the new `RegistrySport` shape must carry the exact same AKC
 * data the flat shape did. These tests are the no-drift guardrail — they pin the structure
 * against the source consts so a future registry edit can't silently change AKC output.
 */
describe('AKC scent-work sport (evolved RegistrySport shape)', () => {
  const sport = getSport(getRegistry('AKC'), 'scent-work');
  const byKey = (k: string): ElementSpec | undefined => sport.elements.find(e => e.key === k);

  it('levels are progression-ordered and sourced from AKC_SCENT_WORK_LEVELS', () => {
    const progression = sport.levels.filter(l => l.key !== 'detective');
    expect(progression.map(l => l.label)).toEqual([...AKC_SCENT_WORK_LEVELS]);
    expect(progression.map(l => l.order)).toEqual([1, 2, 3, 4]);
    // Detective sorts last (matches the premium LEVEL_ORDER it replaces).
    const detective = sport.levels.find(l => l.key === 'detective');
    expect(detective).toMatchObject({ label: 'Detective', order: 5 });
  });

  it('every element.levels key resolves to a declared level', () => {
    const levelKeys = new Set(sport.levels.map(l => l.key));
    for (const el of sport.elements) {
      for (const lvl of el.levels) {
        expect(levelKeys.has(lvl), `${el.key} references unknown level "${lvl}"`).toBe(true);
      }
    }
  });

  it('grid elements are the four Odor Search elements with headers from ELEMENT_COLUMN_HEADERS', () => {
    const grid = sport.elements.filter(e => e.grid);
    expect(grid.map(e => e.label)).toEqual(['Container', 'Interior', 'Exterior', 'Buried']);
    for (const el of grid) {
      expect(el.columnHeader).toBe(
        ELEMENT_COLUMN_HEADERS[el.label as keyof typeof ELEMENT_COLUMN_HEADERS]
      );
      expect(el.levels).toEqual(['novice', 'advanced', 'excellent', 'master']);
    }
  });

  it('Novice (and only Novice) is split A/B by ownership on the grid + HD elements', () => {
    for (const key of ['container', 'interior', 'exterior', 'buried', 'hd']) {
      const el = byKey(key)!;
      expect(Object.keys(el.variantsByLevel ?? {})).toEqual(['novice']);
      expect(el.variantsByLevel!.novice).toEqual([
        { key: 'A', label: 'A', kind: 'ownership' },
        { key: 'B', label: 'B', kind: 'ownership' },
      ]);
    }
  });

  it('Handler Discrimination has four levels but is rendered outside the grid', () => {
    const hd = byKey('hd')!;
    expect(hd.grid).toBe(false);
    expect(hd.levels).toEqual(['novice', 'advanced', 'excellent', 'master']);
    expect(hd.columnHeader).toBe(ELEMENT_COLUMN_HEADERS['Handler Discrimination']);
  });

  it('Detective is a single-level, no-section, non-grid element', () => {
    const det = byKey('detective')!;
    expect(det.grid).toBe(false);
    expect(det.levels).toEqual(['detective']);
    expect(det.variantsByLevel).toBeUndefined();
  });

  it('division groups elements into Odor Search / Handler Discrimination / Detective', () => {
    expect(sport.division).toEqual({
      container: 'Odor Search',
      interior: 'Odor Search',
      exterior: 'Odor Search',
      buried: 'Odor Search',
      hd: 'Handler Discrimination',
      detective: 'Detective',
    });
  });
});
