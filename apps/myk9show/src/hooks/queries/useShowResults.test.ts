import { filterResults, getFilterOptions, type ClassResult } from './useShowResults';

const mockResults: ClassResult[] = [
  {
    classId: '1',
    className: 'Container Novice A',
    element: 'Container',
    level: 'Novice A',
    section: null,
    trialId: 't1',
    placements: [
      { placement: 1, handlerName: 'Alice', dogName: 'Rex', breed: 'Lab', armband: '101' },
      { placement: 2, handlerName: 'Bob', dogName: 'Max', breed: 'GSD', armband: '102' },
    ],
  },
  {
    classId: '2',
    className: 'Interior Advanced',
    element: 'Interior',
    level: 'Advanced',
    section: null,
    trialId: 't1',
    placements: [
      { placement: 1, handlerName: 'Carol', dogName: 'Bella', breed: 'Beagle', armband: '103' },
    ],
  },
  {
    classId: '3',
    className: 'Container Advanced',
    element: 'Container',
    level: 'Advanced',
    section: null,
    trialId: 't2',
    placements: [],
  },
];

describe('filterResults', () => {
  it('returns all results with no filters', () => {
    const result = filterResults(mockResults, { element: null, level: null });
    expect(result).toHaveLength(3);
  });

  it('filters by element', () => {
    const result = filterResults(mockResults, { element: 'Container', level: null });
    expect(result).toHaveLength(2);
    expect(result.every(r => r.element === 'Container')).toBe(true);
  });

  it('filters by level', () => {
    const result = filterResults(mockResults, { element: null, level: 'Advanced' });
    expect(result).toHaveLength(2);
    expect(result.every(r => r.level === 'Advanced')).toBe(true);
  });

  it('filters by both element and level', () => {
    const result = filterResults(mockResults, { element: 'Container', level: 'Advanced' });
    expect(result).toHaveLength(1);
    expect(result[0].classId).toBe('3');
  });

  it('returns empty when no match', () => {
    const result = filterResults(mockResults, { element: 'Exterior', level: null });
    expect(result).toHaveLength(0);
  });
});

describe('getFilterOptions', () => {
  it('extracts unique sorted elements', () => {
    const { elements } = getFilterOptions(mockResults);
    expect(elements).toEqual(['Container', 'Interior']);
  });

  it('extracts unique sorted levels', () => {
    const { levels } = getFilterOptions(mockResults);
    expect(levels).toEqual(['Advanced', 'Novice A']);
  });

  it('handles empty results', () => {
    const { elements, levels } = getFilterOptions([]);
    expect(elements).toEqual([]);
    expect(levels).toEqual([]);
  });
});
