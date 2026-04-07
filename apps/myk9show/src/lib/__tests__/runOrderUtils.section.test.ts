/**
 * Tests for section-aware run order presets added to runOrderUtils.
 * Covers: hasMultipleSections, calculateRunOrder (section presets),
 * and calculateRunOrderScoped.
 */
import { describe, it, expect } from 'vitest';
import { hasMultipleSections, calculateRunOrder, calculateRunOrderScoped } from '../runOrderUtils';

// ─── Fixture entries ──────────────────────────────────────────────────────────

const aEntries = [
  { id: 'a1', armband: '1', section: 'A' },
  { id: 'a2', armband: '3', section: 'A' },
  { id: 'a3', armband: '2', section: 'A' },
];

const bEntries = [
  { id: 'b1', armband: '4', section: 'B' },
  { id: 'b2', armband: '6', section: 'B' },
  { id: 'b3', armband: '5', section: 'B' },
];

const mixed = [...aEntries, ...bEntries];

// Entries without section data (single-section or no-section class)
const noSectionEntries = [
  { id: 'e1', armband: '1', section: null },
  { id: 'e2', armband: '2', section: null },
];

// ─── hasMultipleSections ──────────────────────────────────────────────────────

describe('hasMultipleSections', () => {
  it('returns true when A and B entries are both present', () => {
    expect(hasMultipleSections(mixed)).toBe(true);
  });

  it('returns false when all entries are section A', () => {
    expect(hasMultipleSections(aEntries)).toBe(false);
  });

  it('returns false when all entries have null section', () => {
    expect(hasMultipleSections(noSectionEntries)).toBe(false);
  });

  it('returns false for an empty list', () => {
    expect(hasMultipleSections([])).toBe(false);
  });

  it('returns false when entries have identical sections', () => {
    const same = [
      { id: 'x1', armband: '1', section: 'B' },
      { id: 'x2', armband: '2', section: 'B' },
    ];
    expect(hasMultipleSections(same)).toBe(false);
  });

  it('handles entries without a section property', () => {
    const noSection = [
      { id: 'x1', armband: '1' },
      { id: 'x2', armband: '2' },
    ];
    expect(hasMultipleSections(noSection)).toBe(false);
  });
});

// ─── calculateRunOrder — a-then-b-asc ────────────────────────────────────────

