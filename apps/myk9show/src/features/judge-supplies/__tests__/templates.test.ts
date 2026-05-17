import { describe, it, expect } from 'vitest';
import { getSupplyTemplate, KNOWN_REGISTRY_IDS } from '../templates';

describe('getSupplyTemplate', () => {
  it('returns the AKC list for registry_id AKC', () => {
    const items = getSupplyTemplate('AKC');
    expect(items.length).toBeGreaterThan(0);
    expect(items.some(i => i.label === 'Clipboard')).toBe(true);
    expect(items.some(i => i.label === 'Highlighter')).toBe(true);
  });

  it('returns the UKC list for registry_id UKC', () => {
    const items = getSupplyTemplate('UKC');
    expect(items.length).toBeGreaterThan(0);
    expect(items.some(i => i.label === 'Clipboard')).toBe(true);
    // UKC list does not include Highlighter per the seeded template.
    expect(items.some(i => i.label === 'Highlighter')).toBe(false);
  });

  it('falls back to the default template for an unknown registry', () => {
    const items = getSupplyTemplate('UNKNOWN');
    expect(items.length).toBeGreaterThan(0);
    expect(items.some(i => i.label === 'Clipboard')).toBe(true);
  });

  it('falls back to the default template for null registry_id', () => {
    const items = getSupplyTemplate(null);
    expect(items.length).toBeGreaterThan(0);
  });

  it('falls back to the default template for undefined registry_id', () => {
    const items = getSupplyTemplate(undefined);
    expect(items.length).toBeGreaterThan(0);
  });

  it('returns items with valid label and sort fields', () => {
    for (const registry of [...KNOWN_REGISTRY_IDS, 'UNKNOWN']) {
      const items = getSupplyTemplate(registry);
      for (const item of items) {
        expect(typeof item.label).toBe('string');
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.label.length).toBeLessThanOrEqual(200);
        expect(typeof item.sort).toBe('number');
        expect(item.sort).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('returns items in ascending sort order within each registry', () => {
    for (const registry of KNOWN_REGISTRY_IDS) {
      const items = getSupplyTemplate(registry);
      const sorts = items.map(i => i.sort);
      const sorted = [...sorts].sort((a, b) => a - b);
      expect(sorts).toEqual(sorted);
    }
  });

  it('exposes the known registry list', () => {
    expect(KNOWN_REGISTRY_IDS).toContain('AKC');
    expect(KNOWN_REGISTRY_IDS).toContain('UKC');
  });
});
