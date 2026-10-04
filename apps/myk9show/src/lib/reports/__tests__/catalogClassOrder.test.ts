import { describe, expect, it } from 'vitest';
import { sortClassesForAkcCatalog } from '../catalogClassOrder';

function cls(
  id: string,
  element: string,
  level: string,
  section: string | null = null,
  trialId = 't1'
) {
  return { id, trialId, element, level, section };
}

const trials = [
  { id: 't1', date: '2026-11-07', trialNumber: '1' },
  { id: 't2', date: '2026-11-08', trialNumber: '2' },
];

describe('sortClassesForAkcCatalog (AKC Ch.3 §37)', () => {
  it('lists every Container class, then Interior, Exterior, Buried, Handler Discrimination, then Detective', () => {
    // Given in run order, which interleaves elements.
    const runOrder = [
      cls('det', 'Detective', 'Detective'),
      cls('buried-n', 'Buried', 'Novice', 'A'),
      cls('cont-m', 'Container', 'Master'),
      cls('hd-adv', 'Handler Discrimination', 'Advanced'),
      cls('ext-n', 'Exterior', 'Novice', 'A'),
      cls('int-n', 'Interior', 'Novice', 'A'),
      cls('cont-n', 'Container', 'Novice', 'A'),
    ];
    expect(sortClassesForAkcCatalog(runOrder, trials).map(c => c.id)).toEqual([
      'cont-n',
      'cont-m',
      'int-n',
      'ext-n',
      'buried-n',
      'hd-adv',
      'det',
    ]);
  });

  it('orders levels Novice A, Novice B, Advanced, Excellent, Master within an element', () => {
    const shuffled = [
      cls('master', 'Container', 'Master'),
      cls('exc', 'Container', 'Excellent'),
      cls('novb', 'Container', 'Novice', 'B'),
      cls('adv', 'Container', 'Advanced'),
      cls('nova', 'Container', 'Novice', 'A'),
    ];
    expect(sortClassesForAkcCatalog(shuffled, trials).map(c => c.id)).toEqual([
      'nova',
      'novb',
      'adv',
      'exc',
      'master',
    ]);
  });

  it('keeps trials in date then trial-number order, each in §37 order', () => {
    const classes = [
      cls('t2-cont', 'Container', 'Novice', 'A', 't2'),
      cls('t1-buried', 'Buried', 'Novice', 'A', 't1'),
      cls('t1-cont', 'Container', 'Novice', 'A', 't1'),
    ];
    expect(sortClassesForAkcCatalog(classes, trials).map(c => c.id)).toEqual([
      't1-cont',
      't1-buried',
      't2-cont',
    ]);
  });

  it('sorts unknown elements last and keeps ties in their input order', () => {
    const classes = [
      cls('weird-b', 'Mystery', 'Novice'),
      cls('weird-a', 'Mystery', 'Novice'),
      cls('cont', 'Container', 'Novice', 'A'),
    ];
    expect(sortClassesForAkcCatalog(classes, trials).map(c => c.id)).toEqual([
      'cont',
      'weird-b',
      'weird-a',
    ]);
  });
});
