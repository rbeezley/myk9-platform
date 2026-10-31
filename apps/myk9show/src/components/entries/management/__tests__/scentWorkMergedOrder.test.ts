import { describe, expect, it } from 'vitest';
import { listRegistries } from '@/features/registries';
import { getScentWorkSport } from '@/features/registries/scentWork';
import { elementRank, levelRank, mergeOrderedLists } from '../scentWorkMergedOrder';

describe('merged scent-work element and level rank', () => {
  for (const id of listRegistries()) {
    it(`agrees with ${id}'s own element and level order for every pair`, () => {
      const sport = getScentWorkSport(id);
      const elements = sport.elements.map(element => element.label);
      const levels = [...sport.levels].sort((a, b) => a.order - b.order).map(level => level.label);
      for (const [labels, rank] of [
        [elements, elementRank],
        [levels, levelRank],
      ] as const) {
        for (let i = 0; i < labels.length; i += 1) {
          for (let j = i + 1; j < labels.length; j += 1) {
            const earlier = rank(labels[i]);
            const later = rank(labels[j]);
            expect(earlier, `${id} ${labels[i]}`).not.toBeNull();
            expect(later, `${id} ${labels[j]}`).not.toBeNull();
            expect(earlier!, `${id}: ${labels[i]} before ${labels[j]}`).toBeLessThan(later!);
          }
        }
      }
    });
  }

  it('knows the UKC and ASCA labels the AKC-only list lacked', () => {
    expect(elementRank('Vehicle')).not.toBeNull();
    expect(levelRank('Superior')).toBeLessThan(levelRank('Master')!);
    expect(levelRank('Master')).toBeLessThan(levelRank('Elite')!);
  });

  it('throws when two lists order a pair differently', () => {
    expect(() =>
      mergeOrderedLists([
        ['a', 'b'],
        ['b', 'a'],
      ])
    ).toThrow();
  });
});