describe('calculateRunOrder — a-then-b-asc', () => {
  it('places all A entries before B entries', () => {
    const result = calculateRunOrder(mixed, 'a-then-b-asc');
    const ids = result.map(r => r.id);
    const aPositions = ids.filter(id => id.startsWith('a'));
    const bPositions = ids.filter(id => id.startsWith('b'));
    // All A ids come before all B ids
    expect(ids.indexOf(aPositions[aPositions.length - 1])).toBeLessThan(ids.indexOf(bPositions[0]));
  });

  it('sorts A section ascending by armband', () => {
    const result = calculateRunOrder(mixed, 'a-then-b-asc');
    const aResults = result.filter(r => r.id.startsWith('a'));
    expect(aResults.map(r => r.id)).toEqual(['a1', 'a3', 'a2']); // armbands 1, 2, 3
  });

  it('sorts B section ascending by armband', () => {
    const result = calculateRunOrder(mixed, 'a-then-b-asc');
    const bResults = result.filter(r => r.id.startsWith('b'));
    expect(bResults.map(r => r.id)).toEqual(['b1', 'b3', 'b2']); // armbands 4, 5, 6
  });

  it('assigns 1-based contiguous run orders', () => {
    const result = calculateRunOrder(mixed, 'a-then-b-asc');
    expect(result.map(r => r.runOrder)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

// ─── calculateRunOrder — a-then-b-desc ───────────────────────────────────────

describe('calculateRunOrder — a-then-b-desc', () => {
  it('places all A entries before B entries', () => {
    const result = calculateRunOrder(mixed, 'a-then-b-desc');
    const ids = result.map(r => r.id);
    const lastA = Math.max(...ids.map((id, i) => (id.startsWith('a') ? i : -1)));
    const firstB = ids.findIndex(id => id.startsWith('b'));
    expect(lastA).toBeLessThan(firstB);
  });

  it('sorts A section descending by armband', () => {
    const result = calculateRunOrder(mixed, 'a-then-b-desc');
    const aResults = result.filter(r => r.id.startsWith('a'));
    expect(aResults.map(r => r.id)).toEqual(['a2', 'a3', 'a1']); // armbands 3, 2, 1
  });

  it('sorts B section descending by armband', () => {
    const result = calculateRunOrder(mixed, 'a-then-b-desc');
    const bResults = result.filter(r => r.id.startsWith('b'));
    expect(bResults.map(r => r.id)).toEqual(['b2', 'b3', 'b1']); // armbands 6, 5, 4
  });
});

// ─── calculateRunOrder — b-then-a-asc ────────────────────────────────────────

describe('calculateRunOrder — b-then-a-asc', () => {
  it('places all B entries before A entries', () => {
    const result = calculateRunOrder(mixed, 'b-then-a-asc');
    const ids = result.map(r => r.id);
    const lastB = Math.max(...ids.map((id, i) => (id.startsWith('b') ? i : -1)));
    const firstA = ids.findIndex(id => id.startsWith('a'));
    expect(lastB).toBeLessThan(firstA);
  });

  it('sorts B section ascending by armband', () => {
    const result = calculateRunOrder(mixed, 'b-then-a-asc');
    const bResults = result.filter(r => r.id.startsWith('b'));
    expect(bResults.map(r => r.id)).toEqual(['b1', 'b3', 'b2']); // armbands 4, 5, 6
  });

  it('sorts A section ascending by armband', () => {
    const result = calculateRunOrder(mixed, 'b-then-a-asc');
    const aResults = result.filter(r => r.id.startsWith('a'));
    expect(aResults.map(r => r.id)).toEqual(['a1', 'a3', 'a2']); // armbands 1, 2, 3
  });
});

// ─── calculateRunOrder — b-then-a-desc ───────────────────────────────────────

describe('calculateRunOrder — b-then-a-desc', () => {
  it('places all B entries before A entries, both descending', () => {
    const result = calculateRunOrder(mixed, 'b-then-a-desc');
    const ids = result.map(r => r.id);
    const lastB = Math.max(...ids.map((id, i) => (id.startsWith('b') ? i : -1)));
    const firstA = ids.findIndex(id => id.startsWith('a'));
    expect(lastB).toBeLessThan(firstA);
  });

  it('sorts B section descending', () => {
    const result = calculateRunOrder(mixed, 'b-then-a-desc');
    const bResults = result.filter(r => r.id.startsWith('b'));
    expect(bResults.map(r => r.id)).toEqual(['b2', 'b3', 'b1']); // 6, 5, 4
  });

  it('sorts A section descending', () => {
    const result = calculateRunOrder(mixed, 'b-then-a-desc');
    const aResults = result.filter(r => r.id.startsWith('a'));
    expect(aResults.map(r => r.id)).toEqual(['a2', 'a3', 'a1']); // 3, 2, 1
  });
});

// ─── calculateRunOrder — random-sections ─────────────────────────────────────

describe('calculateRunOrder — random-sections', () => {
  it('returns all entries', () => {
    const result = calculateRunOrder(mixed, 'random-sections');
    expect(result).toHaveLength(mixed.length);
    expect(result.map(r => r.id).sort()).toEqual(mixed.map(e => e.id).sort());
  });

  it('assigns 1-based contiguous run orders', () => {
    const result = calculateRunOrder(mixed, 'random-sections');
    const orders = result.map(r => r.runOrder).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('places all A entries before B entries in the output', () => {
    const result = calculateRunOrder(mixed, 'random-sections');
    const ids = result.map(r => r.id);
    const lastA = Math.max(...ids.map((id, i) => (id.startsWith('a') ? i : -1)));
    const firstB = ids.findIndex(id => id.startsWith('b'));
    expect(lastA).toBeLessThan(firstB);
  });

  it('does not mutate the input array', () => {
    const copy = mixed.map(e => ({ ...e }));
    calculateRunOrder(mixed, 'random-sections');
    expect(mixed.map(e => e.id)).toEqual(copy.map(e => e.id));
  });

  it('appends entries without sections at the end', () => {
    const withOther = [...aEntries, ...bEntries, { id: 'x1', armband: '99', section: null }];
    const result = calculateRunOrder(withOther, 'random-sections');
    expect(result[result.length - 1].id).toBe('x1');
  });
});

// ─── calculateRunOrderScoped ──────────────────────────────────────────────────

describe('calculateRunOrderScoped', () => {
  describe('renumber mode', () => {
    it('places scoped section first (1, 2, 3…)', () => {
      const result = calculateRunOrderScoped(mixed, 'armband-asc', 'A', 'renumber');
      // A section sorted asc: a1(1), a3(2), a2(3) — runOrders 1,2,3
      const aResults = result
        .filter(r => r.id.startsWith('a'))
        .sort((x, y) => x.runOrder - y.runOrder);
      expect(aResults[0].runOrder).toBe(1);
      expect(aResults[aResults.length - 1].runOrder).toBe(3);
    });

    it('places other section after scoped section', () => {
      const result = calculateRunOrderScoped(mixed, 'armband-asc', 'A', 'renumber');
      const bResults = result.filter(r => r.id.startsWith('b'));
      bResults.forEach(r => expect(r.runOrder).toBeGreaterThan(3));
    });

    it('returns run orders for all entries', () => {
      const result = calculateRunOrderScoped(mixed, 'armband-asc', 'A', 'renumber');
      expect(result).toHaveLength(mixed.length);
    });

    it('contiguous run orders with no gaps', () => {
      const result = calculateRunOrderScoped(mixed, 'armband-asc', 'B', 'renumber');
      const orders = result.map(r => r.runOrder).sort((a, b) => a - b);
      expect(orders).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  describe('preserve mode', () => {
    it('offsets scoped entries after other entries', () => {
      const result = calculateRunOrderScoped(mixed, 'armband-asc', 'A', 'preserve');
      // 3 B entries get runOrders 1-3; A entries offset by 3 → 4-6
      const aResults = result.filter(r => r.id.startsWith('a'));
      aResults.forEach(r => expect(r.runOrder).toBeGreaterThan(3));
    });

    it('other entries get 1-based run orders', () => {
      const result = calculateRunOrderScoped(mixed, 'armband-asc', 'A', 'preserve');
      const bResults = result.filter(r => r.id.startsWith('b'));
      const bOrders = bResults.map(r => r.runOrder).sort((a, b) => a - b);
      expect(bOrders).toEqual([1, 2, 3]);
    });

    it('returns run orders for all entries', () => {
      const result = calculateRunOrderScoped(mixed, 'armband-asc', 'A', 'preserve');
      expect(result).toHaveLength(mixed.length);
    });
  });

  describe('edge cases', () => {
    it('handles scoping to a section with no entries gracefully', () => {
      const result = calculateRunOrderScoped(aEntries, 'armband-asc', 'B', 'renumber');
      // No B entries; all A entries form the "other" group
      expect(result).toHaveLength(aEntries.length);
    });

    it('does not mutate the input array', () => {
      const copy = mixed.map(e => ({ ...e }));
      calculateRunOrderScoped(mixed, 'armband-asc', 'A', 'renumber');
      expect(mixed.map(e => e.id)).toEqual(copy.map(e => e.id));
    });
  });
});
