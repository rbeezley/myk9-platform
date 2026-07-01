import { describe, expect, it } from 'vitest';
import { ClassDefinition } from '@/types/template.types';
import {
  compareClassesForGrid,
  formatJudgeName,
  groupClassesByElement,
} from './SimpleClassSelector.helpers';

describe('formatJudgeName', () => {
  it('removes the empty qualification suffix from judge names', () => {
    expect(formatJudgeName('Liz Beezley( - )')).toBe('Liz Beezley');
  });

  it('keeps normal judge names unchanged', () => {
    expect(formatJudgeName('Liz Beezley')).toBe('Liz Beezley');
  });
});

/** Build a minimal ClassDefinition for ordering tests. */
function def(
  partial: Pick<ClassDefinition, 'level' | 'displayOrder'> &
    Partial<Pick<ClassDefinition, 'element' | 'section'>>
): ClassDefinition {
  return {
    element: partial.element ?? 'Container',
    level: partial.level,
    section: partial.section,
    className: `${partial.element ?? 'Container'} ${partial.level ?? ''} ${partial.section ?? ''}`.trim(),
    displayOrder: partial.displayOrder,
  };
}

describe('compareClassesForGrid', () => {
  it('orders by displayOrder, not by level name', () => {
    // ASCA Container: Novice(1) → Open(2) → Advanced(3) → Excellent(4).
    // The old hardcoded ['Novice','Advanced','Excellent','Master'] array gave
    // Open an indexOf of -1, sorting it ABOVE Novice.
    const novice = def({ level: 'Novice', displayOrder: 1 });
    const open = def({ level: 'Open', displayOrder: 2 });
    const advanced = def({ level: 'Advanced', displayOrder: 3 });

    expect(compareClassesForGrid(novice, open)).toBeLessThan(0);
    expect(compareClassesForGrid(open, advanced)).toBeLessThan(0);
    // 'Open' must NOT sort before 'Novice'.
    expect(compareClassesForGrid(open, novice)).toBeGreaterThan(0);
  });

  it('uses section as a tiebreaker when displayOrder is equal', () => {
    const a = def({ level: 'Novice', section: 'A', displayOrder: 1 });
    const b = def({ level: 'Novice', section: 'B', displayOrder: 1 });
    expect(compareClassesForGrid(a, b)).toBeLessThan(0);
  });

  it('sorts nullish displayOrder last rather than first', () => {
    const ordered = def({ level: 'Novice', displayOrder: 1 });
    const missing = def({ level: 'Mystery', displayOrder: undefined as unknown as number });
    expect(compareClassesForGrid(ordered, missing)).toBeLessThan(0);
  });
});

describe('groupClassesByElement', () => {
  it('sorts an ASCA element (with Open + Level C) by displayOrder, not to the top', () => {
    // Deliberately shuffled input to prove sorting, not input order, decides output.
    const input: ClassDefinition[] = [
      def({ element: 'Interior', level: 'Advanced', displayOrder: 7 }),
      def({ element: 'Interior', level: 'Open', section: 'C', displayOrder: 22 }),
      def({ element: 'Interior', level: 'Open', displayOrder: 6 }),
      def({ element: 'Interior', level: 'Novice', displayOrder: 5 }),
      def({ element: 'Interior', level: 'Excellent', displayOrder: 8 }),
      def({ element: 'Interior', level: 'Novice', section: 'C', displayOrder: 21 }),
    ];

    const grouped = groupClassesByElement(input);

    expect(Object.keys(grouped)).toEqual(['Interior']);
    expect(grouped.Interior.map(c => `${c.level}${c.section ? ` ${c.section}` : ''}`)).toEqual([
      'Novice',
      'Open',
      'Advanced',
      'Excellent',
      'Novice C',
      'Open C',
    ]);
  });

  it('keeps UKC Superior and Elite in the ladder instead of at the top', () => {
    const input: ClassDefinition[] = [
      def({ element: 'Container', level: 'Elite', section: 'A', displayOrder: 9 }),
      def({ element: 'Container', level: 'Novice', section: 'A', displayOrder: 1 }),
      def({ element: 'Container', level: 'Superior', section: 'A', displayOrder: 5 }),
      def({ element: 'Container', level: 'Advanced', section: 'A', displayOrder: 3 }),
      def({ element: 'Container', level: 'Master', section: 'A', displayOrder: 7 }),
    ];

    const grouped = groupClassesByElement(input);

    expect(grouped.Container.map(c => c.level)).toEqual([
      'Novice',
      'Advanced',
      'Superior',
      'Master',
      'Elite',
    ]);
  });

  it('preserves the existing AKC order (regression guard)', () => {
    const input: ClassDefinition[] = [
      def({ element: 'Container', level: 'Master', displayOrder: 5 }),
      def({ element: 'Container', level: 'Novice', section: 'A', displayOrder: 1 }),
      def({ element: 'Container', level: 'Novice', section: 'B', displayOrder: 2 }),
      def({ element: 'Container', level: 'Excellent', displayOrder: 4 }),
      def({ element: 'Container', level: 'Advanced', displayOrder: 3 }),
    ];

    const grouped = groupClassesByElement(input);

    expect(grouped.Container.map(c => `${c.level}${c.section ? ` ${c.section}` : ''}`)).toEqual([
      'Novice A',
      'Novice B',
      'Advanced',
      'Excellent',
      'Master',
    ]);
  });
});
