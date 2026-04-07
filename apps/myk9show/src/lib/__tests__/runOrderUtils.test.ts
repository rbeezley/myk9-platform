import { describe, it, expect, vi } from 'vitest';
import { calculateRunOrder } from '../runOrderUtils';

const entries = [
  { id: 'e1', armband: '3' },
  { id: 'e2', armband: '1' },
  { id: 'e3', armband: '2' },
];

describe('calculateRunOrder', () => {
  describe('armband-asc', () => {
    it('sorts entries by armband ascending', () => {
      const result = calculateRunOrder(entries, 'armband-asc');
      expect(result.map(r => r.id)).toEqual(['e2', 'e3', 'e1']);
    });

    it('assigns 1-based run orders with no gaps', () => {
      const result = calculateRunOrder(entries, 'armband-asc');
      expect(result.map(r => r.runOrder)).toEqual([1, 2, 3]);
    });

    it('sorts null armband entries first (parsed as 0)', () => {
      const withNull = [
        { id: 'eX', armband: null },
        { id: 'e5', armband: '5' },
      ];
      const result = calculateRunOrder(withNull, 'armband-asc');
      expect(result[0].id).toBe('eX');
    });
  });

  describe('armband-desc', () => {
    it('sorts entries by armband descending', () => {
      const result = calculateRunOrder(entries, 'armband-desc');
      expect(result.map(r => r.id)).toEqual(['e1', 'e3', 'e2']);
    });

    it('assigns 1-based run orders with no gaps', () => {
      const result = calculateRunOrder(entries, 'armband-desc');
      expect(result.map(r => r.runOrder)).toEqual([1, 2, 3]);
    });

    it('sorts null armband entries last (parsed as 0, smallest value)', () => {
      const withNull = [
        { id: 'eX', armband: null },
        { id: 'e5', armband: '5' },
      ];
      const result = calculateRunOrder(withNull, 'armband-desc');
      expect(result[result.length - 1].id).toBe('eX');
    });
  });

  describe('random', () => {
    it('returns all entries', () => {
      const result = calculateRunOrder(entries, 'random');
      expect(result).toHaveLength(3);
      expect(result.map(r => r.id).sort()).toEqual(['e1', 'e2', 'e3']);
    });

    it('assigns 1-based run orders with no gaps', () => {
      const result = calculateRunOrder(entries, 'random');
      expect(result.map(r => r.runOrder).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    });

    it('shuffles order (seeded Math.random mock)', () => {
      let call = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => (call++ % 2 === 0 ? 0.9 : 0.1));
      const result = calculateRunOrder(entries, 'random');
      expect(result.map(r => r.id)).not.toEqual(['e1', 'e2', 'e3']);
      vi.restoreAllMocks();
    });
  });

  describe('manual', () => {
    it('returns empty array without touching entries', () => {
      expect(calculateRunOrder(entries, 'manual')).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty input', () => {
      expect(calculateRunOrder([], 'armband-asc')).toEqual([]);
    });

    it('returns single entry with runOrder 1', () => {
      const result = calculateRunOrder([{ id: 'e1', armband: '5' }], 'armband-asc');
      expect(result).toEqual([{ id: 'e1', runOrder: 1 }]);
    });

    it('does not mutate the input array', () => {
      const input = [
        { id: 'e1', armband: '3' },
        { id: 'e2', armband: '1' },
      ];
      const copy = [...input];
      calculateRunOrder(input, 'armband-asc');
      expect(input).toEqual(copy);
    });
  });
});
